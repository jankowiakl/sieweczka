const SOURCE = 'Komisja Faunistyczna PTZool';
const SOURCE_URL = 'https://komisjafaunistyczna.pl/lista/';
const PARSER_VERSION = 'server-kf-table-parser-v1';
const MIN_SPECIES_COUNT = 100;
const KENTISH_ID = 'kf-charadrius-alexandrinus';

function stripTags(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function extractItalicText(html) {
  return [...String(html || '').matchAll(/<(?:i|em)\b[^>]*>([\s\S]*?)<\/(?:i|em)>/gi)].map((match) => stripTags(match[1])).filter(Boolean);
}

function parseSpeciesFromHtml(html) {
  const rows = [...String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const parsed = [];
  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1];
    const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => ({ html: match[1], text: stripTags(match[1]) })).filter((cell) => cell.text);
    if (cells.length < 2) continue;
    const latinName = extractItalicText(rowHtml).find((name) => /^[A-Z][a-z]+\s+[a-z-]+/.test(name)) || '';
    const joined = cells.map((cell) => cell.text).join(' | ');
    if (!latinName && !/[A-Z][a-z]+\s+[a-z-]+/.test(joined)) continue;
    const polishCell = cells.find((cell) => cell.text !== latinName && /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(cell.text))
      || cells.find((cell) => cell.text !== latinName && !/^[A-Z][a-z]+\s+[a-z-]+/.test(cell.text));
    const polishName = polishCell?.text || '';
    if (!polishName && !latinName) continue;
    const status = cells.map((cell) => cell.text).filter((text) => text !== polishName && text !== latinName).slice(-1)[0] || '';
    const item = { polishName, latinName, englishName: '', status, aliases: [], legacyValues: [], code: makeCode(latinName, polishName) };
    item.id = stableId(item);
    item.sourcePayload = { rowText: joined };
    parsed.push(item);
  }
  const unique = new Map();
  for (const item of parsed) {
    const key = item.id || `${normalizeSearchText(item.polishName)}|${normalizeSearchText(item.latinName)}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return ensureKentishLegacy([...unique.values()]).sort((a, b) => (a.polishName || a.latinName).localeCompare(b.polishName || b.latinName, 'pl'));
}

function ensureKentishLegacy(species) {
  const list = Array.isArray(species) ? species : [];
  let kentish = list.find((item) => item.id === KENTISH_ID || item.latinName === 'Charadrius alexandrinus' || normalizeSearchText(item.polishName) === 'sieweczka morska' || item.legacyValues?.includes('custom:sieweczka-morska'));
  if (!kentish) {
    kentish = { id: KENTISH_ID, code: 'CHAALE', polishName: 'Sieweczka morska', englishName: 'Kentish Plover', latinName: 'Charadrius alexandrinus', status: '', aliases: [], legacyValues: [], sourcePayload: { seed: true } };
    list.push(kentish);
  }
  kentish.id = KENTISH_ID;
  kentish.code = kentish.code || 'CHAALE';
  kentish.polishName = kentish.polishName || 'Sieweczka morska';
  kentish.englishName = kentish.englishName || 'Kentish Plover';
  kentish.latinName = kentish.latinName || 'Charadrius alexandrinus';
  kentish.aliases = Array.isArray(kentish.aliases) ? kentish.aliases : [];
  kentish.legacyValues = Array.from(new Set([...(kentish.legacyValues || []), 'custom:sieweczka-morska', 'sieweczka-morska', 'Sieweczka morska']));
  return list;
}

function rowToApi(row) {
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
    updatedAt: row.updated_at
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
  if (parsed.length < MIN_SPECIES_COUNT) {
    const message = `Parser znalazł tylko ${parsed.length} pozycji; katalog nie został nadpisany.`;
    await db.query(`UPDATE species_catalog_meta SET last_error=$1, updated_by=$2, updated_at=now() WHERE id='kf'`, [message, user?.id || null]);
    const error = new Error(message); error.status = 422; throw error;
  }

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
      const aliases = mergeUnique(match?.aliases || [], match && match.polish_name !== item.polishName ? [match.polish_name] : [], item.aliases || []);
      const legacyValues = mergeUnique(match?.legacy_values || [], item.legacyValues || []);
      let review = !!match?.needs_review;
      if (match && match.polish_name && item.polishName && match.polish_name !== item.polishName) changes.push({ type: 'polishNameChanged', id, oldValue: match.polish_name, newValue: item.polishName });
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

module.exports = { SOURCE, SOURCE_URL, PARSER_VERSION, rowToApi, refreshSpeciesCatalog };
