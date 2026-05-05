const SECRET_TOKEN = "";

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (SECRET_TOKEN && payload.token !== SECRET_TOKEN) return jsonResponse({ ok: false, error: "Invalid token" }, 403);
    const records = Array.isArray(payload.records) ? payload.records : [];
    const columns = Array.isArray(payload.columns) ? payload.columns : [];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const recordsSheet = getOrCreateSheet(ss, "Rekordy");
    const columnsSheet = getOrCreateSheet(ss, "Opis kolumn");

    const required = ["id", "lat", "lon", "species_label", "date", "eggs", "sector"];
    const keys = unique([].concat(required, ...records.map(r => Object.keys(r || {}))));
    ensureHeaders(recordsSheet, keys);

    const idCol = keys.indexOf("id") + 1;
    const existingIds = new Set(readColumnValues(recordsSheet, idCol).map(String));
    const toInsert = [];
    let skipped = 0;
    records.forEach((row) => {
      const id = String((row && row.id) || "").trim();
      if (!id || existingIds.has(id)) { skipped++; return; }
      toInsert.push(keys.map((k) => row[k] == null ? "" : row[k]));
      existingIds.add(id);
    });

    if (toInsert.length) {
      recordsSheet.getRange(recordsSheet.getLastRow() + 1, 1, toInsert.length, keys.length).setValues(toInsert);
    }

    columnsSheet.clear();
    columnsSheet.getRange(1, 1, 1, 3).setValues([["key", "label", "description"]]);
    if (columns.length) {
      columnsSheet.getRange(2, 1, columns.length, 3).setValues(columns.map((c) => [c.key || "", c.label || "", c.description || ""]));
    }

    return jsonResponse({ ok: true, received: records.length, inserted: toInsert.length, skipped_existing: skipped });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) }, 500);
  }
}

function getOrCreateSheet(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
function unique(arr) { return Array.from(new Set(arr.filter(Boolean))); }
function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) { sheet.getRange(1, 1, 1, headers.length).setValues([headers]); return; }
  const existing = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(String);
  if (existing.join("|") !== headers.join("|")) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}
function readColumnValues(sheet, col) {
  const last = sheet.getLastRow();
  if (last < 2 || col < 1) return [];
  return sheet.getRange(2, col, last - 1, 1).getValues().flat().filter(Boolean);
}
function jsonResponse(obj, code) {
  const out = ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  if (code) out.setHeader && out.setHeader("X-Status-Code", String(code));
  return out;
}
