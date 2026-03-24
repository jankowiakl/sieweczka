const STORAGE_KEY = "sieweczka-field-data-v2";

const form = document.querySelector("#entry-form");
const entriesList = document.querySelector("#entries-list");
const entryCount = document.querySelector("#entry-count");
const template = document.querySelector("#entry-item-template");
const gpsBtn = document.querySelector("#gps-btn");
const gpsStatus = document.querySelector("#gps-status");

const speciesLabel = {
  "charadrius-hiaticula": "Sieweczka obrożna",
  "charadrius-dubius": "Sieweczka rzeczna",
  unknown: "Nieokreślony",
};

const statusLabel = {
  fresh: "Świeże",
  incubated: "Inkubowane",
  unknown: "Nieznany",
};

const yesNoLabel = {
  no: "Nie",
  yes: "Tak",
  uncertain: "Niepewne",
};

const slopeLabel = {
  flat: "Płasko",
  slight: "Lekki spadek",
  moderate: "Umiarkowany spadek",
  steep: "Wyraźny spadek",
};

const substrateLabel = {
  sand: "Piasek",
  "fine-gravel": "Drobny żwir",
  "coarse-gravel": "Grubszy żwir / otoczaki",
  shells: "Muszle",
  mixed: "Mieszane",
};

setDefaultDateTime();
renderEntries();

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

function numberInput(id) {
  return Number(document.querySelector(id).value);
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
  const total = record.meso.pctSand + record.meso.pctGravel + record.meso.pctVegetation + record.meso.pctWater;
  if (total > 100) {
    alert("Suma % piasku, żwiru, roślinności i wody nie może przekraczać 100.");
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

    const summary = [
      `Mikro gniazdo: ${substrateLabel[entry.nestMicro.substrate]}, roślina ${entry.nestMicro.distPlantM} m / ${entry.nestMicro.heightPlantCm} cm, obiekt ${entry.nestMicro.distObjectM} m / ${entry.nestMicro.heightObjectCm} cm, nachylenie: ${slopeLabel[entry.nestMicro.slope]}.`,
      `Punkt losowy 10 m: azymut ${entry.randomMicro.azimuthDeg}°, podłoże ${substrateLabel[entry.randomMicro.substrate]}, roślina ${entry.randomMicro.distPlantM} m / ${entry.randomMicro.heightPlantCm} cm, obiekt ${entry.randomMicro.distObjectM} m / ${entry.randomMicro.heightObjectCm} cm, nachylenie: ${slopeLabel[entry.randomMicro.slope]}.`,
      `Mezo 15 m: piasek ${entry.meso.pctSand}%, żwir ${entry.meso.pctGravel}%, roślinność ${entry.meso.pctVegetation}%, woda ${entry.meso.pctWater}%. Dystanse: woda ${entry.meso.distWaterM} m, krawędź roślinności ${entry.meso.distVegEdgeM} m, najbliższa obrożna ${entry.meso.distNearestHiaticulaM} m, najbliższa rzeczna ${entry.meso.distNearestDubiusM} m.`,
    ];
    if (entry.notes) {
      summary.push(`Notatka: ${entry.notes}`);
    }
    item.querySelector(".summary").textContent = summary.join(" ");

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
      distWaterM: numberInput("#dist-water"),
      distVegEdgeM: numberInput("#dist-veg-edge"),
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

  if (!validatePercentages(record)) {
    return;
  }

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
  const payload = JSON.stringify(getEntries(), null, 2);
  downloadBlob(`sieweczka-gniazda-${Date.now()}.json`, "application/json", payload);
});

document.querySelector("#export-csv").addEventListener("click", () => {
  const rows = getEntries();
  const header = [
    "nest_id",
    "species",
    "obs_date",
    "obs_time",
    "sector",
    "lat",
    "lon",
    "egg_count",
    "nest_status",
    "possible_renest",
    "nest_substrate",
    "nest_dist_plant_m",
    "nest_height_plant_cm",
    "nest_dist_object_m",
    "nest_height_object_cm",
    "nest_slope",
    "random_azimuth_deg",
    "random_substrate",
    "random_dist_plant_m",
    "random_height_plant_cm",
    "random_dist_object_m",
    "random_height_object_cm",
    "random_slope",
    "pct_sand",
    "pct_gravel",
    "pct_vegetation",
    "pct_water",
    "dist_water_m",
    "dist_veg_edge_m",
    "dist_nearest_hiaticula_m",
    "dist_nearest_dubius_m",
    "notes",
    "created_at",
  ];

  const csv = [header.join(",")]
    .concat(
      rows.map((r) =>
        [
          r.nestId,
          r.species,
          r.obsDate,
          r.obsTime,
          r.sector,
          r.lat,
          r.lon,
          r.eggCount,
          r.nestStatus,
          r.possibleRenest,
          r.nestMicro.substrate,
          r.nestMicro.distPlantM,
          r.nestMicro.heightPlantCm,
          r.nestMicro.distObjectM,
          r.nestMicro.heightObjectCm,
          r.nestMicro.slope,
          r.randomMicro.azimuthDeg,
          r.randomMicro.substrate,
          r.randomMicro.distPlantM,
          r.randomMicro.heightPlantCm,
          r.randomMicro.distObjectM,
          r.randomMicro.heightObjectCm,
          r.randomMicro.slope,
          r.meso.pctSand,
          r.meso.pctGravel,
          r.meso.pctVegetation,
          r.meso.pctWater,
          r.meso.distWaterM,
          r.meso.distVegEdgeM,
          r.meso.distNearestHiaticulaM,
          r.meso.distNearestDubiusM,
          (r.notes || "").replaceAll('"', '""'),
          r.createdAt,
        ]
          .map((value) => `"${String(value)}"`)
          .join(",")
      )
    )
    .join("\n");

  downloadBlob(`sieweczka-gniazda-${Date.now()}.csv`, "text/csv;charset=utf-8", csv);
});

document.querySelector("#clear-data").addEventListener("click", () => {
  if (!confirm("Na pewno usunąć wszystkie lokalne dane?")) {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
  renderEntries();
});
