(() => {
  "use strict";
  function createOAP({shared, staticOverpassPointInRing, staticOverpassLineHit, normalizeWorldLongitude, esc, canonicalViewportBboxes, managedFetch, wrapFeaturesForCurrentView, notifyOverpass, beginExternalResultPoiDraft, category, syncToolSlotButtonExternal}) {
  let map = null;
  let STATIC_OAP = true;
  let boundaryFillOpacity = 0.2;
  const OAP_TILE_URL = "https://api.imagery.hotosm.org/raster/collections/openaerialmap/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual&nodata=0";
  const OAP_COVERAGE_PMTILES_URL = "https://s3.amazonaws.com/oin-hotosm-temp/global-coverage.pmtiles";
  const OAP_STAC_SEARCH_URL = "https://api.imagery.hotosm.org/stac/search";
  const OAP_ATTRIBUTION = `<a href="https://imagery.hotosm.org/" target="_blank" rel="noopener noreferrer">OpenAerialMap / HOT</a>`;
  let oapLayer = null;
  let oapCoverageLayer = null;
  let oapMetaLayer = null;
  // Passive batched OAP footprints; original feature layers remain as snap sources.
  let oapStaticEntries = [];
  let oapStaticDisplay = null;
  let oapStaticTooltip = null;
  let oapStaticHoverKey = "";
  let oapStaticHoverFrame = null;
  function oapStaticCloseTooltip() {
    oapStaticHoverKey = "";
    if (oapStaticTooltip && map?.hasLayer(oapStaticTooltip)) map.removeLayer(oapStaticTooltip);
  }
  function oapStaticClear() {
    if (oapStaticDisplay && map?.hasLayer(oapStaticDisplay)) map.removeLayer(oapStaticDisplay);
    oapStaticDisplay = null;
    oapStaticEntries = [];
    oapStaticCloseTooltip();
  }
  function oapStaticDraw() {
    if (!STATIC_OAP || !map) return;
    if (oapStaticDisplay && map.hasLayer(oapStaticDisplay)) map.removeLayer(oapStaticDisplay);
    const polygons = [], lines = [];
    for (const entry of oapStaticEntries) {
      if (hiddenOapFeatures.has(entry.key)) continue;
      const layer = entry.layer;
      if (layer instanceof L.Polygon) {
        const multi = entry.feature.geometry?.type === "MultiPolygon" ? layer.getLatLngs() : [layer.getLatLngs()];
        for (const polygon of multi) {
          const rings = polygon.map((ring, index) => {
            let area = 0;
            for (let i = 0; i < ring.length; i++) {
              const a = ring[i], b = ring[(i + 1) % ring.length];
              area += a.lng * b.lat - b.lng * a.lat;
            }
            return (index === 0 ? area < 0 : area > 0) ? ring.slice().reverse() : ring;
          });
          if (rings.length) polygons.push(rings);
        }
      } else if (layer instanceof L.Polyline) lines.push(layer.getLatLngs());
    }
    oapStaticDisplay = L.layerGroup();
    const style = {pane: "overlayPane", color: "#b8b8b8", weight: 1.5, opacity: .95,
      fillColor: "#c8c8c8", fillOpacity: boundaryFillOpacity, fillRule: "nonzero", interactive: false,
      bubblingMouseEvents: false, pmIgnore: true, snapIgnore: true, className: "oap-footprint-batched"};
    if (polygons.length) oapStaticDisplay.addLayer(L.polygon(polygons, style));
    if (lines.length) oapStaticDisplay.addLayer(L.polyline(lines, {...style, fill: false}));
    oapStaticDisplay.addTo(map);
  }
  function oapStaticFind(latlng) {
    if (!STATIC_OAP || !oapEnabled || !oapMetaLayer || !map?.hasLayer(oapMetaLayer)) return null;
    let best = null, bestSize = Infinity;
    const padding = 12 * 360 / (256 * Math.pow(2, map.getZoom()));
    for (const entry of oapStaticEntries) {
      if (hiddenOapFeatures.has(entry.key)) continue;
      const b = entry.bounds;
      if (!b?.isValid() || latlng.lat < b.getSouth() - padding || latlng.lat > b.getNorth() + padding ||
          latlng.lng < b.getWest() - padding || latlng.lng > b.getEast() + padding) continue;
      const layer = entry.layer;
      let hit = false;
      if (layer instanceof L.Polygon) {
        const multi = entry.feature.geometry?.type === "MultiPolygon" ? layer.getLatLngs() : [layer.getLatLngs()];
        for (const rings of multi) {
          if (rings[0]?.length && staticOverpassPointInRing(latlng, rings[0]) &&
              !rings.slice(1).some(ring => staticOverpassPointInRing(latlng, ring))) hit = true;
          if (!hit && rings.some(ring => staticOverpassLineHit(ring, latlng))) hit = true;
          if (hit) break;
        }
      } else if (layer instanceof L.Polyline) hit = staticOverpassLineHit(layer.getLatLngs(), latlng);
      if (!hit) continue;
      const size = (b.getNorth() - b.getSouth()) * (b.getEast() - b.getWest());
      if (size <= bestSize) { bestSize = size; best = entry; }
    }
    return best;
  }
  function oapStaticInstallInteractions() {
    if (!map || map._faStaticOapInteractions) return;
    map._faStaticOapInteractions = true;
    const container = map.getContainer();
    container.addEventListener("contextmenu", event => {
      if (!STATIC_OAP || !oapEnabled || event.target.closest(".leaflet-marker-icon,.leaflet-tooltip,.leaflet-control,.leaflet-popup")) return;
      const interactivePath = event.target.closest(".leaflet-interactive");
      if (interactivePath && !interactivePath.classList.contains("fa-poi-hit-target")) return;
      const latlng = map.mouseEventToLatLng(event);
      const entry = oapStaticFind(latlng);
      if (!entry) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      oapStaticCloseTooltip();
      entry.layer.fire("contextmenu", {latlng, originalEvent: event}, false);
    }, true);
    map.on("mousemove", event => {
      if (!STATIC_OAP || !oapEnabled || event.originalEvent?.target?.closest?.(".leaflet-marker-icon,.leaflet-interactive,.leaflet-tooltip,.leaflet-popup,.leaflet-control")) return;
      if (oapStaticHoverFrame !== null) return;
      const latlng = event.latlng;
      oapStaticHoverFrame = requestAnimationFrame(() => {
        oapStaticHoverFrame = null;
        if (map.dragging?.moving?.()) { oapStaticCloseTooltip(); return; }
        const entry = oapStaticFind(latlng);
        const key = entry?.key || "";
        if (key === oapStaticHoverKey) return;
        oapStaticCloseTooltip();
        if (!entry) return;
        oapStaticHoverKey = key;
        if (!oapStaticTooltip) oapStaticTooltip = L.tooltip({className: "app-tooltip sar-scene-tooltip oap-scene-tooltip", direction: "auto", interactive: true, opacity: 1});
        oapStaticTooltip.setContent(oapPopupHtml(entry.feature, entry.layer)).setLatLng(latlng).addTo(map);
        const node = oapStaticTooltip.getElement();
        if (node) { L.DomEvent.disableClickPropagation(node); L.DomEvent.disableScrollPropagation(node); }
      });
    });
    container.addEventListener("mouseleave", oapStaticCloseTooltip);
    map.on("movestart zoomstart", oapStaticCloseTooltip);
  }
  let oapController = null;
  let oapRefreshTimer = null;
  let oapEventsBound = false;
  let oapEnabled = false;
  const hiddenOapFeatures = new Set();

  const hiddenOapCenters = new Map();

  function oapFeatureCentroid(feature) {
    const geometry = feature?.geometry;
    if (geometry?.type === "Point") {
      const [lng, lat] = geometry.coordinates || [];
      return Number.isFinite(lng) && Number.isFinite(lat) ? {lng, lat} : null;
    }
    const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
    let area = 0, sumLng = 0, sumLat = 0;
    for (const polygon of polygons) {
      for (let r = 0; r < polygon.length; r += 1) {
        const ring = polygon[r];
        if (!Array.isArray(ring) || ring.length < 3) continue;
        let twiceArea = 0, cx = 0, cy = 0;
        for (let i = 0; i < ring.length; i += 1) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          const cross = a[0] * b[1] - b[0] * a[1];
          twiceArea += cross;
          cx += (a[0] + b[0]) * cross;
          cy += (a[1] + b[1]) * cross;
        }
        if (Math.abs(twiceArea) < 1e-12) continue;
        const weight = (r === 0 ? 1 : -1) * Math.abs(twiceArea) / 2;
        sumLng += cx / (3 * twiceArea) * weight;
        sumLat += cy / (3 * twiceArea) * weight;
        area += weight;
      }
    }
    if (area <= 0) return null;
    const lng = sumLng / area, lat = sumLat / area;
    return Number.isFinite(lng) && Number.isFinite(lat) ? {lng, lat} : null;
  }

  function oapAdjustDensityTile(tile) {
    const features = tile?.data?.get?.("density");
    if (!hiddenOapCenters.size || !features?.length || !tile.dataTile) return tile;
    const {z, x, y} = tile.dataTile;
    const worldTiles = 2 ** z;
    const tileSize = 512;
    const centers = [...hiddenOapCenters.values()].map(({lng, lat}) => {
      const longitude = ((lng + 180) % 360 + 360) % 360;
      const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat));
      const radians = latitude * Math.PI / 180;
      return {
        x: ((longitude / 360) * worldTiles - x) * tileSize,
        y: ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * worldTiles - y) * tileSize
      };
    });
    const polygons = features.filter(feature => feature.geomType === 3 && feature.bbox);
    const deductions = new Map();
    const inside = (point, bbox) => point.x >= bbox.minX && point.x < bbox.maxX && point.y >= bbox.minY && point.y < bbox.maxY;
    for (const point of centers) {
      const cell = polygons.find(feature => inside(point, feature.bbox));
      if (cell) deductions.set(cell, (deductions.get(cell) || 0) + 1);
    }
    if (!deductions.size) return tile;
    const adjusted = features.map(feature => {
      let deduction = deductions.get(feature) || 0;
      if (feature.geomType === 1) {
        const point = feature.geom?.[0]?.[0];
        if (point) {
          const cell = polygons.find(candidate => inside(point, candidate.bbox));
          deduction = deductions.get(cell) || 0;
        }
      }
      if (!deduction) return feature;
      const original = Number(feature.props?.count);
      if (!Number.isFinite(original)) return feature;
      return {...feature, props: {...feature.props, count: String(Math.max(0, original - deduction))}};
    });
    const data = new Map(tile.data);
    data.set("density", adjusted);
    return {...tile, data};
  }

  function oapRepaintDensity() {
    if (!oapCoverageLayer) return;
    oapCoverageLayer.clearLayout?.();
    if (map?.hasLayer(oapCoverageLayer)) oapCoverageLayer.redraw();
  }
  function oapSyncPaneBearing() {
    if (!map) return;
    const center = map.getSize().divideBy(2);
    const bearing = Number(map._bearingRad) || 0;
    for (const name of ["oapPane", "oapMetaPane"]) {
      const pane = map.getPane(name);
      if (!pane) continue;
      pane.style.transformOrigin = `${center.x}px ${center.y}px`;
      pane.style.transform = bearing ? `rotate(${bearing}rad)` : "";
    }
  }

  function oapEnsurePaneBearingSync() {
    if (!map || map._faOapPaneBearingSync) return;
    map._faOapPaneBearingSync = oapSyncPaneBearing;
    map.on("rotate resize", oapSyncPaneBearing);
  }

  function oapEnsurePanes() {
    if (!map) return;
    if (!map.getPane("oapPane")) {
      const pane = map.createPane("oapPane", map._norotatePane || map._mapPane);
      pane.style.zIndex = "426";
      pane.style.pointerEvents = "none";
    }
    if (!map.getPane("oapMetaPane")) {
      const pane = map.createPane("oapMetaPane", map._norotatePane || map._mapPane);
      pane.style.zIndex = "427";
    }
    oapEnsurePaneBearingSync();
    oapSyncPaneBearing();
  }

  function oapEnsureLayer() {
    if (!map) return null;
    oapEnsurePanes();
    if (!oapCoverageLayer && window.protomapsL) {
      oapCoverageLayer = protomapsL.leafletLayer({
        url: OAP_COVERAGE_PMTILES_URL,
        paintRules: [{
          dataLayer: "density",
          filter: (z, feature) => feature.geomType === 3 && Number(feature.props?.count) > 0,
          symbolizer: new protomapsL.PolygonSymbolizer({
            fill: "#111111",
            opacity: (z, feature) => Math.min(0.92, 0.76 + Math.log10(Math.max(1, Number(feature?.props?.count) || 1)) * 0.05),
            stroke: "rgba(228,231,235,0.18)",
            width: 1
          })
        }],
        labelRules: [{
          dataLayer: "density",
          filter: (z, feature) => {
            if (feature?.geomType !== 1) return false;
            const count = feature?.props?.count;
            if (!Number.isFinite(Number(count)) || Number(count) <= 0) return false;
            feature.props.count = String(count);
            return true;
          },
          symbolizer: new protomapsL.CenteredTextSymbolizer({
            labelProps: ["count"],
            fill: "#e4e7eb",
            font: "600 12px system-ui"
          })
        }],
        minZoom: 0,
        maxZoom: 10,
        maxDataZoom: 13,
        pane: "oapPane",
        noWrap: false,
        backgroundColor: "transparent",
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2)
      });
      oapCoverageLayer.options.pmIgnore = true;
      oapCoverageLayer.options.snapIgnore = true;
      for (const view of oapCoverageLayer.views.values()) {
        const loadTile = view.getDisplayTile.bind(view);
        view.getDisplayTile = async coords => oapAdjustDensityTile(await loadTile(coords));
      }
    }
    return oapCoverageLayer;
  }

  function oapClearMetadata() {
    if (STATIC_OAP) oapStaticClear();
    if (oapController) {
      try { oapController.abort(); } catch {}
      oapController = null;
    }
    if (oapLayer && map?.hasLayer(oapLayer)) map.removeLayer(oapLayer);
    if (oapMetaLayer && map?.hasLayer(oapMetaLayer)) map.removeLayer(oapMetaLayer);
    oapMetaLayer = null;
  }

  function oapSyncCoverageStyle() {
    if (!map) return;
    const pane = map.getPane("oapPane");
    if (pane) pane.style.filter = "";
  }



  function oapFeatureKey(feature) {
    return String(feature?.id || feature?.properties?.title || feature?.assets?.visual?.href || "");
  }

  function oapTileUrlForFeatures(features) {
    const ids = [...new Set((Array.isArray(features) ? features : [])
      .map(feature => String(feature?.id || "").trim())
      .filter(Boolean))];
    if (!ids.length) return "";
    return `${OAP_TILE_URL}&ids=${encodeURIComponent(ids.join(","))}`;
  }

  function oapDisplayDate(value) {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value);
    return date.toISOString().replace("T", " ").replace(/.000Z$/, " UTC");
  }

  function oapBrowseUrl(feature, layer) {
    let center = layer?.getBounds?.().getCenter?.() || null;
    if (!center && feature?.geometry) {
      try {
        const bounds = L.geoJSON(feature).getBounds();
        if (bounds?.isValid?.()) center = bounds.getCenter();
      } catch (_) {}
    }
    if (!center) center = map?.getCenter?.() || null;
    if (!center) return "https://imagery.hotosm.org/";
    const longitude = normalizeWorldLongitude(center.lng);
    const itemId = String(feature?.id || "").trim();
    const selected = itemId ? `&selected_id=${encodeURIComponent(itemId)}` : "";
    return `https://imagery.hotosm.org/browse?lat=${encodeURIComponent(center.lat.toFixed(4))}&lon=${encodeURIComponent(longitude.toFixed(4))}&zoom=16.2${selected}`;
  }


  function oapPopupHtml(feature, layer) {
    const properties = feature?.properties || {};
    const title = properties.title || feature?.id || "OpenAerialMap imagery";
    const date = properties.datetime || properties.start_datetime || properties.end_datetime;
    const gsd = Number(properties.gsd);
    const resolution = Number.isFinite(gsd) ? `${gsd.toLocaleString(undefined, {maximumFractionDigits: 3})} m` : properties.gsd;
    const platform = properties["oam:platform_type"] || properties.platform;
    const platformText = ({satellite: "Satellite", uav: "UAV", aircraft: "Aircraft", balloon: "Balloon", kite: "Kite"})[String(platform || "").toLowerCase()] || platform;
    const instruments = Array.isArray(properties.instruments) ? properties.instruments.join(", ") : properties.instruments;
    const product = properties["oam:product_type"];
    const producer = properties["oam:producer_name"] || feature?.providers?.[0]?.name;
    const fileSizeBytes = Number(feature?.assets?.visual?.["file:size"] ?? feature?.assets?.visual?.file_size ?? properties["file:size"] ?? properties["oam:file_size"]);
    const fileSize = Number.isFinite(fileSizeBytes) && fileSizeBytes > 0 ? (fileSizeBytes >= 1000000000 ? `${(fileSizeBytes / 1000000000).toLocaleString(undefined, {maximumFractionDigits: 2})} GB` : `${(fileSizeBytes / 1000000).toLocaleString(undefined, {maximumFractionDigits: 1})} MB`) : "";
    const license = properties.license;
    const rows = [
      ["Date", oapDisplayDate(date)],
      ["Resolution", resolution],
      ["Platform", platformText],
      ["Sensor", instruments],
      ["Product", product],
      ["Producer", producer],
      ["Size", fileSize],
      ["License", license]
    ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
    const browseUrl = oapBrowseUrl(feature, layer);
    const openRow = `<div><span>Open</span><strong><a class="sar-meta-link" href="${esc(browseUrl)}" target="_blank" rel="noopener noreferrer">OpenAerialMap</a></strong></div>`;
    return `<div class="sar-popup oap-popup"><div class="sar-popup-title">${esc(title)}</div><div class="sar-popup-meta">${rows.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}${openRow}</div></div>`;
  }

  function oapFeatureScreenSpan(feature) {
    if (!map || !feature?.geometry) return 0;
    try {
      const bounds = L.geoJSON(feature).getBounds();
      if (!bounds?.isValid?.()) return 0;
      const nw = map.latLngToContainerPoint(bounds.getNorthWest());
      const se = map.latLngToContainerPoint(bounds.getSouthEast());
      return Math.max(Math.abs(se.x - nw.x), Math.abs(se.y - nw.y));
    } catch {
      return 0;
    }
  }

  async function oapLoadMetadata() {
    if (!map || !oapEnabled) return;
    oapSyncCoverageStyle();
    if (map.getZoom() < 7) {
      oapClearMetadata();
      oapEnsureLayer();
      if (oapCoverageLayer && !map.hasLayer(oapCoverageLayer)) oapCoverageLayer.addTo(map);
      return;
    }
    if (oapController) {
      try { oapController.abort(); } catch {}
    }
    const controller = new AbortController();
    oapController = controller;
    const requestBboxes = canonicalViewportBboxes();
    try {
      const collections = await Promise.all(requestBboxes.map(async bounds => {
        const boundsParam = bounds.map(value => value.toFixed(6)).join(",");
        const url = `${OAP_STAC_SEARCH_URL}?collections=openaerialmap&bbox=${encodeURIComponent(boundsParam)}&limit=200`;
        const response = await managedFetch(url, {signal: controller.signal, headers: {Accept: "application/geo+json, application/json"}}, {timeoutMs: 30000, retries: 1, label: "OpenAerialMap metadata"});
        if (!response.ok) throw new Error(`OpenAerialMap metadata request failed (${response.status})`);
        return response.json();
      }));
      if (oapController !== controller || controller.signal.aborted || !oapEnabled) return;
      if (shared.externalSnapGeometryBusy) { shared.oapRefreshDeferred = true; return; }
      const unique = new Map();
      for (const collection of collections) {
        for (const feature of Array.isArray(collection?.features) ? collection.features : []) {
          unique.set(oapFeatureKey(feature), feature);
        }
      }
      const collection = {type: "FeatureCollection", features: [...unique.values()]};
      const zoom = map.getZoom();
      const detailMode = zoom >= 11;
      const canonicalFeatures = collection.features.filter(feature => !hiddenOapFeatures.has(oapFeatureKey(feature)));
      const sourceFeatures = wrapFeaturesForCurrentView(canonicalFeatures, 0.18);
      const displayFeatures = detailMode ? sourceFeatures : sourceFeatures.filter(feature => oapFeatureScreenSpan(feature) >= 96);
      const adaptiveBoundaryMode = !detailMode && displayFeatures.length > 0;
      const displayCollection = {...collection, features: displayFeatures};
      if (oapCoverageLayer) {
        if (detailMode || adaptiveBoundaryMode) {
          if (map.hasLayer(oapCoverageLayer)) map.removeLayer(oapCoverageLayer);
        } else if (!map.hasLayer(oapCoverageLayer)) {
          oapCoverageLayer.addTo(map);
        }
      }
      if (!detailMode && oapLayer && map.hasLayer(oapLayer)) map.removeLayer(oapLayer);
      if (!displayFeatures.length) {
        if (STATIC_OAP) oapStaticClear();
        if (oapMetaLayer && map.hasLayer(oapMetaLayer)) map.removeLayer(oapMetaLayer);
        if (oapLayer && map.hasLayer(oapLayer)) map.removeLayer(oapLayer);
        oapMetaLayer = null;
        return;
      }
      const oapTileUrl = detailMode ? oapTileUrlForFeatures(displayFeatures) : "";
      if (detailMode && oapTileUrl) {
        if (!oapLayer) {
          oapLayer = L.tileLayer(oapTileUrl, {pane: "oapPane", minZoom: 11, maxZoom: 24, noWrap: false, opacity: 1, attribution: OAP_ATTRIBUTION, updateWhenZooming: false, updateWhenIdle: true, keepBuffer: 6});
          oapLayer.options.pmIgnore = true;
          oapLayer.options.snapIgnore = true;
        } else if (oapLayer._url !== oapTileUrl) {
          oapLayer.setUrl(oapTileUrl);
        }
        if (!map.hasLayer(oapLayer)) oapLayer.addTo(map);
      } else if (oapLayer && map.hasLayer(oapLayer)) {
        map.removeLayer(oapLayer);
      }
      if (oapMetaLayer && map.hasLayer(oapMetaLayer)) map.removeLayer(oapMetaLayer);
      if (STATIC_OAP) oapStaticClear();
      oapEnsurePanes();
      if (STATIC_OAP) oapStaticEntries = [];
      oapMetaLayer = L.geoJSON(displayCollection, {
        pane: "oapMetaPane",
        style: {color: "#b8b8b8", weight: 1.5, opacity: 0.95, fillColor: "#c8c8c8", fillOpacity: boundaryFillOpacity, className: "oap-footprint"},
        onEachFeature: (feature, layer) => {
          layer.options.pmIgnore = true;
          layer.options.snapIgnore = !(layer instanceof L.Polyline);
          layer.options.bubblingMouseEvents = false;
          const oapKey = oapFeatureKey(feature);
          layer._faOapFeatureKey = oapKey;
          if (STATIC_OAP && layer instanceof L.Polyline) {
            // Keep original OAP geometry for snapping and menu actions, not painting.
            layer.options.interactive = false;
            layer.options.className = "oap-footprint-snap-only";
            layer._project = () => { layer._rings = []; layer._parts = []; };
            layer._updatePath = () => {};
            oapStaticEntries.push({layer, feature, key: oapKey, bounds: layer.getBounds()});
          }
          const oapCenter = oapFeatureCentroid(feature);
          layer.on("contextmenu", event => {
            if (!window.FAMapContext?.showFeatureMenu) return;
            if (event.originalEvent) {
              event.originalEvent.preventDefault();
              event.originalEvent._faFeatureContextHandled = true;
              L.DomEvent.stopPropagation(event.originalEvent);
            }
            layer.closeTooltip?.();
            const properties = feature?.properties || {};
            const platform = properties["oam:platform_type"] || properties.platform || "";
            const producer = properties["oam:producer_name"] || feature?.providers?.[0]?.name || "";
            const instrumentValue = Array.isArray(properties.instruments) ? properties.instruments.join(", ") : properties.instruments || "";
            const sourceUrl = oapBrowseUrl(feature, layer);
            window.FAMapContext.showFeatureMenu(event, {
              label: "Hide boundary",
              hide: () => {
                hiddenOapFeatures.add(oapKey);
                if (STATIC_OAP) { oapStaticDraw(); oapScheduleRefresh(); }
                if (oapCenter) hiddenOapCenters.set(oapKey, oapCenter);
                oapRepaintDensity();
                notifyOverpass("Boundary hidden.", "success");
                for (const child of oapMetaLayer?.getLayers?.() || []) {
                  if (child._faOapFeatureKey === oapKey) oapMetaLayer.removeLayer(child);
                }
                const remainingOapFeatures = displayFeatures.filter(candidate => oapFeatureKey(candidate) !== oapKey);
                const nextOapTileUrl = oapTileUrlForFeatures(remainingOapFeatures);
                if (oapLayer && map?.hasLayer(oapLayer)) {
                  if (nextOapTileUrl) oapLayer.setUrl(nextOapTileUrl);
                  else map.removeLayer(oapLayer);
                }
                window.FAMapContext?.recordAction?.({
                  scope: "oap",
                  undo: async () => { hiddenOapFeatures.delete(oapKey); hiddenOapCenters.delete(oapKey); oapRepaintDensity(); await oapLoadMetadata(); },
                  redo: async () => { hiddenOapFeatures.add(oapKey); if (oapCenter) hiddenOapCenters.set(oapKey, oapCenter); oapRepaintDensity(); await oapLoadMetadata(); }
                });
              },
              convert: () => beginExternalResultPoiDraft(layer, {
                name: properties.title || feature?.id || "OpenAerialMap imagery",
                category: "OpenAerialMap",
                tags: [platform, producer].filter(Boolean),
                color: "#b8b8b8",
                customFields: {
                  source: "OpenAerialMap",
                  source_id: feature?.id || "",
                  source_url: sourceUrl,
                  date: properties.datetime || properties.start_datetime || properties.end_datetime || "",
                  resolution_m: properties.gsd ?? "",
                  platform,
                  sensor: instrumentValue,
                  product: properties["oam:product_type"] || "",
                  producer,
                  license: properties.license || ""
                }
              })
            });
          });
          let oapTooltipContent = null;
          if (!STATIC_OAP) window.FATooltips.bindInteractive(
            layer,
            () => {
              if (!oapTooltipContent) {
                const holder = document.createElement("div");
                holder.innerHTML = oapPopupHtml(feature, layer);
                oapTooltipContent = holder.firstElementChild;
              }
              return oapTooltipContent;
            },
            {className: "app-tooltip sar-scene-tooltip oap-scene-tooltip", direction: "auto", interactive: true, opacity: 1},
            {
              disableScrollPropagation: true
            }
          );
        }
      });
      oapMetaLayer.options.pmIgnore = true;
      oapMetaLayer.options.snapIgnore = false;
      oapMetaLayer.addTo(map);
      if (STATIC_OAP) oapStaticDraw();
    } catch (error) {
      if (error?.name !== "AbortError") void 0;
    } finally {
      if (oapController === controller) oapController = null;
    }
  }

  function oapScheduleRefresh() {
    clearTimeout(oapRefreshTimer);
    if (!oapEnabled) return;
    if (shared.externalSnapGeometryBusy) { shared.oapRefreshDeferred = true; return; }
    shared.oapRefreshDeferred = false;
    oapRefreshTimer = setTimeout(oapLoadMetadata, 120);
  }

  function oapBindMapEvents() {
    if (!map || oapEventsBound) return;
    oapEventsBound = true;
    map.on("zoomend moveend", oapScheduleRefresh);
    if (STATIC_OAP) oapStaticInstallInteractions();
  }

  function oapSetEnabled(next) {
    const wasEnabled = oapEnabled;
    oapEnabled = Boolean(next);
    if (oapEnabled && !wasEnabled) { hiddenOapFeatures.clear(); hiddenOapCenters.clear(); oapRepaintDensity(); window.FAMapContext?.clearHistory?.("oap"); }
    oapEnsureLayer();
    if (!map) return;
    oapBindMapEvents();
    if (oapEnabled) {
      if (oapCoverageLayer && !map.hasLayer(oapCoverageLayer)) oapCoverageLayer.addTo(map);
      oapSyncCoverageStyle();
      oapScheduleRefresh();
    } else {
      clearTimeout(oapRefreshTimer);
      if (oapLayer && map.hasLayer(oapLayer)) map.removeLayer(oapLayer);
      if (oapCoverageLayer && map.hasLayer(oapCoverageLayer)) map.removeLayer(oapCoverageLayer);
      oapClearMetadata();
    }
    syncToolSlotButtonExternal();
  }

    window.FAOAP = {isEnabled() {return oapEnabled;}, setEnabled: oapSetEnabled};
    return {init(nextMap) {map = nextMap;}, setBoundaryFillOpacity(value) {
      boundaryFillOpacity = value;
      for (const group of [oapMetaLayer, oapStaticDisplay]) {
        group?.eachLayer?.(layer => { if (layer instanceof L.Polygon) layer.setStyle({fillOpacity: boundaryFillOpacity}); });
      }
    }, oapStaticFind, oapScheduleRefresh, oapSetEnabled, oapIsEnabled() {return oapEnabled;}, oapIsOptimized() {return STATIC_OAP;}, setOptimizedRendering(enabled) {STATIC_OAP = Boolean(enabled);}};
  }
  window.FAOAPModule = Object.freeze({createOAP});
})();
