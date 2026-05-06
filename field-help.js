(() => {
  "use strict";

  const HELP = {
    "nest-id": ["ID gniazda", "Unikalny kod gniazda w sezonie. Najlepiej stosować stały schemat, np. SO-2026-001 albo SR-2026-001."],
    season: ["Sezon", "Rok lub sezon badań, np. 2026. Pomaga łączyć rekordy z jednego okresu terenowego."],
    observer: ["Obserwator", "Osoba wykonująca pomiar. Wpisuj tak samo w całym projekcie, aby później kontrolować różnice między obserwatorami."],
    species: ["Gatunek", "SO = sieweczka obrożna, SR = sieweczka rzeczna. Jeśli nie ma pewności, zaznacz „Nieokreślony” i dopisz uwagę."],
    sector: ["Sektor / część wyspy", "Nazwa części wyspy, łachy lub stanowiska. Używaj tych samych nazw sektorów przez cały sezon."],
    "egg-count": ["Liczba jaj", "Liczba jaj widoczna podczas krótkiego podejścia do gniazda. Nie wydłużaj kontroli tylko po to, by doprecyzować niepewny wynik."],
    "nest-status": ["Status gniazda", "Zaznacz, czy gniazdo znaleziono podczas inkubacji, jako świeże zniesienie, czy status jest nieznany."],
    "possible-renest": ["Możliwy renest", "Zaznacz „tak”, jeśli układ sytuacji wskazuje, że może to być ponowne zniesienie po wcześniejszej stracie. W razie wątpliwości wybierz „Nie wiem”."],
    "doc-photo-done": ["Zdjęcie nad kontrolą", "Zdjęcie wykonane przy kontroli jakości rekordu. Pomaga później odtworzyć kontekst obserwacji i stanowiska."],
    "nest-one-m-photo-done": ["Zdjęcie 1 m² nad gniazdem", "Zdjęcie wykonuj pionowo z wysokości ok. 1,5 m nad gruntem, z całym kwadratem 1 × 1 m w kadrze. Dopuszczalne odchylenie wysokości: 1,4–1,6 m."],
    "random-point-done": ["Punkt losowy 10 m", "Punkt kontrolny 10 m od gniazda w losowym azymucie. Jeśli wypada w wodzie, zwartej roślinności lub poza dostępnym siedliskiem lęgowym, losuj ponownie i zapisz powód."],

    lat: ["GPS gniazda", "Współrzędne środka gniazda. Preferowany zapis z telefonu/GPS plus zdjęcie i opis, bez widocznego markera przy samym gnieździe."],
    lon: ["GPS gniazda", "Współrzędne środka gniazda. Jeśli dokładność GPS jest słaba, zapisz rekord, ale warto dodać uwagę jakościową."],
    "nest-photos": ["Zdjęcia gniazda", "Domyślnie wybieraj zdjęcia z galerii/folderu. Zdjęcie 1 m² powinno być pionowe i możliwie powtarzalne między obserwatorami."],

    "nest-substrate": ["Dominujący typ podłoża", "Wybierz klasę dominującą bez nadmiernego rozdrabniania. Liczy się porównywalność między obserwatorami bardziej niż bardzo drobna typologia."],
    "random-substrate": ["Dominujący typ podłoża", "Wybierz klasę dominującą w punkcie losowym według tych samych zasad co przy gnieździe."],
    "nest-slope": ["Nachylenie", "Szybka ocena nachylenia powierzchni przy gnieździe: płasko, lekki spadek albo wyraźny spadek."],
    "random-slope": ["Nachylenie", "Szybka ocena nachylenia powierzchni w punkcie losowym: płasko, lekki spadek albo wyraźny spadek."],
    "nest-microrelief": ["Mikrorzeźba", "Lokalna forma powierzchni: płaskie, lekkie zagłębienie, grzbiet/garb albo położenie między kamieniami."],
    "random-microrelief": ["Mikrorzeźba", "Opis lokalnej formy powierzchni w punkcie losowym, kodowany tak samo jak przy gnieździe."],

    "nest-dist-plant": ["Najbliższa roślina — odległość", "Najbliższa zakorzeniona roślina lub wyraźna kępa. Mierz od środka gniazda do najbliższej krawędzi rośliny/kępy, nie do jej środka. Nie licz luźnych źdźbeł przewianych po powierzchni."],
    "random-dist-plant": ["Najbliższa roślina — odległość", "W punkcie losowym mierz od środka punktu do najbliższej krawędzi zakorzenionej rośliny lub kępy."],
    "nest-height-plant": ["Wysokość najbliższej rośliny", "Wysokość tej samej rośliny lub kępy, której dotyczy pomiar odległości. Mierz maksymalną wysokość części nadziemnej nad poziomem podłoża, w cm."],
    "random-height-plant": ["Wysokość najbliższej rośliny", "Wysokość tej samej rośliny lub kępy przy punkcie losowym, w cm."],
    "nest-dist-object": ["Najbliższy obiekt / osłona — odległość", "Najbliższy nie-roślinny element mogący dawać osłonę, cień albo punkt orientacyjny: kamień, drewno, muszla, bryła podłoża lub element antropogeniczny. Mierz do najbliższej krawędzi obiektu."],
    "random-dist-object": ["Najbliższy obiekt / osłona — odległość", "W punkcie losowym mierz od środka punktu do najbliższej krawędzi nie-roślinnego obiektu/osłony."],
    "nest-height-object": ["Wysokość obiektu", "Wysokość najbliższego obiektu nad poziomem podłoża. Mierz w cm najwyższy punkt obiektu."],
    "random-height-object": ["Wysokość obiektu", "Wysokość najbliższego obiektu przy punkcie losowym, w cm."],

    "random-azimuth": ["Azymut punktu losowego", "Losowy kierunek od gniazda do punktu kontrolnego. Punkt powinien być oddalony o 10 m od gniazda."],
    "random-rerolled": ["Powtórne losowanie punktu", "Zaznacz „tak”, jeśli pierwszy punkt wypadł w wodzie, zwartej roślinności albo poza realnie dostępnym podłożem lęgowym."],
    "random-reroll-reason": ["Powód ponownego losowania", "Wybierz powód: woda, roślinność zwarta, poza dostępnym siedliskiem lub inne. Dzięki temu wiadomo, dlaczego punkt kontrolny nie był pierwszy z losowania."],
    "random-lat": ["GPS punktu losowego", "Współrzędne faktycznie ocenianego punktu losowego 10 m od gniazda."],
    "random-lon": ["GPS punktu losowego", "Współrzędne faktycznie ocenianego punktu losowego 10 m od gniazda."],
    "random-photos": ["Zdjęcia punktu losowego", "Domyślnie wybieraj zdjęcia z galerii/folderu. Zdjęcie 1 m² wykonuj tak samo jak nad gniazdem: pionowo, ok. 1,5 m nad gruntem."],

    "meso-assessment-method": ["Sposób oceny buforu 15 m", "Zaznacz, czy udział klas oceniono w terenie jako szybki szacunek, czy później z ortofotomapy/GIS. Preferowana jest ocena z ortofotomapy, jeśli jest dostępna."],
    "dist-water": ["Odległość do wody", "Najkrótsza odległość od gniazda do aktualnej linii wody lub brzegu czynnego zbiornika/kanału. Mierz w terenie lub później w GIS."],
    "dist-veg-edge": ["Odległość do krawędzi zwartej roślinności", "Najkrótsza odległość do początku zwartego płatu roślinności. Nie chodzi o pojedyncze źdźbło, tylko o ciągły lub prawie ciągły płat."],
    "dist-vertical-structure": ["Najbliższy wysoki obiekt", "Najbliższy wyższy element w otoczeniu, np. słupek, krzak, konstrukcja, wyższa bryła lub inna struktura mogąca wpływać na otwartość miejsca."],
    "dist-nearest-hiaticula": ["Najbliższe gniazdo sieweczki obrożnej", "Najkrótsza odległość do najbliższego znanego gniazda sieweczki obrożnej. Licz osobno dla obu gatunków, jeśli to możliwe."],
    "dist-nearest-dubius": ["Najbliższe gniazdo sieweczki rzecznej", "Najkrótsza odległość do najbliższego znanego gniazda sieweczki rzecznej. Licz osobno dla obu gatunków, jeśli to możliwe."],
    "meso-big-objects": ["Duże obiekty w 15 m", "Zaznacz, czy w buforze 15 m występują większe elementy mogące wpływać na strukturę siedliska lub widoczność: duże kamienie, drewno, infrastruktura, krzewy itp."],
    "dist-fine-gravel-patch": ["Płat drobnego żwiru", "Dodatkowy pomiar: najkrótsza odległość do wyraźnego płatu drobnego żwiru, jeśli jest istotny dla opisu miejsca."],
    "dist-coarse-gravel-patch": ["Płat grubszego żwiru", "Dodatkowy pomiar: najkrótsza odległość do wyraźnego płatu grubszego żwiru lub kamieni."],
    "meso-spatial-notes": ["Uwagi przestrzenne", "Krótki opis położenia, np. skraj łachy, środek żwirowiska, przy starorzeczu, przy ścieżce, przy grobli."],

    "qc-bird-reaction": ["Reakcja ptaków", "Oceń reakcję ptaków podczas podejścia: słaba, umiarkowana albo silna. Przy silnym niepokoju skróć pomiar do minimum."],
    "qc-time-at-nest": ["Czas przy gnieździe", "Czas bezpośredniej obecności przy gnieździe. Celem jest możliwie krótka kontrola i szybki powrót do obserwacji z dystansu."],
    "qc-aborted": ["Przerwano pomiar", "Zaznacz „tak”, jeśli przerwano pomiar z powodu niepokoju ptaków, ryzyka drapieżnictwa lub innych warunków terenowych."],
    "qc-tracks": ["Ślady drapieżnika / człowieka", "Zaznacz, czy widoczne były ślady mogące mieć znaczenie dla ryzyka lęgu. Szczegóły wpisz w opisie śladów."],
    "qc-tracks-notes": ["Opis śladów", "Krótko opisz rodzaj śladów, np. tropy ssaka, ślady człowieka, opony, rozkopanie, odpady, obecność psa."],
    notes: ["Uwagi dodatkowe", "Miejsce na informacje, których nie da się jednoznacznie zakodować w polach formularza. Zapisz też pomiary wykonane „na oko”."],
  };

  const PERCENT_HELP = {
    "nest-pct-sand": ["Piasek", "Luźne, drobnoziarniste podłoże mineralne. Wpisuj jako piasek, gdy klasa wizualnie dominuje lub tworzy ciągłe płaty."],
    "random-pct-sand": ["Piasek", "Luźne, drobnoziarniste podłoże mineralne. Stosuj tę samą definicję co przy gnieździe."],
    "pct-sand": ["Piasek w buforze 15 m", "Łączny udział otwartych piaszczystych powierzchni w promieniu 15 m."],
    "nest-pct-fine-gravel": ["Drobny żwir", "Drobne kamienie i otoczaki większe od piasku, ale nadal drobne; powierzchnia wygląda ziarnisto, bez dominacji dużych kamieni."],
    "random-pct-fine-gravel": ["Drobny żwir", "Drobne kamienie i otoczaki większe od piasku; koduj tak samo jak przy gnieździe."],
    "nest-pct-coarse": ["Gruby żwir / kamienie", "Grubsze kamienie, otoczaki i większe frakcje mineralne widoczne pojedynczo lub w skupieniach."],
    "random-pct-coarse": ["Gruby żwir / kamienie", "Grubsze kamienie, otoczaki i większe frakcje mineralne w punkcie losowym."],
    "pct-fine-gravel": ["Żwir w buforze", "Drobny lub średni materiał żwirowy bez dominacji dużych kamieni. Koduj tu powierzchnie żwirowe, które nie są wyraźnie kamieniste."],
    "pct-gravel": ["Kamienie w buforze", "Większe kamienie, otoczaki i grubszy materiał kamienisty. Dawna kategoria „Żwir / kamienie” jest traktowana jako kamienie, żeby stare dane pozostały czytelne."],
    "nest-pct-shells": ["Muszle", "Fragmenty muszli, skorup lub wyraźne nagromadzenia materiału muszlowego. Koduj osobno tylko, gdy są dobrze widoczne."],
    "random-pct-shells": ["Muszle", "Fragmenty muszli lub skorup w kwadracie 1 m² punktu losowego."],
    "nest-pct-live-veg": ["Roślinność żywa", "Zielone, żywe części roślin w obrębie kwadratu. Oceniaj procent powierzchni zakrytej rzutem roślin, nie liczbę pędów."],
    "random-pct-live-veg": ["Roślinność żywa", "Zielone, żywe części roślin w kwadracie 1 m² punktu losowego."],
    "nest-pct-dry-veg": ["Roślinność sucha", "Suche łodygi, martwe części roślin, zeszłoroczne pędy lub sucha darń. Nie łącz z roślinnością żywą."],
    "random-pct-dry-veg": ["Roślinność sucha", "Suche lub martwe części roślin w kwadracie 1 m² punktu losowego."],
    "pct-vegetation": ["Roślinność w buforze", "Łączny udział płatów roślinności, żywej i suchej, jeśli są widoczne jako strukturalne płaty. Tu ważna jest otwartość siedliska."],
    "nest-pct-organic": ["Drewno / szczątki", "Patyki, gałązki, wyrzucone szczątki roślinne, glony lub detrytus organiczny. Koduj, gdy stanowią widoczny element powierzchni."],
    "random-pct-organic": ["Drewno / szczątki", "Patyki, gałązki, detrytus lub inne szczątki organiczne w punkcie losowym."],
    "nest-pct-anthro": ["Antropogeniczne", "Szkło, plastik, metal, beton, sznurki, odpady budowlane lub fragmenty infrastruktury. Każdy nienaturalny element zaliczaj do tej klasy."],
    "random-pct-anthro": ["Antropogeniczne", "Nienaturalne elementy w kwadracie punktu losowego: szkło, plastik, metal, beton, sznurki itd."],
    "pct-water": ["Woda / podmokłość", "Otwarta woda, mokry brzeg lub stale zabagnione fragmenty powierzchni w promieniu 15 m."],
    "pct-other": ["Muszle w buforze", "Pokrycie muszlami lub fragmentami muszli. Dawna kategoria „Inne” w mezohabitacie jest pokazywana jako muszle, żeby stare dane pozostały czytelne."],
  };

  const GROUP_HELP = {
    nest: ["Pokrycie w kwadracie 1 m²", "Udział powierzchni zajmowany przez każdą klasę w kwadracie fotograficznym 1 × 1 m. Najlepiej zapisywać w procentach; drobne odchylenie sumy około ±5% jest akceptowalne."],
    random: ["Pokrycie w kwadracie 1 m²", "Opis punktu losowego wykonuj tymi samymi klasami i zasadami co opis gniazda, aby porównanie było powtarzalne."],
    meso: ["Bufor 15 m", "Koło o promieniu 15 m wokół gniazda. Suma procentów dla piasku, żwiru, kamieni, roślinności, wody/podmokłości i muszli powinna wynosić 100%."],
  };

  let deferredInstallPrompt = null;

  function injectUiStyles() {
    if (document.getElementById("field-help-ui-overrides")) return;
    const style = document.createElement("style");
    style.id = "field-help-ui-overrides";
    style.textContent = `
      .help-label-line{display:inline-flex;align-items:center;gap:.35rem;width:max-content;max-width:100%;}
      label>.help-label-line{font-weight:760;}
      .field-label .help-bubble-btn,.percent-group h3 .help-bubble-btn,label span .help-bubble-btn{margin-left:.35rem;}
      .help-bubble-btn{flex:0 0 auto;vertical-align:middle;}
      .photo-choice-grid{display:grid;gap:.55rem;margin:.6rem 0 1rem;}
      .photo-choice-grid .photo-input{margin:0;}
      .photo-choice-grid .photo-camera-input{border-style:solid;background:#fff;}
      .install-helper-card{position:fixed;inset:0;z-index:1100;background:rgba(15,23,42,.55);display:grid;place-items:end center;padding:1rem;}
      .install-helper-card[hidden]{display:none!important;}
      .install-helper-card>div{width:min(680px,100%);background:#fff;border:2px solid var(--primary);border-radius:18px;padding:1rem;color:var(--text);box-shadow:0 18px 50px rgba(0,0,0,.25);}
      .install-helper-card h3{margin-top:0;}
      .install-helper-card ol{padding-left:1.25rem;}
      .install-helper-card li{margin:.35rem 0;}
    `;
    document.head.appendChild(style);
  }

  function makeButton(title, body) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "help-bubble-btn";
    btn.setAttribute("aria-label", `Wyjaśnienie: ${title}`);
    btn.dataset.helpTitle = title;
    btn.dataset.helpBody = body;
    btn.textContent = "?";
    return btn;
  }

  function labelTitleText(label, fallback) {
    for (const node of Array.from(label.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return node.textContent.trim();
      if (node.nodeType === Node.ELEMENT_NODE && node.matches("span:not(.help-label-line)")) return node.textContent.trim();
    }
    return fallback;
  }

  function addHelpNearElement(element, title, body) {
    if (!element || element.querySelector?.(".help-bubble-btn")) return;
    const btn = makeButton(title, body);

    if (element.tagName === "LABEL") {
      const existingSpan = Array.from(element.children).find((child) => child.tagName === "SPAN" && !child.classList.contains("help-label-line"));
      if (existingSpan) {
        existingSpan.appendChild(btn);
        return;
      }
      const firstText = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      const line = document.createElement("span");
      line.className = "help-label-line";
      line.textContent = labelTitleText(element, title);
      line.appendChild(btn);
      if (firstText) firstText.remove();
      element.prepend(line);
      return;
    }

    element.appendChild(btn);
  }

  function addHelpForControl(id, entry) {
    const [title, body] = entry;
    const input = document.getElementById(id);
    const tileGroup = document.querySelector(`.tile-group[data-target="${CSS.escape(id)}"]`);
    const label = input?.closest("label");
    const fieldBlockLabel = tileGroup?.closest(".field-block")?.querySelector(".field-label");
    if (fieldBlockLabel) addHelpNearElement(fieldBlockLabel, title, body);
    else if (label) addHelpNearElement(label, title, body);
  }

  function addPercentHelp(id, entry) {
    const [title, body] = entry;
    const input = document.getElementById(id);
    const label = input?.closest("label");
    const span = label?.querySelector("span");
    if (span) addHelpNearElement(span, title, body);
  }

  function addGroupHelp() {
    Object.entries(GROUP_HELP).forEach(([group, [title, body]]) => {
      const heading = document.querySelector(`.percent-group[data-group="${group}"] h3`);
      addHelpNearElement(heading, title, body);
    });
  }

  function ensureHelpPanel() {
    if (document.getElementById("field-help-panel")) return;
    const panel = document.createElement("div");
    panel.id = "field-help-panel";
    panel.className = "field-help-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="field-help-card" role="dialog" aria-modal="true" aria-labelledby="field-help-title">
        <button type="button" class="field-help-close" aria-label="Zamknij wyjaśnienie">×</button>
        <h3 id="field-help-title"></h3>
        <p id="field-help-body"></p>
      </div>
    `;
    document.body.appendChild(panel);
    panel.addEventListener("click", (event) => {
      if (event.target === panel || event.target.closest(".field-help-close")) closeHelp();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeHelp();
    });
  }

  function openHelp(title, body) {
    ensureHelpPanel();
    document.getElementById("field-help-title").textContent = title;
    document.getElementById("field-help-body").textContent = body;
    const panel = document.getElementById("field-help-panel");
    panel.hidden = false;
    panel.querySelector(".field-help-close")?.focus();
  }

  function closeHelp() {
    const panel = document.getElementById("field-help-panel");
    if (panel) panel.hidden = true;
  }

  function installHelp() {
    injectUiStyles();
    ensureHelpPanel();
    Object.entries(HELP).forEach(([id, entry]) => addHelpForControl(id, entry));
    Object.entries(PERCENT_HELP).forEach(([id, entry]) => addPercentHelp(id, entry));
    addGroupHelp();
  }

  function createInstallInstructions() {
    if (document.getElementById("install-helper-card")) return;
    const panel = document.createElement("div");
    panel.id = "install-helper-card";
    panel.className = "install-helper-card";
    panel.hidden = true;
    panel.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="install-helper-title">
        <h3 id="install-helper-title">Instalacja aplikacji</h3>
        <p>Ta strona działa jako aplikacja PWA. Możesz dodać ją do ekranu głównego telefonu albo pulpitu komputera.</p>
        <ol>
          <li><strong>Android / Chrome:</strong> menu ⋮ → „Zainstaluj aplikację” albo „Dodaj do ekranu głównego”.</li>
          <li><strong>iPhone / Safari:</strong> przycisk Udostępnij → „Dodaj do ekranu początkowego”.</li>
          <li><strong>Komputer / Chrome lub Edge:</strong> ikona instalacji w pasku adresu albo menu ⋮ → „Zainstaluj”.</li>
        </ol>
        <button type="button" id="install-helper-close">Zamknij</button>
      </div>
    `;
    document.body.appendChild(panel);
    panel.addEventListener("click", (event) => {
      if (event.target === panel || event.target.id === "install-helper-close") panel.hidden = true;
    });
  }

  function setupInstallButton() {
    createInstallInstructions();
    const actions = document.querySelector(".home-actions");
    if (!actions || document.getElementById("install-pwa-button")) return;
    const btn = document.createElement("button");
    btn.id = "install-pwa-button";
    btn.type = "button";
    btn.className = "big";
    btn.textContent = "Zainstaluj aplikację na telefonie/pulpicie";
    actions.insertBefore(btn, actions.children[1] || null);

    const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const update = () => {
      if (isStandalone()) {
        btn.textContent = "Aplikacja jest już zainstalowana";
        btn.disabled = true;
      } else if (deferredInstallPrompt) {
        btn.textContent = "Zainstaluj aplikację";
        btn.disabled = false;
      } else {
        btn.textContent = "Jak zainstalować aplikację?";
        btn.disabled = false;
      }
    };

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      update();
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      update();
    });
    btn.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice.catch(() => null);
        deferredInstallPrompt = null;
        update();
        return;
      }
      const panel = document.getElementById("install-helper-card");
      if (panel) panel.hidden = false;
    });
    update();
  }

  function mergeFilesIntoPrimary(primaryInput, extraInput) {
    const extraFiles = Array.from(extraInput.files || []);
    if (!extraFiles.length) return;
    try {
      const dt = new DataTransfer();
      Array.from(primaryInput.files || []).forEach((file) => dt.items.add(file));
      extraFiles.forEach((file) => dt.items.add(file));
      primaryInput.files = dt.files;
      primaryInput.dispatchEvent(new Event("change", { bubbles: true }));
      extraInput.value = "";
    } catch (error) {
      alert("Nie udało się automatycznie dołączyć zdjęcia z aparatu. Użyj przycisku wyboru z galerii/folderu i wybierz zdjęcie zapisane przez aparat.");
      console.error(error);
    }
  }

  function enhancePhotoInput(inputId, galleryText, cameraText) {
    const primary = document.getElementById(inputId);
    if (!primary || primary.dataset.sourceEnhanced === "1") return;
    primary.dataset.sourceEnhanced = "1";
    primary.removeAttribute("capture");
    primary.setAttribute("multiple", "");
    const label = primary.closest("label");
    if (!label) return;
    label.querySelector("span") && (label.querySelector("span").textContent = galleryText);

    const wrap = document.createElement("div");
    wrap.className = "photo-choice-grid";
    label.parentNode.insertBefore(wrap, label);
    wrap.appendChild(label);

    const cameraLabel = document.createElement("label");
    cameraLabel.className = "photo-input photo-camera-input";
    cameraLabel.innerHTML = `<span>${cameraText}</span><input id="${inputId}-camera" type="file" accept="image/*" capture="environment" multiple />`;
    wrap.appendChild(cameraLabel);
    cameraLabel.querySelector("input").addEventListener("change", (event) => mergeFilesIntoPrimary(primary, event.target));
  }

  function setupPhotoChoices() {
    enhancePhotoInput("nest-photos", "+ Wybierz zdjęcie gniazda z galerii/folderu", "📷 Zrób zdjęcie gniazda aparatem");
    enhancePhotoInput("random-photos", "+ Wybierz zdjęcie punktu losowego z galerii/folderu", "📷 Zrób zdjęcie punktu losowego aparatem");
  }

  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".help-bubble-btn");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    openHelp(btn.dataset.helpTitle, btn.dataset.helpBody);
  });

  function boot() {
    installHelp();
    setupInstallButton();
    setupPhotoChoices();
    setTimeout(installHelp, 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
