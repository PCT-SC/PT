(() => {
  "use strict";

  const TOOL_SLOT_STORAGE_KEY = "project-tracker-map-tool-slot-v1";
  let toolSlotMode = "ovp";
  try { const savedToolSlotMode = localStorage.getItem(TOOL_SLOT_STORAGE_KEY); if (savedToolSlotMode === "wc" || savedToolSlotMode === "elv" || savedToolSlotMode === "sar" || savedToolSlotMode === "oap" || savedToolSlotMode === "wiki" || savedToolSlotMode === "oim") toolSlotMode = savedToolSlotMode; } catch {}

  function managedFetch(input, init = {}, policy = {}) {
    return window.FANetwork?.fetch ? window.FANetwork.fetch(input, init, policy) : fetch(input, init);
  }

  function overpassNetworkTimeoutMs(query) {
    const text = String(query || "");
    const lower = text.toLowerCase();
    const start = lower.indexOf("[timeout:");
    const end = start >= 0 ? text.indexOf("]", start) : -1;
    const parsed = start >= 0 && end > start ? Number(text.slice(start + 9, end)) : 90;
    const serverSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
    return Math.min(120000, Math.max(30000, serverSeconds * 1000 + 15000));
  }

  // Optimized Overpass batching; compatibility mode retains individual paths.
  let STATIC_OVERPASS = true;
  const ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];


  const PRESETS = [
    {
      group: "Aviation",
      key: "aerodromes",
      label: "Aerodromes",
      checked: true,
      color: "#5aa9ff",
      query: `nwr["aeroway"="aerodrome"]({{bbox}});`
    },
    {
      group: "Aviation",
      key: "heliports",
      label: "Heliports",
      checked: true,
      color: "#55dbe8",
      query: `nwr["aeroway"="heliport"]({{bbox}});`
    },
    {
      group: "Aviation",
      key: "helipads",
      label: "Helipads",
      checked: true,
      color: "#55dbe8",
      query: `nwr["aeroway"="helipad"]({{bbox}});`
    },
    {
      group: "Aviation",
      key: "airstrips",
      label: "Airstrips",
      checked: true,
      color: "#86cfff",
      query: `nwr["aeroway"="airstrip"]({{bbox}});`
    },
    {
      group: "Aviation",
      key: "landing",
      label: "Emergency landing sites",
      checked: true,
      color: "#86cfff",
      query: `nwr["emergency"="landing_site"]({{bbox}});`
    },

    {
      group: "Areas / hazards",
      key: "military",
      label: "Military",
      checked: true,
      color: "#ff6262",
      query:
        `way["landuse"="military"]({{bbox}});` +
        `relation["landuse"="military"]({{bbox}});` +
        `way["military"]["military"!="danger_area"]({{bbox}});` +
        `relation["military"]["military"!="danger_area"]({{bbox}});`
    },
    {
      group: "Areas / hazards",
      key: "danger",
      label: "Danger areas",
      checked: true,
      color: "#ff6262",
      query:
        `way["military"="danger_area"]({{bbox}});` +
        `relation["military"="danger_area"]({{bbox}});`
    },
    {
      group: "Areas / hazards",
      key: "protected",
      label: "Protected areas",
      checked: true,
      color: "#67d67d",
      query:
        `way["boundary"="protected_area"]({{bbox}});` +
        `relation["boundary"="protected_area"]({{bbox}});`
    },
    {
      group: "Areas / hazards",
      key: "nationalpark",
      label: "National parks",
      checked: true,
      color: "#67d67d",
      query:
        `way["boundary"="national_park"]({{bbox}});` +
        `relation["boundary"="national_park"]({{bbox}});`
    },
    {
      group: "Areas / hazards",
      key: "nature",
      label: "Nature reserves",
      checked: true,
      color: "#55c99a",
      query:
        `way["leisure"="nature_reserve"]({{bbox}});` +
        `relation["leisure"="nature_reserve"]({{bbox}});`
    },
    {
      group: "Areas / hazards",
      key: "hazards",
      label: "Hazards",
      checked: true,
      color: "#ffb84d",
      query:
        `way["boundary"="hazard"]({{bbox}});` +
        `relation["boundary"="hazard"]({{bbox}});` +
        `nwr["hazard"]({{bbox}});`
    }
  ];

  let map = null;
  let boundaryFillOpacity = 0.2;
  let panel = null;
  let button = null;
  let syncToolSlotButtonExternal = () => {};
  let activeToolButtons = new Map();
  let worldCoverLegend = null;
  let elevationLegend = null;
  let overpassInfo = null;
  let sarInfo = null;
  let wikiInfo = null;
  let wikiPanel = null;
  let results = null;
  let staticOverpassBuckets = null;
  // Batched paths remain passive; retained geometry provides individual feature hit tests.
  let staticOverpassFeatures = [];
  let staticOverpassTooltip = null;
  let staticOverpassHoverKey = "";
  let staticOverpassHoverFrame = null;
  function closeStaticOverpassTooltip() {
    staticOverpassHoverKey = "";
    if (staticOverpassTooltip && map?.hasLayer(staticOverpassTooltip)) map.removeLayer(staticOverpassTooltip);
  }
  function staticOverpassPointInRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.lat > point.lat) !== (b.lat > point.lat) &&
        point.lng < (b.lng - a.lng) * (point.lat - a.lat) / (b.lat - a.lat) + a.lng) inside = !inside;
    }
    return inside;
  }
  function staticOverpassLineHit(ring, point, tolerance = 9) {
    const cursor = map.latLngToContainerPoint(point);
    for (let i = 1; i < ring.length; i++) {
      const a = map.latLngToContainerPoint(ring[i - 1]);
      const b = map.latLngToContainerPoint(ring[i]);
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((cursor.x - a.x) * dx + (cursor.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(cursor.x - a.x - t * dx, cursor.y - a.y - t * dy) <= tolerance) return true;
    }
    return false;
  }
  function staticOverpassFind(latlng) {
    if (!STATIC_OVERPASS || !map?.hasLayer(results)) return null;
    let best = null, bestArea = Infinity;
    const pixel = 12 * 360 / (256 * Math.pow(2, map.getZoom()));
    for (const entry of staticOverpassFeatures) {
      const bounds = entry.bounds;
      if (!bounds?.isValid()) continue;
      if (latlng.lat < bounds.getSouth() - pixel || latlng.lat > bounds.getNorth() + pixel ||
          latlng.lng < bounds.getWest() - pixel || latlng.lng > bounds.getEast() + pixel) continue;
      const rings = entry.layer.getLatLngs();
      let hit = false;
      if (entry.layer instanceof L.Polygon) {
        hit = staticOverpassPointInRing(latlng, rings[0]) && !rings.slice(1).some(ring => staticOverpassPointInRing(latlng, ring));
        if (!hit) hit = rings.some(ring => staticOverpassLineHit(ring, latlng));
      } else hit = staticOverpassLineHit(rings, latlng);
      if (!hit) continue;
      const size = (bounds.getNorth() - bounds.getSouth()) * (bounds.getEast() - bounds.getWest());
      if (size <= bestArea) { bestArea = size; best = entry; }
    }
    return best;
  }
  function installStaticOverpassInteractions() {
    const container = map.getContainer();
    // Capture right-clicks on passive SVG before the map's generic context menu.
    container.addEventListener("contextmenu", event => {
      if (!map.hasLayer(results) || event.target.closest(".leaflet-marker-icon,.leaflet-tooltip,.leaflet-control,.leaflet-popup")) return;
      const interactivePath = event.target.closest(".leaflet-interactive");
      if (interactivePath && !interactivePath.classList.contains("fa-poi-hit-target")) return;
      const latlng = map.mouseEventToLatLng(event);
      if (oapIsOptimized() && oapIsEnabled() && oapStaticFind(latlng)) return;
      const entry = staticOverpassFind(latlng);
      if (!entry) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeStaticOverpassTooltip();
      entry.layer.fire("contextmenu", {latlng, originalEvent: event}, false);
    }, true);
    container.addEventListener("mousemove", event => {
      if (event.target?.closest?.(".leaflet-marker-icon,.leaflet-tooltip,.leaflet-popup,.leaflet-control")) return;
      if (staticOverpassHoverFrame !== null) return;
      const latlng = map.mouseEventToLatLng(event);
      if (oapIsOptimized() && oapIsEnabled() && oapStaticFind(latlng)) { closeStaticOverpassTooltip(); return; }
      staticOverpassHoverFrame = requestAnimationFrame(() => {
        staticOverpassHoverFrame = null;
        if (!map.hasLayer(results) || map.dragging?.moving?.()) { closeStaticOverpassTooltip(); return; }
        const entry = staticOverpassFind(latlng);
        const key = entry ? overpassFeatureKey(entry.element) : "";
        if (key === staticOverpassHoverKey) return;
        closeStaticOverpassTooltip();
        if (!entry) return;
        staticOverpassHoverKey = key;
        if (!staticOverpassTooltip) staticOverpassTooltip = L.tooltip({direction:"auto", offset:[0,0], className:"poi-hover-tooltip ovp-hover-tooltip", interactive:true, opacity:1});
        staticOverpassTooltip.setContent(previewHtml(entry.element)).setLatLng(latlng).addTo(map);
        const node = staticOverpassTooltip.getElement();
        if (node) { L.DomEvent.disableClickPropagation(node); L.DomEvent.disableScrollPropagation(node); installTooltipMiddleClickLinks(node); }
      });
    }, true);
    container.addEventListener("mouseleave", closeStaticOverpassTooltip);
    map.on("movestart zoomstart", closeStaticOverpassTooltip);
    map.on("layerremove", event => { if (event.layer === results) closeStaticOverpassTooltip(); });
  }
  let controller = null;
  let activeTab = "presets";
  let overpassHasQueried = false;
  const hiddenOverpassFeatures = new Set();
  let lastOverpassElements = [];
  let overpassRenderedWorldIndex = null;
  let overpassQueryExtentLayer = null;
  let wikiQueryExtentLayer = null;

  function normalizeWorldLongitude(longitude) {
    const value = Number(longitude);
    if (!Number.isFinite(value)) return 0;
    return ((value + 180) % 360 + 360) % 360 - 180;
  }

  function currentMapWorldIndex() {
    return map ? Math.round(Number(map.getCenter()?.lng || 0) / 360) : 0;
  }

  function currentMapWorldOffsets() {

    const world = currentMapWorldIndex();

    return [world - 1, world, world + 1].map(index => index * 360);

  }


  function unwrapLeafletLatLngPairs(latlngs) {
    if (!Array.isArray(latlngs) || !latlngs.length) return latlngs || [];
    let previous = Number(latlngs[0][1]);
    return latlngs.map((point, index) => {
      let lng = Number(point[1]);
      if (index > 0) {
        while (lng - previous > 180) lng -= 360;
        while (lng - previous < -180) lng += 360;
      }
      previous = lng;
      return [Number(point[0]), lng];
    });
  }

  function shiftCoordinateTree(value, longitudeOffset) {
    if (!Array.isArray(value)) return value;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      return [Number(value[0]) + longitudeOffset, Number(value[1]), ...value.slice(2)];
    }
    return value.map(item => shiftCoordinateTree(item, longitudeOffset));
  }

  function unwrapCoordinateTree(value, referenceLongitude = null) {
    if (!Array.isArray(value)) return value;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) return value.slice();
    if (value.length && value.every(item => Array.isArray(item) && item.length >= 2 && Number.isFinite(Number(item[0])) && Number.isFinite(Number(item[1])))) {
      let previous = Number.isFinite(Number(referenceLongitude)) ? Number(referenceLongitude) : Number(value[0][0]);
      return value.map((point, index) => {
        let lng = Number(point[0]);
        if (index > 0 || Number.isFinite(Number(referenceLongitude))) {
          while (lng - previous > 180) lng -= 360;
          while (lng - previous < -180) lng += 360;
        }
        previous = lng;
        return [lng, Number(point[1]), ...point.slice(2)];
      });
    }
    return value.map(item => unwrapCoordinateTree(item, referenceLongitude));
  }

  function shiftFeatureLongitude(feature, longitudeOffset) {
    if (!feature?.geometry) return feature;
    const unwrapped = unwrapCoordinateTree(feature.geometry.coordinates);
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: shiftCoordinateTree(unwrapped, longitudeOffset)
      }
    };
  }

  const worldFeatureBoundsCache = new WeakMap();
  function featureCoordinateBounds(feature) {
    const cached = worldFeatureBoundsCache.get(feature);
    if (cached) return cached;
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates)) return null;
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    const visit = value => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
        const lng = Number(value[0]);
        const lat = Number(value[1]);
        west = Math.min(west, lng);
        east = Math.max(east, lng);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
        return;
      }
      value.forEach(visit);
    };
    visit(unwrapCoordinateTree(coordinates));
    const result = [west, east, south, north].every(Number.isFinite) ? {west, east, south, north} : null;
    if (result) worldFeatureBoundsCache.set(feature, result);
    return result;
  }

  function featureIntersectsCurrentView(feature, longitudeOffset = 0, padFactor = 0.12) {
    if (!map) return true;
    const bounds = featureCoordinateBounds(feature);
    if (!bounds) return true;
    const view = map.getBounds();
    const lngPad = Math.max(1, Math.abs(view.getEast() - view.getWest()) * padFactor);
    const latPad = Math.max(1, Math.abs(view.getNorth() - view.getSouth()) * padFactor);
    return bounds.east + longitudeOffset >= view.getWest() - lngPad &&
      bounds.west + longitudeOffset <= view.getEast() + lngPad &&
      bounds.north >= view.getSouth() - latPad &&
      bounds.south <= view.getNorth() + latPad;
  }

  function wrapFeaturesForCurrentView(features, padFactor = 0.12) {
    const wrapped = [];
    for (const feature of Array.isArray(features) ? features : []) {
      for (const offset of currentMapWorldOffsets()) {
        if (!featureIntersectsCurrentView(feature, offset, padFactor)) continue;
        wrapped.push(shiftFeatureLongitude(feature, offset));
      }
    }
    return wrapped;
  }

  function canonicalViewportBboxes(bounds = map?.getBounds?.()) {
    if (!bounds) return [];
    const south = Math.max(-85.05112878, Number(bounds.getSouth()));
    const north = Math.min(85.05112878, Number(bounds.getNorth()));
    const rawWest = Number(bounds.getWest());
    const rawEast = Number(bounds.getEast());
    const span = rawEast - rawWest;
    if (![south, north, rawWest, rawEast, span].every(Number.isFinite)) return [];
    if (span >= 360) return [[-180, south, 180, north]];
    const worldOffset = Math.round(((rawWest + rawEast) / 2) / 360) * 360;
    let west = rawWest - worldOffset;
    let east = rawEast - worldOffset;
    while (west < -180) { west += 360; east += 360; }
    while (west >= 180) { west -= 360; east -= 360; }
    if (east <= 180) return [[west, south, east, north]];
    return [[west, south, 180, north], [-180, south, east - 360, north]];
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function ensureQueryExtentPane() {
    if (!map || map.getPane("queryExtentPane")) return;
    const pane = map.createPane("queryExtentPane", map._rotatePane || map.getPane("overlayPane"));
    pane.style.zIndex = "445";
    pane.style.pointerEvents = "none";
  }

  function queryExtentLayer(kind) {
    return kind === "wiki" ? wikiQueryExtentLayer : overpassQueryExtentLayer;
  }

  function setQueryExtentLayer(kind, layer) {
    if (kind === "wiki") wikiQueryExtentLayer = layer;
    else overpassQueryExtentLayer = layer;
  }

  function clearQueryExtent(kind) {
    const layer = queryExtentLayer(kind);
    if (layer && map?.hasLayer?.(layer)) map.removeLayer(layer);
    setQueryExtentLayer(kind, null);
  }

  function visibleMapLeftInset() {
    if (!map) return 0;
    const app = document.getElementById("app");
    const sidebar = document.querySelector(".sidebar");
    if (!app || !sidebar || window.innerWidth <= 760 || app.classList.contains("sidebar-collapsed")) return 0;
    const mapRect = map.getContainer().getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    return Math.max(0, Math.min(map.getSize().x, sidebarRect.right - mapRect.left));
  }

  function captureQueryExtentGeometry() {
    if (!map) return null;
    const size = map.getSize();
    if (!size || size.x <= 0 || size.y <= 0) return null;
    const left = visibleMapLeftInset();
    const screenCorners = [L.point(left, 0), L.point(size.x, 0), L.point(size.x, size.y), L.point(left, size.y)];
    const corners = screenCorners.map(point => map.containerPointToLatLng(point));
    return {corners, bounds: L.latLngBounds(corners)};
  }

  function setQueryExtent(kind, geometry) {
    clearQueryExtent(kind);
    if (!map || !geometry?.corners?.length) return;
    ensureQueryExtentPane();
    const layer = L.polygon(geometry.corners, {
      pane: "queryExtentPane",
      color: "#b8bdc4",
      weight: 1.5,
      opacity: 1,
      dashArray: "6 6",
      lineCap: "butt",
      fill: false,
      interactive: false,
      bubblingMouseEvents: false,
      pmIgnore: true,
      snapIgnore: true
    });
    if (kind === "ovp") layer._faOverpassExtent = true;
    setQueryExtentLayer(kind, layer);
    layer.addTo(map);
  }

  function setQueryExtentVisible(kind, visible) {
    const layer = queryExtentLayer(kind);
    if (!map || !layer) return;
    if (visible && !map.hasLayer(layer)) layer.addTo(map);
    if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
  }

  function ensurePane() {
    if (map.getPane("overpassPane")) return;

    const pane = map.createPane(
      "overpassPane",
      map._rotatePane || map.getPane("overlayPane")
    );

    pane.style.zIndex = "430";
  }


  function ensureResults() {
    if (!results) {
      results = L.layerGroup();
      results.options.pmIgnore = true;
      results.options.snapIgnore = false;
    }

    if (!map.hasLayer(results)) results.addTo(map);

    return results;
  }

  function overpassViewportFilter(geometry) {
    if (!geometry?.corners?.length) throw new Error("Unable to determine the current map view.");
    const offset = currentMapWorldIndex() * 360;
    const points = geometry.corners.map(point => [Number(point.lat), normalizeWorldLongitude(Number(point.lng) - offset)]);
    return `poly:"${points.map(([lat, lon]) => `${lat.toFixed(6)} ${lon.toFixed(6)}`).join(" ")}"`;
  }

  function overpassViewportCanonicalBboxes(geometry) {
    if (!Array.isArray(geometry?.corners) || geometry.corners.length < 3) throw new Error("Unable to determine the current map view.");
    const referenceLng = viewportReferenceLongitude(geometry.corners);
    const points = geometry.corners.map(point => viewportGeometryPoint(point, referenceLng)).filter(Boolean);
    if (points.length < 3) throw new Error("Unable to determine the current map view.");
    const south = Math.max(-85.05112878, Math.min(...points.map(point => point[1])));
    const north = Math.min(85.05112878, Math.max(...points.map(point => point[1])));
    let west = Math.min(...points.map(point => point[0]));
    let east = Math.max(...points.map(point => point[0]));
    if (east - west >= 360) return [[-180, south, 180, north]];
    const worldOffset = Math.round(((west + east) / 2) / 360) * 360;
    west -= worldOffset;
    east -= worldOffset;
    while (west < -180) { west += 360; east += 360; }
    while (west >= 180) { west -= 360; east -= 360; }
    if (east <= 180) return [[west, south, east, north]];
    return [[west, south, 180, north], [-180, south, east - 360, north]];
  }

  function overpassViewportBboxFilters(geometry) {
    return overpassViewportCanonicalBboxes(geometry).map(([west, south, east, north]) => `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`);
  }

  function viewportCrossesDateLine(geometry) {
    return overpassViewportCanonicalBboxes(geometry).length > 1;
  }

  function queryPointInViewport(lat, lon, corners) {
    if (!Array.isArray(corners) || corners.length < 3) return false;
    const referenceLng = corners.reduce((sum, point) => sum + Number(point.lng || 0), 0) / corners.length;
    let pointLng = Number(lon);
    while (pointLng - referenceLng > 180) pointLng -= 360;
    while (pointLng - referenceLng < -180) pointLng += 360;
    const pointLat = Number(lat);
    let inside = false;
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
      const yi = Number(corners[i].lat);
      const yj = Number(corners[j].lat);
      let xi = Number(corners[i].lng);
      let xj = Number(corners[j].lng);
      while (xi - referenceLng > 180) xi -= 360;
      while (xi - referenceLng < -180) xi += 360;
      while (xj - referenceLng > 180) xj -= 360;
      while (xj - referenceLng < -180) xj += 360;
      const intersects = ((yi > pointLat) !== (yj > pointLat)) && (pointLng < (xj - xi) * (pointLat - yi) / ((yj - yi) || Number.EPSILON) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function viewportReferenceLongitude(corners) {
    if (!Array.isArray(corners) || !corners.length) return 0;
    let previous = Number(corners[0]?.lng);
    if (!Number.isFinite(previous)) previous = 0;
    let total = previous;
    let count = 1;
    for (let i = 1; i < corners.length; i += 1) {
      let lng = Number(corners[i]?.lng);
      if (!Number.isFinite(lng)) continue;
      while (lng - previous > 180) lng -= 360;
      while (lng - previous < -180) lng += 360;
      previous = lng;
      total += lng;
      count += 1;
    }
    return total / count;
  }

  function viewportGeometryPoint(point, referenceLng) {
    const lat = Number(Array.isArray(point) ? point[1] : point?.lat);
    let lng = Number(Array.isArray(point) ? point[0] : (point?.lon ?? point?.lng));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    while (lng - referenceLng > 180) lng -= 360;
    while (lng - referenceLng < -180) lng += 360;
    return [lng, lat];
  }

  function pointInPlanarPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      const intersects = ((yi > point[1]) !== (yj > point[1])) && (point[0] < (xj - xi) * (point[1] - yi) / ((yj - yi) || Number.EPSILON) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function planarPointOnSegment(point, a, b) {
    const cross = (point[1] - a[1]) * (b[0] - a[0]) - (point[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(cross) > 1e-10) return false;
    return point[0] >= Math.min(a[0], b[0]) - 1e-10 && point[0] <= Math.max(a[0], b[0]) + 1e-10 && point[1] >= Math.min(a[1], b[1]) - 1e-10 && point[1] <= Math.max(a[1], b[1]) + 1e-10;
  }

  function planarSegmentsIntersect(a, b, c, d) {
    const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);
    if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
    return planarPointOnSegment(c, a, b) || planarPointOnSegment(d, a, b) || planarPointOnSegment(a, c, d) || planarPointOnSegment(b, c, d);
  }

  function overpassGeometryTouchesViewport(geometry, corners) {
    if (!Array.isArray(geometry) || !geometry.length || !Array.isArray(corners) || corners.length < 3) return false;
    const referenceLng = viewportReferenceLongitude(corners);
    const viewport = corners.map(point => viewportGeometryPoint(point, referenceLng)).filter(Boolean);
    const points = geometry.map(point => viewportGeometryPoint(point, referenceLng)).filter(Boolean);
    if (viewport.length < 3 || !points.length) return false;
    if (points.some(point => pointInPlanarPolygon(point, viewport))) return true;
    for (let i = 1; i < points.length; i += 1) {
      for (let j = 0; j < viewport.length; j += 1) {
        if (planarSegmentsIntersect(points[i - 1], points[i], viewport[j], viewport[(j + 1) % viewport.length])) return true;
      }
    }
    const closed = points.length >= 4 && Math.abs(points[0][0] - points[points.length - 1][0]) <= 1e-10 && Math.abs(points[0][1] - points[points.length - 1][1]) <= 1e-10;
    return closed && viewport.some(point => pointInPlanarPolygon(point, points));
  }

  function pointInOverpassGeometrySegments(point, geometries, referenceLng) {
    let inside = false;
    for (const geometry of geometries) {
      const points = geometry.map(value => viewportGeometryPoint(value, referenceLng)).filter(Boolean);
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        if (planarPointOnSegment(point, a, b)) return true;
        const intersects = ((a[1] > point[1]) !== (b[1] > point[1])) && (point[0] < (b[0] - a[0]) * (point[1] - a[1]) / ((b[1] - a[1]) || Number.EPSILON) + a[0]);
        if (intersects) inside = !inside;
      }
    }
    return inside;
  }

  function overpassElementTouchesViewport(element, corners) {
    if (queryPointInViewport(Number(element?.lat), Number(element?.lon), corners)) return true;
    if (queryPointInViewport(Number(element?.center?.lat), Number(element?.center?.lon), corners)) return true;
    if (overpassGeometryTouchesViewport(element?.geometry, corners)) return true;
    const memberGeometries = (Array.isArray(element?.members) ? element.members : []).map(member => member?.geometry).filter(Array.isArray);
    if (memberGeometries.some(geometry => overpassGeometryTouchesViewport(geometry, corners))) return true;
    if (String(element?.type || "") === "relation" && memberGeometries.length) {
      const referenceLng = viewportReferenceLongitude(corners);
      const viewport = corners.map(point => viewportGeometryPoint(point, referenceLng)).filter(Boolean);
      if (viewport.some(point => pointInOverpassGeometrySegments(point, memberGeometries, referenceLng))) return true;
    }
    return false;
  }

  function filterOverpassDataToViewport(data, geometry) {
    if (!geometry?.corners?.length || !Array.isArray(data?.elements)) return data;
    return {...data, elements: data.elements.filter(element => overpassElementTouchesViewport(element, geometry.corners))};
  }

  function category(tags = {}) {
    if (tags.hazard || tags.boundary === "hazard")
      return "hazards";

    if (tags.military === "danger_area")
      return "danger";

    if (
      tags.landuse === "military" ||
      tags.military ||
      tags.boundary === "military"
    )
      return "military";

    if (tags.boundary === "protected_area")
      return "protected";

    if (tags.boundary === "national_park")
      return "nationalpark";

    if (tags.leisure === "nature_reserve")
      return "nature";

    if (tags.emergency === "landing_site")
      return "landing";

    if (tags.aeroway === "heliport")
      return "heliports";

    if (tags.aeroway === "helipad")
      return "helipads";

    if (tags.aeroway === "airstrip")
      return "airstrips";

    if (tags.aeroway === "aerodrome")
      return "aerodromes";

    return "custom";
  }

  function preset(key) {
    return PRESETS.find(x => x.key === key);
  }

  function styleFor(tags) {
    const key = category(tags);
    const p = preset(key);

    const color = p?.color || "#f1d36b";

    return {
      color,
      fillColor: color,
      weight: key === "military" || key === "danger" ? 2.5 : 2,
      fillOpacity: boundaryFillOpacity,
      dashArray:
        key === "danger"
          ? "7 5"
          : key === "protected" ||
            key === "nationalpark" ||
            key === "nature"
            ? "5 4"
            : null,
      pane: "overpassPane",
      smoothFactor: 1.5,
      pmIgnore: true,
      snapIgnore: false
    };
  }

  function installTooltipMiddleClickLinks(element) {
    if (!element || element._faMiddleClickLinksInstalled) return;
    element._faMiddleClickLinksInstalled = true;
    const stopMiddleLinkGesture = event => {
      if (event.button !== 1 || !event.target.closest?.("a[href]")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener("pointerdown", stopMiddleLinkGesture);
    element.addEventListener("mousedown", stopMiddleLinkGesture);
    element.addEventListener("auxclick", event => {
      if (event.button !== 1) return;
      const link = event.target.closest?.("a[href]");
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      window.open(link.href, "_blank", "noopener,noreferrer");
    });
  }

  function externalPoiGeometry(layer) {
    try {
      const feature = layer?.toGeoJSON?.();
      return feature?.type === "Feature" ? feature.geometry : feature?.geometry || null;
    } catch (_) {
      return null;
    }
  }

  function externalPoiGeometrySupported(geometry) {
    return ["Point", "Polygon", "MultiPolygon"].includes(String(geometry?.type || ""));
  }

  function overpassCoordinate(point) {
    const lat = Number(point?.lat);
    const lon = Number(point?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null;
  }

  function overpassCoordinatesEqual(a, b, tolerance = 1e-7) {
    return Array.isArray(a) && Array.isArray(b) && Math.abs(Number(a[0]) - Number(b[0])) <= tolerance && Math.abs(Number(a[1]) - Number(b[1])) <= tolerance;
  }

  function normalizeOverpassRing(coordinates) {
    const cleaned = [];
    for (const coordinate of coordinates || []) {
      if (!Array.isArray(coordinate) || !Number.isFinite(Number(coordinate[0])) || !Number.isFinite(Number(coordinate[1]))) continue;
      const next = [Number(coordinate[0]), Number(coordinate[1])];
      if (!cleaned.length || !overpassCoordinatesEqual(cleaned[cleaned.length - 1], next)) cleaned.push(next);
    }
    if (cleaned.length < 3) return null;
    if (overpassCoordinatesEqual(cleaned[0], cleaned[cleaned.length - 1])) cleaned[cleaned.length - 1] = [...cleaned[0]];
    else cleaned.push([...cleaned[0]]);
    return cleaned.length >= 4 ? cleaned : null;
  }

  function stitchOverpassRings(segmentGeometries) {
    const pending = (segmentGeometries || []).map(geometry => (geometry || []).map(overpassCoordinate).filter(Boolean)).filter(segment => segment.length >= 2);
    const rings = [];
    while (pending.length) {
      let chain = pending.shift();
      let changed = true;
      while (changed && pending.length && !overpassCoordinatesEqual(chain[0], chain[chain.length - 1])) {
        changed = false;
        for (let index = 0; index < pending.length; index += 1) {
          const segment = pending[index];
          const chainStart = chain[0];
          const chainEnd = chain[chain.length - 1];
          const segmentStart = segment[0];
          const segmentEnd = segment[segment.length - 1];
          if (overpassCoordinatesEqual(chainEnd, segmentStart)) {
            chain = [...chain, ...segment.slice(1)];
          } else if (overpassCoordinatesEqual(chainEnd, segmentEnd)) {
            chain = [...chain, ...[...segment].reverse().slice(1)];
          } else if (overpassCoordinatesEqual(chainStart, segmentEnd)) {
            chain = [...segment.slice(0, -1), ...chain];
          } else if (overpassCoordinatesEqual(chainStart, segmentStart)) {
            chain = [...[...segment].reverse().slice(0, -1), ...chain];
          } else {
            continue;
          }
          pending.splice(index, 1);
          changed = true;
          break;
        }
      }
      if (!overpassCoordinatesEqual(chain[0], chain[chain.length - 1])) continue;
      const ring = normalizeOverpassRing(chain);
      if (ring) rings.push(ring);
    }
    return rings;
  }

  function overpassPointInRing(point, ring) {
    if (!Array.isArray(point) || !Array.isArray(ring) || ring.length < 4) return false;
    const x = Number(point[0]);
    const y = Number(point[1]);
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const xi = Number(ring[index][0]);
      const yi = Number(ring[index][1]);
      const xj = Number(ring[previous][0]);
      const yj = Number(ring[previous][1]);
      const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function overpassRelationPoiGeometry(element) {
    if (String(element?.type || "") !== "relation") return null;
    const members = Array.isArray(element.members) ? element.members : [];
    const outerRings = stitchOverpassRings(members.filter(member => String(member?.role || "").toLowerCase() !== "inner").map(member => member?.geometry));
    if (!outerRings.length) return null;
    const innerRings = stitchOverpassRings(members.filter(member => String(member?.role || "").toLowerCase() === "inner").map(member => member?.geometry));
    const polygons = outerRings.map(ring => [ring]);
    for (const hole of innerRings) {
      const point = hole[0];
      const polygonIndex = outerRings.findIndex(ring => overpassPointInRing(point, ring));
      if (polygonIndex >= 0) polygons[polygonIndex].push(hole);
    }
    return polygons.length === 1
      ? {type: "Polygon", coordinates: polygons[0]}
      : {type: "MultiPolygon", coordinates: polygons};
  }

  function overpassElementPoiGeometry(element, layer) {
    const relationGeometry = overpassRelationPoiGeometry(element);
    if (relationGeometry) return relationGeometry;
    const direct = externalPoiGeometry(layer);
    if (externalPoiGeometrySupported(direct)) return direct;
    if (String(direct?.type || "") === "LineString") {
      const ring = normalizeOverpassRing(direct.coordinates);
      if (ring && overpassCoordinatesEqual(direct.coordinates?.[0], direct.coordinates?.[direct.coordinates.length - 1])) return {type: "Polygon", coordinates: [ring]};
    }
    if (String(element?.type || "") === "way" && Array.isArray(element.geometry)) {
      const coordinates = element.geometry.map(overpassCoordinate).filter(Boolean);
      if (coordinates.length >= 4 && overpassCoordinatesEqual(coordinates[0], coordinates[coordinates.length - 1])) {
        const ring = normalizeOverpassRing(coordinates);
        if (ring) return {type: "Polygon", coordinates: [ring]};
      }
    }
    return direct;
  }

  function beginExternalResultPoiDraft(layer, defaults = {}) {
    const geometry = defaults.geometry || externalPoiGeometry(layer);
    if (!externalPoiGeometrySupported(geometry)) {
      notifyOverpass("This result cannot be converted to a point or polygon POI.", "info");
      return false;
    }
    if (!window.FAPOI?.beginExternalDraft) {
      notifyOverpass("POI editor is unavailable.", "info");
      return false;
    }
    return window.FAPOI.beginExternalDraft({...defaults, geometry});
  }

  function previewHtml(element) {
    const tags = element.tags || {};
    const key = category(tags);
    const item = preset(key);
    const categoryLabel = item?.label || "OSM feature";
    const color = item?.color || "#f1d36b";
    const title = tags.name || tags["name:en"] || categoryLabel;

    const preferred = [
      "aeroway",
      "military",
      "landuse",
      "boundary",
      "leisure",
      "hazard",
      "emergency",
      "operator",
      "access",
      "protect_class"
    ];

    const details = preferred
      .filter(tag => tags[tag] != null)
      .map(tag =>
        `<div class="poi-hover-detail"><span class="poi-hover-label">${esc(tag.toUpperCase())}</span><span>${esc(tags[tag])}</span></div>`
      );

    if (
      element.type === "node" &&
      Number.isFinite(element.lat) &&
      Number.isFinite(element.lon)
    ) {
      details.push(
        `<div class="poi-hover-detail"><span class="poi-hover-label">COORDS</span><span>${element.lat.toFixed(6)}, ${element.lon.toFixed(6)}</span></div>`
      );
    }

    const type = String(element.type || "").toLowerCase();
    const id = String(element.id || "");
    const hasOsmLink = /^(node|way|relation)$/.test(type) && /^[0-9]+$/.test(id);
    details.push(
      `<div class="poi-hover-detail"><span class="poi-hover-label">OSM</span><span>${esc(element.type)}/${esc(element.id)}</span></div>`
    );
    const openRow = hasOsmLink
      ? `<div class="sar-popup-meta ovp-tooltip-meta"><div><span>Open</span><strong><a class="sar-meta-link" href="https://www.openstreetmap.org/${esc(type)}/${esc(id)}" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></strong></div></div>`
      : "";

    return `<div class="poi-hover-preview ovp-tooltip-card"><div class="poi-hover-name">${esc(title)}</div><div class="poi-hover-category"><span class="poi-hover-category-dot" style="background:${esc(color)}"></span><span>${esc(categoryLabel)}</span></div>${details.join("")}${openRow}</div>`;
  }

  function overpassFeatureKey(element) {
    return `${String(element?.type || "feature")}:${String(element?.id ?? "")}`;
  }

  function flushStaticOverpass() {
    if (!staticOverpassBuckets) return;
    const group = ensureResults();
    for (const batch of staticOverpassBuckets.values()) {
      const options = {...batch.style, pane: "overlayPane", fillRule: "nonzero", interactive: false, bubblingMouseEvents: false, pmIgnore: true, snapIgnore: true};
      if (batch.polygons.length) group.addLayer(L.polygon(batch.polygons, options));
      if (batch.lines.length) group.addLayer(L.polyline(batch.lines, options));
    }
    staticOverpassBuckets = null;
  }
  function addGeometry(element) {
    const featureKey = overpassFeatureKey(element);
    if (hiddenOverpassFeatures.has(featureKey)) return 0;
    const group = ensureResults();
    const tags = element.tags || {};
    const style = styleFor(tags);

    const bindOne = layer => {
      const isStaticVector = Boolean(staticOverpassBuckets && layer instanceof L.Polyline && !(layer instanceof L.CircleMarker));
      if (isStaticVector) {
        const key = JSON.stringify(style);
        let batch = staticOverpassBuckets.get(key);
        if (!batch) { batch = {style, polygons: [], lines: []}; staticOverpassBuckets.set(key, batch); }
        if (layer instanceof L.Polygon) {
          const rings = layer.getLatLngs().map((ring, index) => {
            let area = 0;
            for (let i = 0; i < ring.length; i++) {
              const a = ring[i], b = ring[(i + 1) % ring.length];
              area += a.lng * b.lat - b.lng * a.lat;
            }
            const needsReverse = index === 0 ? area < 0 : area > 0;
            return needsReverse ? ring.slice().reverse() : ring;
          });
          batch.polygons.push(rings);
        } else batch.lines.push(layer.getLatLngs());
        staticOverpassFeatures.push({layer, element, bounds: layer.getBounds()});
      }
      layer.options.pmIgnore = true;
      layer.options.snapIgnore = !(layer instanceof L.Polyline);
      layer.options.bubblingMouseEvents = false;
      layer._faOverpassFeatureKey = featureKey;
      layer.on("contextmenu", event => {
        if (!window.FAMapContext?.showFeatureMenu) return;
        if (event.originalEvent) {
          event.originalEvent.preventDefault();
          event.originalEvent._faFeatureContextHandled = true;
          L.DomEvent.stopPropagation(event.originalEvent);
        }
        layer.closeTooltip?.();
        const draftGeometry = overpassElementPoiGeometry(element, layer);
        const tagsForDraft = element.tags || {};
        const categoryKey = category(tagsForDraft);
        const categoryPreset = preset(categoryKey);
        const osmType = String(element.type || "");
        const osmId = String(element.id ?? "");
        const sourceUrl = /^(node|way|relation)$/.test(osmType) && /^[0-9]+$/.test(osmId) ? `https://www.openstreetmap.org/${osmType}/${osmId}` : "";
        const options = {
          label: element.type === "node" ? "Hide feature" : "Hide boundary",
          hide: () => {
            hiddenOverpassFeatures.add(featureKey);
            if (STATIC_OVERPASS) refreshOverpassWorldCopies(true);
            notifyOverpass("Boundary hidden.", "success");
            for (const child of group.getLayers()) {
              if (child._faOverpassFeatureKey === featureKey) group.removeLayer(child);
            }
            window.FAMapContext?.recordAction?.({
              scope: "ovp",
              undo: () => {
                hiddenOverpassFeatures.delete(featureKey);
                if (STATIC_OVERPASS) { refreshOverpassWorldCopies(true); return; }
                addGeometry(element);
                syncOverpassResultButton();
              },
              redo: () => {
                hiddenOverpassFeatures.add(featureKey);
                if (STATIC_OVERPASS) refreshOverpassWorldCopies(true);
                for (const child of group.getLayers()) {
                  if (child._faOverpassFeatureKey === featureKey) group.removeLayer(child);
                }
                syncOverpassResultButton();
              }
            });
            syncOverpassResultButton();
          }
        };
        if (externalPoiGeometrySupported(draftGeometry)) {
          options.convert = () => beginExternalResultPoiDraft(layer, {
            geometry: draftGeometry,
            name: tagsForDraft.name || tagsForDraft["name:en"] || categoryPreset?.label || "OpenStreetMap feature",
            category: categoryPreset?.label || "OpenStreetMap",
            tags: ["OpenStreetMap", categoryPreset?.label].filter(Boolean),
            color: categoryPreset?.color || "",
            customFields: {source: "OpenStreetMap", osm_type: osmType, osm_id: osmId, source_url: sourceUrl, osm_tags: tagsForDraft}
          });
        }
        window.FAMapContext.showFeatureMenu(event, options);
      });
      if (!isStaticVector) window.FATooltips.bindInteractive(
        layer,
        previewHtml(element),
        {
          direction: element.type === "node" ? "top" : "auto",
          offset: element.type === "node" ? [0, -9] : [0, 0],
          className: "poi-hover-tooltip ovp-hover-tooltip",
          interactive: true,
          opacity: 1
        },
        {
          disableScrollPropagation: true,
          onElementReady: installTooltipMiddleClickLinks
        }
      );
      if (!isStaticVector) group.addLayer(layer);
    };

    const bindCopies = factory => {
      bindOne(factory(currentMapWorldIndex() * 360));
    };

    if (element.type === "node" && Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
      bindCopies(offset => L.circleMarker([element.lat, element.lon + offset], {...style, radius: 5, weight: 2, fillOpacity: 0.7}));
      return 1;
    }

    const geometry = element.geometry;
    if (element.type === "way" && Array.isArray(geometry) && geometry.length >= 2) {
      const latlngs = unwrapLeafletLatLngPairs(geometry.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(p => [p.lat, p.lon]));
      if (latlngs.length < 2) return 0;
      const first = latlngs[0];
      const last = latlngs[latlngs.length - 1];
      const closed = latlngs.length >= 4 && first[0] === last[0] && first[1] === last[1];
      bindCopies(offset => {
        const shifted = latlngs.map(point => [point[0], point[1] + offset]);
        return closed ? L.polygon(shifted, style) : L.polyline(shifted, style);
      });
      return 1;
    }

    if (element.type === "relation") {
      let count = 0;
      for (const member of element.members || []) {
        if (!Array.isArray(member.geometry) || member.geometry.length < 2) continue;
        const latlngs = unwrapLeafletLatLngPairs(member.geometry.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(p => [p.lat, p.lon]));
        if (latlngs.length < 2) continue;
        const first = latlngs[0];
        const last = latlngs[latlngs.length - 1];
        const closed = member.role !== "inner" && latlngs.length >= 4 && first[0] === last[0] && first[1] === last[1];
        bindCopies(offset => {
          const shifted = latlngs.map(point => [point[0], point[1] + offset]);
          return closed ? L.polygon(shifted, style) : L.polyline(shifted, style);
        });
        count += 1;
      }
      return count;
    }

    if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) {
      bindCopies(offset => L.circleMarker([element.center.lat, element.center.lon + offset], {...style, radius: 5, fillOpacity: 0.7}));
      return 1;
    }
    return 0;
  }

  function render(data) {
    window.FAMapContext?.clearHistory?.("ovp");
    hiddenOverpassFeatures.clear();
    const group = ensureResults();
    group.clearLayers();
    const elements = Array.isArray(data?.elements) ? data.elements : [];
    lastOverpassElements = elements;
    overpassRenderedWorldIndex = currentMapWorldIndex();
    const relations = elements.filter(x => x.type === "relation");
    const others = elements.filter(x => x.type !== "relation");
    if (STATIC_OVERPASS) staticOverpassBuckets = new Map();
    if (STATIC_OVERPASS) { staticOverpassFeatures = []; closeStaticOverpassTooltip(); }
    let rendered = 0;
    for (const element of [...relations, ...others]) rendered += addGeometry(element);
    flushStaticOverpass();
    setStatus(`${elements.length} elements · ${rendered} geometries`);
  }

  function refreshOverpassWorldCopies(force = false) {
    if (!map || !results || !lastOverpassElements.length) return;
    const world = currentMapWorldIndex();
    if (!force && world === overpassRenderedWorldIndex) return;
    if (!force && !map.hasLayer(results)) { overpassRenderedWorldIndex = world; return; }
    const wasVisible = map.hasLayer(results);
    results.clearLayers();
    overpassRenderedWorldIndex = world;
    const relations = lastOverpassElements.filter(x => x.type === "relation");
    const others = lastOverpassElements.filter(x => x.type !== "relation");
    if (STATIC_OVERPASS) staticOverpassBuckets = new Map();
    if (STATIC_OVERPASS) { staticOverpassFeatures = []; closeStaticOverpassTooltip(); }
    for (const element of [...relations, ...others]) addGeometry(element);
    flushStaticOverpass();
    if (!wasVisible && map.hasLayer(results)) map.removeLayer(results);
  }

  function buildPresetQuery() {
    const selected = PRESETS.filter(p => {
      const checkbox = panel.querySelector(
        `[data-ovp-preset="${p.key}"]`
      );

      return checkbox?.checked;
    });

    if (!selected.length)
      throw new Error("Select at least one category.");

    return (
      `[out:json][timeout:45];(` +
      selected.map(x => x.query).join("") +
      `);out geom;`
    );
  }

  function prepareCustomQuery() {
    let query =
      panel.querySelector("#ovp-custom-query").value.trim();

    if (!query)
      throw new Error("Enter an Overpass query.");

    const styleStart = query.indexOf("{{style:");

    if (styleStart >= 0)
      query = query.slice(0, styleStart).trim();

    return query;
  }

  function prepareQuery(viewGeometry = null) {
    let query = activeTab === "custom" ? prepareCustomQuery() : buildPresetQuery();
    if (!query.includes("{{bbox}}")) return query;
    const geometry = viewGeometry || captureQueryExtentGeometry();
    return query.replaceAll("{{bbox}}", overpassViewportFilter(geometry));
  }

  function prepareBboxQueries(viewGeometry = null) {
    const query = activeTab === "custom" ? prepareCustomQuery() : buildPresetQuery();
    if (!query.includes("{{bbox}}")) return [query];
    const geometry = viewGeometry || captureQueryExtentGeometry();
    return overpassViewportBboxFilters(geometry).map(filter => query.replaceAll("{{bbox}}", filter));
  }

  async function fetchOverpass(query, signal) {
    let lastError = null;
    const timeoutMs = overpassNetworkTimeoutMs(query);

    for (let index = 0; index < ENDPOINTS.length; index += 1) {
      const endpoint = ENDPOINTS[index];
      try {
        const response = await managedFetch(endpoint, {
          method: "POST",
          headers: {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
          body: new URLSearchParams({data: query}),
          signal
        }, {timeoutMs, retries: 0, label: "Overpass request"});
        if (!response.ok) {
          const error = new Error(`${response.status} ${response.statusText}`);
          error.status = response.status;
          throw error;
        }
        return await response.json();
      } catch (error) {
        if (error?.name === "AbortError" || error?.status === 400 || error?.status === 422) throw error;
        lastError = error;
        if (index < ENDPOINTS.length - 1) setStatus("Trying alternate Overpass server...");
      }
    }

    throw lastError || new Error("Overpass request failed.");
  }

  function shouldRetryOverpassWithBbox(error) {
    const status = Number(error?.status);
    return status === 400 || status === 422;
  }

  function mergeOverpassResponses(responses) {
    const merged = {...(responses[0] || {}), elements: []};
    const seen = new Set();
    for (const response of responses) {
      for (const element of Array.isArray(response?.elements) ? response.elements : []) {
        const key = element?.id == null ? JSON.stringify(element) : `${String(element.type || "feature")}:${String(element.id)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.elements.push(element);
      }
    }
    return merged;
  }

  async function fetchOverpassQueries(queries, signal) {
    const responses = [];
    for (const query of queries) responses.push(await fetchOverpass(query, signal));
    return mergeOverpassResponses(responses);
  }

  function notifyOverpass(message, tone = "info") {
    window.FAOverpassHost?.toast?.(message, tone);
  }

  function syncOverpassZoomHint() {
    if (!map || !panel) return;
    const available = map.getZoom() >= 6;
    const button = panel.querySelector("#ovp-query");
    if (button) button.disabled = !available;
    const status = panel.querySelector("#ovp-status");
    if (!status) return;
    if (!available) {
      status.textContent = "Zoom in to query Overpass (6+)";
      status.title = "";
      status.classList.remove("error");
    } else if (status.dataset.ovpZoomLimited === "1") {
      status.textContent = "Ready";
      status.title = "";
      status.classList.remove("error");
    }
    status.dataset.ovpZoomLimited = available ? "0" : "1";
  }

  function setStatus(text, error = false, detail = "") {
    const el = panel?.querySelector("#ovp-status");
    if (!el) return;

    el.textContent = text;
    el.title = error && detail ? String(detail) : "";
    el.classList.toggle("error", error);
    syncOverpassZoomHint();
    syncOverpassResultButton();
  }

  async function runQuery() {
    if (!map) return;
    if (map.getZoom() < 6) { syncOverpassZoomHint(); return; }
    const queryUsesCurrentView = activeTab !== "custom" || panel.querySelector("#ovp-custom-query")?.value.includes("{{bbox}}");
    const queryGeometry = queryUsesCurrentView ? captureQueryExtentGeometry() : null;
    const splitAtDateLine = Boolean(queryGeometry && viewportCrossesDateLine(queryGeometry));
    let query;
    let splitQueries = null;
    try {
      if (splitAtDateLine) splitQueries = prepareBboxQueries(queryGeometry);
      else query = prepareQuery(queryGeometry);
    }
    catch (error) { void 0; const detail = `Overpass query failed: ${error?.message || error}`; notifyOverpass(detail, "error"); setStatus("Query failed.", true, detail); return; }
    if (queryGeometry) setQueryExtent("ovp", queryGeometry);
    else clearQueryExtent("ovp");
    if (results) results.clearLayers();
    lastOverpassElements = [];
    if (STATIC_OVERPASS) { staticOverpassFeatures = []; closeStaticOverpassTooltip(); }
    overpassRenderedWorldIndex = null;
    syncOverpassResultButton();
    if (controller) controller.abort();
    controller = new AbortController();
    const queryController = controller;
    overpassHasQueried = true;
    notifyOverpass("Querying Overpass...", "info");
    setStatus("Querying current map view…");
    try {
      let data;
      if (splitAtDateLine) {
        setStatus("Querying date-line view…");
        data = await fetchOverpassQueries(splitQueries, queryController.signal);
      } else {
        try { data = await fetchOverpass(query, queryController.signal); }
        catch (primaryError) {
          if (primaryError?.name === "AbortError" || !queryGeometry || !shouldRetryOverpassWithBbox(primaryError)) throw primaryError;
          setStatus("Retrying with enclosing bounds…");
          data = await fetchOverpassQueries(prepareBboxQueries(queryGeometry), queryController.signal);
        }
      }
      if (controller !== queryController || queryController.signal.aborted) return;
      const visibleData = queryGeometry ? filterOverpassDataToViewport(data, queryGeometry) : data;
      render(visibleData);
      const returnedCount = Array.isArray(visibleData?.elements) ? visibleData.elements.length : 0;
      if (returnedCount > 0) notifyOverpass(`${returnedCount} features returned.`, "success");
      else notifyOverpass("No features returned.", "info");
    } catch (error) {
      if (error?.name === "AbortError") return;
      void 0;
      const detail = `Overpass query failed: ${error?.message || error}`;
      notifyOverpass(detail, "error");
      setStatus("Query failed.", true, detail);
    } finally { if (controller === queryController) controller = null; }
  }

  function clearResults() {
    window.FAMapContext?.clearHistory?.("ovp");
    hiddenOverpassFeatures.clear();
    lastOverpassElements = [];
    if (STATIC_OVERPASS) { staticOverpassFeatures = []; closeStaticOverpassTooltip(); }
    overpassRenderedWorldIndex = null;
    if (controller) {
      controller.abort();
      controller = null;
    }

    if (results)
      results.clearLayers();

    clearQueryExtent("ovp");
    setStatus("Results cleared");
  }

  function setTab(tab) {
    activeTab = tab;

    for (const button of panel.querySelectorAll("[data-ovp-tab]")) {
      button.classList.toggle(
        "active",
        button.dataset.ovpTab === tab
      );
    }

    panel
      .querySelector("#ovp-presets-view")
      .classList.toggle(
        "hidden",
        tab !== "presets"
      );

    panel
      .querySelector("#ovp-custom-view")
      .classList.toggle(
        "hidden",
        tab !== "custom"
      );
  }

  function syncPresetToggleAllButton() {
    const inputs = [...panel.querySelectorAll("[data-ovp-preset]")];
    const toggle = panel.querySelector("#ovp-clear-all-presets");
    if (!toggle || !inputs.length) return;
    const allSelected = inputs.every(input => input.checked);
    toggle.textContent = allSelected ? "Deselect all" : "Select all";
    toggle.setAttribute("aria-label", toggle.textContent);
  }

  function buildPresetHtml() {
    let currentGroup = "";

    return PRESETS.map(item => {
      let heading = "";

      if (item.group !== currentGroup) {
        currentGroup = item.group;

        heading = currentGroup === "Aviation"
          ? `<div class="settings-group-label ovp-group-title ovp-group-title-row"><span>${esc(currentGroup)}</span><button id="ovp-clear-all-presets" class="ovp-text-button" type="button">Deselect all</button></div>`
          : `<div class="settings-group-label ovp-group-title">${esc(currentGroup)}</div>`;
      }

      return `
        ${heading}
        <label class="check-line ovp-option">
          <input
            type="checkbox"
            data-ovp-preset="${esc(item.key)}"
            ${item.checked ? "checked" : ""}
          >
          <span
            class="ovp-dot"
            style="background:${esc(item.color)}"
          ></span>
          <span>${esc(item.label)}</span>
        </label>
      `;
    }).join("");
  }

  function closePanel() {
    panel?.classList.add("hidden");
    overpassInfo?.classList.remove("legend-pinned");
    overpassInfo?.querySelector(".tool-settings-info-button")?.setAttribute("aria-expanded", "false");
  }

  function hasOverpassResults() {
    return Boolean(results?.getLayers?.().length);
  }

  function overpassResultsVisible() {
    return hasOverpassResults() && Boolean(map?.hasLayer?.(results));
  }

  function toggleOverpassResults() {
    if (!map) return;
    if (!hasOverpassResults()) {
      if (!overpassHasQueried) notifyOverpass("Run an Overpass query first.", "info");
      return;
    }
    if (map.hasLayer(results)) {
      map.removeLayer(results);
      setQueryExtentVisible("ovp", false);
    } else {
      refreshOverpassWorldCopies(true);
      results.addTo(map);
      setQueryExtentVisible("ovp", true);
    }
    syncOverpassResultButton();
  }

  function syncOverpassResultButton() {
    const sharedButton = document.getElementById("overpass-toggle");
    if (!sharedButton || sharedButton.textContent !== "OVP") return;
    const active = overpassResultsVisible();
    sharedButton.classList.toggle("tool-active", active);
    sharedButton.classList.toggle("ovp-data-active", active);
    sharedButton.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function isOpen() {
    return Boolean(panel && !panel.classList.contains("hidden"));
  }

  function buildUi() {
    if (button || panel) return;

    const baseButton =
      document.getElementById("basemap-toggle");

    if (!baseButton) return;

    button = baseButton.cloneNode(false);
    button.id = "overpass-toggle";
    button.type = "button";
    button.classList.remove("basemap-toggle");
    button.classList.add("overpass-toggle");
    const TOOL_SLOT_MODES = ["ovp", "wc", "elv", "sar", "oap", "wiki", "oim"];
    let layerStrip = null;
    const toolSlotLabel = mode => mode === "wc" ? "WC" : mode === "elv" ? "ELV" : mode === "sar" ? "SAR" : mode === "oap" ? "OAP" : mode === "wiki" ? "WIKI" : mode === "oim" ? "OIM" : "OVP";
    const toolSlotName = mode => mode === "wc" ? "WorldCover 2021" : mode === "elv" ? "Elevation" : mode === "sar" ? "Open SAR sources" : mode === "oap" ? "OpenAerialMap" : mode === "wiki" ? "Wikipedia" : mode === "oim" ? "OpenInfraMap" : "Overpass";
    function toolSlotActive(mode) {
      if (mode === "ovp") return overpassResultsVisible();
      if (mode === "wc") return Boolean(window.FAWorldCover?.isEnabled?.());
      if (mode === "elv") return Boolean(window.FAElevation?.isEnabled?.());
      if (mode === "sar") return Boolean(window.FASAR?.isEnabled?.());
      if (mode === "oap") return Boolean(window.FAOAP?.isEnabled?.());
      if (mode === "wiki") return wikiResultsVisible();
      if (mode === "oim") return Boolean(window.FAOIM?.isEnabled?.());
      return false;
    }
    function turnOffToolSlot(mode) {
      if (mode === "ovp" && overpassResultsVisible()) toggleOverpassResults();
      else if (mode === "wc" && window.FAWorldCover?.isEnabled?.()) window.FAWorldCover?.toggle?.();
      else if (mode === "elv" && window.FAElevation?.isEnabled?.()) window.FAElevation?.toggle?.();
      else if (mode === "sar" && window.FASAR?.isEnabled?.()) window.FASAR?.setEnabled?.(false);
      else if (mode === "oap" && window.FAOAP?.isEnabled?.()) window.FAOAP?.setEnabled?.(false);
      else if (mode === "wiki" && wikiResultsVisible()) wikiToggleResults();
      else if (mode === "oim" && window.FAOIM?.isEnabled?.()) window.FAOIM?.setEnabled?.(false);
      syncToolSlotButton();
    }
    function syncActiveToolButtons() {
      if (!button?.parentNode) return;
      const settingInput = document.getElementById("show-active-layer-buttons");
      const showPinned = settingInput ? settingInput.checked : window.FAOverpassHost?.showActiveToolButtons?.() !== false;
      if (!showPinned) {
        for (const pinned of activeToolButtons.values()) pinned.remove();
        activeToolButtons.clear();
        return;
      }
      const activeModes = TOOL_SLOT_MODES.filter(mode => mode !== toolSlotMode && toolSlotActive(mode));
      for (const [mode, pinned] of activeToolButtons) {
        if (activeModes.includes(mode)) continue;
        pinned.remove();
        activeToolButtons.delete(mode);
      }
      activeModes.forEach((mode, index) => {
        let pinned = activeToolButtons.get(mode);
        if (!pinned) {
          pinned = button.cloneNode(false);
          pinned.removeAttribute("id");
          pinned.classList.add("tool-slot-pinned");
          pinned.type = "button";
          pinned.dataset.toolMode = mode;
          pinned.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            turnOffToolSlot(mode);
          });
          activeToolButtons.set(mode, pinned);
          button.parentNode.insertBefore(pinned, button);
        }
        pinned.textContent = toolSlotLabel(mode);
        pinned.setAttribute("aria-label", `Turn off ${toolSlotName(mode)}`);
        pinned.setAttribute("aria-pressed", "true");
        pinned.classList.add("tool-active");
        pinned.classList.toggle("ovp-data-active", mode === "ovp");
        pinned.style.setProperty("right", `${198 + index * 62}px`, "important");
      });
    }
    function syncToolSlotButton() {
      const worldCoverActive = Boolean(window.FAWorldCover?.isEnabled?.());
      const elevationActive = Boolean(window.FAElevation?.isEnabled?.());
      const overpassActive = overpassResultsVisible();
      const layerActive = toolSlotActive(toolSlotMode);
      button.textContent = toolSlotLabel(toolSlotMode);
      button.setAttribute("aria-label", `Toggle ${toolSlotName(toolSlotMode)}`);
      button.setAttribute("aria-pressed", layerActive ? "true" : "false");
      button.classList.toggle("tool-active", layerActive);
      button.classList.toggle("ovp-data-active", toolSlotMode === "ovp" && overpassActive);
      syncActiveToolButtons();
      updateLayerStrip();
      window.FAOIM?.setSlotSelected?.(toolSlotMode === "oim");
      if (overpassInfo) {
        const visible = toolSlotMode === "ovp";
        overpassInfo.classList.toggle("hidden", !visible);
        if (!visible) closePanel();
      }
      if (wikiInfo) {
        const visible = toolSlotMode === "wiki";
        wikiInfo.classList.toggle("hidden", !visible);
        if (!visible) wikiClosePanel();
      }
      if (sarInfo) {
        const visible = toolSlotMode === "sar" && Boolean(window.FASAR?.isEnabled?.());
        sarInfo.classList.toggle("hidden", !visible);
        if (!visible) sarClosePanel();
      }
      if (worldCoverLegend) {
        const visible = toolSlotMode === "wc" && worldCoverActive;
        worldCoverLegend.classList.toggle("hidden", !visible);
        if (!visible) {
          worldCoverLegend.classList.remove("legend-pinned", "legend-click-dismissed");
          worldCoverLegend.setAttribute("aria-expanded", "false");
        }
      }
      if (elevationLegend) {
        const visible = toolSlotMode === "elv" && elevationActive;
        elevationLegend.classList.toggle("hidden", !visible);
        if (!visible) {
          elevationLegend.classList.remove("legend-pinned", "legend-click-dismissed");
          elevationLegend.setAttribute("aria-expanded", "false");
        }
      }
    }

    syncToolSlotButtonExternal = syncToolSlotButton;
    function cycleToolSlot(direction = 1) {
      const currentIndex = TOOL_SLOT_MODES.indexOf(toolSlotMode);
      const nextIndex = (currentIndex + (direction < 0 ? -1 : 1) + TOOL_SLOT_MODES.length) % TOOL_SLOT_MODES.length;
      toolSlotMode = TOOL_SLOT_MODES[nextIndex];
      try { localStorage.setItem(TOOL_SLOT_STORAGE_KEY, toolSlotMode); } catch {}
      closePanel();
      syncToolSlotButton();
    }

    function activateToolSlot() {
      window.FASAR?.close?.();

      if (toolSlotMode === "oim") {
        closePanel();
        window.FAOIM?.toggle?.();
        syncToolSlotButton();
        return;
      }
      if (toolSlotMode === "sar") {
        closePanel();
        window.FASAR?.setEnabled?.(!window.FASAR?.isEnabled?.());
        syncToolSlotButton();
        return;
      }
      if (toolSlotMode === "oap") {
        closePanel();
        window.FAOAP?.setEnabled?.(!window.FAOAP?.isEnabled?.());
        syncToolSlotButton();
        return;
      }
      if (toolSlotMode === "wc") {
        closePanel();
        window.FAWorldCover?.toggle?.();
        syncToolSlotButton();
        return;
      }

      if (toolSlotMode === "elv") {
        closePanel();
        window.FAElevation?.toggle?.();
        syncToolSlotButton();
        return;
      }

      const opening = panel.classList.contains("hidden");
      if (!opening) {
        closePanel();
        return;
      }

      if (window.FAOverpassHost?.beforeOpen?.() === false) return;
      window.FAUI?.openExclusive?.("overpass");
      panel.classList.remove("hidden");
      overpassInfo?.classList.add("legend-pinned");
      overpassInfo?.querySelector(".tool-settings-info-button")?.setAttribute("aria-expanded", "true");
    }

    syncToolSlotButton();

    baseButton.parentNode.insertBefore(
      button,
      baseButton.nextSibling
    );

    layerStrip = document.createElement("div");
    layerStrip.className = "fa-layer-strip";
    layerStrip.id = "fa-layer-strip";
    layerStrip.setAttribute("role", "group");
    layerStrip.setAttribute("aria-label", "Choose map layer");
    layerStrip.setAttribute("aria-hidden", "true");
    layerStrip.innerHTML = TOOL_SLOT_MODES.slice().reverse().map((mode, index) => `<button type="button" class="fa-layer-choice" data-tool-mode="${mode}" style="--layer-index:${index}" aria-label="Select ${toolSlotName(mode)}">${toolSlotLabel(mode)}</button>`).join("");
    baseButton.closest(".map-wrap").appendChild(layerStrip);
    button.setAttribute("aria-controls", "fa-layer-strip");
    button.setAttribute("aria-expanded", "false");
    function updateLayerStrip() {
      if (!layerStrip) return;
      for (const option of layerStrip.querySelectorAll("[data-tool-mode]")) {
        const mode = option.dataset.toolMode;
        const selected = mode === toolSlotMode;
        option.classList.toggle("is-selected", selected);
        option.classList.toggle("tool-active", toolSlotActive(mode));
        option.setAttribute("aria-pressed", String(selected));
      }
    }
    function setLayerStripOpen(open) {
      baseButton.closest(".map-wrap").classList.toggle("fa-layer-strip-open", open);
      layerStrip.classList.toggle("is-open", open);
      layerStrip.setAttribute("aria-hidden", String(!open));
      button.setAttribute("aria-expanded", String(open));
      if (!open && layerStrip.contains(document.activeElement)) document.activeElement.blur();
    }
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") setLayerStripOpen(false);
    });
    document.addEventListener("pointerdown", event => {
      if (!layerStrip.contains(event.target) && event.target !== button) setLayerStripOpen(false);
    }, true);
    layerStrip.addEventListener("click", event => {
      const option = event.target.closest("[data-tool-mode]");
      if (!option) return;
      event.preventDefault();
      event.stopPropagation();
      const mode = option.dataset.toolMode;
      if (!TOOL_SLOT_MODES.includes(mode)) return;
      setLayerStripOpen(false);
      closePanel();
      toolSlotMode = mode;
      try { localStorage.setItem(TOOL_SLOT_STORAGE_KEY, mode); } catch {}
      syncToolSlotButton();
      if (mode === "ovp") activateToolSlot();
      else if (mode === "wiki") wikiInfo?.querySelector(".tool-settings-info-button")?.click();
      else if (!toolSlotActive(mode)) activateToolSlot();
    });
    updateLayerStrip();

    function bindOverlayOpacityControl(legend, sliderId, valueId, resetId, defaultPercent, apiGetter) {
      const slider = legend?.querySelector(`#${sliderId}`);
      const valueLabel = legend?.querySelector(`#${valueId}`);
      const reset = legend?.querySelector(`#${resetId}`);
      const control = slider?.closest?.(".overlay-opacity-control");
      if (!slider || !valueLabel || !reset || !control) return;
      const sync = percentValue => {
        const percent = Math.max(0, Math.min(100, Number(percentValue) || 0));
        slider.value = String(percent);
        slider.style.setProperty("--range-pct", `${percent}%`);
        valueLabel.textContent = `${Math.round(percent)}%`;
        const atDefault = Math.abs(percent - defaultPercent) < 0.5;
        reset.classList.toggle("is-default", atDefault);
        reset.setAttribute("aria-disabled", String(atDefault));
      };
      const initial = Math.round(Math.max(0, Math.min(1, Number(apiGetter()?.getOpacity?.()) || 0)) * 100);
      sync(initial);
      for (const node of [control, reset]) {
        for (const type of ["pointerdown", "mousedown", "click", "dblclick", "keydown"]) {
          node.addEventListener(type, event => event.stopPropagation());
        }
      }
      slider.addEventListener("input", () => {
        const percent = Math.max(0, Math.min(100, Number(slider.value) || 0));
        sync(percent);
        apiGetter()?.setOpacity?.(percent / 100);
      });
      const resetOpacity = () => {
        sync(defaultPercent);
        apiGetter()?.setOpacity?.(defaultPercent / 100);
      };
      reset.addEventListener("click", resetOpacity);
      reset.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        resetOpacity();
      });
    }

    worldCoverLegend = document.createElement("button");
    worldCoverLegend.id = "worldcover-legend-info";
    worldCoverLegend.className = "worldcover-legend-info hidden";
    worldCoverLegend.type = "button";
    worldCoverLegend.setAttribute("aria-label", "Show WorldCover 2021 legend");
    worldCoverLegend.innerHTML = `
      <span class="worldcover-legend-glyph" aria-hidden="true"><svg class="info-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 17.75C12.4142 17.75 12.75 17.4142 12.75 17V11C12.75 10.5858 12.4142 10.25 12 10.25C11.5858 10.25 11.25 10.5858 11.25 11V17C11.25 17.4142 11.5858 17.75 12 17.75Z" fill="#fff"/><path d="M12 7C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9C11.4477 9 11 8.55228 11 8C11 7.44772 11.4477 7 12 7Z" fill="#fff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12ZM12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75Z" fill="#fff"/></svg></span>
      <span class="worldcover-legend-popup" role="tooltip">
        <span class="worldcover-legend-title">WorldCover 2021 (v200)</span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#006400"></span><span>Tree cover</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#ffbb22"></span><span>Shrubland</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#ffff4c"></span><span>Grassland</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#f096ff"></span><span>Cropland</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#fa0000"></span><span>Built-up</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#b4b4b4"></span><span>Bare / sparse vegetation</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#f0f0f0"></span><span>Snow and ice</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#0064c8"></span><span>Permanent water bodies</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#0096a0"></span><span>Herbaceous wetland</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#00cf75"></span><span>Mangroves</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#fae6a0"></span><span>Moss and lichen</span></span>
        <span class="overlay-opacity-section">
          <span class="satellite-brightness-header"><span class="worldcover-legend-title overlay-opacity-title">Opacity</span><span id="worldcover-overlay-opacity-reset" class="secondary small satellite-brightness-reset overlay-opacity-reset" role="button" tabindex="0" aria-label="Reset WorldCover opacity">Reset</span></span>
          <span class="satellite-brightness-control overlay-opacity-control"><input id="worldcover-overlay-opacity" type="range" min="0" max="100" step="1" value="80" aria-label="WorldCover opacity"><span id="worldcover-overlay-opacity-value">80%</span></span>
        </span>
      </span>
    `;
    baseButton.parentNode.insertBefore(worldCoverLegend, button.nextSibling);
    elevationLegend = document.createElement("button");
    elevationLegend.id = "elevation-legend-info";
    elevationLegend.className = "worldcover-legend-info hidden";
    elevationLegend.type = "button";
    elevationLegend.setAttribute("aria-label", "Show elevation legend");
    elevationLegend.innerHTML = `
      <span class="worldcover-legend-glyph" aria-hidden="true"><svg class="info-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 17.75C12.4142 17.75 12.75 17.4142 12.75 17V11C12.75 10.5858 12.4142 10.25 12 10.25C11.5858 10.25 11.25 10.5858 11.25 11V17C11.25 17.4142 11.5858 17.75 12 17.75Z" fill="#fff"/><path d="M12 7C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9C11.4477 9 11 8.55228 11 8C11 7.44772 11.4477 7 12 7Z" fill="#fff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12ZM12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75Z" fill="#fff"/></svg></span>
      <span class="worldcover-legend-popup" role="tooltip">
        <span class="worldcover-legend-title">Elevation (Mapterhorn)</span>
        <span class="elevation-legend-note">Click to show animation. Right click for elevation profile.</span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#416691"></span><span>Below 0 m</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#588252"></span><span>0-100 m</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#699255"></span><span>100-250 m</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#899a5b"></span><span>250-500 m</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#a89b67"></span><span>500-1,000 m</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#a68966"></span><span>1,000-2,000 m</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#978b82"></span><span>2,000-3,000 m</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#bcb9b5"></span><span>3,000-4,500 m</span></span>
        <span class="worldcover-legend-row"><span class="worldcover-legend-swatch" style="background:#e2e2df"></span><span>4,500+ m</span></span>
        <span class="overlay-opacity-section">
          <span class="satellite-brightness-header"><span class="worldcover-legend-title overlay-opacity-title">Opacity</span><span id="elevation-overlay-opacity-reset" class="secondary small satellite-brightness-reset overlay-opacity-reset" role="button" tabindex="0" aria-label="Reset elevation opacity">Reset</span></span>
          <span class="satellite-brightness-control overlay-opacity-control"><input id="elevation-overlay-opacity" type="range" min="0" max="100" step="1" value="80" aria-label="Elevation overlay opacity"><span id="elevation-overlay-opacity-value">80%</span></span>
        </span>
      </span>
    `;
    baseButton.parentNode.insertBefore(elevationLegend, worldCoverLegend.nextSibling);
    bindOverlayOpacityControl(worldCoverLegend, "worldcover-overlay-opacity", "worldcover-overlay-opacity-value", "worldcover-overlay-opacity-reset", 80, () => window.FAWorldCover);
    bindOverlayOpacityControl(elevationLegend, "elevation-overlay-opacity", "elevation-overlay-opacity-value", "elevation-overlay-opacity-reset", 80, () => window.FAElevation);
    overpassInfo = document.createElement("div");
    overpassInfo.id = "overpass-settings-info";
    overpassInfo.className = "tool-settings-info hidden";
    overpassInfo.dataset.faOwner = "overpass";
    overpassInfo.innerHTML = `<button class="tool-settings-info-button" type="button" aria-label="Overpass settings" aria-expanded="false"><span class="worldcover-legend-glyph" aria-hidden="true"><svg class="info-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 17.75C12.4142 17.75 12.75 17.4142 12.75 17V11C12.75 10.5858 12.4142 10.25 12 10.25C11.5858 10.25 11.25 10.5858 11.25 11V17C11.25 17.4142 11.5858 17.75 12 17.75Z" fill="#fff"/><path d="M12 7C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9C11.4477 9 11 8.55228 11 8C11 7.44772 11.4477 7 12 7Z" fill="#fff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12ZM12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75Z" fill="#fff"/></svg></span></button>`;
    baseButton.parentNode.insertBefore(overpassInfo, elevationLegend.nextSibling);
    sarInfo = document.createElement("div");
    sarInfo.id = "sar-settings-info";
    sarInfo.className = "tool-settings-info hidden";
    sarInfo.dataset.faOwner = "sar";
    sarInfo.innerHTML = `<button class="tool-settings-info-button" type="button" aria-label="SAR settings" aria-expanded="false"><span class="worldcover-legend-glyph" aria-hidden="true"><svg class="info-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 17.75C12.4142 17.75 12.75 17.4142 12.75 17V11C12.75 10.5858 12.4142 10.25 12 10.25C11.5858 10.25 11.25 10.5858 11.25 11V17C11.25 17.4142 11.5858 17.75 12 17.75Z" fill="#fff"/><path d="M12 7C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9C11.4477 9 11 8.55228 11 8C11 7.44772 11.4477 7 12 7Z" fill="#fff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12ZM12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75Z" fill="#fff"/></svg></span></button>`;
    baseButton.parentNode.insertBefore(sarInfo, overpassInfo.nextSibling);
    wikiInfo = document.createElement("div");
    wikiInfo.id = "wiki-settings-info";
    wikiInfo.className = "tool-settings-info hidden";
    wikiInfo.dataset.faOwner = "wiki";
    wikiInfo.innerHTML = `<button class="tool-settings-info-button" type="button" aria-label="Wikipedia query" aria-expanded="false"><span class="worldcover-legend-glyph" aria-hidden="true"><svg class="info-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 17.75C12.4142 17.75 12.75 17.4142 12.75 17V11C12.75 10.5858 12.4142 10.25 12 10.25C11.5858 10.25 11.25 10.5858 11.25 11V17C11.25 17.4142 11.5858 17.75 12 17.75Z" fill="#fff"/><path d="M12 7C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9C11.4477 9 11 8.55228 11 8C11 7.44772 11.4477 7 12 7Z" fill="#fff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12ZM12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75Z" fill="#fff"/></svg></span></button>`;
    baseButton.parentNode.insertBefore(wikiInfo, sarInfo.nextSibling);
    wikiPanel = document.createElement("div");
    wikiPanel.id = "wiki-panel";
    wikiPanel.className = "overpass-panel hidden";
    wikiPanel.dataset.faExclusive = "wiki";
    wikiPanel.innerHTML = `
      <div class="ovp-header">
        <strong>Wikipedia</strong>
        <button id="wiki-close" class="secondary small ovp-close" type="button" aria-label="Close">Close</button>
      </div>
      <div class="ovp-hint wiki-hint">Geotagged English Wikipedia articles in this view.</div>
      <div class="ovp-actions">
        <button id="wiki-query" class="primary" type="button">Query current view</button>
        <button id="wiki-clear" type="button">Clear</button>
        <div id="wiki-status" class="ovp-status">Ready</div>
      </div>`;
    wikiInfo.appendChild(wikiPanel);
    wikiModule.attachUi(wikiInfo, wikiPanel);
    sarModule.attachUi(sarInfo, button);
    wikiInfo.querySelector(".tool-settings-info-button")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const opening = wikiPanel.classList.contains("hidden");
      if (!opening) { wikiClosePanel(); return; }
      if (window.FAOverpassHost?.beforeOpen?.() === false) return;
      window.FAUI?.openExclusive?.("wiki");
      wikiPanel.classList.remove("hidden");
      wikiInfo.classList.add("legend-pinned");
      event.currentTarget.setAttribute("aria-expanded", "true");
    });
    wikiPanel.querySelector("#wiki-close")?.addEventListener("click", wikiClosePanel);
    wikiPanel.querySelector("#wiki-query")?.addEventListener("click", wikiQueryCurrentView);
    wikiPanel.querySelector("#wiki-clear")?.addEventListener("click", wikiClearResults);
    [worldCoverLegend, elevationLegend].forEach((legend) => {
      legend.setAttribute("aria-expanded", "false");
      legend.addEventListener("click", () => {
        const pinned = !legend.classList.contains("legend-pinned");
        legend.classList.toggle("legend-pinned", pinned);
        legend.classList.toggle("legend-click-dismissed", !pinned);
        legend.setAttribute("aria-expanded", String(pinned));
        legend.blur();
      });
      legend.addEventListener("mouseleave", () => {
        legend.classList.remove("legend-click-dismissed");
      });
    });
    syncToolSlotButton();

    panel = document.createElement("div");
    panel.id = "overpass-panel";
    panel.className = "overpass-panel hidden";
    panel.dataset.faExclusive = "overpass";

    panel.innerHTML = `
      <div class="ovp-header">
        <strong>Overpass</strong>
        <button
          id="ovp-close"
          class="secondary small ovp-close"
          type="button"
          aria-label="Close"
        >Close</button>
      </div>

      <div class="settings-tabs ovp-tabs" role="tablist">
        <button
          type="button"
          class="settings-tab ovp-tab active"
          data-ovp-tab="presets"
        >Presets</button>
        <button
          type="button"
          class="settings-tab ovp-tab"
          data-ovp-tab="custom"
        >Custom</button>
      </div>

      <div id="ovp-presets-view" class="ovp-view">
        ${buildPresetHtml()}
      </div>

      <div id="ovp-custom-view" class="ovp-view hidden">
        <textarea
          id="ovp-custom-query"
          class="ovp-query"
          spellcheck="false"
          placeholder='[out:json][timeout:90];
(
  nwr["railway"="station"]({{bbox}});
);
out geom;'
        ></textarea>

        <div class="ovp-hint">
          {{bbox}} is replaced with the current map view.
          Overpass Turbo {{style:...}} blocks are ignored.
        </div>
      </div>

      <div class="ovp-actions">
        <button
          id="ovp-query"
          class="primary"
          type="button"
        >Query current view</button>

        <button
          id="ovp-clear"
          type="button"
        >Clear</button>

        <div id="ovp-status" class="ovp-status">Ready</div>
      </div>


    `;

    overpassInfo.appendChild(panel);
    syncOverpassZoomHint();
    overpassInfo.querySelector(".tool-settings-info-button")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const opening = panel.classList.contains("hidden");
      if (!opening) { closePanel(); return; }
      if (window.FAOverpassHost?.beforeOpen?.() === false) return;
      window.FAUI?.openExclusive?.("overpass");
      panel.classList.remove("hidden");
      overpassInfo.classList.add("legend-pinned");
      event.currentTarget.setAttribute("aria-expanded", "true");
    });
    sarInfo.querySelector(".tool-settings-info-button")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (!sarIsEnabled()) return;
      buildSarUi();
      const opening = sarGetPanel().classList.contains("hidden");
      if (!opening) { sarClosePanel(); return; }
      if (window.FAOverpassHost?.beforeOpen?.() === false) return;
      window.FAUI?.openExclusive?.("sar");
      sarGetPanel().classList.remove("hidden");
      sarInfo.classList.add("legend-pinned");
      event.currentTarget.setAttribute("aria-expanded", "true");
    });
    document.addEventListener("pointerdown", event => {
      if (overpassInfo && !overpassInfo.contains(event.target)) closePanel();
      if (sarInfo && !sarInfo.contains(event.target)) sarClosePanel();
      if (wikiInfo && !wikiInfo.contains(event.target)) wikiClosePanel();
    }, true);
    syncPresetToggleAllButton();

    button.addEventListener("click", event => {
      if (toolSlotMode === "wiki") {
        wikiToggleResults();
        return;
      }
      if (toolSlotMode === "ovp") {
        toggleOverpassResults();
        return;
      }
      activateToolSlot();
    });

    button.addEventListener("mousedown", event => {
      if (event.button === 1) event.preventDefault();
    });

    button.addEventListener("auxclick", event => {
      if (event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      setLayerStripOpen(!layerStrip.classList.contains("is-open"));
    });

    let toolSlotWheelCooldown = 0;
    button.addEventListener("wheel", event => {
      event.preventDefault();
      event.stopPropagation();
      if (!event.deltaY) return;
      const now = performance.now();
      if (now < toolSlotWheelCooldown) return;
      toolSlotWheelCooldown = now + 120;
      cycleToolSlot(event.deltaY < 0 ? -1 : 1);
    }, {passive: false});

    panel
      .querySelector("#ovp-close")
      .addEventListener("click", closePanel);

    panel
      .querySelector("#ovp-query")
      .addEventListener("click", runQuery);

    panel
      .querySelector("#ovp-clear")
      .addEventListener("click", clearResults);

    panel
      .querySelector("#ovp-clear-all-presets")
      .addEventListener("click", () => {
        const inputs = [...panel.querySelectorAll("[data-ovp-preset]")];
        const allSelected = inputs.length > 0 && inputs.every(input => input.checked);
        inputs.forEach(input => { input.checked = !allSelected; });
        syncPresetToggleAllButton();
      });

    panel.addEventListener("change", event => {
      if (event.target.matches?.("[data-ovp-preset]")) syncPresetToggleAllButton();
    });

    panel
      .querySelectorAll("[data-ovp-tab]")
      .forEach(tab => {
        tab.addEventListener("click", () =>
          setTab(tab.dataset.ovpTab)
        );
      });
  }

  const shared = {externalSnapGeometryBusy: false, oapRefreshDeferred: false, sarRenderDeferred: false};

  function setExternalSnapGeometryBusy(busy) {
    const next = Boolean(busy);
    if (shared.externalSnapGeometryBusy === next) return;
    shared.externalSnapGeometryBusy = next;
    if (next) return;
    if (shared.oapRefreshDeferred) { shared.oapRefreshDeferred = false; oapScheduleRefresh(); }
    if (shared.sarRenderDeferred) { shared.sarRenderDeferred = false; sarScheduleRender(); }
  }

  function bindExternalSnapGeometryGuards() {
    if (!map || map._faExternalSnapGeometryGuardsBound) return;
    map._faExternalSnapGeometryGuardsBound = true;
    const container = map.getContainer();
    const handleSelector = ".marker-icon, .measurement-node-icon, .shape-rotate-hint-marker, .poi-edge-insert-dot-marker, .poi-marker";
    const finish = () => setExternalSnapGeometryBusy(false);
    container.addEventListener("pointerdown", event => { if (event.target?.closest?.(handleSelector)) setExternalSnapGeometryBusy(true); }, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    map.on("pm:drawstart", () => setExternalSnapGeometryBusy(true));
    map.on("pm:drawend", finish);
  }
  const wikiModule = window.FAWikiModule.createWikipedia({syncToolSlotButtonExternal: () => syncToolSlotButtonExternal(), notifyOverpass, setQueryExtentVisible, clearQueryExtent, canonicalViewportBboxes, normalizeWorldLongitude, esc, managedFetch, installTooltipMiddleClickLinks, beginExternalResultPoiDraft, category, captureQueryExtentGeometry, setQueryExtent});
  const {wikiClosePanel, wikiResultsVisible, wikiToggleResults, wikiClearResults, wikiQueryCurrentView} = wikiModule;
  const oapModule = window.FAOAPModule.createOAP({shared, staticOverpassPointInRing, staticOverpassLineHit, normalizeWorldLongitude, esc, canonicalViewportBboxes, managedFetch, wrapFeaturesForCurrentView, notifyOverpass, beginExternalResultPoiDraft, category, syncToolSlotButtonExternal: () => syncToolSlotButtonExternal()});
  const {oapStaticFind, oapScheduleRefresh, oapSetEnabled, oapIsEnabled, oapIsOptimized} = oapModule;
  const sarModule = window.FASARModule.createSAR({shared, syncToolSlotButtonExternal: () => syncToolSlotButtonExternal(), managedFetch, previewHtml, esc, currentMapWorldIndex, featureCoordinateBounds, featureIntersectsCurrentView, shiftFeatureLongitude, notifyOverpass, beginExternalResultPoiDraft, category});
  const {sarScheduleRender, sarSetInteractionSuspended, sarLoad, sarClosePanel, sarSetEnabled, buildSarUi, sarGetPanel, sarIsEnabled} = sarModule;

  function init(nextMap) {
    if (!nextMap) return;
    if (map === nextMap && panel) return;

    map = nextMap;
    window.FAOIM?.init?.(nextMap);
    wikiModule.init(nextMap);
    oapModule.init(nextMap);
    sarModule.init(nextMap);
    if (STATIC_OVERPASS) installStaticOverpassInteractions();

    ensurePane();
    ensureResults();
    bindExternalSnapGeometryGuards();
    try { window.FAElevation?.init(nextMap); } catch (error) { void 0; }
    buildUi();
    window.FAOIM?.attachUi?.();
    window.FAOIM?.setSlotSelected?.(toolSlotMode === "oim");
    try { window.FAVersaTiles?.init?.(nextMap); } catch (error) { void 0; }
    map.on("moveend", () => { sarSetInteractionSuspended(false); refreshOverpassWorldCopies(); sarScheduleRender(); });
    map.on("zoomend", () => { sarSetInteractionSuspended(false); sarScheduleRender(); syncOverpassZoomHint(); });
    map.on("zoomstart", () => sarSetInteractionSuspended(true));
    map.on("movestart", () => { sarSetInteractionSuspended(true); closePanel(); sarClosePanel(); wikiClosePanel(); });
  }

  window.FAOverpass = {
    setOptimizedRendering(enabled) { STATIC_OVERPASS = Boolean(enabled); oapModule.setOptimizedRendering(enabled); },
    refreshToolSlot() { syncToolSlotButtonExternal(); },
    toggleTool(mode) {
      if (!["ovp", "wc", "elv", "sar", "oap", "wiki", "oim"].includes(mode) || !button) return;
      toolSlotMode = mode;
      try { localStorage.setItem(TOOL_SLOT_STORAGE_KEY, toolSlotMode); } catch {}
      syncToolSlotButtonExternal();
      button.click();
    },
    init,
    setBoundaryFillOpacity(value) {
      boundaryFillOpacity = Math.max(0, Math.min(1, Number(value)));
      for (const layer of results?.getLayers?.() || []) {
        if (layer instanceof L.Polygon) layer.setStyle({fillOpacity: boundaryFillOpacity});
      }
      sarModule.setBoundaryFillOpacity(boundaryFillOpacity);
      oapModule.setBoundaryFillOpacity(boundaryFillOpacity);
      window.FAOIM?.setBoundaryFillOpacity?.(boundaryFillOpacity);
    },
    clear: clearResults,
    close: closePanel,
    isOpen
  };
})();
