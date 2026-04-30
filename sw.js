const CACHE_NAME = "sieweczka-clean-v7-xlsx-appjs-direct";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./field-help.js",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

const XLSX_EXPORT_PATCH_JS = String.raw`
(() => {
  "use strict";
  if (window.__sieweczkaXlsxExportPatchV7) return;
  window.__sieweczkaXlsxExportPatchV7 = true;

  const STORAGE_KEYS = ["sieweczka-field-data-v3", "sieweczka-field-data-v2"];
  const PHOTO_DB = "sieweczka-photo-db";
  const PHOTO_STORE = "photos";

  const HEIGHT_FIELDS = [
    ["nest-height-plant", 1, "cm"],
    ["nest-height-object", 1, "cm"],
    ["random-height-plant", 1, "cm"],
    ["random-height-object", 1, "cm"]
  ];

  function injectHeightStepperStyles() {
    if (document.getElementById("height-stepper-styles")) return;
    const style = document.createElement("style");
    style.id = "height-stepper-styles";
    style.textContent = ".height-stepper-row{display:grid;grid-template-columns:minmax(0,1fr) 52px;gap:.45rem;align-items:stretch}.height-stepper-row input{min-width:0}.height-stepper-buttons{display:grid;grid-template-rows:1fr 1fr;gap:.25rem}.height-stepper-buttons button{min-height:23px;height:23px;padding:0;border-radius:9px;font-size:.85rem;line-height:1;font-weight:900}.height-stepper-unit{color:var(--muted);font-size:.86rem;font-weight:650;margin-top:.15rem}.field-mode .height-stepper-buttons button{border:2px solid #000}";
    document.head.appendChild(style);
  }

  function stepHeightInput(input, delta) {
    const raw = input.value;
    const current = raw === "" || raw == null ? null : Number(raw);
    const next = current == null || Number.isNaN(current) ? (delta > 0 ? delta : 0) : Math.max(0, current + delta);
    input.value = String(Math.max(0, Math.round(next)));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function enhanceHeightField(id, step, unit) {
    const input = document.getElementById(id);
    if (!input || input.dataset.heightStepperEnhanced === "1" || input.closest(".distance-stepper-row") || input.closest(".height-stepper-row")) return;
    input.dataset.heightStepperEnhanced = "1";
    input.step = String(step);
    input.min = "0";
    const row = document.createElement("div");
    row.className = "height-stepper-row";
    const buttons = document.createElement("div");
    buttons.className = "height-stepper-buttons";
    buttons.innerHTML = '<button type="button" aria-label="Zwiększ wysokość">▲</button><button type="button" aria-label="Zmniejsz wysokość">▼</button>';
    buttons.children[0].addEventListener("click", () => stepHeightInput(input, step));
    buttons.children[1].addEventListener("click", () => stepHeightInput(input, -step));
    input.parentNode.insertBefore(row, input);
    row.appendChild(input);
    row.appendChild(buttons);
    const note = document.createElement("div");
    note.className = "height-stepper-unit";
    note.textContent = "Strzałki zmieniają wysokość co " + step + " " + unit + "; pole może pozostać puste.";
    row.insertAdjacentElement("afterend", note);
  }

  function bootHeightSteppers() {
    injectHeightStepperStyles();
    HEIGHT_FIELDS.forEach((args) => enhanceHeightField(args[0], args[1], args[2]));
    setTimeout(() => HEIGHT_FIELDS.forEach((args) => enhanceHeightField(args[0], args[1], args[2])), 250);
  }

  function xmlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formulaEscape(value) {
    return String(value == null ? "" : value).replace(/"/g, '""');
  }

  function csvEscape(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }

  function colName(index) {
    let name = "";
    let n = index;
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function sanitizeFileName(value, fallback) {
    const clean = String(value || fallback || "plik")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120);
    return clean || fallback || "plik";
  }

  function extensionFromType(type) {
    const t = String(type || "").toLowerCase();
    if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
    if (t.includes("png")) return "png";
    if (t.includes("webp")) return "webp";
    if (t.includes("heic")) return "heic";
    if (t.includes("heif")) return "heif";
    return "jpg";
  }

  function dataUrlToBlob(dataUrl) {
    const text = String(dataUrl || "");
    const comma = text.indexOf(",");
    if (!text.startsWith("data:") || comma < 0) return null;
    const meta = text.slice(0, comma);
    const data = text.slice(comma + 1);
    const mimeMatch = meta.match(/^data:([^;]+)(;base64)?$/i);
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    let bytes;
    if (/;base64/i.test(meta)) {
      const bin = atob(data);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    } else {
      const decoded = decodeURIComponent(data);
      bytes = new TextEncoder().encode(decoded);
    }
    return new Blob([bytes], { type: mime });
  }

  function openPhotoDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(PHOTO_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getPhotoBlob(ref) {
    if (!ref) return null;
    const text = String(ref);
    if (text.startsWith("data:")) return dataUrlToBlob(text);
    if (!text.startsWith("idb:")) return null;
    const id = text.slice(4);
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const req = tx.objectStore(PHOTO_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObj(value) {
    return value && typeof value === "object" ? value : {};
  }

  function normalizeEntry(entry) {
    const e = safeObj(entry);
    const nestMicro = safeObj(e.nestMicro);
    const randomMicro = safeObj(e.randomMicro);
    const meso = safeObj(e.meso);
    const qualityControl = safeObj(e.qualityControl);
    const moduleNotes = safeObj(e.moduleNotes);
    return {
      ...e,
      nestMicro: { ...nestMicro, coverage: safeObj(nestMicro.coverage), photos: safeArray(nestMicro.photos) },
      randomMicro: { ...randomMicro, coverage: safeObj(randomMicro.coverage), photos: safeArray(randomMicro.photos) },
      meso,
      qualityControl,
      moduleNotes
    };
  }

  function loadEntries() {
    for (const key of STORAGE_KEYS) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(parsed) && parsed.length) return parsed.map(normalizeEntry);
      } catch (error) {
        console.warn("Nie udało się odczytać bazy", key, error);
      }
    }
    const dynamicKey = Object.keys(localStorage).filter((key) => key.startsWith("sieweczka-field-data-")).sort().reverse()[0];
    if (!dynamicKey) return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(dynamicKey) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizeEntry) : [];
    } catch {
      return [];
    }
  }

  function valueAt(path) {
    return (row) => path.split(".").reduce((acc, part) => (acc == null ? "" : acc[part]), row) ?? "";
  }

  const BASE_COLUMNS = [
    ["uid", valueAt("uid")],
    ["protocol_version", valueAt("protocolVersion")],
    ["created_at", valueAt("createdAt")],
    ["updated_at", valueAt("updatedAt")],
    ["nest_id", valueAt("nestId")],
    ["season", valueAt("season")],
    ["observer", valueAt("observer")],
    ["obs_date", valueAt("obsDate")],
    ["obs_time", valueAt("obsTime")],
    ["species", valueAt("species")],
    ["sector", valueAt("sector")],
    ["lat", valueAt("lat")],
    ["lon", valueAt("lon")],
    ["gps_accuracy_m", valueAt("gpsAccuracyM")],
    ["nest_status", valueAt("nestStatus")],
    ["egg_count", valueAt("eggCount")],
    ["possible_renest", valueAt("possibleRenest")],
    ["doc_photo_done", valueAt("docPhotoDone")],
    ["nest_one_m_photo_done", valueAt("nestOneMPhotoDone")],
    ["random_point_done", valueAt("randomPointDone")],
    ["nest_substrate", valueAt("nestMicro.substrate")],
    ["nest_pct_sand", valueAt("nestMicro.coverage.pctSand")],
    ["nest_pct_fine_gravel", valueAt("nestMicro.coverage.pctFineGravel")],
    ["nest_pct_coarse", valueAt("nestMicro.coverage.pctCoarse")],
    ["nest_pct_shells", valueAt("nestMicro.coverage.pctShells")],
    ["nest_pct_live_veg", valueAt("nestMicro.coverage.pctLiveVeg")],
    ["nest_pct_dry_veg", valueAt("nestMicro.coverage.pctDryVeg")],
    ["nest_pct_organic", valueAt("nestMicro.coverage.pctOrganic")],
    ["nest_pct_anthro", valueAt("nestMicro.coverage.pctAnthro")],
    ["nest_dist_plant_cm", valueAt("nestMicro.distPlantCm")],
    ["nest_height_plant_cm", valueAt("nestMicro.heightPlantCm")],
    ["nest_dist_object_cm", valueAt("nestMicro.distObjectCm")],
    ["nest_height_object_cm", valueAt("nestMicro.heightObjectCm")],
    ["nest_slope", valueAt("nestMicro.slope")],
    ["nest_microrelief", valueAt("nestMicro.microrelief")],
    ["random_azimuth_deg", valueAt("randomMicro.azimuthDeg")],
    ["random_rerolled", valueAt("randomMicro.wasRerolled")],
    ["random_reroll_reason", valueAt("randomMicro.rerollReason")],
    ["random_lat", valueAt("randomMicro.lat")],
    ["random_lon", valueAt("randomMicro.lon")],
    ["random_gps_accuracy_m", valueAt("randomMicro.gpsAccuracyM")],
    ["random_substrate", valueAt("randomMicro.substrate")],
    ["random_pct_sand", valueAt("randomMicro.coverage.pctSand")],
    ["random_pct_fine_gravel", valueAt("randomMicro.coverage.pctFineGravel")],
    ["random_pct_coarse", valueAt("randomMicro.coverage.pctCoarse")],
    ["random_pct_shells", valueAt("randomMicro.coverage.pctShells")],
    ["random_pct_live_veg", valueAt("randomMicro.coverage.pctLiveVeg")],
    ["random_pct_dry_veg", valueAt("randomMicro.coverage.pctDryVeg")],
    ["random_pct_organic", valueAt("randomMicro.coverage.pctOrganic")],
    ["random_pct_anthro", valueAt("randomMicro.coverage.pctAnthro")],
    ["random_dist_plant_cm", valueAt("randomMicro.distPlantCm")],
    ["random_height_plant_cm", valueAt("randomMicro.heightPlantCm")],
    ["random_dist_object_cm", valueAt("randomMicro.distObjectCm")],
    ["random_height_object_cm", valueAt("randomMicro.heightObjectCm")],
    ["random_slope", valueAt("randomMicro.slope")],
    ["random_microrelief", valueAt("randomMicro.microrelief")],
    ["meso_pct_sand", valueAt("meso.pctSand")],
    ["meso_pct_gravel", valueAt("meso.pctGravel")],
    ["meso_pct_vegetation", valueAt("meso.pctVegetation")],
    ["meso_pct_water", valueAt("meso.pctWater")],
    ["meso_pct_other", valueAt("meso.pctOther")],
    ["meso_assessment_method", valueAt("meso.assessmentMethod")],
    ["meso_big_objects", valueAt("meso.bigObjects")],
    ["dist_water_m", valueAt("meso.distWaterM")],
    ["dist_veg_edge_m", valueAt("meso.distVegEdgeM")],
    ["dist_vertical_structure_m", valueAt("meso.distVerticalStructureM")],
    ["dist_fine_gravel_patch_m", valueAt("meso.distFineGravelPatchM")],
    ["dist_coarse_gravel_patch_m", valueAt("meso.distCoarseGravelPatchM")],
    ["dist_nearest_hiaticula_m", valueAt("meso.distNearestHiaticulaM")],
    ["dist_nearest_dubius_m", valueAt("meso.distNearestDubiusM")],
    ["meso_spatial_notes", valueAt("meso.spatialNotes")],
    ["qc_bird_reaction", valueAt("qualityControl.birdReaction")],
    ["qc_time_at_nest", valueAt("qualityControl.timeAtNest")],
    ["qc_aborted", valueAt("qualityControl.aborted")],
    ["qc_tracks_visible", valueAt("qualityControl.tracksVisible")],
    ["qc_tracks_notes", valueAt("qualityControl.tracksNotes")],
    ["notes_identification", valueAt("moduleNotes.identification")],
    ["notes_nest_micro", valueAt("moduleNotes.nestMicro")],
    ["notes_random_micro", valueAt("moduleNotes.randomMicro")],
    ["notes_meso", valueAt("moduleNotes.meso")],
    ["notes", valueAt("notes")]
  ];

  async function collectRowsAndPhotos(entries, outerZip) {
    const exportRows = [];
    let maxNestPhotos = 0;
    let maxRandomPhotos = 0;

    for (let rowIndex = 0; rowIndex < entries.length; rowIndex += 1) {
      const entry = entries[rowIndex];
      const baseName = sanitizeFileName(entry.nestId || entry.uid || "rekord_" + (rowIndex + 1), "rekord_" + (rowIndex + 1));
      const item = { entry, nestPhotoFiles: [], randomPhotoFiles: [] };

      const groups = [
        ["gniazdo", safeArray(entry.nestMicro.photos), item.nestPhotoFiles],
        ["punkt_losowy", safeArray(entry.randomMicro.photos), item.randomPhotoFiles]
      ];

      for (const group of groups) {
        const refs = group[1];
        const target = group[2];
        for (let i = 0; i < refs.length; i += 1) {
          const blob = await getPhotoBlob(refs[i]);
          if (!blob) {
            target.push("");
            continue;
          }
          const ext = extensionFromType(blob.type);
          const fileName = baseName + "__" + group[0] + "_" + (i + 1) + "." + ext;
          const zipPath = "photos/" + fileName;
          outerZip.file(zipPath, blob);
          target.push(zipPath);
        }
      }

      maxNestPhotos = Math.max(maxNestPhotos, item.nestPhotoFiles.length);
      maxRandomPhotos = Math.max(maxRandomPhotos, item.randomPhotoFiles.length);
      exportRows.push(item);
    }

    return { exportRows, maxNestPhotos, maxRandomPhotos };
  }

  function cellXml(rowIndex, colIndex, value) {
    const ref = colName(colIndex) + rowIndex;
    if (value && typeof value === "object" && value.hyperlink) {
      const target = formulaEscape(value.hyperlink);
      const label = formulaEscape(value.label || value.hyperlink);
      const formula = 'HYPERLINK("' + target + '","' + label + '")';
      return '<c r="' + ref + '" t="str"><f>' + xmlEscape(formula) + '</f><v>' + xmlEscape(value.label || value.hyperlink) + '</v></c>';
    }
    return '<c r="' + ref + '" t="inlineStr"><is><t>' + xmlEscape(value) + '</t></is></c>';
  }

  function buildSheetXml(headers, bodyRows) {
    const rows = [];
    rows.push('<row r="1">' + headers.map((header, idx) => cellXml(1, idx + 1, header)).join("") + '</row>');
    bodyRows.forEach((row, rowOffset) => {
      const r = rowOffset + 2;
      rows.push('<row r="' + r + '">' + row.map((value, idx) => cellXml(r, idx + 1, value)).join("") + '</row>');
    });
    const lastCell = colName(headers.length) + Math.max(1, bodyRows.length + 1);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<dimension ref="A1:' + lastCell + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      '<sheetData>' + rows.join("") + '</sheetData>' +
      '<autoFilter ref="A1:' + lastCell + '"/>' +
      '</worksheet>';
  }

  async function buildXlsxBlob(headers, rows) {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>');
    zip.folder("_rels").file(".rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>');
    zip.folder("xl").file("workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Dane" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>');
    zip.folder("xl").folder("_rels").file("workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');
    zip.folder("xl").file("styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
      '</styleSheet>');
    zip.folder("xl").folder("worksheets").file("sheet1.xml", buildSheetXml(headers, rows));
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function exportZipWithExcel() {
    if (!window.JSZip) {
      alert("Nie można utworzyć ZIP/XLSX, bo biblioteka JSZip nie jest załadowana. Otwórz aplikację online i spróbuj ponownie.");
      return;
    }

    const entries = loadEntries();
    if (!entries.length) {
      alert("Brak zapisanych rekordów do eksportu.");
      return;
    }

    const button = document.getElementById("export-zip");
    const originalText = button ? button.textContent : "";
    if (button) {
      button.disabled = true;
      button.textContent = "Tworzę XLSX + zdjęcia...";
    }

    try {
      const outerZip = new JSZip();
      const collected = await collectRowsAndPhotos(entries, outerZip);
      const headers = BASE_COLUMNS.map((col) => col[0]);

      for (let i = 1; i <= collected.maxNestPhotos; i += 1) headers.push("nest_photo_" + i);
      for (let i = 1; i <= collected.maxRandomPhotos; i += 1) headers.push("random_photo_" + i);

      const sheetRows = collected.exportRows.map((item) => {
        const row = BASE_COLUMNS.map((col) => col[1](item.entry));
        for (let i = 0; i < collected.maxNestPhotos; i += 1) {
          const path = item.nestPhotoFiles[i] || "";
          row.push(path ? { hyperlink: path, label: path.split("/").pop() } : "");
        }
        for (let i = 0; i < collected.maxRandomPhotos; i += 1) {
          const path = item.randomPhotoFiles[i] || "";
          row.push(path ? { hyperlink: path, label: path.split("/").pop() } : "");
        }
        return row;
      });

      const xlsxBlob = await buildXlsxBlob(headers, sheetRows);
      const csv = [headers.map(csvEscape).join(",")].concat(
        sheetRows.map((row) => row.map((value) => csvEscape(value && typeof value === "object" ? value.hyperlink : value)).join(","))
      ).join("\n");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
      outerZip.file("records.xlsx", xlsxBlob);
      outerZip.file("records.csv", csv);
      outerZip.file("records.json", JSON.stringify(entries, null, 2));
      outerZip.file("README.txt", "Eksport Sieweczka Field App.\n\nNajważniejszy plik: records.xlsx. Kolumny nest_photo_1, nest_photo_2 itd. oraz random_photo_1, random_photo_2 itd. zawierają hiperłącza do plików w folderze photos.\n\nPo rozpakowaniu ZIP zostaw records.xlsx i folder photos w tym samym katalogu, aby hiperłącza działały.\n");
      const zipBlob = await outerZip.generateAsync({ type: "blob", mimeType: "application/zip" });
      downloadBlob("sieweczka-eksport-xlsx-" + stamp + ".zip", zipBlob);
    } catch (error) {
      console.error(error);
      alert("Nie udało się przygotować eksportu XLSX ze zdjęciami. Szczegóły są w konsoli przeglądarki.");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText || "Eksport ZIP + Excel + zdjęcia";
      }
    }
  }

  function bootExportPatch() {
    const button = document.getElementById("export-zip");
    if (!button || button.dataset.xlsxPhotoPatchV7 === "1") return;
    button.dataset.xlsxPhotoPatchV7 = "1";
    button.textContent = "Eksport ZIP + Excel + zdjęcia (XLSX)";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      exportZipWithExcel();
    }, true);
  }

  function boot() {
    bootHeightSteppers();
    bootExportPatch();
    setTimeout(bootExportPatch, 300);
    setTimeout(bootExportPatch, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
`;

async function cacheFreshAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);
}

async function appJsResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  let response = null;

  try {
    response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) cache.put(request, response.clone());
  } catch (error) {
    response = await caches.match(request) || await caches.match("./app.js");
  }

  if (!response) return new Response("Offline", { status: 503, statusText: "Offline" });

  const source = await response.clone().text();
  const patched = source.includes("__sieweczkaXlsxExportPatchV7") ? source : source + "\n\n" + XLSX_EXPORT_PATCH_JS + "\n";
  return new Response(patched, {
    status: 200,
    statusText: "OK",
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheFreshAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.pathname.endsWith("/app.js") || url.pathname.endsWith("app.js")) {
    event.respondWith(appJsResponse(event.request));
    return;
  }

  const isNavigation = event.request.mode === "navigate";
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached && !isNavigation) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          if (isNavigation) return caches.match("./index.html");
          return cached || new Response("Offline", { status: 503, statusText: "Offline" });
        });
    })
  );
});
