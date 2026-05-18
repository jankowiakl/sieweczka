(() => {
  "use strict";

  const STORAGE_KEY = "sieweczka-field-data-v3";
  const LEGACY_STORAGE_KEY = "sieweczka-field-data-v2";
  const DRAFT_KEY = "sieweczka-field-draft-v3";
  const CUSTOM_SPECIES_KEY = "sieweczka-custom-species-v1";
  const OBSERVERS_KEY = "sieweczka-observers-v1";
  const SECTORS_KEY = "sieweczka-sectors-v1";
  const WORKING_NESTS_KEY = "sieweczka-working-nests-v1";
  const PHOTO_DB = "sieweczka-photo-db";
  const PHOTO_STORE = "photos";
  const PROTOCOL_VERSION = "field-sheet-v4-clean";
  const APP_VERSION = "2026.05.18-quick-nest-egg-weight";
  const DEFAULT_API_URL = "https://bielik.myqnapcloud.com:18443";
  const UI_SETTINGS_KEY = "sieweczka-ui-settings-v1";
  const UI_COMPACT_SUGGESTION_KEY = "sieweczka-ui-compact-suggestion-v1";
  const PHOTO_MEASURE_CALIBRATION_KEY = "sieweczka-photo-measure-calibrations-v1";

  const SYNC_CONFIG_KEY = "sieweczka-sync-config-v1";
  const SYNC_STATE_KEY = "sieweczka-sync-state-v1";
  const PHOTO_SYNC_KEY = "sieweczka-photo-sync-v1";
  const AUTH_STATE_KEY = "sieweczka-auth-v1";
  const ORTO_OFFLINE_CACHE = "sieweczka-orto-view-cache-v1";
  const DOMINIK_OFFLINE_CACHE = "sieweczka-dominik-view-cache-v1";
  const GEOPORTAL_ORTO_WMS_URL = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution";
  const ORTO_TILE_SIZE = 256;
  const ORTO_MAX_NEW_TILES_PER_VIEW = 200;
  const ORTO_MAX_NEW_TILES_PER_SESSION = 3000;
  const ORTO_CACHE_CONCURRENCY = 4;
  const ORTO_CACHE_DEBOUNCE_MS = 700;
  const ORTO_CACHE_META_KEY = "sieweczka-orto-view-cache-meta-v1";
  const MAP_VIEW_STATE_KEY = "sieweczka-map-view-state-v1";
  const MAP_VIEW_STATE_DEBOUNCE_MS = 400;
  const ORTO_OFFLINE_LAYER_PARAM = "sieweczkaOffline";
  const DOMINIK_OFFLINE_LAYER_PARAM = "sieweczkaDominikOffline";
  const DOMINIK_MAX_NATIVE_ZOOM = 22;
  const DOMINIK_MAX_DISPLAY_ZOOM = 50;
  const MAP_MAX_ZOOM = 30;
  // TODO: docelowo przenieść klucz MapTiler do konfiguracji, np. stałej MAPTILER_KEY w środowisku/buildzie.
  const DOMINIK_LAYER_TILESET_ID = "01994d7c-6984-7a15-ab37-9ec1ec822405";
  const DOMINIK_LAYER_KEY = "vi11VQ5jJfCfKBHmWKix";
  const DOMINIK_LAYER_XYZ_URL = `https://api.maptiler.com/tiles/${DOMINIK_LAYER_TILESET_ID}/{z}/{x}/{y}?key=${DOMINIK_LAYER_KEY}`;
  const DOMINIK_LAYER_TILEJSON_URL = `https://api.maptiler.com/tiles/${DOMINIK_LAYER_TILESET_ID}/tiles.json?key=${DOMINIK_LAYER_KEY}`;
  let deferredInstallPrompt = null;

  function getClientId() {
    const key = "sieweczka-client-id-v1";
    let id = localStorage.getItem(key);
    if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; localStorage.setItem(key, id); }
    return id;
  }
  function getSyncConfig() { try { return JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY) || "{}"); } catch { return {}; } }
  function setSyncConfig(cfg) { localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(cfg)); }
  function getSyncApiBase(cfg = getSyncConfig()) { return String(cfg.apiUrl || DEFAULT_API_URL).trim().replace(/\/+$/, "").replace(/\/api$/i, ""); }
  function getAuthState() { try { return JSON.parse(localStorage.getItem(AUTH_STATE_KEY) || "{}"); } catch { return {}; } }
  function setAuthState(state) { localStorage.setItem(AUTH_STATE_KEY, JSON.stringify(state || {})); }
  function clearAuthState() { localStorage.removeItem(AUTH_STATE_KEY); }
  function getCurrentUser() { return getAuthState().user || null; }
  function mustChangePassword() { return !!getCurrentUser()?.must_change_password; }
  function getUserToken() { return getAuthState().token || ""; }
  function isAdmin() { return getCurrentUser()?.role === "admin"; }
  function canManageData() { return ["admin", "coordinator"].includes(getCurrentUser()?.role); }
  function ownsItem(item) { return !!getCurrentUser()?.id && String(item?.createdBy || item?.created_by || item?.uploadedBy || "") === String(getCurrentUser().id); }
  function canSoftDeleteItem(item) { return canManageData() || (getCurrentUser()?.role === "observer" && ownsItem(item)); }
  function canEditItem(item) { return canManageData() || getCurrentUser()?.role === "observer" && ownsItem(item); }
  function canMoveMapPoint(item) { return isAdmin() || ownsItem(item); }
  function isDeleted(item) { return !!(item?.deletedAt || item?.deleted_at); }
  function activeEntries() { return getEntries().filter((entry) => !isDeleted(entry)); }
  function activeWorkingNests() { return getWorkingNests().filter((nest) => !isDeleted(nest)); }
  function getUiSettings() { try { return JSON.parse(localStorage.getItem(UI_SETTINGS_KEY) || "{}"); } catch { return {}; } }
  function readObjectSetting(key) { try { const parsed = JSON.parse(localStorage.getItem(key) || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
  function setUiSettings(settings) { localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(settings || {})); }
  const UI_CLASS_VALUES = {
    font: ["font-minimal", "font-xsmall", "font-small", "font-normal", "font-large", "font-xlarge"],
    ui: ["ui-minimal", "ui-xcompact", "ui-compact", "ui-normal", "ui-comfortable", "ui-large"],
    buttons: ["buttons-minimal", "buttons-xsmall", "buttons-small", "buttons-normal", "buttons-large", "buttons-xlarge"],
    icons: ["icons-minimal", "icons-xsmall", "icons-small", "icons-normal", "icons-large"],
    layout: ["layout-full", "layout-normal", "layout-narrow", "layout-xnarrow", "layout-minimal"],
    tiles: ["tiles-auto", "tiles-two", "tiles-one", "tiles-compact"]
  };
  const UI_LEGACY_VALUES = {
    font: { tiny: "font-minimal", xsmall: "font-xsmall", small: "font-small", normal: "font-normal", large: "font-large", xlarge: "font-xlarge" },
    ui: { minimal: "ui-minimal", tiny: "ui-minimal", xcompact: "ui-xcompact", compact: "ui-compact", normal: "ui-normal", comfortable: "ui-comfortable", large: "ui-large" },
    buttons: { minimal: "buttons-minimal", tiny: "buttons-minimal", xsmall: "buttons-xsmall", small: "buttons-small", normal: "buttons-normal", large: "buttons-large", xlarge: "buttons-xlarge" },
    icons: { minimal: "icons-minimal", tiny: "icons-minimal", xsmall: "icons-xsmall", small: "icons-small", normal: "icons-normal", large: "icons-large" },
    layout: { full: "layout-full", normal: "layout-normal", narrow: "layout-narrow", xnarrow: "layout-xnarrow", minimal: "layout-minimal" },
    tiles: { auto: "tiles-auto", two: "tiles-two", one: "tiles-one", compact: "tiles-compact" }
  };

  function normalizeUiClass(value, prefix, fallback) {
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    const prefixed = raw.startsWith(`${prefix}-`) ? raw : `${prefix}-${raw}`;
    const legacyKey = raw.replace(`${prefix}-`, "");
    const compatible = UI_LEGACY_VALUES[prefix]?.[legacyKey] || prefixed;
    return UI_CLASS_VALUES[prefix]?.includes(compatible) ? compatible : fallback;
  }
  function normalizeUiSettings(settings = getUiSettings()) {
    const uiScale = normalizeUiClass(settings.uiScale, "ui", "ui-normal");
    const buttonSize = normalizeUiClass(settings.buttonSize, "buttons", "buttons-normal");
    const iconSize = normalizeUiClass(settings.iconSize, "icons", "icons-normal");
    const layoutWidth = normalizeUiClass(settings.layoutWidth, "layout", "layout-normal");
    return {
      ...settings,
      fontSize: normalizeUiClass(settings.fontSize, "font", "font-normal"),
      uiScale: uiScale === "ui-minimal" ? "ui-normal" : uiScale,
      buttonSize: buttonSize === "buttons-minimal" ? "buttons-normal" : buttonSize,
      iconSize: iconSize === "icons-minimal" ? "icons-normal" : iconSize,
      layoutWidth: layoutWidth === "layout-minimal" ? "layout-normal" : layoutWidth,
      tileLayout: normalizeUiClass(settings.tileLayout, "tiles", "tiles-auto")
    };
  }
  function saveUiSettingsPatch(patch, manual = true) {
    setUiSettings({ ...normalizeUiSettings(), ...patch, uiTouched: manual || !!normalizeUiSettings().uiTouched });
  }
  function applyUiPreset(preset) {
    saveUiSettingsPatch(preset, true);
    applyUiSettings();
    renderUserPanel();
  }
  function getLayoutBreakpoint() {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    if (width <= 375) return "tight";
    if (width <= 430) return "narrow";
    if (width >= 760) return "wide";
    return "standard";
  }

  function updateViewportLayoutClasses() {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const narrow = width <= 430;
    const tight = width <= 375;
    document.documentElement.classList.toggle("viewport-narrow", narrow);
    document.documentElement.classList.toggle("viewport-tight", tight);
    return { narrow, tight };
  }

  function applyUiSettings() {
    updateViewportLayoutClasses();
    const settings = normalizeUiSettings();
    document.documentElement.classList.remove(
      "font-minimal", "font-xsmall", "font-small", "font-normal", "font-large", "font-xlarge",
      "ui-minimal", "ui-xcompact", "ui-compact", "ui-normal", "ui-comfortable", "ui-large",
      "buttons-minimal", "buttons-xsmall", "buttons-small", "buttons-normal", "buttons-large", "buttons-xlarge",
      "icons-minimal", "icons-xsmall", "icons-small", "icons-normal", "icons-large",
      "layout-full", "layout-normal", "layout-narrow", "layout-xnarrow", "layout-minimal",
      "tiles-auto", "tiles-two", "tiles-one", "tiles-compact"
    );
    document.documentElement.classList.add(settings.fontSize, settings.uiScale, settings.buttonSize, settings.iconSize, settings.layoutWidth, settings.tileLayout);
    document.body?.classList.toggle("field-mode", !!settings.fieldMode);
    const select = document.querySelector("#ui-font-size");
    if (select) select.value = settings.fontSize;
    const scaleSelect = document.querySelector("#ui-scale");
    if (scaleSelect) scaleSelect.value = settings.uiScale;
    const buttonSelect = document.querySelector("#ui-button-size");
    if (buttonSelect) buttonSelect.value = settings.buttonSize;
    const iconSelect = document.querySelector("#ui-icon-size");
    if (iconSelect) iconSelect.value = settings.iconSize;
    const layoutSelect = document.querySelector("#ui-layout-width");
    if (layoutSelect) layoutSelect.value = settings.layoutWidth;
    const tileSelect = document.querySelector("#ui-tile-layout");
    if (tileSelect) tileSelect.value = settings.tileLayout;
    const fieldMode = document.querySelector("#field-mode-toggle");
    if (fieldMode) fieldMode.checked = !!settings.fieldMode;
  }


  function describeOverflowElement(el) {
    const rect = el.getBoundingClientRect();
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || "",
      className: typeof el.className === "string" ? el.className : "",
      width: Math.round(rect.width * 10) / 10,
      right: Math.round(rect.right * 10) / 10,
      left: Math.round(rect.left * 10) / 10,
      windowInnerWidth: window.innerWidth || 0
    };
  }

  function detectHorizontalOverflow({ outline = false } = {}) {
    $$(".overflow-debug-outline").forEach((el) => el.classList.remove("overflow-debug-outline"));
    const viewport = window.innerWidth || document.documentElement.clientWidth || 0;
    const overflowing = $$('body *').filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && (rect.right > viewport + 1 || rect.left < -1);
    }).map(describeOverflowElement).sort((a, b) => (b.right - b.windowInnerWidth) - (a.right - a.windowInnerWidth));
    if (outline) {
      $$('body *').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && (rect.right > viewport + 1 || rect.left < -1)) el.classList.add("overflow-debug-outline");
      });
    }
    return overflowing;
  }

  function getHorizontalOverflowDiagnostics() {
    const innerWidth = window.innerWidth || 0;
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = doc?.scrollWidth || 0;
    const bodyScrollWidth = body?.scrollWidth || 0;
    const overflowItems = detectHorizontalOverflow();
    return {
      innerWidth,
      clientWidth: doc?.clientWidth || 0,
      scrollWidth,
      bodyScrollWidth,
      scrollDelta: Math.max(scrollWidth, bodyScrollWidth) - innerWidth,
      overflowItems,
      biggest: overflowItems[0] || null
    };
  }

  function isStandaloneApp() {
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  }

  function updateInstallStatus(message) {
    const status = $("#install-status");
    if (!status) return;
    status.textContent = message || (isStandaloneApp()
      ? "Aplikacja działa jako zainstalowana."
      : "Jeśli przycisk instalacji nie uruchamia systemowego okna, użyj menu przeglądarki: Chrome/Brave ⋮ → Zainstaluj aplikację albo Dodaj do ekranu głównego.");
  }

  async function installApp() {
    if (isStandaloneApp()) {
      updateInstallStatus("Aplikacja działa jako zainstalowana.");
      alert("Aplikacja działa jako zainstalowana.");
      return;
    }
    if (deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      updateInstallStatus(choice?.outcome === "accepted"
        ? "Instalacja aplikacji została uruchomiona."
        : "Instalacja została anulowana. Możesz użyć menu przeglądarki, aby dodać aplikację do ekranu głównego.");
      return;
    }
    const manual = "Chrome/Brave: Menu ⋮ → Zainstaluj aplikację albo Dodaj do ekranu głównego. iPhone/Safari: Udostępnij → Do ekranu początkowego.";
    updateInstallStatus(`Ta przeglądarka nie udostępniła automatycznego okna instalacji. ${manual}`);
    alert(manual);
  }
  function getSyncAuthHeaders(cfg = getSyncConfig()) {
    const token = getUserToken() || cfg.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function readApiError(res, fallback) {
    try {
      const data = await res.clone().json();
      return data?.error || fallback;
    } catch {
      return fallback;
    }
  }

  async function clearAppCaches() {
    if (!("caches" in window)) return [];
    const keys = await caches.keys();
    const appKeys = keys.filter((key) => key.startsWith("sieweczka-") && key !== ORTO_OFFLINE_CACHE);
    await Promise.all(appKeys.map((key) => caches.delete(key)));
    return appKeys;
  }

  async function checkForAppUpdate() {
    if (!("serviceWorker" in navigator)) return "Aplikacja jest aktualna.";
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return "Aplikacja jest aktualna.";
    await registration.update();
    return registration.waiting || registration.installing
      ? "Dostępna jest nowa wersja aplikacji. Kliknij, aby odświeżyć."
      : "Aplikacja jest aktualna.";
  }

  async function refreshAppVersion() {
    let shouldReload = true;
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
          shouldReload = false;
        }
      }
    }
    await clearAppCaches();
    if (shouldReload) window.location.reload();
  }
  function getLastSyncAt() { try { return JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || "{}").lastSyncAt || null; } catch { return null; } }
  function setLastSyncAt(v) { localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({ lastSyncAt: v })); }
  async function testSyncConnection() {
    const cfg = getSyncConfig();
    const res = await fetch(`${getSyncApiBase(cfg)}/health`, { headers: getSyncAuthHeaders(cfg) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  async function syncNow() {
    const cfg = getSyncConfig();
    if (!(getUserToken() || cfg.token)) throw new Error("Brak konfiguracji synchronizacji");
    const apiBase = getSyncApiBase(cfg);
    const entries = getEntries();
    const workingNests = getWorkingNests();
    const payload = { clientId: getClientId(), lastSyncAt: getLastSyncAt(), records: entries, workingNests };
    const res = await fetch(`${apiBase}/api/sync`, { method: "POST", headers: { "Content-Type": "application/json", ...getSyncAuthHeaders(cfg) }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`Sync HTTP ${res.status}`);
    const data = await res.json();
    const local = new Map(getEntries().map((r)=>[String(r.uid), r]));
    for (const rec of (data.records || [])) {
      const existing = local.get(String(rec.uid));
      if (!existing || new Date(rec.updatedAt || 0) >= new Date(existing.updatedAt || 0)) local.set(String(rec.uid), normalizeEntry(rec));
    }
    setEntries(Array.from(local.values()));
    const localWorking = new Map(getWorkingNests().map((w)=>[String(w.id), normalizeWorkingNest(w)]));
    for (const wn of (data.workingNests || [])) {
      const incoming = normalizeWorkingNest(wn);
      const existing = localWorking.get(String(incoming.id));
      if (!existing || new Date(incoming.updatedAt || 0) >= new Date(existing.updatedAt || 0)) localWorking.set(String(incoming.id), incoming);
    }
    setWorkingNests(Array.from(localWorking.values()));
    if (workingMap) renderWorkingMap();
    setLastSyncAt(data.serverTime || new Date().toISOString());
    try {
      await syncPhotoMetadataFromServer(getEntries(), getWorkingNests());
      data.photoSync = await uploadPendingPhotos();
    } catch (error) {
      data.photoSync = { ok: false, ...getPhotoSyncSummary(), errorMessage: error.message };
    }
    return data;
  }
  function markSyncStatus(uid, status) {
    const entries = getEntries();
    const i = entries.findIndex((e)=>String(e.uid)===String(uid));
    if (i >= 0) { entries[i].syncStatus = status; setEntries(entries); }
  }
  function setupSyncUI() {
    const cfg = getSyncConfig();
    setValue("#sync-api-url", cfg.apiUrl || DEFAULT_API_URL);
    setValue("#sync-token", cfg.token || "");
    $("#sync-save-config")?.addEventListener("click", () => {
      setSyncConfig({ apiUrl: trim("#sync-api-url"), token: trim("#sync-token") });
      $("#sync-status").textContent = "Zapisano ustawienia synchronizacji.";
    });
    $("#sync-test-connection")?.addEventListener("click", async () => {
      try { await testSyncConnection(); $("#sync-status").textContent = "Połączenie OK."; } catch (e) { $("#sync-status").textContent = `Błąd: ${e.message}`; }
    });
    $("#sync-now")?.addEventListener("click", async () => {
      try {
        const result = await syncNow();
        $("#sync-status").textContent = `Synchronizacja zakończona. ${formatPhotoSyncStatus(result.photoSync)}`;
        renderEntries();
      } catch (e) { $("#sync-status").textContent = `Błąd synchronizacji: ${e.message}`; }
    });
    $("#home-sync-now")?.addEventListener("click", async () => {
      try {
        const result = await syncNow();
        $("#sync-status").textContent = `Synchronizacja zakończona. ${formatPhotoSyncStatus(result.photoSync)}`;
        renderEntries();
        updateCounts();
      } catch (e) {
        $("#sync-status").textContent = `Błąd synchronizacji: ${e.message}`;
      }
    });
    window.addEventListener("online", () => { syncNow().catch(()=>{}); });
  }

  async function loginUser() {
    const cfg = getSyncConfig();
    setValue("#sync-api-url", cfg.apiUrl || DEFAULT_API_URL);
    const apiBase = getSyncApiBase(cfg);
    const res = await fetch(`${apiBase}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trim("#login-email"), password: value("#login-password") })
    });
    if (!res.ok) throw new Error(`Logowanie HTTP ${res.status}`);
    const data = await res.json();
    setAuthState({ token: data.token, user: data.user, loggedAt: new Date().toISOString() });
    return data.user;
  }

  async function changeOwnPassword() {
    const currentPassword = value("#change-current-password");
    const newPassword = value("#change-new-password");
    const repeat = value("#change-repeat-password");
    if (newPassword.length < 8) throw new Error("Nowe hasło musi mieć co najmniej 8 znaków.");
    if (newPassword !== repeat) throw new Error("Nowe hasła nie są takie same.");
    const cfg = getSyncConfig();
    const res = await fetch(`${getSyncApiBase(cfg)}/api/me/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getSyncAuthHeaders(cfg) },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!res.ok) throw new Error(await readApiError(res, `Change password HTTP ${res.status}`));
    const state = getAuthState();
    setAuthState({ ...state, user: { ...state.user, must_change_password: false } });
  }

  async function fetchMe() {
    const cfg = getSyncConfig();
    const apiBase = getSyncApiBase(cfg);
    if (!apiBase || !getUserToken()) return null;
    const res = await fetch(`${apiBase}/api/me`, { headers: getSyncAuthHeaders(cfg) });
    if (!res.ok) throw new Error(`Me HTTP ${res.status}`);
    const data = await res.json();
    setAuthState({ ...getAuthState(), user: data.user });
    return data.user;
  }

  function renderUserPanel() {
    const user = getCurrentUser();
    const details = $("#user-details");
    if (details) {
      details.innerHTML = user ? `
        <p><strong>${escapeHtml(user.name)}</strong></p>
        <p>${escapeHtml(user.email)}</p>
        <p>Rola: <strong>${escapeHtml(user.role)}</strong></p>
        <p>Wersja aplikacji: ${escapeHtml(APP_VERSION)}</p>
        <p>${formatPhotoSyncStatus(getPhotoSyncSummary())}</p>
        <p>Status: ${navigator.onLine ? "online" : "offline"}</p>
      ` : `<p>Brak zalogowanego użytkownika.</p>`;
    }
    $("#open-admin")?.toggleAttribute("hidden", true);
    $("#open-user")?.toggleAttribute("hidden", true);
    $("#home-help-link")?.toggleAttribute("hidden", true);
    $("#sync-settings")?.toggleAttribute("hidden", !isAdmin());
    $("#sync-token-label")?.toggleAttribute("hidden", !isAdmin());
    ["#export-csv", "#export-json", "#export-zip", "#export-zip-photos", "#export-kml"].forEach((selector) => {
      const el = $(selector);
      if (el) el.hidden = !(isAdmin() || getCurrentUser()?.role === "coordinator");
    });
    const diagnostics = $("#ui-diagnostics");
    if (diagnostics) {
      const settings = normalizeUiSettings();
      const styles = getComputedStyle(document.documentElement);
      const cssVar = (name) => styles.getPropertyValue(name).trim() || "—";
      const userAgent = navigator.userAgent || "—";
      const shortUserAgent = userAgent.length > 150 ? `${userAgent.slice(0, 147)}…` : userAgent;
      const overflowDiagnostics = getHorizontalOverflowDiagnostics();
      diagnostics.innerHTML = [
        `window.innerWidth: <strong>${window.innerWidth}px</strong>`,
        `window.innerHeight: <strong>${window.innerHeight}px</strong>`,
        `document.documentElement.clientWidth: <strong>${overflowDiagnostics.clientWidth}px</strong>`,
        `document.documentElement.scrollWidth: <strong>${overflowDiagnostics.scrollWidth}px</strong>`,
        `document.body.scrollWidth: <strong>${overflowDiagnostics.bodyScrollWidth}px</strong>`,
        `różnica scrollWidth - innerWidth: <strong>${overflowDiagnostics.scrollDelta}px</strong>`,
        `elementy overflow: <strong>${overflowDiagnostics.overflowItems.length}</strong>`,
        `największy overflow: <span>${escapeHtml(overflowDiagnostics.biggest ? `${overflowDiagnostics.biggest.tagName}${overflowDiagnostics.biggest.id ? "#" + overflowDiagnostics.biggest.id : ""}${overflowDiagnostics.biggest.className ? "." + overflowDiagnostics.biggest.className.replace(/\s+/g, ".") : ""} width=${overflowDiagnostics.biggest.width} right=${overflowDiagnostics.biggest.right}` : "—")}</span>`,
        overflowDiagnostics.scrollDelta > 1 ? `<strong class="warning-text">Wykryto poziome przewijanie. Użyj trybu minimalnego albo zgłoś diagnostykę administratorowi.</strong>` : `poziome przewijanie: <strong>nie wykryto</strong>`,
        `devicePixelRatio: <strong>${window.devicePixelRatio || 1}</strong>`,
        `PWA standalone: <strong>${isStandaloneApp() ? "tak" : "nie"}</strong>`,
        `APP_VERSION: <strong>${escapeHtml(APP_VERSION)}</strong>`,
        `aktywny preset: <strong>${escapeHtml(settings.activePreset || "ręczne / brak")}</strong>`,
        `viewport-narrow: <strong>${document.documentElement.classList.contains("viewport-narrow") ? "tak" : "nie"}</strong>`,
        `viewport-tight: <strong>${document.documentElement.classList.contains("viewport-tight") ? "tak" : "nie"}</strong>`,
        `layout breakpoint: <strong>${escapeHtml(getLayoutBreakpoint())}</strong>`,
        `Aktualne ustawienia UI: <strong>${escapeHtml([settings.fontSize, settings.uiScale, settings.buttonSize, settings.iconSize, settings.layoutWidth, settings.tileLayout].join(" / "))}</strong>`,
        `Szerokość układu: <strong>${escapeHtml(settings.layoutWidth)}</strong>`,
        `Układ kafelków: <strong>${escapeHtml(settings.tileLayout)}</strong>`,
        `Klasy HTML: <span>${escapeHtml(Array.from(document.documentElement.classList).join(" ") || "—")}</span>`,
        `--ui-scale: <strong>${escapeHtml(cssVar("--ui-scale"))}</strong>`,
        `--space-scale: <strong>${escapeHtml(cssVar("--space-scale"))}</strong>`,
        `--card-padding: <strong>${escapeHtml(cssVar("--card-padding"))}</strong>`,
        `--button-min-height: <strong>${escapeHtml(cssVar("--button-min-height"))}</strong>`,
        `--button-font-size: <strong>${escapeHtml(cssVar("--button-font-size"))}</strong>`,
        `--tile-padding: <strong>${escapeHtml(cssVar("--tile-padding"))}</strong>`,
        `--app-max-width: <strong>${escapeHtml(cssVar("--app-max-width"))}</strong>`,
        `--card-max-width: <strong>${escapeHtml(cssVar("--card-max-width"))}</strong>`,
        `--menu-width: <strong>${escapeHtml(cssVar("--menu-width"))}</strong>`,
        `--menu-button-height: <strong>${escapeHtml(cssVar("--menu-button-height"))}</strong>`,
        `--icon-size: <strong>${escapeHtml(cssVar("--icon-size"))}</strong>`,
        `--tile-icon-size: <strong>${escapeHtml(cssVar("--tile-icon-size"))}</strong>`,
        `UserAgent: <span>${escapeHtml(shortUserAgent)}</span>`
      ].join("<br>");
    }
    updateInstallStatus();
  }

  function renderHomeSummary() {
    const user = getCurrentUser();
    const photoSummary = getPhotoSyncSummary();
    const lastSync = getLastSyncAt();
    const onlineText = navigator.onLine ? "Online" : "Offline — dane zostaną zapisane lokalnie";
    const setText = (selector, text) => { const el = $(selector); if (el) el.textContent = text; };
    setText("#home-user-name", user?.name || "—");
    setText("#home-user-role", user?.role || "—");
    setText("#home-online-status", onlineText);
    setText("#home-last-sync", lastSync ? new Date(lastSync).toLocaleString("pl-PL") : "—");
    setText("#home-photo-pending", String(photoSummary.pending || 0));
    updateDraftResumeButton();
  }

  function closeAppMenu() {
    $("#app-menu-modal")?.remove();
  }

  function openAppMenu() {
    closeAppMenu();
    const canExport = isAdmin() || getCurrentUser()?.role === "coordinator";
    const modal = document.createElement("div");
    modal.id = "app-menu-modal";
    modal.className = "app-menu-modal";
    modal.innerHTML = `
      <div class="app-menu-panel" role="dialog" aria-modal="true" aria-label="Menu aplikacji">
        <div class="app-menu-actions">
          <button type="button" class="ghost-light small" data-menu-action="close">Zamknij</button>
        </div>
        <button type="button" data-menu-action="home">Menu główne</button>
        <button type="button" data-menu-action="sync">Synchronizacja</button>
        ${canExport ? `<button type="button" data-menu-action="export">Eksport</button>` : ""}
        ${isAdmin() ? `<button type="button" data-menu-action="admin">Administrator</button>` : ""}
        <button type="button" data-menu-action="settings">Ustawienia</button>
        <button type="button" data-menu-action="install">Zainstaluj aplikację</button>
        <a class="button-like" href="instrukcja_terenowa_sieweczka.pdf" download>Pomoc</a>
        <button type="button" data-menu-action="refresh">Odśwież wersję aplikacji</button>
        <button type="button" class="danger" data-menu-action="logout">Wyloguj</button>
      </div>
    `;
    const onKey = (event) => {
      if (event.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        closeAppMenu();
      }
    };
    document.addEventListener("keydown", onKey);
    const closeForNavigation = () => {
      document.removeEventListener("keydown", onKey);
      closeAppMenu();
    };
    modal.addEventListener("click", async (event) => {
      if (event.target === modal) return;
      if (event.target.closest("a")) return;
      const actionButton = event.target.closest("[data-menu-action]");
      const action = actionButton?.dataset.menuAction;
      if (!action) return;
      if (action === "close") { document.removeEventListener("keydown", onKey); closeAppMenu(); return; }
      const needsFormExit = ["home", "settings", "admin", "export", "install"].includes(action);
      if (needsFormExit && !$("#form-screen")?.hidden) {
        const leftForm = await goHomeFromMaybeForm();
        if (!leftForm) return;
      }
      if (action === "home") { closeForNavigation(); showView("home"); }
      if (action === "settings") { closeForNavigation(); userPanelReturnToMenu = true; renderUserPanel(); showView("user"); }
      if (action === "admin") { closeForNavigation(); showView("admin"); await loadAdminUsers({ force: true }).catch((error) => { $("#admin-users-status").textContent = `Błąd: ${error.message}`; }); }
      if (action === "sync") {
        const previousText = actionButton.textContent;
        actionButton.textContent = "Synchronizuję...";
        actionButton.disabled = true;
        try {
          const result = await syncNow();
          actionButton.textContent = `Synchronizacja OK. ${formatPhotoSyncStatus(result.photoSync)}`;
          renderEntries();
          updateCounts();
          renderHomeSummary();
        } catch (error) {
          actionButton.textContent = `Błąd synchronizacji: ${error.message || error}`;
        } finally {
          setTimeout(() => {
            actionButton.disabled = false;
            actionButton.textContent = previousText;
          }, 4500);
        }
      }
      if (action === "export") {
        closeForNavigation();
        exportPanelReturnToMenu = true;
        showView("export");
      }
      if (action === "install") { closeForNavigation(); userPanelReturnToMenu = true; renderUserPanel(); showView("user"); await installApp(); }
      if (action === "refresh") $("#refresh-app-version")?.click();
      if (action === "logout") { closeForNavigation(); $("#logout")?.click(); }
    });
    document.body.appendChild(modal);
    modal.querySelector("[data-menu-action='close']")?.focus();
  }

  async function loadAdminUsers(options = {}) {
    if (!isAdmin()) {
      $("#admin-users-status").textContent = "Brak uprawnień administratora.";
      renderAdminUsers([]);
      return;
    }
    $("#admin-users-status").textContent = "Pobieram listę użytkowników...";
    const cfg = getSyncConfig();
    const apiBase = getSyncApiBase(cfg);
    const res = await fetch(`${apiBase}/api/users?_ts=${Date.now()}`, { headers: getSyncAuthHeaders(cfg), cache: "no-store" });
    if (!res.ok) throw new Error(await readApiError(res, `Users HTTP ${res.status}`));
    const data = await res.json();
    renderAdminUsers(data.users || []);
    $("#admin-users-status").textContent = "Lista użytkowników odświeżona.";
  }

  function renderAdminUsers(users) {
    const list = $("#admin-users-list");
    if (!list) return;
    const currentUserId = getCurrentUser()?.id;
    list.innerHTML = users.map((user) => `
      <article class="entry-card">
        <div class="entry-main">
          <h3>${escapeHtml(user.name)}</h3>
          <p>ID: ${escapeHtml(user.id)}</p>
          <p>${escapeHtml(user.email)} • ${escapeHtml(user.role)} • ${user.is_active ? "aktywny" : "nieaktywny"}${user.id === currentUserId ? " • To jest Twoje konto" : ""}</p>
          <p class="muted">Utworzono: ${escapeHtml(user.created_at || "—")} • Aktualizacja: ${escapeHtml(user.updated_at || "—")} • Ostatnie logowanie: ${escapeHtml(user.last_login_at || "—")}</p>
          <p class="muted">Zaproszenie: ${escapeHtml(user.invite_sent_at || "nie wysłano")} • Zmiana hasła: ${user.must_change_password ? "wymagana" : "nie"}</p>
        </div>
        <div class="entry-actions">
          ${user.id === currentUserId ? "" : `<select data-admin-action="role" data-user-id="${escapeHtml(user.id)}">
            ${["observer","coordinator","admin"].map((role) => `<option value="${role}"${role === user.role ? " selected" : ""}>${role}</option>`).join("")}
          </select>`}
          <button type="button" data-admin-action="reset" data-user-id="${escapeHtml(user.id)}">Reset hasła</button>
          <button type="button" data-admin-action="invite" data-user-id="${escapeHtml(user.id)}">Wyślij zaproszenie</button>
          ${user.id === currentUserId ? "" : `<button type="button" class="${user.is_active ? "danger" : ""}" data-admin-action="${user.is_active ? "deactivate" : "activate"}" data-user-id="${escapeHtml(user.id)}">${user.is_active ? "Dezaktywuj" : "Aktywuj"}</button>`}
        </div>
      </article>
    `).join("") || `<p class="muted">Brak użytkowników.</p>`;
  }

  function renderAdminDeletedRecords(records) {
    const list = $("#admin-deleted-records-list");
    if (!list) return;
    list.innerHTML = (records || []).map((record) => `
      <article class="entry-card">
        <div class="entry-main">
          <h3>${escapeHtml(record.nestId || "(bez ID)")}</h3>
          <p>${escapeHtml(LABELS.species?.[record.species] || record.species || "—")} • ${escapeHtml(record.obsDate || "—")} • obserwator: ${escapeHtml(record.observer || "—")}</p>
          <p>Sektor: ${escapeHtml(record.sector || record.payload?.sector || "—")} • UID: ${escapeHtml(record.uid || "—")}</p>
          <p class="muted">Ukryto: ${escapeHtml(record.deletedAt || "—")} • przez: ${escapeHtml(record.deletedBy || "—")}</p>
          <p class="muted">Powód: ${escapeHtml(record.deleteReason || "—")}</p>
        </div>
        <div class="entry-actions">
          <button type="button" data-admin-restore-record="${escapeHtml(record.uid || "")}">Przywróć</button>
        </div>
      </article>
    `).join("") || `<p class="muted">Brak ukrytych wpisów.</p>`;
  }

  async function loadAdminDeletedRecords() {
    if (!isAdmin()) {
      $("#admin-deleted-records-status").textContent = "Brak uprawnień administratora.";
      renderAdminDeletedRecords([]);
      return;
    }
    $("#admin-deleted-records-status").textContent = "Pobieram ukryte wpisy...";
    const cfg = getSyncConfig();
    const apiBase = getSyncApiBase(cfg);
    const res = await fetch(`${apiBase}/api/admin/deleted-records?_ts=${Date.now()}`, { headers: getSyncAuthHeaders(cfg), cache: "no-store" });
    if (res.status === 403) throw new Error("Brak uprawnień administratora.");
    if (!res.ok) throw new Error(await readApiError(res, `Deleted records HTTP ${res.status}`));
    const data = await res.json();
    renderAdminDeletedRecords(data.records || []);
    $("#admin-deleted-records-status").textContent = (data.records || []).length ? "Lista ukrytych wpisów odświeżona." : "Brak ukrytych wpisów.";
  }

  async function restoreAdminDeletedRecord(uid) {
    if (!uid) return;
    if (!confirm("Czy na pewno chcesz przywrócić ten rekord? Po synchronizacji będzie ponownie widoczny dla użytkowników.")) return;
    const cfg = getSyncConfig();
    const apiBase = getSyncApiBase(cfg);
    const res = await fetch(`${apiBase}/api/records/${encodeURIComponent(uid)}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getSyncAuthHeaders(cfg) },
      body: "{}"
    });
    if (res.status === 403) throw new Error("Brak uprawnień administratora.");
    if (!res.ok) throw new Error(await readApiError(res, `Restore HTTP ${res.status}`));
    const data = await res.json();
    if (data.record) {
      const restored = normalizeEntry(data.record);
      const entries = getEntries();
      const idx = entries.findIndex((entry) => String(entry.uid) === String(restored.uid));
      if (idx >= 0) entries[idx] = restored;
      else entries.unshift(restored);
      setEntries(entries);
    }
    renderEntries();
    updateCounts();
    await loadAdminDeletedRecords();
    $("#admin-deleted-records-status").textContent = "Rekord przywrócony.";
  }

  function setupAuthUI() {
    $("#login-submit")?.addEventListener("click", async () => {
      try {
        const user = await loginUser();
        $("#login-status").textContent = `Zalogowano: ${user.name}`;
        renderUserPanel();
        showView(user.must_change_password ? "change-password" : "home");
      } catch (error) {
        $("#login-status").textContent = "Nie można połączyć się z serwerem. Sprawdź internet albo skontaktuj się z administratorem.";
      }
    });
    $("#change-password-submit")?.addEventListener("click", async () => {
      try {
        await changeOwnPassword();
        $("#change-password-status").textContent = "Hasło zmienione.";
        renderUserPanel();
        showView("home");
      } catch (error) {
        $("#change-password-status").textContent = `Nie udało się zmienić hasła: ${error.message}`;
      }
    });
    $("#logout")?.addEventListener("click", () => {
      clearAuthState();
      renderUserPanel();
      showView("login");
    });
    $("#open-user")?.addEventListener("click", () => { userPanelReturnToMenu = false; renderUserPanel(); showView("user"); });
    $("#open-admin")?.addEventListener("click", async () => {
      showView("admin");
      try { await loadAdminUsers({ force: true }); } catch (e) { $("#admin-users-status").textContent = `Błąd: ${e.message}`; }
    });
    $("#admin-refresh-users")?.addEventListener("click", async () => {
      try { await loadAdminUsers({ force: true }); } catch (e) { $("#admin-users-status").textContent = `Błąd: ${e.message}`; }
    });
    $("#admin-load-deleted-records")?.addEventListener("click", async () => {
      try { await loadAdminDeletedRecords(); } catch (e) { $("#admin-deleted-records-status").textContent = `Błąd: ${e.message}`; }
    });
    $("#admin-refresh-deleted-records")?.addEventListener("click", async () => {
      try { await loadAdminDeletedRecords(); } catch (e) { $("#admin-deleted-records-status").textContent = `Błąd: ${e.message}`; }
    });
    $("#check-app-update")?.addEventListener("click", async () => {
      try { $("#app-update-status").textContent = await checkForAppUpdate(); } catch (e) { $("#app-update-status").textContent = `Nie udało się sprawdzić aktualizacji: ${e.message}`; }
    });
    $("#refresh-app-version")?.addEventListener("click", async () => {
      try {
        $("#app-update-status").textContent = "Odświeżam wersję aplikacji...";
        await refreshAppVersion();
      } catch (e) {
        $("#app-update-status").textContent = `Nie udało się odświeżyć wersji aplikacji: ${e.message}`;
      }
    });
    $("#install-app")?.addEventListener("click", () => installApp().catch((e) => updateInstallStatus(`Nie udało się uruchomić instalacji: ${e.message}`)));
    $("#admin-create-user")?.addEventListener("click", async () => {
      try {
        const cfg = getSyncConfig();
        const apiBase = getSyncApiBase(cfg);
        const res = await fetch(`${apiBase}/api/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getSyncAuthHeaders(cfg) },
          body: JSON.stringify({ name: trim("#admin-user-name"), email: trim("#admin-user-email"), role: value("#admin-user-role", "observer"), password: value("#admin-user-password") })
        });
        if (!res.ok) throw new Error(await readApiError(res, `Create HTTP ${res.status}`));
        $("#admin-users-status").textContent = "Utworzono użytkownika.";
        ["#admin-user-name", "#admin-user-email", "#admin-user-password"].forEach((selector) => setValue(selector, ""));
        setValue("#admin-user-role", "observer");
        await loadAdminUsers({ force: true });
      } catch (e) {
        $("#admin-users-status").textContent = `Błąd: ${e.message}`;
      }
    });
    $("#admin-users-list")?.addEventListener("change", async (event) => {
      const select = event.target.closest("select[data-admin-action='role']");
      if (!select) return;
      if (!confirm("Czy na pewno chcesz zmienić rolę tego użytkownika?")) { await loadAdminUsers({ force: true }); return; }
      try {
        await adminPatchUser(select.dataset.userId, { role: select.value });
        await loadAdminUsers({ force: true });
      } catch (e) {
        $("#admin-users-status").textContent = `Błąd: ${e.message}`;
        await loadAdminUsers({ force: true });
      }
    });
    $("#admin-users-list")?.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-admin-action][data-user-id]");
      if (!btn || btn.tagName === "SELECT") return;
      const action = btn.dataset.adminAction;
      try {
        let finalStatus = "";
        if (action === "reset") {
          const password = prompt("Nowe hasło dla użytkownika (min. 8 znaków):");
          if (!password) return;
          await adminPost(`users/${btn.dataset.userId}/reset-password`, { password });
          finalStatus = "Hasło zresetowane.";
        } else if (action === "invite") {
          const result = await adminPost(`users/${btn.dataset.userId}/send-invite`, {});
          if (result?.sent) {
            finalStatus = "Zaproszenie wysłane.";
          } else if (result?.mailtoUrl) {
            finalStatus = "Nie skonfigurowano SMTP — otwieram wiadomość email do wysłania ręcznie.";
            window.location.href = result.mailtoUrl;
          }
        } else {
          await adminPost(`users/${btn.dataset.userId}/${action}`, {});
          finalStatus = "Operacja wykonana.";
        }
        await loadAdminUsers({ force: true });
        if (finalStatus) $("#admin-users-status").textContent = finalStatus;
      } catch (e) {
        $("#admin-users-status").textContent = `Błąd: ${e.message}`;
      }
    });
    $("#admin-deleted-records-list")?.addEventListener("click", async (event) => {
      const btn = event.target.closest("button[data-admin-restore-record]");
      if (!btn) return;
      try {
        await restoreAdminDeletedRecord(btn.dataset.adminRestoreRecord);
      } catch (e) {
        $("#admin-deleted-records-status").textContent = `Błąd: ${e.message}`;
      }
    });
    $("#ui-font-size")?.addEventListener("change", () => {
      saveUiSettingsPatch({ fontSize: value("#ui-font-size", "font-normal"), activePreset: "" });
      applyUiSettings();
      renderUserPanel();
    });
    $("#ui-scale")?.addEventListener("change", () => {
      saveUiSettingsPatch({ uiScale: value("#ui-scale", "ui-normal"), activePreset: "" });
      applyUiSettings();
      renderUserPanel();
    });
    $("#ui-button-size")?.addEventListener("change", () => {
      saveUiSettingsPatch({ buttonSize: value("#ui-button-size", "buttons-normal"), activePreset: "" });
      applyUiSettings();
      renderUserPanel();
    });
    $("#ui-icon-size")?.addEventListener("change", () => {
      saveUiSettingsPatch({ iconSize: value("#ui-icon-size", "icons-normal"), activePreset: "" });
      applyUiSettings();
      renderUserPanel();
    });
    $("#ui-layout-width")?.addEventListener("change", () => {
      saveUiSettingsPatch({ layoutWidth: value("#ui-layout-width", "layout-normal"), activePreset: "" });
      applyUiSettings();
      renderUserPanel();
    });
    $("#ui-tile-layout")?.addEventListener("change", () => {
      saveUiSettingsPatch({ tileLayout: value("#ui-tile-layout", "tiles-auto"), activePreset: "" });
      applyUiSettings();
      renderUserPanel();
    });
    $("#check-horizontal-overflow")?.addEventListener("click", () => {
      const items = detectHorizontalOverflow({ outline: true });
      const list = items.slice(0, 10).map((item, index) => `${index + 1}. ${item.tagName}${item.id ? "#" + item.id : ""}${item.className ? "." + item.className.replace(/\s+/g, ".") : ""} — width ${item.width}px, right ${item.right}px / viewport ${item.windowInnerWidth}px`).join("\n");
      const output = $("#horizontal-overflow-results");
      if (output) output.textContent = items.length ? `Znaleziono ${items.length} elementów:
${list}` : "Nie znaleziono elementów powodujących poziomy overflow.";
      renderUserPanel();
    });
    $("#preset-small-screen")?.addEventListener("click", () => {
      applyUiPreset({ activePreset: "Dopasuj do małego ekranu", uiScale: "ui-compact", buttonSize: "buttons-small", iconSize: "icons-small", fontSize: "font-small", layoutWidth: "layout-narrow", tileLayout: "tiles-auto" });
    });
    $("#preset-smallest-view")?.addEventListener("click", () => {
      applyUiPreset({ activePreset: "Najmniejszy widok", uiScale: "ui-xcompact", buttonSize: "buttons-xsmall", iconSize: "icons-xsmall", fontSize: "font-small", layoutWidth: "layout-xnarrow", tileLayout: "tiles-one" });
    });
    $("#preset-iphone-narrow")?.addEventListener("click", () => {
      applyUiPreset({ activePreset: "iPhone / wąski ekran", uiScale: "ui-compact", buttonSize: "buttons-small", iconSize: "icons-small", fontSize: "font-small", layoutWidth: "layout-normal", tileLayout: "tiles-one" });
    });
    $("#preset-standard-view")?.addEventListener("click", () => {
      applyUiPreset({ activePreset: "Widok standardowy", uiScale: "ui-normal", buttonSize: "buttons-normal", iconSize: "icons-normal", fontSize: "font-normal", layoutWidth: "layout-normal", tileLayout: "tiles-auto" });
    });
    $("#preset-comfort-view")?.addEventListener("click", () => {
      applyUiPreset({ activePreset: "Widok standardowy", uiScale: "ui-normal", buttonSize: "buttons-normal", iconSize: "icons-normal", fontSize: "font-normal", layoutWidth: "layout-normal", tileLayout: "tiles-auto" });
    });
    $("#field-mode-toggle")?.addEventListener("change", () => {
      saveUiSettingsPatch({ fieldMode: !!$("#field-mode-toggle")?.checked });
      applyUiSettings();
    });
  }

  async function adminPatchUser(id, patch) {
    const cfg = getSyncConfig();
    const apiBase = getSyncApiBase(cfg);
    const res = await fetch(`${apiBase}/api/users/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...getSyncAuthHeaders(cfg) }, body: JSON.stringify(patch) });
    if (!res.ok) throw new Error(await readApiError(res, `Admin HTTP ${res.status}`));
  }

  async function adminPost(path, body) {
    const cfg = getSyncConfig();
    const apiBase = getSyncApiBase(cfg);
    const res = await fetch(`${apiBase}/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...getSyncAuthHeaders(cfg) }, body: JSON.stringify(body || {}) });
    if (!res.ok) throw new Error(await readApiError(res, `Admin HTTP ${res.status}`));
    try { return await res.json(); } catch { return {}; }
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const value = (selector, fallback = "") => $(selector)?.value ?? fallback;
  const trim = (selector, fallback = "") => String(value(selector, fallback)).trim();
  const setValue = (selector, val = "") => {
    const el = $(selector);
    if (el) el.value = val ?? "";
  };
  const getNumber = (selector, fallback = null) => {
    const raw = value(selector, "");
    if (raw === "" || raw == null) return fallback;
    const n = Number(raw);
    return Number.isNaN(n) ? fallback : n;
  };
  const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
  const SPECIES_CODE_MAP = {
    "charadrius-hiaticula": "SOb",
    "charadrius-dubius": "SRz",
    "vanellus-vanellus": "Cz",
    "tringa-totanus": "Kr",
    "sternula-albifrons": "Rb",
    "chroicocephalus-ridibundus": "Sm",
    unknown: "SN",
  };

  const LABELS = {
    species: {
      "charadrius-hiaticula": "Sieweczka obrożna",
      "charadrius-dubius": "Sieweczka rzeczna",
      "vanellus-vanellus": "Czajka",
      "tringa-totanus": "Krwawodziób",
      "sternula-albifrons": "Rybitwa białoczelna",
      "chroicocephalus-ridibundus": "Śmieszka",
      unknown: "Nieokreślony",
    },
    nestStatus: {
      incubated: "Inkubacja",
      fresh: "Świeże zniesienie",
      unknown: "Nieznane",
    },
    yesNoUnknown: { yes: "Tak", no: "Nie", unknown: "Nie wiem" },
    yesNo: { yes: "Tak", no: "Nie" },
    substrate: {
      sand: "Piasek",
      "fine-gravel": "Drobny żwir",
      "coarse-gravel": "Gruby żwir",
      stones: "Kamienie",
      mixed: "Mieszane",
    },
    slope: { flat: "Płasko", slight: "Lekki spadek", steep: "Wyraźny spadek" },
    microrelief: {
      flat: "Płaskie",
      depression: "Lekkie zagłębienie",
      ridge: "Grzbiet/garb",
      "between-stones": "Między kamieniami",
    },
    rerollReason: {
      none: "Nie dotyczy",
      water: "Woda",
      "dense-vegetation": "Roślinność zwarta",
      "outside-habitat": "Poza dostępnym siedliskiem",
      other: "Inne",
    },
    assessment: {
      unknown: "Nieokreślone",
      field: "Teren / klasy szacunkowe",
      gis: "Ortofotomapa / GIS",
    },
    qcReaction: { weak: "Słaba", moderate: "Umiarkowana", strong: "Silna" },
    qcTime: { lt1: "< 1 min", "1to3": "1–3 min", gt3: "> 3 min" },
  };

  const PERCENT_GROUPS = {
    nest: {
      sumEl: "#nest-sum",
      rowsEl: '[data-group="nest"] .percent-rows',
      items: [
        ["nest-pct-sand", "Piasek"],
        ["nest-pct-fine-gravel", "Drobny żwir"],
        ["nest-pct-coarse", "Gruby żwir / kamienie"],
        ["nest-pct-shells", "Muszle"],
        ["nest-pct-live-veg", "Roślinność żywa"],
        ["nest-pct-dry-veg", "Roślinność sucha"],
        ["nest-pct-organic", "Drewno / szczątki"],
        ["nest-pct-anthro", "Antropogeniczne"],
      ],
    },
    random: {
      sumEl: "#random-sum",
      rowsEl: '[data-group="random"] .percent-rows',
      items: [
        ["random-pct-sand", "Piasek"],
        ["random-pct-fine-gravel", "Drobny żwir"],
        ["random-pct-coarse", "Gruby żwir / kamienie"],
        ["random-pct-shells", "Muszle"],
        ["random-pct-live-veg", "Roślinność żywa"],
        ["random-pct-dry-veg", "Roślinność sucha"],
        ["random-pct-organic", "Drewno / szczątki"],
        ["random-pct-anthro", "Antropogeniczne"],
      ],
    },
    meso: {
      sumEl: "#meso-sum",
      rowsEl: '[data-group="meso"] .percent-rows',
      items: [
        ["pct-sand", "Piasek"],
        ["pct-fine-gravel", "Żwir"],
        ["pct-gravel", "Kamienie"],
        ["pct-vegetation", "Roślinność"],
        ["pct-water", "Woda / podmokłość"],
        ["pct-other", "Muszle"],
      ],
    },
  };

  const FORM_STEP_TITLES = [
    "Identyfikacja",
    "GPS i zdjęcia gniazda",
    "Mikrohabitat gniazda",
    "Mezohabitat",
    "Punkt losowy 10 m",
    "Mikrohabitat punktu losowego",
    "Kontrola jakości",
    "Podsumowanie i zapis",
  ];

  let currentStep = 1;
  let editingUid = null;
  let readonlyUid = null;
  let editReturnToReadonly = false;
  let userPanelReturnToMenu = false;
  let exportPanelReturnToMenu = false;
  let recordsMap = null;
  let mapMarkersLayer = null;
  let mapFocusUid = null;
  const mapPointEditMode = { records: false, working: false };
  const mapPointEditControls = { records: null, working: null };
  const mapUserState = {
    records: { userLocationMarker: null, userAccuracyCircle: null, userHeadingMarker: null, hasAutoCenteredOnUser: false, isTrackingUser: false },
    working: { userLocationMarker: null, userAccuracyCircle: null, userHeadingMarker: null, hasAutoCenteredOnUser: false, isTrackingUser: false }
  };
  let latestUserLatLng = null;
  let latestUserAccuracy = null;
  let userLocationWatchId = null;
  let mapHeadingEnabled = false;
  let latestMapHeadingDeg = null;
  let mapHeadingOrientationHandler = null;
  let recordSpeciesLabelsVisible = true;
  let workingMap = null;
  let workingLayer = null;
  let activeMapFullscreen = null;
  let recordsGridLayer = null;
  let workingGridLayer = null;
  let gridGeoJsonData = null;
  let gridGeoJsonPromise = null;
  const gridStatus = { records: "", working: "" };
  let brysnaSmieckPointsGeojson = null;
  let brysnaSmieckPointsPromise = null;
  const brysnaSmieckLayerStates = {
    records: { layer: null, visible: false, map: null },
    working: { layer: null, visible: false, map: null }
  };
  let workingViewMode = "map";
  let workingFocusId = null;
  let editingWorkingId = null;
  let workingNotesVisible = true;
  let currentNestPhotos = [];
  let currentRandomPhotos = [];
  const photoUrlCache = new Map();
  const ortoCacheState = {
    records: { enabled: false, running: false, pending: false, timer: 0, stateTimer: 0, savedSession: 0, skippedSession: 0, dominikEnabled: false, dominikRunning: false, dominikPending: false, dominikTimer: 0, dominikSavedSession: 0, dominikSkippedSession: 0, lastZoom: null, dominikLastZoom: null, lastError: "", dominikLastError: "", bound: false, dominikBound: false, map: null, onlineLayer: null, offlineLayer: null, dominikOnlineLayer: null, dominikOfflineLayer: null, viewRestored: false, stateBound: false },
    working: { enabled: false, running: false, pending: false, timer: 0, stateTimer: 0, savedSession: 0, skippedSession: 0, dominikEnabled: false, dominikRunning: false, dominikPending: false, dominikTimer: 0, dominikSavedSession: 0, dominikSkippedSession: 0, lastZoom: null, dominikLastZoom: null, lastError: "", dominikLastError: "", bound: false, dominikBound: false, map: null, onlineLayer: null, offlineLayer: null, dominikOnlineLayer: null, dominikOfflineLayer: null, viewRestored: false, stateBound: false }
  };
  const measureStates = {
    records: { mode: "off", points: [], markers: [], line: null, polygon: null, finished: false, map: null, bound: false },
    working: { mode: "off", points: [], markers: [], line: null, polygon: null, finished: false, map: null, bound: false }
  };

  function getCachedPhotoUrl(ref) {
    const cached = photoUrlCache.get(String(ref || ""));
    return typeof cached === "string" ? cached : cached?.url || "";
  }

  function cachePhotoUrl(ref, url, source) {
    photoUrlCache.set(String(ref || ""), { url, source });
    return url;
  }

  function revokePhotoUrls(source = "server", keepRefs = []) {
    const keep = new Set(keepRefs.map(String));
    for (const [ref, cached] of photoUrlCache.entries()) {
      const item = typeof cached === "string" ? { url: cached, source: "local" } : cached;
      if (!item?.url || item.source !== source || keep.has(String(ref))) continue;
      URL.revokeObjectURL(item.url);
      photoUrlCache.delete(ref);
    }
  }

  async function loadGridGeoJson() {
    if (gridGeoJsonData) return gridGeoJsonData;
    if (!gridGeoJsonPromise) {
      gridGeoJsonPromise = fetch("data/grid_vanvan_wgs84.geojson", { cache: "no-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`Nie udało się załadować gridu: ${response.status}`);
          return response.json();
        })
        .then((json) => {
          validateGridGeoJson(json);
          gridGeoJsonData = json;
          return json;
        })
        .catch((error) => {
          console.error(error);
          setGridStatus("records", "Nie udało się załadować gridu.");
          setGridStatus("working", "Nie udało się załadować gridu.");
          gridGeoJsonPromise = null;
          return null;
        });
    }
    return gridGeoJsonPromise;
  }

  function setGridStatus(target, message) {
    gridStatus[target === "working" ? "working" : "records"] = message || "";
  }

  function setMapInfo(target, message) {
    const key = target === "working" ? "working" : "records";
    const el = $(key === "working" ? "#working-map-info" : "#map-info");
    if (!el) return;
    el.textContent = message || "";
  }

  function walkGridCoords(coords, cb) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") { cb(coords); return; }
    coords.forEach((item) => walkGridCoords(item, cb));
  }

  function validateGridGeoJson(json) {
    const features = json?.features || [];
    if (!features.length) {
      console.warn("Grid: plik data/grid_vanvan_wgs84.geojson nie zawiera pól.");
      return;
    }
    let invalid = false;
    let looksLikeEpsg2180 = false;
    for (const feature of features) {
      walkGridCoords(feature?.geometry?.coordinates, ([lon, lat]) => {
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) invalid = true;
        if (Math.abs(lon) > 1000 || Math.abs(lat) > 1000) looksLikeEpsg2180 = true;
      });
    }
    if (looksLikeEpsg2180) throw new Error("Grid wygląda na EPSG:2180. Leaflet wymaga EPSG:4326.");
    if (invalid) throw new Error("Grid ma współrzędne poza zakresem lon/lat. Wymagana konwersja do WGS84.");
  }

  async function addGridToMap(map, target) {
    if (!map || typeof L === "undefined") return null;
    const data = await loadGridGeoJson();
    if (!data) return null;
    const count = data.features?.length || 0;
    if (!count) {
      setGridStatus(target, "brak pól w pliku.");
      return null;
    }
    const gridLayer = L.geoJSON(data, {
      pane: "overlayPane",
      interactive: false,
      style: {
        color: "rgba(15, 23, 42, 0.7)",
        weight: 1,
        fillColor: "rgba(255, 255, 255, 0.06)",
        fillOpacity: 0.1
      },
      onEachFeature(feature, layer) {
        const gridId = feature?.properties?.id;
        if (gridId == null) return;
        layer.bindTooltip(String(gridId), {
          permanent: true,
          direction: "center",
          className: "grid-label"
        });
      }
    });
    gridLayer.addTo(map);
    if (target === "records") recordsGridLayer = gridLayer;
    if (target === "working") workingGridLayer = gridLayer;
    setGridStatus(target, `załadowano ${count} pól`);
    console.info(`Grid loaded: ${count} features (${target})`);
    return gridLayer;
  }

  async function loadBrysnaSmieckPoints() {
    if (brysnaSmieckPointsGeojson) return brysnaSmieckPointsGeojson;
    if (!brysnaSmieckPointsPromise) {
      const url = `data/points_brysna_smieck.geojson?v=${encodeURIComponent(APP_VERSION)}`;
      brysnaSmieckPointsPromise = fetch(url, { cache: "no-cache" })
        .then((response) => {
          if (response.status === 404) throw new Error("Brak pliku data/points_brysna_smieck.geojson. Uruchom konwersję z data/points_brysna_smieck.gpkg.");
          if (!response.ok) throw new Error(`Nie udało się załadować punktów Brysna/Śmieck. HTTP ${response.status}`);
          return response.json();
        })
        .then((json) => {
          if (json?.type !== "FeatureCollection" || !Array.isArray(json.features)) {
            throw new Error("Plik points_brysna_smieck.geojson nie jest poprawnym GeoJSON FeatureCollection.");
          }
          if (json.features.length === 0) {
            throw new Error("Plik points_brysna_smieck.geojson istnieje, ale nie zawiera punktów.");
          }
          brysnaSmieckPointsGeojson = json;
          return json;
        })
        .catch((error) => {
          console.error(error);
          brysnaSmieckPointsPromise = null;
          alert(error.message || "Nie udało się załadować punktów Brysna/Śmieck.");
          return null;
        });
    }
    return brysnaSmieckPointsPromise;
  }

  function getBrysnaSmieckPointLabel(feature) {
    const props = feature?.properties || {};
    return props.name || props.Name || props.nazwa || props.Nazwa || props.label || props.Label || props.id_names || props.id || props.ID || "punkt";
  }

  function buildBrysnaSmieckPopup(feature) {
    const props = feature?.properties || {};
    const rows = Object.entries(props).map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value ?? "")}</td></tr>`).join("");
    return `<strong>${escapeHtml(getBrysnaSmieckPointLabel(feature))}</strong>${rows ? `<table class="mini-table">${rows}</table>` : ""}`;
  }

  function initBrysnaSmieckLayer(map, mapId) {
    const state = brysnaSmieckLayerStates[mapId];
    if (!state) return;
    state.map = map;
  }

  async function setBrysnaSmieckLayerVisible(mapId, visible) {
    const state = brysnaSmieckLayerStates[mapId];
    if (!state?.map) return;
    state.visible = !!visible;
    if (visible) await renderBrysnaSmieckPoints(mapId);
    else if (state.layer && state.map.hasLayer(state.layer)) state.map.removeLayer(state.layer);
  }

  async function renderBrysnaSmieckPoints(mapId) {
    const state = brysnaSmieckLayerStates[mapId];
    if (!state?.map || !state.visible) return;
    const data = await loadBrysnaSmieckPoints();
    if (!data) return;
    if (!state.layer) {
      state.layer = L.geoJSON(data, {
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
          radius: 5,
          color: "#ffffff",
          weight: 2,
          fillColor: "#e11d48",
          fillOpacity: 0.9,
          className: "brysna-smieck-point-marker"
        }),
        onEachFeature: (feature, layer) => {
          const label = String(getBrysnaSmieckPointLabel(feature));
          layer.bindTooltip(escapeHtml(label), {
            permanent: true,
            direction: "right",
            offset: [8, 0],
            className: "brysna-smieck-point-label"
          });
          layer.bindPopup(buildBrysnaSmieckPopup(feature));
        }
      });
    }
    if (!state.map.hasLayer(state.layer)) state.layer.addTo(state.map);
    bringMeasureToFront(mapId);
  }

  function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInPolygon(lon, lat, polygonCoords) {
    if (!polygonCoords?.length || !pointInRing(lon, lat, polygonCoords[0])) return false;
    for (let i = 1; i < polygonCoords.length; i++) if (pointInRing(lon, lat, polygonCoords[i])) return false;
    return true;
  }

  async function findGridIdForPoint(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
    const data = await loadGridGeoJson();
    const features = data?.features || [];
    for (const feature of features) {
      const geometry = feature?.geometry;
      if (!geometry) continue;
      const coords = geometry.coordinates;
      if (geometry.type === "Polygon" && pointInPolygon(lon, lat, coords)) return feature?.properties?.id ?? "";
      if (geometry.type === "MultiPolygon" && (coords || []).some((polygon) => pointInPolygon(lon, lat, polygon))) return feature?.properties?.id ?? "";
    }
    return "";
  }

  async function autoFillSectorFromGrid() {
    const sectorEl = $("#sector");
    if (!sectorEl || sectorEl.dataset.manual === "1") return;
    const lat = getNumber("#lat", null);
    const lon = getNumber("#lon", null);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      if (sectorEl.dataset.auto === "1") {
        sectorEl.value = "";
        delete sectorEl.dataset.auto;
      }
      return;
    }
    const gridId = await findGridIdForPoint(lat, lon);
    if (gridId !== "") {
      const val = String(gridId);
      if (!sectorEl.value || sectorEl.dataset.auto === "1") {
        sectorEl.value = val;
        sectorEl.dataset.auto = "1";
      }
    } else if (sectorEl.dataset.auto === "1") {
      sectorEl.value = "";
      delete sectorEl.dataset.auto;
    }
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

  async function getPhotoBlob(ref) {
    if (!ref || !String(ref).startsWith("idb:")) return null;
    const id = String(ref).slice(4);
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const req = tx.objectStore(PHOTO_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function getPhotoSyncMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PHOTO_SYNC_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function setPhotoSyncMap(map) {
    localStorage.setItem(PHOTO_SYNC_KEY, JSON.stringify(map && typeof map === "object" ? map : {}));
  }

  function collectPhotoRefsFromEntries(entries) {
    const refs = new Map();
    for (const entry of entries || []) {
      if (isDeleted(entry)) continue;
      for (const ref of entry?.nestMicro?.photos || []) {
        const localRef = String(ref?.dataUrl || ref || "");
        if (localRef.startsWith("idb:") && !refs.has(localRef)) refs.set(localRef, { localRef, recordUid: entry.uid, photoRole: "nest" });
      }
      for (const ref of entry?.randomMicro?.photos || []) {
        const localRef = String(ref?.dataUrl || ref || "");
        if (localRef.startsWith("idb:") && !refs.has(localRef)) refs.set(localRef, { localRef, recordUid: entry.uid, photoRole: "random" });
      }
    }
    return Array.from(refs.values());
  }

  function collectPhotoRefsFromWorkingNests(workingNests) {
    const refs = new Map();
    for (const nest of workingNests || []) {
      if (isDeleted(nest)) continue;
      for (const ref of nest?.photos || []) {
        const localRef = String(ref?.dataUrl || ref || "");
        if (localRef.startsWith("idb:") && !refs.has(localRef)) refs.set(localRef, { localRef, workingNestId: nest.id, photoRole: "working" });
      }
    }
    return Array.from(refs.values());
  }

  function getPhotoSyncSummaryForRefs(refs) {
    const map = getPhotoSyncMap();
    let uploaded = 0;
    let pending = 0;
    let error = 0;
    for (const item of refs) {
      const state = map[item.localRef];
      if (state?.status === "uploaded") uploaded += 1;
      else if (state?.status === "error") error += 1;
      else pending += 1;
    }
    return { local: refs.length, uploaded, pending, error };
  }

  function getPhotoSyncSummary() {
    return getPhotoSyncSummaryForRefs([
      ...collectPhotoRefsFromEntries(getEntries()),
      ...collectPhotoRefsFromWorkingNests(getWorkingNests())
    ]);
  }

  function formatPhotoSyncStatus(status = getPhotoSyncSummary()) {
    const base = `Zdjęcia: lokalne ${status.local || 0}, wysłane ${status.uploaded || 0}, oczekują ${status.pending || 0}, błędy ${status.error || 0}.`;
    return status.ok === false && status.errorMessage ? `${base} Błąd uploadu: ${status.errorMessage}` : base;
  }

  function currentUserDisplayName() {
    const user = getCurrentUser();
    return String(user?.name || user?.email || "").trim();
  }

  function fillDefaultObserverForNewRecord() {
    if (editingUid) return;
    const observerEl = $("#observer");
    if (!observerEl || String(observerEl.value || "").trim()) return;
    const displayName = currentUserDisplayName();
    if (displayName) observerEl.value = displayName;
  }

  function photoStatusForRef(ref) {
    const state = getPhotoSyncMap()[String(ref || "")];
    if (state?.status === "uploaded") return "wysłane";
    if (state?.status === "error") return "błąd uploadu";
    return "oczekuje na upload";
  }

  async function syncPhotoMetadataFromServer(entries, workingNests) {
    const cfg = getSyncConfig();
    const apiBase = getSyncApiBase(cfg);
    if (!apiBase || !(getUserToken() || cfg.token)) return getPhotoSyncSummary();
    const map = getPhotoSyncMap();
    const seenRecords = new Set((entries || []).map((entry) => entry?.uid).filter(Boolean).map(String));
    const seenWorking = new Set((workingNests || []).map((nest) => nest?.id).filter(Boolean).map(String));
    for (const uid of seenRecords) {
      const res = await fetch(`${apiBase}/api/records/${encodeURIComponent(uid)}/photos`, { headers: getSyncAuthHeaders(cfg) });
      if (!res.ok) continue;
      const data = await res.json();
      for (const photo of data.photos || []) {
        if (!photo.localRef) continue;
        map[photo.localRef] = { serverId: photo.id, url: photo.url, uploadedAt: photo.uploadedAt || new Date().toISOString(), status: "uploaded" };
      }
    }
    for (const id of seenWorking) {
      const res = await fetch(`${apiBase}/api/working-nests/${encodeURIComponent(id)}/photos`, { headers: getSyncAuthHeaders(cfg) });
      if (!res.ok) continue;
      const data = await res.json();
      for (const photo of data.photos || []) {
        if (!photo.localRef) continue;
        map[photo.localRef] = { serverId: photo.id, url: photo.url, uploadedAt: photo.uploadedAt || new Date().toISOString(), status: "uploaded" };
      }
    }
    setPhotoSyncMap(map);
    return getPhotoSyncSummary();
  }

  async function uploadPhotoRef(localRef, context = {}) {
    const cfg = getSyncConfig();
    const apiBase = getSyncApiBase(cfg);
    if (!apiBase || !(getUserToken() || cfg.token)) throw new Error("Brak konfiguracji synchronizacji zdjęć");
    const map = getPhotoSyncMap();
    if (map[localRef]?.status === "uploaded") return map[localRef];
    const blob = await getPhotoBlob(localRef);
    if (!blob) throw new Error(`Brak lokalnego pliku ${localRef}`);
    const form = new FormData();
    const filename = blob.name || `${localRef.slice(4)}.${String(blob.type || "image/jpeg").split("/").pop() || "jpg"}`;
    form.append("file", blob, filename);
    if (context.recordUid) form.append("recordUid", context.recordUid);
    if (context.workingNestId) form.append("workingNestId", context.workingNestId);
    form.append("localRef", localRef);
    form.append("photoRole", context.photoRole || "photo");
    form.append("clientId", getClientId());
    const res = await fetch(`${apiBase}/api/photos`, { method: "POST", headers: getSyncAuthHeaders(cfg), body: form });
    if (!res.ok) throw new Error(`Photo HTTP ${res.status}`);
    const data = await res.json();
    const state = { serverId: data.photo.id, url: data.photo.url, uploadedAt: new Date().toISOString(), status: "uploaded" };
    map[localRef] = state;
    setPhotoSyncMap(map);
    return state;
  }

  async function uploadPendingPhotos() {
    const refs = [
      ...collectPhotoRefsFromEntries(getEntries()),
      ...collectPhotoRefsFromWorkingNests(getWorkingNests())
    ];
    const map = getPhotoSyncMap();
    for (const item of refs) {
      if (map[item.localRef]?.status === "uploaded") continue;
      try {
        await uploadPhotoRef(item.localRef, item);
      } catch (error) {
        const latest = getPhotoSyncMap();
        latest[item.localRef] = { ...(latest[item.localRef] || {}), status: "error", error: error.message, lastTriedAt: new Date().toISOString() };
        setPhotoSyncMap(latest);
      }
    }
    return { ok: true, ...getPhotoSyncSummary() };
  }

  async function resolvePhotoSrc(ref) {
    if (!ref) return "";
    if (String(ref).startsWith("data:")) return ref;
    if (!String(ref).startsWith("idb:")) return "";
    const cachedUrl = getCachedPhotoUrl(ref);
    if (cachedUrl) return cachedUrl;
    const blob = await getPhotoBlob(ref);
    if (blob) {
      const url = URL.createObjectURL(blob);
      return cachePhotoUrl(ref, url, "local");
    }
    const server = getPhotoSyncMap()[String(ref)];
    const cfg = getSyncConfig();
    const apiBase = getSyncApiBase(cfg);
    if (!server?.url || !apiBase || !(getUserToken() || cfg.token)) return "";
    // Zdjęcia z serwera są pobierane na żądanie i nie są automatycznie zapisywane offline na urządzeniu.
    const res = await fetch(`${apiBase}${server.url}`, { headers: getSyncAuthHeaders(cfg) });
    if (!res.ok) return "";
    const serverBlob = await res.blob();
    const url = URL.createObjectURL(serverBlob);
    return cachePhotoUrl(ref, url, "server");
  }

  function buildApiUrl(path, cfg = getSyncConfig()) {
    if (/^https?:\/\//i.test(String(path || ""))) return String(path);
    const apiBase = getSyncApiBase(cfg);
    if (!apiBase) return "";
    return `${apiBase}${String(path || "").startsWith("/") ? "" : "/"}${path}`;
  }

  async function fetchServerPhotoBlob(photo, cfg = getSyncConfig()) {
    const url = photo?.url || (photo?.id ? `/api/photos/${encodeURIComponent(photo.id)}` : "");
    if (!url) throw new Error("Brak adresu zdjęcia na serwerze");
    const res = await fetch(buildApiUrl(url, cfg), { headers: getSyncAuthHeaders(cfg), cache: "no-store" });
    if (!res.ok) throw new Error(await readApiError(res, `Photo HTTP ${res.status}`));
    return res.blob();
  }

  async function fetchPhotoMetadataForContext(context = {}, cfg = getSyncConfig()) {
    const path = context.recordUid
      ? `/api/records/${encodeURIComponent(context.recordUid)}/photos`
      : context.workingNestId
        ? `/api/working-nests/${encodeURIComponent(context.workingNestId)}/photos`
        : "";
    if (!path) return [];
    const res = await fetch(buildApiUrl(path, cfg), { headers: getSyncAuthHeaders(cfg), cache: "no-store" });
    if (!res.ok) throw new Error(await readApiError(res, `Photos HTTP ${res.status}`));
    const data = await res.json();
    return Array.isArray(data.photos) ? data.photos.filter((photo) => !isDeleted(photo)) : [];
  }

  async function resolvePhotoBlobForExport(localRef, context = {}, options = {}) {
    let localBlob = null;
    try {
      localBlob = await getPhotoBlob(localRef);
    } catch (error) {
      console.warn("Nie udało się odczytać lokalnego zdjęcia do eksportu", localRef, error);
    }
    if (localBlob) return { blob: localBlob, source: "local", photo: null };
    if (!options.includeServer) throw new Error("Zdjęcie nie jest dostępne lokalnie");
    const cfg = getSyncConfig();
    if (!(getUserToken() || cfg.token)) throw new Error("Brak tokenu do pobrania zdjęcia z serwera");

    const mapped = getPhotoSyncMap()[String(localRef)];
    if (mapped?.url || mapped?.serverId) {
      const photo = { id: mapped.serverId, url: mapped.url, localRef, photoRole: context.photoRole };
      return { blob: await fetchServerPhotoBlob(photo, cfg), source: "server-map", photo };
    }

    const metadata = await fetchPhotoMetadataForContext(context, cfg);
    const matched = metadata.find((photo) => String(photo.localRef || "") === String(localRef))
      || metadata.find((photo) => String(photo.photoRole || photo.photo_role || "") === String(context.photoRole || ""));
    if (!matched) throw new Error("Brak metadanych zdjęcia na serwerze");
    return { blob: await fetchServerPhotoBlob(matched, cfg), source: "server-metadata", photo: matched };
  }

  async function saveSelectedFiles(inputSelector) {
    const input = $(inputSelector);
    const selected = input?.files ? Array.from(input.files).slice(0, 8) : [];
    const refs = [];
    for (const file of selected) refs.push(await savePhotoFile(file));
    return refs;
  }

  function migrateLegacyEntries() {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return;
    try {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.map(normalizeEntry)));
    } catch {
      // Ignore broken legacy data.
    }
  }

  function normalizeEntry(entry) {
    const uid = entry.uid || `${entry.nestId || "rec"}-${entry.createdAt || Date.now()}-${Math.random().toString(16).slice(2)}`;
    const nestCoverage = entry.nestMicro?.coverage || {};
    const randomCoverage = entry.randomMicro?.coverage || {};
    const meso = entry.meso || {};
    return {
      ...entry,
      uid,
      protocolVersion: entry.protocolVersion || PROTOCOL_VERSION,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
      createdBy: entry.createdBy || entry.created_by || "",
      createdByName: entry.createdByName || "",
      updatedBy: entry.updatedBy || entry.updated_by || "",
      updatedByName: entry.updatedByName || "",
      deletedAt: entry.deletedAt || entry.deleted_at || null,
      deletedBy: entry.deletedBy || entry.deleted_by || null,
      deleteReason: entry.deleteReason || entry.delete_reason || "",
      season: entry.season || "",
      observer: entry.observer || "",
      recordCompleteness: entry.recordCompleteness || (entry.quickSave ? "basic" : "full"),
      quickSave: !!entry.quickSave,
      quickSaveReason: entry.quickSaveReason || entry.quick_save_reason || "",
      habitatDescriptionSkipped: !!(entry.habitatDescriptionSkipped || entry.habitat_description_skipped),
      savedFromStep: entry.savedFromStep ?? entry.saved_from_step ?? null,
      eggMeasurements: normalizeEggMeasurements(entry.eggMeasurements || []),
      docPhotoDone: entry.docPhotoDone || "unknown",
      nestOneMPhotoDone: entry.nestOneMPhotoDone || "unknown",
      randomPointDone: entry.randomPointDone || "unknown",
      nestMicro: {
        ...entry.nestMicro,
        photos: entry.nestMicro?.photos || [],
        coverage: {
          pctSand: Number(nestCoverage.pctSand || 0),
          pctFineGravel: Number(nestCoverage.pctFineGravel || 0),
          pctCoarse: Number(nestCoverage.pctCoarse || 0),
          pctShells: Number(nestCoverage.pctShells || 0),
          pctLiveVeg: Number(nestCoverage.pctLiveVeg || 0),
          pctDryVeg: Number(nestCoverage.pctDryVeg || 0),
          pctOrganic: Number(nestCoverage.pctOrganic || 0),
          pctAnthro: Number(nestCoverage.pctAnthro || 0),
        },
        distPlantCm: entry.nestMicro?.distPlantCm ?? entry.nestMicro?.distPlantM ?? null,
        distObjectCm: entry.nestMicro?.distObjectCm ?? entry.nestMicro?.distObjectM ?? null,
        microrelief: entry.nestMicro?.microrelief || "flat",
      },
      randomMicro: {
        ...entry.randomMicro,
        photos: entry.randomMicro?.photos || [],
        wasRerolled: entry.randomMicro?.wasRerolled || "no",
        rerollReason: entry.randomMicro?.rerollReason || "none",
        coverage: {
          pctSand: Number(randomCoverage.pctSand || 0),
          pctFineGravel: Number(randomCoverage.pctFineGravel || 0),
          pctCoarse: Number(randomCoverage.pctCoarse || 0),
          pctShells: Number(randomCoverage.pctShells || 0),
          pctLiveVeg: Number(randomCoverage.pctLiveVeg || 0),
          pctDryVeg: Number(randomCoverage.pctDryVeg || 0),
          pctOrganic: Number(randomCoverage.pctOrganic || 0),
          pctAnthro: Number(randomCoverage.pctAnthro || 0),
        },
        distPlantCm: entry.randomMicro?.distPlantCm ?? entry.randomMicro?.distPlantM ?? null,
        distObjectCm: entry.randomMicro?.distObjectCm ?? entry.randomMicro?.distObjectM ?? null,
        microrelief: entry.randomMicro?.microrelief || "flat",
      },
      meso: {
        ...meso,
        pctSand: Number(meso.pctSand || 0),
        pctFineGravel: Number(meso.pctFineGravel || meso.pctMesoGravel || 0),
        pctGravel: Number(meso.pctGravel || 0),
        pctVegetation: Number(meso.pctVegetation || 0),
        pctWater: Number(meso.pctWater || 0),
        pctOther: Number(meso.pctOther || 0),
        assessmentMethod: meso.assessmentMethod || "unknown",
        spatialNotes: meso.spatialNotes || "",
      },
      qualityControl: entry.qualityControl || {},
      moduleNotes: entry.moduleNotes || {},
    };
  }

  function getEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizeEntry) : [];
    } catch {
      return [];
    }
  }

  function setEntries(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.map(normalizeEntry)));
      return true;
    } catch (error) {
      alert("Nie udało się zapisać danych. Pamięć telefonu może być pełna.");
      console.error(error);
      return false;
    }
  }

  function setDefaultDateTime() {
    const now = new Date();
    if (!value("#obs-date")) setValue("#obs-date", now.toISOString().slice(0, 10));
    if (!value("#obs-time")) setValue("#obs-time", now.toTimeString().slice(0, 5));
    if (!value("#season")) setValue("#season", String(now.getFullYear()));
  }

  function formatNestIdDateTime(date = new Date()) {
    const y = String(date.getFullYear());
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}${m}${d}-${hh}${mm}`;
  }

  function speciesCode(speciesValue) {
    const existing = SPECIES_CODE_MAP[speciesValue];
    if (existing) return existing;
    const normalized = String(speciesValue || "").trim().toLowerCase().replace(/^custom:/, "");
    const fallback = normalized.split("-").filter(Boolean).slice(0, 3).map((part) => part[0]?.toUpperCase() || "").join("");
    return fallback || "SX";
  }

  function parseNestId(text) {
    const value = String(text || "").trim();
    const match = value.match(/^([^-]+)-(\d{8})(?:-\d{4})?-(.*)$/);
    if (!match) return null;
    return { code: match[1], date: match[2], suffix: match[3] || "" };
  }

  function ymdFromDateText(text) {
    const raw = String(text || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replaceAll("-", "");
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  }

  function nextNestDailyNumber(speciesValue, dateText, excludeUid = editingUid) {
    const ymd = ymdFromDateText(dateText);
    const species = speciesValue || "unknown";
    const count = activeEntries().filter((entry) =>
      String(entry.uid) !== String(excludeUid || "") &&
      (entry.species || "unknown") === species &&
      ymdFromDateText(entry.obsDate) === ymd
    ).length;
    return String(count + 1).padStart(3, "0");
  }

  function buildNestId(speciesValue, suffix = "", now = new Date()) {
    const dateText = value("#obs-date") || now.toISOString().slice(0, 10);
    const ymd = ymdFromDateText(dateText);
    const seq = suffix || nextNestDailyNumber(speciesValue, dateText);
    return `${speciesCode(speciesValue)}-${ymd}-${seq}`;
  }

  function setupNestIdAutofill() {
    const nestIdInput = $("#nest-id");
    const speciesInput = $("#species");
    const generateBtn = $("#nest-id-generate");
    if (!nestIdInput || !speciesInput) return;
    nestIdInput.addEventListener("input", () => { nestIdInput.dataset.manual = "1"; });

    const refreshFromSpecies = () => {
      if (editingUid || nestIdInput.dataset.manual === "1") return;
      if (!String(nestIdInput.value || "").trim() || nestIdInput.dataset.auto === "1") {
        nestIdInput.value = buildNestId(speciesInput.value);
        nestIdInput.dataset.auto = "1";
      }
    };

    speciesInput.addEventListener("change", refreshFromSpecies);
    $("#obs-date")?.addEventListener("change", refreshFromSpecies);
    document.addEventListener("click", (event) => {
      if (event.target.closest('.tile-group[data-target="species"] .tile')) {
        requestAnimationFrame(refreshFromSpecies);
      }
    });
    if (generateBtn) generateBtn.addEventListener("click", () => {
      nestIdInput.value = buildNestId(speciesInput.value);
      nestIdInput.dataset.auto = "1";
      delete nestIdInput.dataset.manual;
    });
  }

  
  const slugify = (txt) => String(txt || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  function readList(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } }
  function saveList(key, values) { localStorage.setItem(key, JSON.stringify(Array.from(new Set(values.filter(Boolean))))); }

  function setupSmartLists() {
    const bind = (inputSel, listSel, key) => {
      const input = $(inputSel); const list = $(listSel); if (!input || !list) return;
      const render = () => { list.innerHTML = readList(key).map((v) => `<option value="${escapeHtml(v)}"></option>`).join(""); };
      input.addEventListener("change", () => { const v = String(input.value || "").trim(); if (!v) return; const arr = readList(key); arr.push(v); saveList(key, arr); render(); });
      render();
    };
    bind("#observer", "#observer-list", OBSERVERS_KEY);
    bind("#sector", "#sector-list", SECTORS_KEY);
  }

  function setupCustomSpecies() {
    const hidden = $("#species"); const customInput = $("#species-custom-input"); const list = $("#species-custom-list");
    if (!hidden || !customInput || !list) return;
    const render = () => { list.innerHTML = readList(CUSTOM_SPECIES_KEY).map((v) => `<option value="${escapeHtml(v)}"></option>`).join(""); };
    document.addEventListener("click", (event) => { if (event.target.closest('.tile-group[data-target="species"] .tile[data-value="custom:other"]')) { hidden.value = "custom:"; customInput.hidden = false; customInput.focus(); } });
    customInput.addEventListener("change", () => {
      const raw = String(customInput.value || "").trim(); if (!raw) return;
      hidden.value = `custom:${slugify(raw) || "inn"}`;
      const arr = readList(CUSTOM_SPECIES_KEY); arr.push(raw); saveList(CUSTOM_SPECIES_KEY, arr); render();
    });
    render();
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000, toRad = (n) => (n * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function autoFillNearestDistances() {
    const lat = getNumber("#lat", null), lon = getNumber("#lon", null);
    if (lat == null || lon == null) return;
    const entries = activeEntries();
    const nearest = (sp) => entries
      .filter((e) => e.species === sp && e.uid !== editingUid && hasValidCoords(e.lat, e.lon))
      .reduce((best, e) => Math.min(best, haversineM(lat, lon, Number(e.lat), Number(e.lon))), Infinity);
    const hiEl = $("#dist-nearest-hiaticula"), duEl = $("#dist-nearest-dubius");
    if (hiEl && !hiEl.dataset.manual) { const d = nearest("charadrius-hiaticula"); hiEl.value = Number.isFinite(d) ? d.toFixed(1) : ""; }
    if (duEl && !duEl.dataset.manual) { const d = nearest("charadrius-dubius"); duEl.value = Number.isFinite(d) ? d.toFixed(1) : ""; }
  }

  function showView(name) {
    if (!getCurrentUser() && name !== "login") name = "login";
    if (getCurrentUser() && mustChangePassword() && !["change-password", "login"].includes(name)) name = "change-password";
    if (name === "admin" && !isAdmin()) name = "home";
    if (name !== "map") {
      if (recordsMap) captureMapViewState(recordsMap, "records");
      setMapFullscreen("records", false);
    }
    if (name !== "working-map") {
      if (workingMap) captureMapViewState(workingMap, "working");
      setMapFullscreen("working", false);
    }
    $("#login-screen").hidden = name !== "login";
    $("#change-password-screen").hidden = name !== "change-password";
    $("#home-screen").hidden = name !== "home";
    $("#quick-nest-screen").hidden = name !== "quick-nest";
    $("#records-screen").hidden = name !== "records";
    $("#record-readonly-screen").hidden = name !== "readonly";
    $("#map-screen").hidden = name !== "map";
    $("#working-map-screen").hidden = name !== "working-map";
    $("#form-screen").hidden = name !== "form";
    $("#user-screen").hidden = name !== "user";
    $("#export-screen").hidden = name !== "export";
    $("#admin-screen").hidden = name !== "admin";
    if (name === "map") setTimeout(() => renderRecordsMap(mapFocusUid), 0);
    if (name === "working-map") setTimeout(() => renderWorkingMap(), 0);
    if (name === "user") renderUserPanel();
    if (name === "home") renderHomeSummary();
    updateCounts();
  }

  function setMapFullscreen(mapId, enabled) {
    const screen = mapId === "working" ? $("#working-map-screen") : $("#map-screen");
    const closeBtn = mapId === "working" ? $("#working-fullscreen-close") : $("#records-fullscreen-close");
    const map = mapId === "working" ? workingMap : recordsMap;
    if (!screen) return;
    if (enabled && activeMapFullscreen && activeMapFullscreen !== mapId) {
      setMapFullscreen(activeMapFullscreen, false);
    }
    screen.classList.toggle("map-fullscreen-screen", !!enabled);
    document.documentElement.classList.toggle("map-fullscreen-open", !!enabled);
    document.body?.classList.toggle("map-fullscreen-open", !!enabled);
    if (closeBtn) closeBtn.hidden = !enabled;
    activeMapFullscreen = enabled ? mapId : (activeMapFullscreen === mapId ? null : activeMapFullscreen);
    setTimeout(() => {
      if (mapId === "working" && enabled && workingViewMode !== "map") {
        workingViewMode = "map";
        renderWorkingMap();
      }
      map?.invalidateSize();
    }, 120);
  }

  function closeActiveMapFullscreen() {
    if (activeMapFullscreen) setMapFullscreen(activeMapFullscreen, false);
  }

  function showStep(step) {
    currentStep = clamp(Number(step) || 1, 1, 8);
    $$(".step").forEach((el) => {
      el.hidden = Number(el.dataset.step) !== currentStep;
    });
    $("#step-title").textContent = `Krok ${currentStep} z 8 — ${FORM_STEP_TITLES[currentStep - 1]}`;
    $("#step-progress").style.width = `${(currentStep / 8) * 100}%`;
    renderStepStrip();
    $("#step-back").disabled = currentStep === 1;
    $("#step-next").hidden = currentStep === 8;
    $("#save-final").hidden = currentStep !== 8;
    if (currentStep === 8) renderValidationAndPreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderStepStrip() {
    const strip = $("#step-strip");
    if (!strip) return;
    strip.innerHTML = FORM_STEP_TITLES.map((title, index) => {
      const step = index + 1;
      const classes = ["step-chip"];
      if (step === currentStep) classes.push("active");
      if (step < currentStep) classes.push("completed");
      return `<button type="button" class="${classes.join(" ")}" data-step="${step}" aria-current="${step === currentStep ? "step" : "false"}">${step}. ${escapeHtml(title)}</button>`;
    }).join("");
    const active = strip.querySelector(".step-chip.active");
    if (active) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }

  function setupTiles() {
    $$(".tile-group").forEach((group) => {
      group.addEventListener("click", (event) => {
        const tile = event.target.closest(".tile");
        if (!tile) return;
        const target = $(`#${group.dataset.target}`);
        if (!target) return;
        target.value = tile.dataset.value;
        target.dispatchEvent(new Event("change", { bubbles: true }));
        syncTilesFromInputs();
      });
    });
    syncTilesFromInputs();
  }

  function syncTilesFromInputs() {
    $$(".tile-group").forEach((group) => {
      const target = $(`#${group.dataset.target}`);
      if (!target) return;
      $$(".tile", group).forEach((tile) => tile.classList.toggle("selected", tile.dataset.value === target.value));
    });
  }

  function createPercentRow(id, label) {
    const row = document.createElement("label");
    row.className = "pct-label";
    row.innerHTML = `
      <span>${label}</span>
      <div class="pct-row">
        <button type="button" class="pct-btn" data-id="${id}" data-delta="-5">−5</button>
        <input id="${id}" type="number" min="0" max="100" step="1" inputmode="numeric" value="0" />
        <button type="button" class="pct-btn" data-id="${id}" data-delta="5">+5</button>
      </div>
    `;
    return row;
  }

  function setupPercentGroups() {
    Object.values(PERCENT_GROUPS).forEach((group) => {
      const rows = $(group.rowsEl);
      if (!rows) return;
      rows.innerHTML = "";
      group.items.forEach(([id, label]) => rows.appendChild(createPercentRow(id, label)));
    });

    document.addEventListener("click", (event) => {
      const btn = event.target.closest(".pct-btn");
      if (!btn) return;
      const input = $(`#${btn.dataset.id}`);
      if (!input) return;
      const group = findPercentGroup(btn.dataset.id);
      const current = getNumber(`#${btn.dataset.id}`, 0) || 0;
      const delta = Number(btn.dataset.delta || 0);
      let next = clamp(current + delta);
      if (delta > 0 && group) {
        const remaining = 100 - groupSum(group) + current;
        next = Math.min(next, Math.max(0, remaining));
      }
      input.value = String(next);
      updatePercentSummaries();
    });

    document.addEventListener("input", (event) => {
      if (event.target.matches(".percent-rows input[type='number']")) {
        const n = clamp(Number(event.target.value) || 0);
        if (String(event.target.value) !== String(n)) event.target.value = String(n);
        updatePercentSummaries();
      }
    });

    $$(".pct-tool").forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = PERCENT_GROUPS[btn.dataset.group];
        if (!group) return;
        if (btn.dataset.action === "clear") {
          group.items.forEach(([id]) => setValue(`#${id}`, "0"));
        } else if (btn.dataset.action === "fill") {
          const target = btn.dataset.target;
          const current = getNumber(`#${target}`, 0) || 0;
          setValue(`#${target}`, String(Math.min(100, current + Math.max(0, 100 - groupSum(group)))));
        }
        updatePercentSummaries();
      });
    });

    updatePercentSummaries();
  }

  function findPercentGroup(inputId) {
    return Object.values(PERCENT_GROUPS).find((group) => group.items.some(([id]) => id === inputId)) || null;
  }

  function groupSum(group) {
    return group.items.reduce((sum, [id]) => sum + (getNumber(`#${id}`, 0) || 0), 0);
  }

  function updatePercentSummaries() {
    Object.entries(PERCENT_GROUPS).forEach(([, group]) => {
      const el = $(group.sumEl);
      if (!el) return;
      const sum = groupSum(group);
      el.classList.toggle("ok", sum >= 95 && sum <= 105);
      el.classList.toggle("bad", sum < 95 || sum > 105);
      if (sum >= 95 && sum <= 105) el.textContent = `Suma: ${sum}% — OK`;
      else if (sum < 95) el.textContent = `Suma: ${sum}% — pozostało ${100 - sum}%`;
      else el.textContent = `Suma: ${sum}% — za dużo o ${sum - 100}%`;
    });
  }

  function readCoverage(prefix) {
    return {
      pctSand: getNumber(`#${prefix}-pct-sand`, 0) || 0,
      pctFineGravel: getNumber(`#${prefix}-pct-fine-gravel`, 0) || 0,
      pctCoarse: getNumber(`#${prefix}-pct-coarse`, 0) || 0,
      pctShells: getNumber(`#${prefix}-pct-shells`, 0) || 0,
      pctLiveVeg: getNumber(`#${prefix}-pct-live-veg`, 0) || 0,
      pctDryVeg: getNumber(`#${prefix}-pct-dry-veg`, 0) || 0,
      pctOrganic: getNumber(`#${prefix}-pct-organic`, 0) || 0,
      pctAnthro: getNumber(`#${prefix}-pct-anthro`, 0) || 0,
    };
  }

  function setCoverage(prefix, coverage = {}) {
    setValue(`#${prefix}-pct-sand`, coverage.pctSand ?? 0);
    setValue(`#${prefix}-pct-fine-gravel`, coverage.pctFineGravel ?? 0);
    setValue(`#${prefix}-pct-coarse`, coverage.pctCoarse ?? 0);
    setValue(`#${prefix}-pct-shells`, coverage.pctShells ?? 0);
    setValue(`#${prefix}-pct-live-veg`, coverage.pctLiveVeg ?? 0);
    setValue(`#${prefix}-pct-dry-veg`, coverage.pctDryVeg ?? 0);
    setValue(`#${prefix}-pct-organic`, coverage.pctOrganic ?? 0);
    setValue(`#${prefix}-pct-anthro`, coverage.pctAnthro ?? 0);
  }

  function coverageSum(coverage) {
    return Object.values(coverage || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  }

  function parseOptionalCm(value) {
    const raw = String(value ?? "").trim().replace(",", ".");
    if (!raw) return null;
    const number = Number(raw);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
  }

  function parseLegacyMmAsCm(value) {
    const raw = String(value ?? "").trim().replace(",", ".");
    if (!raw) return null;
    const number = Number(raw);
    return Number.isFinite(number) ? Math.round((number / 10) * 100) / 100 : null;
  }

  function formatEggInputValue(value) {
    return value == null || Number.isNaN(Number(value)) ? "" : Number(value).toFixed(2);
  }

  function formatCm(value) {
    return value == null || Number.isNaN(Number(value)) ? "" : String(Number(value).toFixed(2)).replace(".", ",");
  }

  function parseOptionalGrams(value) {
    const raw = String(value ?? "").trim().replace(",", ".");
    if (!raw) return null;
    const number = Number(raw);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
  }

  function formatGrams(value) {
    return value == null || Number.isNaN(Number(value)) ? "" : String(Number(value).toFixed(2)).replace(".", ",");
  }

  function normalizeEggMeasurements(measurements = []) {
    if (!Array.isArray(measurements)) return [];
    return measurements
      .map((item, index) => {
        const eggNo = Number(item?.eggNo ?? index + 1);
        if (!Number.isFinite(eggNo) || eggNo < 1) return null;
        return {
          eggNo: Math.floor(eggNo),
          widthCm: item?.widthCm != null ? parseOptionalCm(item.widthCm) : parseLegacyMmAsCm(item?.widthMm),
          lengthCm: item?.lengthCm != null ? parseOptionalCm(item.lengthCm) : parseLegacyMmAsCm(item?.lengthMm),
          weightG: parseOptionalGrams(item?.weightG ?? item?.weight_g ?? item?.weightGrams),
          note: String(item?.note ?? "")
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.eggNo - b.eggNo);
  }

  function getEggCountForMeasurements() {
    const count = Number(value("#egg-count", ""));
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  }

  function currentEggMeasurementRowCount() {
    return $$(".egg-measurement-row", $("#egg-measurements-grid")).length;
  }

  function readEggMeasurementsFromForm() {
    const rows = $$(".egg-measurement-row", $("#egg-measurements-grid"));
    return normalizeEggMeasurements(rows.map((row, index) => ({
      eggNo: Number(row.dataset.eggNo || index + 1),
      widthCm: row.querySelector("[data-field='widthCm']")?.value ?? "",
      lengthCm: row.querySelector("[data-field='lengthCm']")?.value ?? "",
      weightG: row.querySelector("[data-field='weightG']")?.value ?? "",
      note: row.querySelector("[data-field='note']")?.value ?? ""
    })));
  }

  function renderEggMeasurementRows(count, existingMeasurements = []) {
    const grid = $("#egg-measurements-grid");
    const addBtn = $("#egg-measurement-add");
    if (!grid) return;
    const normalized = normalizeEggMeasurements(existingMeasurements);
    const byNo = new Map(normalized.map((item) => [Number(item.eggNo), item]));
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    grid.innerHTML = Array.from({ length: safeCount }, (_, index) => {
      const eggNo = index + 1;
      const item = byNo.get(eggNo) || {};
      return `
        <div class="egg-measurement-row" data-egg-no="${eggNo}">
          <div class="egg-measurement-label">Jajo ${eggNo}</div>
          <div class="egg-measurement-inputs">
            <label>Szerokość [cm]
              <input type="number" step="0.01" inputmode="decimal" placeholder="2,49" data-field="widthCm" value="${escapeHtml(formatEggInputValue(item.widthCm))}" />
            </label>
            <label>Długość [cm]
              <input type="number" step="0.01" inputmode="decimal" placeholder="3,43" data-field="lengthCm" value="${escapeHtml(formatEggInputValue(item.lengthCm))}" />
            </label>
            <label>Waga jaja [g]
              <input type="number" min="0" step="0.01" inputmode="decimal" placeholder="12.34" data-field="weightG" value="${escapeHtml(formatEggInputValue(item.weightG))}" />
            </label>
          </div>
        </div>
      `;
    }).join("");
    if (addBtn) addBtn.hidden = getEggCountForMeasurements() < 5;
    updateEggMeasurementWarnings();
  }

  function setEggMeasurementsInForm(measurements = []) {
    const normalized = normalizeEggMeasurements(measurements);
    const eggCount = getEggCountForMeasurements();
    const maxExisting = normalized.reduce((max, item) => Math.max(max, Number(item.eggNo) || 0), 0);
    const count = eggCount >= 5 ? Math.max(5, maxExisting) : Math.max(eggCount, maxExisting);
    renderEggMeasurementRows(count, normalized);
  }

  function syncEggMeasurementsWithEggCount() {
    const existing = readEggMeasurementsFromForm();
    const eggCount = getEggCountForMeasurements();
    const maxExisting = existing.reduce((max, item) => Math.max(max, Number(item.eggNo) || 0), 0);
    const count = eggCount >= 5 ? Math.max(5, maxExisting, currentEggMeasurementRowCount()) : eggCount;
    renderEggMeasurementRows(count, existing);
  }

  function eggMeasurementRangeWarnings(measurements = []) {
    const warnings = [];
    normalizeEggMeasurements(measurements).forEach((item) => {
      [["widthCm", "szerokość"], ["lengthCm", "długość"]].forEach(([field, label]) => {
        const value = item[field];
        if (value != null && (value < 0.5 || value > 8)) warnings.push(`Jajo ${item.eggNo}: ${label} ${formatCm(value)} cm jest poza zakresem 0,50-8,00 cm.`);
      });
      if (item.weightG != null && (item.weightG <= 0 || item.weightG > 100)) warnings.push(`Jajo ${item.eggNo}: waga ${formatGrams(item.weightG)} g jest poza zakresem 0,01-100,00 g.`);
    });
    return warnings;
  }

  function updateEggMeasurementWarnings() {
    const warning = $("#egg-measurement-warning");
    if (!warning) return;
    const messages = eggMeasurementRangeWarnings(readEggMeasurementsFromForm());
    warning.hidden = messages.length === 0;
    warning.textContent = messages.join(" ");
  }

  function setupEggMeasurements() {
    $("#egg-count")?.addEventListener("change", syncEggMeasurementsWithEggCount);
    $("#egg-measurements-grid")?.addEventListener("input", (event) => {
      if (event.target?.matches("input[data-field='widthCm'], input[data-field='lengthCm'], input[data-field='weightG']") && String(event.target.value || "").includes(",")) {
        event.target.value = String(event.target.value || "").replace(",", ".");
      }
      updateEggMeasurementWarnings();
    });
    $("#egg-measurement-add")?.addEventListener("click", () => {
      const existing = readEggMeasurementsFromForm();
      renderEggMeasurementRows(Math.max(1, currentEggMeasurementRowCount() + 1), existing);
    });
    syncEggMeasurementsWithEggCount();
  }

  async function buildRecord(options = {}) {
    const persistPhotos = options.persistPhotos === true;
    const entries = getEntries();
    const existing = editingUid ? entries.find((entry) => String(entry.uid) === String(editingUid)) : null;
    const newNestPhotos = persistPhotos ? await saveSelectedFiles("#nest-photos") : [];
    const newRandomPhotos = persistPhotos ? await saveSelectedFiles("#random-photos") : [];

    const uid = editingUid || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const now = new Date().toISOString();
    const user = getCurrentUser();

    return {
      uid,
      protocolVersion: PROTOCOL_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || user?.id || "",
      createdByName: existing?.createdByName || user?.name || "",
      updatedBy: user?.id || existing?.updatedBy || "",
      updatedByName: user?.name || existing?.updatedByName || "",
      deletedAt: existing?.deletedAt || null,
      deletedBy: existing?.deletedBy || null,
      deleteReason: existing?.deleteReason || "",

      nestId: trim("#nest-id"),
      season: trim("#season"),
      obsDate: value("#obs-date"),
      obsTime: value("#obs-time"),
      observer: trim("#observer"),
      species: value("#species", "unknown"),
      sector: trim("#sector"),
      lat: getNumber("#lat", null),
      lon: getNumber("#lon", null),
      gpsAccuracyM: getNumber("#gps-accuracy", null),
      nestStatus: value("#nest-status", "unknown"),
      eggCount: getNumber("#egg-count", null),
      eggMeasurements: readEggMeasurementsFromForm(),
      possibleRenest: value("#possible-renest", "unknown"),
      docPhotoDone: value("#doc-photo-done", "unknown"),
      nestOneMPhotoDone: value("#nest-one-m-photo-done", "unknown"),
      randomPointDone: value("#random-point-done", "unknown"),

      nestMicro: {
        photos: [...(currentNestPhotos || []), ...newNestPhotos],
        substrate: value("#nest-substrate", "sand"),
        coverage: readCoverage("nest"),
        distPlantCm: getNumber("#nest-dist-plant", null),
        heightPlantCm: getNumber("#nest-height-plant", null),
        distObjectCm: getNumber("#nest-dist-object", null),
        heightObjectCm: getNumber("#nest-height-object", null),
        slope: value("#nest-slope", "flat"),
        microrelief: value("#nest-microrelief", "flat"),
      },

      randomMicro: {
        azimuthDeg: getNumber("#random-azimuth", null),
        wasRerolled: value("#random-rerolled", "no"),
        rerollReason: value("#random-reroll-reason", "none"),
        lat: getNumber("#random-lat", null),
        lon: getNumber("#random-lon", null),
        gpsAccuracyM: getNumber("#random-gps-accuracy", null),
        photos: [...(currentRandomPhotos || []), ...newRandomPhotos],
        substrate: value("#random-substrate", "sand"),
        coverage: readCoverage("random"),
        distPlantCm: getNumber("#random-dist-plant", null),
        heightPlantCm: getNumber("#random-height-plant", null),
        distObjectCm: getNumber("#random-dist-object", null),
        heightObjectCm: getNumber("#random-height-object", null),
        slope: value("#random-slope", "flat"),
        microrelief: value("#random-microrelief", "flat"),
      },

      meso: {
        pctSand: getNumber("#pct-sand", 0) || 0,
        pctFineGravel: getNumber("#pct-fine-gravel", 0) || 0,
        pctGravel: getNumber("#pct-gravel", 0) || 0,
        pctVegetation: getNumber("#pct-vegetation", 0) || 0,
        pctWater: getNumber("#pct-water", 0) || 0,
        pctOther: getNumber("#pct-other", 0) || 0,
        assessmentMethod: value("#meso-assessment-method", "unknown"),
        distWaterM: getNumber("#dist-water", null),
        distVegEdgeM: getNumber("#dist-veg-edge", null),
        distVerticalStructureM: getNumber("#dist-vertical-structure", null),
        distNearestHiaticulaM: getNumber("#dist-nearest-hiaticula", null),
        distNearestDubiusM: getNumber("#dist-nearest-dubius", null),
        bigObjects: value("#meso-big-objects", "unknown"),
        distFineGravelPatchM: getNumber("#dist-fine-gravel-patch", null),
        distCoarseGravelPatchM: getNumber("#dist-coarse-gravel-patch", null),
        spatialNotes: trim("#meso-spatial-notes"),
      },

      qualityControl: {
        birdReaction: value("#qc-bird-reaction", "weak"),
        timeAtNest: value("#qc-time-at-nest", "lt1"),
        aborted: value("#qc-aborted", "no"),
        tracksVisible: value("#qc-tracks", "no"),
        tracksNotes: trim("#qc-tracks-notes"),
      },

      moduleNotes: {
        identification: trim("#notes-identification"),
        nestMicro: trim("#notes-nest-micro"),
        randomMicro: trim("#notes-random-micro"),
        meso: trim("#notes-meso"),
      },

      notes: trim("#notes"),
      validationOverride: !!$("#validation-override-summary")?.checked,
      recordCompleteness: "full",
      quickSave: false,
      quickSaveReason: "",
      habitatDescriptionSkipped: false,
      savedFromStep: currentStep,
    };
  }

  function validateRecord(record) {
    const errors = [];
    const warnings = [];
    const addErr = (step, field, message) => errors.push({ step, field, message });
    const addWarn = (step, field, message) => warnings.push({ step, field, message });

    if (!record.nestId) addErr(1, "#nest-id", "Brakuje ID gniazda.");
    if (record.nestId) {
      const duplicate = activeEntries().find((entry) =>
        String(entry.uid) !== String(record.uid) && String(entry.nestId || "").trim() === String(record.nestId || "").trim()
      );
      if (duplicate) addWarn(1, "#nest-id", "Ten identyfikator gniazda już istnieje. Możesz go zmienić ręcznie albo wygenerować kolejny.");
    }
    if (!record.obsDate) addErr(1, "#obs-date", "Brakuje daty.");
    if (!record.obsTime) addErr(1, "#obs-time", "Brakuje godziny.");
    if (!record.sector) addErr(1, "#sector", "Brakuje sektora / części wyspy.");
    if (!record.observer) addWarn(1, "#observer", "Brakuje obserwatora.");
    if (record.species === "unknown") addErr(1, "#species", "Brak gatunku.");
    if (record.eggCount == null || Number.isNaN(record.eggCount)) addErr(1, "#egg-count", "Brak liczby jaj.");
    eggMeasurementRangeWarnings(record.eggMeasurements).forEach((message) => addWarn(1, "#egg-measurements-panel", message));

    if (!hasValidCoords(record.lat, record.lon)) addErr(2, "#lat", "Brak poprawnego GPS gniazda.");
    if (!hasValidCoords(record.randomMicro?.lat, record.randomMicro?.lon)) addErr(5, "#random-lat", "Brak poprawnego GPS punktu losowego / kontroli.");
    if (record.randomMicro.azimuthDeg == null) addWarn(5, "#random-azimuth", "Brakuje azymutu punktu losowego.");

    const infos = [];
    const quality = [];
    const nestSum = coverageSum(record.nestMicro.coverage);
    const randomSum = coverageSum(record.randomMicro.coverage);
    const mesoSum = record.meso.pctSand + (record.meso.pctFineGravel || 0) + record.meso.pctGravel + record.meso.pctVegetation + record.meso.pctWater + record.meso.pctOther;
    if (nestSum !== 100) quality.push({ step: 3, field: "#nest-pct-sand", message: `Mikrohabitat gniazda: suma pokrycia wynosi ${nestSum}%, powinna wynosić 100%.` });
    if (mesoSum !== 100) quality.push({ step: 4, field: "#pct-sand", message: `Mezohabitat: suma pokrycia wynosi ${mesoSum}%, powinna wynosić 100% dla piasku, żwiru, kamieni, roślinności, wody/podmokłości i muszli.` });
    if (randomSum !== 100) quality.push({ step: 6, field: "#random-pct-sand", message: `Punkt losowy/kontrola: suma pokrycia wynosi ${randomSum}%, powinna wynosić 100%.` });
    if (!record.docPhotoDone || record.docPhotoDone === "unknown") quality.push({ step: 7, field: "#doc-photo-done", message: "Brak informacji o zdjęciu nad kontrolą." });
    if (!(record.nestMicro?.photos?.length)) addErr(2, "#nest-photos", "Brak zdjęcia gniazda.");
    if (!(record.randomMicro?.photos?.length)) addErr(5, "#random-photos", "Brak zdjęcia punktu losowego / kontroli.");
    if (!record.nestOneMPhotoDone || record.nestOneMPhotoDone === "unknown") quality.push({ step: 7, field: "#nest-one-m-photo-done", message: "Brak informacji o zdjęciu 1 m²." });
    if (!record.randomPointDone || record.randomPointDone === "unknown") addWarn(7, "#random-point-done", "Brak informacji o punkcie losowym.");
    const infoFields = new Set();
    const addInfo = (step, field, message) => { if (infoFields.has(field)) return; infoFields.add(field); infos.push({ step, field, message }); };
    const emptyNum = (v) => v == null || Number.isNaN(v);
    if (emptyNum(record.nestMicro?.distPlantCm)) addInfo(3, "#nest-dist-plant", "Puste: odległość do najbliższej rośliny przy gnieździe.");
    if (emptyNum(record.nestMicro?.distObjectCm)) addInfo(3, "#nest-dist-object", "Puste: odległość do najbliższego obiektu przy gnieździe.");
    if (emptyNum(record.randomMicro?.distPlantCm)) addInfo(6, "#random-dist-plant", "Puste: odległość do najbliższej rośliny przy kontroli/punkcie losowym.");
    if (emptyNum(record.randomMicro?.distObjectCm)) addInfo(6, "#random-dist-object", "Puste: odległość do najbliższego obiektu przy kontroli/punkcie losowym.");
    if (emptyNum(record.meso?.distWaterM)) addInfo(4, "#dist-water", "Puste: odległość do wody.");
    if (emptyNum(record.meso?.distVegEdgeM)) addInfo(4, "#dist-veg-edge", "Puste: odległość do krawędzi zwartej roślinności.");
    if (emptyNum(record.meso?.distVerticalStructureM)) addInfo(4, "#dist-vertical-structure", "Puste: odległość do najbliższego wyższego obiektu.");
    if (emptyNum(record.meso?.distFineGravelPatchM)) addInfo(4, "#dist-fine-gravel-patch", "Puste: odległość do płatu drobnego żwiru.");
    if (emptyNum(record.meso?.distCoarseGravelPatchM)) addInfo(4, "#dist-coarse-gravel-patch", "Puste: odległość do płatu kamieni.");
    if (emptyNum(record.meso?.distNearestHiaticulaM)) addInfo(4, "#dist-nearest-hiaticula", "Puste: odległość do najbliższego gniazda sieweczki obrożnej.");
    if (emptyNum(record.meso?.distNearestDubiusM)) addInfo(4, "#dist-nearest-dubius", "Puste: odległość do najbliższego gniazda sieweczki rzecznej.");
    if (emptyNum(record.nestMicro?.heightPlantCm)) addInfo(3, "#nest-height-plant", "Puste: wysokość najbliższej rośliny przy gnieździe.");
    if (emptyNum(record.nestMicro?.heightObjectCm)) addInfo(3, "#nest-height-object", "Puste: wysokość najbliższego obiektu przy gnieździe.");
    if (emptyNum(record.randomMicro?.heightPlantCm)) addInfo(6, "#random-height-plant", "Puste: wysokość najbliższej rośliny przy kontroli/punkcie losowym.");
    if (emptyNum(record.randomMicro?.heightObjectCm)) addInfo(6, "#random-height-object", "Puste: wysokość najbliższego obiektu przy kontroli/punkcie losowym.");
    if (!record.nestMicro?.slope) addInfo(3, "#nest-slope", "Puste: nachylenie przy gnieździe.");
    if (!record.randomMicro?.slope) addInfo(6, "#random-slope", "Puste: nachylenie przy kontroli/punkcie losowym.");
    if (!record.nestMicro?.microrelief) addInfo(3, "#nest-microrelief", "Puste: mikrorzeźba przy gnieździe.");
    if (!record.randomMicro?.microrelief) addInfo(6, "#random-microrelief", "Puste: mikrorzeźba przy kontroli/punkcie losowym.");
    if (!record.meso?.bigObjects || record.meso?.bigObjects === "unknown") addInfo(4, "#meso-big-objects", "Puste: duże obiekty w 15 m.");
    if (!record.meso?.assessmentMethod || record.meso?.assessmentMethod === "unknown") addInfo(4, "#meso-assessment-method", "Puste: sposób oceny buforu 15 m.");
    if (!String(record.meso?.spatialNotes || "").trim()) addInfo(4, "#meso-spatial-notes", "Puste: uwagi przestrzenne.");
    if (!String(record.moduleNotes?.meso || "").trim()) addInfo(4, "#notes-meso", "Puste: notatki mezohabitatowe.");

    const technical = new Set(["species","egg-count","nest-status","possible-renest","doc-photo-done","nest-one-m-photo-done","random-point-done","nest-substrate","random-rerolled","random-reroll-reason","random-substrate","qc-bird-reaction","qc-time-at-nest","qc-aborted","qc-tracks","gps-accuracy","random-gps-accuracy","validation-override-summary"]);
    $$("input,select,textarea", $("#entry-form")).forEach((el) => {
      if (!el.id || el.type === "hidden" || el.type === "file" || technical.has(el.id)) return;
      if (el.closest("[hidden]")) return;
      if (String(el.value || "").trim()) return;
      const step = Number(el.closest(".step")?.dataset.step || 1);
      infos.push({ step, field: `#${el.id}`, message: `Pole puste: ${el.id}` });
    });
    return { errors, warnings, infos, quality };
  }

  function renderValidationAndPreview() {
    buildRecord({ persistPhotos: false }).then((record) => {
      const { errors, warnings, infos, quality } = validateRecord(record);
      const list = $("#validation-list");
      if (list) {
        const renderItems = (items, cls) => items.map((item) => `
          <div class="${cls}">
            ${item.message}
            <button type="button" data-step="${item.step}" data-field="${item.field}">Przejdź</button>
          </div>
        `).join("");
        list.innerHTML = `
          ${errors.length ? `<h3>Braki obowiązkowe — blokują zapis</h3>${renderItems(errors, "validation-error")}` : `<p class="ok-text">Brak braków blokujących zapis.</p>`}
          ${warnings.length ? `<h3>Braki zalecane — sprawdź przed zakończeniem</h3>${renderItems(warnings, "validation-warning")}` : `<p class="ok-text">Brak ostrzeżeń jakościowych.</p>`}
          <h3>Pola puste / nieuzupełnione — informacyjnie</h3>${infos.length ? renderItems(infos, "validation-warning") : `<p class="muted">Brak.</p>`}<h3>Ostrzeżenia jakościowe</h3>${quality.length ? renderItems(quality, "validation-warning") : `<p class="ok-text">Brak ostrzeżeń jakościowych.</p>`}
        `;
        $$("button", list).forEach((btn) => btn.addEventListener("click", () => {
          showStep(Number(btn.dataset.step));
          setTimeout(() => $(btn.dataset.field)?.focus(), 100);
        }));
      }

      const preview = $("#record-preview");
      if (preview) {
        preview.innerHTML = `
          <h3>Podgląd rekordu</h3>
          <p><strong>${escapeHtml(record.nestId || "(bez ID)")}</strong> • ${LABELS.species[record.species] || record.species} • ${escapeHtml(record.sector || "")}</p>
          <p>${escapeHtml(record.obsDate || "")} ${escapeHtml(record.obsTime || "")} • jaja: ${record.eggCount ?? "brak"} • GPS: ${record.lat ?? "brak"}, ${record.lon ?? "brak"}</p>
        `;
      }
    });
  }


  function getBasicRecordWarnings() {
    const warnings = [];
    if (!trim("#nest-id")) warnings.push("ID gniazda zostanie wygenerowane automatycznie.");
    if (!trim("#season")) warnings.push("Sezon zostanie ustawiony na bieżący rok.");
    if (!trim("#observer")) warnings.push("Obserwator zostanie ustawiony na zalogowanego użytkownika, jeśli jest dostępny.");
    if (!value("#obs-date")) warnings.push("Data zostanie ustawiona na dzisiaj.");
    if (!value("#obs-time")) warnings.push("Godzina zostanie ustawiona na aktualną.");
    if (!trim("#sector")) warnings.push("Sektor zostanie zapisany jako brak danych.");
    if (!String(value("#egg-count", "")).trim()) warnings.push("Liczba jaj zostanie zapisana jako brak danych.");
    return warnings;
  }

  function validateBasicRecordForSave(record) {
    const errors = [];
    if (!record.nestId) errors.push("Brakuje ID gniazda.");
    if (!record.obsDate) errors.push("Brakuje daty.");
    if (!record.obsTime) errors.push("Brakuje godziny.");
    if (!record.sector) errors.push("Brakuje sektora / części wyspy.");
    if (!record.species || record.species === "unknown") errors.push("Do zapisu podstawowego wybierz gatunek.");
    if (!hasValidCoords(record.lat, record.lon)) errors.push("Do zapisu podstawowego pobierz lub wpisz poprawny GPS gniazda na karcie 2. Nie można zapisać żadnego rekordu bez pozycji.");
    return errors;
  }

  function markRecordAsBasic(record) {
    record.recordCompleteness = "basic";
    record.quickSave = true;
    record.quickSaveReason = "basic_without_full_control";
    record.habitatDescriptionSkipped = true;
    record.savedFromStep = 2;
    return record;
  }

  function isBasicRecord(record) {
    return record?.recordCompleteness === "basic" || record?.quickSave === true;
  }

  function renderRecordCompletenessBadge(record) {
    return isBasicRecord(record) ? `<span class="record-completeness-badge basic">Rekord niepełny</span>` : "";
  }

  function ensureBasicStepOneDefaults() {
    const now = new Date();
    if (!trim("#nest-id")) setValue("#nest-id", buildNestId(value("#species", "unknown")));
    if (!trim("#season")) setValue("#season", String(now.getFullYear()));
    if (!trim("#observer")) setValue("#observer", currentUserDisplayName());
    if (!value("#obs-date")) setValue("#obs-date", now.toISOString().slice(0, 10));
    if (!value("#obs-time")) setValue("#obs-time", now.toTimeString().slice(0, 5));
  }

  async function buildBasicRecordFromStepOne() {
    ensureBasicStepOneDefaults();
    const record = await buildRecord({ persistPhotos: false });
    if (!record.sector) record.sector = "brak danych";
    if (record.eggCount == null || Number.isNaN(record.eggCount)) record.eggCount = null;
    return markRecordAsBasic(record);
  }

  async function quickSaveBasicRecord() {
    const warnings = getBasicRecordWarnings();
    const record = await buildBasicRecordFromStepOne();
    const errors = validateBasicRecordForSave(record);
    if (errors.length) {
      alert(`Nie zapiszę rekordu podstawowego:\n- ${errors.join("\n- ")}`);
      return;
    }
    const extra = warnings.length ? `\n\nUwaga:\n- ${warnings.join("\n- ")}` : "";
    const confirmed = confirm(`To jest zapis podstawowy bez pełnej kontroli siedliska. Aplikacja sprawdziła podstawowe dane i GPS gniazda. Użyj tylko wtedy, gdy nie wykonujesz pełnego opisu gniazda. Rekord zostanie oznaczony jako niepełny. Czy zapisać?${extra}`);
    if (!confirmed) return;
    if (!saveBasicRecord(record)) return;
    editingUid = null;
    currentNestPhotos = [];
    currentRandomPhotos = [];
    localStorage.removeItem(DRAFT_KEY);
    updateDraftResumeButton();
    resetForm();
    showView("records");
    alert("Rekord zapisany jako podstawowy — bez pełnej kontroli.");
  }

  async function saveFinalRecord() {
    const record = await buildRecord({ persistPhotos: true });
    if (!hasValidCoords(record.lat, record.lon)) {
      alert("Nie zapiszę rekordu bez poprawnego GPS gniazda. Pobierz lub wpisz pozycję na karcie 2.");
      showStep(2);
      setTimeout(() => $("#lat")?.focus(), 100);
      return;
    }
    if (!hasValidCoords(record.randomMicro?.lat, record.randomMicro?.lon)) {
      alert("Nie zapiszę pełnego rekordu bez poprawnego GPS punktu losowego / kontroli. Pobierz lub wpisz pozycję na karcie 5.");
      showStep(5);
      setTimeout(() => $("#random-lat")?.focus(), 100);
      return;
    }
    const { errors } = validateRecord(record);
    if (errors.length && !$("#validation-override-summary")?.checked) {
      renderValidationAndPreview();
      showStep(8);
      return;
    }
    const entries = getEntries();
    const idx = entries.findIndex((entry) => String(entry.uid) === String(record.uid));
    if (idx >= 0) entries[idx] = record;
    else entries.unshift(record);
    record.syncStatus = navigator.onLine ? "pending" : "pending";
    if (!setEntries(entries)) return;

    editingUid = null;
    currentNestPhotos = [];
    currentRandomPhotos = [];
    localStorage.removeItem(DRAFT_KEY);
    updateDraftResumeButton();
    renderEntries();
    resetForm();
    showView("records");
    alert("Rekord zapisany.");
    if (navigator.onLine) { syncNow().catch(() => { markSyncStatus(record.uid, "error"); }); }
  }

  async function persistDraftPhotos() {
    const selectedNest = $("#nest-photos")?.files?.length ? await saveSelectedFiles("#nest-photos") : [];
    const selectedRandom = $("#random-photos")?.files?.length ? await saveSelectedFiles("#random-photos") : [];
    if (selectedNest.length) {
      currentNestPhotos = [...(currentNestPhotos || []), ...selectedNest];
      $("#nest-photos").value = "";
    }
    if (selectedRandom.length) {
      currentRandomPhotos = [...(currentRandomPhotos || []), ...selectedRandom];
      $("#random-photos").value = "";
    }
    if (selectedNest.length || selectedRandom.length) renderPhotoPreviews();
  }

  async function writeDraft(showAlert = true) {
    await persistDraftPhotos();
    const data = {};
    new FormData($("#entry-form")).forEach((v, k) => { data[k] = v; });
    // FormData does not include hidden fields without name attributes, so save by id as well.
    $$("input, select, textarea", $("#entry-form")).forEach((el) => {
      if (el.id && el.type !== "file") data[el.id] = el.value;
    });
    data.__currentNestPhotos = currentNestPhotos || [];
    data.__currentRandomPhotos = currentRandomPhotos || [];
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data }));
    updateDraftResumeButton();
    if (showAlert) alert("Szkic zapisany lokalnie.");
  }

  function saveDraft() {
    return writeDraft(true);
  }

  function saveDraftSilently() {
    return writeDraft(false);
  }

  function getDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
  }

  function updateDraftResumeButton() {
    const hasDraft = !!getDraft();
    const notice = $("#draft-notice");
    if (notice) notice.hidden = !hasDraft;
    const btn = $("#resume-draft");
    if (btn) btn.hidden = !hasDraft;
  }

  function loadDraftToForm() {
    const draft = getDraft();
    if (!draft?.data) return false;
    resetForm();
    currentNestPhotos = Array.isArray(draft.data.__currentNestPhotos) ? draft.data.__currentNestPhotos : [];
    currentRandomPhotos = Array.isArray(draft.data.__currentRandomPhotos) ? draft.data.__currentRandomPhotos : [];
    Object.entries(draft.data).forEach(([id, val]) => {
      if (id.startsWith("__")) return;
      const el = document.getElementById(id);
      if (el && el.type !== "file") el.value = val;
    });
    const nestIdEl = $("#nest-id");
    if (nestIdEl && String(nestIdEl.value || "").trim()) nestIdEl.dataset.manual = "1";
    syncTilesFromInputs();
    updatePercentSummaries();
    renderPhotoPreviews();
    showView("form");
    showStep(1);
    return true;
  }

  function formHasStarted() {
    if ($("#form-screen")?.hidden) return false;
    if (editingUid || currentStep > 1 || getDraft()) return true;
    if ((currentNestPhotos || []).length || (currentRandomPhotos || []).length) return true;
    if ($("#nest-photos")?.files?.length || $("#random-photos")?.files?.length) return true;
    if (value("#species", "unknown") !== "unknown") return true;
    const observerText = String($("#observer")?.value || "").trim();
    if (observerText && observerText !== currentUserDisplayName()) return true;
    if (String($("#egg-count")?.value || "").trim()) return true;
    if (readEggMeasurementsFromForm().some((item) => item.widthCm != null || item.lengthCm != null || item.weightG != null || String(item.note || "").trim())) return true;
    const meaningful = ["#nest-id", "#season", "#sector", "#lat", "#lon", "#notes-identification", "#notes-nest-micro", "#notes-random-micro", "#notes-meso", "#notes"];
    return meaningful.some((selector) => String($(selector)?.value || "").trim());
  }

  function confirmDraftExit(message) {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "draft-exit-modal";
      modal.innerHTML = `
        <div class="draft-exit-dialog" role="dialog" aria-modal="true" aria-label="Wyjście z arkusza">
          <p>${escapeHtml(message)}</p>
          <div class="row-actions">
            <button type="button" class="ghost" data-choice="stay">Zostań w arkuszu</button>
            <button type="button" data-choice="leave">Zapisz szkic i wyjdź</button>
          </div>
        </div>
      `;
      const close = (value) => { modal.remove(); resolve(value); };
      const onKey = (event) => {
        if (event.key === "Escape") {
          document.removeEventListener("keydown", onKey);
          close(false);
        }
      };
      document.addEventListener("keydown", onKey);
      modal.addEventListener("click", (event) => {
        const choice = event.target.closest("[data-choice]")?.dataset.choice;
        if (choice === "stay") { document.removeEventListener("keydown", onKey); close(false); }
        if (choice === "leave") { document.removeEventListener("keydown", onKey); close(true); }
      });
      document.body.appendChild(modal);
      modal.querySelector("[data-choice='stay']")?.focus();
    });
  }

  async function goHomeFromMaybeForm() {
    if (formHasStarted()) {
      const message = editingUid
        ? "Wychodzisz z edycji. Niezapisane zmiany zostaną zapisane jako szkic. Będzie można do niego wrócić później."
        : "Wychodzisz z arkusza. Niedokończony wpis zostanie zapisany w szkicach. Będzie można do niego wrócić później.";
      const ok = await confirmDraftExit(message);
      if (!ok) return;
      await saveDraftSilently();
    }
    revokePhotoUrls("server");
    updateDraftResumeButton();
    showView("home");
    return true;
  }

  function resetForm() {
    $("#entry-form").reset();
    editingUid = null;
    currentNestPhotos = [];
    currentRandomPhotos = [];
    setDefaultDateTime();

    const defaults = {
      "#species": "unknown",
      "#egg-count": "",
      "#nest-status": "unknown",
      "#possible-renest": "unknown",
      "#doc-photo-done": "unknown",
      "#nest-one-m-photo-done": "unknown",
      "#random-point-done": "unknown",
      "#nest-substrate": "sand",
      "#nest-slope": "flat",
      "#nest-microrelief": "flat",
      "#random-rerolled": "no",
      "#random-reroll-reason": "none",
      "#random-substrate": "sand",
      "#random-slope": "flat",
      "#random-microrelief": "flat",
      "#meso-assessment-method": "unknown",
      "#meso-big-objects": "unknown",
      "#qc-bird-reaction": "weak",
      "#qc-time-at-nest": "lt1",
      "#qc-aborted": "no",
      "#qc-tracks": "no",
    };
    Object.entries(defaults).forEach(([selector, v]) => setValue(selector, v));
    Object.values(PERCENT_GROUPS).forEach((group) => group.items.forEach(([id]) => setValue(`#${id}`, "0")));

    $("#nest-photo-preview").innerHTML = "";
    $("#random-photo-preview").innerHTML = "";
    const nestIdEl = $("#nest-id");
    if (nestIdEl) {
      delete nestIdEl.dataset.manual;
      delete nestIdEl.dataset.auto;
    }
    if ($("#validation-override-summary")) $("#validation-override-summary").checked = false;
    const sectorEl = $("#sector");
    if (sectorEl) {
      delete sectorEl.dataset.manual;
      delete sectorEl.dataset.auto;
    }
    $("#edit-banner").hidden = true;
    $("#form-mode-title").textContent = "Nowe gniazdo";
    const eggPanel = $("#egg-measurements-panel");
    if (eggPanel) eggPanel.open = false;
    syncTilesFromInputs();
    syncEggMeasurementsWithEggCount();
    updatePercentSummaries();
  }

  function startNewRecord() {
    resetForm();
    fillDefaultObserverForNewRecord();
    showView("form");
    showStep(1);
  }


  function quickValue(selector, fallback = "") {
    return $(selector)?.value ?? fallback;
  }

  function quickTrim(selector, fallback = "") {
    return String(quickValue(selector, fallback)).trim();
  }

  function quickNumber(selector, fallback = null) {
    const raw = quickValue(selector, "");
    if (raw === "" || raw == null) return fallback;
    const number = Number(raw);
    return Number.isFinite(number) ? number : fallback;
  }

  function buildQuickNestId() {
    const species = quickValue("#quick-species", "unknown");
    const dateText = quickValue("#quick-obs-date") || new Date().toISOString().slice(0, 10);
    return `${speciesCode(species)}-${ymdFromDateText(dateText)}-${nextNestDailyNumber(species, dateText, null)}`;
  }

  function resetQuickNestForm() {
    const form = $("#quick-nest-form");
    if (form) form.reset();
    const now = new Date();
    setValue("#quick-season", String(now.getFullYear()));
    setValue("#quick-observer", currentUserDisplayName());
    setValue("#quick-obs-date", now.toISOString().slice(0, 10));
    setValue("#quick-obs-time", now.toTimeString().slice(0, 5));
    setValue("#quick-species", "unknown");
    setValue("#quick-nest-id", buildQuickNestId());
    setValue("#quick-gps-accuracy", "");
    const status = $("#quick-gps-status");
    if (status) status.textContent = "GPS: brak";
  }

  function startQuickNestRecord() {
    resetQuickNestForm();
    showView("quick-nest");
    setTimeout(() => $("#quick-species")?.focus(), 100);
  }

  function buildQuickNestRecord() {
    const now = new Date().toISOString();
    const user = getCurrentUser();
    const eggCount = quickNumber("#quick-egg-count", null);
    const record = {
      uid: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      protocolVersion: PROTOCOL_VERSION,
      createdAt: now,
      updatedAt: now,
      createdBy: user?.id || "",
      createdByName: user?.name || "",
      updatedBy: user?.id || "",
      updatedByName: user?.name || "",
      deletedAt: null,
      deletedBy: null,
      deleteReason: "",
      nestId: quickTrim("#quick-nest-id") || buildQuickNestId(),
      season: quickTrim("#quick-season") || String(new Date().getFullYear()),
      obsDate: quickValue("#quick-obs-date"),
      obsTime: quickValue("#quick-obs-time"),
      observer: quickTrim("#quick-observer") || currentUserDisplayName(),
      species: quickValue("#quick-species", "unknown"),
      sector: quickTrim("#quick-sector"),
      lat: quickNumber("#quick-lat", null),
      lon: quickNumber("#quick-lon", null),
      gpsAccuracyM: quickNumber("#quick-gps-accuracy", null),
      nestStatus: "unknown",
      eggCount: eggCount == null ? null : Math.max(0, Math.floor(eggCount)),
      eggMeasurements: [],
      possibleRenest: "unknown",
      docPhotoDone: "unknown",
      nestOneMPhotoDone: "unknown",
      randomPointDone: "unknown",
      nestMicro: { photos: [], substrate: "", coverage: {}, distPlantCm: null, heightPlantCm: null, distObjectCm: null, heightObjectCm: null, slope: "", microrelief: "" },
      randomMicro: { photos: [], azimuthDeg: null, wasRerolled: "unknown", rerollReason: "none", lat: null, lon: null, gpsAccuracyM: null, substrate: "", coverage: {}, distPlantCm: null, heightPlantCm: null, distObjectCm: null, heightObjectCm: null, slope: "", microrelief: "" },
      meso: {},
      qualityControl: {},
      moduleNotes: { identification: "Szybki wpis — bez pełnej kontroli.", nestMicro: "", randomMicro: "", meso: "" },
      notes: quickTrim("#quick-notes")
    };
    return markRecordAsBasic(record);
  }

  function saveBasicRecord(record) {
    const entries = getEntries();
    const idx = entries.findIndex((entry) => String(entry.uid) === String(record.uid));
    if (idx >= 0) entries[idx] = record;
    else entries.unshift(record);
    record.syncStatus = "pending";
    if (!setEntries(entries)) return false;
    renderEntries();
    updateCounts();
    if (navigator.onLine) { syncNow().catch(() => { markSyncStatus(record.uid, "error"); }); }
    return true;
  }

  async function saveQuickNestRecord() {
    const record = buildQuickNestRecord();
    const errors = validateBasicRecordForSave(record);
    if (errors.length) {
      alert(`Nie zapiszę szybkiego wpisu:\n- ${errors.join("\n- ")}`);
      return;
    }
    if (!saveBasicRecord(record)) return;
    resetQuickNestForm();
    showView("records");
    alert("Szybki wpis gniazda zapisany jako rekord podstawowy — bez pełnej kontroli.");
  }

  function loadRecordToForm(record) {
    resetForm();
    editingUid = record.uid;
    $("#form-mode-title").textContent = "Edycja rekordu";
    $("#edit-banner").hidden = false;
    $("#edit-record-label").textContent = `${record.nestId || "rekord"} (${record.obsDate || ""})`;

    setValue("#nest-id", record.nestId);
    const nestIdEl = $("#nest-id");
    if (nestIdEl) nestIdEl.dataset.manual = "1";
    setValue("#season", record.season);
    setValue("#obs-date", record.obsDate);
    setValue("#obs-time", record.obsTime);
    setValue("#observer", record.observer);
    setValue("#species", record.species || "unknown");
    setValue("#sector", record.sector);
    const sectorEl = $("#sector");
    if (sectorEl) {
      delete sectorEl.dataset.manual;
      delete sectorEl.dataset.auto;
      if (String(record.sector || "").trim()) sectorEl.dataset.manual = "1";
    }
    setValue("#lat", record.lat);
    setValue("#lon", record.lon);
    setValue("#gps-accuracy", record.gpsAccuracyM);
    setValue("#egg-count", record.eggCount);
    setEggMeasurementsInForm(record.eggMeasurements || []);
    setValue("#nest-status", record.nestStatus || "unknown");
    setValue("#possible-renest", record.possibleRenest || "unknown");
    setValue("#doc-photo-done", record.docPhotoDone || "unknown");
    setValue("#nest-one-m-photo-done", record.nestOneMPhotoDone || "unknown");
    setValue("#random-point-done", record.randomPointDone || "unknown");
    if ($("#validation-override-summary")) $("#validation-override-summary").checked = !!record.validationOverride;

    setValue("#nest-substrate", record.nestMicro?.substrate || "sand");
    setCoverage("nest", record.nestMicro?.coverage);
    setValue("#nest-dist-plant", record.nestMicro?.distPlantCm ?? "");
    setValue("#nest-height-plant", record.nestMicro?.heightPlantCm ?? "");
    setValue("#nest-dist-object", record.nestMicro?.distObjectCm ?? "");
    setValue("#nest-height-object", record.nestMicro?.heightObjectCm ?? "");
    setValue("#nest-slope", record.nestMicro?.slope || "flat");
    setValue("#nest-microrelief", record.nestMicro?.microrelief || "flat");

    setValue("#random-azimuth", record.randomMicro?.azimuthDeg ?? "");
    setValue("#random-rerolled", record.randomMicro?.wasRerolled || "no");
    setValue("#random-reroll-reason", record.randomMicro?.rerollReason || "none");
    setValue("#random-lat", record.randomMicro?.lat ?? "");
    setValue("#random-lon", record.randomMicro?.lon ?? "");
    setValue("#random-gps-accuracy", record.randomMicro?.gpsAccuracyM ?? "");
    setValue("#random-substrate", record.randomMicro?.substrate || "sand");
    setCoverage("random", record.randomMicro?.coverage);
    setValue("#random-dist-plant", record.randomMicro?.distPlantCm ?? "");
    setValue("#random-height-plant", record.randomMicro?.heightPlantCm ?? "");
    setValue("#random-dist-object", record.randomMicro?.distObjectCm ?? "");
    setValue("#random-height-object", record.randomMicro?.heightObjectCm ?? "");
    setValue("#random-slope", record.randomMicro?.slope || "flat");
    setValue("#random-microrelief", record.randomMicro?.microrelief || "flat");

    setValue("#pct-sand", record.meso?.pctSand ?? 0);
    setValue("#pct-fine-gravel", record.meso?.pctFineGravel ?? 0);
    setValue("#pct-gravel", record.meso?.pctGravel ?? 0);
    setValue("#pct-vegetation", record.meso?.pctVegetation ?? 0);
    setValue("#pct-water", record.meso?.pctWater ?? 0);
    setValue("#pct-other", record.meso?.pctOther ?? 0);
    setValue("#meso-assessment-method", record.meso?.assessmentMethod || "unknown");
    setValue("#dist-water", record.meso?.distWaterM ?? "");
    setValue("#dist-veg-edge", record.meso?.distVegEdgeM ?? "");
    setValue("#dist-vertical-structure", record.meso?.distVerticalStructureM ?? "");
    setValue("#dist-nearest-hiaticula", record.meso?.distNearestHiaticulaM ?? "");
    setValue("#dist-nearest-dubius", record.meso?.distNearestDubiusM ?? "");
    setValue("#meso-big-objects", record.meso?.bigObjects || "unknown");
    setValue("#dist-fine-gravel-patch", record.meso?.distFineGravelPatchM ?? "");
    setValue("#dist-coarse-gravel-patch", record.meso?.distCoarseGravelPatchM ?? "");
    setValue("#meso-spatial-notes", record.meso?.spatialNotes || "");

    setValue("#qc-bird-reaction", record.qualityControl?.birdReaction || "weak");
    setValue("#qc-time-at-nest", record.qualityControl?.timeAtNest || "lt1");
    setValue("#qc-aborted", record.qualityControl?.aborted || "no");
    setValue("#qc-tracks", record.qualityControl?.tracksVisible || "no");
    setValue("#qc-tracks-notes", record.qualityControl?.tracksNotes || "");

    setValue("#notes-identification", record.moduleNotes?.identification || "");
    setValue("#notes-nest-micro", record.moduleNotes?.nestMicro || "");
    setValue("#notes-random-micro", record.moduleNotes?.randomMicro || "");
    setValue("#notes-meso", record.moduleNotes?.meso || "");
    setValue("#notes", record.notes || "");

    currentNestPhotos = [...(record.nestMicro?.photos || [])];
    currentRandomPhotos = [...(record.randomMicro?.photos || [])];
    renderPhotoPreviews();

    syncTilesFromInputs();
    updatePercentSummaries();
    void autoFillSectorFromGrid();
    showView("form");
    showStep(1);
  }

  function editRecord(uid) {
    const record = getEntries().find((entry) => String(entry.uid) === String(uid));
    if (!record) {
      alert("Nie znaleziono rekordu do edycji.");
      return;
    }
    loadRecordToForm(record);
    const backBtn = $("#back-to-readonly");
    if (backBtn) backBtn.hidden = !editReturnToReadonly;
  }

  async function deleteRecord(uid) {
    const entries = getEntries();
    const target = entries.find((entry) => String(entry.uid) === String(uid));
    if (!target) return false;
    if (!canSoftDeleteItem(target)) { alert("Brak uprawnień do oznaczenia tego rekordu jako usuniętego."); return false; }
    if (!confirm(`Rekord zostanie ukryty w aplikacji, ale pozostanie w bazie i może zostać odzyskany przez administratora.\n\nUkryć rekord ${target.nestId || ""}?`)) return false;
    const reason = prompt("Powód usunięcia/ukrycia (opcjonalnie):") || "";
    let updated = { ...target, deletedAt: new Date().toISOString(), deletedBy: getCurrentUser()?.id || "", deleteReason: reason, updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.id || "", updatedByName: getCurrentUser()?.name || "" };
    if (navigator.onLine && getUserToken()) {
      try {
        const cfg = getSyncConfig();
        const res = await fetch(`${getSyncApiBase(cfg)}/api/records/${encodeURIComponent(uid)}/delete`, { method: "POST", headers: { "Content-Type": "application/json", ...getSyncAuthHeaders(cfg) }, body: JSON.stringify({ reason }) });
        if (res.ok) updated = normalizeEntry((await res.json()).record || updated);
      } catch {
        // Offline-first: local soft delete will be synchronized later.
      }
    }
    const idx = entries.findIndex((entry) => String(entry.uid) === String(uid));
    if (idx >= 0) entries[idx] = updated;
    else entries.unshift(updated);
    setEntries(entries);
    renderEntries();
    updateCounts();
    if (navigator.onLine) syncNow().catch(() => markSyncStatus(uid, "error"));
    return true;
  }

  async function renderPhotoPreviews() {
    const render = async (wrapSelector, existingRefs, inputSelector, label) => {
      const wrap = $(wrapSelector);
      if (!wrap) return;
      wrap.innerHTML = "";
      for (const ref of existingRefs) {
        const tile = document.createElement("div");
        tile.className = "photo-tile";
        tile.innerHTML = `<img alt="${label}"><small>${label}: ${photoStatusForRef(ref)}</small>`;
        wrap.appendChild(tile);
        resolvePhotoSrc(ref).then((src) => {
          if (src) tile.querySelector("img").src = src;
        });
      }
      const input = $(inputSelector);
      if (input?.files) {
        for (const file of Array.from(input.files)) {
          const tile = document.createElement("div");
          tile.className = "photo-tile";
          tile.innerHTML = `<img alt="${label}"><small>${label} nowe</small>`;
          tile.querySelector("img").src = URL.createObjectURL(file);
          wrap.appendChild(tile);
        }
      }
      if (!wrap.children.length) wrap.innerHTML = `<p class="muted">Brak zdjęć.</p>`;
    };
    await render("#nest-photo-preview", currentNestPhotos, "#nest-photos", "gniazdo");
    await render("#random-photo-preview", currentRandomPhotos, "#random-photos", "punkt losowy");
  }

  function updateCounts() {
    const entries = activeEntries();
    $("#entry-count").textContent = String(entries.length);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayCount = entries.filter((entry) => entry.obsDate === today).length;
    $("#today-count").textContent = String(todayCount);
    if ($("#offline-status")) $("#offline-status").textContent = navigator.onLine ? "online" : "offline";
    renderHomeSummary();
    const speciesSummary = $("#species-summary");
    if (speciesSummary) {
      const stats = new Map();
      entries.forEach((entry) => {
        const key = entry.species || "unknown";
        if (!stats.has(key)) stats.set(key, { all: 0, today: 0 });
        const row = stats.get(key);
        row.all += 1;
        if (entry.obsDate === today) row.today += 1;
      });
      speciesSummary.innerHTML = [
        `<div>Wszystkie rekordy: ${entries.length}</div>`,
        `<div>Dzisiaj: ${todayCount}</div>`,
        ...Array.from(stats.entries()).map(([key, row]) => `<div>${escapeHtml(LABELS.species[key] || key || "Inne / nieokreślone")}: ${row.all}, dziś ${row.today}</div>`),
      ].join("");
    }
  }

  function renderEntries() {
    revokePhotoUrls("server");
    const list = $("#entries-list");
    if (!list) return;
    const query = trim("#record-search").toLowerCase();
    const entries = activeEntries();
    const filtered = !query ? entries : entries.filter((entry) => {
      const text = [
        entry.nestId,
        entry.sector,
        entry.observer,
        LABELS.species[entry.species] || entry.species,
        entry.obsDate,
      ].join(" ").toLowerCase();
      return text.includes(query);
    });

    if (!filtered.length) {
      list.innerHTML = `<p class="muted">Brak rekordów.</p>`;
      return;
    }

    list.innerHTML = "";
    filtered.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "entry-card";
      card.dataset.uid = entry.uid;
      card.innerHTML = `
        <div class="entry-main">
          <h3>${escapeHtml(entry.nestId || "(bez ID)")}</h3>
          ${renderRecordCompletenessBadge(entry)}
          <p>${escapeHtml(LABELS.species[entry.species] || entry.species || "gatunek?")} • ${escapeHtml(entry.sector || "sektor?")}</p>
          <p class="muted">${escapeHtml(entry.obsDate || "")} ${escapeHtml(entry.obsTime || "")} • jaja: ${entry.eggCount ?? "brak"} • obserwator: ${escapeHtml(entry.observer || "brak")}</p>
          <p class="muted">GPS: ${entry.lat ?? "brak"}, ${entry.lon ?? "brak"} • protokół: ${escapeHtml(entry.protocolVersion || "")}</p>
          <p class="muted">Sync: ${escapeHtml(entry.syncStatus || "pending")}</p>
          <p class="muted">${escapeHtml(formatPhotoSyncStatus(getPhotoSyncSummaryForRefs(collectPhotoRefsFromEntries([entry]))))}</p>
        </div>
        <div class="entry-actions">
          <button type="button" data-action="share" data-uid="${entry.uid}">Udostępnij</button>
          ${canEditItem(entry) ? `<button type="button" data-action="edit" data-uid="${entry.uid}">Edytuj</button>` : ""}
          ${canSoftDeleteItem(entry) ? `<button type="button" data-action="delete" data-uid="${entry.uid}" class="danger">Ukryj</button>` : ""}
        </div>
      `;
      list.appendChild(card);
    });
  }



  function buildRecordShareText(record) {
    const speciesLabel = LABELS.species[record?.species] || record?.species || "Nieokreślony";
    const nestPos = toLatLon(record?.lat, record?.lon);
    const gpsText = nestPos ? `${nestPos[0].toFixed(6)}, ${nestPos[1].toFixed(6)}` : "brak";
    const mapUrl = nestPos ? `https://www.google.com/maps?q=${nestPos[0].toFixed(6)},${nestPos[1].toFixed(6)}` : null;
    return [
      `Gniazdo: ${record?.nestId || "(bez ID)"}`,
      `Gatunek: ${speciesLabel}`,
      `Data: ${record?.obsDate || "brak"}`,
      `Liczba jaj: ${record?.eggCount ?? "brak"}`,
      `GPS: ${gpsText}`,
      ...(mapUrl ? [`Mapa: ${mapUrl}`] : []),
    ].join("\n");
  }

  async function shareRecord(uid) {
    const record = getEntries().find((entry) => String(entry.uid) === String(uid));
    if (!record) return;
    const text = buildRecordShareText(record);
    if (navigator.share) {
      try {
        await navigator.share({ title: record.nestId || "Rekord gniazda", text });
        return;
      } catch {}
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => alert("Skopiowano dane rekordu do schowka"), () => alert(text));
      return;
    }
    alert(text);
  }

  function hasValidCoords(lat, lon) {
    if (lat == null || lon == null) return false;
    if (String(lat).trim() === "" || String(lon).trim() === "") return false;
    const a = Number(lat), b = Number(lon);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (a < -90 || a > 90 || b < -180 || b > 180) return false;
    if (a === 0 && b === 0) return false;
    return true;
  }

  function toLatLon(lat, lon) {
    if (!hasValidCoords(lat, lon)) return null;
    const a = Number(lat); const b = Number(lon);
    return [a, b];
  }

  function initMeasureTools(map, mapId) {
    const state = measureStates[mapId];
    if (!state || state.bound) return;
    state.map = map;
    state.bound = true;
    disableMapPanelPropagation(mapId);
    const toolbar = $(`#${mapId}-measure-toolbar`);
    if (toolbar && typeof L !== "undefined") {
      L.DomEvent.disableClickPropagation(toolbar);
      L.DomEvent.disableScrollPropagation(toolbar);
    }
    $(`#${mapId}-measure-mode`)?.addEventListener("change", (event) => setMeasureMode(mapId, event.target.value));
    $(`#${mapId}-measure-undo`)?.addEventListener("click", () => undoMeasurePoint(mapId));
    $(`#${mapId}-measure-clear`)?.addEventListener("click", () => clearMeasure(mapId));
    $(`#${mapId}-measure-finish`)?.addEventListener("click", () => finishMeasure(mapId));
    map.on("click", (event) => addMeasurePoint(mapId, event.latlng));
    updateMeasureResult(mapId);
  }

  function disableMapPanelPropagation(mapId) {
    if (typeof L === "undefined") return;
    $$(
      `#${mapId}-measure-panel, #${mapId}-options-panel, #${mapId}-legend-panel`
    ).forEach((panel) => {
      L.DomEvent.disableClickPropagation(panel);
      L.DomEvent.disableScrollPropagation(panel);
    });
  }

  function setMeasurePanelOpen(mapId, open) {
    const panel = $(`#${mapId}-measure-panel`);
    if (panel) panel.open = !!open;
  }

  function setMeasureMode(mapId, mode) {
    const state = measureStates[mapId];
    if (!state) return;
    const nextMode = ["off", "line", "polygon"].includes(mode) ? mode : "off";
    const shouldStartFresh = nextMode !== "off" && (state.finished || (state.mode !== "off" && state.mode !== nextMode));
    state.mode = nextMode;
    state.finished = false;
    const panel = $(`#${mapId}-measure-panel`);
    if (panel && nextMode !== "off") panel.open = true;
    if (shouldStartFresh) clearMeasure(mapId, { keepMode: true });
    updateMeasureGeometry(mapId);
    updateMeasureResult(mapId);
    setMeasurePanelOpen(mapId, nextMode !== "off");
  }

  function addMeasurePoint(mapId, latlng) {
    const state = measureStates[mapId];
    if (!state || state.mode === "off" || state.finished || !state.map) return;
    state.points.push(L.latLng(latlng));
    const marker = L.circleMarker(latlng, {
      radius: 6,
      color: "#ffffff",
      weight: 2,
      fillColor: "#0f766e",
      fillOpacity: 0.95,
      className: "measure-point-marker",
      interactive: false
    }).addTo(state.map);
    state.markers.push(marker);
    updateMeasureGeometry(mapId);
    updateMeasureResult(mapId);
  }

  function undoMeasurePoint(mapId) {
    const state = measureStates[mapId];
    if (!state || !state.points.length) return;
    state.points.pop();
    const marker = state.markers.pop();
    if (marker && state.map) state.map.removeLayer(marker);
    state.finished = false;
    updateMeasureGeometry(mapId);
    updateMeasureResult(mapId);
  }

  function clearMeasure(mapId, options = {}) {
    const state = measureStates[mapId];
    if (!state || !state.map) return;
    state.points = [];
    state.finished = false;
    state.markers.forEach((marker) => state.map.removeLayer(marker));
    state.markers = [];
    if (state.line) state.map.removeLayer(state.line);
    if (state.polygon) state.map.removeLayer(state.polygon);
    state.line = null;
    state.polygon = null;
    if (!options.keepMode) {
      state.mode = "off";
      const select = $(`#${mapId}-measure-mode`);
      if (select) select.value = "off";
      const panel = $(`#${mapId}-measure-panel`);
      if (panel) panel.open = false;
    }
    updateMeasureResult(mapId, "Pomiar wyczyszczony");
    if (!options.keepMode) setMeasurePanelOpen(mapId, false);
  }

  function finishMeasure(mapId) {
    const state = measureStates[mapId];
    if (!state) return;
    state.finished = true;
    updateMeasureResult(mapId, "Pomiar zakończony");
  }

  function updateMeasureGeometry(mapId) {
    const state = measureStates[mapId];
    if (!state?.map) return;
    if (state.mode !== "line" && state.line) {
      state.map.removeLayer(state.line);
      state.line = null;
    }
    if (state.mode !== "polygon" && state.polygon) {
      state.map.removeLayer(state.polygon);
      state.polygon = null;
    }
    if (state.mode === "line") {
      if (!state.line) {
        state.line = L.polyline(state.points, { color: "#0f766e", weight: 4, opacity: 0.9 }).addTo(state.map);
      } else {
        state.line.setLatLngs(state.points);
      }
      state.line.bringToFront();
    }
    if (state.mode === "polygon") {
      if (!state.polygon) {
        state.polygon = L.polygon(state.points, { color: "#0f766e", weight: 3, fillColor: "#14b8a6", fillOpacity: 0.22 }).addTo(state.map);
      } else {
        state.polygon.setLatLngs(state.points);
      }
      state.polygon.bringToFront();
    }
    state.markers.forEach((marker) => marker.bringToFront());
  }

  function updateMeasureResult(mapId, prefix = "") {
    const state = measureStates[mapId];
    const el = $(`#${mapId}-measure-result`);
    if (!state || !el) return;
    let message = prefix;
    if (!message) {
      if (state.mode === "off") message = "Pomiar wyłączony";
      else if (!state.points.length) message = "Kliknij mapę, aby dodać pierwszy punkt";
      else if (state.mode === "line") {
        const meters = state.points.slice(1).reduce((sum, point, index) => sum + state.map.distance(state.points[index], point), 0);
        message = meters > 0 ? `Odległość: ${formatDistanceMeters(meters)}` : "Dodaj kolejny punkt";
      } else if (state.mode === "polygon") {
        message = state.points.length < 3
          ? "Dodaj co najmniej 3 punkty, aby policzyć powierzchnię"
          : `Powierzchnia: ${formatAreaMeters(geodesicArea(state.points))}`;
      }
      if (state.finished && state.mode !== "off") message = `${message}. Pomiar zakończony`;
    }
    el.textContent = message;
  }

  function formatDistanceMeters(meters) {
    const roundedMeters = Math.round(Number(meters) || 0);
    const km = (roundedMeters / 1000).toFixed(2).replace(".", ",");
    return `${roundedMeters} m (${km} km)`;
  }

  function formatAreaMeters(areaM2) {
    const rounded = Math.round(Number(areaM2) || 0);
    const ha = (rounded / 10000).toFixed(2).replace(".", ",");
    return `${rounded} m² (${ha} ha)`;
  }

  function geodesicArea(latLngs) {
    const pointsCount = latLngs.length;
    if (pointsCount < 3) return 0;
    const d2r = Math.PI / 180;
    const earthRadius = 6378137;
    let area = 0;
    for (let i = 0; i < pointsCount; i += 1) {
      const p1 = latLngs[i];
      const p2 = latLngs[(i + 1) % pointsCount];
      area += ((p2.lng - p1.lng) * d2r) * (2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r));
    }
    return Math.abs(area * earthRadius * earthRadius / 2);
  }

  function bringMeasureToFront(mapId) {
    const state = measureStates[mapId];
    if (!state) return;
    state.line?.bringToFront();
    state.polygon?.bringToFront();
    state.markers.forEach((marker) => marker.bringToFront());
  }

  function tileToMercatorBbox(x, y, z) {
    const originShift = 20037508.342789244;
    const tileCount = 2 ** z;
    const tileSpan = (originShift * 2) / tileCount;
    const minx = -originShift + x * tileSpan;
    const maxx = -originShift + (x + 1) * tileSpan;
    const maxy = originShift - y * tileSpan;
    const miny = originShift - (y + 1) * tileSpan;
    return [minx, miny, maxx, maxy];
  }

  function createGeoportalWmsTileUrl(x, y, z, options = {}) {
    const bbox = tileToMercatorBbox(x, y, z).map((value) => value.toFixed(6)).join(",");
    const params = new URLSearchParams({
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: "Raster",
      styles: "",
      format: "image/jpeg",
      transparent: "false",
      crs: "EPSG:3857",
      width: String(ORTO_TILE_SIZE),
      height: String(ORTO_TILE_SIZE),
      bbox
    });
    if (options.offline) params.set(ORTO_OFFLINE_LAYER_PARAM, "1");
    return `${GEOPORTAL_ORTO_WMS_URL}?${params.toString()}`;
  }

  function normalizeOrtoTileCacheKey(url) {
    try {
      const normalized = new URL(url, window.location.href);
      normalized.searchParams.delete(ORTO_OFFLINE_LAYER_PARAM);
      return normalized.toString();
    } catch {
      return String(url || "").replace(/([?&])sieweczkaOffline=1(&)?/, (match, prefix, suffix) => suffix ? prefix : "").replace(/[?&]$/, "");
    }
  }



  function createDominikTileUrl(x, y, z, options = {}) {
    const requestedZ = Math.max(0, Math.round(Number(z) || 0));
    const nativeZ = Math.min(requestedZ, DOMINIK_MAX_NATIVE_ZOOM);
    const scale = 2 ** Math.max(0, requestedZ - nativeZ);
    const nativeX = Math.floor(Number(x) / scale);
    const nativeY = Math.floor(Number(y) / scale);
    const params = new URLSearchParams({ key: DOMINIK_LAYER_KEY });
    if (options.offline) params.set(DOMINIK_OFFLINE_LAYER_PARAM, "1");
    return `https://api.maptiler.com/tiles/${DOMINIK_LAYER_TILESET_ID}/${nativeZ}/${nativeX}/${nativeY}?${params.toString()}`;
  }

  function normalizeDominikTileCacheKey(url) {
    try {
      const normalized = new URL(url, window.location.href);
      normalized.searchParams.delete(DOMINIK_OFFLINE_LAYER_PARAM);
      return normalized.toString();
    } catch {
      return String(url || "").replace(/([?&])sieweczkaDominikOffline=1(&)?/, (match, prefix, suffix) => suffix ? prefix : "").replace(/[?&]$/, "");
    }
  }

  function createEmptyTileResponse() {
    return new Response(createEmptyTileSvg(), { status: 200, headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
  }

  async function getOfflineOrtoTileResponse(url) {
    if (!("caches" in window)) return createEmptyTileResponse();
    const cacheKey = normalizeOrtoTileCacheKey(url);
    const cache = await caches.open(ORTO_OFFLINE_CACHE);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    if (!navigator.onLine) return createEmptyTileResponse();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(cacheKey, { signal: controller.signal, cache: "no-store" });
      if (response && response.ok) {
        await cache.put(cacheKey, response.clone());
        return response;
      }
      return createEmptyTileResponse();
    } catch {
      return createEmptyTileResponse();
    } finally {
      clearTimeout(timeout);
    }
  }

  function createGeoportalOfflineTileLayer() {
    const OfflineOrtoLayer = L.TileLayer.extend({
      getTileUrl(coords) {
        return createGeoportalWmsTileUrl(coords.x, coords.y, coords.z, { offline: true });
      }
    });
    return new OfflineOrtoLayer("", {
      tileSize: ORTO_TILE_SIZE,
      maxZoom: MAP_MAX_ZOOM,
      maxNativeZoom: 21,
      attribution: "Ortofotomapa offline: cache-first Geoportal / GUGiK"
    });
  }



  async function getOfflineDominikTileResponse(url) {
    if (!("caches" in window)) return createEmptyTileResponse();
    const cacheKey = normalizeDominikTileCacheKey(url);
    const cache = await caches.open(DOMINIK_OFFLINE_CACHE);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    if (!navigator.onLine) return createEmptyTileResponse();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(cacheKey, { signal: controller.signal, cache: "no-store" });
      if (response && response.ok) {
        await cache.put(cacheKey, response.clone());
        return response;
      }
      return createEmptyTileResponse();
    } catch {
      return createEmptyTileResponse();
    } finally {
      clearTimeout(timeout);
    }
  }

  function createDominikOfflineTileLayer() {
    const OfflineDominikLayer = L.TileLayer.extend({
      getTileUrl(coords) {
        return createDominikTileUrl(coords.x, coords.y, coords.z, { offline: true });
      }
    });
    return new OfflineDominikLayer("", {
      tileSize: ORTO_TILE_SIZE,
      minZoom: 0,
      maxZoom: DOMINIK_MAX_DISPLAY_ZOOM,
      maxNativeZoom: DOMINIK_MAX_NATIVE_ZOOM,
      errorTileUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(createEmptyTileSvg())}`,
      attribution: "Dominik Layer offline: cache-first MapTiler"
    });
  }

  function createEmptyTileSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#f8fafc"/><path d="M0 256 256 0M-64 192 192-64M64 320 320 64" stroke="#d7dee8" stroke-width="10"/><text x="128" y="126" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#64748b">Brak kafla offline</text><text x="128" y="146" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#64748b">dla tego miejsca</text></svg>`;
  }

  function getOrtoCacheStatusEl(mapId) {
    return $(`#${mapId}-orto-cache-status`);
  }

  function showMapOfflineStatus(mapId, message, options = {}) {
    const el = getOrtoCacheStatusEl(mapId);
    if (!el) return;
    const type = options.type || "info";
    el.textContent = message;
    el.hidden = false;
    el.className = `map-offline-status ${type}`;
    clearTimeout(el._hideTimer);
    if (options.autoHide) {
      el._hideTimer = setTimeout(() => hideMapOfflineStatus(mapId), options.timeoutMs || 8000);
    }
  }

  function hideMapOfflineStatus(mapId) {
    const el = getOrtoCacheStatusEl(mapId);
    if (!el) return;
    clearTimeout(el._hideTimer);
    el.hidden = true;
  }

  function setOrtoCacheStatus(mapId, message, options = {}) {
    showMapOfflineStatus(mapId, message, options);
  }

  async function ensureOrtoStoragePersistence(mapId) {
    if (!navigator.storage?.persist) return;
    try {
      await navigator.storage.persist();
      showMapOfflineStatus(mapId, "Zapisane kafle są przechowywane lokalnie w telefonie. System może je usunąć, gdy zabraknie miejsca, ale aplikacja nie usuwa ich sama.", { type: "info", autoHide: true, timeoutMs: 8000 });
    } catch (error) {
      console.warn(error);
    }
  }

  function getVisibleTilePlan(map, layerKey = "geoportalOrto") {
    const requestedZoom = Math.round(map.getZoom());
    const z = layerKey === "dominikLayer" ? Math.min(requestedZoom, DOMINIK_MAX_NATIVE_ZOOM) : Math.min(requestedZoom, 21);
    const bounds = map.getBounds();
    const northWest = map.project(bounds.getNorthWest(), z);
    const southEast = map.project(bounds.getSouthEast(), z);
    const min = northWest.divideBy(ORTO_TILE_SIZE).floor();
    const max = southEast.divideBy(ORTO_TILE_SIZE).floor();
    const tileCount = 2 ** z;
    const tiles = [];
    for (let x = min.x - 1; x <= max.x + 1; x++) {
      const wrappedX = ((x % tileCount) + tileCount) % tileCount;
      for (let y = Math.max(0, min.y - 1); y <= Math.min(tileCount - 1, max.y + 1); y++) {
        const url = layerKey === "dominikLayer" ? createDominikTileUrl(wrappedX, y, z) : createGeoportalWmsTileUrl(wrappedX, y, z);
        tiles.push({ x: wrappedX, y, z, url });
      }
    }
    return { z, requestedZoom, tiles };
  }

  function getTileCacheConfig(layerKey = "geoportalOrto") {
    if (layerKey === "dominikLayer") return { cacheName: DOMINIK_OFFLINE_CACHE, normalize: normalizeDominikTileCacheKey, label: "Dominik Layer", metaKey: `${ORTO_CACHE_META_KEY}-dominik` };
    return { cacheName: ORTO_OFFLINE_CACHE, normalize: normalizeOrtoTileCacheKey, label: "ortofoto", metaKey: ORTO_CACHE_META_KEY };
  }

  async function hasCachedTile(url, layerKey = "geoportalOrto") {
    if (!("caches" in window)) return false;
    const cfg = getTileCacheConfig(layerKey);
    const cache = await caches.open(cfg.cacheName);
    return !!(await cache.match(cfg.normalize(url)));
  }

  async function cacheTileUrl(url, layerKey = "geoportalOrto") {
    const cfg = getTileCacheConfig(layerKey);
    const cache = await caches.open(cfg.cacheName);
    const cacheKey = cfg.normalize(url);
    const cached = await cache.match(cacheKey);
    if (cached) return "skipped";
    let response;
    try {
      response = await fetch(cacheKey);
      if (!response || !response.ok) throw new Error(`HTTP ${response?.status || 0}`);
    } catch {
      response = await fetch(cacheKey, { mode: "no-cors" });
      if (!response || (response.type !== "opaque" && !response.ok)) throw new Error(`HTTP ${response?.status || 0}`);
    }
    await cache.put(cacheKey, response.clone());
    return "saved";
  }

  async function runOrtoQueue(tasks, worker) {
    let index = 0;
    const workers = Array.from({ length: Math.min(ORTO_CACHE_CONCURRENCY, tasks.length) }, async () => {
      while (index < tasks.length) {
        const task = tasks[index++];
        await worker(task);
      }
    });
    await Promise.all(workers);
  }

  async function cacheCurrentMapView(map, mapId, layerKey = "geoportalOrto") {
    const state = ortoCacheState[mapId];
    const isDominik = layerKey === "dominikLayer";
    const cfg = getTileCacheConfig(layerKey);
    if (!state || !map || !("caches" in window)) return;
    const runningKey = isDominik ? "dominikRunning" : "running";
    const pendingKey = isDominik ? "dominikPending" : "pending";
    const enabledKey = isDominik ? "dominikEnabled" : "enabled";
    const savedKey = isDominik ? "dominikSavedSession" : "savedSession";
    const skippedKey = isDominik ? "dominikSkippedSession" : "skippedSession";
    const zoomKey = isDominik ? "dominikLastZoom" : "lastZoom";
    const errorKey = isDominik ? "dominikLastError" : "lastError";
    if (state[runningKey]) {
      state[pendingKey] = true;
      return;
    }
    state[runningKey] = true;
    state[pendingKey] = false;
    state[errorKey] = "";
    let saved = 0;
    let skipped = 0;
    try {
      const plan = getVisibleTilePlan(map, layerKey);
      state[zoomKey] = plan.z;
      showMapOfflineStatus(mapId, `Zapisuję widoczne kafle ${cfg.label}...`, { type: "info" });
      const cache = await caches.open(cfg.cacheName);
      const missing = [];
      for (const tile of plan.tiles) {
        if (await cache.match(cfg.normalize(tile.url))) {
          skipped++;
        } else {
          missing.push(tile);
        }
      }
      if (!missing.length) {
        state[skippedKey] += skipped;
        await updateViewedOrtoCacheDiagnostics(mapId, `Ten widok ${cfg.label} jest dostępny offline. Pominięto ${skipped} kafli, bo już były zapisane.`);
        return;
      }
      if (missing.length > ORTO_MAX_NEW_TILES_PER_VIEW || state[savedKey] >= ORTO_MAX_NEW_TILES_PER_SESSION) {
        await updateViewedOrtoCacheDiagnostics(mapId, `Limit zapisu ${cfg.label} osiągnięty. Zmień zoom albo wyłącz i włącz ponownie.`);
        return;
      }
      const allowed = Math.min(missing.length, ORTO_MAX_NEW_TILES_PER_VIEW, ORTO_MAX_NEW_TILES_PER_SESSION - state[savedKey]);
      const queue = missing.slice(0, allowed);
      await runOrtoQueue(queue, async (tile) => {
        try {
          const result = await cacheTileUrl(tile.url, layerKey);
          if (result === "saved") saved++;
          else skipped++;
          if (result === "saved") {
            state[savedKey] += 1;
            localStorage.setItem(cfg.metaKey, JSON.stringify({ lastSavedAt: new Date().toISOString() }));
          }
          state[skippedKey] += result === "skipped" ? 1 : 0;
          showMapOfflineStatus(mapId, `Zapisuję widoczne kafle ${cfg.label}... zapisano ${saved}, pominięto ${skipped}.`, { type: "info" });
        } catch (error) {
          state[errorKey] = error.message || String(error);
        }
      });
      state[skippedKey] += skipped;
      await updateViewedOrtoCacheDiagnostics(mapId, `Zapisano ${saved} nowych kafli ${cfg.label}. Pominięto ${skipped} kafli, bo już były zapisane. Ten widok powinien działać offline.`);
    } catch (error) {
      state[errorKey] = error.message || String(error);
      await updateViewedOrtoCacheDiagnostics(mapId, `Błąd zapisu ${cfg.label}: ${state[errorKey]}`);
    } finally {
      state[runningKey] = false;
      if (state[pendingKey] && state[enabledKey]) {
        state[pendingKey] = false;
        cacheCurrentMapView(map, mapId, layerKey);
      }
    }
  }

  function scheduleViewedOrtoCache(map, mapId) {
    const state = ortoCacheState[mapId];
    if (!state?.enabled) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => cacheCurrentMapView(map, mapId), ORTO_CACHE_DEBOUNCE_MS);
  }

  function enableViewedOrtoCaching(map, mapId) {
    const state = ortoCacheState[mapId];
    if (!state) return;
    state.enabled = true;
    ensureOrtoStoragePersistence(mapId);
    showMapOfflineStatus(mapId, "Zapis oglądanej ortofotomapy włączony. Przesuwaj mapę — widoczne miejsca zostaną zapisane offline.", { type: "info", autoHide: true, timeoutMs: 8000 });
    scheduleViewedOrtoCache(map, mapId);
  }

  function disableViewedOrtoCaching(mapId) {
    const state = ortoCacheState[mapId];
    if (!state) return;
    state.enabled = false;
    clearTimeout(state.timer);
    showMapOfflineStatus(mapId, "Offline ortofoto: wyłączone", { type: "info", autoHide: true, timeoutMs: 6000 });
  }


  function scheduleViewedDominikCache(map, mapId) {
    const state = ortoCacheState[mapId];
    if (!state?.dominikEnabled) return;
    clearTimeout(state.dominikTimer);
    state.dominikTimer = setTimeout(() => cacheCurrentMapView(map, mapId, "dominikLayer"), ORTO_CACHE_DEBOUNCE_MS);
  }

  function enableViewedDominikCaching(map, mapId) {
    const state = ortoCacheState[mapId];
    if (!state) return;
    state.dominikEnabled = true;
    ensureOrtoStoragePersistence(mapId);
    showMapOfflineStatus(mapId, "Zapis Dominik Layer włączony. Przesuwaj mapę — widoczne kafle zostaną zapisane offline w telefonie.", { type: "info", autoHide: true, timeoutMs: 8000 });
    scheduleViewedDominikCache(map, mapId);
  }

  function disableViewedDominikCaching(mapId) {
    const state = ortoCacheState[mapId];
    if (!state) return;
    state.dominikEnabled = false;
    clearTimeout(state.dominikTimer);
    showMapOfflineStatus(mapId, "Offline Dominik Layer: wyłączone", { type: "info", autoHide: true, timeoutMs: 6000 });
  }

  async function clearViewedOrtoCache() {
    if (!("caches" in window)) return false;
    localStorage.removeItem(ORTO_CACHE_META_KEY);
    return caches.delete(ORTO_OFFLINE_CACHE);
  }

  async function clearViewedDominikCache() {
    if (!("caches" in window)) return false;
    localStorage.removeItem(`${ORTO_CACHE_META_KEY}-dominik`);
    return caches.delete(DOMINIK_OFFLINE_CACHE);
  }

  async function getViewedOrtoCacheSummary(layerKey = "geoportalOrto") {
    if (!("caches" in window)) return { count: 0 };
    const cfg = getTileCacheConfig(layerKey);
    const cache = await caches.open(cfg.cacheName);
    const keys = await cache.keys();
    let lastSavedAt = "";
    try {
      lastSavedAt = JSON.parse(localStorage.getItem(cfg.metaKey) || "{}").lastSavedAt || "";
    } catch {
      lastSavedAt = "";
    }
    return { count: keys.length, lastSavedAt };
  }

  async function updateViewedOrtoCacheDiagnostics(mapId, prefix = "") {
    const state = ortoCacheState[mapId];
    const summary = await getViewedOrtoCacheSummary("geoportalOrto");
    const dominikSummary = await getViewedOrtoCacheSummary("dominikLayer");
    const lastSaved = summary.lastSavedAt ? new Date(summary.lastSavedAt).toLocaleString("pl-PL") : "—";
    const dominikLastSaved = dominikSummary.lastSavedAt ? new Date(dominikSummary.lastSavedAt).toLocaleString("pl-PL") : "—";
    const message = [
      prefix,
      "Offline: wspólne dla obu map.",
      `Ortofotomapa: ${summary.count} kafli, ostatni zapis: ${lastSaved}.`,
      `Dominik Layer: ${dominikSummary.count} kafli, ostatni zapis: ${dominikLastSaved}.`,
      "Cache działa na mapie rekordów i mapie gniazd roboczych.",
      `Sesja orto: zapisano ${state?.savedSession || 0}, pominięto ${state?.skippedSession || 0}, zoom ${state?.lastZoom ?? "—"}.`,
      `Sesja Dominik: zapisano ${state?.dominikSavedSession || 0}, pominięto ${state?.dominikSkippedSession || 0}, zoom kafli ${state?.dominikLastZoom ?? "—"}.`,
      `Status: ${navigator.onLine ? "online" : "offline"}.`,
      state?.lastError ? `Ostatni błąd orto: ${state.lastError}.` : "",
      state?.dominikLastError ? `Ostatni błąd Dominik: ${state.dominikLastError}.` : ""
    ].filter(Boolean).join(" ");
    const type = /błąd/i.test(message) ? "error" : /brak kafli|limit/i.test(message) ? "warning" : /usunięto|zapisano|dostępny/i.test(message) ? "success" : "info";
    showMapOfflineStatus(mapId, message, { type, autoHide: type !== "error" && !state?.running, timeoutMs: 9000 });
  }

  async function switchToOfflineOrtoIfNeeded(map, mapId) {
    const state = ortoCacheState[mapId];
    if (!map || navigator.onLine || !state?.offlineLayer) return;
    const current = state.currentBaseLayerName || $(`#${mapId}-base-layer`)?.value || "";
    const dominikSummary = await getViewedOrtoCacheSummary("dominikLayer");
    if (current.includes("Dominik") && dominikSummary.count > 0) {
      setMapBaseLayer(map, mapId, "Dominik Layer offline");
      showMapOfflineStatus(mapId, "Brak internetu. Pokazuję zapisany Dominik Layer offline.", { type: "warning" });
      return;
    }
    const summary = await getViewedOrtoCacheSummary("geoportalOrto");
    if (summary.count > 0) {
      setMapBaseLayer(map, mapId, "Ortofotomapa offline");
      showMapOfflineStatus(mapId, "Brak internetu. Pokazuję zapisane kafle offline.", { type: "warning" });
    } else if (dominikSummary.count > 0) {
      setMapBaseLayer(map, mapId, "Dominik Layer offline");
      showMapOfflineStatus(mapId, "Brak internetu. Brak ortofoto offline, pokazuję zapisany Dominik Layer offline.", { type: "warning" });
    } else {
      showMapOfflineStatus(mapId, "Brak kafli offline dla tego widoku.", { type: "warning", autoHide: true, timeoutMs: 8000 });
    }
  }

  function initViewedOrtoCacheTools(map, mapId) {
    const state = ortoCacheState[mapId];
    if (!state || state.bound) return;
    state.bound = true;
    const toggle = $(`#${mapId}-orto-cache-toggle`);
    const clearBtn = $(`#${mapId}-orto-cache-clear`);
    const dominikToggle = $(`#${mapId}-dominik-cache-toggle`);
    const dominikClearBtn = $(`#${mapId}-dominik-cache-clear`);
    toggle?.addEventListener("change", () => {
      if (toggle.checked) enableViewedOrtoCaching(map, mapId);
      else disableViewedOrtoCaching(mapId);
    });
    dominikToggle?.addEventListener("change", () => {
      if (dominikToggle.checked) enableViewedDominikCaching(map, mapId);
      else disableViewedDominikCaching(mapId);
    });
    clearBtn?.addEventListener("click", async () => {
      const confirmed = confirm("Usunąć zapisaną ortofotomapę offline z telefonu? Ta operacja usunie kafle offline używane przez mapę rekordów i mapę gniazd roboczych. Rekordy, zdjęcia i gniazda robocze nie zostaną usunięte.");
      if (!confirmed) {
        await updateViewedOrtoCacheDiagnostics(mapId, "Usuwanie ortofotomapy offline anulowane.");
        return;
      }
      await clearViewedOrtoCache();
      for (const item of Object.values(ortoCacheState)) {
        item.savedSession = 0;
        item.skippedSession = 0;
        item.lastError = "";
        if (item.map && item.onlineLayer && navigator.onLine) {
          const clearedMapId = item === ortoCacheState.records ? "records" : "working";
          setMapBaseLayer(item.map, clearedMapId, "Ortofotomapa Geoportal");
        }
      }
      await updateViewedOrtoCacheDiagnostics(mapId, "Usunięto ortofotomapę offline. Rekordy i gniazda robocze pozostały bez zmian.");
      const otherMapId = mapId === "records" ? "working" : "records";
      await updateViewedOrtoCacheDiagnostics(otherMapId, "Usunięto ortofotomapę offline. Rekordy i gniazda robocze pozostały bez zmian.");
    });

    dominikClearBtn?.addEventListener("click", async () => {
      const confirmed = confirm("Usunąć zapisany Dominik Layer offline z telefonu? Ta operacja usunie tylko kafle Dominik Layer używane przez obie mapy.");
      if (!confirmed) {
        await updateViewedOrtoCacheDiagnostics(mapId, "Usuwanie Dominik Layer offline anulowane.");
        return;
      }
      await clearViewedDominikCache();
      for (const item of Object.values(ortoCacheState)) {
        item.dominikSavedSession = 0;
        item.dominikSkippedSession = 0;
        item.dominikLastError = "";
      }
      await updateViewedOrtoCacheDiagnostics(mapId, "Usunięto Dominik Layer offline. Rekordy i gniazda robocze pozostały bez zmian.");
      const otherMapId = mapId === "records" ? "working" : "records";
      await updateViewedOrtoCacheDiagnostics(otherMapId, "Usunięto Dominik Layer offline. Rekordy i gniazda robocze pozostały bez zmian.");
    });
    map.on("moveend zoomend", () => { scheduleViewedOrtoCache(map, mapId); scheduleViewedDominikCache(map, mapId); });
    window.addEventListener("online", () => updateViewedOrtoCacheDiagnostics(mapId));
    window.addEventListener("offline", () => {
      switchToOfflineOrtoIfNeeded(map, mapId);
      updateViewedOrtoCacheDiagnostics(mapId, "Brak internetu. Pokazuję zapisane kafle offline.");
    });
    hideMapOfflineStatus(mapId);
  }



  function getMapViewStates() {
    try {
      const parsed = JSON.parse(localStorage.getItem(MAP_VIEW_STATE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function getMapViewState(mapId) {
    const key = mapId === "working" ? "working" : "records";
    const state = getMapViewStates()[key];
    return state && typeof state === "object" ? state : {};
  }

  function saveMapViewState(mapId, patch = {}) {
    const key = mapId === "working" ? "working" : "records";
    const states = getMapViewStates();
    states[key] = {
      ...(states[key] || {}),
      ...patch,
      center: patch.center || states[key]?.center,
      overlays: { ...(states[key]?.overlays || {}), ...(patch.overlays || {}) },
      panels: { ...(states[key]?.panels || {}), ...(patch.panels || {}) },
      updatedAt: new Date().toISOString()
    };
    try { localStorage.setItem(MAP_VIEW_STATE_KEY, JSON.stringify(states)); } catch {}
  }

  function getMapOverlayState(mapId) {
    return {
      grid: !!$(`#${mapId}-grid-toggle`)?.checked,
      speciesLabels: mapId === "records" ? !!$("#records-species-labels-toggle")?.checked : undefined,
      notes: mapId === "working" ? !!$("#working-notes-toggle")?.checked : undefined,
      brysnaSmieckPoints: !!$(`#${mapId}-brysna-smieck-toggle`)?.checked
    };
  }

  function saveMapOverlayState(mapId) {
    saveMapViewState(mapId, { overlays: getMapOverlayState(mapId) });
  }

  function getMapPanelState(mapId) {
    return {
      optionsOpen: !!$(`#${mapId}-options-panel`)?.open,
      legendOpen: !!$(`#${mapId}-legend-panel`)?.open,
      measureOpen: !!$(`#${mapId}-measure-panel`)?.open
    };
  }

  function saveMapPanelState(mapId) {
    saveMapViewState(mapId, { panels: getMapPanelState(mapId) });
  }

  function captureMapViewState(map, mapId) {
    if (!map) return;
    const center = map.getCenter();
    saveMapViewState(mapId, {
      center: { lat: center.lat, lng: center.lng },
      zoom: map.getZoom(),
      baseLayer: ortoCacheState[mapId]?.currentBaseLayerName || $(`#${mapId}-base-layer`)?.value || "Ortofotomapa Geoportal",
      overlays: getMapOverlayState(mapId),
      panels: getMapPanelState(mapId)
    });
  }

  function scheduleMapViewStateSave(map, mapId) {
    const state = ortoCacheState[mapId];
    if (!state) return;
    clearTimeout(state.stateTimer);
    state.stateTimer = setTimeout(() => captureMapViewState(map, mapId), MAP_VIEW_STATE_DEBOUNCE_MS);
  }

  function restoreMapOverlayState(mapId) {
    const overlays = getMapViewState(mapId).overlays || {};
    const gridToggle = $(`#${mapId}-grid-toggle`);
    if (gridToggle && typeof overlays.grid === "boolean") gridToggle.checked = overlays.grid;
    const brysnaToggle = $(`#${mapId}-brysna-smieck-toggle`);
    if (brysnaToggle && typeof overlays.brysnaSmieckPoints === "boolean") brysnaToggle.checked = overlays.brysnaSmieckPoints;
    if (mapId === "records") {
      const speciesToggle = $("#records-species-labels-toggle");
      if (speciesToggle && typeof overlays.speciesLabels === "boolean") speciesToggle.checked = overlays.speciesLabels;
      recordSpeciesLabelsVisible = !!speciesToggle?.checked;
    } else {
      const notesToggle = $("#working-notes-toggle");
      if (notesToggle && typeof overlays.notes === "boolean") notesToggle.checked = overlays.notes;
      workingNotesVisible = !!notesToggle?.checked;
    }
    const brysnaState = brysnaSmieckLayerStates[mapId];
    if (brysnaState && brysnaToggle) brysnaState.visible = !!brysnaToggle.checked;
  }

  function restoreMapPanelState(mapId) {
    const panels = getMapViewState(mapId).panels || {};
    const optionPanel = $(`#${mapId}-options-panel`);
    const legendPanel = $(`#${mapId}-legend-panel`);
    const measurePanel = $(`#${mapId}-measure-panel`);
    if (optionPanel && typeof panels.optionsOpen === "boolean") optionPanel.open = panels.optionsOpen;
    if (legendPanel && typeof panels.legendOpen === "boolean") legendPanel.open = panels.legendOpen;
    if (measurePanel && typeof panels.measureOpen === "boolean") measurePanel.open = panels.measureOpen;
  }

  function restoreMapViewState(map, mapId) {
    const saved = getMapViewState(mapId);
    restoreMapOverlayState(mapId);
    restoreMapPanelState(mapId);
    const layers = ortoCacheState[mapId]?.baseLayers || {};
    const savedLayer = layers[saved.baseLayer] ? saved.baseLayer : "Ortofotomapa Geoportal";
    setMapBaseLayer(map, mapId, savedLayer);
    if (saved.center && Number.isFinite(saved.center.lat) && Number.isFinite(saved.center.lng) && Number.isFinite(saved.zoom)) {
      map.setView([saved.center.lat, saved.center.lng], saved.zoom);
      ortoCacheState[mapId].viewRestored = true;
    }
  }

  function initMapViewStatePersistence(map, mapId) {
    const state = ortoCacheState[mapId];
    if (!state || state.stateBound) return;
    state.stateBound = true;
    map.on("moveend zoomend baselayerchange overlayadd overlayremove", () => scheduleMapViewStateSave(map, mapId));
    $$(`#${mapId}-options-panel, #${mapId}-legend-panel, #${mapId}-measure-panel`).forEach((panel) => {
      panel.addEventListener("toggle", () => saveMapPanelState(mapId));
    });
    window.addEventListener("beforeunload", () => captureMapViewState(map, mapId));
  }

  function createBaseLayers() {
    const geoportalOrto = createGeoportalOrtoLayer();
    const geoportalOffline = createGeoportalOfflineTileLayer();
    const dominikLayer = createDominikLayer();
    const dominikOffline = createDominikOfflineTileLayer();
    const esriImgLbl = L.layerGroup([
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"),
      L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}")
    ]);
    const esriWorldImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}");
    return {
      defaultLayer: geoportalOrto,
      onlineLayer: geoportalOrto,
      offlineLayer: geoportalOffline,
      layers: {
        "Ortofotomapa Geoportal": geoportalOrto,
        "Ortofotomapa offline": geoportalOffline,
        "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: MAP_MAX_ZOOM, maxNativeZoom: 19 }),
        "Dominik Layer": dominikLayer,
        "Dominik Layer offline": dominikOffline,
        "Esri Imagery + Labels": esriImgLbl,
        "ArcGIS Terrain with Labels": L.layerGroup([
          L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 13, maxNativeZoom: 13, attribution: "Esri Terrain" }),
          L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}", { maxZoom: MAP_MAX_ZOOM, maxNativeZoom: 19, attribution: "Esri Labels" })
        ]),
        "Esri World Imagery": esriWorldImagery,
        "OSM Standard": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: MAP_MAX_ZOOM, maxNativeZoom: 19 }),
        "OSM DE": L.tileLayer("https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png", { maxZoom: MAP_MAX_ZOOM, maxNativeZoom: 18 }),
        "CARTO Positron": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"),
        "CARTO Voyager": L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"),
        "OpenTopoMap": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png")
      }
    };
  }

  function setMapBaseLayer(map, mapId, layerName) {
    const state = ortoCacheState[mapId];
    const layers = state?.baseLayers;
    const nextLayer = layers?.[layerName];
    if (!map || !nextLayer || !layers) {
      showMapOfflineStatus(mapId, `Nieznana warstwa mapy: ${layerName}. Przywracam Geoportal.`, { type: "warning", autoHide: true, timeoutMs: 7000 });
      if (layerName !== "Ortofotomapa Geoportal") setMapBaseLayer(map, mapId, "Ortofotomapa Geoportal");
      return;
    }
    Object.values(layers).forEach((layer) => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    nextLayer.addTo(map);
    const layerMaxZoom = layerName.startsWith("Dominik Layer") ? DOMINIK_MAX_DISPLAY_ZOOM : MAP_MAX_ZOOM;
    map.setMaxZoom(layerMaxZoom);
    if (map.getZoom() > layerMaxZoom) map.setZoom(layerMaxZoom);
    state.currentBaseLayerName = layerName;
    const select = $(`#${mapId}-base-layer`);
    if (select) select.value = layerName;
    if (layerName === "Ortofotomapa offline") {
      showMapOfflineStatus(mapId, "Ortofotomapa offline działa cache-first. Brakujące kafle pokażą neutralny placeholder.", { type: "info", autoHide: true, timeoutMs: 6000 });
    }
    if (layerName === "Dominik Layer offline") {
      showMapOfflineStatus(mapId, "Dominik Layer offline działa cache-first. Brakujące kafle pokażą neutralny placeholder. Powyżej zoomu kafelków aplikacja powiększa ostatnie dostępne kafle.", { type: "info", autoHide: true, timeoutMs: 8000 });
    }
    if (state.stateBound) saveMapViewState(mapId, { baseLayer: layerName });
  }

  function initMapBaseLayerSelect(map, mapId, base) {
    const state = ortoCacheState[mapId];
    const select = $(`#${mapId}-base-layer`);
    if (!state || !select) return;
    state.baseLayers = base.layers;
    state.currentBaseLayerName = select.value || "Ortofotomapa Geoportal";
    Array.from(select.options).forEach((option) => { option.disabled = !base.layers[option.value]; });
    if (!base.layers[state.currentBaseLayerName]) state.currentBaseLayerName = "Ortofotomapa Geoportal";
    if (!state.baseLayerSelectBound) {
      state.baseLayerSelectBound = true;
      select.addEventListener("change", () => {
        setMapBaseLayer(map, mapId, select.value);
        captureMapViewState(map, mapId);
      });
    }
  }


  function buildLayerHealthCatalog(mapId) {
    const map = ortoCacheState[mapId]?.map;
    return [
      { key: "geoportalOrto", name: "Ortofotomapa Geoportal", type: "WMS", url: getSampleTileUrlForLayer("geoportalOrto", map) },
      { key: "geoportalOffline", name: "Ortofotomapa offline", type: "offline cache", url: getSampleTileUrlForLayer("geoportalOffline", map), offline: true },
      { key: "openStreetMap", name: "OpenStreetMap", type: "OSM", url: getSampleTileUrlForLayer("openStreetMap", map) },
      { key: "dominikLayer", name: "Dominik Layer", type: "XYZ", url: getSampleTileUrlForLayer("dominikLayer", map) },
      { key: "dominikOffline", name: "Dominik Layer offline", type: "offline cache", url: getSampleTileUrlForLayer("dominikOffline", map), offline: true, layerKey: "dominikLayer" },
      { key: "arcgisTerrainLabels", name: "ArcGIS Terrain with Labels", type: "XYZ", url: getSampleTileUrlForLayer("arcgisTerrainLabels", map) },
      { key: "esriWorldImagery", name: "Esri World Imagery", type: "XYZ", url: getSampleTileUrlForLayer("esriWorldImagery", map) },
      { key: "cartoVoyager", name: "CARTO Voyager", type: "XYZ", url: getSampleTileUrlForLayer("cartoVoyager", map) },
      { key: "openTopoMap", name: "OpenTopoMap", type: "XYZ", url: getSampleTileUrlForLayer("openTopoMap", map) }
    ];
  }

  function getSampleTileCoords(map) {
    const z = Math.max(1, Math.min(17, Math.round(map?.getZoom?.() || 17)));
    const center = map?.getCenter?.() || { lat: 53.796, lng: 14.449 };
    if (typeof L !== "undefined" && L.CRS?.EPSG3857) {
      const point = L.CRS.EPSG3857.latLngToPoint(center, z).divideBy(256).floor();
      const tileCount = 2 ** z;
      return { z, x: ((point.x % tileCount) + tileCount) % tileCount, y: Math.max(0, Math.min(tileCount - 1, point.y)) };
    }
    return { z: 17, x: 70774, y: 42941 };
  }

  function xyzUrl(template, coords) {
    return template.replace("{z}", coords.z).replace("{x}", coords.x).replace("{y}", coords.y).replace("{s}", "a").replace("{r}", "");
  }

  function getSampleTileUrlForLayer(layerKey, map) {
    const c = getSampleTileCoords(map);
    if (layerKey === "geoportalOrto" || layerKey === "geoportalOffline") return createGeoportalWmsTileUrl(c.x, c.y, c.z, { offline: layerKey === "geoportalOffline" });
    if (layerKey === "openStreetMap") return xyzUrl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", c);
    if (layerKey === "dominikLayer") return xyzUrl(DOMINIK_LAYER_XYZ_URL, c);
    if (layerKey === "dominikOffline") return createDominikTileUrl(c.x, c.y, Math.min(c.z, DOMINIK_MAX_NATIVE_ZOOM), { offline: true });
    if (layerKey === "arcgisTerrainLabels") return xyzUrl("https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}", { ...c, z: Math.min(c.z, 13) });
    if (layerKey === "esriWorldImagery") return xyzUrl("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", c);
    if (layerKey === "cartoVoyager") return xyzUrl("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", c);
    if (layerKey === "openTopoMap") return xyzUrl("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", c);
    return "";
  }

  function sanitizeDiagnosticUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.searchParams.has("key")) parsed.searchParams.set("key", "…WKix");
      return parsed.toString();
    } catch {
      return String(url || "").replace(/key=[^&]+/, "key=…WKix");
    }
  }

  function classifyLayerProblem(status, layerName = "") {
    if (status === "OK") return "warstwa działa; brak problemu w aplikacji";
    if (String(layerName).includes("Dominik") && status === "HTTP 403") return "problem prawdopodobnie po stronie MapTiler: klucz może być błędny, ograniczony domeną albo limit został przekroczony";
    if (String(layerName).includes("Dominik") && status === "HTTP 404") return "problem prawdopodobnie w konfiguracji: tileset może nie istnieć albo URL jest błędny";
    if (["timeout", "HTTP 403", "HTTP 404", "brak kafla"].includes(status)) return "problem prawdopodobnie po stronie serwera mapowego albo sieci";
    if (status === "błąd CORS / fetch") return "problem prawdopodobnie po stronie CORS/sieci; Leaflet może nadal pokazywać kafle jako obrazy";
    if (status === "brak w cache") return "problem lokalny: brak zapisanych kafli dla bieżącego widoku";
    return "nie da się jednoznacznie ustalić — sprawdź konfigurację i sieć";
  }

  async function checkTileUrlHealth(layerName, url, options = {}) {
    const started = performance.now();
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 4500;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { method: "GET", cache: "no-store", mode: "cors", signal: controller.signal });
      const elapsedMs = Math.round(performance.now() - started);
      let status = "OK";
      if (response.status === 204) status = "OK";
      else if (response.status === 403) status = "HTTP 403";
      else if (response.status === 404) status = "HTTP 404";
      else if (!response.ok) status = `HTTP ${response.status}`;
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && response.status !== 204 && contentType && !/image|json|octet-stream/i.test(contentType)) status = "brak kafla";
      return { layerName, type: options.type || "XYZ", status, elapsedMs, url: sanitizeDiagnosticUrl(url), diagnosis: classifyLayerProblem(status, layerName) };
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - started);
      const status = error?.name === "AbortError" ? "timeout" : "błąd CORS / fetch";
      return { layerName, type: options.type || "XYZ", status, elapsedMs, url: sanitizeDiagnosticUrl(url), diagnosis: classifyLayerProblem(status, layerName) };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function checkOfflineOrtoHealth(mapId, item) {
    const started = performance.now();
    if (!("caches" in window)) {
      return { layerName: item.name, type: item.type, status: "brak w cache", elapsedMs: 0, url: sanitizeDiagnosticUrl(item.url), diagnosis: "Cache Storage niedostępny w tej przeglądarce" };
    }
    try {
      const cfg = getTileCacheConfig(item.layerKey || "geoportalOrto");
      const cache = await caches.open(cfg.cacheName);
      const keys = await cache.keys();
      const map = ortoCacheState[mapId]?.map;
      const plan = map ? getVisibleTilePlan(map, item.layerKey || "geoportalOrto") : { tiles: [{ url: item.url }] };
      let visibleCached = 0;
      for (const tile of plan.tiles.slice(0, 80)) {
        if (await cache.match(cfg.normalize(tile.url))) visibleCached++;
      }
      const elapsedMs = Math.round(performance.now() - started);
      const status = keys.length && visibleCached ? "OK" : "brak w cache";
      const suffix = status === "OK" ? `OK — cache-first (${visibleCached}/${Math.min(plan.tiles.length, 80)} kafli widoku, cache ~${keys.length})` : `brak kafli dla tego miejsca (cache ~${keys.length})`;
      return { layerName: item.name, type: item.type, status, statusText: suffix, elapsedMs, url: sanitizeDiagnosticUrl(item.url), diagnosis: status === "OK" ? "offline nie czeka na Geoportal; kafle czytane cache-first" : "problem lokalny: brak kafli offline dla tego miejsca" };
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - started);
      return { layerName: item.name, type: item.type, status: "nieznany błąd", elapsedMs, url: sanitizeDiagnosticUrl(item.url), diagnosis: error.message || "błąd odczytu cache" };
    }
  }

  async function checkMapLayersHealth(mapId) {
    const items = buildLayerHealthCatalog(mapId);
    return Promise.all(items.map((item) => item.offline ? checkOfflineOrtoHealth(mapId, item) : checkTileUrlHealth(item.name, item.url, { type: item.type })));
  }

  function renderMapLayerDiagnostics(mapId, results) {
    const el = $(`#${mapId}-layer-diagnostics`);
    if (!el) return;
    const statusClass = (status) => status === "OK" ? "status-ok" : (String(status).startsWith("HTTP") || status === "timeout" || status === "błąd CORS / fetch" ? "status-error" : "status-warn");
    el.hidden = false;
    el.innerHTML = `<div class="map-layer-diagnostics-head"><strong>Wynik sprawdzania warstw</strong><button type="button" class="secondary" data-map-action="collapse-layer-diagnostics" data-map-id="${mapId}">Zwiń tabelę</button></div><table><thead><tr><th>Warstwa</th><th>Typ</th><th>Status</th><th>Czas</th><th>URL testowy</th><th>Wniosek</th></tr></thead><tbody>${results.map((r) => `<tr><td>${escapeHtml(r.layerName)}</td><td>${escapeHtml(r.type)}</td><td class="${statusClass(r.status)}">${escapeHtml(r.statusText || r.status)}</td><td>${escapeHtml(String(r.elapsedMs ?? ""))} ms</td><td><code>${escapeHtml(r.url || "")}</code></td><td>${escapeHtml(r.diagnosis || "")}</td></tr>`).join("")}</tbody></table>`;
  }

  async function runMapLayerDiagnostics(mapId) {
    const el = $(`#${mapId}-layer-diagnostics`);
    if (el) {
      el.hidden = false;
      el.innerHTML = `<p class="muted">Sprawdzam warstwy mapy…</p>`;
    }
    const results = await checkMapLayersHealth(mapId);
    renderMapLayerDiagnostics(mapId, results);
  }

  function createDominikLayer() {
    const DominikLayer = L.TileLayer.extend({
      getTileUrl(coords) {
        return createDominikTileUrl(coords.x, coords.y, coords.z);
      }
    });
    return new DominikLayer("", {
      attribution: "Dominik Layer / MapTiler",
      minZoom: 0,
      maxZoom: DOMINIK_MAX_DISPLAY_ZOOM,
      maxNativeZoom: DOMINIK_MAX_NATIVE_ZOOM,
      tileSize: 256,
      crossOrigin: true,
      errorTileUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(createEmptyTileSvg())}`
    });
  }

  function createGeoportalOrtoLayer() {
    const GeoportalOrtoLayer = L.TileLayer.extend({
      getTileUrl(coords) {
        return createGeoportalWmsTileUrl(coords.x, coords.y, coords.z);
      }
    });
    return new GeoportalOrtoLayer("", {
      tileSize: ORTO_TILE_SIZE,
      maxZoom: MAP_MAX_ZOOM,
      maxNativeZoom: 21,
      attribution: "Ortofotomapa: Geoportal / GUGiK"
    });
  }

  async function showMyLocationOnMap(map, statusSelector) {
    if (!navigator.geolocation || !map) {
      if (statusSelector) $(statusSelector).textContent = "Twoja pozycja: niedostępna";
      throw new Error("gps-unavailable");
    }
    if (statusSelector) $(statusSelector).textContent = "Twoja pozycja: pobieranie…";
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        latestUserLatLng = [coords.latitude, coords.longitude];
        latestUserAccuracy = coords.accuracy;
        if (statusSelector) $(statusSelector).textContent = "Twoja pozycja: aktywna";
        resolve(latestUserLatLng);
      }, () => {
        if (statusSelector) $(statusSelector).textContent = "Twoja pozycja: niedostępna";
        reject(new Error("gps-failed"));
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
    });
  }

  function getMapUserState(targetMap) {
    if (targetMap === workingMap) return mapUserState.working;
    return mapUserState.records;
  }

  function syncUserLocationLayers(target) {
    const targetMap = target === "records" ? recordsMap : target === "working" ? workingMap : target;
    if (!targetMap || !latestUserLatLng) return;
    const state = getMapUserState(targetMap);
    if (!state.userLocationMarker || !targetMap.hasLayer(state.userLocationMarker)) {
      if (state.userLocationMarker) targetMap.removeLayer(state.userLocationMarker);
      state.userLocationMarker = L.circleMarker(latestUserLatLng, {radius:8,color:"#0b57d0",weight:3,fillColor:"#2f8cff",fillOpacity:.85}).addTo(targetMap);
    } else state.userLocationMarker.setLatLng(latestUserLatLng);
    if (Number.isFinite(latestUserAccuracy)) {
      if (!state.userAccuracyCircle || !targetMap.hasLayer(state.userAccuracyCircle)) {
        if (state.userAccuracyCircle) targetMap.removeLayer(state.userAccuracyCircle);
        state.userAccuracyCircle = L.circle(latestUserLatLng,{radius:latestUserAccuracy,color:"#2f8cff",weight:1,fillOpacity:.08}).addTo(targetMap);
      } else state.userAccuracyCircle.setLatLng(latestUserLatLng).setRadius(latestUserAccuracy);
    }
    renderMapHeading(targetMap);
  }

  
  function toRad(v){ return (Number(v)||0)*Math.PI/180; }
  function distanceM(a,b){ const R=6371000; const dLat=toRad(b[0]-a[0]); const dLon=toRad(b[1]-a[1]); const sa=Math.sin(dLat/2)**2+Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(sa)); }
  function bearingDeg(a,b){ const y=Math.sin(toRad(b[1]-a[1]))*Math.cos(toRad(b[0])); const x=Math.cos(toRad(a[0]))*Math.sin(toRad(b[0]))-Math.sin(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.cos(toRad(b[1]-a[1])); return ((Math.atan2(y,x)*180/Math.PI)+360)%360; }
  function bearingLabel(d){ return ["N","NE","E","SE","S","SW","W","NW"][Math.round(d/45)%8]; }
  function nextWorkingLabel(items){ const d=new Date(); const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); const key=`${y}${m}${day}`; const nums=items.map(i=>/^R-(\d{8})-(\d{3})$/.exec(i.label||"")).filter(Boolean).filter(x=>x[1]===key).map(x=>Number(x[2])); const n=(Math.max(0,...nums)+1); return `R-${key}-${String(n).padStart(3,'0')}`; }
  function workingStatusLabel(v){ return ({do_sprawdzenia:'Do sprawdzenia',prawdopodobne:'Prawdopodobne',potwierdzone:'Potwierdzone',odrzucone:'Odrzucone',przepisane:'Przepisane do rekordu'})[v]||'Do sprawdzenia'; }
  function workingStatusOptions(selected){ return ['do_sprawdzenia','prawdopodobne','potwierdzone','odrzucone','przepisane'].map(k=>`<option value="${k}" ${k===selected?'selected':''}>${workingStatusLabel(k)}</option>`).join(''); }
  function workingStatusMarkerText(status){ return ({do_sprawdzenia:'?',prawdopodobne:'P',potwierdzone:'✓',odrzucone:'×',przepisane:'Z'})[status]||'?'; }
  function normalizeWorkingNest(w) {
    const now = new Date().toISOString();
    const normalizedStatus = ['do_sprawdzenia','prawdopodobne','potwierdzone','odrzucone','przepisane'].includes(w?.status) ? w.status : 'do_sprawdzenia';
    return { ...w, id: w?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), lat: Number(w?.lat), lon: Number(w?.lon), status: normalizedStatus, note: String(w?.note ?? w?.notes ?? ""), notes: String(w?.notes ?? w?.note ?? ""), createdAt: w?.createdAt || now, updatedAt: w?.updatedAt || w?.createdAt || now, createdBy: w?.createdBy || w?.created_by || "", createdByName: w?.createdByName || "", updatedBy: w?.updatedBy || w?.updated_by || "", updatedByName: w?.updatedByName || "", deletedAt: w?.deletedAt || w?.deleted_at || null, deletedBy: w?.deletedBy || w?.deleted_by || null, deleteReason: w?.deleteReason || w?.delete_reason || "" };
  }

  function navigateTo(lat, lon) {
    const pos = toLatLon(lat, lon);
    if (!pos) return alert("Brak poprawnych współrzędnych GPS.");
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${pos[0]},${pos[1]}`, "_blank", "noopener");
  }

  const photoMeasureCalibrations = new Map(Object.entries(readObjectSetting(PHOTO_MEASURE_CALIBRATION_KEY)));

  function savePhotoMeasureCalibrations() {
    const data = Object.fromEntries(photoMeasureCalibrations.entries());
    localStorage.setItem(PHOTO_MEASURE_CALIBRATION_KEY, JSON.stringify(data));
  }

  function getPhotoMeasureKey(photoRef, src) {
    const raw = String(photoRef || src || "");
    let hash = 5381;
    for (let index = 0; index < raw.length; index += 1) {
      hash = ((hash << 5) + hash) ^ raw.charCodeAt(index);
    }
    return `photo:${(hash >>> 0).toString(36)}`;
  }

  function formatMeasureCm(value) {
    if (!Number.isFinite(value)) return "—";
    if (value >= 100) return value.toFixed(1);
    if (value >= 10) return value.toFixed(2);
    return value.toFixed(3);
  }

  function showPhotoMeasureModal({ src, photoRef = "", startMeasuring = false }) {
    if (!src) return;
    const calibrationKey = getPhotoMeasureKey(photoRef, src);
    const modal = document.createElement("div");
    modal.className = "photo-measure-modal";
    modal.innerHTML = `
      <div class="photo-measure-dialog" role="dialog" aria-modal="true" aria-label="Pomiar zdjęcia">
        <div class="photo-measure-toolbar">
          <button type="button" data-action="close">Zamknij</button>
          <button type="button" data-action="zoom-out" aria-label="Pomniejsz">−</button>
          <button type="button" data-action="zoom-in" aria-label="Powiększ">+</button>
          <button type="button" data-action="calibrate" data-measure-tool>Kalibracja</button>
          <button type="button" data-action="measure-line" data-measure-tool>Odcinek</button>
          <button type="button" data-action="measure-polygon" data-measure-tool>Poligon</button>
          <button type="button" data-action="undo-point" data-measure-tool>Cofnij punkt</button>
          <button type="button" data-action="confirm" data-measure-tool>Zatwierdź</button>
          <button type="button" data-action="clear" data-measure-tool>Wyczyść kalibrację</button>
        </div>
        <div class="photo-measure-status" data-status>Wczytuję zdjęcie…</div>
        <div class="photo-measure-viewport" data-viewport>
          <div class="photo-measure-stage" data-stage>
            <img alt="Zdjęcie do pomiaru" draggable="false" data-img>
            <svg class="photo-measure-overlay" data-overlay></svg>
          </div>
          <button type="button" class="photo-measure-ruler" data-action="measure" aria-label="Mierz na zdjęciu">📏</button>
        </div>
      </div>`;

    const img = modal.querySelector("[data-img]");
    const viewport = modal.querySelector("[data-viewport]");
    const stage = modal.querySelector("[data-stage]");
    const overlay = modal.querySelector("[data-overlay]");
    const status = modal.querySelector("[data-status]");
    const state = {
      mode: "idle",
      zoom: 1,
      tx: 0,
      ty: 0,
      baseW: 1,
      baseH: 1,
      points: [],
      activePointer: null,
      dragPoint: null,
      panStart: null,
      pointers: new Map(),
      pinchStart: null,
      measuringEnabled: !!startMeasuring,
      loaded: false
    };

    const getCalibration = () => photoMeasureCalibrations.get(calibrationKey);
    if (startMeasuring) state.mode = getCalibration() ? "measure" : "calibrate";
    const setStatus = (message) => { status.textContent = message; };
    const updateMeasureUi = () => {
      modal.classList.toggle("is-measuring", state.measuringEnabled);
      viewport.classList.toggle("is-measuring", state.measuringEnabled);
    };
    const markerRadius = () => Math.max(0.35, 5 / Math.max(state.zoom, 1));
    const measureStrokeWidth = () => Math.max(0.25, 4 / Math.max(state.zoom, 1));
    const labelFontSize = () => Math.max(0.1, 18 / Math.max(state.zoom, 1));
    const nativePhotoZoom = () => {
      const zoomX = img.naturalWidth && state.baseW ? img.naturalWidth / state.baseW : 1;
      const zoomY = img.naturalHeight && state.baseH ? img.naturalHeight / state.baseH : 1;
      const zoom = Math.max(zoomX, zoomY, 1);
      return Number.isFinite(zoom) ? zoom : 1;
    };
    const maxPhotoZoom = () => Math.max(8, nativePhotoZoom());
    const refreshMeasureScales = () => {
      overlay.querySelectorAll(".photo-measure-point").forEach((point) => {
        point.setAttribute("r", String(markerRadius()));
      });
      overlay.querySelectorAll(".photo-measure-line, .photo-measure-calibration-line, .photo-measure-polygon-fill").forEach((shape) => {
        shape.setAttribute("stroke-width", String(measureStrokeWidth()));
      });
      overlay.querySelectorAll(".photo-measure-label").forEach((label) => {
        label.setAttribute("font-size", String(labelFontSize()));
      });
    };
    const applyTransform = () => {
      stage.style.width = `${state.baseW}px`;
      stage.style.height = `${state.baseH}px`;
      stage.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.zoom})`;
      overlay.setAttribute("viewBox", `0 0 ${state.baseW} ${state.baseH}`);
      overlay.setAttribute("width", String(state.baseW));
      overlay.setAttribute("height", String(state.baseH));
      refreshMeasureScales();
    };
    const fitImage = () => {
      if (!img.naturalWidth || !img.naturalHeight) return false;
      const rect = viewport.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      const fit = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight, 1);
      state.baseW = Math.max(1, img.naturalWidth * fit);
      state.baseH = Math.max(1, img.naturalHeight * fit);
      state.tx = (rect.width - state.baseW) / 2;
      state.ty = (rect.height - state.baseH) / 2;
      state.zoom = 1;
      applyTransform();
      return true;
    };
    const basePointFromEvent = (event) => {
      const rect = stage.getBoundingClientRect();
      return {
        x: Math.min(state.baseW, Math.max(0, (event.clientX - rect.left) / state.zoom)),
        y: Math.min(state.baseH, Math.max(0, (event.clientY - rect.top) / state.zoom))
      };
    };
    const naturalPoint = (point) => ({
      x: point.x * (img.naturalWidth / state.baseW),
      y: point.y * (img.naturalHeight / state.baseH)
    });
    const naturalDistancePx = (a, b) => {
      const pa = naturalPoint(a);
      const pb = naturalPoint(b);
      return Math.hypot(pb.x - pa.x, pb.y - pa.y);
    };
    const polygonStats = (points) => {
      const calibration = getCalibration();
      if (!calibration || points.length < 3) return null;
      const naturalPoints = points.map(naturalPoint);
      let perimeterPx = 0;
      let areaPx2 = 0;
      naturalPoints.forEach((point, index) => {
        const next = naturalPoints[(index + 1) % naturalPoints.length];
        perimeterPx += Math.hypot(next.x - point.x, next.y - point.y);
        areaPx2 += point.x * next.y - next.x * point.y;
      });
      return {
        perimeterCm: perimeterPx / calibration.pxPerCm,
        areaCm2: Math.abs(areaPx2) / 2 / (calibration.pxPerCm ** 2)
      };
    };
    const polygonLabel = (stats) => {
      if (!stats) return "";
      const area = stats.areaCm2 >= 10000 ? `${formatMeasureCm(stats.areaCm2 / 10000)} m²` : `${formatMeasureCm(stats.areaCm2)} cm²`;
      return `obw. ${formatMeasureCm(stats.perimeterCm)} cm, pole ${area}`;
    };
    const drawPoints = (points) => points.map((point, index) => `<circle class="photo-measure-point" data-point-index="${index}" cx="${point.x}" cy="${point.y}" r="${markerRadius()}"></circle>`).join("");
    const drawLine = (a, b, label = "", kind = "measure") => {
      const cls = kind === "calibration" ? "photo-measure-calibration-line" : "photo-measure-line";
      overlay.innerHTML = `
        <line class="${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${measureStrokeWidth()}"></line>
        ${drawPoints([a, b])}
        ${label ? `<text class="photo-measure-label" x="${(a.x + b.x) / 2}" y="${Math.max(18, (a.y + b.y) / 2 - 10)}" font-size="${labelFontSize()}">${escapeHtml(label)}</text>` : ""}`;
    };
    const renderActiveShape = () => {
      if (!state.points.length) {
        overlay.innerHTML = "";
        return;
      }
      if (state.mode === "measure-polygon") {
        const pointsAttr = state.points.map((point) => `${point.x},${point.y}`).join(" ");
        const stats = polygonStats(state.points);
        const label = state.points.length >= 3 ? polygonLabel(stats) : "";
        const labelPoint = state.points.reduce((acc, point) => ({ x: acc.x + point.x / state.points.length, y: acc.y + point.y / state.points.length }), { x: 0, y: 0 });
        overlay.innerHTML = `
          ${state.points.length >= 3 ? `<polygon class="photo-measure-polygon-fill" points="${pointsAttr}" stroke-width="${measureStrokeWidth()}"></polygon>` : ""}
          ${state.points.length >= 2 ? `<polyline class="photo-measure-line" points="${pointsAttr}" stroke-width="${measureStrokeWidth()}"></polyline>` : ""}
          ${state.points.length >= 3 ? `<line class="photo-measure-line" x1="${state.points[state.points.length - 1].x}" y1="${state.points[state.points.length - 1].y}" x2="${state.points[0].x}" y2="${state.points[0].y}" stroke-width="${measureStrokeWidth()}"></line>` : ""}
          ${drawPoints(state.points)}
          ${label ? `<text class="photo-measure-label" x="${labelPoint.x}" y="${Math.max(18, labelPoint.y - 10)}" font-size="${labelFontSize()}">${escapeHtml(label)}</text>` : ""}`;
        return;
      }
      if (state.points.length === 1) {
        overlay.innerHTML = drawPoints(state.points);
        return;
      }
      const [a, b] = state.points;
      if (state.mode === "calibrate") return drawLine(a, b, "kalibracja", "calibration");
      const calibration = getCalibration();
      const label = calibration ? `${formatMeasureCm(naturalDistancePx(a, b) / calibration.pxPerCm)} cm` : "";
      drawLine(a, b, label, "measure");
    };
    const setMode = (mode) => {
      state.measuringEnabled = true;
      state.mode = mode;
      state.points = [];
      state.dragPoint = null;
      overlay.innerHTML = "";
      updateMeasureUi();
      refreshStatus();
    };
    const refreshStatus = () => {
      if (!state.loaded) return setStatus("Wczytuję zdjęcie…");
      if (!state.measuringEnabled) return setStatus("Oglądanie zdjęcia: przesuwaj i powiększaj jak zwykle. Naciśnij 📏, aby rozpocząć pomiar.");
      const calibration = getCalibration();
      if (state.mode === "calibrate") {
        if (state.points.length >= 2) return setStatus("Kalibracja: sprawdź i przeciągnij punkty, jeśli trzeba. Potem naciśnij „Zatwierdź” i podaj długość odcinka.");
        return setStatus("Kalibracja: dotknij dwóch końców znanego odcinka miarki na zdjęciu.");
      }
      if (!calibration) return setStatus("Najpierw wykonaj kalibrację: zaznacz znany odcinek miarki, dopasuj punkty i naciśnij „Zatwierdź”.");
      if (state.mode === "measure-polygon") {
        if (state.points.length >= 3) return setStatus(`Poligon: możesz dodawać kolejne punkty albo przeciągać istniejące. ${polygonLabel(polygonStats(state.points))}.`);
        return setStatus("Poligon: dotknij kolejnych wierzchołków obszaru. Minimum 3 punkty, potem możesz je przesuwać.");
      }
      if (state.mode === "measure") {
        if (state.points.length >= 2) return setStatus("Pomiar odcinka: możesz przeciągnąć punkty, a wynik aktualizuje się na zdjęciu.");
        return setStatus("Pomiar odcinka: dotknij dwóch punktów przedmiotu. Potem możesz je przesuwać.");
      }
      if (calibration) return setStatus(`Kalibracja dokonana (${formatMeasureCm(calibration.pxPerCm)} px/cm). Wybierz „Odcinek” albo „Poligon”.`);
      return setStatus("Naciśnij 📏 albo „Kalibracja”, aby przeliczyć piksele na centymetry dla tego zdjęcia.");
    };
    const addPoint = (point) => {
      if (state.mode === "calibrate" || state.mode === "measure") {
        if (state.points.length >= 2) state.points = [];
        state.points.push(point);
      } else if (state.mode === "measure-polygon") {
        state.points.push(point);
      }
      renderActiveShape();
      refreshStatus();
    };
    const confirmActiveShape = () => {
      if (state.mode === "calibrate") {
        if (state.points.length < 2) return setStatus("Zaznacz dwa punkty kalibracji, zanim zatwierdzisz.");
        const [a, b] = state.points;
        const distancePx = naturalDistancePx(a, b);
        const answer = prompt("Jaką długość ma zaznaczony odcinek miarki? Podaj wartość w centymetrach (np. 5 lub 10).", "10");
        const cm = Number(String(answer || "").replace(",", "."));
        if (!Number.isFinite(cm) || cm <= 0) return setStatus("Kalibracja przerwana — podaj dodatnią długość w centymetrach.");
        photoMeasureCalibrations.set(calibrationKey, { pxPerCm: distancePx / cm, calibratedAt: Date.now() });
        savePhotoMeasureCalibrations();
        state.mode = "measure";
        state.points = [];
        overlay.innerHTML = "";
        setStatus("Kalibracja dokonana. Wybierz odcinek albo poligon i dotknij punktów pomiaru.");
        return;
      }
      if (state.mode === "measure-polygon") {
        if (state.points.length < 3) return setStatus("Poligon wymaga minimum 3 punktów.");
        renderActiveShape();
        return setStatus(`Poligon zatwierdzony. ${polygonLabel(polygonStats(state.points))}. Punkty nadal możesz przeciągać do korekty.`);
      }
      if (state.mode === "measure") {
        if (state.points.length < 2) return setStatus("Zaznacz dwa punkty pomiaru odcinka.");
        renderActiveShape();
        const calibration = getCalibration();
        if (calibration) return setStatus(`Pomiar zatwierdzony: ${formatMeasureCm(naturalDistancePx(state.points[0], state.points[1]) / calibration.pxPerCm)} cm. Punkty nadal możesz przeciągać do korekty.`);
      }
    };
    const hitPointIndex = (point) => {
      const tolerance = Math.max(14 / Math.max(state.zoom, 1), markerRadius() * 2.8);
      for (let index = state.points.length - 1; index >= 0; index -= 1) {
        if (Math.hypot(state.points[index].x - point.x, state.points[index].y - point.y) <= tolerance) return index;
      }
      return -1;
    };
    const setZoom = (nextZoom, centerX = viewport.clientWidth / 2, centerY = viewport.clientHeight / 2) => {
      const oldZoom = state.zoom;
      const zoom = Math.min(maxPhotoZoom(), Math.max(1, nextZoom));
      const baseX = (centerX - state.tx) / oldZoom;
      const baseY = (centerY - state.ty) / oldZoom;
      state.tx = centerX - baseX * zoom;
      state.ty = centerY - baseY * zoom;
      state.zoom = zoom;
      applyTransform();
    };
    const distanceBetweenPointers = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const midpointBetweenPointers = (a, b) => {
      const rect = viewport.getBoundingClientRect();
      return { x: ((a.clientX + b.clientX) / 2) - rect.left, y: ((a.clientY + b.clientY) / 2) - rect.top };
    };

    const closeModal = () => {
      window.removeEventListener("resize", fitImage);
      modal.remove();
    };

    modal.addEventListener("click", (event) => {
      const action = event.target.closest("button")?.dataset.action;
      if (!action) return;
      if (action === "close") closeModal();
      if (action === "zoom-in") setZoom(state.zoom * 1.25);
      if (action === "zoom-out") setZoom(state.zoom / 1.25);
      if (action === "calibrate") setMode("calibrate");
      if (action === "measure" || action === "measure-line") setMode(getCalibration() ? "measure" : "calibrate");
      if (action === "measure-polygon") setMode(getCalibration() ? "measure-polygon" : "calibrate");
      if (action === "undo-point") { state.points.pop(); renderActiveShape(); refreshStatus(); }
      if (action === "confirm") confirmActiveShape();
      if (action === "clear") { photoMeasureCalibrations.delete(calibrationKey); savePhotoMeasureCalibrations(); setMode("calibrate"); setStatus("Kalibracja wyczyszczona dla tego zdjęcia. Wykonaj kalibrację ponownie."); }
    });
    viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      setZoom(state.zoom * (event.deltaY < 0 ? 1.12 : 0.88), event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });
    viewport.addEventListener("pointerdown", (event) => {
      if (!state.loaded || event.target.closest("button")) return;
      event.preventDefault();
      viewport.setPointerCapture(event.pointerId);
      state.pointers.set(event.pointerId, event);
      if (state.pointers.size === 2) {
        const [first, second] = Array.from(state.pointers.values());
        state.pinchStart = {
          distance: Math.max(1, distanceBetweenPointers(first, second)),
          zoom: state.zoom,
          tx: state.tx,
          ty: state.ty,
          center: midpointBetweenPointers(first, second)
        };
        state.panStart = null;
        if (state.activePointer) state.activePointer.moved = true;
        return;
      }
      if (["calibrate", "measure", "measure-polygon"].includes(state.mode)) {
        const point = basePointFromEvent(event);
        const pointIndex = hitPointIndex(point);
        if (pointIndex >= 0) {
          state.dragPoint = { id: event.pointerId, index: pointIndex, moved: false };
          return;
        }
        state.activePointer = { id: event.pointerId, x: event.clientX, y: event.clientY, tx: state.tx, ty: state.ty, moved: false };
      } else {
        state.panStart = { id: event.pointerId, x: event.clientX, y: event.clientY, tx: state.tx, ty: state.ty };
      }
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!state.pointers.has(event.pointerId)) return;
      event.preventDefault();
      state.pointers.set(event.pointerId, event);
      if (state.pointers.size >= 2 && state.pinchStart) {
        const [first, second] = Array.from(state.pointers.values());
        const center = midpointBetweenPointers(first, second);
        const baseX = (state.pinchStart.center.x - state.pinchStart.tx) / state.pinchStart.zoom;
        const baseY = (state.pinchStart.center.y - state.pinchStart.ty) / state.pinchStart.zoom;
        const zoom = Math.min(maxPhotoZoom(), Math.max(1, state.pinchStart.zoom * (distanceBetweenPointers(first, second) / state.pinchStart.distance)));
        state.tx = center.x - baseX * zoom;
        state.ty = center.y - baseY * zoom;
        state.zoom = zoom;
        applyTransform();
        return;
      }
      if (state.panStart?.id === event.pointerId) {
        state.tx = state.panStart.tx + event.clientX - state.panStart.x;
        state.ty = state.panStart.ty + event.clientY - state.panStart.y;
        applyTransform();
      }
      if (state.dragPoint?.id === event.pointerId) {
        state.points[state.dragPoint.index] = basePointFromEvent(event);
        state.dragPoint.moved = true;
        renderActiveShape();
        refreshStatus();
        return;
      }
      if (state.activePointer?.id === event.pointerId) {
        const dx = event.clientX - state.activePointer.x;
        const dy = event.clientY - state.activePointer.y;
        const moved = Math.hypot(dx, dy) > 8;
        state.activePointer.moved = state.activePointer.moved || moved;
        if (state.activePointer.moved) {
          state.tx = state.activePointer.tx + dx;
          state.ty = state.activePointer.ty + dy;
          applyTransform();
        }
      }
    });
    const finishPointer = (event) => {
      state.pointers.delete(event.pointerId);
      if (state.pointers.size < 2) state.pinchStart = null;
      if (state.panStart?.id === event.pointerId) state.panStart = null;
      if (state.dragPoint?.id === event.pointerId) {
        state.dragPoint = null;
        renderActiveShape();
        refreshStatus();
      }
      if (state.activePointer?.id === event.pointerId) {
        const pointer = state.activePointer;
        state.activePointer = null;
        if (!pointer.moved) addPoint(basePointFromEvent(event));
      }
    };
    viewport.addEventListener("pointerup", finishPointer);
    viewport.addEventListener("pointercancel", finishPointer);
    updateMeasureUi();
    img.addEventListener("load", () => {
      state.loaded = true;
      const fitted = fitImage();
      if (!fitted) requestAnimationFrame(() => fitImage());
      refreshStatus();
    });
    img.addEventListener("error", () => setStatus("Nie udało się wczytać zdjęcia."));
    window.addEventListener("resize", fitImage);
    document.body.appendChild(modal);
    img.src = src;
    if (img.complete && img.naturalWidth) {
      state.loaded = true;
      requestAnimationFrame(() => { fitImage(); refreshStatus(); });
    }
  }

  function showReadonlyRecord(uid) {
    const record = getEntries().find((entry) => String(entry.uid) === String(uid));
    if (!record) return;
    revokePhotoUrls("server", [
      ...(record.nestMicro?.photos || []),
      ...(record.randomMicro?.photos || [])
    ]);
    readonlyUid = record.uid;
    const nestPos = toLatLon(record.lat, record.lon);
    const randomPos = toLatLon(record.randomMicro?.lat, record.randomMicro?.lon);
    $("#readonly-nav-random").hidden = !randomPos;
    $("#readonly-nav-random").disabled = !randomPos;
    $("#readonly-nav-nest").disabled = !nestPos;
    $("#readonly-edit").hidden = !canEditItem(record);
    $("#record-readonly-content").innerHTML = buildReadonlySections(record);
    initReadonlyCarousel();
    showView("readonly");
  }

  function renderEggMeasurementsReadonly(record) {
    const measurements = normalizeEggMeasurements(record?.eggMeasurements || []);
    const hasAnyMeasurement = measurements.some((item) => item.widthCm != null || item.lengthCm != null || item.weightG != null || String(item.note || "").trim());
    if (!hasAnyMeasurement) return `<p class="muted">Pomiary jaj: brak</p>`;
    const count = Number(record?.eggCount);
    const maxNo = Math.max(
      Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
      measurements.reduce((max, item) => Math.max(max, Number(item.eggNo) || 0), 0)
    );
    const byNo = new Map(measurements.map((item) => [Number(item.eggNo), item]));
    return Array.from({ length: maxNo }, (_, index) => {
      const eggNo = index + 1;
      const item = byNo.get(eggNo);
      if (!item || (item.widthCm == null && item.lengthCm == null && item.weightG == null && !String(item.note || "").trim())) {
        return `<div class="readonly-field"><div class="label">Jajo ${eggNo}</div><div class="value">brak pomiaru</div></div>`;
      }
      const parts = [];
      parts.push(item.widthCm == null ? "szer. brak" : `szer. ${formatCm(item.widthCm)} cm`);
      parts.push(item.lengthCm == null ? "dł. brak" : `dł. ${formatCm(item.lengthCm)} cm`);
      parts.push(item.weightG == null ? "waga brak" : `waga ${formatGrams(item.weightG)} g`);
      if (String(item.note || "").trim()) parts.push(`uwaga: ${item.note}`);
      return `<div class="readonly-field"><div class="label">Jajo ${eggNo}</div><div class="value">${escapeHtml(parts.join(", "))}</div></div>`;
    }).join("");
  }

  function buildReadonlySections(record) {
    const val = (v) => (v == null || String(v).trim() === "" ? "—" : String(v));
    const fld = (label, v) => `<div class="readonly-field"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(val(v))}</div></div>`;
    const photoGrid = (photos, alt) => `<div class="readonly-photo-grid">${(photos || []).map((p)=>{
      const ref = escapeHtml(p.dataUrl || p);
      const safeAlt = escapeHtml(alt);
      return `<div class="readonly-photo-tile"><img src="" data-photo-ref="${ref}" class="readonly-thumb" alt="${safeAlt}"><button type="button" class="readonly-photo-measure" data-photo-measure aria-label="Pomiar zdjęcia">📏 Pomiar</button></div>`;
    }).join("") || "<p>—</p>"}</div>`;
    const basicNotice = isBasicRecord(record) ? `<div class="basic-record-notice"><strong>Zapis podstawowy — bez pełnej kontroli.</strong><br>Ten rekord zapisano jako podstawowy, bez pełnego opisu siedliska.</div>` : "";
    const sections = [
      ["Identyfikacja", `${basicNotice}${renderRecordCompletenessBadge(record)}${fld("Kompletność", isBasicRecord(record) ? "basic — rekord niepełny" : "full")}${fld("ID gniazda", record.nestId)}${fld("Gatunek", LABELS.species[record.species] || record.species)}${fld("Data", record.obsDate)}${fld("Godzina", record.obsTime)}${fld("Obserwator", record.observer)}${fld("Sektor", record.sector)}${fld("Liczba jaj", record.eggCount)}`],
      ["Pomiary jaj", renderEggMeasurementsReadonly(record)],
      ["GPS i zdjęcia gniazda", `${fld("Lat", record.lat)}${fld("Lon", record.lon)}${fld("Dokładność [m]", record.gpsAccuracyM)}${photoGrid(record.nestMicro?.photos, "Zdjęcie gniazda")}`],
      ["Mikrohabitat gniazda", `${fld("Podłoże", LABELS.substrate[record.nestMicro?.substrate] || record.nestMicro?.substrate)}${fld("Piasek [%]", record.nestMicro?.coverage?.pctSand)}${fld("Drobny żwir [%]", record.nestMicro?.coverage?.pctFineGravel)}${fld("Gruby żwir/kamienie [%]", record.nestMicro?.coverage?.pctCoarse)}${fld("Muszle [%]", record.nestMicro?.coverage?.pctShells)}${fld("Roślinność żywa [%]", record.nestMicro?.coverage?.pctLiveVeg)}${fld("Roślinność sucha [%]", record.nestMicro?.coverage?.pctDryVeg)}${fld("Drewno/szczątki [%]", record.nestMicro?.coverage?.pctOrganic)}${fld("Antropogeniczne [%]", record.nestMicro?.coverage?.pctAnthro)}${fld("Suma pokrycia [%]", coverageSum(record.nestMicro?.coverage||{}))}${fld("Odległość do rośliny [cm]", record.nestMicro?.distPlantCm)}${fld("Wysokość rośliny [cm]", record.nestMicro?.heightPlantCm)}${fld("Odległość do obiektu [cm]", record.nestMicro?.distObjectCm)}${fld("Wysokość obiektu [cm]", record.nestMicro?.heightObjectCm)}${fld("Nachylenie", LABELS.slope[record.nestMicro?.slope] || record.nestMicro?.slope)}${fld("Mikrorzeźba", LABELS.microrelief[record.nestMicro?.microrelief] || record.nestMicro?.microrelief)}`],
      ["Mezohabitat", `${fld("Piasek [%]", record.meso?.pctSand)}${fld("Żwir [%]", record.meso?.pctFineGravel || 0)}${fld("Kamienie [%]", record.meso?.pctGravel)}${fld("Roślinność [%]", record.meso?.pctVegetation)}${fld("Woda / podmokłość [%]", record.meso?.pctWater)}${fld("Muszle [%]", record.meso?.pctOther)}${fld("Suma pokrycia [%]", (record.meso?.pctSand||0)+(record.meso?.pctFineGravel||0)+(record.meso?.pctGravel||0)+(record.meso?.pctVegetation||0)+(record.meso?.pctWater||0)+(record.meso?.pctOther||0))}${fld("Sposób oceny buforu", LABELS.assessmentMethod?.[record.meso?.assessmentMethod] || record.meso?.assessmentMethod)}${fld("Odległość do wody [m]", record.meso?.distWaterM)}${fld("Odległość do krawędzi roślinności [m]", record.meso?.distVegEdgeM)}${fld("Odległość do wysokiego obiektu [m]", record.meso?.distVerticalStructureM)}${fld("Duże obiekty w 15 m", LABELS.yesNoUnknown?.[record.meso?.bigObjects] || record.meso?.bigObjects)}${fld("Odległość do płatu drobnego żwiru [m]", record.meso?.distFineGravelPatchM)}${fld("Odległość do płatu kamieni [m]", record.meso?.distCoarseGravelPatchM)}${fld("Odległość do najbliższego gniazda obrożnej [m]", record.meso?.distNearestHiaticulaM)}${fld("Odległość do najbliższego gniazda rzecznej [m]", record.meso?.distNearestDubiusM)}${fld("Uwagi przestrzenne", record.meso?.spatialNotes)}`],
      ["Punkt losowy / kontrola", `${fld("Azymut [°]", record.randomMicro?.azimuthDeg)}${fld("Ponowne losowanie", LABELS.yesNoUnknown[record.randomMicro?.wasRerolled] || record.randomMicro?.wasRerolled)}${fld("Powód ponownego losowania", record.randomMicro?.rerollReason)}${fld("GPS kontroli lat", record.randomMicro?.lat)}${fld("GPS kontroli lon", record.randomMicro?.lon)}${fld("Dokładność GPS kontroli [m]", record.randomMicro?.gpsAccuracyM)}`],
      ["Mikrohabitat kontroli", `${fld("Podłoże", LABELS.substrate[record.randomMicro?.substrate] || record.randomMicro?.substrate)}${fld("Piasek [%]", record.randomMicro?.coverage?.pctSand)}${fld("Drobny żwir [%]", record.randomMicro?.coverage?.pctFineGravel)}${fld("Gruby żwir/kamienie [%]", record.randomMicro?.coverage?.pctCoarse)}${fld("Muszle [%]", record.randomMicro?.coverage?.pctShells)}${fld("Roślinność żywa [%]", record.randomMicro?.coverage?.pctLiveVeg)}${fld("Roślinność sucha [%]", record.randomMicro?.coverage?.pctDryVeg)}${fld("Drewno/szczątki [%]", record.randomMicro?.coverage?.pctOrganic)}${fld("Antropogeniczne [%]", record.randomMicro?.coverage?.pctAnthro)}${fld("Suma pokrycia [%]", coverageSum(record.randomMicro?.coverage||{}))}${fld("Odległość do rośliny [cm]", record.randomMicro?.distPlantCm)}${fld("Wysokość rośliny [cm]", record.randomMicro?.heightPlantCm)}${fld("Odległość do obiektu [cm]", record.randomMicro?.distObjectCm)}${fld("Wysokość obiektu [cm]", record.randomMicro?.heightObjectCm)}${fld("Nachylenie", LABELS.slope[record.randomMicro?.slope] || record.randomMicro?.slope)}${fld("Mikrorzeźba", LABELS.microrelief[record.randomMicro?.microrelief] || record.randomMicro?.microrelief)}${photoGrid(record.randomMicro?.photos, "Zdjęcie kontroli")}`],
      ["Kontrola jakości", `${fld("Zdjęcie dokumentacyjne", LABELS.yesNoUnknown[record.docPhotoDone] || record.docPhotoDone)}${fld("Zdjęcie 1m²", LABELS.yesNoUnknown[record.nestOneMPhotoDone] || record.nestOneMPhotoDone)}${fld("Punkt losowy", LABELS.yesNoUnknown[record.randomPointDone] || record.randomPointDone)}`],
      ["Notatki / podsumowanie", `${fld("Notatki", record.notes)}${fld("Notatki identyfikacja", record.moduleNotes?.identification)}${fld("Notatki mikro gniazda", record.moduleNotes?.nestMicro)}${fld("Notatki mikro kontroli", record.moduleNotes?.randomMicro)}${fld("Notatki mezohabitat", record.moduleNotes?.meso)}`]
    ];
    return `<div class="readonly-carousel">${sections.map(([title, html], i) => `<section class="readonly-section${i===0?" active":""}"><h3>${title}</h3>${html}</section>`).join("")}</div><div class="readonly-nav"><button type="button" id="readonly-prev-section">Poprzednia karta</button><button type="button" id="readonly-next-section">Następna karta</button></div>`;
  }
  function initReadonlyCarousel() {
    let i = 0;
    const secs = $$("#record-readonly-content .readonly-section");
    const set = (n) => { i=(n+secs.length)%secs.length; secs.forEach((s,idx)=>s.classList.toggle("active",idx===i)); };
    $("#readonly-prev-section")?.addEventListener("click",()=>set(i-1));
    $("#readonly-next-section")?.addEventListener("click",()=>set(i+1));
    let sx=0;
    const wrap=$("#record-readonly-content .readonly-carousel");
    wrap?.addEventListener("touchstart",(e)=>{sx=e.changedTouches[0].screenX;},{passive:true});
    wrap?.addEventListener("touchend",(e)=>{const dx=e.changedTouches[0].screenX-sx; if (Math.abs(dx)>40) set(i+(dx<0?1:-1));},{passive:true});
    $$("#record-readonly-content img[data-photo-ref]").forEach((img)=>{
      resolvePhotoSrc(img.dataset.photoRef).then((src)=>{ if(src) img.src=src; });
    });
    const content = $("#record-readonly-content");
    if (content) {
      content.onclick = async (e) => {
        const measureButton = e.target.closest("button[data-photo-measure]");
        if (measureButton) {
          e.preventDefault();
          e.stopPropagation();
          const photoRef = measureButton.closest(".readonly-photo-tile")?.querySelector("img[data-photo-ref]")?.dataset.photoRef;
          const src = await resolvePhotoSrc(photoRef);
          if (!src) return alert("Nie udało się wczytać zdjęcia do pomiaru.");
          showPhotoMeasureModal({ src, photoRef, startMeasuring: true });
          return;
        }
        const img=e.target.closest("img[data-photo-ref]");
        if(img?.src) window.open(img.src,"_blank","noopener");
      };
    }
  }


  function isMapPointEditModeEnabled(mapId) {
    return !!mapPointEditMode[mapId];
  }

  function updateMapPointEditControl(mapId) {
    const button = mapPointEditControls[mapId]?.button;
    if (!button) return;
    const enabled = isMapPointEditModeEnabled(mapId);
    button.classList.toggle("active", enabled);
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    button.title = enabled ? "Wyłącz edycję punktów" : "Włącz edycję punktów";
    button.innerHTML = enabled ? "🔓 Edycja punktów" : "🔒 Edycja punktów";
  }

  function setMapPointEditMode(mapId, enabled) {
    const nextEnabled = !!enabled;
    if (nextEnabled && !isMapPointEditModeEnabled(mapId)) {
      const confirmed = confirm("Wchodzisz w tryb edycji punktów na mapie. Możesz przesuwać zapisane pozycje — bądź pewny, co robisz. Czy włączyć tryb edycji punktów?");
      if (!confirmed) return;
    }
    mapPointEditMode[mapId] = nextEnabled;
    updateMapPointEditControl(mapId);
    if (mapId === "records" && recordsMap) renderRecordsMap(mapFocusUid);
    if (mapId === "working" && workingMap) renderWorkingMap();
  }

  function initMapPointEditControl(map, mapId) {
    if (!map || mapPointEditControls[mapId]) return;
    const control = L.control({ position: "bottomright" });
    control.onAdd = () => {
      const wrap = L.DomUtil.create("div", "leaflet-control map-point-edit-control");
      const button = L.DomUtil.create("button", "map-point-edit-button", wrap);
      button.type = "button";
      button.setAttribute("aria-pressed", "false");
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);
      L.DomEvent.on(button, "click", (event) => {
        L.DomEvent.stop(event);
        setMapPointEditMode(mapId, !isMapPointEditModeEnabled(mapId));
      });
      mapPointEditControls[mapId] = { control, button };
      updateMapPointEditControl(mapId);
      return wrap;
    };
    control.addTo(map);
  }

  function roundMapCoordinate(value) {
    return Math.round(Number(value) * 1e6) / 1e6;
  }

  function updateRecordMapPoint(uid, pointType, latLng) {
    const entries = getEntries();
    const idx = entries.findIndex((entry) => String(entry.uid) === String(uid));
    if (idx < 0) return null;
    const target = entries[idx];
    if (!canMoveMapPoint(target)) {
      alert("Brak uprawnień do przesunięcia tego punktu. Możesz przesuwać tylko swoje punkty, a administrator może przesuwać wszystkie.");
      return null;
    }
    const user = getCurrentUser();
    const patch = {
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id || target.updatedBy || "",
      updatedByName: user?.name || target.updatedByName || "",
      syncStatus: "pending"
    };
    const lat = roundMapCoordinate(latLng.lat);
    const lon = roundMapCoordinate(latLng.lng);
    const updated = pointType === "kontrola"
      ? normalizeEntry({ ...target, ...patch, randomMicro: { ...(target.randomMicro || {}), lat, lon } })
      : normalizeEntry({ ...target, ...patch, lat, lon });
    entries[idx] = updated;
    if (!setEntries(entries)) return null;
    renderEntries();
    if (navigator.onLine) syncNow().catch(() => markSyncStatus(uid, "error"));
    return updated;
  }

  function bindRecordPointDrag(marker, point) {
    if (!canMoveMapPoint(point.entry) || !isMapPointEditModeEnabled("records")) return;
    marker.dragging?.enable();
    marker.on("dragend", () => {
      const next = marker.getLatLng();
      const label = point.type === "kontrola" ? "punkt kontrolny / losowy" : "punkt gniazda";
      const confirmed = confirm(`Przesunąć ${label} rekordu ${point.entry.nestId || "(bez ID)"} na nowe współrzędne ${roundMapCoordinate(next.lat)}, ${roundMapCoordinate(next.lng)}?`);
      if (!confirmed) {
        marker.setLatLng(point.pos);
        return;
      }
      const updated = updateRecordMapPoint(point.entry.uid, point.type, next);
      if (!updated) {
        marker.setLatLng(point.pos);
        return;
      }
      mapFocusUid = updated.uid;
      renderRecordsMap(updated.uid);
    });
  }

  function renderRecordsMap(focusUid = null) {
    const mapEl = $("#records-map");
    if (!mapEl || typeof L === "undefined") { $("#map-info").textContent = "Mapa niedostępna offline (brak biblioteki Leaflet)."; return; }
    if (!recordsMap) {
      const base = createBaseLayers();
      recordsMap = L.map(mapEl, { layers: [base.defaultLayer], maxZoom: MAP_MAX_ZOOM });
      recordsMap.attributionControl.setPrefix("");
      initMapBaseLayerSelect(recordsMap, "records", base);
      ortoCacheState.records.map = recordsMap;
      ortoCacheState.records.onlineLayer = base.onlineLayer;
      ortoCacheState.records.offlineLayer = base.offlineLayer;
      ortoCacheState.records.dominikOnlineLayer = base.layers["Dominik Layer"];
      ortoCacheState.records.dominikOfflineLayer = base.layers["Dominik Layer offline"];
      restoreMapViewState(recordsMap, "records");
      initMapViewStatePersistence(recordsMap, "records");
      mapMarkersLayer = L.layerGroup().addTo(recordsMap);
      initViewedOrtoCacheTools(recordsMap, "records");
      initMeasureTools(recordsMap, "records");
      initBrysnaSmieckLayer(recordsMap, "records");
      switchToOfflineOrtoIfNeeded(recordsMap, "records");
      initMapPointEditControl(recordsMap, "records");
    }
    if ($("#records-grid-toggle")?.checked) {
      if (!recordsGridLayer) void addGridToMap(recordsMap, "records");
      else if (!recordsMap.hasLayer(recordsGridLayer)) recordsGridLayer.addTo(recordsMap);
    } else if (recordsGridLayer && recordsMap.hasLayer(recordsGridLayer)) {
      recordsMap.removeLayer(recordsGridLayer);
    }
    mapMarkersLayer.clearLayers();
    const entries = activeEntries();
    const points = [];
    let missingNest = 0, missingCtrl = 0;
    entries.forEach((entry) => {
      const nestPos = toLatLon(entry.lat, entry.lon);
      const ctrlPos = toLatLon(entry.randomMicro?.lat, entry.randomMicro?.lon);
      if (nestPos) points.push({entry, pos:nestPos, type:"gniazdo"}); else missingNest++;
      if (ctrlPos) points.push({entry, pos:ctrlPos, type:"kontrola"}); else missingCtrl++;
    });
    points.forEach((p)=>{
      const icon = L.divIcon({className:`map-marker ${p.type}`, html:`<div class="pin"><span>${p.type==='gniazdo'?'G':'K'}</span></div>`});
      const canMove = canMoveMapPoint(p.entry);
      const movable = canMove && isMapPointEditModeEnabled("records");
      const m = L.marker(p.pos, { icon, draggable: movable, autoPan: movable }).addTo(mapMarkersLayer);
      bindRecordPointDrag(m, p);
      if (p.type === "gniazdo" && recordSpeciesLabelsVisible) m.bindTooltip(escapeHtml(LABELS.species[p.entry.species] || p.entry.species || "-"), { permanent: true, direction: "right", offset: [12, 0], className: "record-species-label" });
      const e=p.entry;
      m.bindPopup(`<strong>${escapeHtml(e.nestId||'(bez ID)')}</strong><br>${escapeHtml(LABELS.species[e.species]||e.species||'-')}<br>${escapeHtml(e.obsDate||'-')} • ${escapeHtml(e.observer||'-')}<br>Sektor: ${escapeHtml(e.sector||'-')}<br>Typ punktu: ${p.type}<br>Współrzędne: ${p.pos[0]}, ${p.pos[1]}${canMove ? `<br><span class='muted'>${isMapPointEditModeEnabled("records") ? "Tryb edycji włączony — możesz przeciągnąć punkt, zapis wymaga potwierdzenia." : "Punkty są zablokowane. Włącz edycję punktów przyciskiem na mapie, aby przeciągać."}</span>` : ""}<br><button data-map-action='view' data-uid='${e.uid}'>Zobacz rekord</button> ${canEditItem(e) ? `<button data-map-action='edit' data-uid='${e.uid}'>Edytuj</button>` : ""} ${canSoftDeleteItem(e) ? `<button class='danger' data-map-action='delete' data-uid='${e.uid}'>Ukryj</button>` : ""} <button data-map-action='nav' data-lat='${p.pos[0]}' data-lon='${p.pos[1]}'>Nawiguj</button>`);
      if (focusUid && String(e.uid)===String(focusUid)) m.openPopup();
    });
    if (focusUid) {
      const focusRecord = entries.find((e) => String(e.uid) === String(focusUid));
      const focusNest = toLatLon(focusRecord?.lat, focusRecord?.lon);
      const focusCtrl = toLatLon(focusRecord?.randomMicro?.lat, focusRecord?.randomMicro?.lon);
      const focusPos = focusNest || focusCtrl;
      if (focusPos) recordsMap.setView(focusPos, 19);
      else setMapInfo("records", "Wybrany rekord nie ma poprawnych współrzędnych GPS.");
    }
    if (!points.length && !ortoCacheState.records.viewRestored && !focusUid) {setMapInfo("records", "Brak zapisanych punktów z GPS do pokazania na mapie."); recordsMap.setView([52,19],7);}
    setMapInfo("records", `Punkty: ${points.length}. Brak GPS gniazda: ${missingNest}. Brak GPS kontroli: ${missingCtrl}.`);
    if (points.length && !ortoCacheState.records.viewRestored && !focusUid) recordsMap.fitBounds(L.latLngBounds(points.map((p)=>p.pos)), {padding:[30,30]});
    recordsMap.invalidateSize();
    renderBrysnaSmieckPoints("records");
    syncUserLocationLayers("records"); bringMeasureToFront("records");
  }

  function ensureUserLocationTracking(points, focusUid) {
    if (!navigator.geolocation) {
      $("#map-user-status").textContent = "Twoja pozycja: niedostępna";
      $("#working-user-status").textContent = "Twoja pozycja: niedostępna";
      return;
    }
    if (userLocationWatchId == null) {
      userLocationWatchId = navigator.geolocation.watchPosition(({coords}) => {
        latestUserLatLng = [coords.latitude, coords.longitude];
        latestUserAccuracy = coords.accuracy;
        updateMapHeadingButtons();
        syncUserLocationLayers("records");
        syncUserLocationLayers("working");
        followTrackedUserLocation();
      }, () => {
        mapUserState.records.isTrackingUser = false;
        mapUserState.working.isTrackingUser = false;
        $("#map-user-status").textContent = "Twoja pozycja: niedostępna";
        $("#working-user-status").textContent = "Twoja pozycja: niedostępna";
        updateMapHeadingButtons();
        if (!points.length) setMapInfo("records", "Brak zapisanych punktów z GPS do pokazania na mapie.");
      }, {enableHighAccuracy:true, maximumAge:10000, timeout:12000});
    } else {
      updateMapHeadingButtons();
      syncUserLocationLayers("records");
      syncUserLocationLayers("working");
    }
  }

  function getMapById(mapId) {
    return mapId === "working" ? workingMap : recordsMap;
  }

  function followTrackedUserLocation() {
    if (!latestUserLatLng) return;
    (["records", "working"]).forEach((mapId) => {
      const state = mapUserState[mapId];
      const map = getMapById(mapId);
      if (!state?.isTrackingUser || !map) return;
      map.panTo(latestUserLatLng, { animate: true });
      state.hasAutoCenteredOnUser = true;
    });
  }

  function setUserLocationTracking(mapId, enabled) {
    const state = mapUserState[mapId];
    const map = getMapById(mapId);
    if (!state || !map) return;
    state.isTrackingUser = !!enabled;
    updateMapHeadingButtons();
    if (state.isTrackingUser && latestUserLatLng) followTrackedUserLocation();
  }

  async function toggleUserLocationTracking(mapId, map, statusSelector) {
    const state = mapUserState[mapId];
    if (!state) return;
    if (state.isTrackingUser) {
      setUserLocationTracking(mapId, false);
      return;
    }
    try {
      await showMyLocationOnMap(map, statusSelector);
      ensureUserLocationTracking([], null);
      syncUserLocationLayers(mapId);
      setUserLocationTracking(mapId, true);
    } catch {
      alert("Nie udało się włączyć śledzenia GPS. Sprawdź uprawnienia lokalizacji.");
    }
  }

  function updateMapHeadingButtons() {
    const statusText = latestUserLatLng
      ? `Twoja pozycja: aktywna${mapHeadingEnabled ? " (kierunek włączony)" : ""}`
      : "Twoja pozycja: oczekiwanie…";
    ["#map-user-status", "#working-user-status"].forEach((selector) => {
      const el = $(selector);
      if (el) el.textContent = statusText;
    });
    ["#map-enable-heading", "#working-enable-heading"].forEach((selector) => {
      const btn = $(selector);
      if (!btn) return;
      btn.classList.toggle("active", mapHeadingEnabled);
      btn.setAttribute("aria-pressed", mapHeadingEnabled ? "true" : "false");
      btn.textContent = mapHeadingEnabled ? "Kierunek: włączony" : "Kierunek: wyłączony";
      btn.title = mapHeadingEnabled ? "Wyłącz kierunek mapy" : "Włącz kierunek mapy";
    });
    [
      ["#map-track-user", mapUserState.records],
      ["#working-track-user", mapUserState.working]
    ].forEach(([selector, state]) => {
      const btn = $(selector);
      if (!btn) return;
      const active = !!state?.isTrackingUser;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.textContent = active ? "Śledzenie GPS: włączone" : "Śledzenie GPS: wyłączone";
      btn.title = active ? "Wyłącz automatyczne podążanie mapy za GPS" : "Włącz automatyczne podążanie mapy za GPS";
    });
  }

  function handleMapOrientation(event) {
    let heading = null;
    if (typeof event.webkitCompassHeading === "number") heading = event.webkitCompassHeading;
    else if (event.absolute === true && typeof event.alpha === "number") heading = event.alpha;
    else if (typeof event.alpha === "number") heading = 360 - event.alpha;
    if (!Number.isFinite(heading)) return;
    const normalized = ((heading % 360) + 360) % 360;
    if (latestMapHeadingDeg != null && Math.abs(normalized - latestMapHeadingDeg) < 3) return;
    latestMapHeadingDeg = latestMapHeadingDeg == null ? normalized : (latestMapHeadingDeg * 0.7 + normalized * 0.3);
    requestAnimationFrame(() => { renderMapHeading(recordsMap); renderMapHeading(workingMap); });
    updateMapHeadingButtons();
  }

  function disableMapHeading() {
    mapHeadingEnabled = false;
    latestMapHeadingDeg = null;
    if (mapHeadingOrientationHandler) {
      window.removeEventListener("deviceorientationabsolute", mapHeadingOrientationHandler, true);
      window.removeEventListener("deviceorientation", mapHeadingOrientationHandler, true);
      mapHeadingOrientationHandler = null;
    }
    renderMapHeading(recordsMap);
    renderMapHeading(workingMap);
    updateMapHeadingButtons();
  }

  async function toggleMapHeading() {
    if (mapHeadingEnabled) {
      disableMapHeading();
      return;
    }
    if (!("DeviceOrientationEvent" in window)) {
      alert("Kierunek nie jest dostępny w tej przeglądarce.");
      return;
    }
    const req = window.DeviceOrientationEvent?.requestPermission;
    if (typeof req === "function") {
      try {
        const permission = await req.call(window.DeviceOrientationEvent);
        if (permission !== "granted") {
          alert("Kierunek nie jest dostępny w tej przeglądarce.");
          return;
        }
      } catch {
        alert("Kierunek nie jest dostępny w tej przeglądarce.");
        return;
      }
    }
    mapHeadingOrientationHandler = handleMapOrientation;
    window.addEventListener("deviceorientationabsolute", mapHeadingOrientationHandler, true);
    window.addEventListener("deviceorientation", mapHeadingOrientationHandler, true);
    mapHeadingEnabled = true;
    updateMapHeadingButtons();
    alert("Porusz telefonem ósemką, aby skalibrować kompas.");
  }

  function renderMapHeading(targetMap = recordsMap) {
    if (!targetMap) return;
    const state = getMapUserState(targetMap);
    if (!mapHeadingEnabled) {
      if (state.userHeadingMarker && targetMap.hasLayer(state.userHeadingMarker)) targetMap.removeLayer(state.userHeadingMarker);
      state.userHeadingMarker = null;
      return;
    }
    if (!latestUserLatLng || !Number.isFinite(latestMapHeadingDeg)) return;
    if (!state.userHeadingMarker) state.userHeadingMarker = L.marker(latestUserLatLng,{icon:L.divIcon({className:"map-heading", html:"<div>▲</div>"}),zIndexOffset:900}).addTo(targetMap);
    else state.userHeadingMarker.setLatLng(latestUserLatLng);
    const arrow = state.userHeadingMarker.getElement()?.querySelector("div");
    if (arrow) arrow.style.transform = `rotate(${latestMapHeadingDeg}deg)`;
  }

  function setupGps() {
    const getGps = (latSelector, lonSelector, accSelector, statusSelector, label) => {
      const status = $(statusSelector);
      if (!navigator.geolocation) {
        if (status) status.textContent = `${label}: GPS niedostępny`;
        return;
      }
      if (status) status.textContent = `${label}: pobieranie...`;
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setValue(latSelector, coords.latitude.toFixed(6));
          setValue(lonSelector, coords.longitude.toFixed(6));
          setValue(accSelector, Math.round(coords.accuracy));
          if (latSelector === "#lat" && lonSelector === "#lon") void autoFillSectorFromGrid();
          if (status) status.textContent = `${label}: dokładność ±${Math.round(coords.accuracy)} m (${gpsQuality(coords.accuracy)})`;
        },
        () => {
          if (status) status.textContent = `${label}: błąd pobierania`;
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    };
    $("#gps-btn").addEventListener("click", () => getGps("#lat", "#lon", "#gps-accuracy", "#gps-status", "GPS gniazda"));
    $("#random-gps-btn").addEventListener("click", () => getGps("#random-lat", "#random-lon", "#random-gps-accuracy", "#random-gps-status", "GPS punktu"));
    $("#quick-gps-btn")?.addEventListener("click", () => getGps("#quick-lat", "#quick-lon", "#quick-gps-accuracy", "#quick-gps-status", "GPS gniazda"));
  }

  function gpsQuality(acc) {
    if (acc <= 5) return "dobry";
    if (acc <= 10) return "średni";
    return "słaby";
  }

  function setupNavigation() {
    const handleHomeExit = () => goHomeFromMaybeForm().catch((error) => {
      console.error(error);
      alert(`Nie udało się zapisać szkicu: ${error.message || error}`);
    });
    $("#home-shortcut").addEventListener("click", openAppMenu);
    $$(".back-home").forEach((btn) => btn.addEventListener("click", handleHomeExit));
    $("#user-back")?.addEventListener("click", () => {
      showView("home");
      if (userPanelReturnToMenu) {
        userPanelReturnToMenu = false;
        setTimeout(openAppMenu, 0);
      }
    });
    $("#export-back")?.addEventListener("click", () => {
      showView("home");
      if (exportPanelReturnToMenu) {
        exportPanelReturnToMenu = false;
        setTimeout(openAppMenu, 0);
      }
    });
    $("#resume-draft")?.addEventListener("click", () => {
      if (!loadDraftToForm()) alert("Brak zapisanego szkicu.");
    });
    $("#start-new").addEventListener("click", () => { editReturnToReadonly = false; startNewRecord(); });
    $("#start-quick-nest")?.addEventListener("click", () => { editReturnToReadonly = false; startQuickNestRecord(); });
    $("#quick-nest-back")?.addEventListener("click", () => showView("home"));
    $("#quick-nest-id-generate")?.addEventListener("click", () => setValue("#quick-nest-id", buildQuickNestId()));
    $("#quick-species")?.addEventListener("change", () => {
      const idEl = $("#quick-nest-id");
      if (idEl && !String(idEl.value || "").trim()) idEl.value = buildQuickNestId();
    });
    $("#quick-obs-date")?.addEventListener("change", () => {
      const idEl = $("#quick-nest-id");
      if (idEl && !String(idEl.value || "").trim()) idEl.value = buildQuickNestId();
    });
    $("#quick-nest-save")?.addEventListener("click", () => saveQuickNestRecord().catch((error) => {
      console.error(error);
      alert(`Szybki wpis nie powiódł się: ${error.message || error}`);
    }));
    $("#open-records").addEventListener("click", () => {
      renderEntries();
      showView("records");
    });
    $("#open-map").addEventListener("click", () => { mapFocusUid = null; showView("map"); });
    $("#open-working-map").addEventListener("click", () => showView("working-map"));
    $("#records-show-map").addEventListener("click", () => { mapFocusUid = null; showView("map"); });
    $("#step-back").addEventListener("click", () => showStep(currentStep - 1));
    $("#step-next").addEventListener("click", () => showStep(currentStep + 1));
    $("#step-first")?.addEventListener("click", () => showStep(1));
    $("#step-last")?.addEventListener("click", () => showStep(8));
    $("#step-strip")?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-step]");
      if (!btn) return;
      showStep(Number(btn.dataset.step));
    });
    $("#save-final").addEventListener("click", () => saveFinalRecord().catch((error) => {
      console.error(error);
      alert(`Zapis nie powiódł się: ${error.message || error}`);
    }));
    $("#quick-basic-save")?.addEventListener("click", () => quickSaveBasicRecord().catch((error) => {
      console.error(error);
      alert(`Zapis podstawowy nie powiódł się: ${error.message || error}`);
    }));
    $("#save-draft").addEventListener("click", () => saveDraft().catch((error) => {
      console.error(error);
      alert(`Nie udało się zapisać szkicu: ${error.message || error}`);
    }));
    $("#cancel-edit").addEventListener("click", () => {
      resetForm();
      showView("records");
    });
    $("#random-azimuth-btn").addEventListener("click", () => setValue("#random-azimuth", String(Math.floor(Math.random() * 360))));
    $("#record-search").addEventListener("input", renderEntries);
    $("#sector").addEventListener("input", () => {
      const sectorEl = $("#sector");
      if (!sectorEl) return;
      if (sectorEl.dataset.auto === "1") return;
      sectorEl.dataset.manual = String(sectorEl.value || "").trim() ? "1" : "";
      if (!sectorEl.dataset.manual) delete sectorEl.dataset.manual;
    });
    $("#entries-list").addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (btn) {
        event.stopPropagation();
        if (btn.dataset.action === "share") void shareRecord(btn.dataset.uid);
        if (btn.dataset.action === "edit") editRecord(btn.dataset.uid);
        if (btn.dataset.action === "delete") deleteRecord(btn.dataset.uid);
        return;
      }
      const card = event.target.closest(".entry-card");
      if (card?.dataset.uid) showReadonlyRecord(card.dataset.uid);
    });
    $("#readonly-back").addEventListener("click", () => { revokePhotoUrls("server"); showView("records"); });
    $("#readonly-edit").addEventListener("click", () => { editReturnToReadonly = true; readonlyUid && editRecord(readonlyUid); });
    $("#readonly-nav-nest").addEventListener("click", () => { const r=getEntries().find((e)=>String(e.uid)===String(readonlyUid)); if (r) navigateTo(r.lat,r.lon); });
    $("#readonly-nav-random").addEventListener("click", () => { const r=getEntries().find((e)=>String(e.uid)===String(readonlyUid)); if (r) navigateTo(r.randomMicro?.lat,r.randomMicro?.lon); });
    $("#readonly-show-map").addEventListener("click", () => { mapFocusUid = readonlyUid; showView("map"); });
    $("#map-back").addEventListener("click", () => showView("records"));
    $("#records-fullscreen-map")?.addEventListener("click", () => setMapFullscreen("records", true));
    $("#records-fullscreen-close")?.addEventListener("click", () => setMapFullscreen("records", false));
    $("#map-center-user").addEventListener("click", async () => {
      try {
        await showMyLocationOnMap(recordsMap, "#map-user-status");
        ensureUserLocationTracking([], null);
        syncUserLocationLayers("records");
        recordsMap?.setView(latestUserLatLng, 18);
        mapUserState.records.hasAutoCenteredOnUser = true;
      } catch {
        alert("Nie udało się pobrać mojej pozycji. Sprawdź uprawnienia lokalizacji.");
      }
    });
    $("#map-track-user").addEventListener("click", () => { void toggleUserLocationTracking("records", recordsMap, "#map-user-status"); });
    $("#map-enable-heading").addEventListener("click", () => { void toggleMapHeading(); });
    $("#records-layer-health-check")?.addEventListener("click", () => runMapLayerDiagnostics("records").catch((error) => { console.error(error); renderMapLayerDiagnostics("records", [{ layerName: "Diagnostyka", type: "app", status: "nieznany błąd", elapsedMs: 0, url: "", diagnosis: error.message || String(error) }]); }));
    $("#map-screen").addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-map-action]");
      if (!btn) return;
      const action = btn.dataset.mapAction;
      if (action === "collapse-layer-diagnostics") {
        const target = $(`#${btn.dataset.mapId || "records"}-layer-diagnostics`);
        if (target) target.hidden = true;
        return;
      }
      if (action === "view") showReadonlyRecord(btn.dataset.uid);
      if (action === "share") void shareRecord(btn.dataset.uid);
      if (action === "edit") editRecord(btn.dataset.uid);
      if (action === "delete") deleteRecord(btn.dataset.uid);
      if (action === "nav") navigateTo(btn.dataset.lat, btn.dataset.lon);
    });
    $("#records-grid-toggle")?.addEventListener("change", () => {
      if (!recordsMap) return;
      if ($("#records-grid-toggle").checked) {
        if (!recordsGridLayer) void addGridToMap(recordsMap, "records");
        else recordsGridLayer.addTo(recordsMap);
      } else if (recordsGridLayer) recordsMap.removeLayer(recordsGridLayer);
      saveMapOverlayState("records");
    });

    $("#records-species-labels-toggle")?.addEventListener("change", () => {
      recordSpeciesLabelsVisible = !!$("#records-species-labels-toggle")?.checked;
      saveMapOverlayState("records");
      renderRecordsMap(mapFocusUid);
    });
    $("#records-brysna-smieck-toggle")?.addEventListener("change", () => {
      void setBrysnaSmieckLayerVisible("records", !!$("#records-brysna-smieck-toggle")?.checked);
      saveMapOverlayState("records");
    });

    $("#nest-photos").addEventListener("change", () => {
      setValue("#nest-one-m-photo-done", "yes");
      renderPhotoPreviews();
    });
    $("#random-photos").addEventListener("change", () => {
      setValue("#random-point-done", "yes");
      setValue("#doc-photo-done", "yes");
      renderPhotoPreviews();
    });
    $("#validation-override-summary")?.addEventListener("change", () => renderValidationAndPreview());
    $("#working-map-back").addEventListener("click", () => showView("home"));
    $("#working-add-gps").addEventListener("click", addWorkingNestFromGps);
    $("#working-fullscreen-map")?.addEventListener("click", () => setMapFullscreen("working", true));
    $("#working-fullscreen-close")?.addEventListener("click", () => setMapFullscreen("working", false));
    $("#working-center-user").addEventListener("click", async () => {
      try {
        await showMyLocationOnMap(workingMap, "#working-user-status");
        ensureUserLocationTracking([], null);
        syncUserLocationLayers("working");
        workingMap?.setView(latestUserLatLng, 18);
        mapUserState.working.hasAutoCenteredOnUser = true;
      } catch {
        alert("Nie udało się pobrać mojej pozycji. Sprawdź uprawnienia lokalizacji.");
      }
    });
    $("#working-fit").addEventListener("click", () => fitWorkingMapBounds());
    $("#working-track-user").addEventListener("click", () => { void toggleUserLocationTracking("working", workingMap, "#working-user-status"); });
    $("#working-enable-heading").addEventListener("click", () => { void toggleMapHeading(); });
    $("#working-layer-health-check")?.addEventListener("click", () => runMapLayerDiagnostics("working").catch((error) => { console.error(error); renderMapLayerDiagnostics("working", [{ layerName: "Diagnostyka", type: "app", status: "nieznany błąd", elapsedMs: 0, url: "", diagnosis: error.message || String(error) }]); }));
    $("#working-show-map").addEventListener("click",()=>{workingViewMode="map";renderWorkingMap();});
    $("#working-show-list").addEventListener("click",()=>{workingViewMode="list";renderWorkingMap();});
    $("#working-nearest").addEventListener("click",()=>{workingViewMode="list";renderWorkingMap(true);});
    $("#working-grid-toggle")?.addEventListener("change", () => {
      if (!workingMap) return;
      if ($("#working-grid-toggle").checked) {
        if (!workingGridLayer) void addGridToMap(workingMap, "working");
        else workingGridLayer.addTo(workingMap);
      } else if (workingGridLayer) workingMap.removeLayer(workingGridLayer);
      saveMapOverlayState("working");
    });
    $("#working-notes-toggle")?.addEventListener("change", () => {
      workingNotesVisible = !!$("#working-notes-toggle")?.checked;
      saveMapOverlayState("working");
      renderWorkingMap();
    });
    $("#working-brysna-smieck-toggle")?.addEventListener("change", () => {
      void setBrysnaSmieckLayerVisible("working", !!$("#working-brysna-smieck-toggle")?.checked);
      saveMapOverlayState("working");
    });
    $("#working-map-screen").addEventListener("click", onWorkingScreenClick);
    $("#working-map-screen").addEventListener("change", onWorkingScreenChange);
    $("#working-edit-form").addEventListener("submit", onWorkingEditSubmit);
    $("#working-edit-cancel").addEventListener("click", closeWorkingEditPanel);
    $("#working-edit-delete").addEventListener("click", () => { if (editingWorkingId && confirm("Dane zostaną ukryte w aplikacji, ale pozostaną w bazie i mogą zostać odzyskane przez administratora.")) deleteWorkingNest(editingWorkingId); });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeActiveMapFullscreen();
    });
    $("#back-to-readonly")?.addEventListener("click", () => {
      if (readonlyUid) showReadonlyRecord(readonlyUid);
    });
    window.addEventListener("beforeunload", () => revokePhotoUrls("server"));
    $("#lat")?.addEventListener("input", () => { autoFillNearestDistances(); void autoFillSectorFromGrid(); });
    $("#lat")?.addEventListener("change", () => { autoFillNearestDistances(); void autoFillSectorFromGrid(); });
    $("#lon")?.addEventListener("input", () => { autoFillNearestDistances(); void autoFillSectorFromGrid(); });
    $("#lon")?.addEventListener("change", () => { autoFillNearestDistances(); void autoFillSectorFromGrid(); });

  }

  function setupCompass() {
    const statusEl = $("#compass-status");
    const degEl = $("#compass-deg");
    const dirEl = $("#compass-dir");
    const arrowEl = $("#compass-arrow");
    const enableBtn = $("#compass-enable-btn");
    if (!statusEl || !degEl || !dirEl || !arrowEl) return;

    const toDir = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
    const normalize = (deg) => ((deg % 360) + 360) % 360;
    let gotData = false;
    let started = false;
    let timeoutId = null;
    const render = (deg) => {
      const n = normalize(deg);
      gotData = true;
      degEl.textContent = `${Math.round(n)}°`;
      dirEl.textContent = toDir(n);
      arrowEl.style.transform = `rotate(${n}deg)`;
      statusEl.textContent = "Kompas aktywny.";
    };

    const onOrientation = (event) => {
      let heading = null;
      if (typeof event.webkitCompassHeading === "number") heading = event.webkitCompassHeading;
      else if (event.absolute === true && typeof event.alpha === "number") heading = event.alpha;
      else if (typeof event.alpha === "number") heading = 360 - event.alpha;
      if (typeof heading === "number" && Number.isFinite(heading)) render(heading);
    };

    const start = () => {
      if (started) return;
      started = true;
      gotData = false;
      window.addEventListener("deviceorientationabsolute", onOrientation, true);
      window.addEventListener("deviceorientation", onOrientation, true);
      statusEl.textContent = "Kompas: oczekuję na dane z kompasu...";
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!gotData) {
          statusEl.textContent = "Brak danych z kompasu. Sprawdź, czy przeglądarka ma dostęp do czujników ruchu/orientacji i czy urządzenie ma magnetometr.";
        }
      }, 7000);
    };

    const hasApi = "DeviceOrientationEvent" in window;
    if (!hasApi) {
      statusEl.textContent = "Kompas niedostępny w tej przeglądarce lub na tym urządzeniu.";
      enableBtn.disabled = true;
      return;
    }
    statusEl.textContent = "Kompas gotowy. Kliknij „Uruchom kompas”.";
    enableBtn.addEventListener("click", async () => {
      const requestPermission = window.DeviceOrientationEvent?.requestPermission;
      if (typeof requestPermission === "function") {
        try {
          const permission = await requestPermission.call(window.DeviceOrientationEvent);
          if (permission !== "granted") {
            statusEl.textContent = "Kompas niedostępny bez zgody użytkownika.";
            return;
          }
        } catch {
          statusEl.textContent = "Kompas niedostępny w tej przeglądarce lub na tym urządzeniu.";
          return;
        }
      }
      start();
    });
  }

  function setupExports() {
    $("#export-json").addEventListener("click", () => {
      downloadText(`sieweczka-records-${dateStamp()}.json`, JSON.stringify(getEntries(), null, 2), "application/json");
    });
    $("#export-csv").addEventListener("click", () => {
      downloadText(`sieweczka-records-${dateStamp()}.csv`, buildCsv(getEntries()), "text/csv;charset=utf-8");
    });
    $("#export-zip").addEventListener("click", () => exportZip({ includePhotos: false }).catch((error) => {
      console.error(error);
      alert(`Eksport nie powiódł się: ${error.message || error}`);
    }));
    $("#export-zip-photos")?.addEventListener("click", async () => {
      const warning = "Eksport ze zdjęciami może pobrać dużą ilość danych z serwera. Upewnij się, że masz stabilny internet i wystarczająco dużo miejsca na telefonie. Zdjęcia zostaną pobrane tylko do pliku eksportu i nie będą zapisywane trwale w pamięci aplikacji.";
      if (!confirm(`${warning}\n\nKontynuuj ze zdjęciami?`)) return;
      await exportZip({ includePhotos: true }).catch((error) => {
        console.error(error);
        alert(`Eksport ze zdjęciami nie powiódł się: ${error.message || error}`);
      });
    });
    $("#export-kml")?.addEventListener("click", exportKml);
  }

  function getMaxEggMeasurementNo(entries = []) {
    return Math.max(5, ...entries.flatMap((entry) => {
      const count = Number(entry?.eggCount);
      const measurementNos = normalizeEggMeasurements(entry?.eggMeasurements || []).map((item) => Number(item.eggNo) || 0);
      return [Number.isFinite(count) ? count : 0, ...measurementNos];
    }).map((number) => Math.max(0, Math.floor(number || 0))));
  }

  function addEggMeasurementColumns(row, entry, maxEggNo) {
    const byNo = new Map(normalizeEggMeasurements(entry?.eggMeasurements || []).map((item) => [Number(item.eggNo), item]));
    for (let eggNo = 1; eggNo <= maxEggNo; eggNo += 1) {
      const item = byNo.get(eggNo) || {};
      row[`egg_${eggNo}_width_cm`] = item.widthCm ?? "";
      row[`egg_${eggNo}_length_cm`] = item.lengthCm ?? "";
      row[`egg_${eggNo}_weight_g`] = item.weightG ?? "";
    }
    return row;
  }

  function flattenEntry(entry, maxEggNo = 5) {
    const row = {
      uid: entry.uid,
      protocolVersion: entry.protocolVersion,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      recordCompleteness: entry.recordCompleteness || (entry.quickSave ? "basic" : "full"),
      quickSave: !!entry.quickSave,
      quickSaveReason: entry.quickSaveReason || "",
      habitatDescriptionSkipped: !!entry.habitatDescriptionSkipped,
      savedFromStep: entry.savedFromStep ?? "",
      nestId: entry.nestId,
      season: entry.season,
      obsDate: entry.obsDate,
      obsTime: entry.obsTime,
      observer: entry.observer,
      species: entry.species,
      sector: entry.sector,
      lat: entry.lat,
      lon: entry.lon,
      gpsAccuracyM: entry.gpsAccuracyM,
      nestStatus: entry.nestStatus,
      eggCount: entry.eggCount,
      possibleRenest: entry.possibleRenest,
      docPhotoDone: entry.docPhotoDone,
      nestOneMPhotoDone: entry.nestOneMPhotoDone,
      randomPointDone: entry.randomPointDone,

      nestSubstrate: entry.nestMicro?.substrate,
      nestPctSand: entry.nestMicro?.coverage?.pctSand,
      nestPctFineGravel: entry.nestMicro?.coverage?.pctFineGravel,
      nestPctCoarse: entry.nestMicro?.coverage?.pctCoarse,
      nestPctShells: entry.nestMicro?.coverage?.pctShells,
      nestPctLiveVeg: entry.nestMicro?.coverage?.pctLiveVeg,
      nestPctDryVeg: entry.nestMicro?.coverage?.pctDryVeg,
      nestPctOrganic: entry.nestMicro?.coverage?.pctOrganic,
      nestPctAnthro: entry.nestMicro?.coverage?.pctAnthro,
      nestDistPlantCm: entry.nestMicro?.distPlantCm,
      nestHeightPlantCm: entry.nestMicro?.heightPlantCm,
      nestDistObjectCm: entry.nestMicro?.distObjectCm,
      nestHeightObjectCm: entry.nestMicro?.heightObjectCm,
      nestSlope: entry.nestMicro?.slope,
      nestMicrorelief: entry.nestMicro?.microrelief,
      nestPhotoCount: entry.nestMicro?.photos?.length || 0,

      randomAzimuthDeg: entry.randomMicro?.azimuthDeg,
      randomWasRerolled: entry.randomMicro?.wasRerolled,
      randomRerollReason: entry.randomMicro?.rerollReason,
      randomLat: entry.randomMicro?.lat,
      randomLon: entry.randomMicro?.lon,
      randomGpsAccuracyM: entry.randomMicro?.gpsAccuracyM,
      randomSubstrate: entry.randomMicro?.substrate,
      randomPctSand: entry.randomMicro?.coverage?.pctSand,
      randomPctFineGravel: entry.randomMicro?.coverage?.pctFineGravel,
      randomPctCoarse: entry.randomMicro?.coverage?.pctCoarse,
      randomPctShells: entry.randomMicro?.coverage?.pctShells,
      randomPctLiveVeg: entry.randomMicro?.coverage?.pctLiveVeg,
      randomPctDryVeg: entry.randomMicro?.coverage?.pctDryVeg,
      randomPctOrganic: entry.randomMicro?.coverage?.pctOrganic,
      randomPctAnthro: entry.randomMicro?.coverage?.pctAnthro,
      randomDistPlantCm: entry.randomMicro?.distPlantCm,
      randomHeightPlantCm: entry.randomMicro?.heightPlantCm,
      randomDistObjectCm: entry.randomMicro?.distObjectCm,
      randomHeightObjectCm: entry.randomMicro?.heightObjectCm,
      randomSlope: entry.randomMicro?.slope,
      randomMicrorelief: entry.randomMicro?.microrelief,
      randomPhotoCount: entry.randomMicro?.photos?.length || 0,

      mesoPctSand: entry.meso?.pctSand,
      mesoPctFineGravel: entry.meso?.pctFineGravel || 0,
      mesoPctGravel: entry.meso?.pctGravel,
      mesoPctVegetation: entry.meso?.pctVegetation,
      mesoPctWater: entry.meso?.pctWater,
      mesoPctOther: entry.meso?.pctOther,
      mesoAssessmentMethod: entry.meso?.assessmentMethod,
      distWaterM: entry.meso?.distWaterM,
      distVegEdgeM: entry.meso?.distVegEdgeM,
      distVerticalStructureM: entry.meso?.distVerticalStructureM,
      distNearestHiaticulaM: entry.meso?.distNearestHiaticulaM,
      distNearestDubiusM: entry.meso?.distNearestDubiusM,
      mesoBigObjects: entry.meso?.bigObjects,
      distFineGravelPatchM: entry.meso?.distFineGravelPatchM,
      distCoarseGravelPatchM: entry.meso?.distCoarseGravelPatchM,
      mesoSpatialNotes: entry.meso?.spatialNotes,

      qcBirdReaction: entry.qualityControl?.birdReaction,
      qcTimeAtNest: entry.qualityControl?.timeAtNest,
      qcAborted: entry.qualityControl?.aborted,
      qcTracksVisible: entry.qualityControl?.tracksVisible,
      qcTracksNotes: entry.qualityControl?.tracksNotes,

      notesIdentification: entry.moduleNotes?.identification,
      notesNestMicro: entry.moduleNotes?.nestMicro,
      notesRandomMicro: entry.moduleNotes?.randomMicro,
      notesMeso: entry.moduleNotes?.meso,
      notes: entry.notes,
    };
    return addEggMeasurementColumns(row, entry, maxEggNo);
  }

  function buildCsv(entries) {
    const maxEggNo = getMaxEggMeasurementNo(entries);
    const rows = entries.map((entry) => flattenEntry(entry, maxEggNo));
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const labels = {
      mesoPctSand: "Mezohabitat — piasek",
      mesoPctFineGravel: "Mezohabitat — żwir",
      mesoPctGravel: "Mezohabitat — kamienie",
      mesoPctVegetation: "Mezohabitat — roślinność",
      mesoPctWater: "Mezohabitat — woda/podmokłość",
      mesoPctOther: "Mezohabitat — muszle"
    };
    const escape = (cell) => {
      const text = cell == null ? "" : String(cell);
      return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return [headers.map((header) => labels[header] || header).join(";"), ...rows.map((row) => headers.map((header) => escape(row[header])).join(";"))].join("\n");
  }

  function buildEggMeasurementsCsv(entries) {
    const rows = [];
    entries.forEach((entry) => {
      normalizeEggMeasurements(entry?.eggMeasurements || []).forEach((item) => {
        rows.push({
          record_uid: entry.uid || "",
          nest_id: entry.nestId || "",
          species: entry.species || "",
          egg_no: item.eggNo,
          width_cm: item.widthCm ?? "",
          length_cm: item.lengthCm ?? "",
          weight_g: item.weightG ?? "",
          note: item.note || ""
        });
      });
    });
    return csvFromRows(rows, ["record_uid", "nest_id", "species", "egg_no", "width_cm", "length_cm", "weight_g", "note"]);
  }

  function setExportStatus(message) {
    const status = $("#export-screen-status") || $("#sync-status");
    if (status) status.textContent = message;
  }

  function csvFromRows(rows, headers) {
    const escape = (cell) => {
      const text = cell == null ? "" : String(cell);
      return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return [headers.join(";"), ...rows.map((row) => headers.map((header) => escape(row[header])).join(";"))].join("\n");
  }

  function photoExtension(blob, photo = {}) {
    const mime = String(photo.mimeType || photo.mime_type || blob?.type || "image/jpeg").toLowerCase();
    if (mime.includes("png")) return "png";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("heic")) return "heic";
    return "jpg";
  }

  function collectExportPhotoItems(entries, workingNests = []) {
    const items = [];
    for (const entry of entries) {
      for (const ref of entry.nestMicro?.photos || []) {
        const localRef = String(ref?.dataUrl || ref || "");
        if (localRef) items.push({ localRef, recordUid: entry.uid, recordNestId: entry.nestId, photoRole: "nest" });
      }
      for (const ref of entry.randomMicro?.photos || []) {
        const localRef = String(ref?.dataUrl || ref || "");
        if (localRef) items.push({ localRef, recordUid: entry.uid, recordNestId: entry.nestId, photoRole: "random" });
      }
    }
    for (const nest of workingNests) {
      for (const ref of nest.photos || []) {
        const localRef = String(ref?.dataUrl || ref || "");
        if (localRef) items.push({ localRef, workingNestId: nest.id, recordNestId: nest.label, photoRole: "working" });
      }
    }
    return items;
  }

  async function exportZip(options = {}) {
    const entries = activeEntries();
    if (!window.JSZip) {
      alert("Biblioteka ZIP nie jest dostępna. Eksportuję CSV i JSON osobno.");
      downloadText(`sieweczka-records-${dateStamp()}.csv`, buildCsv(entries), "text/csv;charset=utf-8");
      downloadText(`egg-measurements-${dateStamp()}.csv`, buildEggMeasurementsCsv(entries), "text/csv;charset=utf-8");
      downloadText(`sieweczka-records-${dateStamp()}.json`, JSON.stringify(entries, null, 2), "application/json");
      return;
    }
    const includePhotos = options.includePhotos === true;
    let includeServer = includePhotos;
    if (includePhotos && !navigator.onLine) {
      const localOnly = confirm("Nie można pobrać zdjęć z serwera offline. Możesz wyeksportować dane bez zdjęć albo tylko zdjęcia dostępne lokalnie.\n\nEksportować tylko zdjęcia dostępne lokalnie?");
      if (!localOnly) return;
      includeServer = false;
    }

    setExportStatus(includePhotos ? "Przygotowuję eksport ze zdjęciami..." : "Tworzę archiwum...");
    const zip = new JSZip();
    zip.file("sieweczka-records.csv", buildCsv(entries));
    zip.file("egg_measurements.csv", buildEggMeasurementsCsv(entries));
    zip.file("records.json", JSON.stringify(entries, null, 2));
    const manifest = [];

    if (includePhotos) {
      const photos = zip.folder("photos");
      const items = collectExportPhotoItems(entries, activeWorkingNests());
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setExportStatus(`Pobieram zdjęcie ${index + 1} z ${items.length}...`);
        try {
          const resolved = await resolvePhotoBlobForExport(item.localRef, item, { includeServer });
          const serverId = resolved.photo?.id || getPhotoSyncMap()[item.localRef]?.serverId || "";
          const filename = `photos/${safeFile(item.recordUid || item.recordNestId || "record")}_${safeFile(item.photoRole)}_${safeFile(serverId || item.localRef.replace(/^idb:/, ""))}.${photoExtension(resolved.blob, resolved.photo)}`;
          photos.file(filename.replace(/^photos\//, ""), resolved.blob);
          manifest.push({
            record_uid: item.recordUid || "",
            working_nest_id: item.workingNestId || "",
            photo_role: item.photoRole || "",
            local_ref: item.localRef || "",
            server_id: serverId,
            filename,
            original_name: resolved.photo?.originalName || resolved.photo?.original_name || "",
            mime_type: resolved.photo?.mimeType || resolved.photo?.mime_type || resolved.blob?.type || "",
            size_bytes: resolved.photo?.sizeBytes || resolved.photo?.size_bytes || resolved.blob?.size || "",
            source: resolved.source,
            error: ""
          });
        } catch (error) {
          manifest.push({
            record_uid: item.recordUid || "",
            working_nest_id: item.workingNestId || "",
            photo_role: item.photoRole || "",
            local_ref: item.localRef || "",
            server_id: "",
            filename: "",
            original_name: "",
            mime_type: "",
            size_bytes: "",
            source: "",
            error: error.message || String(error)
          });
          console.warn("Nie udało się dodać zdjęcia do eksportu", item, error);
        }
      }
      zip.file("photos_manifest.csv", csvFromRows(manifest, ["record_uid", "working_nest_id", "photo_role", "local_ref", "server_id", "filename", "original_name", "mime_type", "size_bytes", "source", "error"]));
    }

    setExportStatus("Tworzę archiwum...");
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`sieweczka-export-${dateStamp()}.zip`, blob);
    setExportStatus("Eksport gotowy.");
  }


  function escapeXml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }

  function exportKml() {
    const entries = activeEntries();
    const placemarks = [];
    const buildDescription = (entry, pos) => [
      `ID gniazda: ${entry.nestId || "(bez ID)"}`,`Gatunek: ${LABELS.species[entry.species] || entry.species || "-"}`,`Data: ${entry.obsDate || "-"}`,`Liczba jaj: ${entry.eggCount ?? "brak"}`,`Obserwator: ${entry.observer || "-"}`,`Sektor: ${entry.sector || "-"}`,`Lat/Lon: ${pos[0]}, ${pos[1]}`
    ].join("\n");
    for (const entry of entries) {
      const nestPos = toLatLon(entry.lat, entry.lon);
      const ctrlPos = toLatLon(entry.randomMicro?.lat, entry.randomMicro?.lon);
      if (nestPos) placemarks.push(`<Placemark><name>${escapeXml(entry.nestId || "(bez ID)")}</name><description>${escapeXml(buildDescription(entry, nestPos))}</description><Point><coordinates>${nestPos[1]},${nestPos[0]},0</coordinates></Point></Placemark>`);
      if (ctrlPos) placemarks.push(`<Placemark><name>${escapeXml(`${entry.nestId || "(bez ID)"} – kontrola`)}</name><description>${escapeXml(`Punkt kontroli\nLat/Lon: ${ctrlPos[0]}, ${ctrlPos[1]}`)}</description><Point><coordinates>${ctrlPos[1]},${ctrlPos[0]},0</coordinates></Point></Placemark>`);
    }
    if (!placemarks.length) { alert("Brak rekordów z poprawnym GPS do eksportu KML."); return; }
    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>sieweczka-records</name>\n${placemarks.join("\n")}\n</Document>\n</kml>`;
    downloadText(`sieweczka-records-${new Date().toISOString().slice(0,10)}.kml`, kml, "application/vnd.google-earth.kml+xml;charset=utf-8");
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  }

  function safeFile(name) {
    return String(name || "record").replace(/[^\p{L}\p{N}_-]+/gu, "_");
  }

  function downloadText(filename, text, type) {
    downloadBlob(filename, new Blob([text], { type }));
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getWorkingNests() { try { const v = JSON.parse(localStorage.getItem(WORKING_NESTS_KEY) || "[]"); return Array.isArray(v) ? v.map(normalizeWorkingNest) : []; } catch { return []; } }
  function setWorkingNests(nests) { localStorage.setItem(WORKING_NESTS_KEY, JSON.stringify((Array.isArray(nests) ? nests : []).map(normalizeWorkingNest))); }
  const saveWorkingNests = setWorkingNests;
  function findWorkingNest(id) { return getWorkingNests().find((w) => String(w.id) === String(id)) || null; }
  function updateWorkingNest(id, patch) {
    const items = getWorkingNests();
    const idx = items.findIndex((w) => String(w.id) === String(id));
    if (idx < 0) return null;
    const user = getCurrentUser();
    const updated = normalizeWorkingNest({ ...items[idx], ...patch, updatedAt: new Date().toISOString(), updatedBy: user?.id || items[idx].updatedBy || "", updatedByName: user?.name || items[idx].updatedByName || "" });
    items[idx] = updated;
    setWorkingNests(items);
    renderWorkingMap();
    if (navigator.onLine) syncNow().catch(() => { showMapOfflineStatus("working", "Nie udało się od razu zsynchronizować zmiany gniazda roboczego. Zostanie wysłana przy następnej synchronizacji.", { type: "warning", autoHide: true, timeoutMs: 8000 }); });
    return updated;
  }

  function moveWorkingNestFromMap(id, latLng) {
    const item = findWorkingNest(id);
    if (!item) return null;
    if (!canMoveMapPoint(item)) {
      alert("Brak uprawnień do przesunięcia tego gniazda roboczego. Możesz przesuwać tylko swoje punkty, a administrator może przesuwać wszystkie.");
      return null;
    }
    return updateWorkingNest(id, { lat: roundMapCoordinate(latLng.lat), lon: roundMapCoordinate(latLng.lng) });
  }

  function bindWorkingNestDrag(marker, item, pos) {
    if (!canMoveMapPoint(item) || !isMapPointEditModeEnabled("working")) return;
    marker.dragging?.enable();
    marker.on("dragend", () => {
      const next = marker.getLatLng();
      const confirmed = confirm(`Przesunąć gniazdo robocze ${item.label || "(bez etykiety)"} na nowe współrzędne ${roundMapCoordinate(next.lat)}, ${roundMapCoordinate(next.lng)}?`);
      if (!confirmed) {
        marker.setLatLng(pos);
        return;
      }
      const updated = moveWorkingNestFromMap(item.id, next);
      if (!updated) {
        marker.setLatLng(pos);
        return;
      }
      workingFocusId = updated.id;
      workingViewMode = "map";
      renderWorkingMap();
    });
  }
  async function deleteWorkingNest(id) {
    const items = getWorkingNests();
    const idx = items.findIndex((w) => String(w.id) === String(id));
    if (idx < 0) return false;
    const target = items[idx];
    if (!canSoftDeleteItem(target)) return alert("Brak uprawnień do oznaczenia tego punktu jako usuniętego.");
    const reason = prompt("Powód usunięcia/ukrycia (opcjonalnie):") || "";
    let updated = normalizeWorkingNest({ ...target, deletedAt: new Date().toISOString(), deletedBy: getCurrentUser()?.id || "", deleteReason: reason, updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.id || "", updatedByName: getCurrentUser()?.name || "" });
    if (navigator.onLine && getUserToken()) {
      try {
        const cfg = getSyncConfig();
        const res = await fetch(`${getSyncApiBase(cfg)}/api/working-nests/${encodeURIComponent(id)}/delete`, { method: "POST", headers: { "Content-Type": "application/json", ...getSyncAuthHeaders(cfg) }, body: JSON.stringify({ reason }) });
        if (res.ok) updated = normalizeWorkingNest((await res.json()).workingNest || updated);
      } catch {
        // Offline-first: local soft delete will be synchronized later.
      }
    }
    items[idx] = updated;
    setWorkingNests(items);
    if (editingWorkingId && String(editingWorkingId) === String(id)) closeWorkingEditPanel();
    renderWorkingMap();
    if (navigator.onLine) syncNow().catch(() => {});
    return true;
  }
  function openWorkingEditPanel(id) {
    const item = findWorkingNest(id);
    const panel = $("#working-edit-panel");
    if (!panel || !item) return;
    editingWorkingId = item.id;
    panel.hidden = false;
    $("#working-edit-id").value = item.id;
    $("#working-edit-label").textContent = item.label || "—";
    $("#working-edit-status").value = item.status || "do_sprawdzenia";
    $("#working-edit-note").value = item.note || "";
    $("#working-edit-lat").value = Number.isFinite(item.lat) ? item.lat : "";
    $("#working-edit-lon").value = Number.isFinite(item.lon) ? item.lon : "";
  }
  function closeWorkingEditPanel() { editingWorkingId = null; const panel = $("#working-edit-panel"); if (panel) panel.hidden = true; }
  function fitWorkingMapBounds() {
    const points = activeWorkingNests().map((w) => toLatLon(w.lat, w.lon)).filter(Boolean);
    if (points.length) workingMap?.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
    else workingMap?.setView([52, 19], 7);
  }
  function askWorkingGpsPointDetails() {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "working-point-modal";
      modal.innerHTML = `
        <div class="working-point-dialog" role="dialog" aria-modal="true" aria-label="Dodaj punkt roboczy GPS">
          <h3>Dodaj punkt roboczy z mojego GPS</h3>
          <p class="muted">Wybierz rodzaj punktu z listy. Punkt zostanie dodany w miejscu Twojej aktualnej pozycji GPS.</p>
          <label>Rodzaj punktu
            <select id="working-point-status-choice">
              <option value="do_sprawdzenia">Do sprawdzenia</option>
              <option value="prawdopodobne">Prawdopodobne</option>
              <option value="potwierdzone">Potwierdzone</option>
              <option value="odrzucone">Odrzucone</option>
            </select>
          </label>
          <label>Notatka (opcjonalnie)
            <textarea id="working-point-note-choice" rows="2"></textarea>
          </label>
          <div class="row-actions">
            <button type="button" class="primary" data-working-point-choice="add">Dodaj punkt</button>
            <button type="button" class="danger" data-working-point-choice="cancel">Anuluj</button>
          </div>
        </div>
      `;
      const close = (details) => {
        document.removeEventListener("keydown", onKey);
        modal.remove();
        resolve(details);
      };
      const onKey = (event) => {
        if (event.key === "Escape") close(null);
      };
      document.addEventListener("keydown", onKey);
      modal.addEventListener("click", (event) => {
        if (event.target === modal) return close(null);
        const choice = event.target.closest("[data-working-point-choice]")?.dataset.workingPointChoice;
        if (choice === "cancel") return close(null);
        if (choice === "add") {
          close({
            status: $("#working-point-status-choice")?.value || "do_sprawdzenia",
            note: String($("#working-point-note-choice")?.value || "").trim()
          });
        }
      });
      document.body.appendChild(modal);
      modal.querySelector("#working-point-status-choice")?.focus();
    });
  }
  async function addWorkingNestFromGps() {
    const details = await askWorkingGpsPointDetails();
    if (!details) return;
    if (!navigator.geolocation) return alert("Nie udało się pobrać GPS. Sprawdź uprawnienia lokalizacji.");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const items = getWorkingNests();
      const pos=[+coords.latitude.toFixed(6), +coords.longitude.toFixed(6)];
      const label=nextWorkingLabel(items);
      const user = getCurrentUser();
      const point=normalizeWorkingNest({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), label, createdAt: new Date().toISOString(), lat: pos[0], lon: pos[1], accuracy: Math.round(coords.accuracy), note: details.note, notes: details.note, status: details.status, createdBy: user?.id || "", createdByName: user?.name || "", updatedBy: user?.id || "", updatedByName: user?.name || "" });
      setWorkingNests([point,...getWorkingNests()]);
      workingFocusId=point.id;
      workingViewMode='map';
      renderWorkingMap();
    }, () => alert("Nie udało się pobrać GPS. Sprawdź uprawnienia lokalizacji."), { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
  }
  function onWorkingScreenClick(event) {
    const collapseBtn = event.target.closest("[data-map-action='collapse-layer-diagnostics']");
    if (collapseBtn) {
      const target = $(`#${collapseBtn.dataset.mapId || "working"}-layer-diagnostics`);
      if (target) target.hidden = true;
      return;
    }
    const btn = event.target.closest("[data-w-action]"); if (!btn) return;
    const id = btn.dataset.workingId; const item = findWorkingNest(id); if (!item) return;
    if (btn.dataset.wAction === "show") { workingViewMode='map'; workingFocusId=item.id; renderWorkingMap(); return; }
    if (btn.dataset.wAction === "nav") { navigateTo(item.lat, item.lon); return; }
    if (btn.dataset.wAction === "delete" && confirm("Dane zostaną ukryte w aplikacji, ale pozostaną w bazie i mogą zostać odzyskane przez administratora.")) { deleteWorkingNest(item.id); return; }
    if (btn.dataset.wAction === "edit") { openWorkingEditPanel(item.id); return; }
  }
  function onWorkingScreenChange(event) {
    const select = event.target.closest("select[data-w-action='status'][data-working-id]"); if (!select) return;
    updateWorkingNest(select.dataset.workingId, { status: select.value });
  }
  function onWorkingEditSubmit(event) {
    event.preventDefault();
    if (!editingWorkingId) return;
    const lat = Number($("#working-edit-lat").value);
    const lon = Number($("#working-edit-lon").value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return alert("Podaj poprawne współrzędne.");
    updateWorkingNest(editingWorkingId, { status: $("#working-edit-status").value, note: $("#working-edit-note").value, notes: $("#working-edit-note").value, lat, lon });
    closeWorkingEditPanel();
  }
  function renderWorkingMap(showNearest = false) {
    const mapEl = $("#working-map"); if (!mapEl || typeof L === "undefined") return;
    if (!workingMap) {
      const base = createBaseLayers();
      workingMap = L.map(mapEl, { layers: [base.defaultLayer], maxZoom: MAP_MAX_ZOOM });
      workingMap.attributionControl.setPrefix("");
      initMapBaseLayerSelect(workingMap, "working", base);
      ortoCacheState.working.map = workingMap;
      ortoCacheState.working.onlineLayer = base.onlineLayer;
      ortoCacheState.working.offlineLayer = base.offlineLayer;
      ortoCacheState.working.dominikOnlineLayer = base.layers["Dominik Layer"];
      ortoCacheState.working.dominikOfflineLayer = base.layers["Dominik Layer offline"];
      restoreMapViewState(workingMap, "working");
      initMapViewStatePersistence(workingMap, "working");
      workingLayer = L.layerGroup().addTo(workingMap);
      initViewedOrtoCacheTools(workingMap, "working");
      initMeasureTools(workingMap, "working");
      initBrysnaSmieckLayer(workingMap, "working");
      switchToOfflineOrtoIfNeeded(workingMap, "working");
      initMapPointEditControl(workingMap, "working");
    }
    if ($("#working-grid-toggle")?.checked) {
      if (!workingGridLayer) void addGridToMap(workingMap, "working");
      else if (!workingMap.hasLayer(workingGridLayer)) workingGridLayer.addTo(workingMap);
    } else if (workingGridLayer && workingMap.hasLayer(workingGridLayer)) {
      workingMap.removeLayer(workingGridLayer);
    }
    workingLayer.clearLayers();
    const items = activeWorkingNests();
    const my=latestUserLatLng; const enriched=items.map((w)=>{ const pos=toLatLon(w.lat,w.lon); const dist=(my&&pos)?distanceM(my,pos):null; const bearing=(my&&pos)?bearingDeg(my,pos):null; return {w,pos,dist,bearing}; }).filter(x=>x.pos).sort((a,b)=>(a.dist??1e12)-(b.dist??1e12));
    enriched.forEach(({w,pos}) => {
      const canMove = canMoveMapPoint(w);
      const movable = canMove && isMapPointEditModeEnabled("working");
      const m = L.marker(pos, { icon: L.divIcon({ className: `map-marker working ${w.status||'do_sprawdzenia'}`, html: `<div class="pin"><span>${workingStatusMarkerText(w.status)}</span></div>` }), draggable: movable, autoPan: movable }).addTo(workingLayer);
      bindWorkingNestDrag(m, w, pos);
      const noteText = String(w.note ?? w.notes ?? "").trim();
      if (workingNotesVisible && noteText) m.bindTooltip(escapeHtml(noteText), { permanent: true, direction: "right", offset: [12, 0], className: "working-note-label" });
      m.bindPopup(`<strong>${escapeHtml(w.label || "—")}</strong><br>Status: ${escapeHtml(workingStatusLabel(w.status))}<br>${pos[0]}, ${pos[1]}${canMove ? `<br><span class='muted'>${isMapPointEditModeEnabled("working") ? "Tryb edycji włączony — możesz przeciągnąć punkt, zapis wymaga potwierdzenia." : "Punkty są zablokowane. Włącz edycję punktów przyciskiem na mapie, aby przeciągać."}</span>` : ""}<br><button data-w-action='show' data-working-id='${w.id}'>Pokaż</button> <button data-w-action='nav' data-working-id='${w.id}'>Nawiguj</button> ${canEditItem(w) ? `<button data-w-action='edit' data-working-id='${w.id}'>Edytuj</button>` : ""}<br>${canEditItem(w) ? `<select data-w-action='status' data-working-id='${w.id}'>${workingStatusOptions(w.status||'do_sprawdzenia')}</select>` : ""}`);
      if (workingFocusId && w.id===workingFocusId) { workingMap.setView(pos,19); m.openPopup(); }
    });
    setMapInfo("working", `Punkty robocze: ${enriched.length}`);
    $("#working-list").innerHTML = enriched.map(({w,pos,dist,bearing}) => `<article class="entry-card"><div class="entry-main"><h3>${escapeHtml(w.label || "—")}</h3><p>Status: <strong>${escapeHtml(workingStatusLabel(w.status))}</strong> • ${escapeHtml(w.createdAt || "—")}</p><p class="muted">${pos[0]}, ${pos[1]} • GPS ±${escapeHtml(w.accuracy||'—')} m</p><p class="muted">${dist==null?'Odległość niedostępna — włącz moją pozycję.':`${Math.round(dist)} m • ${bearingLabel(bearing)} / ${Math.round(bearing)}°`}</p>${w.note?`<p>${escapeHtml(w.note)}</p>`:''}</div><div class="entry-actions"><button data-w-action="show" data-working-id="${w.id}">Pokaż na mapie</button><button data-w-action="nav" data-working-id="${w.id}">Nawiguj</button>${canEditItem(w) ? `<button data-w-action="edit" data-working-id="${w.id}">Edytuj</button>` : ""}${canSoftDeleteItem(w) ? `<button class="danger" data-w-action="delete" data-working-id="${w.id}">Ukryj</button>` : ""}${canEditItem(w) ? `<select data-w-action="status" data-working-id="${w.id}">${workingStatusOptions(w.status||'do_sprawdzenia')}</select>` : ""}</div></article>`).join("") || `<p class="muted">Brak zapisanych gniazd roboczych.</p>`;
    $("#working-nearest-list").innerHTML = showNearest ? (enriched.slice(0,5).map(({w,dist,bearing})=>`<div>${escapeHtml(w.label)} — ${dist==null?'—':Math.round(dist)+' m'} — ${dist==null?'—':bearingLabel(bearing)} <button data-w-action="show" data-working-id="${w.id}">Pokaż</button> <button data-w-action="nav" data-working-id="${w.id}">Nawiguj</button></div>`).join('') || '<p class="muted">Brak danych.</p>') : '';
    $("#working-map-panel").hidden = workingViewMode!=='map'; $("#working-list-panel").hidden = workingViewMode!=='list';
    renderBrysnaSmieckPoints("working");
    workingMap.invalidateSize(); if (workingViewMode==='map') { if (!workingFocusId && !ortoCacheState.working.viewRestored) fitWorkingMapBounds(); syncUserLocationLayers("working"); bringMeasureToFront("working");}
  }

  function setupFieldMode() {
    const key = "sieweczka-field-mode";
    const legacy = localStorage.getItem(key);
    if (legacy != null && getUiSettings().fieldMode == null) {
      setUiSettings({ ...getUiSettings(), fieldMode: legacy === "1" });
    }
    applyUiSettings();
  }

  function maybeShowCompactSuggestion() {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const rawSettings = getUiSettings();
    const settings = normalizeUiSettings(rawSettings);
    const hasManualUiSettings = ["fontSize", "uiScale", "buttonSize", "iconSize"].some((key) => rawSettings[key] != null);
    if (width > 430 || settings.uiTouched || hasManualUiSettings || localStorage.getItem(UI_COMPACT_SUGGESTION_KEY) === "1") return;
    localStorage.setItem(UI_COMPACT_SUGGESTION_KEY, "1");
    const modal = document.createElement("div");
    modal.className = "ui-compact-suggestion";
    modal.innerHTML = `
      <div class="ui-compact-suggestion-panel" role="dialog" aria-modal="true" aria-label="Sugestia widoku kompaktowego">
        <p><strong>Ten telefon ma wąski ekran.</strong> Możesz włączyć widok kompaktowy, aby zmieścić więcej treści.</p>
        <div class="row-actions">
          <button type="button" data-compact-enable>Włącz kompaktowy</button>
          <button type="button" class="ghost-light" data-compact-dismiss>Nie teraz</button>
        </div>
      </div>`;
    const close = () => modal.remove();
    modal.querySelector("[data-compact-enable]")?.addEventListener("click", () => {
      applyUiPreset({ activePreset: "Dopasuj do małego ekranu", uiScale: "ui-compact", buttonSize: "buttons-small", iconSize: "icons-small", fontSize: "font-small", layoutWidth: "layout-narrow", tileLayout: "tiles-auto" });
      close();
    });
    modal.querySelector("[data-compact-dismiss]")?.addEventListener("click", close);
    document.body.append(modal);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              const status = $("#app-update-status");
              if (status) status.textContent = "Dostępna jest nowa wersja aplikacji. Kliknij, aby odświeżyć.";
            }
          });
        });
      }).catch(console.warn);
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  function setupViewportLayoutWatcher() {
    let frame = 0;
    const refresh = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateViewportLayoutClasses();
        renderUserPanel();
      });
    };
    updateViewportLayoutClasses();
    window.addEventListener("resize", refresh, { passive: true });
    window.addEventListener("orientationchange", refresh, { passive: true });
  }

  function setupPwaInstall() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateInstallStatus("Aplikację można zainstalować na tym urządzeniu. Kliknij „Zainstaluj aplikację”.");
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      updateInstallStatus("Aplikacja działa jako zainstalowana.");
    });
    updateInstallStatus();
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function init() {
    migrateLegacyEntries();
    setupViewportLayoutWatcher();
    applyUiSettings();
    setupPercentGroups();
    setupTiles();
    setupEggMeasurements();
    setDefaultDateTime();
    setupNestIdAutofill();
    setupSmartLists();
    setupCustomSpecies();
    setupNavigation();
    setupGps();
    setupCompass();
    ["#species"].forEach((sel) => $(sel)?.addEventListener("change", autoFillNearestDistances));
    ["#dist-nearest-hiaticula", "#dist-nearest-dubius"].forEach((sel) => $(sel)?.addEventListener("input", (event) => { event.target.dataset.manual = "1"; }));
    setupExports();
    setupFieldMode();
    setupSyncUI();
    setupAuthUI();
    syncTilesFromInputs();
    updatePercentSummaries();
    renderEntries();
    updateCounts();
    updateDraftResumeButton();
    renderUserPanel();
    showView(getCurrentUser() ? (mustChangePassword() ? "change-password" : "home") : "login");
    maybeShowCompactSuggestion();
    showStep(1);
    setupPwaInstall();
    registerServiceWorker();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
