const CACHE_NAME = "sieweczka-app-v2026-05-responsive-ui-4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./field-help.js",
  "./manifest.webmanifest",
  "./data/grid_vanvan_wgs84.geojson",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

const SIEWECZKA_PATCH_V9 = String.raw`
(() => {
  "use strict";
  if (window.__sieweczkaPatchV9) return;
  window.__sieweczkaPatchV9 = true;

  const STORAGE_KEYS = ["sieweczka-field-data-v3", "sieweczka-field-data-v2"];
  const AUTOSAVE_KEY = "sieweczka-field-autosave-v9";
  const PHOTO_DB = "sieweczka-photo-db";
  const PHOTO_STORE = "photos";
  const STEP_TITLES = {
    1: "Identyfikacja",
    2: "GPS i zdjęcia gniazda",
    3: "Mikrohabitat gniazda",
    4: "Mezohabitat",
    5: "Punkt losowy 10 m",
    6: "Mikrohabitat punktu losowego",
    7: "Kontrola jakości",
    8: "Podsumowanie i zapis"
  };
  const STEP_REMAP = { "1": "1", "2": "2", "3": "3", "6": "4", "4": "5", "5": "6", "7": "7", "8": "8" };
  const DEFAULT_VALUES = new Map([
    ["species", "unknown"], ["nest-status", "unknown"], ["possible-renest", "unknown"],
    ["doc-photo-done", "unknown"], ["nest-one-m-photo-done", "unknown"], ["random-point-done", "unknown"],
    ["nest-substrate", "sand"], ["nest-slope", "flat"], ["nest-microrelief", "flat"],
    ["random-rerolled", "no"], ["random-reroll-reason", "none"], ["random-substrate", "sand"],
    ["random-slope", "flat"], ["random-microrelief", "flat"], ["meso-assessment-method", "unknown"],
    ["meso-big-objects", "unknown"], ["qc-bird-reaction", "weak"], ["qc-time-at-nest", "lt1"],
    ["qc-aborted", "no"], ["qc-tracks", "no"]
  ]);

  const BASE_COLUMNS = [
    ["uid","uid","Techniczny identyfikator rekordu nadany przez aplikację.","tekst"],
    ["protocol_version","protocolVersion","Wersja protokołu lub formularza, z której pochodzi rekord.","tekst"],
    ["created_at","createdAt","Data i czas pierwszego utworzenia rekordu w aplikacji.","ISO datetime"],
    ["updated_at","updatedAt","Data i czas ostatniej aktualizacji rekordu.","ISO datetime"],
    ["nest_id","nestId","Unikalny terenowy identyfikator gniazda.","tekst"],
    ["season","season","Sezon lub rok badań.","rok/tekst"],
    ["observer","observer","Osoba wykonująca obserwację lub pomiar.","tekst"],
    ["obs_date","obsDate","Data obserwacji terenowej.","RRRR-MM-DD"],
    ["obs_time","obsTime","Godzina obserwacji terenowej.","HH:MM"],
    ["species","species","Oznaczony gatunek sieweczki.","charadrius-hiaticula = sieweczka obrożna; charadrius-dubius = sieweczka rzeczna; unknown = nieokreślony"],
    ["sector","sector","Sektor, część wyspy, łachy lub stanowiska.","tekst"],
    ["lat","lat","Szerokość geograficzna gniazda.","WGS84, stopnie dziesiętne"],
    ["lon","lon","Długość geograficzna gniazda.","WGS84, stopnie dziesiętne"],
    ["gps_accuracy_m","gpsAccuracyM","Deklarowana dokładność pomiaru GPS gniazda.","metry"],
    ["nest_status","nestStatus","Status gniazda w momencie znalezienia.","incubated = inkubacja; fresh = świeże zniesienie; unknown = nieznane"],
    ["egg_count","eggCount","Liczba jaj widoczna w gnieździe.","liczba"],
    ["possible_renest","possibleRenest","Czy gniazdo może być ponownym zniesieniem po stracie wcześniejszego lęgu.","yes/no/unknown"],
    ["doc_photo_done","docPhotoDone","Czy wykonano zdjęcie dokumentacyjne gniazda.","yes/no/unknown"],
    ["nest_one_m_photo_done","nestOneMPhotoDone","Czy wykonano zdjęcie kwadratu 1 m² nad gniazdem.","yes/no/unknown"],
    ["random_point_done","randomPointDone","Czy wyznaczono punkt losowy 10 m od gniazda.","yes/no/unknown"],
    ["nest_substrate","nestMicro.substrate","Dominujący typ podłoża bezpośrednio przy gnieździe.","sand/fine-gravel/coarse-gravel/stones/mixed"],
    ["nest_pct_sand","nestMicro.coverage.pctSand","Udział piasku w kwadracie 1 m² przy gnieździe.","%"],
    ["nest_pct_fine_gravel","nestMicro.coverage.pctFineGravel","Udział drobnego żwiru w kwadracie 1 m² przy gnieździe.","%"],
    ["nest_pct_coarse","nestMicro.coverage.pctCoarse","Udział grubego żwiru lub kamieni w kwadracie 1 m² przy gnieździe.","%"],
    ["nest_pct_shells","nestMicro.coverage.pctShells","Udział muszli lub fragmentów skorup w kwadracie 1 m² przy gnieździe.","%"],
    ["nest_pct_live_veg","nestMicro.coverage.pctLiveVeg","Udział żywej roślinności w kwadracie 1 m² przy gnieździe.","%"],
    ["nest_pct_dry_veg","nestMicro.coverage.pctDryVeg","Udział suchej lub martwej roślinności w kwadracie 1 m² przy gnieździe.","%"],
    ["nest_pct_organic","nestMicro.coverage.pctOrganic","Udział drewna, szczątków organicznych lub detrytusu w kwadracie 1 m² przy gnieździe.","%"],
    ["nest_pct_anthro","nestMicro.coverage.pctAnthro","Udział elementów antropogenicznych w kwadracie 1 m² przy gnieździe.","%"],
    ["nest_dist_plant_cm","nestMicro.distPlantCm","Odległość od środka gniazda do najbliższej rośliny lub kępy.","cm"],
    ["nest_height_plant_cm","nestMicro.heightPlantCm","Wysokość najbliższej rośliny lub kępy przy gnieździe.","cm"],
    ["nest_dist_object_cm","nestMicro.distObjectCm","Odległość od środka gniazda do najbliższego obiektu lub osłony niebędącej rośliną.","cm"],
    ["nest_height_object_cm","nestMicro.heightObjectCm","Wysokość najbliższego obiektu lub osłony przy gnieździe.","cm"],
    ["nest_slope","nestMicro.slope","Nachylenie powierzchni przy gnieździe.","flat/slight/steep"],
    ["nest_microrelief","nestMicro.microrelief","Mikrorzeźba powierzchni przy gnieździe.","flat/depression/ridge/between-stones"],
    ["random_azimuth_deg","randomMicro.azimuthDeg","Azymut użyty do wyznaczenia punktu losowego 10 m od gniazda.","stopnie 0-359"],
    ["random_rerolled","randomMicro.wasRerolled","Czy punkt losowy był ponownie losowany.","yes/no/unknown"],
    ["random_reroll_reason","randomMicro.rerollReason","Powód ponownego losowania punktu losowego.","none/water/dense-vegetation/outside-habitat/other"],
    ["random_lat","randomMicro.lat","Szerokość geograficzna punktu losowego.","WGS84, stopnie dziesiętne"],
    ["random_lon","randomMicro.lon","Długość geograficzna punktu losowego.","WGS84, stopnie dziesiętne"],
    ["random_gps_accuracy_m","randomMicro.gpsAccuracyM","Deklarowana dokładność pomiaru GPS punktu losowego.","metry"],
    ["random_substrate","randomMicro.substrate","Dominujący typ podłoża w punkcie losowym.","sand/fine-gravel/coarse-gravel/stones/mixed"],
    ["random_pct_sand","randomMicro.coverage.pctSand","Udział piasku w kwadracie 1 m² punktu losowego.","%"],
    ["random_pct_fine_gravel","randomMicro.coverage.pctFineGravel","Udział drobnego żwiru w kwadracie 1 m² punktu losowego.","%"],
    ["random_pct_coarse","randomMicro.coverage.pctCoarse","Udział grubego żwiru lub kamieni w kwadracie 1 m² punktu losowego.","%"],
    ["random_pct_shells","randomMicro.coverage.pctShells","Udział muszli lub fragmentów skorup w kwadracie 1 m² punktu losowego.","%"],
    ["random_pct_live_veg","randomMicro.coverage.pctLiveVeg","Udział żywej roślinności w kwadracie 1 m² punktu losowego.","%"],
    ["random_pct_dry_veg","randomMicro.coverage.pctDryVeg","Udział suchej lub martwej roślinności w kwadracie 1 m² punktu losowego.","%"],
    ["random_pct_organic","randomMicro.coverage.pctOrganic","Udział drewna, szczątków organicznych lub detrytusu w kwadracie 1 m² punktu losowego.","%"],
    ["random_pct_anthro","randomMicro.coverage.pctAnthro","Udział elementów antropogenicznych w kwadracie 1 m² punktu losowego.","%"],
    ["random_dist_plant_cm","randomMicro.distPlantCm","Odległość od punktu losowego do najbliższej rośliny lub kępy.","cm"],
    ["random_height_plant_cm","randomMicro.heightPlantCm","Wysokość najbliższej rośliny lub kępy przy punkcie losowym.","cm"],
    ["random_dist_object_cm","randomMicro.distObjectCm","Odległość od punktu losowego do najbliższego obiektu lub osłony niebędącej rośliną.","cm"],
    ["random_height_object_cm","randomMicro.heightObjectCm","Wysokość najbliższego obiektu lub osłony przy punkcie losowym.","cm"],
    ["random_slope","randomMicro.slope","Nachylenie powierzchni w punkcie losowym.","flat/slight/steep"],
    ["random_microrelief","randomMicro.microrelief","Mikrorzeźba powierzchni w punkcie losowym.","flat/depression/ridge/between-stones"],
    ["Mezohabitat — piasek","meso.pctSand","Udział piasku w buforze 15 m wokół gniazda.","%"],
    ["Mezohabitat — żwir","meso.pctFineGravel","Udział drobnego lub średniego materiału żwirowego bez dominacji dużych kamieni.","%"],
    ["Mezohabitat — kamienie","meso.pctGravel","Udział większych kamieni, otoczaków i grubszego materiału kamienistego. Dawne „Żwir / kamienie”.","%"],
    ["Mezohabitat — roślinność","meso.pctVegetation","Udział roślinności w buforze 15 m wokół gniazda.","%"],
    ["Mezohabitat — woda/podmokłość","meso.pctWater","Udział wody lub podmokłości w buforze 15 m wokół gniazda.","%"],
    ["Mezohabitat — muszle","meso.pctOther","Pokrycie muszlami lub fragmentami muszli. Dawne „Inne”.","%"],
    ["meso_assessment_method","meso.assessmentMethod","Sposób oceny buforu 15 m.","field = teren; gis = ortofotomapa/GIS; unknown = nieokreślone"],
    ["meso_big_objects","meso.bigObjects","Obecność dużych obiektów w promieniu 15 m.","none/present/unknown"],
    ["dist_water_m","meso.distWaterM","Odległość od gniazda do najbliższej linii wody.","m"],
    ["dist_veg_edge_m","meso.distVegEdgeM","Odległość od gniazda do krawędzi zwartej roślinności.","m"],
    ["dist_vertical_structure_m","meso.distVerticalStructureM","Odległość od gniazda do najbliższego wyższego obiektu lub struktury pionowej.","m"],
    ["dist_fine_gravel_patch_m","meso.distFineGravelPatchM","Odległość od gniazda do płatu drobnego żwiru.","m"],
    ["dist_coarse_gravel_patch_m","meso.distCoarseGravelPatchM","Odległość od gniazda do płatu kamieni.","m"],
    ["dist_nearest_hiaticula_m","meso.distNearestHiaticulaM","Odległość do najbliższego znanego gniazda sieweczki obrożnej.","m"],
    ["dist_nearest_dubius_m","meso.distNearestDubiusM","Odległość do najbliższego znanego gniazda sieweczki rzecznej.","m"],
    ["meso_spatial_notes","meso.spatialNotes","Opis położenia i kontekstu przestrzennego gniazda.","tekst"],
    ["qc_bird_reaction","qualityControl.birdReaction","Reakcja ptaków podczas podejścia do gniazda.","weak/moderate/strong"],
    ["qc_time_at_nest","qualityControl.timeAtNest","Czas bezpośredniej obecności przy gnieździe.","lt1/1to3/gt3"],
    ["qc_aborted","qualityControl.aborted","Czy przerwano pomiar z powodu niepokoju ptaków lub ryzyka terenowego.","yes/no"],
    ["qc_tracks_visible","qualityControl.tracksVisible","Czy widoczne były ślady drapieżnika lub człowieka.","yes/no"],
    ["qc_tracks_notes","qualityControl.tracksNotes","Opis śladów, zakłóceń lub uwag jakościowych.","tekst"],
    ["notes_identification","moduleNotes.identification","Notatki dotyczące identyfikacji gniazda lub gatunku.","tekst"],
    ["notes_nest_micro","moduleNotes.nestMicro","Notatki dotyczące mikrohabitatu gniazda.","tekst"],
    ["notes_random_micro","moduleNotes.randomMicro","Notatki dotyczące mikrohabitatu punktu losowego.","tekst"],
    ["notes_meso","moduleNotes.meso","Notatki dotyczące mezohabitatu i buforu 15 m.","tekst"],
    ["notes","notes","Uwagi dodatkowe do całego rekordu.","tekst"]
  ];

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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

  async function putPhotoBlob(file) {
    const db = await openPhotoDb();
    const id = "autosave-" + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2));
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readwrite");
      tx.objectStore(PHOTO_STORE).put(file, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return "idb:" + id;
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

  function readAutosave() {
    try { return JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || "null"); }
    catch { return null; }
  }

  function writeAutosave(draft) {
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft)); }
    catch (error) { console.warn("Nie udało się wykonać autozapisu formularza.", error); }
  }

  function clearAutosave() {
    localStorage.removeItem(AUTOSAVE_KEY);
  }

  function visibleStepNumber() {
    const step = $("#entry-form .step:not([hidden])");
    return step ? Number(step.dataset.step || 1) : 1;
  }

  function hasMeaningfulDraft(values, photos) {
    const photoCount = ((photos && photos.nest) || []).length + ((photos && photos.random) || []).length;
    if (photoCount > 0) return true;
    return Object.entries(values || {}).some(([id, val]) => {
      const text = String(val == null ? "" : val).trim();
      if (!text) return false;
      if (id === "obs-date" || id === "obs-time" || id === "season") return false;
      if (DEFAULT_VALUES.has(id) && DEFAULT_VALUES.get(id) === text) return false;
      if (/^nest-pct-|^random-pct-|^pct-/.test(id) && (text === "0" || text === "0.0")) return false;
      return true;
    });
  }

  async function captureFiles(inputId, groupName) {
    const input = document.getElementById(inputId);
    const files = input && input.files ? Array.from(input.files) : [];
    if (!files.length) return null;
    const saved = [];
    for (const file of files.slice(0, 8)) {
      try {
        const ref = await putPhotoBlob(file);
        saved.push({ ref, name: file.name || groupName + ".jpg", type: file.type || "image/jpeg", size: file.size || 0, lastModified: file.lastModified || Date.now() });
      } catch (error) {
        console.warn("Nie udało się zapisać zdjęcia w autozapisie", error);
      }
    }
    return saved;
  }

  async function autosaveNow(options) {
    const form = document.getElementById("entry-form");
    const formScreen = document.getElementById("form-screen");
    if (!form || !formScreen || formScreen.hidden) return;

    const previous = readAutosave() || {};
    const values = {};
    $$('input, select, textarea', form).forEach((el) => {
      if (!el.id && !el.name) return;
      if (el.type === "file") return;
      values[el.id || el.name] = el.value == null ? "" : String(el.value);
    });

    const photos = previous.photos || { nest: [], random: [] };
    const forceFiles = options && options.captureFiles;
    if (forceFiles || (document.getElementById("nest-photos") && document.getElementById("nest-photos").files && document.getElementById("nest-photos").files.length)) {
      const nestFiles = await captureFiles("nest-photos", "zdjecie_gniazda");
      if (nestFiles) photos.nest = nestFiles;
    }
    if (forceFiles || (document.getElementById("random-photos") && document.getElementById("random-photos").files && document.getElementById("random-photos").files.length)) {
      const randomFiles = await captureFiles("random-photos", "zdjecie_punktu_losowego");
      if (randomFiles) photos.random = randomFiles;
    }

    if (!hasMeaningfulDraft(values, photos)) return;
    writeAutosave({ version: 9, savedAt: new Date().toISOString(), step: visibleStepNumber(), values, photos });
  }

  let autosaveTimer = null;
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => autosaveNow({ captureFiles: false }), 350);
  }

  function setControlValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value == null ? "" : String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function syncTilesFromInputs() {
    $$(".tile-group").forEach((group) => {
      const target = document.getElementById(group.dataset.target || "");
      if (!target) return;
      $$(".tile", group).forEach((tile) => tile.classList.toggle("selected", tile.dataset.value === target.value));
    });
  }

  async function restoreFilesToInput(inputId, items) {
    const input = document.getElementById(inputId);
    if (!input || !items || !items.length || typeof DataTransfer === "undefined") return;
    const dt = new DataTransfer();
    for (const item of items) {
      const blob = await getPhotoBlob(item.ref);
      if (!blob) continue;
      const name = item.name || "zdjecie.jpg";
      try {
        dt.items.add(new File([blob], name, { type: blob.type || item.type || "image/jpeg", lastModified: item.lastModified || Date.now() }));
      } catch {
        dt.items.add(new File([blob], name));
      }
    }
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function restoreAutosaveIfAvailable() {
    const draft = readAutosave();
    if (!draft || !draft.values) return;
    Object.entries(draft.values).forEach(([id, value]) => setControlValue(id, value));
    syncTilesFromInputs();
    await restoreFilesToInput("nest-photos", draft.photos && draft.photos.nest);
    await restoreFilesToInput("random-photos", draft.photos && draft.photos.random);
    setTimeout(() => syncTilesFromInputs(), 50);
    setTimeout(() => goToStep(Number(draft.step || 1)), 120);
  }

  async function goToStep(targetStep) {
    const target = Math.max(1, Math.min(8, Number(targetStep) || 1));
    let guard = 0;
    while (visibleStepNumber() < target && guard < 10) {
      const next = document.getElementById("step-next");
      if (!next || next.hidden) break;
      next.click();
      guard += 1;
      await wait(0);
    }
    while (visibleStepNumber() > target && guard < 20) {
      const back = document.getElementById("step-back");
      if (!back) break;
      back.click();
      guard += 1;
      await wait(0);
    }
    refreshStepUi();
  }

  function reorderSteps() {
    const form = document.getElementById("entry-form");
    const sticky = form ? form.querySelector(".sticky-actions") : null;
    if (!form || !sticky) return;
    const sections = $$(".step", form);
    sections.forEach((section) => {
      if (!section.dataset.originalStep) section.dataset.originalStep = section.dataset.step || "";
    });
    const sorted = sections.slice().sort((a, b) => Number(STEP_REMAP[a.dataset.originalStep] || a.dataset.originalStep) - Number(STEP_REMAP[b.dataset.originalStep] || b.dataset.originalStep));
    sorted.forEach((section) => {
      section.dataset.step = STEP_REMAP[section.dataset.originalStep] || section.dataset.originalStep;
      form.insertBefore(section, sticky);
    });
  }

  function updateValidationButtons() {
    $$("#validation-list button[data-field]").forEach((btn) => {
      const field = document.querySelector(btn.dataset.field || "");
      const section = field ? field.closest(".step") : null;
      if (section && section.dataset.step) btn.dataset.step = section.dataset.step;
    });
  }

  function refreshStepUi() {
    const step = visibleStepNumber();
    const title = document.getElementById("step-title");
    const progress = document.getElementById("step-progress");
    const back = document.getElementById("step-back");
    const next = document.getElementById("step-next");
    const save = document.getElementById("save-final");
    if (title) title.textContent = "Krok " + step + " z 8 — " + (STEP_TITLES[step] || "");
    if (progress) progress.style.width = String((step / 8) * 100) + "%";
    if (back) back.disabled = step === 1;
    if (next) next.hidden = step === 8;
    if (save) save.hidden = step !== 8;
    updateValidationButtons();
  }

  function setupNavigationTop() {
    const formHead = document.querySelector("#form-screen .screen-head");
    if (!formHead) return;
    const backHome = formHead.querySelector(".back-home");
    if (backHome) {
      backHome.textContent = "← Początek";
      backHome.title = "Przejdź do pierwszej karty formularza";
    }
    if (!document.getElementById("form-jump-end")) {
      const end = document.createElement("button");
      end.id = "form-jump-end";
      end.type = "button";
      end.className = "ghost small";
      end.textContent = "Koniec →";
      end.title = "Przejdź do podsumowania i zapisu";
      formHead.appendChild(end);
    }
    if (!document.getElementById("autosave-status")) {
      const note = document.createElement("div");
      note.id = "autosave-status";
      note.className = "hint";
      note.style.margin = ".35rem 0 .75rem";
      note.textContent = "Autozapis formularza jest włączony — przypadkowe wyjście do menu nie powinno kasować ostatnio wpisanych danych.";
      formHead.insertAdjacentElement("afterend", note);
    }
  }

  function hideOldExportButtonsAndRename() {
    const csv = document.getElementById("export-csv");
    const json = document.getElementById("export-json");
    if (csv) csv.hidden = true;
    if (json) json.hidden = true;
    const zip = document.getElementById("export-zip");
    if (zip) zip.textContent = "Eksport Excel + zdjęcia";
  }

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

  function xmlEscape(value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function formulaEscape(value) { return String(value == null ? "" : value).replace(/"/g, '""'); }
  function colName(index) {
    let name = "";
    let n = index;
    while (n > 0) { const rem = (n - 1) % 26; name = String.fromCharCode(65 + rem) + name; n = Math.floor((n - 1) / 26); }
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
  function safeArray(value) { return Array.isArray(value) ? value : []; }
  function safeObj(value) { return value && typeof value === "object" ? value : {}; }
  function normalizeEntry(entry) {
    const e = safeObj(entry), nm = safeObj(e.nestMicro), rm = safeObj(e.randomMicro), meso = safeObj(e.meso), qc = safeObj(e.qualityControl), notes = safeObj(e.moduleNotes);
    return { ...e, nestMicro: { ...nm, coverage: safeObj(nm.coverage), photos: safeArray(nm.photos) }, randomMicro: { ...rm, coverage: safeObj(rm.coverage), photos: safeArray(rm.photos) }, meso, qualityControl: qc, moduleNotes: notes };
  }
  function loadEntries() {
    for (const key of STORAGE_KEYS) {
      try { const parsed = JSON.parse(localStorage.getItem(key) || "[]"); if (Array.isArray(parsed) && parsed.length) return parsed.map(normalizeEntry); }
      catch (error) { console.warn("Nie udało się odczytać bazy", key, error); }
    }
    const dynamicKey = Object.keys(localStorage).filter((key) => key.startsWith("sieweczka-field-data-")).sort().reverse()[0];
    if (!dynamicKey) return [];
    try { const parsed = JSON.parse(localStorage.getItem(dynamicKey) || "[]"); return Array.isArray(parsed) ? parsed.map(normalizeEntry) : []; }
    catch { return []; }
  }
  function getPath(row, path) { return String(path || "").split(".").reduce((acc, part) => (acc == null ? "" : acc[part]), row) ?? ""; }
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
    bodyRows.forEach((row, offset) => { const r = offset + 2; rows.push('<row r="' + r + '">' + row.map((v, i) => cellXml(r, i + 1, v)).join("") + '</row>'); });
    const lastCell = colName(headers.length) + Math.max(1, bodyRows.length + 1);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' + '<dimension ref="A1:' + lastCell + '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' + '<sheetFormatPr defaultRowHeight="15"/><sheetData>' + rows.join("") + '</sheetData><autoFilter ref="A1:' + lastCell + '"/></worksheet>';
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
      for (let i = 1; i <= collected.maxNestPhotos; i += 1) { const name = "nest_photo_" + i; headers.push(name); dictionaryRows.push([name, "Hiperłącze do zdjęcia gniazda numer " + i + " zapisanego w folderze photos w tej samej paczce ZIP.", "ścieżka względna do pliku zdjęcia"]); }
      for (let i = 1; i <= collected.maxRandomPhotos; i += 1) { const name = "random_photo_" + i; headers.push(name); dictionaryRows.push([name, "Hiperłącze do zdjęcia punktu losowego numer " + i + " zapisanego w folderze photos w tej samej paczce ZIP.", "ścieżka względna do pliku zdjęcia"]); }
      const sheetRows = collected.exportRows.map((item) => {
        const row = BASE_COLUMNS.map((col) => getPath(item.entry, col[1]));
        for (let i = 0; i < collected.maxNestPhotos; i += 1) { const path = item.nestPhotoFiles[i] || ""; row.push(path ? { hyperlink: path, label: path.split("/").pop() } : ""); }
        for (let i = 0; i < collected.maxRandomPhotos; i += 1) { const path = item.randomPhotoFiles[i] || ""; row.push(path ? { hyperlink: path, label: path.split("/").pop() } : ""); }
        return row;
      });
      const xlsxBlob = await buildXlsxBlob(headers, sheetRows, dictionaryRows);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
      outerZip.file("records.xlsx", xlsxBlob);
      outerZip.file("README.txt", "Eksport Sieweczka Field App.\n\nNajważniejszy plik: records.xlsx. Arkusz 'Dane' zawiera rekordy, a arkusz 'Opis zmiennych' opisuje znaczenie kolumn. Kolumny nest_photo_1, nest_photo_2 itd. oraz random_photo_1, random_photo_2 itd. zawierają hiperłącza do plików w folderze photos.\n\nPo rozpakowaniu ZIP zostaw records.xlsx i folder photos w tym samym katalogu, aby hiperłącza działały.\n");
      const zipBlob = await outerZip.generateAsync({ type: "blob", mimeType: "application/zip" });
      downloadBlob("sieweczka-eksport-excel-zdjecia-" + stamp + ".zip", zipBlob);
    } catch (error) {
      console.error(error);
      alert("Nie udało się przygotować eksportu Excel ze zdjęciami. Szczegóły są w konsoli przeglądarki.");
    } finally {
      if (button) { button.disabled = false; button.textContent = originalText || "Eksport Excel + zdjęcia"; }
    }
  }

  function bootExportPatch() {
    hideOldExportButtonsAndRename();
    const button = document.getElementById("export-zip");
    if (!button || button.dataset.xlsxPhotoPatchV9 === "1") return;
    button.dataset.xlsxPhotoPatchV9 = "1";
    button.textContent = "Eksport Excel + zdjęcia";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      exportZipWithExcel();
    }, true);
  }

  function installEventHandlers() {
    document.addEventListener("input", (event) => { if (event.target && event.target.closest && event.target.closest("#entry-form")) scheduleAutosave(); }, true);
    document.addEventListener("change", (event) => { if (event.target && event.target.closest && event.target.closest("#entry-form")) autosaveNow({ captureFiles: event.target.type === "file" }); }, true);
    document.addEventListener("click", (event) => {
      const formScreen = document.getElementById("form-screen");
      const inForm = formScreen && !formScreen.hidden;
      const target = event.target && event.target.closest ? event.target.closest("button, a") : null;
      if (!target) return;
      if (inForm && target.id === "home-shortcut") autosaveNow({ captureFiles: true });
      if (inForm && target.closest("#form-screen") && target.classList.contains("back-home")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        autosaveNow({ captureFiles: true });
        goToStep(1);
      }
      if (target.id === "form-jump-end") {
        event.preventDefault();
        event.stopImmediatePropagation();
        autosaveNow({ captureFiles: true });
        goToStep(8);
      }
      if (target.id === "save-draft") setTimeout(() => autosaveNow({ captureFiles: true }), 100);
      if (target.id === "save-final") {
        setTimeout(() => {
          const fs = document.getElementById("form-screen");
          if (fs && fs.hidden) clearAutosave();
        }, 900);
      }
    }, true);
    const start = document.getElementById("start-new");
    if (start && start.dataset.autosaveRestoreV9 !== "1") {
      start.dataset.autosaveRestoreV9 = "1";
      start.addEventListener("click", () => { setTimeout(() => restoreAutosaveIfAvailable(), 180); }, false);
    }
  }

  function observeUi() {
    const form = document.getElementById("entry-form");
    if (!form || form.dataset.v9Observed === "1") return;
    form.dataset.v9Observed = "1";
    const observer = new MutationObserver(() => setTimeout(refreshStepUi, 0));
    observer.observe(form, { subtree: true, attributes: true, attributeFilter: ["hidden", "data-step"], childList: true });
  }

  function boot() {
    reorderSteps();
    setupNavigationTop();
    bootHeightSteppers();
    bootExportPatch();
    installEventHandlers();
    observeUi();
    refreshStepUi();
    setTimeout(() => { reorderSteps(); setupNavigationTop(); bootExportPatch(); refreshStepUi(); }, 400);
    setTimeout(() => { reorderSteps(); setupNavigationTop(); bootExportPatch(); refreshStepUi(); }, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
`;

const SIEWECZKA_PATCH_V11_SAFE_FIXES = String.raw`

(() => {
  "use strict";
  if (window.__sieweczkaPatchV11SafeFixes) return;
  window.__sieweczkaPatchV11SafeFixes = true;

  const AUTOSAVE_KEY = "sieweczka-field-autosave-v9";
  let resumeDraftPending = false;
  let lastPhotoScale = 1;

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

  function readAutosave() {
    try { return JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || "null"); }
    catch { return null; }
  }

  function hasDraft() {
    const draft = readAutosave();
    return !!(draft && draft.values);
  }

  function injectSafeStyles() {
    if (document.getElementById("sieweczka-v11-safe-styles")) return;
    const style = document.createElement("style");
    style.id = "sieweczka-v11-safe-styles";
    style.textContent = [
      "#autosave-status{display:none!important}",
      "#form-screen .screen-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:.6rem;align-items:center}",
      "#form-screen .screen-head h2{text-align:center;margin:.2rem 0}",
      "#form-screen .screen-head .back-home,#form-jump-end{background:var(--primary,#0f766e)!important;color:#fff!important;border:2px solid var(--primary,#0f766e)!important;border-radius:12px!important;padding:.45rem .75rem!important;font-weight:800!important;box-shadow:none!important;min-height:40px}",
      "#form-screen .screen-head .back-home:active,#form-jump-end:active{transform:translateY(1px)}",
      "#resume-draft[hidden]{display:none!important}",
      ".photo-guidance{display:none!important}",
      ".photo-preview img{cursor:zoom-in}",
      ".sieweczka-photo-modal{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.92);display:grid;grid-template-rows:auto minmax(0,1fr);color:#fff}",
      ".sieweczka-photo-toolbar{display:flex;gap:.45rem;align-items:center;justify-content:space-between;padding:.65rem;background:rgba(0,0,0,.65)}",
      ".sieweczka-photo-toolbar .tools{display:flex;gap:.45rem;align-items:center}",
      ".sieweczka-photo-toolbar button{background:#fff;color:#111;border:0;border-radius:10px;padding:.45rem .7rem;font-weight:900;min-height:38px}",
      ".sieweczka-photo-stage{overflow:auto;display:grid;place-items:center;padding:1rem;touch-action:pan-x pan-y pinch-zoom}",
      ".sieweczka-photo-stage img{max-width:94vw;max-height:82vh;transform-origin:center center;transition:transform .12s ease;box-shadow:0 8px 30px rgba(0,0,0,.55)}",
      ".sieweczka-help-btn{display:inline-grid;place-items:center;width:1.45rem;height:1.45rem;border-radius:999px;border:0;background:var(--primary,#0f766e);color:#fff;font-weight:900;margin-left:.45rem;vertical-align:middle;line-height:1}",
      ".sieweczka-help-panel{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99998;display:grid;place-items:end center;padding:1rem;color:var(--text,#111827)}",
      ".sieweczka-help-card{background:#fff;border-radius:18px;padding:1rem;max-width:680px;width:min(100%,680px);box-shadow:0 18px 50px rgba(0,0,0,.25)}",
      ".sieweczka-help-card h3{margin-top:0}",
      ".sieweczka-help-card button{margin-top:.75rem;background:var(--primary,#0f766e);color:#fff;border:0;border-radius:10px;padding:.5rem .8rem;font-weight:800}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function setTopNavigation() {
    const formHead = $("#form-screen .screen-head");
    if (!formHead) return;
    const backHome = formHead.querySelector(".back-home");
    if (backHome) {
      backHome.textContent = "Początek";
      backHome.title = "Przejdź do pierwszej karty formularza";
    }
    let end = $("#form-jump-end");
    if (end) {
      end.textContent = "Koniec";
      end.title = "Przejdź do podsumowania i zapisu";
    }
    const auto = $("#autosave-status");
    if (auto) auto.remove();
  }

  function clearFormToFreshSheet() {
    const form = $("#entry-form");
    if (!form) return;
    $$('input, select, textarea', form).forEach((el) => {
      if (el.type === "file") {
        try { el.value = ""; } catch (_) {}
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (el.type === "hidden" || el.tagName === "SELECT") {
        const defaults = {
          "species":"unknown", "nest-status":"unknown", "possible-renest":"unknown",
          "doc-photo-done":"unknown", "nest-one-m-photo-done":"unknown", "random-point-done":"unknown",
          "nest-substrate":"sand", "nest-slope":"flat", "nest-microrelief":"flat",
          "random-rerolled":"no", "random-reroll-reason":"none", "random-substrate":"sand",
          "random-slope":"flat", "random-microrelief":"flat", "meso-assessment-method":"unknown",
          "meso-big-objects":"unknown", "qc-bird-reaction":"weak", "qc-time-at-nest":"lt1",
          "qc-aborted":"no", "qc-tracks":"no"
        };
        el.value = Object.prototype.hasOwnProperty.call(defaults, el.id) ? defaults[el.id] : "";
      } else if (/^nest-pct-|^random-pct-|^pct-/.test(el.id || "")) {
        el.value = "0";
      } else if (el.id === "season") {
        el.value = String(new Date().getFullYear());
      } else if (el.id === "obs-date") {
        el.value = new Date().toISOString().slice(0, 10);
      } else if (el.id === "obs-time") {
        el.value = new Date().toTimeString().slice(0, 5);
      } else {
        el.value = "";
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    $$(".photo-preview").forEach((el) => { el.innerHTML = ""; });
    $$(".tile-group").forEach((group) => {
      const target = document.getElementById(group.dataset.target || "");
      if (!target) return;
      $$(".tile", group).forEach((tile) => tile.classList.toggle("selected", tile.dataset.value === target.value));
    });
    const back = $("#step-back");
    let guard = 0;
    while (back && !back.disabled && guard < 10) { back.click(); guard += 1; }
  }

  function updateDraftButtonVisibility() {
    const resume = $("#resume-draft");
    if (resume) resume.hidden = !hasDraft();
  }

  function setupDraftButtons() {
    const start = $("#start-new");
    if (!start) return;
    let resume = $("#resume-draft");
    if (!resume) {
      resume = document.createElement("button");
      resume.id = "resume-draft";
      resume.type = "button";
      resume.className = "big";
      resume.textContent = "Wróć do szkicu";
      start.insertAdjacentElement("afterend", resume);
    }
    updateDraftButtonVisibility();

    if (start.dataset.v11FreshStart !== "1") {
      start.dataset.v11FreshStart = "1";
      start.addEventListener("click", () => {
        if (resumeDraftPending) return;
        setTimeout(clearFormToFreshSheet, 260);
        setTimeout(() => { setTopNavigation(); updateDraftButtonVisibility(); }, 360);
      }, true);
    }

    if (resume.dataset.v11ResumeDraft !== "1") {
      resume.dataset.v11ResumeDraft = "1";
      resume.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        resumeDraftPending = true;
        start.click();
        setTimeout(() => { resumeDraftPending = false; }, 700);
      }, true);
    }
  }

  function openPhotoViewer(src) {
    if (!src) return;
    const old = $(".sieweczka-photo-modal");
    if (old) old.remove();
    lastPhotoScale = 1;
    const modal = document.createElement("div");
    modal.className = "sieweczka-photo-modal";
    modal.innerHTML = '<div class="sieweczka-photo-toolbar"><strong>Podgląd zdjęcia</strong><div class="tools"><button type="button" data-action="minus">−</button><button type="button" data-action="reset">100%</button><button type="button" data-action="plus">+</button><button type="button" data-action="close">Zamknij</button></div></div><div class="sieweczka-photo-stage"><img alt="Podgląd zdjęcia" /></div>';
    modal.querySelector("img").src = src;
    function applyScale() { modal.querySelector("img").style.transform = "scale(" + lastPhotoScale + ")"; }
    modal.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "close") modal.remove();
      if (action === "plus") { lastPhotoScale = Math.min(5, lastPhotoScale + 0.25); applyScale(); }
      if (action === "minus") { lastPhotoScale = Math.max(0.5, lastPhotoScale - 0.25); applyScale(); }
      if (action === "reset") { lastPhotoScale = 1; applyScale(); }
    });
    modal.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      lastPhotoScale = Math.max(0.5, Math.min(5, lastPhotoScale + (event.deltaY < 0 ? 0.2 : -0.2)));
      applyScale();
    }, { passive: false });
    document.body.appendChild(modal);
  }

  function setupPhotoViewer() {
    if (document.body.dataset.v11PhotoViewer === "1") return;
    document.body.dataset.v11PhotoViewer = "1";
    document.addEventListener("click", (event) => {
      const img = event.target.closest(".photo-preview img");
      if (!img) return;
      event.preventDefault();
      openPhotoViewer(img.currentSrc || img.src);
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const modal = $(".sieweczka-photo-modal");
        if (modal) modal.remove();
      }
    });
  }

  function showHelpPanel(title, body) {
    const old = $(".sieweczka-help-panel");
    if (old) old.remove();
    const panel = document.createElement("div");
    panel.className = "sieweczka-help-panel";
    panel.innerHTML = '<div class="sieweczka-help-card"><h3></h3><p></p><button type="button">Zamknij</button></div>';
    panel.querySelector("h3").textContent = title;
    panel.querySelector("p").textContent = body;
    panel.addEventListener("click", (event) => {
      if (event.target === panel || event.target.tagName === "BUTTON") panel.remove();
    });
    document.body.appendChild(panel);
  }

  function setupPhotoHelp() {
    const text = "Zdjęcie wykonuj pionowo z góry. Trzymaj telefon tak, aby w kadrze mieściła się cała ramka lub cały kwadrat pomiarowy 1 × 1 m. Staraj się objąć ramkę równo, bez ucinania boków, podobnie przy gnieździe i przy punkcie losowym.";
    $$(".photo-guidance").forEach((el) => { el.hidden = true; el.style.display = "none"; });
    ["nest-photos", "random-photos"].forEach((id) => {
      const input = document.getElementById(id);
      const label = input ? input.closest("label") : null;
      if (!label || label.dataset.v11PhotoHelp === "1") return;
      label.dataset.v11PhotoHelp = "1";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sieweczka-help-btn";
      btn.textContent = "?";
      btn.title = "Jak wykonać zdjęcie";
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showHelpPanel("Jak wykonać zdjęcie", text);
      });
      const span = label.querySelector("span") || label;
      span.appendChild(btn);
    });
  }

  function bootSafeFixes() {
    injectSafeStyles();
    setTopNavigation();
    setupDraftButtons();
    setupPhotoViewer();
    setupPhotoHelp();
    updateDraftButtonVisibility();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootSafeFixes);
  else bootSafeFixes();
  setTimeout(bootSafeFixes, 500);
  setTimeout(bootSafeFixes, 1500);
  setInterval(() => { setTopNavigation(); updateDraftButtonVisibility(); setupPhotoHelp(); }, 3000);
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
  return new Response(await response.clone().text(), {
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
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("sieweczka-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (url.pathname.endsWith("/data/grid_vanvan_wgs84.geojson") || url.pathname.endsWith("data/grid_vanvan_wgs84.geojson")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || new Response("Grid offline", { status: 503, statusText: "Offline" })))
    );
    return;
  }
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
