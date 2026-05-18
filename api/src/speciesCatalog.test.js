const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSpeciesFromHtml, parseSpeciesLine } = require('./speciesCatalog');

const html = `
<table>
<tr><th>lp.</th><th>nazwa naukowa</th><th>nazwa polska</th><th>kategoria</th><th>status</th></tr>
<tr><td>95</td><td><i>Vanellus vanellus</i></td><td>czajka</td><td>A</td><td>L</td></tr>
<tr><td>96</td><td><i>Vanellus spinosus</i></td><td>czajka szponiasta</td><td>A</td><td>z</td></tr>
<tr><td>97</td><td><i>Vanellus gregarius</i></td><td>czajka towarzyska</td><td>A</td><td>Z</td></tr>
<tr><td>98</td><td><i>Vanellus leucurus</i></td><td>czajka stepowa</td><td>A</td><td>Z</td></tr>
<tr><td>102</td><td><i>Anarhynchus alexandrinus</i></td><td>sieweczka morska</td><td>A l</td><td>Z</td></tr>
</table>`;

test('parser linii tekstowych poprawnie czyta wymagane rekordy', () => {
  const lines = [
    '95 Vanellus vanellus czajka A L',
    '96 Vanellus spinosus czajka szponiasta A z',
    '97 Vanellus gregarius czajka towarzyska A Z',
    '98 Vanellus leucurus czajka stepowa A Z',
    '102 Anarhynchus alexandrinus sieweczka morska A l Z',
    '127 Calidris canutus biegus rdzawy A P',
    '128 Calidris tenuirostris biegus wielki A z',
    '152 Alca torda alka A P',
    '195 Fulmarus glacialis fulmar A Z',
    '72 Columba livia forma urbana gołąb miejski C L',
    '50 Lagopus lagopus pardwa mszarna B(z)',
    '422 Petronia petronia wróbel skalny B(z)',
    '428 Motacilla citreola pliszka cytrynowa A L P',
    '374 Tichodroma muraria pomurnik A l',
    '503 Passerculus sandwichensis bagiennik żółtobrewy A z'
  ];
  const species = lines.map((line) => parseSpeciesLine(line)).filter(Boolean);
  const byLatin = new Map(species.map((item) => [item.latinName, item]));

  assert.equal(byLatin.get('Vanellus vanellus').polishName, 'czajka');
  assert.equal(byLatin.get('Vanellus spinosus').polishName, 'czajka szponiasta');
  assert.equal(byLatin.get('Vanellus gregarius').polishName, 'czajka towarzyska');
  assert.equal(byLatin.get('Vanellus leucurus').polishName, 'czajka stepowa');
  assert.equal(byLatin.get('Anarhynchus alexandrinus').polishName, 'sieweczka morska');
  assert.equal(byLatin.get('Calidris canutus').polishName, 'biegus rdzawy');
  assert.equal(byLatin.get('Columba livia forma urbana').polishName, 'gołąb miejski');

  for (const item of species) {
    assert.ok(!/^\d+$/.test(String(item.polishName || '').trim()), `numeric polishName detected for ${item.latinName}`);
    assert.ok(!/wymaga poprawy/i.test(String(item.polishName || '').trim()), `placeholder polishName detected for ${item.latinName}`);
  }
});

test('parser html działa po liniach i zbiera status z końca', () => {
  const species = parseSpeciesFromHtml(html, { validateMinimum: false });
  const vanellus = species.find((item) => item.latinName === 'Vanellus gregarius');
  assert.equal(vanellus?.polishName, 'czajka towarzyska');
  assert.equal(vanellus?.status, 'A Z');
});
