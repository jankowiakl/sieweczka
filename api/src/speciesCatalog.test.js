const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSpeciesFromHtml } = require('./speciesCatalog');

const html = `
<table>
<tr><th>lp.</th><th>nazwa naukowa</th><th>nazwa polska</th><th>kategoria</th><th>status</th></tr>
<tr><td>95</td><td><i>Vanellus vanellus</i></td><td>czajka</td><td>A</td><td>L</td></tr>
<tr><td>96</td><td><i>Vanellus spinosus</i></td><td>czajka szponiasta</td><td>A</td><td>z</td></tr>
<tr><td>97</td><td><i>Vanellus gregarius</i></td><td>czajka towarzyska</td><td>A</td><td>Z</td></tr>
<tr><td>98</td><td><i>Vanellus leucurus</i></td><td>czajka stepowa</td><td>A</td><td>Z</td></tr>
<tr><td>102</td><td><i>Anarhynchus alexandrinus</i></td><td>sieweczka morska</td><td>A l</td><td>Z</td></tr>
</table>`;

test('parser bierze nazwy po kolumnach i nie wpuszcza numerow jako polishName', () => {
  const species = parseSpeciesFromHtml(html);
  const byLatin = new Map(species.map((item) => [item.latinName, item]));

  assert.equal(byLatin.get('Vanellus vanellus').polishName, 'czajka');
  assert.equal(byLatin.get('Vanellus spinosus').polishName, 'czajka szponiasta');
  assert.equal(byLatin.get('Vanellus gregarius').polishName, 'czajka towarzyska');
  assert.equal(byLatin.get('Vanellus leucurus').polishName, 'czajka stepowa');
  assert.equal(byLatin.get('Anarhynchus alexandrinus').polishName, 'sieweczka morska');

  for (const item of species) {
    assert.ok(!/^\d+$/.test(String(item.polishName || '').trim()), `numeric polishName detected for ${item.latinName}`);
  }
});
