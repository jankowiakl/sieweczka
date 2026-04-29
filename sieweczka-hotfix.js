/* Hotfix for the multi-step field form. Loaded after app.js.
   It fixes null.value errors, adds missing field-sheet variables,
   normalizes percentage controls, and takes over final save. */
(function () {
  "use strict";

  const DRAFT_KEY = "sieweczka-field-draft-v1";
  const PROTOCOL_VERSION = "field-sheet-v4";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const val = (selector, fallback = "") => {
    const el = $(selector);
    return el ? el.value : fallback;
  };
  const trim = (selector, fallback = "") => String(val(selector, fallback)).trim();
  const num = (selector, fallback = null) => {
    const raw = val(selector, "");
    if (raw === "" || raw == null) return fallback;
    const n = Number(raw);
    return Number.isNaN(n) ? fallback : n;
  };
  const setVal = (selector, value = "") => {
    const el = $(selector);
    if (el) el.value = value ?? "";
  };
  const files = (selector) => $(selector)?.files || [];
  const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

  const PERCENT_GROUPS = {
    nest: {
      sumEl: "#nest-sum",
      ids: ["nest-pct-sand", "nest-pct-fine-gravel", "nest-pct-coarse", "nest-pct-shells", "nest-pct-live-veg", "nest-pct-dry-veg", "nest-pct-organic", "nest-pct-anthro"],
      labels: ["Piasek", "Drobny żwir", "Gruby żwir/kamienie", "Muszle", "Roślinność żywa", "Roślinność sucha", "Drewno/szczątki", "Antropogeniczne"]
    },
    random: {
      sumEl: "#random-sum",
      ids: ["random-pct-sand", "random-pct-fine-gravel", "random-pct-coarse", "random-pct-shells", "random-pct-live-veg", "random-pct-dry-veg", "random-pct-organic", "random-pct-anthro"],
      labels: ["Piasek", "Drobny żwir", "Gruby żwir/kamienie", "Muszle", "Roślinność żywa", "Roślinność sucha", "Drewno/szczątki", "Antropogeniczne"]
    },
    meso: {
      sumEl: "#meso-sum",
      ids: ["pct-sand", "pct-gravel", "pct-vegetation", "pct-water", "pct-other"],
      labels: ["Piasek", "Żwir/kamienie", "Roślinność", "Woda/podmokłość", "Inne"]
    }
  };

  // Replace unsafe global helpers from app.js. This is the direct fix for null.value.
  window.getVal = (selector, fallback = "") => val(selector, fallback);
  window.numberInput = (selector) => num(selector, 0) ?? 0;
  window.optionalNumberInput = (selector) => num(selector, null);

  function hiddenInput(id, value = "unknown") {
    if ($(`#${id}`)) return;
    const input = document.createElement("input");
    input.type = "hidden";
    input.id = id;
    input.value = value;
    $("#entry-form")?.appendChild(input);
  }

  function addField(containerSelector, html, markerId) {
    if ($(`#${markerId}`)) return;
    const container = $(containerSelector);
    if (!container) return;
    const box = document.createElement("div");
    box.innerHTML = html.trim();
    container.appendChild(box.firstElementChild);
  }

  function ensureMissingFields() {
    addField("#identyfikacja", `
      <div id="field-sheet-additions-identification">
        <div class="row-2">
          <label>Sezon <input id="season" type="text" inputmode="numeric" placeholder="2026"></label>
          <label>Obserwator <input id="observer" type="text" placeholder="imię i nazwisko"></label>
        </div>
        <label>Czy wykonano zdjęcie dokumentacyjne?
          <select id="doc-photo-done"><option value="unknown">Nie wiem</option><option value="yes">Tak</option><option value="no">Nie</option></select>
        </label>
        <label>Czy wykonano zdjęcie 1 m² nad gniazdem?
          <select id="nest-one-m-photo-done"><option value="unknown">Nie wiem</option><option value="yes">Tak</option><option value="no">Nie</option></select>
        </label>
        <label>Czy wyznaczono punkt losowy 10 m?
          <select id="random-point-done"><option value="unknown">Nie wiem</option><option value="yes">Tak</option><option value="no">Nie</option></select>
        </label>
      </div>`, "field-sheet-additions-identification");

    addField("#mikro-gniazdo", `
      <label id="nest-microrelief-field">Mikrorzeźba
        <select id="nest-microrelief"><option value="unknown">Nieokreślone</option><option value="flat">Płaskie</option><option value="depression">Lekkie zagłębienie</option><option value="ridge">Grzbiet/garb</option><option value="between-stones">Między kamieniami</option></select>
      </label>`, "nest-microrelief-field");

    addField("#mikro-losowy", `
      <div id="random-reroll-fields">
        <label>Czy punkt losowy był powtórnie losowany?
          <select id="random-rerolled"><option value="no">Nie</option><option value="yes">Tak</option><option value="unknown">Nie wiem</option></select>
        </label>
        <label>Powód ponownego losowania
          <select id="random-reroll-reason"><option value="none">Nie dotyczy</option><option value="water">Woda</option><option value="dense-vegetation">Roślinność zwarta</option><option value="outside-habitat">Poza dostępnym siedliskiem</option><option value="other">Inne</option></select>
        </label>
      </div>`, "random-reroll-fields");

    const randomStep = document.querySelector('[data-step="5"] fieldset');
    if (randomStep && !$("#random-microrelief-field")) {
      const label = document.createElement("label");
      label.id = "random-microrelief-field";
      label.innerHTML = `Mikrorzeźba
        <select id="random-microrelief"><option value="unknown">Nieokreślone</option><option value="flat">Płaskie</option><option value="depression">Lekkie zagłębienie</option><option value="ridge">Grzbiet/garb</option><option value="between-stones">Między kamieniami</option></select>`;
      randomStep.appendChild(label);
    }

    addField("#mezohabitat", `
      <div id="meso-extra-fields">
        <label>% inne
          <div class="pct-row"><button type="button" class="pct-btn" data-id="pct-other" data-delta="-5">−5</button><input id="pct-other" type="number" min="0" max="100" step="1" value="0"><button type="button" class="pct-btn" data-id="pct-other" data-delta="5">+5</button></div>
        </label>
        <label>Sposób oceny buforu 15 m
          <select id="meso-assessment-method"><option value="unknown">Nieokreślone</option><option value="field">Teren / klasy szacunkowe</option><option value="gis">Ortofotomapa / GIS</option></select>
        </label>
        <label>Uwagi przestrzenne <textarea id="meso-spatial-notes" rows="2" placeholder="np. skraj łachy, środek żwirowiska, przy starorzeczu"></textarea></label>
      </div>`, "meso-extra-fields");

    // Fallback hidden fields, in case HTML changes again.
    ["season", "observer", "doc-photo-done", "nest-one-m-photo-done", "random-point-done", "nest-microrelief", "random-rerolled", "random-reroll-reason", "random-microrelief", "pct-other", "meso-assessment-method", "meso-spatial-notes"].forEach((id) => hiddenInput(id, id === "pct-other" ? "0" : "unknown"));
  }

  function groupSum(ids) {
    return ids.reduce((sum, id) => sum + (num(`#${id}`, 0) || 0), 0);
  }
  function percentGroupByInputId(id) {
    return Object.values(PERCENT_GROUPS).find((group) => group.ids.includes(id)) || null;
  }
  window.groupSum = groupSum;
  window.percentGroupByInputId = percentGroupByInputId;

  function wrapPercentInput(id, labelText) {
    const input = $(`#${id}`);
    if (!input || input.closest(".pct-row")) return;
    const label = input.closest("label");
    if (!label) return;
    input.min = "0";
    input.max = "100";
    input.step = "1";
    if (!input.value) input.value = "0";
    const row = document.createElement("div");
    row.className = "pct-row";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "pct-btn";
    minus.dataset.id = id;
    minus.dataset.delta = "-5";
    minus.textContent = "−5";
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "pct-btn";
    plus.dataset.id = id;
    plus.dataset.delta = "5";
    plus.textContent = "+5";
    label.innerHTML = labelText || label.textContent.trim();
    row.append(minus, input, plus);
    label.appendChild(row);
  }

  function normalizePercentControls() {
    Object.values(PERCENT_GROUPS).forEach((group) => group.ids.forEach((id, index) => wrapPercentInput(id, group.labels[index])));
    updatePercentSummaries();
  }

  function updatePercentSummaries() {
    Object.entries(PERCENT_GROUPS).forEach(([name, group]) => {
      const el = $(group.sumEl);
      if (!el) return;
      const sum = groupSum(group.ids);
      el.classList.toggle("bad", sum > 105 || sum < 95);
      el.classList.toggle("ok", sum >= 95 && sum <= 105);
      if (sum >= 95 && sum <= 105) el.textContent = `Suma: ${sum}% — OK`;
      else if (sum < 95) el.textContent = `Suma: ${sum}% — pozostało ${100 - sum}%`;
      else el.textContent = `Suma: ${sum}% — za dużo o ${sum - 100}%`;
    });
  }

  function bindPercentControls() {
    document.addEventListener("click", (event) => {
      const btn = event.target.closest(".pct-btn");
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      const input = $(`#${btn.dataset.id}`);
      if (!input) return;
      const current = num(`#${btn.dataset.id}`, 0) || 0;
      const delta = Number(btn.dataset.delta || 0);
      const group = percentGroupByInputId(btn.dataset.id);
      let next = clamp(current + delta, 0, 100);
      if (delta > 0 && group) {
        const remaining = 100 - groupSum(group.ids) + current;
        next = Math.min(next, Math.max(0, remaining));
      }
      input.value = String(next);
      updatePercentSummaries();
    }, true);
    document.addEventListener("input", (event) => {
      if (event.target.matches("input[type='number']")) updatePercentSummaries();
    });
  }

  function readCoverage(prefix) {
    return {
      pctSand: num(`#${prefix}-pct-sand`, 0) || 0,
      pctFineGravel: num(`#${prefix}-pct-fine-gravel`, 0) || 0,
      pctCoarse: num(`#${prefix}-pct-coarse`, 0) || 0,
      pctShells: num(`#${prefix}-pct-shells`, 0) || 0,
      pctLiveVeg: num(`#${prefix}-pct-live-veg`, 0) || 0,
      pctDryVeg: num(`#${prefix}-pct-dry-veg`, 0) || 0,
      pctOrganic: num(`#${prefix}-pct-organic`, 0) || 0,
      pctAnthro: num(`#${prefix}-pct-anthro`, 0) || 0,
    };
  }
  function coverageSum(cov) {
    return Object.values(cov || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  }

  async function buildSafeRecord() {
    const entries = window.getEntries ? window.getEntries() : [];
    const editingUid = window.editingUid || null;
    const existingRecord = editingUid ? entries.find((r) => String(r.uid) === String(editingUid)) : null;
    const newNestPhotos = window.filesToPhotoRefs ? await window.filesToPhotoRefs(files("#nest-photos"), 4) : [];
    const newRandomPhotos = window.filesToPhotoRefs ? await window.filesToPhotoRefs(files("#random-photos"), 4) : [];
    const uid = editingUid || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    return {
      uid,
      protocolVersion: PROTOCOL_VERSION,
      createdAt: existingRecord?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nestId: trim("#nest-id"),
      season: trim("#season"),
      observer: trim("#observer"),
      species: val("#species", "unknown") || "unknown",
      obsDate: val("#obs-date"),
      obsTime: val("#obs-time"),
      sector: trim("#sector"),
      lat: num("#lat", null),
      lon: num("#lon", null),
      eggCount: num("#egg-count", null),
      nestStatus: val("#nest-status", "unknown"),
      possibleRenest: val("#possible-renest", "uncertain"),
      docPhotoDone: val("#doc-photo-done", "unknown"),
      nestOneMPhotoDone: val("#nest-one-m-photo-done", "unknown"),
      randomPointDone: val("#random-point-done", "unknown"),
      nestMicro: {
        photos: newNestPhotos.length ? newNestPhotos : (existingRecord?.nestMicro?.photos || []),
        substrate: val("#nest-substrate", "sand"),
        coverage: readCoverage("nest"),
        distPlantCm: num("#nest-dist-plant", null),
        heightPlantCm: num("#nest-height-plant", null),
        distObjectCm: num("#nest-dist-object", null),
        heightObjectCm: num("#nest-height-object", null),
        slope: val("#nest-slope", "flat"),
        microrelief: val("#nest-microrelief", "unknown")
      },
      randomMicro: {
        azimuthDeg: num("#random-azimuth", null),
        wasRerolled: val("#random-rerolled", "no"),
        rerollReason: val("#random-reroll-reason", "none"),
        lat: num("#random-lat", null),
        lon: num("#random-lon", null),
        photos: newRandomPhotos.length ? newRandomPhotos : (existingRecord?.randomMicro?.photos || []),
        substrate: val("#random-substrate", "sand"),
        coverage: readCoverage("random"),
        distPlantCm: num("#random-dist-plant", null),
        heightPlantCm: num("#random-height-plant", null),
        distObjectCm: num("#random-dist-object", null),
        heightObjectCm: num("#random-height-object", null),
        slope: val("#random-slope", "flat"),
        microrelief: val("#random-microrelief", "unknown")
      },
      meso: {
        pctSand: num("#pct-sand", 0) || 0,
        pctGravel: num("#pct-gravel", 0) || 0,
        pctVegetation: num("#pct-vegetation", 0) || 0,
        pctWater: num("#pct-water", 0) || 0,
        pctOther: num("#pct-other", 0) || 0,
        assessmentMethod: val("#meso-assessment-method", "unknown"),
        bigObjects: val("#meso-big-objects", "unknown"),
        distWaterM: num("#dist-water", null),
        distVegEdgeM: num("#dist-veg-edge", null),
        distVerticalStructureM: num("#dist-vertical-structure", null),
        distFineGravelPatchM: num("#dist-fine-gravel-patch", null),
        distCoarseGravelPatchM: num("#dist-coarse-gravel-patch", null),
        distNearestHiaticulaM: num("#dist-nearest-hiaticula", null),
        distNearestDubiusM: num("#dist-nearest-dubius", null),
        spatialNotes: trim("#meso-spatial-notes")
      },
      qualityControl: {
        birdReaction: val("#qc-bird-reaction", "weak"),
        timeAtNest: val("#qc-time-at-nest", "lt1"),
        aborted: val("#qc-aborted", "no"),
        tracksVisible: val("#qc-tracks", "no"),
        tracksNotes: trim("#qc-tracks-notes")
      },
      moduleNotes: {
        identification: trim("#notes-identification"),
        nestMicro: trim("#notes-nest-micro"),
        randomMicro: trim("#notes-random-micro"),
        meso: trim("#notes-meso")
      },
      notes: trim("#notes")
    };
  }

  function validateSafeRecord(record) {
    const errors = [];
    const required = [
      [1, "#nest-id", record.nestId, "Brakuje ID gniazda"],
      [1, "#obs-date", record.obsDate, "Brakuje daty"],
      [1, "#obs-time", record.obsTime, "Brakuje godziny"],
      [1, "#sector", record.sector, "Brakuje sektora"],
      [1, "#egg-count", record.eggCount, "Brakuje liczby jaj"],
      [2, "#lat", record.lat, "Brakuje GPS gniazda — szerokość"],
      [2, "#lon", record.lon, "Brakuje GPS gniazda — długość"]
    ];
    required.forEach(([step, fieldId, value, message]) => {
      if (value === "" || value == null || Number.isNaN(value)) errors.push({ step, fieldId, message });
    });
    const nestSum = coverageSum(record.nestMicro.coverage);
    const randomSum = coverageSum(record.randomMicro.coverage);
    const mesoSum = record.meso.pctSand + record.meso.pctGravel + record.meso.pctVegetation + record.meso.pctWater + record.meso.pctOther;
    if (nestSum < 95 || nestSum > 105) errors.push({ step: 3, fieldId: "#nest-pct-sand", message: `Mikrohabitat gniazda: suma pokrycia to ${nestSum}%, powinna być ok. 100%` });
    if (randomSum < 95 || randomSum > 105) errors.push({ step: 5, fieldId: "#random-pct-sand", message: `Punkt losowy: suma pokrycia to ${randomSum}%, powinna być ok. 100%` });
    if (mesoSum < 95 || mesoSum > 105) errors.push({ step: 6, fieldId: "#pct-sand", message: `Mezohabitat: suma pokrycia to ${mesoSum}%, powinna być ok. 100%` });
    return errors;
  }

  function renderSafeValidation(errors) {
    const div = $("#validation-list");
    if (!div) return;
    if (!errors.length) {
      div.innerHTML = "<p><strong>Brak krytycznych braków.</strong> Możesz zapisać rekord.</p>";
      return;
    }
    div.innerHTML = `<p><strong>Nie można jeszcze zapisać rekordu.</strong></p>` + errors.map((e, i) =>
      `<div class="val-item">${i + 1}. ${e.message} <button type="button" data-step="${e.step}" data-field="${e.fieldId}">Przejdź</button></div>`
    ).join("");
    div.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
      if (window.showStep) window.showStep(Number(btn.dataset.step));
      setTimeout(() => $(btn.dataset.field)?.focus(), 60);
    }));
  }

  async function saveSafeFinalRecord(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    try {
      const record = await buildSafeRecord();
      const errors = validateSafeRecord(record);
      renderSafeValidation(errors);
      if (errors.length) {
        if (window.showStep) window.showStep(8);
        return;
      }
      const entries = window.getEntries ? window.getEntries() : [];
      const index = entries.findIndex((entry) => String(entry.uid) === String(record.uid));
      if (index >= 0) entries[index] = record;
      else entries.unshift(record);
      if (window.setEntries && !window.setEntries(entries)) return;
      localStorage.removeItem(DRAFT_KEY);
      if (window.renderEntries) window.renderEntries($("#record-search")?.value || "");
      if (window.updateCounts) window.updateCounts();
      const formScreen = $("#form-screen");
      const recordsScreen = $("#records-screen");
      const homeScreen = $("#home-screen");
      if (formScreen) formScreen.hidden = true;
      if (recordsScreen) recordsScreen.hidden = false;
      if (homeScreen) homeScreen.hidden = true;
      alert("Rekord zapisany");
    } catch (error) {
      console.error("hotfix save failed", error);
      alert(`Zapis nie powiódł się: ${error?.message || error}`);
    }
  }

  function bindSaveButton() {
    const save = $("#save-final");
    if (!save) return;
    save.addEventListener("click", saveSafeFinalRecord, true);
  }

  function bootHotfix() {
    ensureMissingFields();
    normalizePercentControls();
    bindPercentControls();
    bindSaveButton();
    updatePercentSummaries();
    const year = new Date().getFullYear();
    if (!val("#season")) setVal("#season", String(year));
    console.info("Sieweczka hotfix loaded: safe save, missing fields, percent controls");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootHotfix);
  else bootHotfix();
})();
