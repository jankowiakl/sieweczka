const CACHE_NAME = "sieweczka-app-v2026-05-08-layer-diagnostics-dominik-basic-save";
const ORTO_OFFLINE_CACHE = "sieweczka-orto-view-cache-v1";
const GEOPORTAL_ORTO_WMS_HOST = "mapy.geoportal.gov.pl";
const GEOPORTAL_ORTO_WMS_PATH = "/wss/service/PZGIK/ORTO/WMS/StandardResolution";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./field-help.js",
  "./manifest.webmanifest",
  "./data/points_brysna_smieck.geojson",
  "./data/grid_vanvan_wgs84.geojson",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("sieweczka-") && key !== CACHE_NAME && key !== ORTO_OFFLINE_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (isGeoportalOrtoWmsRequest(url)) {
    event.respondWith(url.searchParams.get("sieweczkaOffline") === "1"
      ? getOfflineOrtoTileResponse(event.request)
      : fetch(event.request).catch(() => caches.open(ORTO_OFFLINE_CACHE).then((cache) => (
        cache.match(normalizeOrtoTileCacheKey(event.request.url)).then((cached) => cached || createMissingOrtoTileResponse())
      )))
    );
    return;
  }

  if (url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname.includes("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.method !== "GET") {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => undefined));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => {
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("./index.html").then((shell) => shell || Response.error());
        return Response.error();
      }))
  );
});

function isGeoportalOrtoWmsRequest(url) {
  return url.hostname === GEOPORTAL_ORTO_WMS_HOST && url.pathname === GEOPORTAL_ORTO_WMS_PATH;
}

function normalizeOrtoTileCacheKey(url) {
  const normalized = new URL(typeof url === "string" ? url : url.url);
  normalized.searchParams.delete("sieweczkaOffline");
  return normalized.toString();
}

async function getOfflineOrtoTileResponse(request) {
  const cacheKey = normalizeOrtoTileCacheKey(request.url);
  const cache = await caches.open(ORTO_OFFLINE_CACHE);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(request, { signal: controller.signal, cache: "no-store" });
    if (response && (response.ok || response.type === "opaque")) {
      await cache.put(cacheKey, response.clone());
      return response;
    }
    return createMissingOrtoTileResponse();
  } catch {
    return createMissingOrtoTileResponse();
  } finally {
    clearTimeout(timeout);
  }
}

function createMissingOrtoTileResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#eef2f7"/><path d="M0 0h256v256H0z" fill="#f8fafc"/><path d="M0 256 256 0M-64 192 192-64M64 320 320 64" stroke="#d7dee8" stroke-width="10"/><text x="128" y="126" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#64748b">Brak kafla offline</text><text x="128" y="146" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#64748b">dla tego miejsca</text></svg>`;
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store"
    }
  });
}
