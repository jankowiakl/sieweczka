const STORAGE_KEY = "sieweczka-field-data-v1";

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

const typeLabel = {
  nest: "Gniazdo",
  control: "Punkt kontrolny",
};

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

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderEntries() {
  const entries = getEntries();
  entryCount.textContent = String(entries.length);
  entriesList.innerHTML = "";

  for (const entry of entries) {
    const item = template.content.cloneNode(true);
    item.querySelector(".entry-id").textContent = entry.id;
    item.querySelector(".entry-type").textContent = typeLabel[entry.type] || entry.type;
    item.querySelector(".species").textContent = speciesLabel[entry.species] || entry.species;
    item.querySelector(".coords").textContent = `${entry.lat.toFixed(6)}, ${entry.lon.toFixed(6)}`;
    item.querySelector(".date").textContent = new Date(entry.createdAt).toLocaleString("pl-PL");
    item.querySelector(".notes").textContent = entry.notes || "(brak)";

    const photosWrap = item.querySelector(".photos");
    if (entry.photos?.length) {
      for (const p of entry.photos) {
        const img = document.createElement("img");
        img.src = p;
        img.alt = `Zdjęcie punktu ${entry.id}`;
        photosWrap.appendChild(img);
      }
    } else {
      photosWrap.textContent = "Brak zdjęć.";
    }

    entriesList.appendChild(item);
  }
}

async function filesToDataUrls(fileList) {
  const files = Array.from(fileList).slice(0, 5);
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const id = document.querySelector("#point-id").value.trim();
  const type = document.querySelector("#entry-type").value;
  const species = document.querySelector("#species").value;
  const lat = Number(document.querySelector("#lat").value);
  const lon = Number(document.querySelector("#lon").value);
  const notes = document.querySelector("#notes").value.trim();
  const photosInput = document.querySelector("#photos");

  if (!id || Number.isNaN(lat) || Number.isNaN(lon)) {
    alert("Uzupełnij wymagane pola.");
    return;
  }

  const photos = await filesToDataUrls(photosInput.files || []);
  const entries = getEntries();
  entries.unshift({
    id,
    type,
    species,
    lat,
    lon,
    notes,
    photos,
    createdAt: new Date().toISOString(),
  });
  setEntries(entries);
  form.reset();
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
  const data = JSON.stringify(getEntries(), null, 2);
  downloadBlob(`sieweczka-field-${Date.now()}.json`, "application/json", data);
});

document.querySelector("#export-csv").addEventListener("click", () => {
  const rows = getEntries();
  const header = ["id", "type", "species", "lat", "lon", "notes", "createdAt"];
  const csv = [header.join(",")]
    .concat(
      rows.map((r) =>
        [r.id, r.type, r.species, r.lat, r.lon, (r.notes || "").replaceAll('"', '""'), r.createdAt]
          .map((value) => `"${String(value)}"`)
          .join(",")
      )
    )
    .join("\n");
  downloadBlob(`sieweczka-field-${Date.now()}.csv`, "text/csv;charset=utf-8", csv);
});

document.querySelector("#clear-data").addEventListener("click", () => {
  if (!confirm("Na pewno usunąć wszystkie lokalne dane?")) {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
  renderEntries();
});

function metersToDegreesLat(meters) {
  return meters / 111_320;
}

function metersToDegreesLon(meters, lat) {
  return meters / (111_320 * Math.cos((lat * Math.PI) / 180));
}

function buildFlightPlan(entries, bufferMeters, altitudeMeters) {
  const waypoints = [];
  for (const entry of entries) {
    const dLat = metersToDegreesLat(bufferMeters);
    const dLon = metersToDegreesLon(bufferMeters, entry.lat);

    waypoints.push({
      targetId: entry.id,
      lat: entry.lat + dLat,
      lon: entry.lon,
      altitude: altitudeMeters,
    });
    waypoints.push({
      targetId: entry.id,
      lat: entry.lat,
      lon: entry.lon + dLon,
      altitude: altitudeMeters,
    });
    waypoints.push({
      targetId: entry.id,
      lat: entry.lat - dLat,
      lon: entry.lon,
      altitude: altitudeMeters,
    });
    waypoints.push({
      targetId: entry.id,
      lat: entry.lat,
      lon: entry.lon - dLon,
      altitude: altitudeMeters,
    });
  }
  return waypoints;
}

document.querySelector("#build-flight").addEventListener("click", () => {
  const entries = getEntries();
  if (!entries.length) {
    alert("Najpierw dodaj gniazda lub punkty kontrolne.");
    return;
  }

  const buffer = Number(document.querySelector("#buffer-m").value);
  const altitude = Number(document.querySelector("#altitude-m").value);

  const waypoints = buildFlightPlan(entries, buffer, altitude);
  const header = ["target_id", "waypoint_no", "lat", "lon", "altitude_m"];
  const csv = [header.join(",")]
    .concat(
      waypoints.map((w, i) =>
        [w.targetId, i + 1, w.lat.toFixed(7), w.lon.toFixed(7), w.altitude]
          .map((v) => `"${String(v)}"`)
          .join(",")
      )
    )
    .join("\n");

  downloadBlob(`flight-plan-${Date.now()}.csv`, "text/csv;charset=utf-8", csv);
});

renderEntries();
