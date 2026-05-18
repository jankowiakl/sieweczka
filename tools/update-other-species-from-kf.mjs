#!/usr/bin/env node
import fs from 'node:fs/promises';

const SOURCE_URL = 'https://komisjafaunistyczna.pl/lista/';
const OUTPUT_PATH = new URL('../data/other_species.json', import.meta.url);

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

function makeCode(latinName, polishName) {
  const source = latinName || polishName || '';
  const words = source
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0].slice(0, 3)}${words[1].slice(0, 3)}`.toUpperCase();
  return words.join('').slice(0, 6).toUpperCase();
}

function extractItalicText(html) {
  return [...html.matchAll(/<(?:i|em)\b[^>]*>([\s\S]*?)<\/(?:i|em)>/gi)]
    .map((match) => stripTags(match[1]))
    .filter(Boolean);
}

function parseSpeciesFromHtml(html) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const species = [];
  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1];
    const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => ({
      html: match[1],
      text: stripTags(match[1])
    })).filter((cell) => cell.text);
    if (cells.length < 2) continue;

    const latinCandidates = extractItalicText(rowHtml);
    const latinName = latinCandidates.find((name) => /^[A-Z][a-z]+\s+[a-z-]+/.test(name)) || '';
    const joined = cells.map((cell) => cell.text).join(' | ');
    if (!latinName && !/[A-Z][a-z]+\s+[a-z-]+/.test(joined)) continue;

    const likelyPolishCell = cells.find((cell) => cell.text && cell.text !== latinName && /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(cell.text))
      || cells.find((cell) => cell.text && cell.text !== latinName && !/^[A-Z][a-z]+\s+[a-z-]+/.test(cell.text));
    const polishName = likelyPolishCell?.text || '';
    const status = cells.map((cell) => cell.text).filter((text) => text !== polishName && text !== latinName).slice(-1)[0] || '';

    if (!polishName && !latinName) continue;
    species.push({
      code: makeCode(latinName, polishName),
      polishName,
      englishName: '',
      latinName,
      status,
      legacyValues: []
    });
  }

  const unique = new Map();
  for (const item of species) {
    const key = `${item.polishName}|${item.latinName}`.toLowerCase();
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => (a.polishName || a.latinName).localeCompare(b.polishName || b.latinName, 'pl'));
}

function ensureLegacyMappings(species) {
  const kentish = species.find((item) =>
    item.latinName === 'Charadrius alexandrinus'
    || item.polishName?.toLowerCase() === 'sieweczka morska'
    || item.legacyValues?.includes('custom:sieweczka-morska')
  );
  if (kentish) {
    kentish.polishName = kentish.polishName || 'Sieweczka morska';
    kentish.englishName = kentish.englishName || 'Kentish Plover';
    kentish.latinName = kentish.latinName || 'Charadrius alexandrinus';
    kentish.code = kentish.code || 'CHAALE';
    kentish.legacyValues = Array.from(new Set([...(kentish.legacyValues || []), 'custom:sieweczka-morska', 'sieweczka-morska', 'Sieweczka morska']));
    delete kentish.needsSourceVerification;
  } else {
    species.push({
      code: 'CHAALE',
      polishName: 'Sieweczka morska',
      englishName: 'Kentish Plover',
      latinName: 'Charadrius alexandrinus',
      status: '',
      legacyValues: ['custom:sieweczka-morska', 'sieweczka-morska', 'Sieweczka morska'],
      needsSourceVerification: true
    });
  }
  return species.sort((a, b) => (a.polishName || a.latinName).localeCompare(b.polishName || b.latinName, 'pl'));
}

async function main() {
  const fetchedAt = new Date().toISOString();
  let html = '';
  try {
    const response = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'sieweczka-species-updater/1.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    html = await response.text();
  } catch (error) {
    throw new Error(`Nie udało się pobrać listy Komisji Faunistycznej z ${SOURCE_URL}: ${error.message}`);
  }

  const species = ensureLegacyMappings(parseSpeciesFromHtml(html));
  if (species.length < 100) {
    throw new Error(`Parser znalazł tylko ${species.length} pozycji. Struktura strony prawdopodobnie się zmieniła; nie nadpisuję pliku.`);
  }

  const data = {
    schemaVersion: 1,
    source: {
      primaryName: 'Komisja Faunistyczna PTZool — lista awifauny krajowej',
      primaryUrl: SOURCE_URL,
      lastFetchedAt: fetchedAt,
      lastSuccessfulFetchAt: fetchedAt,
      updateMethod: 'tools/update-other-species-from-kf.mjs',
      notes: [
        'Lista wygenerowana automatycznie z oficjalnej strony Komisji Faunistycznej.',
        'Po zmianach struktury strony parser może wymagać aktualizacji.'
      ]
    },
    species
  };
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Zapisano ${species.length} gatunków do ${OUTPUT_PATH.pathname}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
