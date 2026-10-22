(() => {
  "use strict";

  const SKETCH_PATH = "/collections/sketches/records";
  const SKETCH_ID = "fasketchstate1";
  const DRAFT_KEY = "fa-sketch-unsynced-v1";
  const PANE_NAME = "faSketchPane";
  const STYLE_ID = "fa-sketch-style";
  const TOOLBAR_ID = "fa-sketch-toolbar";
  const COLORS = ["#ffffff", "#ff5b61", "#ffd34d", "#4fd17a", "#4aa3ff"];
  const SIZE_PRESETS = {
    thin: {pen: 2, highlight: 12, shape: 2},
    medium: {pen: 4, highlight: 18, shape: 3},
    thick: {pen: 7, highlight: 26, shape: 5}
  };

  let map = null;
  let pane = null;
  let group = null;
  let toolbar = null;
  let sketchesVisible = true;
  let active = false;
  let tool = "pen";
  let color = COLORS[1];
  let size = (() => { try { const saved = localStorage.getItem("fa-sketch-size-v1"); return SIZE_PRESETS[saved] ? saved : "thin"; } catch { return "thin"; } })();
  let records = [];
  let serverUpdated = null;
  let loaded = false;
  let revision = 0;
  let savedRevision = 0;
  let savePromise = null;
  let storageWarningShown = false;
  let undoStack = [];
  let redoStack = [];
  let gesture = null;
  let previewLayer = null;
  let draggingWasEnabled = false;
  let spacePanDown = false;
  let spacePanStartedAt = 0;
  let spacePanMoved = false;
  const SPACE_TAP_MS = 220;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function storedDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); }
    catch { return null; }
  }

  function cacheDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({updated: serverUpdated, data: records}));
      storageWarningShown = false;
    } catch (error) {
      void 0;
      if (!storageWarningShown) {
        storageWarningShown = true;
        window.FASketchHost?.toast?.("Sketches could not be cached locally. Do not close the page until they are saved.", "error");
      }
    }
  }

  async function fetchSketchRecord() {
    try { return await window.FASketchHost.api(`${SKETCH_PATH}/${SKETCH_ID}`); }
    catch (error) { if (error.status === 404) return null; throw error; }
  }

  async function loadRecords() {
    if (loaded && revision !== savedRevision) return;
    const remote = await fetchSketchRecord();
    const updated = remote?.updated || null;
    const draft = storedDraft();
    if (draft && (draft.updated || null) !== updated) {
      throw new Error("Unsynced local sketches conflict with the database. Local sketches were preserved in browser storage; resolve this before continuing.");
    }
    if (loaded && !draft && updated === serverUpdated) return;
    serverUpdated = updated;
    records = (draft ? draft.data : remote?.data || []).filter(validRecord);
    undoStack = [];
    redoStack = [];
    loaded = true;
    revision = draft ? 1 : 0;
    savedRevision = 0;
    renderAll();
    if (draft) await flushRecords();
  }

  async function flushRecords() {
    if (savePromise) return savePromise;
    if (!loaded || savedRevision === revision) return;
    savePromise = (async () => {
      while (savedRevision !== revision) {
        const targetRevision = revision;
        const snapshot = clone(records);
        const remote = await fetchSketchRecord();
        if ((remote?.updated || null) !== serverUpdated) {
          throw new Error("Sketches changed on another device. Your unsynced changes remain in this browser; reload only after resolving the conflict.");
        }
        const saved = await window.FASketchHost.api(remote ? `${SKETCH_PATH}/${SKETCH_ID}` : SKETCH_PATH, {
          method: remote ? "PATCH" : "POST",
          body: JSON.stringify(remote ? {data: snapshot} : {id: SKETCH_ID, data: snapshot})
        });
        serverUpdated = saved.updated || null;
        savedRevision = targetRevision;
        if (savedRevision === revision) localStorage.removeItem(DRAFT_KEY);
        else cacheDraft();
      }
    })().finally(() => { savePromise = null; });
    return savePromise;
  }

  function saveRecords() {
    revision += 1;
    cacheDraft();
    void flushRecords().catch(error => {
      void 0;
      window.FASketchHost?.toast?.(`Sketches were not saved locally: ${error.message}`, "error");
    });
  }

  function validPoint(point) {
    return Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
  }

  function validRecord(record) {
    if (!record || !["pen", "highlight", "rect", "circle", "ellipse", "arrow"].includes(record.type)) return false;
    if (record.type === "pen" || record.type === "highlight" || record.type === "arrow") return Array.isArray(record.points) && record.points.length >= 2 && record.points.every(validPoint);
    if (record.type === "rect") return (Array.isArray(record.points) && record.points.length === 4 && record.points.every(validPoint)) || (validPoint(record.a) && validPoint(record.b));
    if (record.type === "ellipse") return Array.isArray(record.points) && record.points.length >= 12 && record.points.every(validPoint);
    if (record.type === "circle") return validPoint(record.center) && Number.isFinite(Number(record.radius)) && Number(record.radius) > 0;
    return false;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TOOLBAR_ID} {
        position:absolute; left:var(--map-visible-center-x, 50%); bottom:58px; z-index:1900;
        display:flex; align-items:center; gap:5px; max-width:calc(100vw - 24px); padding:6px;
        border:1px solid var(--border); border-radius:5px; background:rgba(28,28,28,.96);
        box-shadow:0 4px 18px rgba(0,0,0,.35); opacity:0; pointer-events:none;
        transform:translate(-50%, calc(100% + 32px)); transition:transform 160ms ease, opacity 160ms ease;
        white-space:nowrap; user-select:none;
      }
      #${TOOLBAR_ID}.open { opacity:1; pointer-events:auto; transform:translate(-50%, 0); }
      #${TOOLBAR_ID} button:not(.fa-sketch-color):where(:not(.fa-sketch-visibility)), #${TOOLBAR_ID} select { width:auto; min-width:0; height:30px; padding:4px 7px; background:#181818; border:1px solid #303030; border-radius:3px; color:#7c7c7c; font:inherit; font-size:12px; font-weight:400; line-height:1.1; }
      #${TOOLBAR_ID} button:not(.fa-sketch-color):where(:not(.fa-sketch-visibility)):not(:disabled):hover, #${TOOLBAR_ID} select:hover { background:#181818; border-color:#404040; color:#909090; }
      #${TOOLBAR_ID} button[data-sketch-tool].active, #${TOOLBAR_ID} button[data-sketch-tool].active:hover { background:#181818; border-color:#484848; color:color-mix(in srgb, var(--poi-color) 95%, #808080); }
      #${TOOLBAR_ID} button:focus:not(:focus-visible), #${TOOLBAR_ID} select:focus:not(:focus-visible) { outline:none; box-shadow:none; }
      #${TOOLBAR_ID} button:focus-visible, #${TOOLBAR_ID} select:focus-visible { outline:1px solid #525252; outline-offset:1px; }
      #${TOOLBAR_ID} button:not(.fa-sketch-color):disabled { color:#626262; border-color:#202020; opacity:.45; cursor:default; }
      #${TOOLBAR_ID} button[data-sketch-action="redo"]:disabled { opacity:.60; }
      #${TOOLBAR_ID} select { color:var(--muted); }
      #${TOOLBAR_ID} .fa-sketch-divider { width:1px; height:22px; margin:0 2px; background:var(--border); }
      #${TOOLBAR_ID} .fa-sketch-colors { display:flex; align-items:center; gap:4px; }
      #${TOOLBAR_ID} .fa-sketch-color { box-sizing:border-box; flex:0 0 25px; width:25px; min-width:25px; height:25px; padding:0; border:0; border-radius:50%; background:var(--swatch) !important; box-shadow:none; filter:brightness(.40) saturate(.50); transform:scale(.58); transition:transform 120ms ease, filter 120ms ease; }
      #${TOOLBAR_ID} .fa-sketch-color.active { filter:brightness(1.00) saturate(1.01); transform:scale(.76); }
      #${TOOLBAR_ID} button.fa-sketch-danger:not(:disabled), #${TOOLBAR_ID} button.fa-sketch-danger:not(:disabled):hover { color:#ff545d; }
      #${TOOLBAR_ID} button.fa-sketch-danger:disabled { color:#626262; }
      #${TOOLBAR_ID} .fa-sketch-visibility { position:absolute; right:calc(100% + 12px); top:50%; transform:translateY(-50%); box-sizing:border-box; width:30px; min-width:30px; height:30px; padding:0; display:grid; place-items:center; border:1px solid var(--border); border-radius:5px; background:rgba(28,28,28,.96); box-shadow:none; -webkit-tap-highlight-color:transparent; }
      #${TOOLBAR_ID} .fa-sketch-visibility.sketches-hidden { color:#777; }
      body.fa-sketch-open #map { cursor:crosshair !important; touch-action:none; }
      body.fa-sketch-open.fa-sketch-pan #map { cursor:grab !important; }
      body.fa-sketch-open.fa-sketch-pan #map:active { cursor:grabbing !important; }
      body.fa-sketch-open #map .leaflet-interactive { cursor:crosshair !important; }
      body.fa-sketch-open #map .leaflet-marker-icon { pointer-events:none !important; }
      @media (max-width:760px) {
        #${TOOLBAR_ID} { left:50%; max-width:calc(100vw - 12px); overflow-x:auto; }
        #${TOOLBAR_ID} .fa-sketch-visibility { position:static; transform:none; width:30px; min-width:30px; height:30px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePane() {
    if (!map) return null;
    pane = map.getPane(PANE_NAME);
    if (!pane) pane = map.createPane(PANE_NAME, map._rotatePane || map.getPane("overlayPane"));
    pane.style.zIndex = "610";
    pane.style.pointerEvents = "none";
    return pane;
  }

  function ll(point) {
    return L.latLng(Number(point[0]), Number(point[1]));
  }

  function stored(latlng) {
    return [Number(latlng.lat), Number(latlng.lng)];
  }

  function styleFor(record) {
    const preset = SIZE_PRESETS[record.size] || SIZE_PRESETS.medium;
    if (record.type === "highlight") return {pane: PANE_NAME, color: record.color, weight: preset.highlight, opacity: .45, lineCap: "round", lineJoin: "round", interactive: false};
    if (record.type === "pen" || record.type === "arrow") return {pane: PANE_NAME, color: record.color, weight: record.type === "arrow" ? preset.shape : preset.pen, opacity: .95, lineCap: "round", lineJoin: "round", interactive: false};
    return {pane: PANE_NAME, color: record.color, weight: preset.shape, opacity: .95, fillColor: record.color, fillOpacity: .06, interactive: false};
  }

  function layerFor(record) {
    const style = styleFor(record);
    if (record.type === "pen" || record.type === "highlight" || record.type === "arrow") return L.polyline(record.points.map(ll), style);
    if (record.type === "rect") return Array.isArray(record.points) ? L.polygon(record.points.map(ll), style) : L.rectangle(L.latLngBounds(ll(record.a), ll(record.b)), style);
    if (record.type === "ellipse") return L.polygon(record.points.map(ll), style);
    if (record.type === "circle") return L.circle(ll(record.center), {...style, radius: Number(record.radius)});
    return null;
  }

  function setSketchVisibility(next) {
    sketchesVisible = Boolean(next);
    cancelGesture();
    if (map && group) {
      if (sketchesVisible && !map.hasLayer(group)) group.addTo(map);
      else if (!sketchesVisible && map.hasLayer(group)) map.removeLayer(group);
    }
    syncToolbar();
  }

  function toggleSketchVisibility() {
    setSketchVisibility(!sketchesVisible);
  }

  function renderAll() {
    if (!map || !group) return;
    group.clearLayers();
    for (const record of records) {
      const layer = layerFor(record);
      if (layer) group.addLayer(layer);
    }
    syncToolbar();
  }

  function snapshotForUndo() {
    undoStack.push(clone(records));
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }

  function commitRecord(record) {
    if (!validRecord(record)) return;
    snapshotForUndo();
    records.push(record);
    saveRecords();
    renderAll();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(clone(records));
    records = undoStack.pop();
    saveRecords();
    renderAll();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(clone(records));
    records = redoStack.pop();
    saveRecords();
    renderAll();
  }

  function clearAll() {
    if (!records.length) return;
    if (!window.confirm("Clear all sketches?")) return;
    snapshotForUndo();
    records = [];
    saveRecords();
    renderAll();
  }

  function removePreview() {
    if (previewLayer && map?.hasLayer(previewLayer)) map.removeLayer(previewLayer);
    previewLayer = null;
  }

  function clientPoint(event) {
    const rect = map.getContainer().getBoundingClientRect();
    return L.point(event.clientX - rect.left, event.clientY - rect.top);
  }

  function eventLatLng(event) {
    return map.containerPointToLatLng(clientPoint(event));
  }

  function rectLatLngs(startPoint, endPoint) {
    return [
      startPoint,
      L.point(endPoint.x, startPoint.y),
      endPoint,
      L.point(startPoint.x, endPoint.y)
    ].map(point => map.containerPointToLatLng(point));
  }

  function ellipseLatLngs(centerPoint, edgePoint, segments = 64) {
    const rx = Math.max(1, Math.abs(edgePoint.x - centerPoint.x));
    const ry = Math.max(1, Math.abs(edgePoint.y - centerPoint.y));
    const points = [];
    for (let i = 0; i < segments; i += 1) {
      const angle = (Math.PI * 2 * i) / segments;
      points.push(map.containerPointToLatLng(L.point(centerPoint.x + Math.cos(angle) * rx, centerPoint.y + Math.sin(angle) * ry)));
    }
    return points;
  }

  function constrainShapePoint(startPoint, point) {
    const dx = point.x - startPoint.x;
    const dy = point.y - startPoint.y;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    return L.point(startPoint.x + (dx < 0 ? -distance : distance), startPoint.y + (dy < 0 ? -distance : distance));
  }

  function snapArrowPoint(startPoint, point) {
    const dx = point.x - startPoint.x;
    const dy = point.y - startPoint.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return point;
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    return L.point(startPoint.x + Math.cos(angle) * distance, startPoint.y + Math.sin(angle) * distance);
  }

  function arrowLatLngs(startPoint, endPoint) {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distance = Math.hypot(dx, dy);
    const tip = L.point(endPoint.x, endPoint.y);
    if (distance < 1) {
      const start = map.containerPointToLatLng(startPoint);
      return [start, start, start, start, start];
    }
    const preset = SIZE_PRESETS[size] || SIZE_PRESETS.medium;
    const headLength = Math.min(Math.max(14, preset.shape * 4 + 8), Math.max(8, distance * .45));
    const angle = Math.atan2(dy, dx);
    const spread = Math.PI / 7;
    const left = L.point(tip.x - Math.cos(angle - spread) * headLength, tip.y - Math.sin(angle - spread) * headLength);
    const right = L.point(tip.x - Math.cos(angle + spread) * headLength, tip.y - Math.sin(angle + spread) * headLength);
    return [startPoint, tip, left, tip, right].map(point => map.containerPointToLatLng(point));
  }

  function pointInsidePolygon(point, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      const intersects = ((a.y > point.y) !== (b.y > point.y)) && (point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointSegmentDistance(point, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = point.x - a.x;
    const wy = point.y - a.y;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return point.distanceTo(a);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return point.distanceTo(b);
    const t = c1 / c2;
    return point.distanceTo(L.point(a.x + t * vx, a.y + t * vy));
  }

  function recordDistancePixels(record, point) {
    if (record.type === "pen" || record.type === "highlight" || record.type === "arrow") {
      const points = record.points.map(p => map.latLngToContainerPoint(ll(p)));

      let best = Infinity;
      for (let i = 1; i < points.length; i += 1) best = Math.min(best, pointSegmentDistance(point, points[i - 1], points[i]));
      return best;
    }
    if (record.type === "ellipse") {
      const points = record.points.map(p => map.latLngToContainerPoint(ll(p)));
      if (pointInsidePolygon(point, points)) return 0;
      let best = Infinity;
      for (let i = 0; i < points.length; i += 1) best = Math.min(best, pointSegmentDistance(point, points[i], points[(i + 1) % points.length]));
      return best;
    }
    if (record.type === "rect") {
      if (Array.isArray(record.points)) {
        const points = record.points.map(p => map.latLngToContainerPoint(ll(p)));
        if (pointInsidePolygon(point, points)) return 0;
        return Math.min(...points.map((corner, i) => pointSegmentDistance(point, corner, points[(i + 1) % points.length])));
      }
      const a = map.latLngToContainerPoint(ll(record.a));
      const b = map.latLngToContainerPoint(ll(record.b));
      const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x), top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
      if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) return 0;
      const corners = [L.point(left, top), L.point(right, top), L.point(right, bottom), L.point(left, bottom)];
      return Math.min(...corners.map((corner, i) => pointSegmentDistance(point, corner, corners[(i + 1) % 4])));
    }
    if (record.type === "circle") {
      const center = map.latLngToContainerPoint(ll(record.center));
      const edgeLatLng = map.containerPointToLatLng(center.add([20, 0]));
      const pxRadius = Math.max(1, center.distanceTo(map.latLngToContainerPoint(edgeLatLng)) * (Number(record.radius) / Math.max(1, map.distance(ll(record.center), edgeLatLng))));
      const distance = center.distanceTo(point);
      return distance <= pxRadius ? 0 : Math.abs(distance - pxRadius);
    }
    return Infinity;
  }

  function eraseAt(point) {
    let bestIndex = -1;
    let bestDistance = 18;
    for (let i = records.length - 1; i  >= 0; i -= 1) {
      const distance = recordDistancePixels(records[i], point);
      if (distance <= bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) return false;
    snapshotForUndo();
    records.splice(bestIndex, 1);
    saveRecords();
    renderAll();
    return true;
  }

  function shouldIgnorePointer(event) {
    const target = event.target;
    return Boolean(target?.closest?.(".leaflet-control, button, input, select, textarea, a, [contenteditable=true]"));
  }

  function startGesture(event) {
    if (!active || spacePanDown || event.button !== 0 || shouldIgnorePointer(event)) return;
    if (!sketchesVisible) setSketchVisibility(true);
    event.preventDefault();
    event.stopPropagation();
    const container = map.getContainer();
    try { container.setPointerCapture(event.pointerId); } catch {}
    const point = clientPoint(event);
    const latlng = eventLatLng(event);
    if (tool === "eraser") {
      gesture = {pointerId: event.pointerId, type: "eraser"};
      eraseAt(point);
      return;
    }
    gesture = {pointerId: event.pointerId, type: tool, start: latlng, startPoint: point, lastPoint: point, points: [latlng]};
    const preset = SIZE_PRESETS[size] || SIZE_PRESETS.medium;
    if (tool === "pen" || tool === "highlight") {
      previewLayer = L.polyline([latlng], {
        pane: PANE_NAME,
        color,
        weight: tool === "highlight" ? preset.highlight : preset.pen,
        opacity: tool === "highlight" ? .45 : .95,
        lineCap: "round",
        lineJoin: "round",
        interactive: false
      }).addTo(map);
    } else if (tool === "rect") {
      previewLayer = L.polygon(rectLatLngs(point, point), styleFor({type: "rect", color, size})).addTo(map);
    } else if (tool === "arrow") {
      previewLayer = L.polyline(arrowLatLngs(point, point), styleFor({type: "arrow", color, size})).addTo(map);
    } else if (tool === "circle") {
      previewLayer = L.polygon(ellipseLatLngs(point, point), styleFor({type: "ellipse", color, size})).addTo(map);
    }
  }

  function moveGesture(event) {
    if (!active || !gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = clientPoint(event);
    if (gesture.type === "eraser") {
      eraseAt(point);
      return;
    }
    const latlng = eventLatLng(event);
    const shapePoint = event.shiftKey ? (gesture.type === "arrow" ? snapArrowPoint(gesture.startPoint, point) : constrainShapePoint(gesture.startPoint, point)) : point;
    if (gesture.type === "pen" || gesture.type === "highlight") {
      if (point.distanceTo(gesture.lastPoint) < 2.5) return;
      gesture.lastPoint = point;
      gesture.points.push(latlng);
      if (gesture.points.length > 5000) gesture.points.shift();
      previewLayer?.setLatLngs(gesture.points);
    } else if (gesture.type === "rect") {
      previewLayer?.setLatLngs(rectLatLngs(gesture.startPoint, shapePoint));
    } else if (gesture.type === "arrow") {
      previewLayer?.setLatLngs(arrowLatLngs(gesture.startPoint, shapePoint));
    } else if (gesture.type === "circle") {
      previewLayer?.setLatLngs(ellipseLatLngs(gesture.startPoint, shapePoint));
    }
  }

  function endGesture(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const finished = gesture;
    gesture = null;
    try { map.getContainer().releasePointerCapture(event.pointerId); } catch {}
    if (finished.type === "eraser") return;
    const endPoint = clientPoint(event);
    const shapeEndPoint = event.shiftKey ? (finished.type === "arrow" ? snapArrowPoint(finished.startPoint, endPoint) : constrainShapePoint(finished.startPoint, endPoint)) : endPoint;
    removePreview();
    if (finished.type === "pen" || finished.type === "highlight") {
      if (finished.points.length < 2) return;
      commitRecord({type: finished.type, color, size, points: finished.points.map(stored)});
    } else if (finished.type === "rect") {
      if (finished.startPoint.distanceTo(shapeEndPoint) < 5) return;
      commitRecord({type: "rect", color, size, points: rectLatLngs(finished.startPoint, shapeEndPoint).map(stored)});
    } else if (finished.type === "arrow") {
      if (finished.startPoint.distanceTo(shapeEndPoint) < 5) return;
      commitRecord({type: "arrow", color, size, points: arrowLatLngs(finished.startPoint, shapeEndPoint).map(stored)});
    } else if (finished.type === "circle") {
      const rx = Math.abs(shapeEndPoint.x - finished.startPoint.x);
      const ry = Math.abs(shapeEndPoint.y - finished.startPoint.y);
      if (rx < 3 || ry < 3) return;
      commitRecord({type: "ellipse", color, size, points: ellipseLatLngs(finished.startPoint, shapeEndPoint).map(stored)});
    }
  }

  function cancelGesture() {
    gesture = null;
    removePreview();
  }

  function cancelPointerGesture(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try { map.getContainer().releasePointerCapture(event.pointerId); } catch {}
    cancelGesture();
  }

  function setTool(next) {
    if (!["pen", "highlight", "eraser", "rect", "circle", "arrow"].includes(next)) return;
    cancelGesture();
    releaseSpacePan(false);
    document.body.classList.remove("fa-sketch-pan");
    tool = next;
    syncToolbar();
  }

  function syncToolbar() {
    if (!toolbar) return;
    toolbar.querySelectorAll("[data-sketch-tool]").forEach(button => { const selected = button.dataset.sketchTool === tool; button.classList.toggle("active", selected); button.setAttribute("aria-pressed", String(selected)); });
    toolbar.querySelectorAll("[data-sketch-color]").forEach(button => { const selected = button.dataset.sketchColor.toLowerCase() === color.toLowerCase(); button.classList.toggle("active", selected); button.setAttribute("aria-pressed", String(selected)); });
    const visibilityButton = toolbar.querySelector("[data-sketch-action=visibility]");
    if (visibilityButton) {
      const label = sketchesVisible ? "Hide sketches (H)" : "Show sketches (H)";
      visibilityButton.title = label;
      visibilityButton.setAttribute("aria-label", label);
      visibilityButton.setAttribute("aria-pressed", sketchesVisible ? "false" : "true");
      visibilityButton.classList.toggle("sketches-hidden", !sketchesVisible);
      const icon = visibilityButton.querySelector("i");
      if (icon) icon.className = sketchesVisible ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
    }
    const sizeSelect = toolbar.querySelector("#fa-sketch-size");
    if (sizeSelect) sizeSelect.value = size;
    const undoButton = toolbar.querySelector("[data-sketch-action=undo]");
    const redoButton = toolbar.querySelector("[data-sketch-action=redo]");
    const clearButton = toolbar.querySelector("[data-sketch-action=clear]");
    if (undoButton) undoButton.disabled = !undoStack.length;
    if (redoButton) redoButton.disabled = !redoStack.length;
    if (clearButton) clearButton.disabled = !records.length;
  }

  function buildToolbar() {
    if (toolbar) return;
    const app = document.getElementById("app") || document.body;
    toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Sketch tools");
    toolbar.innerHTML = `
      <button type="button" class="fa-sketch-visibility" data-sketch-action="visibility" title="Hide sketches (H)" aria-label="Hide sketches (H)" aria-pressed="false"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
      <button type="button" data-sketch-tool="pen" title="Pen">Pen</button>
      <button type="button" data-sketch-tool="highlight" title="Highlighter">Highlight</button>
      <button type="button" data-sketch-tool="eraser" title="Erase whole sketch strokes">Eraser</button>
      <span class="fa-sketch-divider"></span>
      <button type="button" data-sketch-tool="rect" title="Rectangle" aria-label="Rectangle"><i class="fa-regular fa-square" aria-hidden="true"></i></button>
      <button type="button" data-sketch-tool="circle" title="Circle / oval" aria-label="Circle or oval"><i class="fa-regular fa-circle" aria-hidden="true"></i></button>
      <button type="button" data-sketch-tool="arrow" title="Arrow (6)" aria-label="Arrow"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
      <select id="fa-sketch-size" aria-label="Sketch size" title="Stroke size"><option value="thick">Thick</option><option value="medium">Medium</option><option value="thin">Thin</option></select>
      <span class="fa-sketch-divider"></span>
      <span class="fa-sketch-colors">${COLORS.map(value => `<button type="button" class="fa-sketch-color" data-sketch-color="${value}" style="--swatch:${value}" aria-label="Sketch color ${value}"></button>`).join("")}</span>
      <span class="fa-sketch-divider"></span>
      <button type="button" data-sketch-action="undo" title="Undo">Undo</button>
      <button type="button" data-sketch-action="redo" title="Redo">Redo</button>
      <button type="button" class="fa-sketch-danger" data-sketch-action="clear" title="Clear all sketches">Clear</button>
      <button type="button" data-sketch-action="close" title="Close sketch mode">Close</button>`;
    toolbar.addEventListener("pointerdown", event => event.stopPropagation());
    toolbar.addEventListener("click", event => {
      const clickedButton = event.target.closest("button");
      if (clickedButton && event.detail > 0) clickedButton.blur();
      const toolButton = event.target.closest("[data-sketch-tool]");
      if (toolButton) { setTool(toolButton.dataset.sketchTool); return; }
      const colorButton = event.target.closest("[data-sketch-color]");
      if (colorButton) { color = colorButton.dataset.sketchColor; syncToolbar(); return; }
      const action = event.target.closest("[data-sketch-action]")?.dataset.sketchAction;
      if (action === "visibility") toggleSketchVisibility();
      else if (action === "undo") undo();
      else if (action === "redo") redo();
      else if (action === "clear") clearAll();
      else if (action === "close") setEnabled(false);
    });
    toolbar.querySelector("#fa-sketch-size")?.addEventListener("change", event => {
      if (SIZE_PRESETS[event.currentTarget.value]) { size = event.currentTarget.value; try { localStorage.setItem("fa-sketch-size-v1", size); } catch {} }
      syncToolbar();
      event.currentTarget.blur();
    });
    app.appendChild(toolbar);
    syncToolbar();
  }

  function handleSketchHistoryShortcut(event) {
    if (!active || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const target = event.target;
    if (target && (target.matches?.("input, textarea") || target.isContentEditable)) return;
    const key = String(event.key || "").toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      undo();
      return;
    }
    if ((key === "z" && event.shiftKey) || key === "y") {
      event.preventDefault();
      event.stopImmediatePropagation();
      redo();
    }
  }

  function sketchKeyboardTargetBlocked(event) {
    const target = event.target;
    const sizeSpace = target?.id === "fa-sketch-size" && (event.code === "Space" || event.key === " " || event.key === "Spacebar");
    return Boolean(target && !sizeSpace && (target.matches?.("input, textarea, select") || target.isContentEditable));
  }

  function releaseSpacePan(runHome = false) {
    if (!spacePanDown) return;
    const quickTap = runHome && !spacePanMoved && performance.now() - spacePanStartedAt < SPACE_TAP_MS;
    spacePanDown = false;
    spacePanMoved = false;
    document.body.classList.remove("fa-sketch-pan");
    if (active) map?.dragging?.disable?.();
    if (quickTap) window.FASketchHost?.returnHome?.();
  }

  function handleSketchModeKeyDown(event) {
    if (!active || sketchKeyboardTargetBlocked(event)) return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && ["1", "2", "3", "4", "5", "6"].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setTool(event.key === "1" ? "pen" : event.key === "2" ? "highlight" : event.key === "3" ? "eraser" : event.key === "4" ? "rect" : event.key === "5" ? "circle" : "arrow");
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && String(event.key || "").toLowerCase() === "h") {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleSketchVisibility();
      return;
    }
    const isSpace = event.code === "Space" || event.key === " " || event.key === "Spacebar";
    if (!isSpace || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || spacePanDown) return;
    spacePanDown = true;
    spacePanStartedAt = performance.now();
    spacePanMoved = false;
    cancelGesture();
    document.body.classList.add("fa-sketch-pan");
    map?.dragging?.enable?.();
  }

  function handleSketchModeKeyUp(event) {
    if (!active || !spacePanDown) return;
    const isSpace = event.code === "Space" || event.key === " " || event.key === "Spacebar";
    if (!isSpace) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    releaseSpacePan(true);
  }

  function setEnabled(next) {
    if (!map) return;
    const enable = Boolean(next);
    if (active === enable) return;
    if (!enable) {
      releaseSpacePan(false);
      if (toolbar?.contains(document.activeElement)) document.activeElement.blur();
    }
    active = enable;
    cancelGesture();
    document.body.classList.remove("fa-sketch-pan");
    document.body.classList.toggle("fa-sketch-open", active);
    toolbar?.classList.toggle("open", active);
    if (active) {
      draggingWasEnabled = Boolean(map.dragging?.enabled?.());
      map.dragging?.disable?.();
      if (window.FADoubleClickZoomLock?.acquire) window.FADoubleClickZoomLock.acquire(map, "sketch");
      else map.doubleClickZoom?.disable?.();
    } else {
      if (draggingWasEnabled) map.dragging?.enable?.();
      if (window.FADoubleClickZoomLock?.release) window.FADoubleClickZoomLock.release(map, "sketch");
      else map.doubleClickZoom?.enable?.();
    }
  }

  function toggle() {
    setEnabled(!active);
  }

  function init(nextMap) {
    if (!nextMap || map === nextMap) return;
    map = nextMap;
    injectStyle();
    ensurePane();
    group = L.layerGroup([], {pane: PANE_NAME}).addTo(map);
    renderAll();
    buildToolbar();
    const container = map.getContainer();
    container.addEventListener("pointerdown", startGesture, true);
    container.addEventListener("pointermove", moveGesture, true);
    container.addEventListener("pointerup", endGesture, true);
    container.addEventListener("pointercancel", cancelPointerGesture, true);
    window.addEventListener("blur", cancelGesture);
    window.addEventListener("blur", () => releaseSpacePan(false));
    document.addEventListener("keydown", handleSketchHistoryShortcut, true);
    document.addEventListener("keydown", handleSketchModeKeyDown, true);
    document.addEventListener("keyup", handleSketchModeKeyUp, true);
    map.on("dragstart", () => { if (spacePanDown) spacePanMoved = true; });
    window.addEventListener("focus", () => {
      if (loaded && !active && !gesture && savedRevision === revision) {
        void loadRecords().catch(error => void 0);
      }
    });
  }

  window.FASketch = {
    init,
    load: loadRecords,
    flush: flushRecords,
    toggle,
    setEnabled,
    isEnabled() { return active; },
    clear: clearAll
  };
})();
