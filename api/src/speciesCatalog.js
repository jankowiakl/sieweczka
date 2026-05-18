const cheerio = require('cheerio');

const SOURCE = 'Komisja Faunistyczna PTZool';
const SOURCE_URL = 'https://komisjafaunistyczna.pl/lista/';
const PARSER_VERSION = 'kf-html-table-header-parser-v3';
const MIN_SPECIES_COUNT = 100;
const KENTISH_ID = 'kf-charadrius-alexandrinus';

const STATUS_TOKEN_RE = /^(?:[ABC](?:\([lz]\))?|[LPZlz])$/;

function normalizeSearchText(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
}

function slugify(text) {
  return normalizeSearchText(text).replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
}

function makeCode(latinName, polishName) {
  if (latinName === 'Charadrius alexandrinus') return 'CHAALE';
  const source = latinName || polishName || '';
  const words = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) return `${words[0].slice(0, 3)}${words[1].slice(0, 3)}`.toUpperCase();
  return words.join('').slice(0, 6).toUpperCase();
}

function stableId(item) {
  if (item.latinName) return `kf-${slugify(item.latinName)}`;
  if (item.code) return `kf-code-${slugify(item.code)}`;
  return `kf-polish-${slugify(item.polishName)}`;
}

function isStatusToken(token) {
  return STATUS_TOKEN_RE.test(String(token || '').trim());
}

function normalizeLine(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCellText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value) {
  return normalizeSearchText(normalizeCellText(value));
}

function extractTables($) {
  return $('table').toArray();
}

function getTableRows($, table) {
  return $(table).find('tr').toArray().map((tr) => $(tr).find('th,td').toArray().map((cell) => normalizeCellText($(cell).text()))).filter((cells) => cells.some(Boolean));
}

function findHeaderRow(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const headers = rows[i].map(normalizeHeader);
    const hasScientific = headers.some((header) => header.includes('nazwa naukowa'));
    const hasPolish = headers.some((header) => header.includes('nazwa polska'));
    if (hasScientific && hasPolish) return { index: i, headers };
  }
  return null;
}

function findColumnIndex(headers, variants) {
  return headers.findIndex((header) => variants.some((variant) => header.includes(variant)));
}

function isValidLatinName(latinName) {
  return /^[A-Z][A-Za-z-]+\s+[a-z][a-z-]+(?:\s+forma\s+[a-z][a-z-]+)?$/.test(String(latinName || '').trim());
}

function isNumericOnly(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function isInvalidPolishName(polishName, latinName, lp) {
  const value = String(polishName || '').trim();
  if (!value) return true;
  if (isNumericOnly(value)) return true;
  if (lp && value === String(lp).trim()) return true;
  if (latinName && normalizeSearchText(value) === normalizeSearchText(latinName)) return true;
  if (isValidLatinName(value)) return true;
  if (/wymaga poprawy/i.test(value)) return true;
  if (/needs review/i.test(value)) return true;
  return false;
}

function parseSpeciesLine(line) {
  return null;
}

function validateParsedSpecies(species) {
  if (!Array.isArray(species)) throw new Error('Parser listy Komisji nie zwrócił tablicy gatunków.');
  if (species.length < MIN_SPECIES_COUNT) throw new Error(`Parser znalazł tylko ${species.length} pozycji; katalog nie został nadpisany.`);
  const invalid = species.filter((item) => isInvalidPolishName(item.polishName, item.latinName, item.sourcePayload?.lp));
  if (invalid.length) throw new Error(`Parser listy Komisji zwrócił ${invalid.length} gatunków bez poprawnej polskiej nazwy. Przykład: ${invalid[0].latinName || invalid[0].id}`);
  const numericPolishNames = species.filter((item) => isNumericOnly(item.polishName));
  if (numericPolishNames.length) throw new Error(`Parser błędnie zapisał numery jako polskie nazwy. Przykład: ${numericPolishNames[0].latinName} -> ${numericPolishNames[0].polishName}`);
}

function parseSpeciesFromHtml(html, { validateMinimum = true } = {}) {
  const $ = cheerio.load(String(html || ''));
  const tables = extractTables($);
  const parsed = [];
  let selected = null;

  for (const table of tables) {
    const rows = getTableRows($, table);
    const header = findHeaderRow(rows);
    if (!header) continue;

    const lpIndex = findColumnIndex(header.headers, ['lp', 'l p']);
    const latinIndex = findColumnIndex(header.headers, ['nazwa naukowa']);
    const polishIndex = findColumnIndex(header.headers, ['nazwa polska']);
    const categoryIndex = findColumnIndex(header.headers, ['kategoria']);
    const statusIndex = findColumnIndex(header.headers, ['status']);

    if (latinIndex >= 0 && polishIndex >= 0) {
      selected = { rows, headerIndex: header.index, lpIndex, latinIndex, polishIndex, categoryIndex, statusIndex };
      break;
    }
  }

  if (!selected) throw new Error("Nie znaleziono tabeli Komisji z kolumnami 'nazwa naukowa' i 'nazwa polska'.");

  for (const cells of selected.rows.slice(selected.headerIndex + 1)) {
    const lp = selected.lpIndex >= 0 ? normalizeCellText(cells[selected.lpIndex]) : '';
    const latinName = normalizeCellText(cells[selected.latinIndex]);
    const polishName = normalizeCellText(cells[selected.polishIndex]);
    const category = selected.categoryIndex >= 0 ? normalizeCellText(cells[selected.categoryIndex]) : '';
    const status = selected.statusIndex >= 0 ? normalizeCellText(cells[selected.statusIndex]) : '';

    if (!latinName && !polishName) continue;
    if (!isValidLatinName(latinName)) continue;

    if (isInvalidPolishName(polishName, latinName, lp)) {
      throw new Error(`Błędna polska nazwa w tabeli Komisji: lp=${lp}, latinName=${latinName}, polishName=${polishName}`);
    }

    const item = { id: stableId({ latinName, polishName }), code: makeCode(latinName, polishName), polishName, latinName, englishName: '', category, status, aliases: [], legacyValues: [], needsReview: false };
    item.sourcePayload = { lp, category, status, parser: PARSER_VERSION };
    parsed.push(item);
  }

  const unique = new Map();
  for (const item of parsed) {
    const key = item.id || `${item.latinName}|${item.polishName}`.toLowerCase();
    if (!unique.has(key)) unique.set(key, item);
  }
  const species = ensureKentishLegacy([...unique.values()]).sort((a, b) => (a.polishName || a.latinName).localeCompare(b.polishName || b.latinName, 'pl'));
  if (validateMinimum) validateParsedSpecies(species);
  return species;
}


function ensureKentishLegacy(species) {
  const list = Array.isArray(species) ? species : [];
  let kentish = list.find((item) => item.id === KENTISH_ID
    || item.latinName === 'Charadrius alexandrinus'
    || item.latinName === 'Anarhynchus alexandrinus'
    || normalizeSearchText(item.polishName) === 'sieweczka morska'
    || item.legacyValues?.includes('custom:sieweczka-morska'));
  if (!kentish) {
    kentish = { id: KENTISH_ID, code: 'CHAALE', polishName: 'Sieweczka morska', englishName: 'Kentish Plover', latinName: 'Charadrius alexandrinus', status: '', aliases: [], legacyValues: [], sourcePayload: { seed: true } };
    list.push(kentish);
  }
  kentish.id = KENTISH_ID;
  kentish.code = kentish.code || 'CHAALE';
  kentish.polishName = kentish.polishName || 'sieweczka morska';
  kentish.englishName = kentish.englishName || 'Kentish Plover';
  kentish.latinName = 'Anarhynchus alexandrinus';
  kentish.aliases = mergeUnique(kentish.aliases || [], ['Charadrius alexandrinus', 'Anarhynchus alexandrinus']);
  kentish.legacyValues = Array.from(new Set([...(kentish.legacyValues || []), 'custom:sieweczka-morska', 'sieweczka-morska', 'Sieweczka morska']));
  return list;
}

function rowToApi(row) {
  const sourcePayload = row.source_payload && typeof row.source_payload === 'object' ? row.source_payload : {};
  return {
    id: row.id,
    code: row.code || '',
    polishName: row.polish_name || '',
    englishName: row.english_name || '',
    latinName: row.latin_name || '',
    status: row.status || '',
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    legacyValues: Array.isArray(row.legacy_values) ? row.legacy_values : [],
    source: row.source || SOURCE,
    sourceUrl: row.source_url || SOURCE_URL,
    isActive: !!row.is_active,
    needsReview: !!row.needs_review,
    updatedAt: row.updated_at,
    sourcePayload,
    category: sourcePayload.category || '',
    lp: sourcePayload.lp || ''
  };
}

function mergeUnique(...arrays) {
  return Array.from(new Set(arrays.flat().map((value) => String(value || '').trim()).filter(Boolean)));
}

async function refreshSpeciesCatalog(db, user) {
  await db.query(`INSERT INTO species_catalog_meta (id,last_fetch_attempt_at,parser_version,updated_by,updated_at) VALUES ('kf',now(),$1,$2,now()) ON CONFLICT (id) DO UPDATE SET last_fetch_attempt_at=now(), parser_version=$1, updated_by=$2, updated_at=now()`, [PARSER_VERSION, user?.id || null]);
  let html;
  try {
    const response = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'sieweczka-species-catalog/1.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    html = await response.text();
  } catch (error) {
    await db.query(`UPDATE species_catalog_meta SET last_error=$1, updated_by=$2, updated_at=now() WHERE id='kf'`, [error.message, user?.id || null]);
    throw error;
  }
  const parsed = parseSpeciesFromHtml(html);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const currentRows = (await client.query('SELECT * FROM species_catalog')).rows;
    const byId = new Map(currentRows.map((row) => [row.id, row]));
    const byCode = new Map(currentRows.filter((row) => row.code).map((row) => [normalizeSearchText(row.code), row]));
    const byLatin = new Map(currentRows.filter((row) => row.latin_name).map((row) => [normalizeSearchText(row.latin_name), row]));
    let added = 0, updated = 0, needsReview = 0;
    const changes = [];
    const seen = new Set();
    for (const item of parsed) {
      const match = byId.get(item.id) || byCode.get(normalizeSearchText(item.code)) || byLatin.get(normalizeSearchText(item.latinName));
      const id = match?.id || item.id;
      seen.add(id);
      const isMatchNumericName = isNumericOnly(match?.polish_name || '');
      const aliases = mergeUnique(match?.aliases || [], match && match.polish_name !== item.polishName && !isMatchNumericName && !/wymaga poprawy/i.test(match.polish_name || '') ? [match.polish_name] : [], item.aliases || []).filter((value) => !isNumericOnly(value) && !/wymaga poprawy/i.test(value));
      const legacyValues = mergeUnique(match?.legacy_values || [], item.legacyValues || []);
      let review = !!(match?.needs_review || item.needsReview);
      if (match && match.polish_name && item.polishName && match.polish_name !== item.polishName) {
        if (isMatchNumericName) {
          changes.push({ type: 'parserCorrection', id, field: 'polishName', oldValue: match.polish_name, newValue: item.polishName });
          review = false;
        } else {
          changes.push({ type: 'polishNameChanged', id, oldValue: match.polish_name, newValue: item.polishName });
        }
      }
      if (match && ((match.latin_name && item.latinName && match.latin_name !== item.latinName) || (match.code && item.code && match.code !== item.code))) {
        review = true;
        changes.push({ type: 'taxonomyReviewNeeded', id, oldLatinName: match.latin_name, newLatinName: item.latinName, oldCode: match.code, newCode: item.code });
      }
      if (review) needsReview += 1;
      await client.query(`INSERT INTO species_catalog (id,code,polish_name,latin_name,english_name,status,aliases,legacy_values,source,source_url,source_payload,is_active,needs_review,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,now())
        ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code, polish_name=EXCLUDED.polish_name, latin_name=EXCLUDED.latin_name, english_name=EXCLUDED.english_name, status=EXCLUDED.status, aliases=EXCLUDED.aliases, legacy_values=EXCLUDED.legacy_values, source=EXCLUDED.source, source_url=EXCLUDED.source_url, source_payload=EXCLUDED.source_payload, is_active=true, needs_review=EXCLUDED.needs_review, updated_at=now()`,
        [id, item.code || null, item.polishName || item.latinName, item.latinName || null, item.englishName || null, item.status || '', JSON.stringify(aliases), JSON.stringify(legacyValues), SOURCE, SOURCE_URL, JSON.stringify(item.sourcePayload || {}), review]);
      if (match) updated += 1; else added += 1;
    }
    let deactivated = 0;
    for (const row of currentRows) {
      if (seen.has(row.id) || row.id === KENTISH_ID || row.is_active === false) continue;
      await client.query('UPDATE species_catalog SET is_active=false, needs_review=true, updated_at=now() WHERE id=$1', [row.id]);
      deactivated += 1;
      changes.push({ type: 'taxonomyReviewNeeded', id: row.id, oldValue: row.polish_name, newValue: null });
    }
    const invalidRowsQuery = await client.query(`SELECT id, polish_name, latin_name
      FROM species_catalog
      WHERE is_active = true
        AND (
          polish_name IS NULL
          OR btrim(polish_name) = ''
          OR polish_name ~ '^[0-9]+$'
          OR polish_name ~* 'wymaga poprawy'
        )`);
    if (invalidRowsQuery.rows.length) {
      throw new Error('Refresh zakończony walidacją negatywną: w katalogu nadal są aktywne gatunki bez poprawnej polskiej nazwy.');
    }
    await client.query(`UPDATE species_catalog_meta SET last_successful_fetch_at=now(), species_count=$1, parser_version=$2, changes=$3, last_error=NULL, updated_by=$4, updated_at=now() WHERE id='kf'`, [parsed.length, PARSER_VERSION, JSON.stringify(changes.slice(-100)), user?.id || null]);
    await client.query('COMMIT');
    return { ok: true, speciesCount: parsed.length, added, updated, deactivated, needsReview, changes };
  } catch (error) {
    await client.query('ROLLBACK');
    await db.query(`UPDATE species_catalog_meta SET last_error=$1, updated_by=$2, updated_at=now() WHERE id='kf'`, [error.message, user?.id || null]);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { SOURCE, SOURCE_URL, PARSER_VERSION, rowToApi, refreshSpeciesCatalog, parseSpeciesFromHtml, parseSpeciesLine, isInvalidPolishName, ensureKentishLegacy };
