const CACHE_NAME = "sieweczka-clean-v8-xlsx-dictionary";
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
  if (window.__sieweczkaXlsxExportPatchV8) return;
  window.__sieweczkaXlsxExportPatchV8 = true;

  const STORAGE_KEYS = ["sieweczka-field-data-v3", "sieweczka-field-data-v2"];
  const PHOTO_DB = "sieweczka-photo-db";
  const PHOTO_STORE = "photos";
  const BASE_COLUMNS = [["uid","uid","Techniczny identyfikator rekordu nadany przez aplikację.","tekst"],["protocol_version","protocolVersion","Wersja protokołu lub formularza, z której pochodzi rekord.","tekst"],["created_at","createdAt","Data i czas pierwszego utworzenia rekordu w aplikacji.","ISO datetime"],["updated_at","updatedAt","Data i czas ostatniej aktualizacji rekordu.","ISO datetime"],["nest_id","nestId","Unikalny terenowy identyfikator gniazda.","tekst"],["season","season","Sezon lub rok badań.","rok/tekst"],["observer","observer","Osoba wykonująca obserwację lub pomiar.","tekst"],["obs_date","obsDate","Data obserwacji terenowej.","RRRR-MM-DD"],["obs_time","obsTime","Godzina obserwacji terenowej.","HH:MM"],["species","species","Oznaczony gatunek sieweczki.","charadrius-hiaticula = sieweczka obrożna; charadrius-dubius = sieweczka rzeczna; unknown = nieokreślony"],["sector","sector","Sektor, część wyspy, łachy lub stanowiska.","tekst"],["lat","lat","Szerokość geograficzna gniazda.","WGS84, stopnie dziesiętne"],["lon","lon","Długość geograficzna gniazda.","WGS84, stopnie dziesiętne"],["gps_accuracy_m","gpsAccuracyM","Deklarowana dokładność pomiaru GPS gniazda.","metry"],["nest_status","nestStatus","Status gniazda w momencie znalezienia.","incubated = inkubacja; fresh = świeże zniesienie; unknown = nieznane"],["egg_count","eggCount","Liczba jaj widoczna w gnieździe.","liczba"],["possible_renest","possibleRenest","Czy gniazdo może być ponownym zniesieniem po stracie wcześniejszego lęgu.","yes/no/unknown"],["doc_photo_done","docPhotoDone","Czy wykonano zdjęcie dokumentacyjne gniazda.","yes/no/unknown"],["nest_one_m_photo_done","nestOneMPhotoDone","Czy wykonano zdjęcie kwadratu 1 m² nad gniazdem.","yes/no/unknown"],["random_point_done","randomPointDone","Czy wyznaczono punkt losowy 10 m od gniazda.","yes/no/unknown"],["nest_substrate","nestMicro.substrate","Dominujący typ podłoża bezpośrednio przy gnieździe.","sand/fine-gravel/coarse-gravel/stones/mixed"],["nest_pct_sand","nestMicro.coverage.pctSand","Udział piasku w kwadracie 1 m² przy gnieździe.","%"],["nest_pct_fine_gravel","nestMicro.coverage.pctFineGravel","Udział drobnego żwiru w kwadracie 1 m² przy gnieździe.","%"],["nest_pct_coarse","nestMicro.coverage.pctCoarse","Udział grubego żwiru lub kamieni w kwadracie 1 m² przy gnieździe.","%"],["nest_pct_shells","nestMicro.coverage.pctShells","Udział muszli lub fragmentów skorup w kwadracie 1 m² przy gnieździe.","%"],["nest_pct_live_veg","nestMicro.coverage.pctLiveVeg","Udział żywej roślinności w kwadracie 1 m² przy gnieździe.","%"],["nest_pct_dry_veg","nestMicro.coverage.pctDryVeg","Udział suchej lub martwej roślinności w kwadracie 1 m² przy gnieździe.","%"],["nest_pct_organic","nestMicro.coverage.pctOrganic","Udział drewna, szczątków organicznych lub detrytusu w kwadracie 1 m² przy gnieździe.","%"],["nest_pct_anthro","nestMicro.coverage.pctAnthro","Udział elementów antropogenicznych w kwadracie 1 m² przy gnieździe.","%"],["nest_dist_plant_cm","nestMicro.distPlantCm","Odległość od środka gniazda do najbliższej rośliny lub kępy.","cm"],["nest_height_plant_cm","nestMicro.heightPlantCm","Wysokość najbliższej rośliny lub kępy przy gnieździe.","cm"],["nest_dist_object_cm","nestMicro.distObjectCm","Odległość od środka gniazda do najbliższego obiektu lub osłony niebędącej rośliną.","cm"],["nest_height_object_cm","nestMicro.heightObjectCm","Wysokość najbliższego obiektu lub osłony przy gnieździe.","cm"],["nest_slope","nestMicro.slope","Nachylenie powierzchni przy gnieździe.","flat/slight/steep"],["nest_microrelief","nestMicro.microrelief","Mikrorzeźba powierzchni przy gnieździe.","flat/depression/ridge/between-stones"],["random_azimuth_deg","randomMicro.azimuthDeg","Azymut użyty do wyznaczenia punktu losowego 10 m od gniazda.","stopnie 0-359"],["random_rerolled","randomMicro.wasRerolled","Czy punkt losowy był ponownie losowany.","yes/no/unknown"],["random_reroll_reason","randomMicro.rerollReason","Powód ponownego losowania punktu losowego.","none/water/dense-vegetation/outside-habitat/other"],["random_lat","randomMicro.lat","Szerokość geograficzna punktu losowego.","WGS84, stopnie dziesiętne"],["random_lon","randomMicro.lon","Długość geograficzna punktu losowego.","WGS84, stopnie dziesiętne"],["random_gps_accuracy_m","randomMicro.gpsAccuracyM","Deklarowana dokładność pomiaru GPS punktu losowego.","metry"],["random_substrate","randomMicro.substrate","Dominujący typ podłoża w punkcie losowym.","sand/fine-gravel/coarse-gravel/stones/mixed"],["random_pct_sand","randomMicro.coverage.pctSand","Udział piasku w kwadracie 1 m² punktu losowego.","%"],["random_pct_fine_gravel","randomMicro.coverage.pctFineGravel","Udział drobnego żwiru w kwadracie 1 m² punktu losowego.","%"],["random_pct_coarse","randomMicro.coverage.pctCoarse","Udział grubego żwiru lub kamieni w kwadracie 1 m² punktu losowego.","%"],["random_pct_shells","randomMicro.coverage.pctShells","Udział muszli lub fragmentów skorup w kwadracie 1 m² punktu losowego.","%"],["random_pct_live_veg","randomMicro.coverage.pctLiveVeg","Udział żywej roślinności w kwadracie 1 m² punktu losowego.","%"],["random_pct_dry_veg","randomMicro.coverage.pctDryVeg","Udział suchej lub martwej roślinności w kwadracie 1 m² punktu losowego.","%"],["random_pct_organic","randomMicro.coverage.pctOrganic","Udział drewna, szczątków organicznych lub detrytusu w kwadracie 1 m² punktu losowego.","%"],["random_pct_anthro","randomMicro.coverage.pctAnthro","Udział elementów antropogenicznych w kwadracie 1 m² punktu losowego.","%"],["random_dist_plant_cm","randomMicro.distPlantCm","Odległość od punktu losowego do najbliższej rośliny lub kępy.","cm"],["random_height_plant_cm","randomMicro.heightPlantCm","Wysokość najbliższej rośliny lub kępy przy punkcie losowym.","cm"],["random_dist_object_cm","randomMicro.distObjectCm","Odległość od punktu losowego do najbliższego obiektu lub osłony niebędącej rośliną.","cm"],["random_height_object_cm","randomMicro.heightObjectCm","Wysokość najbliższego obiektu lub osłony przy punkcie losowym.","cm"],["random_slope","randomMicro.slope","Nachylenie powierzchni w punkcie losowym.","flat/slight/steep"],["random_microrelief","randomMicro.microrelief","Mikrorzeźba powierzchni w punkcie losowym.","flat/depression/ridge/between-stones"],["meso_pct_sand","meso.pctSand","Udział piasku w buforze 15 m wokół gniazda.","%"],["meso_pct_gravel","meso.pctGravel","Udział żwiru lub kamieni w buforze 15 m wokół gniazda.","%"],["meso_pct_vegetation","meso.pctVegetation","Udział roślinności w buforze 15 m wokół gniazda.","%"],["meso_pct_water","meso.pctWater","Udział wody lub podmokłości w buforze 15 m wokół gniazda.","%"],["meso_pct_other","meso.pctOther","Udział innych klas pokrycia w buforze 15 m wokół gniazda.","%"],["meso_assessment_method","meso.assessmentMethod","Sposób oceny buforu 15 m.","field = teren; gis = ortofotomapa/GIS; unknown = nieokreślone"],["meso_big_objects","meso.bigObjects","Obecność dużych obiektów w promieniu 15 m.","none/present/unknown"],["dist_water_m","meso.distWaterM","Odległość od gniazda do najbliższej linii wody.","m"],["dist_veg_edge_m","meso.distVegEdgeM","Odległość od gniazda do krawędzi zwartej roślinności.","m"],["dist_vertical_structure_m","meso.distVerticalStructureM","Odległość od gniazda do najbliższego wyższego obiektu lub struktury pionowej.","m"],["dist_fine_gravel_patch_m","meso.distFineGravelPatchM","Odległość od gniazda do płatu drobnego żwiru.","m"],["dist_coarse_gravel_patch_m","meso.distCoarseGravelPatchM","Odległość od gniazda do płatu grubszego żwiru lub kamieni.","m"],["dist_nearest_hiaticula_m","meso.distNearestHiaticulaM","Odległość do najbliższego znanego gniazda sieweczki obrożnej.","m"],["dist_nearest_dubius_m","meso.distNearestDubiusM","Odległość do najbliższego znanego gniazda sieweczki rzecznej.","m"],["meso_spatial_notes","meso.spatialNotes","Opis położenia i kontekstu przestrzennego gniazda.","tekst"],["qc_bird_reaction","qualityControl.birdReaction","Reakcja ptaków podczas podejścia do gniazda.","weak/moderate/strong"],["qc_time_at_nest","qualityControl.timeAtNest","Czas bezpośredniej obecności przy gnieździe.","lt1/1to3/gt3"],["qc_aborted","qualityControl.aborted","Czy przerwano pomiar z powodu niepokoju ptaków lub ryzyka terenowego.","yes/no"],["qc_tracks_visible","qualityControl.tracksVisible","Czy widoczne były ślady drapieżnika lub człowieka.","yes/no"],["qc_tracks_notes","qualityControl.tracksNotes","Opis śladów, zakłóceń lub uwag jakościowych.","tekst"],["notes_identification","moduleNotes.identification","Notatki dotyczące identyfikacji gniazda lub gatunku.","tekst"],["notes_nest_micro","moduleNotes.nestMicro","Notatki dotyczące mikrohabitatu gniazda.","tekst"],["notes_random_micro","moduleNotes.randomMicro","Notatki dotyczące mikrohabitatu punktu losowego.","tekst"],["notes_meso","moduleNotes.meso","Notatki dotyczące mezohabitatu i buforu 15 m.","tekst"],["notes","notes","Uwagi dodatkowe do całego rekordu.","tekst"]];

  function bootHeightSteppers() {
    const fields = [["nest-height-plant",1,"cm"],["nest-height-object",1,"cm"],["random-height-plant",1,"cm"],["random-height-object",1,"cm"]];
    if (!document.getElementById("height-stepper-styles")) {
      const style = document.createElement("style");
      style.id = "height-stepper-styles";
      style.textContent = ".height-stepper-row{display:grid;grid-template-columns:minmax(0,1fr) 52px;gap:.45rem;align-items:stretch}.height-stepper-row input{min-width:0}.height-stepper-buttons{display:grid;grid-template-rows:1fr 1fr;gap:.25rem}.height-stepper-buttons button{min-height:23px;height:23px;padding:0;border-radius:9px;font-size:.85rem;line-height:1;font-weight:900}.height-stepper-unit{color:var(--muted);font-size:.86rem;font-weight:650;margin-top:.15rem}.field-mode .height-stepper-buttons button{border:2px solid #000}";
      document.head.appendChild(style);
    }
    function stepInput(input, delta) {
      const raw = input.value;
      const current = raw === "" || raw == null ? null : Number(raw);
      const next = current == null || Number.isNaN(current) ? (delta > 0 ? delta : 0) : Math.max(0, current + delta);
      input.value = String(Math.max(0, Math.round(next)));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    fields.forEach((args) => {
      const input = document.getElementById(args[0]);
      if (!input || input.dataset.heightStepperEnhanced === "1" || input.closest(".distance-stepper-row") || input.closest(".height-stepper-row")) return;
      input.dataset.heightStepperEnhanced = "1";
      input.step = String(args[1]);
      input.min = "0";
      const row = document.createElement("div");
      row.className = "height-stepper-row";
      const buttons = document.createElement("div");
      buttons.className = "height-stepper-buttons";
      buttons.innerHTML = '<button type="button" aria-label="Zwiększ wysokość">▲</button><button type="button" aria-label="Zmniejsz wysokość">▼</button>';
      buttons.children[0].addEventListener("click", () => stepInput(input, args[1]));
      buttons.children[1].addEventListener("click", () => stepInput(input, -args[1]));
      input.parentNode.insertBefore(row, input);
      row.appendChild(input);
      row.appendChild(buttons);
      const note = document.createElement("div");
      note.className = "height-stepper-unit";
      note.textContent = "Strzałki zmieniają wysokość co " + args[1] + " " + args[2] + "; pole może pozostać puste.";
      row.insertAdjacentElement("afterend", note);
    });
  }

  function xmlEscape(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function formulaEscape(value) {
    return String(value == null ? "" : value).replace(/"/g, '""');
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
    const clean = String(value || fallback || "plik").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
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
      bytes = new TextEncoder().encode(decodeURIComponent(data));
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
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const req = tx.objectStore(PHOTO_STORE).get(text.slice(4));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  function safeArray(value) { return Array.isArray(value) ? value : []; }
  function safeObj(value) { return value && typeof value === "object" ? value : {}; }
  function normalizeEntry(entry) {
    const e = safeObj(entry), nm = safeObj(e.nestMicro), rm = safeObj(e.randomMicro), meso = safeObj(e.meso), qc = safeObj(e.qualityControl), notes = safeObj(e.moduleNotes);
    return { ...e, nestMicro: { ...nm, coverage: safeObj(nm.coverage), photos: safeArray(nm.photos) }, randomMicro: { ...rm, coverage: safeObj(rm.coverage), photos: safeArray(rm.photos) }, meso, qualityControl: qc, moduleNotes: notes };
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
  function getPath(row, path) {
    return String(path || "").split(".").reduce((acc, part) => (acc == null ? "" : acc[part]), row) ?? "";
  }
  async function collectRowsAndPhotos(entries, outerZip) {
    const exportRows = [];
    let maxNestPhotos = 0, maxRandomPhotos = 0;
    for (let rowIndex = 0; rowIndex < entries.length; rowIndex += 1) {
      const entry = entries[rowIndex];
      const baseName = sanitizeFileName(entry.nestId || entry.uid || "rekord_" + (rowIndex + 1), "rekord_" + (rowIndex + 1));
      const item = { entry, nestPhotoFiles: [], randomPhotoFiles: [] };
      const groups = [["gniazdo", safeArray(entry.nestMicro.photos), item.nestPhotoFiles], ["punkt_losowy", safeArray(entry.randomMicro.photos), item.randomPhotoFiles]];
      for (const group of groups) {
        for (let i = 0; i < group[1].length; i += 1) {
          const blob = await getPhotoBlob(group[1][i]);
          if (!blob) { group[2].push(""); continue; }
          const fileName = baseName + "__" + group[0] + "_" + (i + 1) + "." + extensionFromType(blob.type);
          const zipPath = "photos/" + fileName;
          outerZip.file(zipPath, blob);
          group[2].push(zipPath);
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
      const formula = 'HYPERLINK("' + formulaEscape(value.hyperlink) + '","' + formulaEscape(value.label || value.hyperlink) + '")';
      return '<c r="' + ref + '" t="str"><f>' + xmlEscape(formula) + '</f><v>' + xmlEscape(value.label || value.hyperlink) + '</v></c>';
    }
    return '<c r="' + ref + '" t="inlineStr"><is><t>' + xmlEscape(value) + '</t></is></c>';
  }
  function buildSheetXml(headers, bodyRows) {
    const rows = ['<row r="1">' + headers.map((h, i) => cellXml(1, i + 1, h)).join("") + '</row>'];
    bodyRows.forEach((row, offset) => {
      const r = offset + 2;
      rows.push('<row r="' + r + '">' + row.map((v, i) => cellXml(r, i + 1, v)).join("") + '</row>');
    });
    const lastCell = colName(headers.length) + Math.max(1, bodyRows.length + 1);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<dimension ref="A1:' + lastCell + '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/><sheetData>' + rows.join("") + '</sheetData><autoFilter ref="A1:' + lastCell + '"/></worksheet>';
  }
  async function buildXlsxBlob(dataHeaders, dataRows, dictionaryRows) {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
    zip.folder("_rels").file(".rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.folder("xl").file("workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dane" sheetId="1" r:id="rId1"/><sheet name="Opis zmiennych" sheetId="2" r:id="rId2"/></sheets></workbook>');
    zip.folder("xl").folder("_rels").file("workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.folder("xl").file("styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>');
    zip.folder("xl").folder("worksheets").file("sheet1.xml", buildSheetXml(dataHeaders, dataRows));
    zip.folder("xl").folder("worksheets").file("sheet2.xml", buildSheetXml(["zmienna", "opis", "wartosci_lub_jednostka"], dictionaryRows));
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
    if (!window.JSZip) { alert("Nie można utworzyć ZIP/XLSX, bo biblioteka JSZip nie jest załadowana. Otwórz aplikację online i spróbuj ponownie."); return; }
    const entries = loadEntries();
    if (!entries.length) { alert("Brak zapisanych rekordów do eksportu."); return; }
    const button = document.getElementById("export-zip");
    const originalText = button ? button.textContent : "";
    if (button) { button.disabled = true; button.textContent = "Tworzę Excel + zdjęcia..."; }
    try {
      const outerZip = new JSZip();
      const collected = await collectRowsAndPhotos(entries, outerZip);
      const headers = BASE_COLUMNS.map((col) => col[0]);
      const dictionaryRows = BASE_COLUMNS.map((col) => [col[0], col[2] || "", col[3] || ""]);
      for (let i = 1; i <= collected.maxNestPhotos; i += 1) {
        const name = "nest_photo_" + i;
        headers.push(name);
        dictionaryRows.push([name, "Hiperłącze do zdjęcia gniazda numer " + i + " zapisanego w folderze photos w tej samej paczce ZIP.", "ścieżka względna do pliku zdjęcia"]);
      }
      for (let i = 1; i <= collected.maxRandomPhotos; i += 1) {
        const name = "random_photo_" + i;
        headers.push(name);
        dictionaryRows.push([name, "Hiperłącze do zdjęcia punktu losowego numer " + i + " zapisanego w folderze photos w tej samej paczce ZIP.", "ścieżka względna do pliku zdjęcia"]);
      }
      const sheetRows = collected.exportRows.map((item) => {
        const row = BASE_COLUMNS.map((col) => getPath(item.entry, col[1]));
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
      const xlsxBlob = await buildXlsxBlob(headers, sheetRows, dictionaryRows);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
      outerZip.file("records.xlsx", xlsxBlob);
      outerZip.file("README.txt", "Eksport Sieweczka Field App.\n\nPlik records.xlsx ma dwa arkusze:\n1. Dane - rekordy terenowe.\n2. Opis zmiennych - słownik kolumn i jednostek.\n\nKolumny nest_photo_1, nest_photo_2 itd. oraz random_photo_1, random_photo_2 itd. zawierają hiperłącza do plików w folderze photos.\nPo rozpakowaniu ZIP zostaw records.xlsx i folder photos w tym samym katalogu, aby hiperłącza działały.\n");
      const zipBlob = await outerZip.generateAsync({ type: "blob", mimeType: "application/zip" });
      downloadBlob("sieweczka-eksport-excel-zdjecia-" + stamp + ".zip", zipBlob);
    } catch (error) {
      console.error(error);
      alert("Nie udało się przygotować eksportu Excel ze zdjęciami. Szczegóły są w konsoli przeglądarki.");
    } finally {
      if (button) { button.disabled = false; button.textContent = originalText || "Eksport Excel + zdjęcia"; }
    }
  }
  function removeOldExportButtons() {
    const csvButton = document.getElementById("export-csv");
    const jsonButton = document.getElementById("export-json");
    if (csvButton) csvButton.remove();
    if (jsonButton) jsonButton.remove();
  }
  function bootExportPatch() {
    removeOldExportButtons();
    const button = document.getElementById("export-zip");
    if (!button) return;
    button.textContent = "Eksport Excel + zdjęcia";
    if (button.dataset.xlsxPhotoPatchV8 === "1") return;
    button.dataset.xlsxPhotoPatchV8 = "1";
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
  const patched = source.includes("__sieweczkaXlsxExportPatchV8") ? source : source + "\n\n" + XLSX_EXPORT_PATCH_JS + "\n";
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
