(() => {
  "use strict";
  function createSAR({shared, syncToolSlotButtonExternal, managedFetch, previewHtml, esc, currentMapWorldIndex, featureCoordinateBounds, featureIntersectsCurrentView, shiftFeatureLongitude, notifyOverpass, beginExternalResultPoiDraft, category}) {
  let map = null, button = null, sarInfo = null;
  const SAR_SUMMARY_URL = "https://iceye-open-data-catalog.s3.amazonaws.com/stac-items/summary/footprint-summary-points.geojson";
  const SAR_TRIAD_BASE = "https://www.pmuguda.com/open-sar-triad/api/v1";
  const SAR_COLORS = {iceye: "#20c7c9", capella: "#e3c64b", umbra: "#e36aa5"};
  const SAR_SOURCES = {
    iceye: {label: "ICEYE", url: `${SAR_TRIAD_BASE}/scenes/iceye.geojson`, color: SAR_COLORS.iceye, catalog: "https://iceye-open-data-catalog.s3.amazonaws.com/collections/iceye-sar.json"},
    capella: {label: "Capella", url: `${SAR_TRIAD_BASE}/scenes/capella.geojson`, color: SAR_COLORS.capella, catalog: "https://capella-open-data.s3.us-west-2.amazonaws.com/stac/catalog.json"},
    umbra: {label: "Umbra", url: `${SAR_TRIAD_BASE}/scenes/umbra.geojson`, color: SAR_COLORS.umbra, catalog: "https://s3.us-west-2.amazonaws.com/umbra-open-data-catalog/stac/catalog.json"}
  };
  const SAR_ATTRIBUTION = `<a href="https://www.iceye.com/open-data-initiative" target="_blank" rel="noopener noreferrer">SAR open data</a>`;
  let sarPanel = null;
  let sarLayer = null;
  let sarEnabled = false;
  let sarMode = "";
  let sarOpacity = 1;
  let boundaryFillOpacity = 0.2;
  let sarAttributionAdded = false;
  const sarSourceEnabled = {iceye: true, capella: true, umbra: true};
  const sarSourceFeatures = {iceye: null, capella: null, umbra: null};
  const sarSourceLoads = {};
  const sarSourceErrors = {iceye: "", capella: "", umbra: ""};
  let sarLastErrorDetail = "";
  const sarIceyeItemLoads = new Map();
  let sarRenderTimer = null;
  let sarRenderedSignature = "";
  let sarDataRevision = 0;

  function sarScheduleRender() {
    clearTimeout(sarRenderTimer);
    if (!sarEnabled) return;
    if (shared.externalSnapGeometryBusy) { shared.sarRenderDeferred = true; return; }
    shared.sarRenderDeferred = false;
    sarRenderTimer = setTimeout(() => { sarRenderTimer = null; sarRender(); }, 120);
  }

  const hiddenSarFeatures = new Set();

  function sarSafeUrl(value) {
    if (typeof value !== "string") return "";
    try {
      const url = new URL(value, SAR_SUMMARY_URL);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function sarCollectUrls(value, path = "", depth = 0, out = []) {
    if (depth > 6 || value == null) return out;
    if (typeof value === "string") {
      const url = sarSafeUrl(value);
      if (url) out.push({path: path.toLowerCase(), url});
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => sarCollectUrls(item, `${path}[${index}]`, depth + 1, out));
      return out;
    }
    if (typeof value === "object") {
      Object.entries(value).forEach(([key, item]) => sarCollectUrls(item, path ? `${path}.${key}` : key, depth + 1, out));
    }
    return out;
  }

  function sarProperty(feature, keys) {
    const props = feature?.properties || {};
    for (const key of keys) {
      const value = props[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return null;
  }

  function sarFeatureProviderKey(feature) {
    const raw = String(sarProperty(feature, ["__sarProvider", "provider"]) || "iceye").toLowerCase();
    if (raw.includes("umbra")) return "umbra";
    if (raw.includes("capella")) return "capella";
    return "iceye";
  }

  function sarFeatureMode(feature) {
    const value = sarProperty(feature, ["sar:instrument_mode", "sensor_mode", "sar:mode", "instrument_mode", "sensorMode", "imaging_mode", "mode", "iceye:mode", "dwell_mode", "iceye:processing_mode", "iceye:acquisition_mode"]);
    if (value != null) return String(value).trim();
    if (sarFeatureProviderKey(feature) !== "iceye") return "Unknown";
    const code = sarFeatureId(feature).split("_").pop().toUpperCase();
    const fallbackModes = {SM: "STRIPMAP", SC: "SCAN", SCW: "SCAN_WIDE", SL: "SPOTLIGHT", SLH: "SPOTLIGHT", SLF: "SPOTLIGHT_FINE", SLF2L: "SPOTLIGHT_FINE_2_LOOK", SLEA: "SPOTLIGHT_EXTENDED_AREA", SLED: "SPOTLIGHT_EXTENDED_DWELL", SLEDF: "SPOTLIGHT_EXTENDED_DWELL_FINE", SLEDP: "SPOTLIGHT_EXTENDED_DWELL_PRECISE"};
    return fallbackModes[code] || "Unknown";
  }

  function sarFeatureDate(feature) {
    const value = sarProperty(feature, ["datetime", "start_datetime", "acquisition_datetime", "acquisition_time", "date"]);
    if (!value) return "";
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(value))) return String(value);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().replace("T", " ").replace(/[.][0-9]{3}Z$/, " UTC");
  }

  function sarFeatureId(feature) {
    return String(feature?.id || sarProperty(feature, ["id", "scene_id", "product_id", "product_name", "title"]) || "SAR scene");
  }

  function sarFeatureKey(feature) {
    return `${sarFeatureProviderKey(feature)}:${sarFeatureId(feature)}`;
  }

  function sarFeatureAsset(feature, kind) {
    const candidates = sarCollectUrls(feature);
    const score = candidate => {
      const path = candidate.path;
      const url = candidate.url.toLowerCase();
      if (kind === "thumbnail") {
        if (/_THM[.]png([?#]|$)/i.test(candidate.url) || /thm[-_]?png/.test(path)) return 10;
        if (/_QLK[.]png([?#]|$)/i.test(candidate.url) || /qlk[-_]?png/.test(path)) return 9;
        if (/thumbnail|quicklook|preview|browse|qlk/.test(path) && /[.](png|jpe?g|webp)([?]|$)/.test(url)) return 8;
        if (/thumbnail|quicklook|preview|browse|qlk/.test(path)) return 5;
        if (/[.](png|jpe?g|webp)([?]|$)/.test(url)) return 3;
      } else if (kind === "metadata") {
        if (/stac|item|metadata|json|self/.test(path) && /[.]json([?]|$)/.test(url)) return 5;
        if (/[.]json([?]|$)/.test(url)) return 2;
      } else if (kind === "data") {
        if (/grd|slc|gec|geo|sicd|sidd|cphd|csi|data|asset|download/.test(path) && /[.](tif|tiff|nitf|zip)([?]|$)/.test(url)) return 5;
        if (/[.](tif|tiff|nitf|zip)([?]|$)/.test(url)) return 2;
      }
      return 0;
    };
    return candidates.map(candidate => ({...candidate, score: score(candidate)})).filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score)[0]?.url || "";
  }

  function sarPopupThumbnailUrl(feature) {
    const thumbnail = sarFeatureAsset(feature, "thumbnail");
    if (!thumbnail || sarFeatureProviderKey(feature) !== "iceye") return thumbnail;
    if (/[.](png|jpe?g|webp)([?#]|$)/i.test(thumbnail)) return thumbnail;
    if (/_QLK[.]tiff?([?#]|$)/i.test(thumbnail)) return thumbnail.replace(/_QLK[.]tiff?([?#].*)?$/i, "_THM.png");
    return thumbnail;
  }

  function sarPopupThumbnailFallbackUrl(feature) {
    if (sarFeatureProviderKey(feature) !== "iceye") return "";
    const source = sarFeatureAsset(feature, "thumbnail");
    const primary = sarPopupThumbnailUrl(feature);
    if (!source || !primary || source === primary) return "";
    return `https://images.weserv.nl/?url=${encodeURIComponent(source)}&w=600&output=jpg&q=80`;
  }

  function sarIceyeCsiPngUrl(feature) {
    if (sarFeatureProviderKey(feature) !== "iceye") return "";
    const direct = sarCollectUrls(feature).find(candidate => /_CSI[.]png(?:[?#]|$)/i.test(candidate.url) || /csi(?:[-_]?cog)?[-_]?png/.test(candidate.path))?.url || "";
    if (direct) return direct;
    const id = sarFeatureId(feature);
    if (!/_(SLED|SLEDF|SLEDP)$/i.test(id)) return "";
    const thumbnail = sarPopupThumbnailUrl(feature);
    if (!thumbnail) return "";
    try {
      const url = new URL(thumbnail);
      if (!/_(THM|QLK)[.]png$/i.test(url.pathname)) return "";
      url.pathname = url.pathname.replace(/_(THM|QLK)[.]png$/i, "_CSI.png");
      url.search = "";
      url.hash = "";
      return sarSafeUrl(url.href);
    } catch {
      return "";
    }
  }

  function sarFeatureProducts(feature) {
    const products = feature?.properties?.products;
    return products && typeof products === "object" && !Array.isArray(products) ? products : {};
  }

  function sarFeatureResolution(feature) {
    const props = feature?.properties || {};
    const keys = [
      "sar:resolution_range", "resolution_range", "range_resolution",
      "sar:resolution_azimuth", "resolution_azimuth",
      "resolution", "gsd",
      "sar:pixel_spacing_range", "pixel_spacing_range", "range_pixel_spacing",
      "sar:pixel_spacing_azimuth", "pixel_spacing_azimuth", "azimuth_pixel_spacing",
      "pixel_spacing"
    ];
    for (const key of keys) {
      const raw = props[key];
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of values) {
        if (value === undefined || value === null || value === "") continue;
        const number = typeof value === "number" ? value : parseFloat(String(value));
        if (Number.isFinite(number) && number > 0) return number;
      }
    }
    return null;
  }

  function sarUmbraGeoTiffUrl(feature) {
    if (sarFeatureProviderKey(feature) !== "umbra") return "";
    const products = sarFeatureProducts(feature);
    const candidates = [products.GEC, products.GEO, sarFeatureAsset(feature, "data")];
    for (const candidate of candidates) {
      const safe = sarSafeUrl(String(candidate || ""));
      if (safe && /[.]tiff?(?:[?#]|$)/i.test(safe)) return safe;
    }
    return "";
  }

  function sarFeatureDisplayId(feature) {
    const id = sarFeatureId(feature);
    if (sarFeatureProviderKey(feature) !== "umbra") return id;
    const geotiff = sarUmbraGeoTiffUrl(feature);
    if (geotiff) {
      try {
        const filename = decodeURIComponent(new URL(geotiff).pathname.split("/").pop() || "");
        const base = filename.replace(/_(GEC|GEO|CSI|SICD|SIDD|CPHD)[.][^.]+$/i, "");
        if (base && base !== filename) return base;
      } catch {}
    }
    return id;
  }

  function sarCapellaItemUrl(feature) {
    if (sarFeatureProviderKey(feature) !== "capella") return "";
    const products = sarFeatureProducts(feature);
    const productUrl = products.GEO || products.GEC || "";
    const safe = sarSafeUrl(String(productUrl || ""));
    if (!safe) return "";
    let productId = "";
    try {
      productId = decodeURIComponent(new URL(safe).pathname.split("/").pop() || "").replace(/[.](tif|tiff)$/i, "");
    } catch {
      return "";
    }
    if (!productId || !/^CAPELLA_/i.test(productId)) return "";
    const date = sarFeatureDate(feature);
    const match = String(date || "").match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/);
    if (!match) return "";
    const year = match[1];
    const month = match[2];
    const day = match[3];
    const dateText = `${year}-${month}-${day}`;
    const encodedId = encodeURIComponent(productId);
    return `https://capella-open-data.s3.amazonaws.com/stac/capella-open-data-by-datetime/capella-open-data-${year}/capella-open-data-${year}-${month}/capella-open-data-${dateText}/${encodedId}/${encodedId}.json`;
  }

  function sarTitleCase(value) {
    return String(value || "Unknown").replace(/[_-]+/g, " ").split(" ").map(word => word ? word[0].toUpperCase() + word.slice(1) : word).join(" ");
  }

  function sarNormalizeFeature(feature, providerKey) {
    return {...feature, properties: {...(feature?.properties || {}), __sarProvider: providerKey}};
  }

  function sarEnsurePane() {
    if (!map) return;
    let pane = map.getPane("sarPane");
    if (!pane) {
      pane = map.createPane("sarPane", map._rotatePane || map.getPane("overlayPane"));
      pane.style.zIndex = "425";
    }
    pane.style.willChange = "transform";
  }


  function sarSetInteractionSuspended(suspended) {
    const pane = map?.getPane?.("sarPane");
    if (pane) pane.style.pointerEvents = suspended ? "none" : "";
  }


  function sarSetStatus(text, error = false, detail = "") {
    const status = sarPanel?.querySelector("#sar-status");
    if (!status) return;
    const errorKeys = Object.keys(SAR_SOURCES).filter(key => sarSourceEnabled[key] && sarSourceErrors[key]);
    const hasSourceErrors = errorKeys.length > 0;
    const base = String(text || "").trim();
    const aggregateDetail = errorKeys.map(key => `${SAR_SOURCES[key].label} SAR load failed: ${sarSourceErrors[key]}`).join("\n");
    if (!error && !hasSourceErrors) sarLastErrorDetail = "";
    const tooltip = String(detail || sarLastErrorDetail || aggregateDetail).trim();
    status.textContent = error || hasSourceErrors ? "Load failed." : base;
    status.title = error || hasSourceErrors ? tooltip : "";
    status.classList.toggle("error", Boolean(error || hasSourceErrors));
    sarUpdateSourceLabels();
  }

  function sarUpdateSourceLabels() {
    if (!sarPanel) return;
    sarPanel.querySelectorAll("[data-sar-source-label]").forEach(label => {
      const key = label.dataset.sarSourceLabel;
      const source = SAR_SOURCES[key];
      if (!source) return;
      const count = Array.isArray(sarSourceFeatures[key]) ? sarSourceFeatures[key].length : 0;
      label.innerHTML = sarSourceEnabled[key] ? `${source.label} <span class="sar-source-count">(${count})</span>` : source.label;
    });
  }

  function sarSyncSharedButton() {
    const button = document.getElementById("overpass-toggle");
    if (!button || button.textContent !== "SAR") return;
    button.classList.toggle("tool-active", sarEnabled);
    if (sarInfo) {
      const visible = sarEnabled && button.textContent === "SAR";
      sarInfo.classList.toggle("hidden", !visible);
      if (!visible) sarClosePanel();
    }
    button.setAttribute("aria-pressed", sarEnabled ? "true" : "false");
    syncToolSlotButtonExternal();
  }

  function sarEnabledFeatures() {
    const features = [];
    Object.keys(SAR_SOURCES).forEach(key => {
      if (sarSourceEnabled[key] && Array.isArray(sarSourceFeatures[key])) features.push(...sarSourceFeatures[key]);
    });
    return features;
  }

  function sarPopulateModes() {
    const select = sarPanel?.querySelector("#sar-mode");
    if (!select) return;
    const modes = [...new Set(sarEnabledFeatures().map(sarFeatureMode).filter(mode => mode && mode !== "Unknown"))].sort((a, b) => a.localeCompare(b));
    const previous = sarMode;
    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All modes";
    select.appendChild(all);
    modes.forEach(mode => {
      const option = document.createElement("option");
      option.value = mode;
      option.textContent = sarTitleCase(mode);
      select.appendChild(option);
    });
    sarMode = modes.includes(previous) ? previous : "";
    select.value = sarMode;
  }

  function sarMoreGeoBrowserUrl(value) {
    const safe = sarSafeUrl(value);
    if (!safe) return "";
    return `https://browser.moregeo.it/external/${safe.replace(/^https?:\/\//, "")}`;
  }

  function sarUmbraItemUrl(feature) {
    const data = sarFeatureAsset(feature, "data");
    if (!data) return "";
    try {
      const url = new URL(data);
      const parts = url.pathname.split("/");
      const filename = parts.pop() || "";
      const itemBase = filename.replace(/_(CSI|GEC|SICD|SIDD|CPHD|SLC|GRD)(?:_[^.]*)?.[^.]+$/i, "");
      if (!itemBase || itemBase === filename) return "";
      parts.push(`${itemBase}.stac.v2.json`);
      url.pathname = parts.join("/");
      url.search = "";
      url.hash = "";
      return sarSafeUrl(url.href);
    } catch {
      return "";
    }
  }

  function sarCapellaDateCatalogUrl(feature) {
    const date = sarFeatureDate(feature);
    const match = String(date || "").match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/);
    if (!match) return "";
    const year = match[1];
    const month = match[2];
    const day = match[3];
    const dateText = `${year}-${month}-${day}`;
    return `https://capella-open-data.s3.amazonaws.com/stac/capella-open-data-by-datetime/capella-open-data-${year}/capella-open-data-${year}-${month}/capella-open-data-${dateText}/catalog.json`;
  }



  function sarIceyeItemUrl(feature) {
    if (sarFeatureProviderKey(feature) !== "iceye") return "";
    const id = sarFeatureId(feature);
    const date = sarFeatureDate(feature);
    const match = String(date || "").match(/^([0-9]{4})-([0-9]{2})/);
    if (!id || id === "SAR scene" || !match) return "";
    return `https://iceye-open-data-catalog.s3-us-west-2.amazonaws.com/stac-items/${match[1]}/${match[2]}/${encodeURIComponent(id)}.json`;
  }

  async function sarHydrateIceyeMetadata(feature) {
    if (sarFeatureProviderKey(feature) !== "iceye" || sarFeatureResolution(feature) != null || feature?.properties?.__sarIceyeMetadataLoaded) return false;
    const item = sarIceyeItemUrl(feature);
    if (!item) return false;
    let load = sarIceyeItemLoads.get(item);
    if (!load) {
      load = managedFetch(item, {cache: "force-cache"}, {timeoutMs: 20000, retries: 1, label: "ICEYE metadata"})
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .catch(error => {
          sarIceyeItemLoads.delete(item);
          void 0;
          return null;
        });
      sarIceyeItemLoads.set(item, load);
    }
    const data = await load;
    if (!data || typeof data !== "object") return false;
    feature.properties = {...(feature.properties || {}), ...(data.properties || {}), __sarProvider: "iceye", __sarIceyeMetadataLoaded: true};
    if (data.assets && typeof data.assets === "object") feature.assets = data.assets;
    if (Array.isArray(data.links)) feature.links = data.links;
    return true;
  }

  function sarFeatureBrowserUrl(feature) {
    const providerKey = sarFeatureProviderKey(feature);
    if (providerKey === "iceye") {
      const item = sarIceyeItemUrl(feature);
      if (item) return sarMoreGeoBrowserUrl(item);
    }
    if (providerKey === "umbra") {
      const item = sarUmbraItemUrl(feature);
      if (item) return sarMoreGeoBrowserUrl(item);
    }
    if (providerKey === "capella") {
      const item = sarCapellaItemUrl(feature);
      if (item) return sarMoreGeoBrowserUrl(item);
      const dateCatalog = sarCapellaDateCatalogUrl(feature);
      if (dateCatalog) return sarMoreGeoBrowserUrl(dateCatalog);
    }
    const selfLink = Array.isArray(feature?.links) ? feature.links.find(link => link?.rel === "self" && link?.href)?.href : "";
    if (selfLink) {
      const safe = sarSafeUrl(selfLink);
      if (safe) return sarMoreGeoBrowserUrl(safe);
    }
    const direct = sarProperty(feature, ["provider_url", "stac_browser", "stac_url"]);
    if (direct) return sarSafeUrl(String(direct));
    const catalog = SAR_SOURCES[providerKey]?.catalog || "";
    return catalog ? sarMoreGeoBrowserUrl(catalog) : "";
  }

  function sarPopupHtml(feature) {
    const providerKey = sarFeatureProviderKey(feature);
    const provider = SAR_SOURCES[providerKey]?.label || sarTitleCase(providerKey);
    const id = sarFeatureDisplayId(feature);
    const mode = sarFeatureMode(feature);
    const date = sarFeatureDate(feature);
    const platform = sarProperty(feature, ["platform", "satellite", "mission", "constellation"]);
    const polarization = sarProperty(feature, ["sar:polarizations", "polarizations", "polarization"]);
    const resolution = sarFeatureResolution(feature);
    const thumbnail = sarPopupThumbnailUrl(feature);
    const thumbnailFallback = sarPopupThumbnailFallbackUrl(feature);
    const thumbnailOpen = sarIceyeCsiPngUrl(feature) || thumbnail;
    const browser = sarFeatureBrowserUrl(feature);
    const data = sarFeatureAsset(feature, "data");
    const geotiff = providerKey === "umbra" ? sarUmbraGeoTiffUrl(feature) : "";
    const previewHtml = thumbnail
      ? `<a href="${esc(thumbnailOpen)}" target="_blank" rel="noopener noreferrer"><img class="sar-popup-thumbnail" src="${esc(thumbnail)}" alt="${esc(provider)} SAR preview" loading="lazy" referrerpolicy="no-referrer"${thumbnailFallback ? ` data-fallback="${esc(thumbnailFallback)}" onerror="if(this.dataset.fallback){this.onerror=null;this.src=this.dataset.fallback}"` : ""}></a>`
      : providerKey === "umbra" && geotiff
        ? `<a class="sar-popup-geotiff-placeholder" href="${esc(geotiff)}" target="_blank" rel="noopener noreferrer" aria-label="View Umbra GeoTIFF"><span>View GeoTIFF</span></a>`
        : "";
    const polarText = Array.isArray(polarization) ? polarization.join(", ") : polarization;
    const resolutionText = resolution == null ? "" : Array.isArray(resolution) ? resolution.join(", ") : Number.isFinite(Number(resolution)) ? `${Number(resolution).toLocaleString(undefined, {maximumFractionDigits: 3})} m` : resolution;
    const rows = [
      ["Provider", provider],
      ["Mode", sarTitleCase(mode)],
      ["Date", date],
      ["Platform", platform],
      ["Polarization", polarText],
      ["Resolution", resolutionText],
      ["Open", browser],
    ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
    return `<div class="sar-popup"><div class="sar-popup-title">${esc(id)}</div>${previewHtml}<div class="sar-popup-meta">${rows.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${label === "Open" ? `<a class="sar-meta-link" href="${esc(value)}" target="_blank" rel="noopener noreferrer">STAC Browser</a>` : esc(value)}</strong></div>`).join("")}</div></div>`;
  }

  function sarFilteredFeatures() {
    const features = sarEnabledFeatures().filter(feature => !hiddenSarFeatures.has(sarFeatureKey(feature)));
    return sarMode ? features.filter(feature => String(sarFeatureMode(feature)).toLowerCase() === String(sarMode).toLowerCase()) : features;
  }

  function sarRemoveLayer() {
    if (sarLayer && map?.hasLayer(sarLayer)) map.removeLayer(sarLayer);
    sarLayer = null;
  }

  function sarVisibleWorldOffsets(padFactor = 0.08) {
    if (!map) return [0];
    const view = map.getBounds();
    const span = Math.max(1, Math.abs(view.getEast() - view.getWest()));
    const pad = Math.max(1, span * padFactor);
    const west = view.getWest() - pad;
    const east = view.getEast() + pad;
    const firstWorld = Math.ceil((west - 180) / 360);
    const lastWorld = Math.floor((east + 180) / 360);
    const offsets = [];
    for (let world = firstWorld; world <= lastWorld; world += 1) offsets.push(world * 360);
    return offsets.length ? offsets : [currentMapWorldIndex() * 360];
  }

  function sarFeaturesForCurrentView(features, overview, padFactor = 0.08) {
    const wrapped = [];
    const offsets = sarVisibleWorldOffsets(padFactor);
    for (const feature of Array.isArray(features) ? features : []) {
      const bounds = featureCoordinateBounds(feature);
      if (!bounds) continue;
      for (const offset of offsets) {
        if (!featureIntersectsCurrentView(feature, offset, padFactor)) continue;
        if (overview) {
          wrapped.push({...feature, geometry: {type: "Point", coordinates: [(bounds.west + bounds.east) / 2 + offset, (bounds.south + bounds.north) / 2]}, properties: {...(feature.properties || {}), __sarOverviewMarker: true}});
        } else {
          wrapped.push(shiftFeatureLongitude(feature, offset));
        }
      }
    }
    return wrapped;
  }

  function sarThinOverviewFeatures(features) {
    if (!map || map.getZoom() > 5 || features.length < 1200) return features;
    const zoom = map.getZoom();
    const cellSize = zoom <= 0 ? 12 : zoom === 1 ? 10 : zoom === 2 ? 8 : zoom === 3 ? 6 : zoom === 4 ? 4 : 3;
    const maxFeatures = zoom <= 0 ? 1200 : zoom === 1 ? 1600 : zoom === 2 ? 2200 : zoom === 3 ? 3000 : zoom === 4 ? 4000 : 5000;
    const seen = new Set();
    const thinned = [];
    for (const feature of features) {
      const coordinates = feature?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
      const point = map.latLngToContainerPoint([Number(coordinates[1]), Number(coordinates[0])]);
      const key = `${sarFeatureProviderKey(feature)}:${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      thinned.push(feature);
    }
    if (thinned.length <= maxFeatures) return thinned;
    const sampled = [];
    const step = thinned.length / maxFeatures;
    for (let index = 0; index < maxFeatures; index += 1) sampled.push(thinned[Math.floor(index * step)]);
    return sampled;
  }


  function sarRender() {
    if (shared.externalSnapGeometryBusy) { shared.sarRenderDeferred = true; return; }
    shared.sarRenderDeferred = false;
    if (!map || !sarEnabled) return;
    sarEnsurePane();
    const useSceneMarkers = map.getZoom() <= 5;
    const filtered = sarFilteredFeatures();
    const visibleFeatures = sarFeaturesForCurrentView(filtered, useSceneMarkers, 0.08);
    const displayFeatures = useSceneMarkers ? sarThinOverviewFeatures(visibleFeatures) : visibleFeatures;
    const overviewInteractive = !useSceneMarkers || map.getZoom() >= 3;
    const view = map.getBounds();
    const sourceSignature = Object.keys(SAR_SOURCES).map(key => `${key}:${sarSourceEnabled[key] ? (sarSourceFeatures[key]?.length || 0) : "off"}`).join(",");
    const signature = `${map.getZoom()}|${view.getWest().toFixed(4)}|${view.getSouth().toFixed(4)}|${view.getEast().toFixed(4)}|${view.getNorth().toFixed(4)}|${useSceneMarkers ? "markers" : "footprints"}|${sarMode}|${sarOpacity}|${sarDataRevision}|${sourceSignature}|${[...hiddenSarFeatures].sort().join(",")}`;
    if (sarLayer && signature === sarRenderedSignature) {
      sarSetStatus(`${displayFeatures.length} displayed · ${filtered.length} total`);
      return;
    }
    sarRenderedSignature = signature;
    sarRemoveLayer();
    const fillOpacity = boundaryFillOpacity * sarOpacity;
    sarLayer = L.geoJSON({type: "FeatureCollection", features: displayFeatures}, {
      pane: "sarPane",
      pointToLayer: (feature, latlng) => {
        const color = SAR_SOURCES[sarFeatureProviderKey(feature)]?.color || SAR_COLORS.capella;
        return L.circleMarker(latlng, {pane: "sarPane", interactive: overviewInteractive, radius: 3, color, fillColor: color, weight: 1.5, opacity: 1, fillOpacity: 0.72});
      },
      smoothFactor: map.getZoom() <= 5 ? 3 : 1.5,
      style: feature => {
        const color = SAR_SOURCES[sarFeatureProviderKey(feature)]?.color || SAR_COLORS.capella;
        return {color, fillColor: color, weight: feature?.properties?.__sarOverviewMarker ? 1.5 : 2, opacity: 1, fillOpacity: feature?.properties?.__sarOverviewMarker ? 0.72 : fillOpacity, smoothFactor: 2};
      },
      onEachFeature: (feature, layer) => {
        layer.options.pmIgnore = true;
        layer.options.snapIgnore = !(layer instanceof L.Polyline);
        layer.options.bubblingMouseEvents = false;
        if (useSceneMarkers && !overviewInteractive) return;
        const sarKey = sarFeatureKey(feature);
        layer.on("contextmenu", event => {
          if (!window.FAMapContext?.showFeatureMenu) return;
          if (event.originalEvent) {
            event.originalEvent.preventDefault();
            event.originalEvent._faFeatureContextHandled = true;
            L.DomEvent.stopPropagation(event.originalEvent);
          }
          layer.closeTooltip?.();
          const providerKey = sarFeatureProviderKey(feature);
          const provider = SAR_SOURCES[providerKey]?.label || sarTitleCase(providerKey);
          const sourceUrl = sarFeatureBrowserUrl(feature);
          const polarization = sarProperty(feature, ["sar:polarizations", "polarizations", "polarization"]);
          const resolution = sarFeatureResolution(feature);
          window.FAMapContext.showFeatureMenu(event, {
            label: "Hide boundary",
            hide: () => {
              hiddenSarFeatures.add(sarKey);
              notifyOverpass("Boundary hidden.", "success");
              sarRender();
              window.FAMapContext?.recordAction?.({
                scope: "sar",
                undo: () => { hiddenSarFeatures.delete(sarKey); sarRender(); },
                redo: () => { hiddenSarFeatures.add(sarKey); sarRender(); }
              });
            },
            convert: () => beginExternalResultPoiDraft(layer, {
              name: sarFeatureDisplayId(feature),
              category: "SAR",
              tags: [provider, sarTitleCase(sarFeatureMode(feature))].filter(Boolean),
              color: SAR_SOURCES[providerKey]?.color || "",
              customFields: {
                source: "SAR",
                provider,
                source_id: sarFeatureDisplayId(feature),
                source_url: sourceUrl,
                mode: sarTitleCase(sarFeatureMode(feature)),
                date: sarFeatureDate(feature),
                platform: sarProperty(feature, ["platform", "satellite", "mission", "constellation"]) || "",
                polarization: Array.isArray(polarization) ? polarization.join(", ") : polarization || "",
                resolution_m: Array.isArray(resolution) ? resolution.join(", ") : resolution ?? ""
              }
            })
          });
        });
        let sarTooltipContent = null;
        window.FATooltips.bindInteractive(
          layer,
          () => {
            if (!sarTooltipContent) {
              const holder = document.createElement("div");
              holder.innerHTML = sarPopupHtml(feature);
              sarTooltipContent = holder.firstElementChild;
            }
            return sarTooltipContent;
          },
          {className: "app-tooltip sar-scene-tooltip", direction: "auto", interactive: true, opacity: 1},
          {
            onElementReady: element => {
              element.addEventListener("auxclick", event => {
                if (event.button !== 1) return;
                const link = event.target.closest?.("a[href]");
                if (!link) return;
                event.preventDefault();
                event.stopPropagation();
                window.open(link.href, "_blank", "noopener,noreferrer");
              });
            },
            onOpen: element => {
              sarHydrateIceyeMetadata(feature).then(updated => {
                if (!updated || !layer.isTooltipOpen()) return;
                const holder = document.createElement("div");
                holder.innerHTML = sarPopupHtml(feature);
                sarTooltipContent = holder.firstElementChild;
                layer.setTooltipContent(sarTooltipContent);
              });
            }
          }
        );
      }
    });
    sarLayer.options.pmIgnore = true;
    sarLayer.options.snapIgnore = false;
    sarLayer.addTo(map);
    sarSetStatus(`${displayFeatures.length} displayed · ${filtered.length} total`);
  }

  async function sarLoadStaticSource(key, force = false) {
    const source = SAR_SOURCES[key];
    if (!source?.url) return [];
    if (Array.isArray(sarSourceFeatures[key]) && !force) return sarSourceFeatures[key];
    if (sarSourceLoads[key]) return sarSourceLoads[key];
    sarSourceErrors[key] = "";
    sarSetStatus(`Loading ${source.label}...`);
    sarSourceLoads[key] = managedFetch(source.url, {cache: force ? "reload" : "default"}, {
      timeoutMs: 60000,
      retries: 1,
      label: `${source.label} SAR catalog`,
      onRetry: () => sarSetStatus(`${source.label}: request delayed; retrying...`)
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Unexpected catalog format");
        sarSourceErrors[key] = "";
        sarSourceFeatures[key] = data.features.filter(feature => feature?.geometry).map(feature => sarNormalizeFeature(feature, key));
        sarDataRevision += 1;
        if (sarEnabled) {
          sarPopulateModes();
          sarRender();
        }
        return sarSourceFeatures[key];
      })
      .catch(error => {
        void 0;
        const message = error.name === "TimeoutError" ? "request timed out" : error.message;
        const detail = `${source.label} SAR load failed: ${message}`;
        sarLastErrorDetail = detail;
        sarSourceErrors[key] = message;
        sarSourceFeatures[key] = sarSourceFeatures[key] || [];
        notifyOverpass(detail, "error");
        sarSetStatus("Load failed.", true, detail);
        return sarSourceFeatures[key];
      })
      .finally(() => { delete sarSourceLoads[key]; });
    return sarSourceLoads[key];
  }


  async function sarEnsureSource(key, force = false) {
    return sarLoadStaticSource(key, force);
  }

  async function sarLoad(force = false) {
    const keys = Object.keys(SAR_SOURCES).filter(key => sarSourceEnabled[key]);
    if (!keys.length) {
      sarPopulateModes();
      sarRender();
      return [];
    }
    await Promise.allSettled(keys.map(key => sarEnsureSource(key, force)));
    sarPopulateModes();
    sarRender();
    return sarFilteredFeatures();
  }



  function sarClosePanel() {
    sarPanel?.classList.add("hidden");
    sarInfo?.classList.remove("legend-pinned");
    sarInfo?.querySelector(".tool-settings-info-button")?.setAttribute("aria-expanded", "false");
  }

  async function sarSetEnabled(next) {
    const wasEnabled = sarEnabled;
    if (next && window.FAOverpassHost?.beforeOpen?.() === false) return;
    sarEnabled = Boolean(next);
    if (sarEnabled && !wasEnabled) { hiddenSarFeatures.clear(); window.FAMapContext?.clearHistory?.("sar"); }
    sarSyncSharedButton();
    if (!sarEnabled) {
      sarRemoveLayer();
      sarClosePanel();
      if (sarAttributionAdded && map?.attributionControl) {
        map.attributionControl.removeAttribution(SAR_ATTRIBUTION);
        sarAttributionAdded = false;
      }
      return;
    }
    buildSarUi();
    if (!sarAttributionAdded && map?.attributionControl) {
      map.attributionControl.addAttribution(SAR_ATTRIBUTION);
      sarAttributionAdded = true;
    }
    await sarLoad(false);
  }

  function buildSarUi() {
    if (sarPanel) return;
    sarPanel = document.createElement("div");
    sarPanel.id = "sar-panel";
    sarPanel.className = "sar-panel hidden";
    sarPanel.dataset.faExclusive = "sar";
    sarPanel.innerHTML = `
      <div class="ovp-header"><strong>SAR</strong><button id="sar-close" class="secondary small ovp-close" type="button">Close</button></div>
      <div class="sar-source-box">
        <div class="sar-source-title settings-group-label">Providers</div>
        ${Object.entries(SAR_SOURCES).map(([key, source]) => `<label class="sar-source-option"><input type="checkbox" data-sar-source="${key}" ${sarSourceEnabled[key] ? "checked" : ""}><span class="sar-source-swatch" style="background:${source.color}"></span><span data-sar-source-label="${key}">${source.label}</span></label>`).join("")}
      </div>
      <div class="sar-controls">
        <label class="sar-field"><span>Mode</span><select id="sar-mode"><option value="">All modes</option></select></label>
      </div>
      <div class="sar-footer"><div class="sar-actions"><button id="sar-refresh" class="secondary" type="button">Refresh</button><button id="sar-hide" class="secondary" type="button">Hide layer</button></div><div id="sar-status" class="sar-status">Ready</div></div>`;
    sarInfo.appendChild(sarPanel);
    sarUpdateSourceLabels();
    sarPanel.querySelector("#sar-close")?.addEventListener("click", sarClosePanel);
    sarPanel.querySelector("#sar-mode")?.addEventListener("change", event => {
      sarMode = event.target.value || "";
      sarRender();
    });
    sarPanel.querySelector("#sar-refresh")?.addEventListener("click", () => { sarLoad(true); });
    sarPanel.querySelector("#sar-hide")?.addEventListener("click", () => { sarSetEnabled(false); });
    sarPanel.querySelectorAll("[data-sar-source]").forEach(input => {
      input.addEventListener("change", async event => {
        const key = event.currentTarget.dataset.sarSource;
        sarSourceEnabled[key] = event.currentTarget.checked;
        if (sarSourceEnabled[key]) await sarEnsureSource(key, false);
        sarPopulateModes();
        sarRender();
      });
    });
  }

    window.FASAR = {close: sarClosePanel, isEnabled() {return sarEnabled;}, setEnabled: sarSetEnabled, refresh() {return sarLoad(true);}};
    return {init(nextMap) {map = nextMap;}, setBoundaryFillOpacity(value) {
      boundaryFillOpacity = value;
      sarLayer?.eachLayer?.(layer => { if (layer instanceof L.Polygon) layer.setStyle({fillOpacity: boundaryFillOpacity * sarOpacity}); });
    }, attachUi(info, activeButton) {sarInfo = info; button = activeButton;}, sarScheduleRender, sarSetInteractionSuspended, sarLoad, sarClosePanel, sarSetEnabled, buildSarUi, sarGetPanel() {return sarPanel;}, sarIsEnabled() {return sarEnabled;}};
  }
  window.FASARModule = Object.freeze({createSAR});
})();
