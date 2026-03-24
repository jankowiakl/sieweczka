const STORAGE_KEY = "sieweczka-field-data-v2";

const form = document.querySelector("#entry-form");
const entriesList = document.querySelector("#entries-list");
const entryCount = document.querySelector("#entry-count");
const template = document.querySelector("#entry-item-template");
const gpsBtn = document.querySelector("#gps-btn");
const gpsStatus = document.querySelector("#gps-status");
const randomAzimuthBtn = document.querySelector("#random-azimuth-btn");

const menuToggle = document.querySelector("#menu-toggle");
const menu = document.querySelector("#app-menu");
const menuOverlay = document.querySelector("#menu-overlay");
const installBtn = document.querySelector("#install-app");
const installHint = document.querySelector("#install-hint");
const header = document.querySelector("#app-header");

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

setDefaultDateTime();
renderEntries();
registerServiceWorker();
setupInstallFlow();
setupMenu();
setupHeaderAutoHide();

randomAzimuthBtn.addEventListener("click", () => {
  const value = Math.floor(Math.random() * 360);
  document.querySelector("#random-azimuth").value = String(value);
});


function numberInput(id) {
  return Number(document.querySelector(id).value);
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
    installHint.textContent = "Aplikacja gotowa do instalacji — użyj menu ☰ i kliknij 'Zainstaluj aplikację'.";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installBtn.disabled = true;
    installHint.textContent = "Aplikacja została zainstalowana na telefonie.";
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

function getEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

async function filesToDataUrls(fileList, maxFiles = 4) {
  const files = Array.from(fileList).slice(0, maxFiles);
  const urls = [];
  for (const file of files) {
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Błąd odczytu pliku ${file.name}`));
      reader.readAsDataURL(file);
    });
    urls.push(url);
  }
  return urls;
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

function renderEntries() {
  const entries = getEntries();
  entryCount.textContent = String(entries.length);
  entriesList.innerHTML = "";

  for (const entry of entries) {
    const item = template.content.cloneNode(true);
    item.querySelector(".entry-id").textContent = entry.nestId;
    item.querySelector(".species").textContent = speciesLabel[entry.species] || entry.species;
    item.querySelector(".status").textContent = statusLabel[entry.nestStatus] || entry.nestStatus;
    item.querySelector(".meta").textContent = `${entry.obsDate} ${entry.obsTime} • ${entry.sector} • jaja: ${entry.eggCount} • renest: ${yesNoLabel[entry.possibleRenest]}`;
    item.querySelector(".coords").textContent = `${entry.lat.toFixed(6)}, ${entry.lon.toFixed(6)}`;

    item.querySelector(".summary").textContent =
      `Mikro(gniazdo): ${substrateLabel[entry.nestMicro.substrate]}, osłona ${entry.nestMicro.distObjectM} m.` +
      ` Mikro(punkt losowy): azymut ${entry.randomMicro.azimuthDeg}°, ${substrateLabel[entry.randomMicro.substrate]}.` +
      ` Mezo: piasek ${entry.meso.pctSand}%, żwir ${entry.meso.pctGravel}%, roślinność ${entry.meso.pctVegetation}%, woda ${entry.meso.pctWater}%.`;

    const photoWrap = item.querySelector(".photos");
    const allPhotos = [...entry.nestMicro.photos, ...entry.randomMicro.photos];
    if (allPhotos.length) {
      for (const photo of allPhotos) {
        const img = document.createElement("img");
        img.src = photo;
        img.alt = `Zdjęcie dla gniazda ${entry.nestId}`;
        photoWrap.appendChild(img);
      }
    } else {
      photoWrap.textContent = "Brak zdjęć.";
    }

    entriesList.appendChild(item);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const record = {
    nestId: document.querySelector("#nest-id").value.trim(),
    species: document.querySelector("#species").value,
    obsDate: document.querySelector("#obs-date").value,
    obsTime: document.querySelector("#obs-time").value,
    sector: document.querySelector("#sector").value.trim(),
    lat: numberInput("#lat"),
    lon: numberInput("#lon"),
    eggCount: numberInput("#egg-count"),
    nestStatus: document.querySelector("#nest-status").value,
    possibleRenest: document.querySelector("#possible-renest").value,
    nestMicro: {
      photos: await filesToDataUrls(document.querySelector("#nest-photos").files, 4),
      substrate: document.querySelector("#nest-substrate").value,
      coverage: readCoverage("nest"),
      distPlantM: numberInput("#nest-dist-plant"),
      heightPlantCm: numberInput("#nest-height-plant"),
      distObjectM: numberInput("#nest-dist-object"),
      heightObjectCm: numberInput("#nest-height-object"),
      slope: document.querySelector("#nest-slope").value,
    },
    randomMicro: {
      azimuthDeg: numberInput("#random-azimuth"),
      photos: await filesToDataUrls(document.querySelector("#random-photos").files, 4),
      substrate: document.querySelector("#random-substrate").value,
      coverage: readCoverage("random"),
      distPlantM: numberInput("#random-dist-plant"),
      heightPlantCm: numberInput("#random-height-plant"),
      distObjectM: numberInput("#random-dist-object"),
      heightObjectCm: numberInput("#random-height-object"),
      slope: document.querySelector("#random-slope").value,
    },
    meso: {
      pctSand: numberInput("#pct-sand"),
      pctGravel: numberInput("#pct-gravel"),
      pctVegetation: numberInput("#pct-vegetation"),
      pctWater: numberInput("#pct-water"),
      bigObjects: document.querySelector("#meso-big-objects").value,
      distWaterM: numberInput("#dist-water"),
      distVegEdgeM: numberInput("#dist-veg-edge"),
      distVerticalStructureM: numberInput("#dist-vertical-structure"),
      distFineGravelPatchM: numberInput("#dist-fine-gravel-patch"),
      distCoarseGravelPatchM: numberInput("#dist-coarse-gravel-patch"),
      distNearestHiaticulaM: numberInput("#dist-nearest-hiaticula"),
      distNearestDubiusM: numberInput("#dist-nearest-dubius"),
    },
    notes: document.querySelector("#notes").value.trim(),
    createdAt: new Date().toISOString(),
  };

  if (!record.nestId || !record.sector || Number.isNaN(record.lat) || Number.isNaN(record.lon)) {
    alert("Uzupełnij pola identyfikacji i GPS.");
    return;
  }
  if (!validatePercentages(record)) return;

  const entries = getEntries();
  entries.unshift(record);
  setEntries(entries);

  form.reset();
  setDefaultDateTime();
  gpsStatus.textContent = "GPS: brak";
  renderEntries();
});

gpsBtn.addEventListener("click", () => {
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

function downloadBlob(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

document.querySelector("#export-json").addEventListener("click", () => {
  downloadBlob(`sieweczka-gniazda-${Date.now()}.json`, "application/json", JSON.stringify(getEntries(), null, 2));
  closeMenu();
});

document.querySelector("#export-csv").addEventListener("click", () => {
  const rows = getEntries();
  const header = [
    "nest_id", "species", "obs_date", "obs_time", "sector", "lat", "lon", "egg_count", "nest_status", "possible_renest",
    "nest_substrate", "nest_pct_sand", "nest_pct_fine_gravel", "nest_pct_coarse", "nest_pct_shells", "nest_pct_live_veg", "nest_pct_dry_veg", "nest_pct_organic", "nest_pct_anthro",
    "nest_dist_plant_m", "nest_height_plant_cm", "nest_dist_object_m", "nest_height_object_cm", "nest_slope",
    "random_azimuth_deg", "random_substrate", "random_pct_sand", "random_pct_fine_gravel", "random_pct_coarse", "random_pct_shells", "random_pct_live_veg", "random_pct_dry_veg", "random_pct_organic", "random_pct_anthro",
    "random_dist_plant_m", "random_height_plant_cm", "random_dist_object_m", "random_height_object_cm", "random_slope",
    "pct_sand", "pct_gravel", "pct_vegetation", "pct_water", "meso_big_objects",
    "dist_water_m", "dist_veg_edge_m", "dist_vertical_structure_m", "dist_fine_gravel_patch_m", "dist_coarse_gravel_patch_m", "dist_nearest_hiaticula_m", "dist_nearest_dubius_m",
    "notes", "created_at"
  ];

  const csv = [header.join(",")]
    .concat(
      rows.map((r) =>
        [
          r.nestId, r.species, r.obsDate, r.obsTime, r.sector, r.lat, r.lon, r.eggCount, r.nestStatus, r.possibleRenest,
          r.nestMicro.substrate,
          r.nestMicro.coverage.pctSand, r.nestMicro.coverage.pctFineGravel, r.nestMicro.coverage.pctCoarse, r.nestMicro.coverage.pctShells,
          r.nestMicro.coverage.pctLiveVeg, r.nestMicro.coverage.pctDryVeg, r.nestMicro.coverage.pctOrganic, r.nestMicro.coverage.pctAnthro,
          r.nestMicro.distPlantM, r.nestMicro.heightPlantCm, r.nestMicro.distObjectM, r.nestMicro.heightObjectCm, r.nestMicro.slope,
          r.randomMicro.azimuthDeg, r.randomMicro.substrate,
          r.randomMicro.coverage.pctSand, r.randomMicro.coverage.pctFineGravel, r.randomMicro.coverage.pctCoarse, r.randomMicro.coverage.pctShells,
          r.randomMicro.coverage.pctLiveVeg, r.randomMicro.coverage.pctDryVeg, r.randomMicro.coverage.pctOrganic, r.randomMicro.coverage.pctAnthro,
          r.randomMicro.distPlantM, r.randomMicro.heightPlantCm, r.randomMicro.distObjectM, r.randomMicro.heightObjectCm, r.randomMicro.slope,
          r.meso.pctSand, r.meso.pctGravel, r.meso.pctVegetation, r.meso.pctWater, r.meso.bigObjects,
          r.meso.distWaterM, r.meso.distVegEdgeM, r.meso.distVerticalStructureM, r.meso.distFineGravelPatchM, r.meso.distCoarseGravelPatchM,
          r.meso.distNearestHiaticulaM, r.meso.distNearestDubiusM,
          (r.notes || "").replaceAll('"', '""'), r.createdAt,
        ]
          .map((value) => `"${String(value)}"`)
          .join(",")
      )
    )
    .join("\n");

  downloadBlob(`sieweczka-gniazda-${Date.now()}.csv`, "text/csv;charset=utf-8", csv);
  closeMenu();
});

document.querySelector("#clear-data").addEventListener("click", () => {
  if (!confirm("Na pewno usunąć wszystkie lokalne dane?")) return;
  localStorage.removeItem(STORAGE_KEY);
  renderEntries();
  closeMenu();
});
