(() => {
  "use strict";

  const STORAGE_KEY = "pt-versatiles-overlay-v1";
  const PANE_NAME = "fa-versatiles-overlay-pane";
  const STYLE_ID = "fa-versatiles-overlay-style";
  const WATER_LABEL_PANE_NAME = "fa-water-label-pane";
  const WATER_LABELS = [
    ["North Pacific Ocean", 25.000, -155.000, 1],
    ["South Pacific Ocean", -25.000, -125.000, 1],
    ["North Atlantic Ocean", 28.000, -42.000, 1],
    ["South Atlantic Ocean", -27.000, -20.000, 1],
    ["Indian Ocean", -20.000, 80.000, 1],
    ["Arctic Ocean", 82.000, 0.000, 1],
    ["Southern Ocean", -62.000, 30.000, 1],
    ["Mediterranean Sea", 35.000, 18.000, 2],
    ["Caribbean Sea", 15.000, -75.000, 2],
    ["Gulf of Mexico", 24.000, -90.000, 2],
    ["Arabian Sea", 13.335, 63.994, 2],
    ["Bay of Bengal", 13.000, 88.000, 2],
    ["South China Sea", 13.000, 114.000, 2],
    ["Philippine Sea", 20.000, 132.000, 2],
    ["Coral Sea", -18.000, 154.000, 2],
    ["Tasman Sea", -39.000, 160.000, 2],
    ["Sea of Japan", 40.000, 135.000, 2],
    ["Bering Sea", 57.000, -177.000, 2],
    ["Sea of Okhotsk", 53.000, 150.000, 2],
    ["Black Sea", 43.000, 35.000, 2],
    ["Caspian Sea", 41.000, 51.000, 2],
    ["Red Sea", 20.316, 38.735, 2],
    ["(Arabian Gulf)", 26.700, 52.000, 2],
    ["Gulf of Oman", 24.700, 59.000, 3],
    ["Gulf of Aden", 12.500, 47.500, 3],
    ["Baltic Sea", 58.000, 20.000, 2],
    ["North Sea", 56.000, 3.000, 2],
    ["Norwegian Sea", 67.000, 4.000, 2],
    ["Greenland Sea", 75.000, -5.000, 3],
    ["Labrador Sea", 58.000, -53.000, 2],
    ["Hudson Bay", 59.000, -85.000, 2],
    ["Baffin Bay", 70.000, -66.000, 2],
    ["Beaufort Sea", 72.000, -140.000, 2],
    ["Barents Sea", 75.000, 38.000, 3],
    ["Kara Sea", 75.000, 70.000, 3],
    ["Laptev Sea", 76.000, 125.000, 3],
    ["East Siberian Sea", 73.000, 160.000, 3],
    ["Chukchi Sea", 69.000, -172.000, 3],
    ["Aegean Sea", 38.500, 25.000, 3],
    ["Adriatic Sea", 43.000, 15.000, 3],
    ["Ionian Sea", 37.000, 19.000, 3],
    ["Tyrrhenian Sea", 40.000, 12.000, 3],
    ["Andaman Sea", 10.000, 96.000, 3],
    ["Java Sea", -5.000, 112.000, 3],
    ["Timor Sea", -11.000, 127.000, 3],
    ["Arafura Sea", -10.000, 136.000, 3],
    ["Gulf of Carpentaria", -15.000, 139.000, 3],
    ["Gulf of Alaska", 57.000, -145.000, 2],
    ["Gulf of California", 27.000, -111.000, 3],
    ["Celtic Sea", 49.000, -8.000, 3],
    ["Irish Sea", 53.500, -5.000, 3],
    ["English Channel", 50.000, -2.000, 3],
    ["Mozambique Channel", -18.000, 41.000, 3],
    ["Scotia Sea", -57.500, -45.000, 3],
    ["Ross Sea", -75.000, 175.000, 3],
    ["Weddell Sea", -72.000, -40.000, 3]
  ];

  const WATER_LABEL_AR = Object.freeze({
    "North Pacific Ocean": "شمال المحيط الهادئ",
    "South Pacific Ocean": "جنوب المحيط الهادئ",
    "North Atlantic Ocean": "شمال المحيط الأطلسي",
    "South Atlantic Ocean": "جنوب المحيط الأطلسي",
    "Indian Ocean": "المحيط الهندي",
    "Arctic Ocean": "المحيط المتجمد الشمالي",
    "Southern Ocean": "المحيط الجنوبي",
    "Mediterranean Sea": "البحر الأبيض المتوسط",
    "Caribbean Sea": "البحر الكاريبي",
    "Gulf of Mexico": "خليج المكسيك",
    "Arabian Sea": "بحر العرب",
    "Bay of Bengal": "خليج البنغال",
    "South China Sea": "بحر الصين الجنوبي",
    "Philippine Sea": "بحر الفلبين",
    "Coral Sea": "بحر المرجان",
    "Tasman Sea": "بحر تسمان",
    "Sea of Japan": "بحر اليابان",
    "Bering Sea": "بحر بيرنغ",
    "Sea of Okhotsk": "بحر أوخوتسك",
    "Black Sea": "البحر الأسود",
    "Caspian Sea": "بحر قزوين",
    "Red Sea": "البحر الأحمر",
    "Arabian Gulf": "الخليج العربي",
    "Gulf of Oman": "خليج عمان",
    "Gulf of Aden": "خليج عدن",
    "Baltic Sea": "بحر البلطيق",
    "North Sea": "بحر الشمال",
    "Norwegian Sea": "البحر النرويجي",
    "Greenland Sea": "بحر غرينلاند",
    "Labrador Sea": "بحر لابرادور",
    "Hudson Bay": "خليج هدسون",
    "Baffin Bay": "خليج بافن",
    "Beaufort Sea": "بحر بوفورت",
    "Barents Sea": "بحر بارنتس",
    "Kara Sea": "بحر كارا",
    "Laptev Sea": "بحر لابتيف",
    "East Siberian Sea": "بحر سيبيريا الشرقي",
    "Chukchi Sea": "بحر تشوكشي",
    "Aegean Sea": "بحر إيجه",
    "Adriatic Sea": "البحر الأدرياتيكي",
    "Ionian Sea": "البحر الأيوني",
    "Tyrrhenian Sea": "البحر التيراني",
    "Andaman Sea": "بحر أندامان",
    "Java Sea": "بحر جاوة",
    "Timor Sea": "بحر تيمور",
    "Arafura Sea": "بحر أرافورا",
    "Gulf of Carpentaria": "خليج كاربنتاريا",
    "Gulf of Alaska": "خليج ألاسكا",
    "Gulf of California": "خليج كاليفورنيا",
    "Celtic Sea": "البحر السلتي",
    "Irish Sea": "البحر الأيرلندي",
    "English Channel": "بحر المانش",
    "Mozambique Channel": "قناة موزمبيق",
    "Scotia Sea": "بحر سكوتيا",
    "Ross Sea": "بحر روس",
    "Weddell Sea": "بحر ويديل"
  });

  const SOURCES = [
    {
      id: "versatiles",
      label: "VersaTiles / Shortbread",
      short: "VT",
      kind: "vector",
      schema: "shortbread",
      url: "https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}",
      maxDataZoom: 14,
      attribution: `&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> | <a href="https://versatiles.org/" target="_blank" rel="noopener">VersaTiles</a>`,
      note: "Shortbread vector reference overlay."
    }
  ];

  const DEFAULTS = {
    source: "versatiles",
    enabled: true,
    labels: true,
    waterLabels: true,
    roads: true,
    roadLabels: true,
    borders: false,
    preferEnglish: true,
    uppercaseCountries: true,
    strictCountryLabels: true,
    fontFamily: "Roboto",
    labelScale: 0.8,
    countryWeight: 800,
    stateWeight: 500,
    cityWeight: 500,
    roadWeight: 400,
    labelColor: "#ffffff",
    haloColor: "#111111",
    haloWidth: 0,
    roadColor: "#ffd166",
    roadWidth: 0.5,
    borderColor: "#ffd166",
    borderWidth: 1,
    opacity: 0.90
  };

  let settings = loadSettings();
  let map = null;
  let layer = null;
  let waterLabelLayer = null;
  let WaterLabelMarkerClass = null;
  let panel = null;
  let status = null;
  let rebuildTimer = null;
  let satelliteActive = false;
  let temporarilyHidden = false;
  let temporaryFadeCleanupTimer = null;

  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {...DEFAULTS, ...(parsed && typeof parsed === "object" ? parsed : {})};
    } catch {
      return {...DEFAULTS};
    }
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  }

  function currentSource() {
    return SOURCES.find(source => source.id === settings.source) || SOURCES[0];
  }


  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }


  function setStatus(text, error = false, detail = "") {
    if (!status) return;
    status.textContent = text || "Ready";
    status.classList.toggle("error", Boolean(error));
    status.title = detail || "";
  }

  function notify(message, tone = "info") {
    window.FAOverpassHost?.toast?.(message, tone);
  }

  function ensurePane() {
    if (!map) return;
    let pane = map.getPane(PANE_NAME);
    if (!pane) pane = map.createPane(PANE_NAME, map._rotatePane || map.getPane("overlayPane"));
    pane.style.zIndex = "425";
    pane.style.pointerEvents = "none";
    pane.style.transition = "opacity 180ms ease";
    if (!pane.style.opacity) pane.style.opacity = "1";
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @font-face { font-family: "Roboto"; font-style: normal; font-display: swap; font-weight: 100 900; src: url("fonts/roboto-latin.woff2") format("woff2"); }
      .satellite-brightness-popup.versatiles-host { width:320px; max-height:calc(100vh - 100px); overflow-y:auto; }
      .versatiles-overlay-control { margin-top:8px; padding-top:7px; border-top:1px solid var(--border); }
      .versatiles-overlay-master { margin:0; color:#cbd0d6; font-size:10px; }
      .versatiles-settings { margin-top:6px; }
      .versatiles-section { padding:7px 0; border-top:1px solid rgba(255,255,255,.07); }
      .versatiles-section:first-child { border-top:0; padding-top:2px; }
      .versatiles-section-title { margin:0 0 6px; color:var(--muted); font-size:9px; font-weight:700; letter-spacing:.035em; text-transform:uppercase; }
      .versatiles-checks { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; }
      .versatiles-checks .check-line { min-width:0; margin:0; color:#cbd0d6; font-size:10px; white-space:nowrap; }
      .versatiles-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:7px 8px; }
      .versatiles-field { display:grid; gap:4px; min-width:0; color:var(--muted); font-size:9px; }
      .versatiles-field.full { grid-column:1 / -1; }
      .versatiles-field > span:first-child { font-weight:600; }
      .versatiles-field input[type="text"], .versatiles-field select { width:100%; min-width:0; }
      .versatiles-color-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .versatiles-color { width:100% !important; height:24px; padding:1px !important; }
      .versatiles-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:7px; }
      .versatiles-actions button { width:auto; padding:2px 6px !important; font-size:9px !important; }
      .versatiles-status { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); font-size:9px; text-align:right; }
      .versatiles-status.error { color:#ff8f8f; }
      .fa-water-label-icon { background:transparent !important; border:0 !important; pointer-events:none !important; }
      .fa-water-label-text { position:absolute; left:0; top:0; transform:translate(-50%,-50%); white-space:nowrap; line-height:1; display:inline-block; text-align:center; font-style:italic; user-select:none; pointer-events:none; }
      .fa-water-label-priority-1 { letter-spacing:.12em; text-transform:uppercase; }
      .fa-water-label-priority-2 { letter-spacing:.06em; }
      .fa-water-label-priority-3 { letter-spacing:.03em; }
      .fa-water-label-text[dir="rtl"] { direction:rtl; unicode-bidi:isolate; letter-spacing:0; text-transform:none; }
    `;
    document.head.appendChild(style);
  }

  function layerOptions(source) {
    return {
      pane: PANE_NAME,
      attribution: source.attribution,
      maxNativeZoom: source.maxNativeZoom || 14,
      maxZoom: 22,
      opacity: clamp(settings.opacity, 0, 1),
      updateWhenIdle: false,
      updateWhenZooming: true,
      keepBuffer: 3
    };
  }

  function preferredNames(schema) {
    if (schema === "shortbread") {
      return settings.preferEnglish ? ["name_en", "name"] : ["name", "name_en"];
    }
    return settings.preferEnglish ? ["name:en", "name_en", "name"] : ["name", "name:en", "name_en"];
  }

  function loadMapFont(family) {
    if (!family || family === "system-ui" || !document.fonts?.load) return Promise.resolve();
    return document.fonts.load(`400 16px "${String(family).replace(/"/g, "")}"`).then(() => undefined).catch(error => void 0);
  }

  function font(weight, size) {
    const scaled = Math.max(7, Number(size) * clamp(settings.labelScale, 0.5, 2));
    return `${Math.round(Number(weight) || 400)} ${Math.round(scaled * 10) / 10}px ${settings.fontFamily || "Roboto"}`;
  }

  function waterLabelZoomRange(priority) {
    if (priority === 1) return [2, 6.5];
    if (priority === 2) return [3, 8.5];
    return [4, 10.5];
  }

  function waterLabelsEffectiveEnabled() {
    const effectiveEnabled = temporarilyHidden ? !settings.enabled : settings.enabled;
    return Boolean(effectiveEnabled && satelliteActive && settings.labels && settings.waterLabels);
  }

  function ensureWaterLabelPane() {
    if (!map) return null;
    let pane = map.getPane(WATER_LABEL_PANE_NAME);
    if (!pane) pane = map.createPane(WATER_LABEL_PANE_NAME, map._norotatePane || map._mapPane);
    const noRotatePane = map._norotatePane || map._mapPane;
    if (noRotatePane && pane.parentNode !== noRotatePane) noRotatePane.appendChild(pane);
    pane.style.transform = "none";
    pane.style.zIndex = "425";
    pane.style.pointerEvents = "none";
    pane.style.transition = "opacity 180ms ease";
    return pane;
  }

  function removeWaterLabels() {
    if (!waterLabelLayer || !map) { waterLabelLayer = null; return; }
    try { map.removeLayer(waterLabelLayer); } catch {}
    waterLabelLayer = null;
  }

  function styleWaterLabelMarker(marker, priority) {
    const text = marker.getElement()?.querySelector(".fa-water-label-text");
    if (!text) return;
    const baseSize = priority === 1 ? 12 : priority === 2 ? 11 : 9.5;
    const halo = clamp(settings.haloWidth, 0, 8);
    text.style.fontFamily = settings.fontFamily || "Roboto";
    text.style.fontSize = `${Math.round(baseSize * clamp(settings.labelScale, 0.5, 2) * 10) / 10}px`;
    text.style.fontWeight = priority === 1 ? "600" : "500";
    text.style.color = settings.labelColor;
    text.style.textShadow = halo > 0
      ? `0 0 ${Math.max(1, halo)}px ${settings.haloColor}, 0 0 ${Math.max(1, halo * 0.6)}px ${settings.haloColor}`
      : "none";
  }

  function createWaterLabelMarker(latlng, options) {
    if (!WaterLabelMarkerClass) {
      WaterLabelMarkerClass = L.Marker.extend({
        _setPos(point) {
          L.Marker.prototype._setPos.call(this, point);
          if (!this._map || !this._icon) return;
          const position = L.DomUtil.getPosition(this._icon);
          if (!position) return;
          const bearing = Number(this._map.getBearing?.() ?? this._map._bearing) || 0;
          L.DomUtil.setPosition(this._icon, position, bearing * Math.PI / 180);
        }
      });
    }
    return new WaterLabelMarkerClass(latlng, options);
  }

  function refreshWaterLabels() {
    removeWaterLabels();
    if (!map || !waterLabelsEffectiveEnabled()) return;
    const pane = ensureWaterLabelPane();
    const zoom = map.getZoom();
    const markers = WATER_LABELS
      .filter(([, , , priority]) => {
        const [minZoom, maxZoom] = waterLabelZoomRange(priority);
        return zoom >= minZoom && zoom <= maxZoom;
      })
      .map(([name, lat, lng, priority]) => {
        const arabic = !settings.preferEnglish && WATER_LABEL_AR[name];
        const displayName = arabic || name;
        const language = arabic ? ' lang="ar" dir="rtl"' : "";
        const marker = createWaterLabelMarker([lat, lng], {
          pane: WATER_LABEL_PANE_NAME,
          rotateWithView: false,
          rotation: 0,
          interactive: false,
          keyboard: false,
          zIndexOffset: -1000,
          icon: L.divIcon({
            className: "fa-water-label-icon",
            html: `<span class="fa-water-label-text fa-water-label-priority-${priority}"${language}>${displayName}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
          })
        });
        marker.on("add", () => styleWaterLabelMarker(marker, priority));
        return marker;
      });
    waterLabelLayer = L.layerGroup(markers).addTo(map);
    if (pane) pane.style.opacity = String(clamp(settings.opacity, 0, 1));
  }

  function propertyNumber(feature, key, fallback = 0) {
    const value = feature?.props?.[key];
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function propertyString(feature, key) {
    const value = feature?.props?.[key];
    return typeof value === "string" ? value : value == null ? "" : String(value);
  }


  function looksLikeNonCountryBoundaryLabel(feature) {
    const values = [propertyString(feature, "name"), propertyString(feature, "name_en")].filter(Boolean);
    const allowed = /^(?:Marshall Islands|Solomon Islands|Cook Islands|Faroe Islands|Falkland Islands|Cayman Islands|British Virgin Islands|United States Virgin Islands|US Virgin Islands|Turks and Caicos Islands|Northern Mariana Islands|Aland Islands|Åland Islands|Cocos [(]Keeling[)] Islands|Heard Island and McDonald Islands|Christmas Island|Norfolk Island)$/i;
    const blocked = /(?:border|boundary|maritime|territorial waters?|exclusive economic zone|eez|demarcation|armistice|ceasefire|buffer zone|neutral zone|disputed|islands?|islets?|archipelago)/i;
    return values.some(value => blocked.test(value) && !allowed.test(value.trim()));
  }


  function openMapTilesRoadWidth(z, feature) {
    const cls = propertyString(feature, "class");
    const multiplier = cls === "motorway" ? 2.4 : cls === "trunk" ? 2.1 : cls === "primary" ? 1.8 : cls === "secondary" ? 1.5 : cls === "tertiary" ? 1.25 : cls === "minor" ? 0.9 : cls === "service" ? 0.65 : 0.55;
    const zoomFactor = z < 8 ? 0.55 : z < 12 ? 0.8 : z < 15 ? 1 : 1.3;
    return Math.max(0.35, multiplier * zoomFactor * clamp(settings.roadWidth, 0.25, 3));
  }

  function shortbreadRoadWidth(z, feature) {
    const kind = propertyString(feature, "kind");
    const multiplier = /motorway/.test(kind) ? 2.4 : /trunk/.test(kind) ? 2.1 : /primary/.test(kind) ? 1.8 : /secondary/.test(kind) ? 1.5 : /tertiary/.test(kind) ? 1.25 : /residential|unclassified/.test(kind) ? 0.9 : /service/.test(kind) ? 0.65 : 0.55;
    const zoomFactor = z < 8 ? 0.55 : z < 12 ? 0.8 : z < 15 ? 1 : 1.3;
    return Math.max(0.35, multiplier * zoomFactor * clamp(settings.roadWidth, 0.25, 3));
  }

  function labelNeedsRtlShaping(feature, names) {
    const name = names.map(key => feature?.props?.[key]).find(value => typeof value === "string" && value.trim());
    return /[\u0590-\u08FF\uFB1D-\uFEFF]/u.test(name || "");
  }

  function vectorRules(source) {
    if (!window.protomapsL) throw new Error("protomaps-leaflet is not loaded.");
    const P = window.protomapsL;
    const names = preferredNames(source.schema);
    const paintRules = [];
    const labelRules = [];

    if (source.schema === "openmaptiles") {
      if (settings.roads) {
        paintRules.push({
          dataLayer: "transportation",
          minzoom: 4,
          symbolizer: new P.LineSymbolizer({color: settings.roadColor, width: openMapTilesRoadWidth}),
          filter: (z, feature) => {
            const cls = propertyString(feature, "class");
            return !["rail", "transit", "ferry", "aerialway"].includes(cls);
          }
        });
      }
      if (settings.borders) {
        paintRules.push({
          dataLayer: "boundary",
          symbolizer: new P.LineSymbolizer({
            color: settings.borderColor,
            width: (z, feature) => (propertyNumber(feature, "admin_level", 99) <= 2 ? 1.6 : 0.8) * clamp(settings.borderWidth, 0.25, 3)
          }),
          filter: (z, feature) => propertyNumber(feature, "admin_level", 99) <= 4
        });
      }
      if (settings.labels) {
        labelRules.push({
          dataLayer: "place",
          minzoom: 2,
          symbolizer: new P.CenteredTextSymbolizer({
            labelProps: names,
            fill: settings.labelColor,
            stroke: settings.haloColor,
            width: clamp(settings.haloWidth, 0, 8),
            lineHeight: 1.2,
            letterSpacing: (z, feature) => labelNeedsRtlShaping(feature, names) ? 0 : 0.8 + 4.0 * clamp((z - 4) / 4, 0, 1),
            font: () => font(settings.countryWeight, 16),
            textTransform: settings.uppercaseCountries ? "uppercase" : undefined
          }),
          filter: (z, feature) => propertyString(feature, "class") === "country"
        });
        labelRules.push({
          dataLayer: "place",
          minzoom: 4,
          symbolizer: new P.CenteredTextSymbolizer({
            labelProps: names,
            fill: settings.labelColor,
            stroke: settings.haloColor,
            width: clamp(settings.haloWidth, 0, 8),
            lineHeight: 1.2,
            font: () => font(settings.stateWeight, 12)
          }),
          filter: (z, feature) => ["state", "province", "region"].includes(propertyString(feature, "class"))
        });
        labelRules.push({
          dataLayer: "place",
          minzoom: 4,
          symbolizer: new P.CenteredTextSymbolizer({
            labelProps: names,
            fill: settings.labelColor,
            stroke: settings.haloColor,
            width: clamp(settings.haloWidth, 0, 8),
            lineHeight: 1.2,
            font: (z, feature) => {
              const cls = propertyString(feature, "class");
              const rank = propertyNumber(feature, "rank", 99);
              const base = cls === "city" ? (rank <= 4 ? 14 : 12.5) : cls === "town" ? 11.5 : 10.5;
              return font(settings.cityWeight, base);
            }
          }),
          filter: (z, feature) => ["city", "town", "village", "capital"].includes(propertyString(feature, "class"))
        });
      }
      if (settings.labels && settings.roadLabels) {
        labelRules.push({
          dataLayer: "transportation_name",
          minzoom: 10,
          symbolizer: new P.LineLabelSymbolizer({
            labelProps: names,
            fill: settings.labelColor,
            stroke: settings.haloColor,
            width: clamp(settings.haloWidth, 0, 8),
            font: () => font(settings.roadWeight, 11)
          })
        });
      }
    } else {
      if (settings.roads) {
        paintRules.push({
          dataLayer: "streets",
          minzoom: 5,
          symbolizer: new P.LineSymbolizer({color: settings.roadColor, width: shortbreadRoadWidth}),
          filter: (z, feature) => !Boolean(feature?.props?.rail) && !["rail", "tram", "subway"].includes(propertyString(feature, "kind"))
        });
      }
      if (settings.borders) {
        paintRules.push({
          dataLayer: "boundaries",
          symbolizer: new P.LineSymbolizer({
            color: settings.borderColor,
            width: (z, feature) => (propertyNumber(feature, "admin_level", 99) <= 2 ? 1.6 : 0.8) * clamp(settings.borderWidth, 0.25, 3)
          }),
          filter: (z, feature) => propertyNumber(feature, "admin_level", 99) <= 4
        });
      }
      if (settings.labels) {
        labelRules.push({
          dataLayer: "boundary_labels",
          minzoom: 2,
          symbolizer: new P.CenteredTextSymbolizer({
            labelProps: names,
            fill: settings.labelColor,
            stroke: settings.haloColor,
            width: clamp(settings.haloWidth, 0, 8),
            lineHeight: 1.2,
            letterSpacing: (z, feature) => labelNeedsRtlShaping(feature, names) ? 0 : 0.8 + 4.0 * clamp((z - 4) / 4, 0, 1),
            font: () => font(settings.countryWeight, 16),
            textTransform: settings.uppercaseCountries ? "uppercase" : undefined
          }),
          filter: (z, feature) => propertyNumber(feature, "admin_level", 99) === 2 && (!settings.strictCountryLabels || !looksLikeNonCountryBoundaryLabel(feature))
        });
        labelRules.push({
          dataLayer: "boundary_labels",
          minzoom: 3,
          symbolizer: new P.CenteredTextSymbolizer({
            labelProps: names,
            fill: settings.labelColor,
            stroke: settings.haloColor,
            width: clamp(settings.haloWidth, 0, 8),
            lineHeight: 1.2,
            font: () => font(settings.stateWeight, 12)
          }),
          filter: (z, feature) => propertyNumber(feature, "admin_level", 99) === 4 && (!settings.strictCountryLabels || !looksLikeNonCountryBoundaryLabel(feature))
        });
        labelRules.push({
          dataLayer: "place_labels",
          minzoom: 4,
          symbolizer: new P.CenteredTextSymbolizer({
            labelProps: names,
            fill: settings.labelColor,
            stroke: settings.haloColor,
            width: clamp(settings.haloWidth, 0, 8),
            lineHeight: 1.2,
            font: (z, feature) => {
              const kind = propertyString(feature, "kind");
              const population = propertyNumber(feature, "population", 0);
              const base = kind === "capital" ? 14 : population >= 1000000 ? 13.5 : kind === "state_capital" ? 13 : population >= 250000 ? 12.5 : kind === "city" ? 12 : kind === "town" ? 11 : 10;
              return font(settings.cityWeight, base);
            }
          }),
          filter: (z, feature) => ["capital", "state_capital", "city", "town", "village", "hamlet"].includes(propertyString(feature, "kind"))
        });
      }
      if (settings.labels && settings.roadLabels) {
        labelRules.push({
          dataLayer: "street_labels",
          minzoom: 10,
          symbolizer: new P.LineLabelSymbolizer({
            labelProps: names,
            fill: settings.labelColor,
            stroke: settings.haloColor,
            width: clamp(settings.haloWidth, 0, 8),
            font: () => font(settings.roadWeight, 11)
          })
        });
      }
    }

    return {paintRules, labelRules};
  }

  function setLayerOpacity(target, opacity) {
    if (!target) return;
    if (typeof target.setOpacity === "function") target.setOpacity(opacity);
    if (typeof target.eachLayer === "function") target.eachLayer(child => setLayerOpacity(child, opacity));
  }

  function createLayer(source) {
    ensurePane();
    const options = layerOptions(source);
    if (source.kind === "vector") {
      const rules = vectorRules(source);
      const vector = window.protomapsL.leafletLayer({
        url: source.url,
        pane: PANE_NAME,
        attribution: source.attribution,
        maxDataZoom: source.maxDataZoom || 14,
        maxZoom: 22,
        paintRules: rules.paintRules,
        labelRules: rules.labelRules
      });
      vector.on?.("tileerror", event => {
        const detail = String(event?.error?.message || event?.error || "Vector tile failed to load.");
        setStatus("Tile load failed.", true, detail);
      });
      setLayerOpacity(vector, options.opacity);
      return vector;
    }
    if (source.kind === "raster") {
      const raster = L.tileLayer(source.url, options);
      raster.on("tileerror", event => {
        const detail = String(event?.error?.message || event?.error || "Reference tile failed to load.");
        setStatus("Tile load failed.", true, detail);
      });
      return raster;
    }
    const children = source.urls.map(url => {
      const child = L.tileLayer(url, options);
      child.on("tileerror", event => {
        const detail = String(event?.error?.message || event?.error || "Reference tile failed to load.");
        setStatus("Tile load failed.", true, detail);
      });
      return child;
    });
    return L.layerGroup(children);
  }

  function removeLayer() {
    if (!layer || !map) { layer = null; return; }
    try { map.removeLayer(layer); } catch {}
    layer = null;
  }

  function rebuildLayer({quiet = false} = {}) {
    if (!map) return;
    removeLayer();
    refreshWaterLabels();
    const effectiveEnabled = temporarilyHidden ? !settings.enabled : settings.enabled;
    if (!effectiveEnabled || !satelliteActive) {
      if (!quiet) setStatus(settings.enabled ? "SAT only" : "Disabled");
      return;
    }
    const source = currentSource();
    try {
      layer = createLayer(source);
      layer.addTo(map);
      setLayerOpacity(layer, clamp(settings.opacity, 0, 1));
      setStatus("Ready");
    } catch (error) {
      void 0;
      setStatus("Layer failed.", true, error?.message || String(error));
      notify(`VersaTiles overlay failed: ${error?.message || error}`, "error");
    }
  }

  function scheduleRebuild(delay = 80) {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => rebuildLayer({quiet: true}), delay);
  }

  function setEnabled(next) {
    settings.enabled = Boolean(next);
    saveSettings();
    const toggleInput = settingValue("ref-enabled");
    if (toggleInput) toggleInput.checked = settings.enabled;
    const settingsDetails = settingValue("ref-settings");
    if (settingsDetails) {
      settingsDetails.classList.toggle("hidden", !settings.enabled);
      if (!settings.enabled) settingsDetails.open = false;
    }
    rebuildLayer({quiet: true});
  }

  function settingValue(id) {
    return panel?.querySelector(`#${id}`);
  }

  function updateRangeLabel(id, value, suffix = "") {
    const output = panel?.querySelector(`[data-value-for="${id}"]`);
    if (output) output.textContent = `${value}${suffix}`;
  }

  function syncRange(input) {
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value || min);
    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
    input.style.setProperty("--range-pct", `${Math.max(0, Math.min(100, pct))}%`);
  }

  function renderPanelState() {
    if (!panel) return;
    settingValue("ref-enabled").checked = Boolean(settings.enabled);
    const settingsDetails = settingValue("ref-settings");
    if (settingsDetails) {
      settingsDetails.classList.toggle("hidden", !settings.enabled);
      if (!settings.enabled) settingsDetails.open = false;
    }
    settingValue("ref-labels").checked = Boolean(settings.labels);
    settingValue("ref-water-labels").checked = Boolean(settings.waterLabels);
    settingValue("ref-roads").checked = Boolean(settings.roads);
    settingValue("ref-road-labels").checked = Boolean(settings.roadLabels);
    settingValue("ref-borders").checked = Boolean(settings.borders);
    settingValue("ref-prefer-english").checked = Boolean(settings.preferEnglish);
    settingValue("ref-uppercase-countries").checked = Boolean(settings.uppercaseCountries);
    settingValue("ref-strict-country-labels").checked = Boolean(settings.strictCountryLabels);
    settingValue("ref-font").value = settings.fontFamily;
    settingValue("ref-label-scale").value = settings.labelScale;
    settingValue("ref-country-weight").value = settings.countryWeight;
    settingValue("ref-state-weight").value = settings.stateWeight;
    settingValue("ref-city-weight").value = settings.cityWeight;
    settingValue("ref-road-weight").value = settings.roadWeight;
    settingValue("ref-label-color").value = settings.labelColor;
    settingValue("ref-halo-color").value = settings.haloColor;
    settingValue("ref-halo-width").value = settings.haloWidth;
    settingValue("ref-road-color").value = settings.roadColor;
    settingValue("ref-road-width").value = settings.roadWidth;
    settingValue("ref-border-color").value = settings.borderColor;
    settingValue("ref-border-width").value = settings.borderWidth;
    settingValue("ref-opacity").value = settings.opacity;
    updateRangeLabel("ref-label-scale", Math.round(settings.labelScale * 100), "%");
    updateRangeLabel("ref-halo-width", settings.haloWidth, "px");
    updateRangeLabel("ref-road-width", settings.roadWidth, "x");
    updateRangeLabel("ref-border-width", settings.borderWidth, "x");
    updateRangeLabel("ref-opacity", Math.round(settings.opacity * 100), "%");
    panel.querySelectorAll("input[type=range]").forEach(syncRange);
  }

  function bindBoolean(id, key) {
    settingValue(id)?.addEventListener("change", event => {
      const value = Boolean(event.currentTarget.checked);
      if (key === "enabled") setEnabled(value);
      else { settings[key] = value; saveSettings(); scheduleRebuild(); }
    });
  }

  function bindRange(id, key, min, max, display) {
    settingValue(id)?.addEventListener("input", event => {
      settings[key] = clamp(event.currentTarget.value, min, max);
      syncRange(event.currentTarget);
      saveSettings();
      display?.(settings[key]);
      if (key === "opacity") {
        if (layer) setLayerOpacity(layer, temporarilyHidden ? 0 : settings.opacity);
        const waterPane = map?.getPane(WATER_LABEL_PANE_NAME);
        if (waterPane) waterPane.style.opacity = waterLabelsEffectiveEnabled() ? String(settings.opacity) : "0";
      }
      else scheduleRebuild(60);
    });
  }

  function buildUi() {
    if (!map || panel) return;
    injectStyle();
    const host = document.querySelector("#satellite-brightness-info .satellite-brightness-popup");
    if (!host) return;
    host.classList.add("versatiles-host");
    panel = document.createElement("div");
    panel.id = "versatiles-overlay-control";
    panel.className = "versatiles-overlay-control";
    panel.innerHTML = `
      <label class="check-line versatiles-overlay-master"><input id="ref-enabled" type="checkbox"> Labels</label>
      <details id="ref-settings" class="satellite-border-settings versatiles-settings">
        <summary>Label settings</summary>
        <div>
          <div class="versatiles-section">
            <div class="versatiles-section-title">Content</div>
            <div class="versatiles-checks">
              <label class="check-line"><input id="ref-labels" type="checkbox"> Labels</label>
              <label class="check-line"><input id="ref-water-labels" type="checkbox"> Seas & oceans</label>
              <label class="check-line"><input id="ref-roads" type="checkbox"> Roads</label>
              <label class="check-line"><input id="ref-road-labels" type="checkbox"> Road names</label>
              <label class="check-line"><input id="ref-borders" type="checkbox"> Borders</label>
              <label class="check-line"><input id="ref-prefer-english" type="checkbox"> Prefer English</label>
              <label class="check-line"><input id="ref-uppercase-countries" type="checkbox"> Uppercase countries</label>
              <label class="check-line"><input id="ref-strict-country-labels" type="checkbox"> Strict country labels</label>
            </div>
          </div>
          <div class="versatiles-section">
            <div class="versatiles-section-title">Typography</div>
            <div class="versatiles-grid">
              <label class="versatiles-field full"><span>Font family</span><input id="ref-font" type="text" spellcheck="false" value="Roboto"></label>
              <div class="versatiles-field full"><span>Label scale</span><label class="satellite-brightness-control"><input id="ref-label-scale" type="range" min="0.6" max="1.8" step="0.05"><span data-value-for="ref-label-scale"></span></label></div>
              <label class="versatiles-field"><span>Country weight</span><select id="ref-country-weight">${[300,400,500,600,700,800,900].map(value => `<option>${value}</option>`).join("")}</select></label>
              <label class="versatiles-field"><span>State weight</span><select id="ref-state-weight">${[300,400,500,600,700,800,900].map(value => `<option>${value}</option>`).join("")}</select></label>
              <label class="versatiles-field"><span>City weight</span><select id="ref-city-weight">${[300,400,500,600,700,800,900].map(value => `<option>${value}</option>`).join("")}</select></label>
              <label class="versatiles-field"><span>Road weight</span><select id="ref-road-weight">${[300,400,500,600,700,800,900].map(value => `<option>${value}</option>`).join("")}</select></label>
            </div>
          </div>
          <div class="versatiles-section">
            <div class="versatiles-section-title">Label appearance</div>
            <div class="versatiles-color-row">
              <label class="versatiles-field"><span>Text color</span><input id="ref-label-color" class="versatiles-color" type="color"></label>
              <label class="versatiles-field"><span>Halo color</span><input id="ref-halo-color" class="versatiles-color" type="color"></label>
            </div>
            <div class="versatiles-field full"><span>Halo width</span><label class="satellite-brightness-control"><input id="ref-halo-width" type="range" min="0" max="6" step="0.5"><span data-value-for="ref-halo-width"></span></label></div>
          </div>
          <div class="versatiles-section">
            <div class="versatiles-section-title">Lines</div>
            <div class="versatiles-color-row">
              <label class="versatiles-field"><span>Road color</span><input id="ref-road-color" class="versatiles-color" type="color"></label>
              <label class="versatiles-field"><span>Border color</span><input id="ref-border-color" class="versatiles-color" type="color"></label>
            </div>
            <div class="versatiles-grid">
              <div class="versatiles-field"><span>Road width</span><label class="satellite-brightness-control"><input id="ref-road-width" type="range" min="0.4" max="2.5" step="0.1"><span data-value-for="ref-road-width"></span></label></div>
              <div class="versatiles-field"><span>Border width</span><label class="satellite-brightness-control"><input id="ref-border-width" type="range" min="0.4" max="2.5" step="0.1"><span data-value-for="ref-border-width"></span></label></div>
            </div>
          </div>
          <div class="versatiles-section">
            <div class="versatiles-field full"><span>Overlay opacity</span><label class="satellite-brightness-control"><input id="ref-opacity" type="range" min="0.1" max="1" step="0.05"><span data-value-for="ref-opacity"></span></label></div>
            <div class="versatiles-actions"><button id="ref-reset" class="secondary small" type="button">Reset</button><div id="ref-status" class="versatiles-status">Ready</div></div>
          </div>
        </div>
      </details>
      `;
    host.insertBefore(panel, host.querySelector(".satellite-overzoom-control"));
    status = panel.querySelector("#ref-status");

    bindBoolean("ref-enabled", "enabled");
    bindBoolean("ref-labels", "labels");
    bindBoolean("ref-water-labels", "waterLabels");
    bindBoolean("ref-roads", "roads");
    bindBoolean("ref-road-labels", "roadLabels");
    bindBoolean("ref-borders", "borders");
    bindBoolean("ref-prefer-english", "preferEnglish");
    bindBoolean("ref-uppercase-countries", "uppercaseCountries");
    bindBoolean("ref-strict-country-labels", "strictCountryLabels");

    settingValue("ref-font")?.addEventListener("change", event => {
      settings.fontFamily = String(event.currentTarget.value || "Roboto").trim() || "Roboto";
      saveSettings();
      loadMapFont(settings.fontFamily).finally(() => scheduleRebuild(0));
    });
    ["countryWeight", "stateWeight", "cityWeight", "roadWeight"].forEach(key => {
      const id = `ref-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
      settingValue(id)?.addEventListener("change", event => {
        settings[key] = Number(event.currentTarget.value) || DEFAULTS[key];
        saveSettings();
        scheduleRebuild(0);
      });
    });
    ["labelColor", "haloColor", "roadColor", "borderColor"].forEach(key => {
      const id = `ref-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
      settingValue(id)?.addEventListener("input", event => {
        settings[key] = event.currentTarget.value;
        saveSettings();
        scheduleRebuild(80);
      });
    });
    bindRange("ref-label-scale", "labelScale", 0.6, 1.8, value => updateRangeLabel("ref-label-scale", Math.round(value * 100), "%"));
    bindRange("ref-halo-width", "haloWidth", 0, 6, value => updateRangeLabel("ref-halo-width", value, "px"));
    bindRange("ref-road-width", "roadWidth", 0.4, 2.5, value => updateRangeLabel("ref-road-width", value, "x"));
    bindRange("ref-border-width", "borderWidth", 0.4, 2.5, value => updateRangeLabel("ref-border-width", value, "x"));
    bindRange("ref-opacity", "opacity", 0.1, 1, value => updateRangeLabel("ref-opacity", Math.round(value * 100), "%"));
    panel.querySelector("#ref-reset")?.addEventListener("click", () => {
      const enabled = settings.enabled;
      settings = {...DEFAULTS, enabled};
      saveSettings();
      renderPanelState();
      scheduleRebuild(0);
    });
    renderPanelState();
  }

  function setTemporarilyHidden(next) {
    const held = Boolean(next);
    temporarilyHidden = held;
    if (!map || !satelliteActive) {
      refreshWaterLabels();
      return;
    }
    clearTimeout(temporaryFadeCleanupTimer);
    const pane = map.getPane(PANE_NAME);
    if (!pane) return;
    const waterPane = map.getPane(WATER_LABEL_PANE_NAME);
    pane.style.transition = "opacity 180ms ease";
    if (waterPane) waterPane.style.transition = "opacity 180ms ease";
    if (settings.enabled) {
      if (!layer && !held) rebuildLayer({quiet: true});
      if (!waterLabelLayer && !held && settings.labels && settings.waterLabels) {
        refreshWaterLabels();
        const createdWaterPane = map.getPane(WATER_LABEL_PANE_NAME);
        if (createdWaterPane) {
          createdWaterPane.style.transition = "none";
          createdWaterPane.style.opacity = "0";
        }
      }
      requestAnimationFrame(() => {
        pane.style.opacity = held ? "0" : "1";
        const currentWaterPane = map.getPane(WATER_LABEL_PANE_NAME);
        if (currentWaterPane) {
          currentWaterPane.style.transition = "opacity 180ms ease";
          currentWaterPane.style.opacity = held ? "0" : String(clamp(settings.opacity, 0, 1));
        }
      });
      return;
    }
    if (held) {
      pane.style.transition = "none";
      pane.style.opacity = "0";
      if (waterPane) {
        waterPane.style.transition = "none";
        waterPane.style.opacity = "0";
      }
      rebuildLayer({quiet: true});
      const revealedWaterPane = map.getPane(WATER_LABEL_PANE_NAME);
      if (revealedWaterPane) {
        revealedWaterPane.style.transition = "none";
        revealedWaterPane.style.opacity = "0";
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!temporarilyHidden || settings.enabled) return;
        pane.style.transition = "opacity 180ms ease";
        pane.style.opacity = "1";
        const currentWaterPane = map.getPane(WATER_LABEL_PANE_NAME);
        if (currentWaterPane) {
          currentWaterPane.style.transition = "opacity 180ms ease";
          currentWaterPane.style.opacity = String(clamp(settings.opacity, 0, 1));
        }
      }));
      return;
    }
    pane.style.opacity = "0";
    const hidingWaterPane = map.getPane(WATER_LABEL_PANE_NAME);
    if (hidingWaterPane) {
      hidingWaterPane.style.transition = "opacity 180ms ease";
      hidingWaterPane.style.opacity = "0";
    }
    temporaryFadeCleanupTimer = setTimeout(() => {
      if (!temporarilyHidden && !settings.enabled) {
        removeLayer();
        removeWaterLabels();
      }
      pane.style.transition = "none";
      pane.style.opacity = "1";
      const currentWaterPane = map.getPane(WATER_LABEL_PANE_NAME);
      if (currentWaterPane) {
        currentWaterPane.style.transition = "none";
        currentWaterPane.style.opacity = String(clamp(settings.opacity, 0, 1));
      }
      requestAnimationFrame(() => {
        pane.style.transition = "opacity 180ms ease";
        if (currentWaterPane) currentWaterPane.style.transition = "opacity 180ms ease";
      });
    }, 200);
  }

  function setBasemap(name) {
    const next = name === "satellite";
    if (satelliteActive === next) return;
    satelliteActive = next;
    rebuildLayer({quiet: true});
  }

  function init(nextMap) {
    if (!nextMap) return;
    if (map === nextMap && panel) return;
    map = nextMap;
    ensurePane();
    buildUi();
    map.on("zoomend", refreshWaterLabels);
    loadMapFont(settings.fontFamily).finally(() => rebuildLayer({quiet: true}));
  }

  function destroy({clearStorage = false} = {}) {
    map?.off("zoomend", refreshWaterLabels);
    removeWaterLabels();
    clearTimeout(temporaryFadeCleanupTimer);
    clearTimeout(rebuildTimer);
    removeLayer();
    panel?.remove();
    document.querySelector("#satellite-brightness-info .satellite-brightness-popup")?.classList.remove("versatiles-host");
    document.getElementById(STYLE_ID)?.remove();
    panel = null;
    status = null;
    map = null;
    satelliteActive = false;
    temporarilyHidden = false;
    if (clearStorage) {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    } else saveSettings();
  }

  window.FAVersaTiles = {
    init,
    setBasemap,
    setEnabled,
    setTemporarilyHidden,
    isEnabled() { return Boolean(settings.enabled); },
    destroy
  };
})();
