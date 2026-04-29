const STORAGE_KEY = "sieweczka-field-data-v2";
const DRAFT_KEY = "sieweczka-field-draft-v1";
const PHOTO_DB = "sieweczka-photo-db";
const PHOTO_STORE = "photos";
const photoUrlCache = new Map();

const form = document.querySelector("#entry-form");
const entriesList = document.querySelector("#entries-list");
const entryCount = document.querySelector("#entry-count");
const template = document.querySelector("#entry-item-template");
const gpsBtn = document.querySelector("#gps-btn");
const gpsStatus = document.querySelector("#gps-status");
const randomAzimuthBtn = document.querySelector("#random-azimuth-btn");
const randomGpsBtn = document.querySelector("#random-gps-btn");
const randomGpsStatus = document.querySelector("#random-gps-status");

const menuToggle = document.querySelector("#menu-toggle");
const menu = document.querySelector("#app-menu");
const menuOverlay = document.querySelector("#menu-overlay");
const installBtn = document.querySelector("#install-app");
const installHint = document.querySelector("#install-hint");
const header = document.querySelector("#app-header");

const openSheetBtn = null;
const openSheetInlineBtn = document.querySelector("#open-sheet-inline");
const sheetPanel = document.querySelector("#sheet-panel");
const sheetTableBody = document.querySelector("#sheet-table tbody");
const sheetSaveBtn = document.querySelector("#sheet-save");
const sheetCloseBtn = document.querySelector("#sheet-close");
const editBanner = document.querySelector("#edit-banner");
const editRecordLabel = document.querySelector("#edit-record-label");
const cancelEditBtn = document.querySelector("#cancel-edit");
const recordSearchInput = document.querySelector("#record-search");
const sheetAddBtn = document.querySelector("#sheet-add");
const scrollTopBtn = document.querySelector("#scroll-top");

const PERCENT_IDS = [
  "nest-pct-sand","nest-pct-fine-gravel","nest-pct-coarse","nest-pct-shells","nest-pct-live-veg","nest-pct-dry-veg","nest-pct-organic","nest-pct-anthro",
  "random-pct-sand","random-pct-fine-gravel","random-pct-coarse","random-pct-shells","random-pct-live-veg","random-pct-dry-veg","random-pct-organic","random-pct-anthro",
  "pct-sand","pct-gravel","pct-vegetation","pct-water"
];

const speciesLabel = {
  "charadrius-hiaticula": "Sieweczka obrożna",
  "charadrius-dubius": "Sieweczka rzeczna",
  unknown: "Nieokreślony",
};

const statusLabel = { fresh: "Świeże", incubated: "Inkubowane", unknown: "Nieznany" };
const yesNoLabel = { no: "Nie", yes: "Tak", uncertain: "Niepewne" };
const slopeLabel = { flat: "Płasko", slight: "Lekki spadek", moderate: "Umiarkowany spadek", steep: "Wyraźny spadek" };
const substrateLabel = {
  sand: "Piasek",
  "fine-gravel": "Drobny żwir",
  "coarse-gravel": "Grubszy żwir / otoczaki",
  shells: "Muszle",
  mixed: "Mieszane",
};

let deferredInstallPrompt = null;
let lastScrollY = 0;
let editingUid = null;

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

async function savePhotoFile(file) {
  const db = await openPhotoDb();
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(file, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return `idb:${id}`;
}

async function resolvePhotoSrc(ref) {
  if (!ref) return "";
  if (String(ref).startsWith("data:")) return ref;
  if (!String(ref).startsWith("idb:")) return "";
  if (photoUrlCache.has(ref)) return photoUrlCache.get(ref);
  const id = String(ref).slice(4);
  const db = await openPhotoDb();
  const blob = await new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const req = tx.objectStore(PHOTO_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  photoUrlCache.set(ref, url);
  return url;
}


async function saveDataUrlToIdb(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return savePhotoFile(new File([blob], `legacy-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" }));
}

async function migrateLegacyDataUrlsToIdb() {
  const entries = getEntries();
  let changed = false;

  for (const entry of entries) {
    const convertList = async (arr = []) => {
      const next = [];
      for (const ref of arr) {
        if (typeof ref === "string" && ref.startsWith("data:")) {
          try {
            next.push(await saveDataUrlToIdb(ref));
            changed = true;
          } catch {
            next.push(ref);
          }
        } else {
          next.push(ref);
        }
      }
      return next;
    };

    entry.nestMicro = entry.nestMicro || {};
    entry.randomMicro = entry.randomMicro || {};
    entry.nestMicro.photos = await convertList(entry.nestMicro.photos || []);
    entry.randomMicro.photos = await convertList(entry.randomMicro.photos || []);
  }

  if (changed) setEntries(entries);
}

setDefaultDateTime();
renderEntries();
registerServiceWorker();
setupInstallFlow();
setupMenu();
setupHeaderAutoHide();

setupRecordBrowser();
setupFieldHelp();
setupPercentControls();

migrateLegacyDataUrlsToIdb();

randomAzimuthBtn?.addEventListener("click", () => {
  const value = Math.floor(Math.random() * 360);
  document.querySelector("#random-azimuth").value = String(value);
});

randomGpsBtn?.addEventListener("click", () => {
  if (!navigator.geolocation) {
    randomGpsStatus.textContent = "GPS kontrolny: niedostępny";
    return;
  }
  randomGpsStatus.textContent = "GPS kontrolny: pobieranie...";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      document.querySelector("#random-lat").value = coords.latitude.toFixed(6);
      document.querySelector("#random-lon").value = coords.longitude.toFixed(6);
      randomGpsStatus.textContent = `GPS kontrolny: dokładność ±${Math.round(coords.accuracy)} m`;
    },
    () => {
      randomGpsStatus.textContent = "GPS kontrolny: błąd pobierania";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});



function setupRecordBrowser() {
  if (recordSearchInput) {
    recordSearchInput.addEventListener("input", () => renderEntries(recordSearchInput.value));
  }
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", () => clearEditMode());
  }
}

function clearEditMode() {
  editingUid = null;
  form.reset();
  setDefaultDateTime();
  gpsStatus.textContent = "GPS: brak";
  randomGpsStatus.textContent = "GPS kontrolny: brak";
  editBanner.hidden = true;
}

function loadRecordToForm(record) {
  editingUid = record.uid;
  editRecordLabel.textContent = `${record.nestId} (${record.obsDate})`;
  editBanner.hidden = false;
  const setVal = (id, v) => { const el = document.querySelector(id); if (el) el.value = v ?? ""; };

  setVal("#nest-id", record.nestId);
  setVal("#species", record.species || "unknown");
  setVal("#obs-date", record.obsDate);
  setVal("#obs-time", record.obsTime);
  setVal("#sector", record.sector);
  setVal("#lat", record.lat);
  setVal("#lon", record.lon);
  setVal("#egg-count", record.eggCount);
  setVal("#nest-status", record.nestStatus || "unknown");
  setVal("#possible-renest", record.possibleRenest || "uncertain");

  setVal("#nest-substrate", record.nestMicro?.substrate);
  setVal("#nest-dist-plant", record.nestMicro?.distPlantM);
  setVal("#nest-height-plant", record.nestMicro?.heightPlantCm);
  setVal("#nest-dist-object", record.nestMicro?.distObjectM);
  setVal("#nest-height-object", record.nestMicro?.heightObjectCm);
  setVal("#nest-slope", record.nestMicro?.slope);
  setVal("#nest-pct-sand", record.nestMicro?.coverage?.pctSand);
  setVal("#nest-pct-fine-gravel", record.nestMicro?.coverage?.pctFineGravel);
  setVal("#nest-pct-coarse", record.nestMicro?.coverage?.pctCoarse);
  setVal("#nest-pct-shells", record.nestMicro?.coverage?.pctShells);
  setVal("#nest-pct-live-veg", record.nestMicro?.coverage?.pctLiveVeg);
  setVal("#nest-pct-dry-veg", record.nestMicro?.coverage?.pctDryVeg);
  setVal("#nest-pct-organic", record.nestMicro?.coverage?.pctOrganic);
  setVal("#nest-pct-anthro", record.nestMicro?.coverage?.pctAnthro);

  setVal("#random-azimuth", record.randomMicro?.azimuthDeg);
  setVal("#random-lat", record.randomMicro?.lat);
  setVal("#random-lon", record.randomMicro?.lon);
  setVal("#random-substrate", record.randomMicro?.substrate);
  setVal("#random-dist-plant", record.randomMicro?.distPlantM);
  setVal("#random-height-plant", record.randomMicro?.heightPlantCm);
  setVal("#random-dist-object", record.randomMicro?.distObjectM);
  setVal("#random-height-object", record.randomMicro?.heightObjectCm);
  setVal("#random-slope", record.randomMicro?.slope);
  setVal("#random-pct-sand", record.randomMicro?.coverage?.pctSand);
  setVal("#random-pct-fine-gravel", record.randomMicro?.coverage?.pctFineGravel);
  setVal("#random-pct-coarse", record.randomMicro?.coverage?.pctCoarse);
  setVal("#random-pct-shells", record.randomMicro?.coverage?.pctShells);
  setVal("#random-pct-live-veg", record.randomMicro?.coverage?.pctLiveVeg);
  setVal("#random-pct-dry-veg", record.randomMicro?.coverage?.pctDryVeg);
  setVal("#random-pct-organic", record.randomMicro?.coverage?.pctOrganic);
  setVal("#random-pct-anthro", record.randomMicro?.coverage?.pctAnthro);

  setVal("#pct-sand", record.meso?.pctSand);
  setVal("#pct-gravel", record.meso?.pctGravel);
  setVal("#pct-vegetation", record.meso?.pctVegetation);
  setVal("#pct-water", record.meso?.pctWater);
  setVal("#meso-big-objects", record.meso?.bigObjects);
  setVal("#dist-water", record.meso?.distWaterM);
  setVal("#dist-veg-edge", record.meso?.distVegEdgeM);
  setVal("#dist-vertical-structure", record.meso?.distVerticalStructureM);
  setVal("#dist-fine-gravel-patch", record.meso?.distFineGravelPatchM);
  setVal("#dist-coarse-gravel-patch", record.meso?.distCoarseGravelPatchM);
  setVal("#dist-nearest-hiaticula", record.meso?.distNearestHiaticulaM);
  setVal("#dist-nearest-dubius", record.meso?.distNearestDubiusM);

  setVal("#notes", record.notes);
  setVal("#notes-identification", record.moduleNotes?.identification);
  setVal("#notes-nest-micro", record.moduleNotes?.nestMicro);
  setVal("#notes-random-micro", record.moduleNotes?.randomMicro);
  setVal("#notes-meso", record.moduleNotes?.meso);
  setVal("#qc-bird-reaction", record.qualityControl?.birdReaction);
  setVal("#qc-time-at-nest", record.qualityControl?.timeAtNest);
  setVal("#qc-aborted", record.qualityControl?.aborted);
  setVal("#qc-tracks", record.qualityControl?.tracksVisible);
  setVal("#qc-tracks-notes", record.qualityControl?.tracksNotes);
}

function numberInput(id) {
  return Number(document.querySelector(id).value);
}

function optionalNumberInput(id) {
  const raw = document.querySelector(id).value;
  if (raw === "" || raw == null) return null;
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
}

function readCoverage(prefix) {
  return {
    pctSand: numberInput(`#${prefix}-pct-sand`),
    pctFineGravel: numberInput(`#${prefix}-pct-fine-gravel`),
    pctCoarse: numberInput(`#${prefix}-pct-coarse`),
    pctShells: numberInput(`#${prefix}-pct-shells`),
    pctLiveVeg: numberInput(`#${prefix}-pct-live-veg`),
    pctDryVeg: numberInput(`#${prefix}-pct-dry-veg`),
    pctOrganic: numberInput(`#${prefix}-pct-organic`),
    pctAnthro: numberInput(`#${prefix}-pct-anthro`),
  };
}

function sumCoverage(cov) {
  return (
    cov.pctSand +
    cov.pctFineGravel +
    cov.pctCoarse +
    cov.pctShells +
    cov.pctLiveVeg +
    cov.pctDryVeg +
    cov.pctOrganic +
    cov.pctAnthro
  );
}

function setupPercentControls() {
  document.querySelectorAll('.pct-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.querySelector(`#${btn.dataset.id}`);
      if (!input) return;
      const delta = Number(btn.dataset.delta || 0);
      const group = percentGroupByInputId(btn.dataset.id);
      const current = Number(input.value) || 0;
      let next = Math.max(0, Math.min(100, current + delta));
      if (delta > 0 && group) {
        const remaining = 100 - groupSum(group.ids) + current;
        next = Math.min(next, remaining);
      }
      input.value = String(Math.max(0, Math.min(100, next)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

function setupInstallFlow() {
  installBtn.disabled = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installBtn.disabled = false;
    if (installHint) installHint.textContent = "Aplikacja gotowa do instalacji — użyj menu ☰ i kliknij 'Zainstaluj aplikację'.";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installBtn.disabled = true;
    if (installHint) installHint.textContent = "Aplikacja została zainstalowana na telefonie.";
  });

  installBtn.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installBtn.disabled = true;
      closeMenu();
      return;
    }

    alert(
      "Na iPhone zainstaluj ręcznie: Udostępnij → Dodaj do ekranu początkowego.\n\n" +
        "Na Androidzie, jeśli brak promptu, użyj menu Chrome (⋮) → Zainstaluj aplikację."
    );
  });
}

function setupMenu() {
  menuToggle.addEventListener("click", () => (menu.classList.contains("open") ? closeMenu() : openMenu()));
  menuOverlay.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}

function openMenu() {
  menu.classList.add("open");
  menu.setAttribute("aria-hidden", "false");
  menuOverlay.hidden = false;
}

function closeMenu() {
  menu.classList.remove("open");
  menu.setAttribute("aria-hidden", "true");
  menuOverlay.hidden = true;
}

function setupHeaderAutoHide() {
  window.addEventListener(
    "scroll",
    () => {
      const current = window.scrollY;
      if (current > lastScrollY && current > 80) {
        header.classList.add("header-hidden");
        closeMenu();
      } else {
        header.classList.remove("header-hidden");
      }
      lastScrollY = current;
    },
    { passive: true }
  );
}

function setDefaultDateTime() {
  const now = new Date();
  document.querySelector("#obs-date").value = now.toISOString().slice(0, 10);
  document.querySelector("#obs-time").value = now.toTimeString().slice(0, 5);
}

function normalizeEntries(entries) {
  return entries.map((entry) => ({
    ...entry,
    uid: entry.uid || `${entry.nestId || "rec"}-${entry.createdAt || Date.now()}-${Math.random().toString(16).slice(2)}`,
  }));
}

function getEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return normalizeEntries(parsed);
  } catch {
    return [];
  }
}

function setEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeEntries(entries)));
    return true;
  } catch (error) {
    alert("Nie udało się zapisać danych (pamięć telefonu jest pełna). Zmniejsz liczbę/rozmiar zdjęć i spróbuj ponownie.");
    return false;
  }
}

async function filesToPhotoRefs(fileList, maxFiles = 4) {
  const files = Array.from(fileList).slice(0, maxFiles);
  const refs = [];
  for (const file of files) {
    try {
      refs.push(await savePhotoFile(file));
    } catch (error) {
      alert(`Nie udało się zapisać zdjęcia: ${file.name}. Zwolnij pamięć w telefonie lub usuń część zdjęć.`);
      throw error;
    }
  }
  return refs;
}

function validatePercentages(record) {
  const mesoTotal = record.meso.pctSand + record.meso.pctGravel + record.meso.pctVegetation + record.meso.pctWater;
  const nestCoverTotal = sumCoverage(record.nestMicro.coverage);
  const randomCoverTotal = sumCoverage(record.randomMicro.coverage);

  if (mesoTotal > 100) {
    alert("Suma % dla mezohabitatu nie może przekraczać 100.");
    return false;
  }
  if (nestCoverTotal > 100 || randomCoverTotal > 100) {
    alert("Suma 8 kategorii pokrycia na zdjęciu 1 m² nie może przekraczać 100.");
    return false;
  }
  return true;
}

function renderEntries(searchTerm = "") {
  const entries = getEntries();
  entryCount.textContent = String(entries.length);
  entriesList.innerHTML = "";

  const query = String(recordSearchInput?.value || "").trim().toLowerCase();
  const visible = !query ? entries : entries.filter((entry) => {
    const hay = `${entry.nestId || ""} ${entry.sector || ""} ${speciesLabel[entry.species] || entry.species || ""}`.toLowerCase();
    return hay.includes(query);
  });

  for (const entry of visible) {
    const item = template.content.cloneNode(true);
    item.querySelector(".entry-id").textContent = entry.nestId;
    item.querySelector(".species").textContent = speciesLabel[entry.species] || entry.species;
    item.querySelector(".status").textContent = statusLabel[entry.nestStatus] || entry.nestStatus;
    item.querySelector(".meta").textContent = `${entry.obsDate} ${entry.obsTime} • ${entry.sector} • jaja: ${entry.eggCount} • renest: ${yesNoLabel[entry.possibleRenest]}`;
    const c=item.querySelector('.coords'); if(c) c.textContent = `${(entry.lat??0).toFixed(6)}, ${(entry.lon??0).toFixed(6)}`;

    const notesCount = Object.values(entry.moduleNotes || {}).filter(Boolean).length;
    item.querySelector(".summary").textContent =
      `Mikro(gniazdo): ${substrateLabel[entry.nestMicro.substrate]}, osłona ${entry.nestMicro.distObjectM} m.` +
      ` Mikro(punkt losowy): azymut ${entry.randomMicro.azimuthDeg}°, ${substrateLabel[entry.randomMicro.substrate]}.` +
      ` Mezo: piasek ${entry.meso.pctSand}%, żwir ${entry.meso.pctGravel}%, roślinność ${entry.meso.pctVegetation}%, woda ${entry.meso.pctWater}%.` +
      ` Notatki modułów: ${notesCount}.`;

    const photoWrap = item.querySelector(".photos");
    const allPhotos = [...entry.nestMicro.photos, ...entry.randomMicro.photos];
    if (allPhotos.length) {
      for (const photo of allPhotos) {
        const img = document.createElement("img");
        img.alt = `Zdjęcie dla gniazda ${entry.nestId}`;
        photoWrap.appendChild(img);
        resolvePhotoSrc(photo).then((src) => { if (src) img.src = src; });
      }
    } else {
      photoWrap.textContent = "Brak zdjęć.";
    }

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edytuj rekord";
    editBtn.addEventListener("click", () => {
      loadRecordToForm(entry);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    item.querySelector("details").before(editBtn);

    entriesList.appendChild(item);
  }
}

form?.addEventListener("submit", (event) => event.preventDefault());


function getVal(id){ return document.querySelector(id)?.value ?? ""; }
async function buildRecord(){
  const entries = getEntries();
  const existingRecord = editingUid ? entries.find((r) => String(r.uid) === String(editingUid)) : null;
  const newNestPhotos = await filesToPhotoRefs(document.querySelector("#nest-photos")?.files || [], 4);
  const newRandomPhotos = await filesToPhotoRefs(document.querySelector("#random-photos")?.files || [], 4);
  return {
    protocolVersion: "field-sheet-v4",
    nestId: getVal("#nest-id").trim(), season: getVal("#season").trim(), observer: getVal("#observer").trim(),
    species: getVal("#species") || "unknown", obsDate: getVal("#obs-date"), obsTime: getVal("#obs-time"), sector: getVal("#sector").trim(),
    lat: optionalNumberInput("#lat"), lon: optionalNumberInput("#lon"), eggCount: (getVal("#egg-count")==='5'?5:Number(getVal("#egg-count"))),
    nestStatus: getVal("#nest-status"), possibleRenest: getVal("#possible-renest"), docPhotoDone: "unknown", nestOneMPhotoDone:"unknown", randomPointDone:"unknown",
    nestMicro:{photos:newNestPhotos.length?newNestPhotos:(existingRecord?.nestMicro?.photos||[]),substrate:getVal("#nest-substrate"),coverage:readCoverage("nest"),distPlantCm:optionalNumberInput("#nest-dist-plant"),heightPlantCm:optionalNumberInput("#nest-height-plant"),distObjectCm:optionalNumberInput("#nest-dist-object"),heightObjectCm:optionalNumberInput("#nest-height-object"),slope:getVal("#nest-slope"),microrelief:getVal("#nest-microrelief")||"unknown"},
    randomMicro:{azimuthDeg:optionalNumberInput("#random-azimuth"),wasRerolled:getVal("#random-rerolled")||"unknown",rerollReason:getVal("#random-reroll-reason")||"",lat:optionalNumberInput("#random-lat"),lon:optionalNumberInput("#random-lon"),photos:newRandomPhotos.length?newRandomPhotos:(existingRecord?.randomMicro?.photos||[]),substrate:getVal("#random-substrate"),coverage:readCoverage("random"),distPlantCm:optionalNumberInput("#random-dist-plant"),heightPlantCm:optionalNumberInput("#random-height-plant"),distObjectCm:optionalNumberInput("#random-dist-object"),heightObjectCm:optionalNumberInput("#random-height-object"),slope:getVal("#random-slope"),microrelief:getVal("#random-microrelief")||"unknown"},
    meso:{pctSand:optionalNumberInput("#pct-sand")||0,pctGravel:optionalNumberInput("#pct-gravel")||0,pctVegetation:optionalNumberInput("#pct-vegetation")||0,pctWater:optionalNumberInput("#pct-water")||0,pctOther:optionalNumberInput("#pct-other")||0,assessmentMethod:getVal("#meso-assessment-method")||"",bigObjects:getVal("#meso-big-objects"),distWaterM:optionalNumberInput("#dist-water"),distVegEdgeM:optionalNumberInput("#dist-veg-edge"),distVerticalStructureM:optionalNumberInput("#dist-vertical-structure"),distFineGravelPatchM:optionalNumberInput("#dist-fine-gravel-patch"),distCoarseGravelPatchM:optionalNumberInput("#dist-coarse-gravel-patch"),distNearestHiaticulaM:optionalNumberInput("#dist-nearest-hiaticula"),distNearestDubiusM:optionalNumberInput("#dist-nearest-dubius"),spatialNotes:getVal("#notes-meso").trim()},
    qualityControl:{birdReaction:getVal("#qc-bird-reaction"),timeAtNest:getVal("#qc-time-at-nest"),aborted:getVal("#qc-aborted"),tracksVisible:getVal("#qc-tracks"),tracksNotes:getVal("#qc-tracks-notes").trim()},
    moduleNotes:{identification:getVal("#notes-identification").trim(),nestMicro:getVal("#notes-nest-micro").trim(),randomMicro:getVal("#notes-random-micro").trim(),meso:getVal("#notes-meso").trim()},
    notes:getVal("#notes").trim(), uid: editingUid || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`), createdAt: new Date().toISOString()
  };
}
function validateRecord(record){const e=[]; const req=[[1,'nestId','ID gniazda'],[1,'obsDate','data'],[1,'obsTime','godzina'],[1,'observer','obserwator'],[1,'species','gatunek'],[1,'sector','sektor'],[2,'lat','GPS gniazda'],[2,'lon','GPS gniazda'],[1,'eggCount','liczba jaj'],[1,'nestStatus','status gniazda'],[1,'possibleRenest','renest'],[4,'randomMicro.azimuthDeg','azymut'],[6,'qualityControl.birdReaction','kontrola jakości']];
for(const [step,key,msg] of req){ const v=key.split('.').reduce((a,k)=>a?.[k],record); if(v===''||v==null||Number.isNaN(v)) e.push({step,fieldId:key,message:`Brakuje: ${msg}`}); }
if(sumCoverage(record.nestMicro.coverage)!==100)e.push({step:3,fieldId:'nest-pct-sand',message:'Mikrohabitat gniazda musi dawać 100%'});
if(sumCoverage(record.randomMicro.coverage)!==100)e.push({step:5,fieldId:'random-pct-sand',message:'Mikrohabitat punktu losowego musi dawać 100%'});
if((record.meso.pctSand+record.meso.pctGravel+record.meso.pctVegetation+record.meso.pctWater+record.meso.pctOther)!==100)e.push({step:6,fieldId:'pct-sand',message:'Mezohabitat musi dawać 100%'});
return e;}
function renderValidationList(errors=[]){const div=document.querySelector('#validation-list'); if(!div) return; if(!errors.length){div.innerHTML='<p>Brak krytycznych braków. Możesz zapisać rekord.</p>';return;} div.innerHTML=errors.map((x,i)=>`<div class="val-item">${i+1}. ${x.message} <button type="button" data-step="${x.step}">Przejdź</button></div>`).join(''); div.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>showStep(Number(b.dataset.step))));}
async function saveFinalRecord(){try{ const record=await buildRecord(); const errors=validateRecord(record); renderValidationList(errors); if(errors.length){showStep(8); return;} const entries=getEntries(); const idx=entries.findIndex((r)=>String(r.uid)===String(record.uid)); if(idx>=0) entries[idx]=record; else entries.unshift(record); if(!setEntries(entries)){alert('Nie udało się zapisać rekordu.'); return;} localStorage.removeItem(DRAFT_KEY); clearEditMode(); form?.reset(); setDefaultDateTime(); showStep(1); alert('Rekord zapisany'); renderEntries(recordSearchInput?.value||''); updateCounts(); document.querySelector('#form-screen').hidden=true; document.querySelector('#records-screen').hidden=false; document.querySelector('#home-screen').hidden=true;}catch(err){alert(`Zapis nie powiódł się: ${err?.message||'błąd'}`);}}
function saveDraft(){buildRecord().then((r)=>{localStorage.setItem(DRAFT_KEY,JSON.stringify(r)); alert('Szkic zapisany');}).catch(()=>alert('Nie udało się zapisać szkicu.'));}
gpsBtn?.addEventListener("click", () => {
  if (!navigator.geolocation) {
    gpsStatus.textContent = "GPS: niedostępny";
    return;
  }
  gpsStatus.textContent = "GPS: pobieranie...";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      document.querySelector("#lat").value = coords.latitude.toFixed(6);
      document.querySelector("#lon").value = coords.longitude.toFixed(6);
      gpsStatus.textContent = `GPS: dokładność ±${Math.round(coords.accuracy)} m`;
    },
    () => {
      gpsStatus.textContent = "GPS: błąd pobierania";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});



function setupSheetEditor() {
  const openSheet = () => {
    renderSheetEditor();
    sheetPanel.hidden = false;
    closeMenu();
  };

  if (openSheetInlineBtn) openSheetInlineBtn.addEventListener("click", openSheet);
  if (sheetAddBtn) sheetAddBtn.addEventListener("click", () => {
    sheetPanel.hidden = true;
    clearEditMode();
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelector("#nest-id")?.focus();
  });

  sheetCloseBtn.addEventListener("click", () => {
    sheetPanel.hidden = true;
  });

  sheetTableBody.addEventListener("click", (event) => {
    const btn = event.target.closest(".sheet-delete");
    if (!btn) return;
    const uid = btn.dataset.uid;
    const records = getEntries();
    const target = records.find((r) => String(r.uid) === String(uid));
    if (!target) return;
    if (!confirm(`Usunąć rekord ${target.nestId}?`)) return;
    if (!setEntries(records.filter((r) => String(r.uid) !== String(uid)))) return;
    renderEntries(recordSearchInput?.value || "");
    renderSheetEditor();
  });

  sheetSaveBtn.addEventListener("click", async () => {
    const rows = Array.from(sheetTableBody.querySelectorAll("tr"));
    const current = getEntries();
    const byUid = new Map(current.map((r) => [String(r.uid), r]));

    for (const row of rows) {
      const uid = row.dataset.uid;
      const target = byUid.get(uid);
      if (!target) continue;
      target.nestId = row.querySelector('[data-col="nestId"]').value.trim();
      target.species = row.querySelector('[data-col="species"]').value;
      target.obsDate = row.querySelector('[data-col="obsDate"]').value;
      target.obsTime = row.querySelector('[data-col="obsTime"]').value;
      target.sector = row.querySelector('[data-col="sector"]').value.trim();
      target.lat = Number(row.querySelector('[data-col="lat"]').value);
      target.lon = Number(row.querySelector('[data-col="lon"]').value);
      target.eggCount = Number(row.querySelector('[data-col="eggCount"]').value);
      target.nestStatus = row.querySelector('[data-col="nestStatus"]').value;
      target.notes = row.querySelector('[data-col="notes"]').value;

      const nestUploadInput = row.querySelector('[data-col="nestPhotosUpload"]');
      const randomUploadInput = row.querySelector('[data-col="randomPhotosUpload"]');
      let newNestPhotos = [];
      let newRandomPhotos = [];
      try {
        newNestPhotos = nestUploadInput ? await filesToPhotoRefs(nestUploadInput.files, 4) : [];
        newRandomPhotos = randomUploadInput ? await filesToPhotoRefs(randomUploadInput.files, 4) : [];
      } catch {
        return;
      }
      if (!target.nestMicro) target.nestMicro = {};
      if (!target.randomMicro) target.randomMicro = {};
      target.nestMicro.photos = newNestPhotos.length ? newNestPhotos : (target.nestMicro.photos || []);
      target.randomMicro.photos = newRandomPhotos.length ? newRandomPhotos : (target.randomMicro.photos || []);

      target.qualityControl = target.qualityControl || {};
      target.qualityControl.birdReaction = row.querySelector('[data-col="qcBirdReaction"]').value;
      target.qualityControl.timeAtNest = row.querySelector('[data-col="qcTimeAtNest"]').value;
      target.qualityControl.aborted = row.querySelector('[data-col="qcAborted"]').value;
      target.qualityControl.tracksVisible = row.querySelector('[data-col="qcTracksVisible"]').value;
    }

    if (!setEntries(Array.from(byUid.values()))) return;
    renderEntries(recordSearchInput?.value || "");
    sheetPanel.hidden = true;
  });
}

function renderSheetEditor() {
  const entries = getEntries();
  sheetTableBody.innerHTML = "";

  const query = String(recordSearchInput?.value || "").trim().toLowerCase();
  const visible = !query ? entries : entries.filter((entry) => {
    const hay = `${entry.nestId || ""} ${entry.sector || ""} ${speciesLabel[entry.species] || entry.species || ""}`.toLowerCase();
    return hay.includes(query);
  });

  for (const entry of visible) {
    const tr = document.createElement("tr");
    tr.dataset.uid = String(entry.uid);
    tr.innerHTML = `
      <td>${entry.uid}</td>
      <td><input data-col="nestId" value="${entry.nestId || ""}" /></td>
      <td>
        <select data-col="species">
          <option value="charadrius-hiaticula" ${entry.species === "charadrius-hiaticula" ? "selected" : ""}>obrożna</option>
          <option value="charadrius-dubius" ${entry.species === "charadrius-dubius" ? "selected" : ""}>rzeczna</option>
          <option value="unknown" ${entry.species === "unknown" ? "selected" : ""}>unknown</option>
        </select>
      </td>
      <td><input data-col="obsDate" type="date" value="${entry.obsDate || ""}" /></td>
      <td><input data-col="obsTime" type="time" value="${entry.obsTime || ""}" /></td>
      <td><input data-col="sector" value="${entry.sector || ""}" /></td>
      <td><input data-col="lat" type="number" step="0.000001" value="${entry.lat ?? ""}" /></td>
      <td><input data-col="lon" type="number" step="0.000001" value="${entry.lon ?? ""}" /></td>
      <td><input data-col="eggCount" type="number" value="${entry.eggCount ?? ""}" /></td>
      <td>
        <select data-col="nestStatus">
          <option value="fresh" ${entry.nestStatus === "fresh" ? "selected" : ""}>fresh</option>
          <option value="incubated" ${entry.nestStatus === "incubated" ? "selected" : ""}>incubated</option>
          <option value="unknown" ${entry.nestStatus === "unknown" ? "selected" : ""}>unknown</option>
        </select>
      </td>
      <td><textarea data-col="notes">${entry.notes || ""}</textarea></td>
      <td><input data-col="qcBirdReaction" value="${entry.qualityControl?.birdReaction || ""}" /></td>
      <td><input data-col="qcTimeAtNest" value="${entry.qualityControl?.timeAtNest || ""}" /></td>
      <td><input data-col="qcAborted" value="${entry.qualityControl?.aborted || ""}" /></td>
      <td><input data-col="qcTracksVisible" value="${entry.qualityControl?.tracksVisible || ""}" /></td>
      <td>
        <div class="sheet-photo-grid">
          ${(entry.nestMicro?.photos || []).map((src) => `<img data-ref="${src}" alt="nest photo"/>`).join("")}
          ${(entry.randomMicro?.photos || []).map((src) => `<img data-ref="${src}" alt="random photo"/>`).join("")}
        </div>
        <div class="row-2">
          <label>Nowe gniazdo foto <input data-col="nestPhotosUpload" type="file" accept="image/*" multiple /></label>
          <label>Nowe losowy foto <input data-col="randomPhotosUpload" type="file" accept="image/*" multiple /></label>
        </div>
      </td>
      <td><button type="button" class="sheet-delete danger" data-uid="${entry.uid}">Usuń</button></td>
    `;
    sheetTableBody.appendChild(tr);
    const imgs = tr.querySelectorAll(".sheet-photo-grid img");
    const refs = [...(entry.nestMicro?.photos || []), ...(entry.randomMicro?.photos || [])];
    imgs.forEach((img, i) => resolvePhotoSrc(refs[i]).then((src) => { if (src) img.src = src; }));
  }
}

function downloadBlob(filename, mimeType, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


document.querySelector("#export-csv")?.addEventListener("click", async () => {
  const rows = getEntries();

  const header = [
    "uid", "nest_id", "species", "obs_date", "obs_time", "sector", "lat", "lon", "egg_count", "nest_status", "possible_renest",
    "nest_substrate", "nest_pct_sand", "nest_pct_fine_gravel", "nest_pct_coarse", "nest_pct_shells", "nest_pct_live_veg", "nest_pct_dry_veg", "nest_pct_organic", "nest_pct_anthro",
    "nest_dist_plant_m", "nest_height_plant_cm", "nest_dist_object_m", "nest_height_object_cm", "nest_slope",
    "random_azimuth_deg", "random_lat", "random_lon", "random_substrate", "random_pct_sand", "random_pct_fine_gravel", "random_pct_coarse", "random_pct_shells", "random_pct_live_veg", "random_pct_dry_veg", "random_pct_organic", "random_pct_anthro",
    "random_dist_plant_m", "random_height_plant_cm", "random_dist_object_m", "random_height_object_cm", "random_slope",
    "pct_sand", "pct_gravel", "pct_vegetation", "pct_water", "meso_big_objects",
    "dist_water_m", "dist_veg_edge_m", "dist_vertical_structure_m", "dist_fine_gravel_patch_m", "dist_coarse_gravel_patch_m", "dist_nearest_hiaticula_m", "dist_nearest_dubius_m",
    "notes_identification", "notes_nest_micro", "notes_random_micro", "notes_meso", "notes",
    "qc_bird_reaction", "qc_time_at_nest", "qc_aborted", "qc_tracks_visible", "qc_tracks_notes",
    "nest_photo_refs", "random_photo_refs", "all_photo_refs", "nest_photo_link", "random_photo_link", "created_at"
  ];

  const photoMap = [];

  const csv = [header.join(",")]
    .concat(
      rows.map((r) => {
        const nestRefs = [];
        const randomRefs = [];

        (r.nestMicro?.photos || []).forEach((src, i) => {
          const file = `${r.uid}_nest_${i + 1}.jpg`;
          nestRefs.push(file);
          photoMap.push({ file, src });
        });

        (r.randomMicro?.photos || []).forEach((src, i) => {
          const file = `${r.uid}_random_${i + 1}.jpg`;
          randomRefs.push(file);
          photoMap.push({ file, src });
        });

        const allRefs = [...nestRefs, ...randomRefs];

        return [
          r.uid, r.nestId, r.species, r.obsDate, r.obsTime, r.sector, r.lat, r.lon, r.eggCount, r.nestStatus, r.possibleRenest,
          r.nestMicro?.substrate,
          r.nestMicro?.coverage?.pctSand, r.nestMicro?.coverage?.pctFineGravel, r.nestMicro?.coverage?.pctCoarse, r.nestMicro?.coverage?.pctShells,
          r.nestMicro?.coverage?.pctLiveVeg, r.nestMicro?.coverage?.pctDryVeg, r.nestMicro?.coverage?.pctOrganic, r.nestMicro?.coverage?.pctAnthro,
          r.nestMicro?.distPlantM, r.nestMicro?.heightPlantCm, r.nestMicro?.distObjectM, r.nestMicro?.heightObjectCm, r.nestMicro?.slope,
          r.randomMicro?.azimuthDeg, r.randomMicro?.lat, r.randomMicro?.lon, r.randomMicro?.substrate,
          r.randomMicro?.coverage?.pctSand, r.randomMicro?.coverage?.pctFineGravel, r.randomMicro?.coverage?.pctCoarse, r.randomMicro?.coverage?.pctShells,
          r.randomMicro?.coverage?.pctLiveVeg, r.randomMicro?.coverage?.pctDryVeg, r.randomMicro?.coverage?.pctOrganic, r.randomMicro?.coverage?.pctAnthro,
          r.randomMicro?.distPlantM, r.randomMicro?.heightPlantCm, r.randomMicro?.distObjectM, r.randomMicro?.heightObjectCm, r.randomMicro?.slope,
          r.meso?.pctSand, r.meso?.pctGravel, r.meso?.pctVegetation, r.meso?.pctWater, r.meso?.bigObjects,
          r.meso?.distWaterM, r.meso?.distVegEdgeM, r.meso?.distVerticalStructureM, r.meso?.distFineGravelPatchM, r.meso?.distCoarseGravelPatchM, r.meso?.distNearestHiaticulaM, r.meso?.distNearestDubiusM,
          r.moduleNotes?.identification, r.moduleNotes?.nestMicro, r.moduleNotes?.randomMicro, r.moduleNotes?.meso, r.notes,
          r.qualityControl?.birdReaction, r.qualityControl?.timeAtNest, r.qualityControl?.aborted, r.qualityControl?.tracksVisible, r.qualityControl?.tracksNotes,
          nestRefs.join(";"),
          randomRefs.join(";"),
          allRefs.join(";"),
          nestRefs[0] ? `=HIPERŁĄCZE("${nestRefs[0]}";"picture_nest")` : "",
          randomRefs[0] ? `=HIPERŁĄCZE("${randomRefs[0]}";"picture_random")` : "",
          r.createdAt,
        ]
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(",");
      })
    )
    .join("\n");

  if (typeof JSZip === "undefined") {
    alert("Brak modułu ZIP. Odśwież aplikację i spróbuj ponownie.");
    return;
  }

  const zip = new JSZip();
  zip.file("sieweczka_dane_i_linki.csv", csv);

  for (const item of photoMap) {
    try {
      const src = await resolvePhotoSrc(item.src);
      if (!src) continue;
      const res = await fetch(src);
      const blob = await res.blob();
      zip.file(item.file, blob);
    } catch {
      // ignore single photo download failure
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(`sieweczka_export_${Date.now()}.zip`, "application/zip", zipBlob);

  alert("Pobrano paczkę ZIP (CSV + zdjęcia).");
  closeMenu();
});



const fieldHelpMap = {
  "#nest-substrate": "Dominujący typ podłoża pod gniazdem. Definicja operacyjna: wybierz klasę, która jest wizualnie dominująca (piasek / drobny żwir / gruby żwir-kamienie / muszle / mieszane). Jeśli wahasz się między klasami, wybierz dominującą i dopisz uwagę.",
  "#random-substrate": "Dominujący typ podłoża w punkcie losowym 10 m. Zasada taka sama jak dla gniazda: wybieraj klasę dominującą, a nie najdrobniejsze różnice.",
  "#nest-pct-sand": "Piasek (1 m²): luźne drobnoziarniste podłoże mineralne. Kodowanie: wpisuj jako piasek, gdy tworzy dominującą lub ciągłą powierzchnię.",
  "#nest-pct-fine-gravel": "Drobny żwir (1 m²): drobne kamienie większe od piasku, bez dominacji dużych kamieni. Kodowanie: gdy większość powierzchni to drobny żwir.",
  "#nest-pct-coarse": "Gruby żwir/kamienie (1 m²): większe frakcje mineralne, otoczaki, kamienie. Kodowanie: gdy duże elementy wyraźnie dominują nad drobnym żwirem.",
  "#nest-pct-shells": "Muszle (1 m²): fragmenty muszli/skorup lub nagromadzenia materiału muszlowego. Koduj jako osobną klasę, gdy są wyraźnie widoczne.",
  "#nest-pct-live-veg": "Roślinność żywa (1 m²): zielone żywe części roślin. Oceniaj procent powierzchni zakrytej rzutem roślin, nie liczbę pędów.",
  "#nest-pct-dry-veg": "Roślinność sucha (1 m²): suche łodygi, martwe części roślin, zeszłoroczne pędy. Nie łącz z roślinnością żywą.",
  "#nest-pct-organic": "Drewno/szczątki organiczne (1 m²): patyki, gałązki, detrytus, glony, wyrzucone szczątki roślin. Koduj tylko gdy stanowią widoczny element powierzchni.",
  "#nest-pct-anthro": "Obiekty antropogeniczne (1 m²): szkło, plastik, metal, beton, sznurki, odpady. Każdy nienaturalny element zalicz do tej klasy.",
  "#random-pct-sand": "Punkt losowy 1 m² — Piasek (1 m²): luźne drobnoziarniste podłoże mineralne. Kodowanie: wpisuj jako piasek, gdy tworzy dominującą lub ciągłą powierzchnię",
  "#random-pct-fine-gravel": "Punkt losowy 1 m² — drobny żwir:  drobne kamienie większe od piasku, bez dominacji dużych kamieni. Kodowanie: gdy większość powierzchni to drobny żwir.",
  "#random-pct-coarse": "Punkt losowy 1 m² — gruby żwir/kamienie: większe frakcje mineralne, otoczaki, kamienie. Kodowanie: gdy duże elementy wyraźnie dominują nad drobnym żwirem.",
  "#random-pct-shells": "Punkt losowy 1 m² — muszle: fragmenty muszli/skorup lub nagromadzenia materiału muszlowego. Koduj jako osobną klasę, gdy są wyraźnie widoczne.",
  "#random-pct-live-veg": "Punkt losowy 1 m² — roślinność żywa: zielone żywe części roślin. Oceniaj procent powierzchni zakrytej rzutem roślin, nie liczbę pędów.",
  "#random-pct-dry-veg": "Punkt losowy 1 m² — roślinność sucha: suche łodygi, martwe części roślin, zeszłoroczne pędy. Nie łącz z roślinnością żywą.",
  "#random-pct-organic": "Punkt losowy 1 m² — drewno/szczątki organiczne:  patyki, gałązki, detrytus, glony, wyrzucone szczątki roślin. Koduj tylko gdy stanowią widoczny element powierzchni.",
  "#random-pct-anthro": "Punkt losowy 1 m² — obiekty antropogeniczne: szkło, plastik, metal, beton, sznurki, odpady. Każdy nienaturalny element zalicz do tej klasy.",
  "#nest-dist-plant": "Najbliższa roślina: mierz od środka gniazda do najbliższej krawędzi zakorzenionej rośliny/kępy (nie do środka, nie pojedyncze przewiane źdźbła).",
  "#nest-height-plant": "Wysokość najbliższej rośliny: maksymalna wysokość części nadziemnej tej samej rośliny/kępy, w cm.",
  "#nest-dist-object": "Najbliższy obiekt: mierz od środka gniazda do najbliższej krawędzi elementu nieroślinnego dającego osłonę/cień/orientację. Pomijaj bardzo małe, nieistotne elementy.",
  "#nest-height-object": "Wysokość obiektu: najwyższy punkt najbliższego obiektu nad poziomem podłoża, w cm.",
  "#random-dist-plant": "Punkt losowy — odległość do najbliższej rośliny: mierz do krawędzi najbliższej kępy/rośliny, tak samo jak przy gnieździe.",
  "#random-height-plant": "Punkt losowy — wysokość najbliższej rośliny: mierz maksymalną wysokość nad podłożem, w cm.",
  "#random-dist-object": "Punkt losowy — odległość do najbliższego obiektu nieroślinnego: mierz do najbliższej krawędzi obiektu.",
  "#random-height-object": "Punkt losowy — wysokość obiektu: najwyższy punkt obiektu nad podłożem, w cm.",
  "#random-azimuth": "Punkt losowy: losowy azymut dla punktu oddalonego o 10 m. Jeśli punkt wypada w wodzie lub poza dostępnym podłożem lęgowym, losuj ponownie i zapisz powód.",
  "#dist-water": "Odległość do wody: najkrótsza odległość od gniazda do aktualnej linii wody/brzegu. Zapisuj konsekwentnie, najlepiej pomiar terenowy lub GIS (z uwagą o metodzie).",
  "#dist-veg-edge": "Odległość do krawędzi roślinności: najkrótsza odległość do początku zwartego płatu roślinności (ciągły lub prawie ciągły płat).",
  "#dist-nearest-hiaticula": "Odległość do najbliższego gniazda sieweczki obrożnej: licz jako najkrótszą odległość do znanego gniazda tego gatunku.",
  "#dist-nearest-dubius": "Odległość do najbliższego gniazda sieweczki rzecznej: licz jako najkrótszą odległość do znanego gniazda tego gatunku.",
  "#pct-sand": "Bufor 15 m — piasek (luźne drobnoziarniste podłoże mineralne) : łączny udział otwartych powierzchni piaszczystych w promieniu 15 m.",
  "#pct-gravel": "Bufor 15 m — żwir/kamienie: łączny udział powierzchni żwirowych i kamienistych w promieniu 15 m.",
  "#pct-vegetation": "Bufor 15 m — roślinność: łączny udział płatów roślinności (żywej i suchej jako struktura) w promieniu 15 m.",
  "#pct-water": "Bufor 15 m — woda/podmokłość: udział otwartej wody i podmokłych fragmentów mieszczących się w promieniu 15 m.",
  "#qc-bird-reaction": "Kontrola jakości: reakcja ptaków podczas podejścia (słaba/umiarkowana/silna). Priorytetem zawsze jest bezpieczeństwo lęgu.",
  "#qc-time-at-nest": "Kontrola jakości: czas przy gnieździe (<1 min, 1–3 min, >3 min). Zasada: skracaj czas do minimum niezbędnego.",
  "#qc-aborted": "Kontrola jakości: czy przerwano pomiar z powodu niepokoju ptaków lub ryzyka drapieżnictwa.",
  "#qc-tracks": "Kontrola jakości: czy widoczne były ślady drapieżnika/człowieka w okolicy gniazda.",
  "#notes": "Uwagi ujednolicające: wpisz tu niepewność klasy, pomiar 'na oko', powód ponownego losowania punktu oraz każde odstępstwo od standardu.",
  "#lat": "GPS: współrzędne gniazda są obowiązkowe i kluczowe do późniejszych analiz GIS (bufor 15 m, ortofotomapa).",
  "#lon": "GPS: współrzędne gniazda są obowiązkowe i kluczowe do późniejszych analiz GIS (bufor 15 m, ortofotomapa).",
  "#species": "Gatunek: klasyfikuj jako sieweczka obrożna lub sieweczka rzeczna; jeśli niepewne, zaznacz i dopisz uwagę.",
  "#nest-id": "ID gniazda: jeden pełny rekord = jedno gniazdo + jeden punkt losowy 10 m; ID musi być unikalne i stabilne.",
};

function setupFieldHelp() {
  const bubble = document.createElement("div");
  bubble.id = "field-help-bubble";
  bubble.hidden = true;
  document.body.appendChild(bubble);

  const showHelp = (el) => {
    if (!el) return;
    const msg = fieldHelpMap[`#${el.id}`];
    if (!msg) return;
    bubble.textContent = msg;
    const r = el.getBoundingClientRect();
    bubble.style.position = "fixed";
    bubble.style.left = "12px";
    bubble.style.right = "12px";
    bubble.style.top = `${Math.min(window.innerHeight - 140, r.bottom + 8)}px`;
    bubble.hidden = false;
  };

  form?.addEventListener("focusin", (e) => showHelp(e.target));
  form?.addEventListener("input", (e) => showHelp(e.target));
  form?.addEventListener("focusout", () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (!active || !form.contains(active)) bubble.hidden = true;
    }, 0);
  });
}

if (scrollTopBtn) {
  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

const steps=[...document.querySelectorAll('.step')];
let currentStep=1;
function showStep(n){currentStep=Math.max(1,Math.min(8,n));steps.forEach(el=>el.hidden=Number(el.dataset.step)!==currentStep);const t=document.querySelector('#step-title');const p=document.querySelector('#step-progress');const titles=['Start / identyfikacja','GPS i zdjęcie gniazda','Mikrohabitat gniazda','Punkt losowy 10 m','Mikrohabitat punktu losowego','Mezohabitat','Jakość i uwagi','Podsumowanie i zapis'];if(t)t.textContent=`Krok ${currentStep} z 8 — ${titles[currentStep-1]}`;if(p)p.style.width=`${(currentStep/8)*100}%`;document.querySelector('#step-next')?.toggleAttribute('hidden',currentStep===8);document.querySelector('#save-final')?.toggleAttribute('hidden',currentStep!==8);if(currentStep===8)renderValidationList();}
function setupStepper(){document.querySelector('#start-new')?.addEventListener('click',()=>{document.querySelector('#home-screen').hidden=true;document.querySelector('#form-screen').hidden=false;showStep(1);});document.querySelector('#step-back')?.addEventListener('click',()=>showStep(currentStep-1));document.querySelector('#step-next')?.addEventListener('click',()=>showStep(currentStep+1));}
function setupTiles(){document.querySelectorAll('.tile-group').forEach(g=>{g.addEventListener('click',e=>{const b=e.target.closest('.tile');if(!b)return;g.querySelectorAll('.tile').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');const inp=document.querySelector('#'+g.dataset.target);if(inp)inp.value=b.dataset.value;});});}
function setupFieldMode(){const key='sieweczka-field-mode';const btn=document.querySelector('#field-mode-toggle');const apply=()=>{const on=localStorage.getItem(key)==='1';document.body.classList.toggle('field-mode',on);if(btn)btn.textContent='Tryb terenowy: '+(on?'włączony':'wyłączony');};btn?.addEventListener('click',()=>{localStorage.setItem(key,localStorage.getItem(key)==='1'?'0':'1');apply();});apply();}
function gpsQuality(acc){if(acc<=5)return 'dobry';if(acc<=10)return 'średni';return 'słaby';}
const oldGps=gpsBtn?.onclick;
function updateCounts(){const e=getEntries();document.querySelector('#entry-count').textContent=e.length;const d=new Date().toISOString().slice(0,10);document.querySelector('#today-count').textContent=e.filter(x=>x.obsDate===d).length;document.querySelector('#offline-status').textContent='Status: '+(navigator.onLine?'online':'offline'); const fm=localStorage.getItem('sieweczka-field-mode')==='1'?'włączony':'wyłączony'; const fms=document.querySelector('#field-mode-status'); if(fms) fms.textContent='Tryb terenowy: '+fm;}
function setupPhotoPreview(inputId,wrapId,label){const i=document.querySelector('#'+inputId);const w=document.querySelector('#'+wrapId);i?.addEventListener('change',()=>{w.innerHTML='';[...i.files].forEach(f=>{const d=document.createElement('div');d.className='photo-tile';d.innerHTML=`<img alt='${label}'><small>${label}</small>`;d.querySelector('img').src=URL.createObjectURL(f);w.appendChild(d);});});}
const PERCENT_GROUPS = {
  nest: ["nest-pct-sand","nest-pct-fine-gravel","nest-pct-coarse","nest-pct-shells","nest-pct-live-veg","nest-pct-dry-veg","nest-pct-organic","nest-pct-anthro"],
  random: ["random-pct-sand","random-pct-fine-gravel","random-pct-coarse","random-pct-shells","random-pct-live-veg","random-pct-dry-veg","random-pct-organic","random-pct-anthro"],
  meso: ["pct-sand","pct-gravel","pct-vegetation","pct-water"]
};
function percentGroupByInputId(id){ for (const [name, ids] of Object.entries(PERCENT_GROUPS)) if (ids.includes(id)) return {name, ids}; return null; }
function groupSum(ids){ return ids.reduce((a,id)=>a + (Number(document.querySelector('#'+id)?.value)||0),0); }
function setupPercentSummaries(){
  const update=()=>Object.entries(PERCENT_GROUPS).forEach(([name,ids])=>{
    const sum = groupSum(ids); const remaining = 100-sum; const el=document.querySelector('#'+name+'-sum');
    if(!el) return;
    let msg = `Suma: ${sum}% • Pozostało: ${Math.max(0,remaining)}%`;
    if(sum===100) msg += ' • OK';
    if(sum>100) msg += ` • Za dużo o ${sum-100}%`;
    el.textContent = msg;
    el.classList.toggle('bad', sum>100);
  });
  document.addEventListener('input',(e)=>{ if(e.target.matches('input[type="number"]')) update(); });
  update();
}
function bindPctTools(){
  document.querySelectorAll('.pct-tool').forEach((btn)=>btn.addEventListener('click',()=>{
    const ids=PERCENT_GROUPS[btn.dataset.group]; if(!ids) return;
    if(btn.dataset.action==='clear'){ ids.forEach(id=>{const el=document.querySelector('#'+id); if(el) el.value='0';}); }
    if(btn.dataset.action==='fill-sand'){ const el=document.querySelector('#'+ids[0]); if(el){ el.value=String(Math.min(100,(Number(el.value)||0)+(100-groupSum(ids)))); }}
    if(btn.dataset.action==='fill-fine'){ const el=document.querySelector('#'+ids[1]); if(el){ el.value=String(Math.min(100,(Number(el.value)||0)+(100-groupSum(ids)))); }}
    if(btn.dataset.action==='fill-veg'){ const el=document.querySelector('#pct-vegetation'); if(el){ el.value=String(Math.min(100,(Number(el.value)||0)+(100-groupSum(ids)))); }}
    document.dispatchEvent(new Event('input'));
  }));
}
function setupAppViews(){
  const home=document.querySelector('#home-screen'), formS=document.querySelector('#form-screen'), rec=document.querySelector('#records-screen');
  if (rec && !rec.querySelector('.back-home')) { const b=document.createElement('button'); b.type='button'; b.className='back-home'; b.textContent='← Menu główne'; rec.prepend(b); }
  if (formS && !formS.querySelector('.back-home')) { const b=document.createElement('button'); b.type='button'; b.className='back-home'; b.textContent='← Menu główne'; formS.prepend(b); }
  const show=(v)=>{home.hidden=v!=='home'; formS.hidden=v!=='form'; rec.hidden=v!=='records';};
  document.querySelector('#start-new')?.addEventListener('click',()=>{show('form'); showStep(1);});
  document.querySelector('#go-records')?.addEventListener('click',()=>show('records'));
  document.querySelector('#go-export')?.addEventListener('click',()=>document.querySelector('#export-csv')?.click());
  document.querySelector('#go-instruction')?.addEventListener('click',()=>document.querySelector('#download-instruction-pdf')?.click());
  document.querySelector('#go-settings')?.addEventListener('click',()=>openMenu());
  document.querySelectorAll('.back-home,#menu-home').forEach(b=>b.addEventListener('click',()=>{show('home'); closeMenu();}));
  document.querySelector('#menu-new')?.addEventListener('click',()=>{show('form');showStep(1);closeMenu();});
  document.querySelector('#menu-records')?.addEventListener('click',()=>{show('records');closeMenu();});
  show('home');
}
setupStepper();setupTiles();setupFieldMode();setupPhotoPreview('nest-photos','nest-photo-preview','gniazdo');setupPhotoPreview('random-photos','random-photo-preview','punkt losowy');setupPercentSummaries();bindPctTools();setupAppViews();updateCounts();showStep(1);

document.querySelector("#save-final")?.addEventListener("click", saveFinalRecord);
document.querySelector("#save-draft")?.addEventListener("click", saveDraft);
