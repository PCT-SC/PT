(() => {
  "use strict";
  // OpenInfraMap vector-tile overlay. Project Tracker basemaps and borders stay independent.
  const KEY = "pt.openinframap.v1";
  let pointFillOpacity = 0.2;
  const ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &middot; <a href="https://openinframap.org/copyright" target="_blank" rel="noopener">OpenInfraMap</a>';
  const SOURCES = [
    {id: "power", name: "Power grid", color: "#c73030", url: "power", layers: [
      ["power_line", "line"], ["power_substation", "area"], ["power_plant", "area"],
      ["power_generator_area", "area"], ["power_portal_way", "line"],
      ["power_substation_point", "point"], ["power_plant_point", "point"],
      ["power_generator", "point"], ["power_tower", "point"], ["power_transformer", "point"],
      ["power_switch", "point"], ["power_compensator", "point"]]},
    {id: "telecoms", name: "Telecommunications", color: "#7d59ab", url: "telecoms", layers: [
      ["telecoms_communication_line", "line"], ["telecoms_data_center", "area"],
      ["telecoms_cabinet", "point"], ["telecoms_mast", "point"],
      ["telecoms_data_center_point", "point"]]},
    {id: "petroleum", name: "Oil & gas", color: "#e6972d", url: "petroleum", layers: [
      ["petroleum_pipeline", "line"], ["petroleum_site", "area"], ["petroleum_well", "point"]]},
    {id: "water", name: "Water systems", color: "#3a85d9", url: "water", layers: [
      ["water_pipeline", "line"], ["pressurised_waterway", "line"],
      ["water_reservoir", "area"], ["water_well", "point"],
      ["water_treatment_plant_polygon", "area"], ["wastewater_plant_polygon", "area"],
      ["pumping_station_polygon", "area"], ["water_reservoir_point", "point"],
      ["pumping_station_point", "point"], ["water_treatment_plant_point", "point"],
      ["wastewater_plant_point", "point"]]},
    {id: "other", name: "Other pipelines", color: "#69b6a8", url: "other_pipeline", layers: [["other_pipeline", "line"]]},
    {id: "solar", name: "Solar generation", color: "#f5b95b", url: "solar_heatmap", layers: [["power_heatmap_solar", "point"]]},
    {id: "validation", name: "Osmose (power)", color: "#ef5555", url: "https://osmose.openstreetmap.fr/api/0.3/issues/{z}/{x}/{y}.mvt?tags=power", layers: [["issues", "point"]]}
  ];
  const SOURCE_DETAILS = Object.freeze({solar: true, validation: true});
  const MIN_ZOOM = Object.freeze({
    power_substation: 13, power_plant: 8, power_generator_area: 13, power_portal_way: 14,
    power_substation_point: 10, power_plant_point: 10, power_generator: 12,
    power_tower: 15, power_transformer: 15, power_switch: 16, power_compensator: 15,
    telecoms_data_center: 10, telecoms_cabinet: 14, telecoms_mast: 10,
    telecoms_data_center_point: 10, petroleum_site: 8, petroleum_well: 10,
    water_well: 10, water_reservoir_point: 12, water_treatment_plant_point: 10,
    wastewater_plant_point: 10, pumping_station_point: 11,
    water_treatment_plant_polygon: 10, wastewater_plant_polygon: 10, pumping_station_polygon: 10,
    power_heatmap_solar: 3, issues: 11
  });
  const sourceById = Object.fromEntries(SOURCES.map(source => [source.id, source]));
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  let state = {
    opacity: 1,
    categories: Object.fromEntries(SOURCES.map(source => [source.id, !SOURCE_DETAILS[source.id]])),
    labels: false,
    symbols: true
  };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object") {
      if (Number.isFinite(Number(saved.opacity))) state.opacity = Math.max(0, Math.min(1, Number(saved.opacity)));
      if (saved.categories && typeof saved.categories === "object") {
        for (const source of SOURCES) if (typeof saved.categories[source.id] === "boolean") state.categories[source.id] = saved.categories[source.id];
      }
      if (typeof saved.symbols === "boolean") state.symbols = saved.symbols;
    }
  } catch {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  let map = null;
  let boundaryFillOpacity = 0.2;
  let pane = null;
  let enabled = false;
  const tileLayers = new Map();
  const hiddenBoundaries = new Set();
  let control = null;
  let panel = null;
  let button = null;
  let selected = false;
  let statusText = "";
  let statusError = false;
  let tooltip = null;
  let hoverKey = "";
  let hoverFrame = null;
  let hoverLatLng = null;
  let hoverHideTimer = null;

  function voltageKv(props, key = "voltage") {
    return Math.max(0, ...String(props?.[key] ?? "0").split(";").map(item => Number(item.trim()) || 0));
  }
  function powerColor(feature) {
    const props = feature?.props || {};
    const frequency = props.frequency;
    if (frequency !== undefined && frequency !== null && String(frequency) !== "") {
      const hz = Number(frequency);
      if (hz === 0) return "#4e01b5";
      if (Number.isFinite(hz) && hz !== 50 && hz !== 60) return "#a8b596";
    }
    const voltage = voltageKv(props);
    if (voltage >= 550) return "#00c1cf";
    if (voltage >= 310) return "#b54eb2";
    if (voltage >= 220) return "#c73030";
    if (voltage >= 132) return "#b55d00";
    if (voltage >= 52) return "#b59f10";
    if (voltage >= 25) return "#55b555";
    if (voltage >= 10) return "#6e97b8";
    return "#7a7a85";
  }
  function powerVisible(z, feature) {
    const voltage = voltageKv(feature?.props);
    const line = feature?.props?.line;
    return (voltage > 199 || (voltage > 99 && z >= 4) || (voltage > 49 && z >= 5) ||
      (voltage > 24 && z >= 6) || (voltage > 9 && z >= 9) || z > 10) &&
      (!(["busbar", "bay"].includes(line)) || z > 12);
  }
  function underground(feature) {
    const p = feature?.props || {};
    return p.underground === true || p.tunnel === true ||
      ["underground", "underwater", "submarine"].includes(p.location);
  }
  function featureColor(source, name, feature) {
    return source.color;
  }
  function minimumZoom(name, type) {
    return MIN_ZOOM[name] ?? (type === "point" ? 10 : type === "area" ? 8 : 2);
  }
  function boundaryKey(source, layerName, feature) {
    const id = feature?.props?.osm_id ?? feature?.props?.osmId ?? feature?.id;
    if (id == null || !/^-?[1-9][0-9]*$/.test(String(id))) return "";
    return `${source.id}:${layerName}:${id}`;
  }
  function boundaryVisible(source, layerName, feature) {
    const key = boundaryKey(source, layerName, feature);
    return !key || !hiddenBoundaries.has(key);
  }
  function redrawBoundarySource(sourceId) {
    const layer = tileLayers.get(sourceId);
    if (layer && map?.hasLayer(layer)) layer.redraw();
    clearHover();
  }
  // Keep regional solar density bounded while making important sites visible early.
  // Selection is stable across redraws and full detail returns at street zoom.
  function solarVisible(z, feature) {
    if (z >= 12) return true;
    const output = Number(feature?.props?.output) || 0;
    if (z >= 3 && output >= 500000) return true;
    if (z >= 6 && output >= 150000) return true;
    if (z >= 9 && output >= 50000) return true;
    const divisor = z < 4 ? 56 : z < 6 ? 36 : z < 8 ? 16 : z < 10 ? 8 : 3;
    const point = feature?.geom?.[0]?.[0];
    const seed = String(feature?.id ?? feature?.props?.osm_id ?? `${point?.x ?? 0}:${point?.y ?? 0}:${output}`);
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
    return (hash >>> 0) % divisor === 0;
  }
  function paintRules(source) {
    const pointRgb = [1, 3, 5].map(i => parseInt(source.color.slice(i, i + 2), 16)).join(",");
    const P = window.protomapsL;
    const rules = [];
    for (const [name, type] of source.layers) {
      const minzoom = minimumZoom(name, type);
      const color = (z, feature) => featureColor(source, name, feature);
      if (name === "power_line") {
        const settings = {color, width: (z, feature) => Math.min(3.1, Math.max(0.9, 0.75 + (z - 3) * 0.10 + Math.min(0.7, voltageKv(feature?.props) / 600))), opacity: 1, lineJoin: "round"};
        rules.push({dataLayer: name, minzoom, filter: (z, feature) => powerVisible(z, feature) && !underground(feature), symbolizer: new P.LineSymbolizer(settings)});
        rules.push({dataLayer: name, minzoom, filter: (z, feature) => powerVisible(z, feature) && underground(feature), symbolizer: new P.LineSymbolizer({...settings, dash: [3, 2]})});
        continue;
      }
      if (type === "line") {
        const width = (z, feature) => name === "petroleum_pipeline" || name === "water_pipeline"
          ? Math.max(0.8, Math.min(2.65, 0.65 + (z - 3) * 0.12 + (feature?.props?.usage === "transmission" ? 0.4 : 0.15)))
          : Math.max(0.7, Math.min(2.5, 0.65 + (z - 3) * 0.11));
        rules.push({dataLayer: name, minzoom,
          filter: (z, feature) => source.id !== "solar" && source.id !== "validation" && (name !== "telecoms_communication_line" || !(feature.props?.disused || feature.props?.construction)),
          symbolizer: new P.LineSymbolizer({color, width, opacity: 1, lineJoin: "round", ...(name === "telecoms_communication_line" ? {dash: [3,2]} : {})})});
      } else if (type === "area") {
        const filter = (z, feature) => boundaryVisible(source, name, feature) && (name !== "power_generator_area" || feature.props?.source === "solar");
        rules.push({dataLayer: name, minzoom, filter,
          symbolizer: new P.PolygonSymbolizer({fill: color, opacity: () => boundaryFillOpacity, width: 0})});
        rules.push({dataLayer: name, minzoom, filter,
          symbolizer: new P.PolygonSymbolizer({fill: "rgba(0,0,0,0)", stroke: color, width: 1})});
      } else {
        const radius = (z, feature) => name === "power_tower" ? (feature.props?.type === "pole" ? 1.2 : 1.9) :
          name === "power_substation_point" ? Math.min(4.1, Math.max(2.1, 1.8 + (z - 7) * 0.13 + Math.min(0.7, voltageKv(feature.props) / 500))) :
          source.id === "validation" ? Math.max(3.5, Math.min(6.5, 3.5 + (z - 11) * 0.4)) :
          source.id === "solar" ? Math.max(3.5, Math.min(8.5, 3.5 + (z - 3) * 0.38 + Math.min(1.2, (Number(feature.props?.output) || 0) / 300000))) :
          Math.max(1.7, Math.min(4.2, 2 + (z - minzoom) * 0.16));
        rules.push({dataLayer: name, minzoom, filter: (z, feature) => (source.id === "validation" || source.id === "solar" || state.symbols) &&
          (source.id !== "solar" || solarVisible(z, feature)) &&
          (name !== "power_generator" || feature.props?.source !== "solar" || z >= 12),
          symbolizer: new P.CircleSymbolizer({radius, fill: source.id === "validation" ? color : () => `rgba(${pointRgb},${pointFillOpacity})`,
            stroke: source.id === "validation" ? "#832f2f" : source.color,
            width: source.id === "solar" ? 2 : 1.05, opacity: 1})});
      }
    }
    return rules;
  }
  function labelText(source, name, feature) {
    const p = feature?.props || {};
    const voltage = voltageKv(p);
    const title = String(p.name || p.ref || p.operator || "").trim();
    if (name === "power_line") {
      if (voltage === 0) return title;
      return title ? `${title} (${voltage} kV)` : `${voltage} kV`;
    }
    if (name === "power_substation_point" && voltage) return title ? `${title} ${voltage} kV` : `Substation ${voltage} kV`;
    if (name === "petroleum_pipeline" && !title) return String(p.substance || "").replace(/_/g, " ");
    if (name === "water_pipeline" && !title) return String(p.substance || "").replace(/_/g, " ");
    return title;
  }
  function labelRules(source) {
    const P = window.protomapsL;
    if (source.id === "solar" || source.id === "validation") return [];
    return source.layers.filter(([name, type]) => (type === "line" || type === "point") && name !== "power_tower").map(([name, type]) => {
      const minzoom = Math.max(minimumZoom(name, type), type === "line" ? (name === "power_line" ? 9 : 11) : (name === "power_plant_point" ? 8 : 11));
      const filter = (z, feature) => {
        if (!state.labels || !feature?.props) return false;
        const text = labelText(source, name, feature);
        if (!text) return false;
        feature.props._faOimLabel = text;
        return true;
      };
      const symbolizer = type === "line" ? new P.LineLabelSymbolizer({labelProps: ["_faOimLabel"], font: "600 10px sans-serif", fill: "#f5f5f5", stroke: "#232323", width: 2.5, repeatDistance: 420, maxLabelChars: 42})
        : new P.OffsetTextSymbolizer({labelProps: ["_faOimLabel"], font: "600 11px sans-serif", fill: "#f5f5f5", stroke: "#232323", width: 2.5, maxLineChars: 28, offsetY: 11});
      return {dataLayer: name, minzoom, filter, symbolizer};
    }).concat(source.id === "power" ? [{dataLayer: "power_tower", minzoom: 15, filter: (z, feature) => {
      if (!state.labels || !feature?.props?.ref) return false;
      feature.props._faOimLabel = String(feature.props.ref);
      return true;
    }, symbolizer: new P.CenteredTextSymbolizer({labelProps: ["_faOimLabel"], font: "500 9px sans-serif", fill: "#eee", stroke: "#262626", width: 2})}] : []);
  }
  function ensurePane() {
    if (!map) return;
    pane = map.getPane("faOimPane") || map.createPane("faOimPane", map._rotatePane || map.getPane("overlayPane"));
    pane.style.zIndex = "435";
    pane.style.pointerEvents = "none";
    pane.style.opacity = String(state.opacity);
  }
  function setStatus(text, error = false) {
    statusText = text;
    statusError = error;
    const node = control?.querySelector("#fa-oim-status");
    if (node) { node.textContent = text; node.classList.toggle("error", error); }
  }
  function cancelHoverHide() {
    if (hoverHideTimer !== null) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
  }
  function scheduleHoverHide() {
    cancelHoverHide();
    hoverHideTimer = setTimeout(() => { hoverHideTimer = null; clearHover(); }, 1100);
  }
  function clearHover() {
    cancelHoverHide();
    hoverKey = "";
    if (tooltip && map?.hasLayer(tooltip)) map.removeLayer(tooltip);
  }
  function osmEntryUrl(feature, layerName) {
    const props = feature?.props || {};
    for (const url of [props.osm_url, props.osm_link, props.openstreetmap_url, props.source_url, props.osm]) {
      try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parsed.protocol === "https:" && ["openstreetmap.org", "www.openstreetmap.org"].includes(parsed.hostname) && parts.length === 2 && ["node", "way", "relation"].includes(parts[0]) && /^[1-9][0-9]*$/.test(parts[1])) return `https://www.openstreetmap.org/${parts[0]}/${parts[1]}`;
      } catch {}
    }
    if (layerName === "issues" && !props.osm_type && !props.osmType) return "";
    const rawId = props.osm_id ?? props.osmId ?? feature?.id;
    if (typeof rawId === "number" && !Number.isSafeInteger(rawId)) return "";
    const signedId = String(rawId ?? "");
    if (!/^-?[1-9][0-9]*$/.test(signedId)) return "";
    const rawType = String(props.osm_type ?? props.osmType ?? "").toLowerCase();
    const explicit = ({n: "node", w: "way", r: "relation"})[rawType] || rawType;
    const geometry = SOURCES.flatMap(source => source.layers).find(([name]) => name === layerName)?.[1];
    const type = signedId.startsWith("-") ? "relation" : /^(node|way|relation)$/.test(explicit) ? explicit : geometry === "point" ? "node" : (geometry === "line" || geometry === "area") ? "way" : "";
    return type ? `https://www.openstreetmap.org/${type}/${signedId.replace(/^-/, "")}` : "";
  }
  function hoverDetails(source, item) {
    const props = item.feature?.props || {};
    const kind = String(props.type || props.kind || item.layerName || "Infrastructure").replace(/_/g, " ");
    const title = String(props.name || props.ref || kind).trim() || kind;
    const fields = [
      ["TYPE", kind], ["OPERATOR", props.operator], ["VOLTAGE", props.voltage ? `${props.voltage} kV` : null],
      ["CIRCUITS", props.circuits], ["SUBSTANCE", props.substance], ["DIAMETER", props.diameter],
      ["PRESSURE", props.pressure], ["CAPACITY", props.capacity], ["STATUS", props.status]
    ].filter(([, value]) => value !== undefined && value !== null && String(value).trim());
    const link = osmEntryUrl(item.feature, item.layerName);
    const label = "OpenStreetMap";
    return `<div class="poi-hover-preview"><div class="poi-hover-name">${escapeHtml(title)}</div>` +
      `<div class="poi-hover-category"><span class="poi-hover-category-dot" style="background:${source.color}"></span><span>${escapeHtml(source.name)}</span></div>` +
      fields.slice(0, 5).map(([label, value]) => `<div class="poi-hover-detail"><span class="poi-hover-label">${label}</span><span>${escapeHtml(value)}</span></div>`).join("") +
      (link ? `<div class="poi-hover-detail"><span class="poi-hover-label">OPEN</span><span><a class="fa-oim-osm-link" href="${link}" target="_blank" rel="noopener noreferrer">${label}</a></span></div>` : "") + `</div>`;
  }
  function queryBoundary(latlng) {
    if (!map || !enabled) return null;
    for (const source of SOURCES) {
      if (!state.categories[source.id]) continue;
      const layer = tileLayers.get(source.id);
      if (!layer || !map.hasLayer(layer) || typeof layer.queryTileFeaturesDebug !== "function") continue;
      const areas = new Set(source.layers.filter(([, type]) => type === "area").map(([name]) => name));
      if (!areas.size) continue;
      const groups = layer.queryTileFeaturesDebug(latlng.lng, latlng.lat, 4);
      for (const entries of groups.values()) for (const item of entries) {
        if (!areas.has(item.layerName) || map.getZoom() < minimumZoom(item.layerName, "area")) continue;
        const key = boundaryKey(source, item.layerName, item.feature);
        if (key && !hiddenBoundaries.has(key)) return {source, item, key};
      }
    }
    return null;
  }
  function completeOsmBoundary(xml, type, id) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) throw Error("Invalid OpenStreetMap geometry response.");
    const nodes = new Map([...doc.querySelectorAll("node[id][lat][lon]")].map(node => [node.getAttribute("id"), [Number(node.getAttribute("lon")), Number(node.getAttribute("lat"))]]));
    const ways = new Map([...doc.querySelectorAll("way[id]")].map(way => [way.getAttribute("id"), [...way.querySelectorAll("nd[ref]")].map(nd => nd.getAttribute("ref"))]));
    const closed = refs => refs.length >= 4 && refs[0] === refs[refs.length - 1] && refs.every(ref => nodes.has(ref));
    const coords = refs => refs.map(ref => nodes.get(ref));
    if (type === "way") {
      const refs = ways.get(id) || [];
      if (!closed(refs)) throw Error("This OSM way is not a complete polygon.");
      if (refs.length > 25000) throw Error("This boundary is too large to convert safely.");
      return {type: "Polygon", coordinates: [coords(refs)]};
    }
    const relation = [...doc.querySelectorAll("relation[id]")].find(item => item.getAttribute("id") === id);
    if (!relation) throw Error("OSM relation not found.");
    function joinedRings(role) {
      const segments = [...relation.querySelectorAll("member[type=way][ref]")].filter(member => (member.getAttribute("role") || "outer") === role)
        .map(member => ways.get(member.getAttribute("ref"))).filter(Boolean).map(refs => [...refs]);
      const rings = [];
      while (segments.length) {
        let chain = segments.shift();
        while (chain[0] !== chain[chain.length - 1]) {
          const index = segments.findIndex(refs => [refs[0], refs[refs.length - 1]].includes(chain[0]) || [refs[0], refs[refs.length - 1]].includes(chain[chain.length - 1]));
          if (index < 0) throw Error("OSM relation has an incomplete boundary.");
          const refs = segments.splice(index, 1)[0];
          if (chain[chain.length - 1] === refs[0]) chain.push(...refs.slice(1));
          else if (chain[chain.length - 1] === refs[refs.length - 1]) chain.push(...refs.reverse().slice(1));
          else if (chain[0] === refs[refs.length - 1]) chain.unshift(...refs.slice(0, -1));
          else if (chain[0] === refs[0]) chain.unshift(...refs.reverse().slice(0, -1));
        }
        if (!closed(chain)) throw Error("OSM relation contains missing coordinates.");
        rings.push(coords(chain));
      }
      return rings;
    }
    const outer = joinedRings("outer"), inner = joinedRings("inner");
    if (!outer.length) throw Error("OSM relation has no outer boundary.");
    if (outer.concat(inner).reduce((count, ring) => count + ring.length, 0) > 25000) throw Error("This boundary is too large to convert safely.");
    const polygons = outer.map(ring => [ring]);
    function inside(point, ring) {
      let found = false;
      for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
        const x = ring[a], y = ring[b];
        if ((x[1] > point[1]) !== (y[1] > point[1]) && point[0] < (y[0] - x[0]) * (point[1] - x[1]) / (y[1] - x[1]) + x[0]) found = !found;
      }
      return found;
    }
    for (const ring of inner) {
      const index = outer.findIndex(parent => inside(ring[0], parent));
      if (index < 0) throw Error("OSM relation has an unmatched inner boundary.");
      polygons[index].push(ring);
    }
    return polygons.length === 1 ? {type: "Polygon", coordinates: polygons[0]} : {type: "MultiPolygon", coordinates: polygons};
  }
  async function convertBoundary(hit) {
    const url = osmEntryUrl(hit.item.feature, hit.item.layerName);
    const match = url.match(/\/(way|relation)\/([1-9][0-9]*)$/);
    if (!match) throw Error("This boundary has no usable OSM way or relation ID.");
    const [, type, id] = match;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let xml;
    try {
      const response = await fetch(`https://api.openstreetmap.org/api/0.6/${type}/${id}/full`, {signal: controller.signal});
      if (!response.ok) throw Error(`OpenStreetMap geometry request failed (${response.status}).`);
      xml = await response.text();
    } finally { clearTimeout(timeout); }
    const geometry = completeOsmBoundary(xml, type, id);
    if (!window.FAPOI?.beginExternalDraft) throw Error("POI editor is unavailable.");
    const props = hit.item.feature.props || {};
    const name = String(props.name || props.ref || hit.item.layerName.replace(/_/g, " "));
    return window.FAPOI.beginExternalDraft({geometry, name, category: hit.source.name, tags: ["OpenInfraMap", hit.source.name], color: hit.source.color,
      customFields: {source: "OpenInfraMap", osm_type: type, osm_id: id, source_url: url, osm_tags: {...props}}});
  }
  function bindBoundaryMenu(target) {
    target.getContainer().addEventListener("contextmenu", event => {
      if (!enabled || event.target?.closest?.(".leaflet-control,.leaflet-marker-icon,.leaflet-popup,.leaflet-tooltip,.leaflet-interactive,.map-context-menu")) return;
      if (!window.FAMapContext?.showFeatureMenu) return;
      const latlng = target.mouseEventToLatLng(event);
      const hit = queryBoundary(latlng);
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      event._faFeatureContextHandled = true;
      clearHover();
      const menu = {label: "Hide boundary", hide: () => {
        hiddenBoundaries.add(hit.key);
        redrawBoundarySource(hit.source.id);
        window.FAMapContext?.recordAction?.({scope: "oim", undo: () => {hiddenBoundaries.delete(hit.key); redrawBoundarySource(hit.source.id);},
          redo: () => {hiddenBoundaries.add(hit.key); redrawBoundarySource(hit.source.id);}});
      }};
      if (/\/(way|relation)\/[1-9][0-9]*$/.test(osmEntryUrl(hit.item.feature, hit.item.layerName))) menu.convert = () => convertBoundary(hit);
      window.FAMapContext.showFeatureMenu({latlng, originalEvent: event, containerPoint: target.mouseEventToContainerPoint(event)}, menu);
    }, true);
  }
  function queryHover(latlng) {
    if (!map || !enabled) return null;
    // Protomaps queries the vector data already in its tile cache; no extra HTTP requests.
    for (const source of SOURCES) {
      if (!state.categories[source.id]) continue;
      const layer = tileLayers.get(source.id);
      if (!layer || !map.hasLayer(layer) || typeof layer.queryTileFeaturesDebug !== "function") continue;
      const groups = layer.queryTileFeaturesDebug(latlng.lng, latlng.lat, 9);
      for (const entries of groups.values()) {
        for (const item of entries) {
          if (source.layers.some(([name, type]) => name === item.layerName && map.getZoom() >= minimumZoom(name, type)) &&
              (source.id !== "solar" || solarVisible(map.getZoom(), item.feature)) && boundaryVisible(source, item.layerName, item.feature)) return {source, item};
        }
      }
    }
    return null;
  }
  function updateHover(latlng) {
    if (!enabled || !map || map.dragging?.moving?.()) { clearHover(); return; }
    const hit = queryHover(latlng);
    if (!hit) { scheduleHoverHide(); return; }
    cancelHoverHide();
    const key = `${hit.source.id}:${hit.item.layerName}:${hit.item.feature?.id ?? ""}:${JSON.stringify(hit.item.feature?.props || {})}`;
    if (!tooltip) tooltip = L.tooltip({className: "poi-hover-tooltip fa-oim-tooltip", direction: "top", offset: [0, -10], opacity: 1, interactive: true});
    if (key === hoverKey && map.hasLayer(tooltip)) return;
    tooltip.setContent(hoverDetails(hit.source, hit.item)); hoverKey = key;
    tooltip.setLatLng(latlng);
    if (!map.hasLayer(tooltip)) tooltip.addTo(map);
    const hoverElement = tooltip.getElement?.();
    if (hoverElement && !hoverElement._faOimBound) {
      hoverElement._faOimBound = true;
      hoverElement.addEventListener("mouseenter", cancelHoverHide);
      hoverElement.addEventListener("mouseleave", scheduleHoverHide);
    }
  }
  function bindHover(target) {
    const el = target.getContainer();
    el.addEventListener("mousemove", event => {
      if (event.target?.closest?.(".fa-oim-tooltip")) { cancelHoverHide(); return; }
      if (!enabled || event.target?.closest?.(".leaflet-control,.leaflet-marker-icon,.leaflet-popup,.leaflet-tooltip,.leaflet-interactive")) { if (!enabled) clearHover(); else scheduleHoverHide(); return; }
      hoverLatLng = target.mouseEventToLatLng(event);
      if (hoverFrame !== null) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = null;
        if (map !== target) return;
        try { updateHover(hoverLatLng); } catch (error) { clearHover(); void 0; }
      });
    });
    el.addEventListener("mouseleave", scheduleHoverHide);
    target.on("movestart zoomstart", clearHover);
  }
  function makeLayer(source) {
    const vector = window.protomapsL.leafletLayer({
      url: source.url.startsWith("https://") ? source.url : `https://openinframap.org/map/${source.url}/{z}/{x}/{y}.pbf`,
      pane: "faOimPane", maxDataZoom: 17, maxZoom: 22,
      keepBuffer: 1, updateWhenIdle: true, updateWhenZooming: false, tileDelay: 1,
      attribution: ATTRIBUTION, paintRules: paintRules(source), labelRules: []
    });
    vector.options.pmIgnore = true;
    vector.options.snapIgnore = true;
    vector.on?.("tileerror", () => setStatus("An OpenInfraMap tile could not load. Check connectivity.", true));
    return vector;
  }
  function syncLayers() {
    if (!map || !enabled) return;
    if (!window.protomapsL?.leafletLayer) {
      setStatus("Vector renderer unavailable.", true);
      return;
    }
    ensurePane();
    const zoom = map.getZoom();
    for (const source of SOURCES) {
      let layer = tileLayers.get(source.id);
      const minZoom = source.id === "solar" ? 3 : source.id === "validation" ? 11 : 0;
      if (state.categories[source.id] && zoom >= minZoom) {
        if (!layer) {
          layer = makeLayer(source);
          tileLayers.set(source.id, layer);
        }
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    }
    const pending = [];
    if (state.categories.solar && zoom < 3) pending.push("Solar generation (zoom 3+)");
    if (state.categories.validation && zoom < 11) pending.push("Osmose (zoom 11+)");
    setStatus(pending.length ? `Zoom in to display ${pending.join(" and ")}.` :
      SOURCES.some(source => state.categories[source.id]) ? "" : "Select a category to show infrastructure.");
  }
  function setEnabled(value) {
    enabled = !!value;
    if (enabled) syncLayers();
    else if (map) for (const layer of tileLayers.values()) if (map.hasLayer(layer)) map.removeLayer(layer);
    if (!enabled) clearHover();
    if (!enabled) setStatus("");
    refreshControl();
    window.FAOverpass?.refreshToolSlot?.();
    return isEnabled();
  }
  function isEnabled() { return Boolean(enabled && map); }
  function toggle() { return setEnabled(!isEnabled()); }
  function setPointFillOpacity(value) {
    const opacity = Number(value);
    if (!Number.isFinite(opacity)) return;
    const next = Math.max(0, Math.min(1, opacity));
    if (next === pointFillOpacity) return;
    pointFillOpacity = next;
    for (const source of SOURCES) {
      if (source.id === "validation" || !source.layers.some(([, type]) => type === "point")) continue;
      const layer = tileLayers.get(source.id);
      if (layer && map?.hasLayer(layer)) layer.redraw();
    }
  }
  function setOpacity(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    state.opacity = Math.max(0, Math.min(1, number));
    if (pane) pane.style.opacity = String(state.opacity);
    persist();
    refreshControl();
  }
  function setCategory(id, active) {
    if (!sourceById[id]) return;
    state.categories[id] = !!active;
    clearHover();
    persist();
    syncLayers();
    refreshControl();
  }
  function setDetail(key, value) {
    if (key !== "labels" && key !== "symbols") return;
    state[key] = !!value;
    clearHover();
    persist();
    for (const layer of tileLayers.values()) if (map?.hasLayer(layer)) layer.redraw();
    refreshControl();
  }
  function init(nextMap) {
    if (!nextMap || nextMap === map) return;
    if (map) for (const layer of tileLayers.values()) if (map.hasLayer(layer)) map.removeLayer(layer);
    clearHover();
    map = nextMap;
    tooltip = null;
    bindHover(nextMap);
    bindBoundaryMenu(nextMap);
    nextMap.on("zoomend", () => { if (map === nextMap && enabled) syncLayers(); });
    tileLayers.clear();
    pane = null;
    ensurePane();
    if (enabled) syncLayers();
  }
  function refreshControl() {
    if (!control) return;
    control.classList.toggle("hidden", !selected);
    button?.setAttribute("aria-pressed", String(isEnabled()));
    if (button) button.title = isEnabled() ? "OpenInfraMap infrastructure settings" : "OpenInfraMap settings (turn on OIM to view)";
    for (const input of control.querySelectorAll("input[data-oim-category]")) input.checked = !!state.categories[input.dataset.oimCategory];
    for (const input of control.querySelectorAll("input[data-oim-detail]")) input.checked = !!state[input.dataset.oimDetail];
    const slider = control.querySelector("#fa-oim-opacity");
    if (slider) { slider.value = String(Math.round(state.opacity * 100)); slider.style.setProperty("--range-pct", slider.value + "%"); }
    const value = control.querySelector("#fa-oim-opacity-value");
    if (value) value.textContent = Math.round(state.opacity * 100) + "%";
    const reset = control.querySelector("#fa-oim-opacity-reset");
    if (reset) reset.disabled = Math.abs(state.opacity - 1) < 0.001;
    setStatus(statusText, statusError);
  }
  function closePanel() {
    panel?.classList.add("hidden");
    control?.classList.remove("legend-pinned");
    button?.setAttribute("aria-expanded", "false");
  }
  function setSlotSelected(value) {
    selected = !!value;
    if (!selected) closePanel();
    refreshControl();
  }
  function attachUi() {
    if (control || !document.getElementById("overpass-toggle")) return;
    const selector = document.getElementById("overpass-toggle");
    control = document.createElement("div");
    control.id = "fa-oim-info";
    control.className = "tool-settings-info hidden";
    control.dataset.faOwner = "oim";
    control.innerHTML = `
      <button class="tool-settings-info-button" type="button" aria-label="OpenInfraMap layer options" aria-expanded="false"><span class="worldcover-legend-glyph" aria-hidden="true"><svg class="info-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 17.75C12.4142 17.75 12.75 17.4142 12.75 17V11C12.75 10.5858 12.4142 10.25 12 10.25C11.5858 10.25 11.25 10.5858 11.25 11V17C11.25 17.4142 11.5858 17.75 12 17.75Z" fill="#fff"/><path d="M12 7C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9C11.4477 9 11 8.55228 11 8C11 7.44772 11.4477 7 12 7Z" fill="#fff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12ZM12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75Z" fill="#fff"/></svg></span></button>
      <section id="fa-oim-panel" class="fa-oim-panel hidden" role="dialog" aria-label="OpenInfraMap settings" data-fa-exclusive="oim">
        <div class="ovp-header"><strong>OpenInfraMap</strong><button id="fa-oim-close" class="secondary small" type="button">Close</button></div>
        <div class="fa-oim-section settings-group-label">Infrastructure</div>
        <div class="fa-oim-list">${SOURCES.filter(source => !SOURCE_DETAILS[source.id]).map(source => `<label class="fa-oim-row check-line"><input type="checkbox" data-oim-category="${source.id}"><span class="fa-oim-swatch" style="--oim-swatch:${source.color}"></span><span>${source.name}</span></label>`).join("")}</div>
        <div class="fa-oim-section settings-group-label">Details</div>
        <div class="fa-oim-list">
          <label class="fa-oim-row check-line"><input type="checkbox" data-oim-detail="symbols"><span>Infrastructure points</span></label>
        </div>
        <div class="fa-oim-section settings-group-label">Additional data</div>
        <div class="fa-oim-list">${SOURCES.filter(source => SOURCE_DETAILS[source.id]).map(source => `<label class="fa-oim-row check-line"><input type="checkbox" data-oim-category="${source.id}"><span class="fa-oim-swatch" style="--oim-swatch:${source.color}"></span><span>${source.name}</span></label>`).join("")}</div>
        <div class="fa-oim-opacity"><div class="satellite-brightness-header"><span class="settings-group-label">Opacity</span><button id="fa-oim-opacity-reset" class="secondary small satellite-brightness-reset" type="button">Reset</button></div><label class="satellite-brightness-control"><input id="fa-oim-opacity" type="range" min="0" max="100" step="5" value="100" aria-label="OpenInfraMap opacity"><span id="fa-oim-opacity-value">100%</span></label></div>
        <div id="fa-oim-status" class="fa-oim-status" role="status"></div>
        <a class="fa-oim-source" href="https://openinframap.org/" target="_blank" rel="noopener noreferrer">Open original map ↗</a>
      </section>`;
    selector.parentNode.insertBefore(control, selector.nextSibling);
    panel = control.querySelector("#fa-oim-panel");
    button = control.querySelector(".tool-settings-info-button");
    button.addEventListener("click", event => {
      event.stopPropagation();
      const opening = panel.classList.contains("hidden");
      if (!opening) { closePanel(); return; }
      window.FAUI?.openExclusive?.("oim");
      panel.classList.remove("hidden");
      control.classList.add("legend-pinned");
      button.setAttribute("aria-expanded", "true");
    });
    panel.querySelector("#fa-oim-close").addEventListener("click", closePanel);
    panel.addEventListener("pointerdown", event => event.stopPropagation());
    panel.addEventListener("click", event => event.stopPropagation());
    panel.addEventListener("wheel", event => event.stopPropagation(), {passive: true});
    for (const input of panel.querySelectorAll("input[data-oim-category]")) input.addEventListener("change", () => setCategory(input.dataset.oimCategory, input.checked));
    for (const input of panel.querySelectorAll("input[data-oim-detail]")) input.addEventListener("change", () => setDetail(input.dataset.oimDetail, input.checked));
    panel.querySelector("#fa-oim-opacity").addEventListener("input", event => setOpacity(Number(event.target.value) / 100));
    panel.querySelector("#fa-oim-opacity-reset").addEventListener("click", () => setOpacity(1));
    document.addEventListener("pointerdown", event => { if (control && !control.contains(event.target)) closePanel(); }, true);
    const style = document.createElement("style");
    style.id = "fa-oim-style";
    style.textContent = `
      #fa-oim-panel.fa-oim-panel{position:absolute;top:calc(100% + 6px);right:0;width:min(274px,calc(100vw - 24px));max-height:calc(100vh - 110px);overflow-y:auto;padding:11px 12px;border:1px solid var(--border);border-radius:4px;background:#171717;color:var(--muted);box-shadow:0 10px 28px rgba(0,0,0,.43);text-align:left;z-index:920;zoom:1}
      .fa-oim-panel .ovp-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
      .fa-oim-list{display:grid;gap:2px;padding-bottom:2px}
      .fa-oim-section{margin:7px 0 4px;padding-top:6px;border-top:1px solid var(--border)}
      .fa-oim-section:first-of-type{margin-top:4px;border:0;padding-top:0}
      .fa-oim-panel .fa-oim-row{display:flex;align-items:center;gap:7px;min-height:24px;padding:0;margin:0;cursor:pointer;color:var(--text);font-size:12px}
      .fa-oim-panel .fa-oim-row span:last-child{text-align:left;min-width:0;white-space:nowrap}
      .fa-oim-swatch{flex:none;width:21px;height:4px;background:var(--oim-swatch);border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,.3)}
      .fa-oim-opacity{border-top:1px solid var(--border);padding-top:9px;margin-top:3px}
      .fa-oim-opacity .settings-group-label{display:inline-block}
      .fa-oim-opacity .satellite-brightness-control{margin-top:7px}
      .fa-oim-status{margin-top:9px;font-size:10px;line-height:1.4;color:var(--muted)}
      .fa-oim-status:empty{display:none}
      .fa-oim-status.error{color:#f29d91}
      .fa-oim-source{display:inline-block;margin-top:7px;font-size:11px;color:var(--poi-color);text-decoration:none}
      .fa-oim-source:hover{text-decoration:underline}
      .leaflet-tooltip.fa-oim-tooltip{pointer-events:auto !important}
      .fa-oim-osm-link{color:var(--text);text-decoration:underline;text-underline-offset:2px}
    `;
    document.head.appendChild(style);
    refreshControl();
  }
  function setBoundaryFillOpacity(value) {
    const opacity = Number(value);
    if (!Number.isFinite(opacity)) return;
    const next = Math.max(0, Math.min(1, opacity));
    if (boundaryFillOpacity === next && pointFillOpacity === next) return;

    boundaryFillOpacity = next;
    pointFillOpacity = next;

    for (const layer of tileLayers.values()) {
      if (map?.hasLayer(layer)) {
        if (typeof layer.rerenderTiles === "function") {
          layer.rerenderTiles();
        } else {
          layer.redraw();
        }
      }
    }
  }
  window.FAOIM = Object.freeze({setPointFillOpacity, init, attachUi, setBoundaryFillOpacity, isEnabled, setEnabled, toggle, getOpacity: () => state.opacity, setOpacity, setCategory, setDetail, setSlotSelected, closePanel});
})();
