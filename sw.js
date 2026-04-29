const CACHE_NAME = "sieweczka-clean-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./field-help.js",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

const HEIGHT_STEPPER_INJECTION = `
<script>
(() => {
  "use strict";
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
  function formatValue(value) {
    return String(Math.max(0, Math.round(value)));
  }
  function stepInput(input, delta) {
    const raw = input.value;
    const current = raw === "" || raw == null ? null : Number(raw);
    const next = current == null || Number.isNaN(current) ? (delta > 0 ? delta : 0) : Math.max(0, current + delta);
    input.value = formatValue(next);
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
    buttons.children[0].addEventListener("click", () => stepInput(input, step));
    buttons.children[1].addEventListener("click", () => stepInput(input, -step));
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
    HEIGHT_FIELDS.forEach((args) => enhanceHeightField(...args));
    setTimeout(() => HEIGHT_FIELDS.forEach((args) => enhanceHeightField(...args)), 200);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootHeightSteppers);
  else bootHeightSteppers();
})();
</script>`;

async function navigationResponse(request) {
  const cached = await caches.match("./index.html");
  let response = cached;
  try {
    response = await fetch(request);
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
  } catch (error) {
    if (!response) return new Response("Offline", { status: 503, statusText: "Offline" });
  }

  const html = await response.clone().text();
  const patched = html.includes("height-stepper-styles")
    ? html
    : html.replace("</body>", `${HEIGHT_STEPPER_INJECTION}\n</body>`);
  return new Response(patched, {
    status: response.status,
    statusText: response.statusText,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const isNavigation = event.request.mode === "navigate";

  if (isNavigation) {
    event.respondWith(navigationResponse(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => new Response("Offline", { status: 503, statusText: "Offline" }));
    })
  );
});
