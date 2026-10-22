(() => {
  "use strict";
  const ELEVATION_OPACITY_KEY = "pt.elevation.opacity";
  function readOverlayOpacity(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const value = Number(raw);
        if (Number.isFinite(value)) return Math.max(0, Math.min(1, value));
      }
    } catch {}
    return fallback;
  }

  function writeOverlayOpacity(key, value) {
    try { localStorage.setItem(key, String(value)); } catch {}
  }
(() => {
  "use strict";

  const TILE = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp";
  let elevationOpacity = readOverlayOpacity(ELEVATION_OPACITY_KEY, 0.80);

  function setElevationOpacity(value) {
    elevationOpacity = Math.max(0, Math.min(1, Number(value) || 0));
    layer?.setOpacity?.(elevationOpacity);
    writeOverlayOpacity(ELEVATION_OPACITY_KEY, elevationOpacity);
    return elevationOpacity;
  }

  function getElevationOpacity() { return elevationOpacity; }
  const SOURCE_SIZE = 512;
  const TILE_SIZE = 256;
  const MAX_NATIVE_ZOOM = 17;
  const CACHE_LIMIT = 48;
  const EARTH = 40075016.686;
  const RAMP = [
    [-500, [65, 102, 145]],
    [0, [88, 130, 82]],
    [100, [105, 146, 85]],
    [250, [137, 154, 91]],
    [500, [168, 155, 103]],
    [1000, [166, 137, 102]],
    [2000, [151, 139, 130]],
    [3000, [188, 185, 181]],
    [4500, [226, 226, 223]],
    [9000, [248, 248, 246]]
  ];

  let map = null;
  let layer = null;
  let readout = null;
  let clickMarker = null;
  const cache = new Map();
  const pendingData = new Map();
  let readoutRequest = 0;
  let readoutLoadingTimer = 0;
  let profileContextMenu = null;
  let profileLineContextMenu = null;
  let profileContextTarget = null;
  const lockedElevationProfiles = new Set();
  let persistedProfilesLoaded = false;
  let restoringPersistedProfiles = false;
  let profileDrawing = false;
  let profileDrawingMode = "profile";
  let profilePointerStart = null;
  let profileSkipClickUntil = 0;
  let profileStart = null;
  let profileLine = null;
  let profileStartNode = null;
  let profileEndNode = null;
  let profileCursorNode = null;
  let profileTooltip = null;
  let profileCursorTooltip = null;
  let profileLoadingTimer = 0;
  let profileRequest = 0;
  let profileEscapeHandler = null;
  let profileHistoryMuted = false;

  function elevation(data, x, y) {
    x = Math.max(0, Math.min(SOURCE_SIZE - 1, Math.floor(x)));
    y = Math.max(0, Math.min(SOURCE_SIZE - 1, Math.floor(y)));
    const i = (y * SOURCE_SIZE + x) * 4;
    return data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
  }

  function colorFor(value) {
    if (value <= RAMP[0][0]) return RAMP[0][1];
    for (let i = 1; i < RAMP.length; i += 1) {
      const a = RAMP[i - 1];
      const b = RAMP[i];
      if (value > b[0]) continue;
      const t = (value - a[0]) / (b[0] - a[0]);
      return [
        a[1][0] + (b[1][0] - a[1][0]) * t,
        a[1][1] + (b[1][1] - a[1][1]) * t,
        a[1][2] + (b[1][2] - a[1][2]) * t
      ];
    }
    return RAMP[RAMP.length - 1][1];
  }

  function remember(key, data) {
    cache.delete(key);
    cache.set(key, data);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }

  function normalizeElevationTileCoords(z, x, y) {
    const zoom = Math.max(0, Math.floor(Number(z) || 0));
    const world = Math.pow(2, zoom);
    const tileY = Math.floor(Number(y));
    const rawX = Math.floor(Number(x));
    if (!Number.isFinite(rawX) || !Number.isFinite(tileY) || tileY < 0 || tileY >= world) return null;
    return {z: zoom, x: ((rawX % world) + world) % world, y: tileY};
  }

  function managedElevationImage(url) {
    if (window.FANetwork?.loadImage) {
      return window.FANetwork.loadImage(url, {timeoutMs: 16000, retries: 2, crossOrigin: "anonymous", decoding: "async", label: "Elevation tile"});
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Elevation tile failed to load"));
      image.src = url;
    });
  }

  function loadElevationData(z, x, y) {
    const coords = normalizeElevationTileCoords(z, x, y);
    if (!coords) return Promise.reject(new Error("Elevation tile coordinates are outside the map."));
    const key = `${coords.z}/${coords.x}/${coords.y}`;
    const cached = cache.get(key);
    if (cached) {
      cache.delete(key);
      cache.set(key, cached);
      return Promise.resolve(cached);
    }
    if (pendingData.has(key)) return pendingData.get(key);
    const tileUrl = TILE.replace("{z}", coords.z).replace("{x}", coords.x).replace("{y}", coords.y);
    const promise = managedElevationImage(tileUrl)
      .then(image => {
        const source = document.createElement("canvas");
        source.width = SOURCE_SIZE;
        source.height = SOURCE_SIZE;
        const sourceContext = source.getContext("2d", {willReadFrequently: true});
        if (!sourceContext) throw new Error("Elevation canvas is unavailable.");
        sourceContext.drawImage(image, 0, 0, SOURCE_SIZE, SOURCE_SIZE);
        const data = sourceContext.getImageData(0, 0, SOURCE_SIZE, SOURCE_SIZE).data;
        remember(key, data);
        return data;
      })
      .finally(() => pendingData.delete(key));
    pendingData.set(key, promise);
    return promise;
  }

  function elevationChildData(parentData, childX, childY) {
    const parentCanvas = document.createElement("canvas");
    parentCanvas.width = SOURCE_SIZE;
    parentCanvas.height = SOURCE_SIZE;
    const parentContext = parentCanvas.getContext("2d");
    const childCanvas = document.createElement("canvas");
    childCanvas.width = SOURCE_SIZE;
    childCanvas.height = SOURCE_SIZE;
    const childContext = childCanvas.getContext("2d", {willReadFrequently: true});
    if (!parentContext || !childContext) throw new Error("Elevation fallback canvas is unavailable.");
    parentContext.putImageData(new ImageData(new Uint8ClampedArray(parentData), SOURCE_SIZE, SOURCE_SIZE), 0, 0);
    const half = SOURCE_SIZE / 2;
    childContext.imageSmoothingEnabled = true;
    childContext.drawImage(parentCanvas, childX * half, childY * half, half, half, 0, 0, SOURCE_SIZE, SOURCE_SIZE);
    return childContext.getImageData(0, 0, SOURCE_SIZE, SOURCE_SIZE).data;
  }

  async function loadElevationVisualData(z, x, y, fallbackDepth = 0) {
    const coords = normalizeElevationTileCoords(z, x, y);
    if (!coords) throw new Error("Elevation tile coordinates are outside the map.");
    try {
      return await loadElevationData(coords.z, coords.x, coords.y);
    } catch (error) {
      if (coords.z <= 0 || fallbackDepth >= 4) throw error;
      const parentData = await loadElevationVisualData(coords.z - 1, Math.floor(coords.x / 2), Math.floor(coords.y / 2), fallbackDepth + 1);
      return elevationChildData(parentData, coords.x % 2, coords.y % 2);
    }
  }

  function centerLatitude(z, y) {
    const n = Math.PI - 2 * Math.PI * (y + 0.5) / Math.pow(2, z);
    return Math.atan(Math.sinh(n)) * 180 / Math.PI;
  }

  const renderJobs = [];
  let renderFrame = 0;

  function processElevationRenderJobs() {
    renderFrame = 0;
    const started = performance.now();
    while (renderJobs.length) {
      const job = renderJobs.shift();
      try {
        const {data, context, image, canvas, coords, metersPerSourcePixel, done} = job;
        const stop = Math.min(TILE_SIZE, job.row + 16);
        for (let y = job.row; y < stop; y += 1) {
          const sy = y * 2 + 1;
          for (let x = 0; x < TILE_SIZE; x += 1) {
            const sx = x * 2 + 1;
            const height = elevation(data, sx, sy);
            const i = (y * TILE_SIZE + x) * 4;
            if (!Number.isFinite(height) || height <= -32760) { image.data[i + 3] = 0; continue; }
            const dx = (elevation(data, sx + 2, sy) - elevation(data, sx - 2, sy)) / (4 * metersPerSourcePixel);
            const dy = (elevation(data, sx, sy + 2) - elevation(data, sx, sy - 2)) / (4 * metersPerSourcePixel);
            const length = Math.sqrt(dx * dx + dy * dy + 1);
            const light = (dx * 0.5 + dy * 0.5 + 0.7071) / length;
            const shade = Math.max(0.6, Math.min(1.12, 0.67 + 0.46 * light));
            const color = colorFor(height);
            image.data[i] = Math.max(0, Math.min(255, Math.round(color[0] * shade)));
            image.data[i + 1] = Math.max(0, Math.min(255, Math.round(color[1] * shade)));
            image.data[i + 2] = Math.max(0, Math.min(255, Math.round(color[2] * shade)));
            image.data[i + 3] = 255;
          }
        }
        job.row = stop;
        if (stop < TILE_SIZE) renderJobs.push(job);
        else { context.putImageData(image, 0, 0); done(null, canvas); }
      } catch (error) { job.done(error, job.canvas); }
      if (performance.now() - started >= 5) break;
    }
    if (renderJobs.length) renderFrame = requestAnimationFrame(processElevationRenderJobs);
  }

  function render(canvas, data, coords, done) {
    const context = canvas.getContext("2d");
    if (!context) { done(new Error("Elevation canvas is unavailable."), canvas); return; }
    const image = context.createImageData(TILE_SIZE, TILE_SIZE);
    const lat = centerLatitude(coords.z, coords.y);
    const metersPerSourcePixel = Math.max(0.01, Math.cos(lat * Math.PI / 180) * EARTH / (Math.pow(2, coords.z) * SOURCE_SIZE));
    renderJobs.push({data, context, image, canvas, coords, metersPerSourcePixel, done, row: 0});
    if (!renderFrame) renderFrame = requestAnimationFrame(processElevationRenderJobs);
  }

  function ensurePane() {
    if (!map || map.getPane("elevationPane")) return;
    const pane = map.createPane("elevationPane", map._rotatePane || map.getPane("overlayPane"));
    pane.style.zIndex = "250";
    pane.style.pointerEvents = "none";
  }

  function ensureReadout() {
    if (!map || readout) return;
    readout = L.tooltip({
      permanent: true,
      direction: "top",
      offset: L.point(0, -7),
      className: "measurement-tooltip elevation-measurement-tooltip",
      opacity: 1
    });
  }

  function ensureLayer() {
    if (!map) return null;
    ensurePane();
    ensureReadout();
    if (layer) return layer;
    const ElevationGrid = L.GridLayer.extend({
      createTile(coords, done) {
        const tile = document.createElement("canvas");
        tile.width = TILE_SIZE;
        tile.height = TILE_SIZE;
        loadElevationVisualData(coords.z, coords.x, coords.y)
          .then(data => {
            render(tile, data, coords, done);
          })
          .catch(error => done(error, tile));
        return tile;
      }
    });
    layer = new ElevationGrid({
      pane: "elevationPane",
      tileSize: TILE_SIZE,
      minZoom: 0,
      maxNativeZoom: MAX_NATIVE_ZOOM,
      maxZoom: 22,
      noWrap: false,
      opacity: elevationOpacity,
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: 1,
      attribution: `&copy; <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">Mapterhorn</a>`
    });
    layer.options.pmIgnore = true;
    layer.options.snapIgnore = true;
    return layer;
  }


  function hideProfileContextMenu() {
    profileContextMenu?.classList.add("hidden");
  }

  function ensureProfileContextMenu() {
    if (!map || profileContextMenu) return profileContextMenu;
    profileContextMenu = document.createElement("div");
    profileContextMenu.className = "map-context-menu elevation-point-context-menu hidden";
    profileContextMenu.innerHTML = `<button type="button" data-elv-point-action="profile">Elevation profile</button><button type="button" data-elv-point-action="sight">Line of sight</button><button type="button" data-elv-point-action="convert">Convert to POI</button><button type="button" data-elv-point-action="hide">Clear</button>`;
    map.getContainer().appendChild(profileContextMenu);
    L.DomEvent.disableClickPropagation(profileContextMenu);
    L.DomEvent.disableScrollPropagation(profileContextMenu);
    profileContextMenu.addEventListener("contextmenu", event => event.preventDefault());
    profileContextMenu.addEventListener("click", async event => {
      const button = event.target.closest("[data-elv-point-action]");
      if (!button) return;
      if (button.dataset.elvPointAction === "profile" || button.dataset.elvPointAction === "sight") beginElevationProfile(button.dataset.elvPointAction === "sight" ? "los" : "profile");
      if (button.dataset.elvPointAction === "convert") {
        const point = clickMarker && map.hasLayer(clickMarker) ? L.latLng(clickMarker.getLatLng()) : null;
        const elevationValue = Number(clickMarker?._elevationValue);
        const customFields = Number.isFinite(elevationValue) ? {elevation_m: Object.is(Math.round(elevationValue), -0) ? 0 : Math.round(elevationValue)} : null;
        const created = point ? await window.FAElevationHost?.addPoiAtLatLng?.(point, customFields) : false;
        if (created) {
          readoutRequest += 1;
          hideReadout(true);
        }
      }
      if (button.dataset.elvPointAction === "hide") {
        recordElevationPointChange(elevationPointSnapshot(), null);
        readoutRequest += 1;
        hideReadout(true);
      }
      hideProfileContextMenu();
    });
    return profileContextMenu;
  }

  function showProfileContextMenu(event) {
    if (!map || !isEnabled() || profileDrawing || !clickMarker || !map.hasLayer(clickMarker)) return;
    if (event?.originalEvent) {
      L.DomEvent.preventDefault(event.originalEvent);
      L.DomEvent.stopPropagation(event.originalEvent);
    }
    hideProfileLineContextMenu();
    const menu = ensureProfileContextMenu();
    const host = map.getContainer();
    const point = map.latLngToContainerPoint(clickMarker.getLatLng());
    menu.classList.remove("hidden");
    const left = Math.max(6, Math.min(host.clientWidth - menu.offsetWidth - 6, point.x + 8));
    const top = Math.max(6, Math.min(host.clientHeight - menu.offsetHeight - 6, point.y + 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function profileToast(message, type = "info") {
    const stack = document.getElementById("toast-stack");
    if (!stack || !message) return;
    const toast = document.createElement("div");
    toast.className = `map-toast map-toast-${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 4800);
  }

  function hideProfileLineContextMenu() {
    profileLineContextMenu?.classList.add("hidden");
    profileContextTarget = null;
  }

  function ensureProfileLineContextMenu() {
    if (!map || profileLineContextMenu) return profileLineContextMenu;
    profileLineContextMenu = document.createElement("div");
    profileLineContextMenu.className = "map-context-menu elevation-profile-context-menu hidden";
    profileLineContextMenu.innerHTML = `<div class="elevation-profile-tools"><button type="button" class="measurement-move-btn elevation-los-mode-btn" data-elv-profile-action="sight" title="Toggle line of sight" aria-label="Toggle line of sight" aria-pressed="false"><i class="fa-solid fa-binoculars" aria-hidden="true"></i></button></div><button type="button" data-elv-profile-action="lock">Lock elevation profile</button><button type="button" data-elv-profile-action="tooltip">Hide elevation tooltip</button><div class="elevation-los-controls" hidden><label>Observer height (m)<input type="number" min="0" max="10000" step="0.1" data-elv-los-height="observerHeight"></label><label>Target height (m)<input type="number" min="0" max="10000" step="0.1" data-elv-los-height="targetHeight"></label></div><div class="context-menu-separator" aria-hidden="true"></div><button type="button" data-elv-profile-action="edit">Edit elevation profile</button><button type="button" data-elv-profile-action="convert">Convert to line measurement</button><div class="context-menu-separator" aria-hidden="true"></div><button type="button" data-elv-profile-action="clear">Clear elevation profile</button><button type="button" data-elv-profile-action="clear-all">Clear all elevation profiles</button>`;
    map.getContainer().appendChild(profileLineContextMenu);
    L.DomEvent.disableClickPropagation(profileLineContextMenu);
    L.DomEvent.disableScrollPropagation(profileLineContextMenu);
    profileLineContextMenu.addEventListener("contextmenu", event => event.preventDefault());
    for (const type of ["pointerdown", "mousedown", "mouseup", "click", "dblclick"]) {
      profileLineContextMenu.addEventListener(type, event => event.stopPropagation());
    }
    profileLineContextMenu.addEventListener("change", event => {
      const input = event.target.closest?.("[data-elv-los-height]");
      const line = profileContextTarget;
      if (!input || !line?._profileLos || line._profileRemoved) return;
      const value = input.value.trim() === "" ? NaN : Number(input.value) * (profileHeightUnit() === "ft" ? 0.3048 : 1);
      if (!Number.isFinite(value) || value < 0 || value > 10000) { input.value = profileHeightDisplay(line._profileLos[input.dataset.elvLosHeight]); return; }
      const before = elevationProfileSnapshot(line);
      line._profileLos[input.dataset.elvLosHeight] = value;
      recordElevationProfileUpdate(before, elevationProfileSnapshot(line));
      renderProfileCachedResult(line);
      if (line._profileLocked) syncPersistedElevationProfiles();
    });
    profileLineContextMenu.addEventListener("click", async event => {
      const button = event.target.closest("[data-elv-profile-action]");
      if (!button || button.disabled) return;
      const line = profileContextTarget;
      if (!line || line._profileRemoved) return hideProfileLineContextMenu();
      const action = button.dataset.elvProfileAction;
      if (action === "sight") {
        const before = elevationProfileSnapshot(line);
        line._profileLos = line._profileLos ? null : {observerHeight: 2, targetHeight: 2};
        renderProfileCachedResult(line);
        if (line._profileLos) refreshElevationProfile(line);
        else if (!line._faCachedProfileStats) refreshElevationProfile(line);
        if (line._profileLocked) syncPersistedElevationProfiles();
        refreshProfileLineContextControls(line);
        recordElevationProfileUpdate(before, elevationProfileSnapshot(line));
        return;
      }
      hideProfileLineContextMenu();
      if (action === "lock") {
        setElevationProfileLocked(line, !line._profileLocked);
        return;
      }
      if (action === "tooltip") {
        toggleElevationProfileTooltip(line);
        return;
      }
      if (action === "edit") {
        setElevationProfileEditing(line, !line._profileEditing);
        return;
      }
      if (action === "convert") {
        const historyId = line._profileHistoryId || `elv-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        line._profileHistoryId = historyId;
        const snapshot = {
          id: historyId,
          start: {lat: line._profileStart.lat, lng: line._profileStart.lng},
          end: {lat: line._profileEnd.lat, lng: line._profileEnd.lng},
          locked: Boolean(line._profileLocked),
          tooltipHidden: Boolean(line._profileTooltipHidden),
          los: line._profileLos ? {...line._profileLos} : null
        };
        const converted = await window.FAElevationHost?.createLineMeasurement?.(line._profileStart, line._profileEnd, snapshot);
        if (converted) withoutProfileHistory(() => removeElevationProfileLine(line));
        return;
      }
      if (action === "clear") {
        removeElevationProfileLine(line);
        return;
      }
      if (action === "clear-all") clearAllElevationProfiles();
    });
    return profileLineContextMenu;
  }

  function profileHeightUnit() {
    return window.FAElevationHost?.getMeasurementSystem?.() === "imperial" ? "ft" : "m";
  }

  function profileHeightDisplay(meters) {
    return Number((meters * (profileHeightUnit() === "ft" ? 1 / 0.3048 : 1)).toFixed(2));
  }

  function refreshProfileLineContextControls(line) {
    if (!profileLineContextMenu || !line) return;
    const sightButton = profileLineContextMenu.querySelector(`[data-elv-profile-action="sight"]`);
    if (sightButton) {
      sightButton.classList.toggle("active", Boolean(line._profileLos));
      sightButton.setAttribute("aria-pressed", String(Boolean(line._profileLos)));
    }
    const heightControls = profileLineContextMenu.querySelector(".elevation-los-controls");
    if (heightControls) {
      heightControls.hidden = !line._profileLos;
      const unit = profileHeightUnit();
      for (const input of heightControls.querySelectorAll("[data-elv-los-height]")) {
        input.parentElement.firstChild.textContent = `${input.dataset.elvLosHeight === "observerHeight" ? "Observer" : "Target"} height (${unit})`;
        input.max = unit === "ft" ? "32808.4" : "10000";
        input.value = profileHeightDisplay(line._profileLos?.[input.dataset.elvLosHeight] ?? 2);
      }
    }
  }

  function showProfileLineContextMenu(event, line) {
    if (!map || !line || line._profileRemoved) return;
    if (event?.originalEvent) {
      L.DomEvent.preventDefault(event.originalEvent);
      L.DomEvent.stopPropagation(event.originalEvent);
    }
    hideProfileContextMenu();
    window.FAElevationHost?.hideContextMenus?.();
    profileContextTarget = line;
    const menu = ensureProfileLineContextMenu();
    const lockButton = menu.querySelector(`[data-elv-profile-action="lock"]`);
    const tooltipButton = menu.querySelector(`[data-elv-profile-action="tooltip"]`);
    const editButton = menu.querySelector(`[data-elv-profile-action="edit"]`);
    refreshProfileLineContextControls(line);
    if (lockButton) lockButton.textContent = line._profileLocked ? "Unlock elevation profile" : "Lock elevation profile";
    if (tooltipButton) tooltipButton.textContent = line._profileTooltipHidden ? "Show elevation tooltip" : "Hide elevation tooltip";
    if (editButton) {
      editButton.textContent = line._profileEditing ? "Finish editing" : "Edit elevation profile";
      editButton.disabled = false;
    }
    const host = map.getContainer();
    const fallback = profileDisplayMidpoint(line._profileStart, line._profileEnd);
    const point = event?.latlng ? map.latLngToContainerPoint(event.latlng) : map.latLngToContainerPoint(fallback);
    menu.classList.remove("hidden");
    const left = Math.max(6, Math.min(host.clientWidth - menu.offsetWidth - 6, point.x + 8));
    const top = Math.max(6, Math.min(host.clientHeight - menu.offsetHeight - 6, point.y + 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function elevationProfileSnapshot(line) {
    if (!line || line._profileRemoved || !line._profileStart || !line._profileEnd) return null;
    if (!line._profileHistoryId) line._profileHistoryId = `elv-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
      id: line._profileHistoryId,
      start: {lat: line._profileStart.lat, lng: line._profileStart.lng},
      end: {lat: line._profileEnd.lat, lng: line._profileEnd.lng},
      locked: Boolean(line._profileLocked),
      tooltipHidden: Boolean(line._profileTooltipHidden),
      los: line._profileLos ? {...line._profileLos} : null
    };
  }

  function withoutProfileHistory(action) {
    const previous = profileHistoryMuted;
    profileHistoryMuted = true;
    try { return action(); } finally { profileHistoryMuted = previous; }
  }

  function recordElevationProfileAction(kind, snapshot) {
    if (profileHistoryMuted || !snapshot) return;
    window.FAElevationHost?.recordAction?.({
      scope: "elevation-profile",
      undo: () => withoutProfileHistory(() => kind === "create" ? removeElevationProfileByHistoryId(snapshot.id) : restoreElevationProfile(snapshot)),
      redo: () => withoutProfileHistory(() => kind === "create" ? restoreElevationProfile(snapshot) : removeElevationProfileByHistoryId(snapshot.id)),
      undoMessage: "Elevation profile change undone.",
      redoMessage: "Elevation profile change redone."
    });
  }

  function recordElevationProfileUpdate(before, after) {
    if (profileHistoryMuted || !before || !after || JSON.stringify(before) === JSON.stringify(after)) return;
    const apply = snapshot => withoutProfileHistory(() => {
      const current = [profileLine, ...lockedElevationProfiles].find(item => item?._profileHistoryId === snapshot.id && !item._profileRemoved);
      if (current) removeElevationProfileLine(current);
      return restoreElevationProfile(snapshot);
    });
    window.FAElevationHost?.recordAction?.({
      scope: "elevation-profile",
      undo: () => apply(before), redo: () => apply(after),
      undoMessage: "Elevation profile edit undone.", redoMessage: "Elevation profile edit redone."
    });
  }

  function elevationPointSnapshot() {
    if (!clickMarker || !map?.hasLayer(clickMarker)) return null;
    const point = clickMarker.getLatLng();
    return {lat: point.lat, lng: point.lng};
  }

  function restoreElevationPoint(point) {
    readoutRequest += 1;
    hideReadout(true);
    if (point && isEnabled()) return updateReadout({latlng: L.latLng(point)});
  }

  function recordElevationPointChange(before, after) {
    if (profileHistoryMuted || JSON.stringify(before) === JSON.stringify(after)) return;
    window.FAElevationHost?.recordAction?.({
      scope: "elevation-point",
      undo: () => restoreElevationPoint(before), redo: () => restoreElevationPoint(after),
      undoMessage: "Elevation point restored.", redoMessage: "Elevation point change redone."
    });
  }

  function syncPersistedElevationProfiles() {
    if (restoringPersistedProfiles) return;
    const snapshots = [...lockedElevationProfiles].map(elevationProfileSnapshot).filter(Boolean);
    window.FAElevationHost?.saveProfiles?.(snapshots);
  }

  function loadPersistedElevationProfiles(force = false) {
    if (!map || (persistedProfilesLoaded && !force)) return;
    const snapshots = window.FAElevationHost?.loadProfiles?.() || [];
    restoringPersistedProfiles = true;
    try {
      if (force) {
        clearElevationProfile();
        for (const line of [...lockedElevationProfiles]) removeElevationProfileLine(line);
        lockedElevationProfiles.clear();
      }
      for (const snapshot of snapshots) {
        if (!snapshot?.start || !snapshot?.end) continue;
        restoreElevationProfile({...snapshot, locked: true});
      }
      persistedProfilesLoaded = true;
    } finally {
      restoringPersistedProfiles = false;
    }
  }

  function resetCurrentProfileRefs(line) {
    if (profileLine !== line) return;
    profileLine = null;
    profileStart = null;
    profileStartNode = null;
    profileEndNode = null;
    profileCursorNode = null;
    profileTooltip = null;
    profileDrawing = false;
  }

  function removeElevationProfileLine(line) {
    if (!line || line._profileRemoved) return;
    recordElevationProfileAction("remove", elevationProfileSnapshot(line));
    line._profileRemoved = true;
    line._profileLoadRequest = (line._profileLoadRequest || 0) + 1;
    setElevationProfileEditing(line, false);
    stopProfileLoading(line);
    if (line._profileClickHandler) {
      line.off("click", line._profileClickHandler);
      line._profileHitLayer?.off("click", line._profileClickHandler);
    }
    if (line._profileContextHandler) {
      line.off("contextmenu", line._profileContextHandler);
      line._profileHitLayer?.off("contextmenu", line._profileContextHandler);
    }
    clearLineOfSightLayers(line);
    [line, line._profileHitLayer, line._profileStartNode, line._profileEndNode, line._profileTooltip].forEach(item => {
      if (item && map?.hasLayer(item)) map.removeLayer(item);
    });
    lockedElevationProfiles.delete(line);
    syncPersistedElevationProfiles();
    if (profileContextTarget === line) hideProfileLineContextMenu();
    resetCurrentProfileRefs(line);
  }

  function setElevationProfileLocked(line, locked) {
    if (!line || line._profileRemoved) return;
    const before = elevationProfileSnapshot(line);
    const next = Boolean(locked);
    line._profileLocked = next;
    if (next) {
      lockedElevationProfiles.add(line);
      syncPersistedElevationProfiles();
      resetCurrentProfileRefs(line);
      recordElevationProfileUpdate(before, elevationProfileSnapshot(line));
      profileToast("Elevation profile locked.", "success");
      return;
    }
    lockedElevationProfiles.delete(line);
    syncPersistedElevationProfiles();
    if (profileLine && profileLine !== line) clearElevationProfile();
    profileLine = line;
    profileStart = line._profileStart;
    profileStartNode = line._profileStartNode;
    profileEndNode = line._profileEndNode;
    profileTooltip = line._profileTooltip;
    recordElevationProfileUpdate(before, elevationProfileSnapshot(line));
    profileToast("Elevation profile unlocked.", "success");
  }

  function toggleElevationProfileTooltip(line) {
    if (!line || line._profileRemoved) return;
    const before = elevationProfileSnapshot(line);
    line._profileTooltipHidden = !line._profileTooltipHidden;
    recordElevationProfileUpdate(before, elevationProfileSnapshot(line));
    const tooltip = line._profileTooltip;
    if (!tooltip) return;
    if (line._profileTooltipHidden) {
      if (map?.hasLayer(tooltip)) map.removeLayer(tooltip);
    } else if (!map?.hasLayer(tooltip)) {
      tooltip.addTo(map);
    }
    if (line._profileLocked) syncPersistedElevationProfiles();
  }

  function clearAllElevationProfiles() {
    const previousRestoring = restoringPersistedProfiles;
    restoringPersistedProfiles = true;
    try {
      clearElevationProfile();
      for (const line of [...lockedElevationProfiles]) removeElevationProfileLine(line);
      lockedElevationProfiles.clear();
      hideProfileLineContextMenu();
    } finally {
      restoringPersistedProfiles = previousRestoring;
    }
    syncPersistedElevationProfiles();
  }

  function attachElevationProfileInteractions(line) {
    if (!line) return;
    const clickHandler = event => {
      if (line._profileEditing) return;
      if (event?.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
      if (Date.now() < (line._profileIgnoreClickUntil || 0)) return;
      if (line._profileLocked) {
        profileToast("Elevation profile locked.");
        return;
      }
      removeElevationProfileLine(line);
    };
    const contextHandler = event => showProfileLineContextMenu(event, line);
    line._profileClickHandler = clickHandler;
    line._profileContextHandler = contextHandler;
    for (const target of [line, line._profileHitLayer].filter(Boolean)) {
      target.on("click", clickHandler);
      target.on("contextmenu", contextHandler);
    }
  }

  // Line-of-sight layout
  function profileColor() {
    return "#171717";
  }

  function makeProfileNode(latlng, extraClass = "", label = "") {
    const marker = L.marker(latlng, {
      icon: L.divIcon({
        className: `measurement-node-icon elevation-profile-node ${extraClass}`.trim(),
        html: label ? `<span class="elevation-profile-node-label"><span class="elevation-profile-node-glyph">${label}</span></span>` : "",
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      }),
      rotateWithView: false,
      interactive: false,
      keyboard: false
    });
    marker.options.pmIgnore = true;
    marker.options.snapIgnore = true;
    marker._profileEndpointLabel = label;
    marker.on("add", () => setProfileNodeLabel(marker, marker._profileEndpointLabel));
    return marker;
  }

  function setProfileNodeLabel(marker, label) {
    if (!marker) return;
    marker._profileEndpointLabel = String(label || "");
    const element = marker.getElement?.();
    const labelElement = element?.querySelector?.(".elevation-profile-node-glyph");
    if (labelElement) labelElement.textContent = marker._profileEndpointLabel;
  }

  function positionProfileNodeLabels(firstMarker, secondMarker) {
    if (!map || !firstMarker || !secondMarker) return;
    const firstElement = firstMarker.getElement?.()?.querySelector?.(".elevation-profile-node-label");
    const secondElement = secondMarker.getElement?.()?.querySelector?.(".elevation-profile-node-label");
    if (!firstElement && !secondElement) return;
    const firstPoint = map.latLngToContainerPoint(firstMarker.getLatLng());
    const secondPoint = map.latLngToContainerPoint(secondMarker.getLatLng());
    let dx = firstPoint.x - secondPoint.x;
    let dy = firstPoint.y - secondPoint.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) {
      dx = 0;
      dy = -1;
    } else {
      dx /= length;
      dy /= length;
    }
    const offset = 18;
    const place = (element, x, y) => {
      if (!element) return;
      element.style.setProperty("--profile-label-x", `${x * offset}px`);
      element.style.setProperty("--profile-label-y", `${y * offset}px`);
    };
    place(firstElement, dx, dy);
    place(secondElement, -dx, -dy);
  }

  function updateProfileNodeLabelPositions() {
    positionProfileNodeLabels(profileStartNode, profileCursorNode || profileEndNode);
    for (const line of lockedElevationProfiles) {
      if (!line?._profileRemoved) positionProfileNodeLabels(line._profileStartNode, line._profileEndNode);
    }
  }

  function makeProfileEditNode(latlng) {
    const marker = L.marker(latlng, {
      icon: L.divIcon({
        className: "measurement-node-icon elevation-profile-node elevation-profile-edit-node",
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      }),
      interactive: true,
      draggable: true,
      bubblingMouseEvents: false,
      keyboard: false
    });
    marker.options.pmIgnore = true;
    marker.options.snapIgnore = true;
    return marker;
  }

  function profileMeasurementTooltipHtml(start, end) {
    if (!map || !start || !end) return "";
    const distance = map.distance(start, end);
    const distanceText = window.FAElevationHost?.formatDistance?.(distance) || formatProfileDistance(distance);
    const bearing = window.FAElevationHost?.formatBearing?.(start, end) || "";
    const rows = [["DISTANCE", distanceText]];
    if (bearing) rows.push(["BEARING (LAST POINT)", bearing]);
    return window.FAElevationHost?.tooltipHtml?.(rows) || rows.map(([label, value]) => `<div class="measurement-row"><span class="measurement-title">${label}</span><span class="measurement-value">${value}</span></div>`).join("");
  }

  function updateProfileDrawingTooltip(target) {
    if (!map || !profileDrawing || !profileStart || !target) return;
    const content = profileMeasurementTooltipHtml(profileStart, target);
    if (!content) return;
    if (!profileCursorTooltip) {
      profileCursorTooltip = L.tooltip({ permanent: true, direction: "top", offset: L.point(0, -8), className: "measurement-tooltip", opacity: 1 });
    }
    profileCursorTooltip.setLatLng(target).setContent(content);
    if (!map.hasLayer(profileCursorTooltip)) profileCursorTooltip.addTo(map);
  }

  function interpolateProfilePoint(a, b, t) {
    const rad = Math.PI / 180;
    const deg = 180 / Math.PI;
    const lat1 = a.lat * rad;
    const lon1 = a.lng * rad;
    const lat2 = b.lat * rad;
    const lon2 = b.lng * rad;
    const sinLat = Math.sin((lat2 - lat1) / 2);
    const sinLon = Math.sin((lon2 - lon1) / 2);
    const q = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
    const d = 2 * Math.atan2(Math.sqrt(q), Math.sqrt(Math.max(0, 1 - q)));
    if (d < 1e-12) return L.latLng(a.lat, a.lng);
    const sd = Math.sin(d);
    const wa = Math.sin((1 - t) * d) / sd;
    const wb = Math.sin(t * d) / sd;
    const x = wa * Math.cos(lat1) * Math.cos(lon1) + wb * Math.cos(lat2) * Math.cos(lon2);
    const y = wa * Math.cos(lat1) * Math.sin(lon1) + wb * Math.cos(lat2) * Math.sin(lon2);
    const z = wa * Math.sin(lat1) + wb * Math.sin(lat2);
    return L.latLng(Math.atan2(z, Math.sqrt(x * x + y * y)) * deg, Math.atan2(y, x) * deg);
  }

  function profileDisplayMidpoint(start, finish) {
    const a = L.latLng(start);
    const b = L.latLng(finish);
    const midpoint = interpolateProfilePoint(a, b, 0.5);
    let endLongitude = Number(b.lng);
    const startLongitude = Number(a.lng);
    while (endLongitude - startLongitude > 180) endLongitude -= 360;
    while (endLongitude - startLongitude < -180) endLongitude += 360;
    const targetLongitude = (startLongitude + endLongitude) / 2;
    let longitude = Number(midpoint.lng);
    while (longitude - targetLongitude > 180) longitude -= 360;
    while (longitude - targetLongitude < -180) longitude += 360;
    return L.latLng(midpoint.lat, longitude, midpoint.alt);
  }

  function normalizeElevationLongitude(longitude) {
    const value = Number(longitude);
    if (!Number.isFinite(value)) return 0;
    return ((value + 180) % 360 + 360) % 360 - 180;
  }

  function profileGeodesicLatLngs(start, finish, maxSteps = 768) {
    if (!map || !start || !finish) return [];
    const a = L.latLng(start);
    const b = L.latLng(finish);
    const distance = map.distance(a, b);
    const steps = Math.max(1, Math.min(maxSteps, Math.ceil(distance / 25000)));
    const points = [];
    let previousLongitude = Number(a.lng);
    for (let index = 0; index <= steps; index += 1) {
      const point = interpolateProfilePoint(a, b, index / steps);
      let longitude = Number(point.lng);
      while (longitude - previousLongitude > 180) longitude -= 360;
      while (longitude - previousLongitude < -180) longitude += 360;
      previousLongitude = longitude;
      points.push(L.latLng(point.lat, longitude, point.alt));
    }
    return points;
  }

  function formatProfileElevation(value) {
    if (!Number.isFinite(value)) return "Unavailable";
    return window.FAElevationHost?.formatElevation?.(value) || `${Math.round(value).toLocaleString()} m`;
  }

  function formatProfileDistance(value) {
    if (!Number.isFinite(value)) return "Unavailable";
    if (window.FAElevationHost?.formatDistance) return window.FAElevationHost.formatDistance(value);
    return value < 1000 ? `${Math.round(value).toLocaleString()} m` : `${Number((value / 1000).toFixed(2)).toLocaleString()} km`;
  }

  function profileGraph(values) {
    const finite = values.filter(Number.isFinite);
    if (finite.length < 2) return "";
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const range = Math.max(1, max - min);
    let path = "";
    let drawing = false;
    values.forEach((value, index) => {
      if (!Number.isFinite(value)) { drawing = false; return; }
      const x = index / (values.length - 1) * 220;
      const y = 56 - (value - min) / range * 50;
      path += `${drawing ? " L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
      drawing = true;
    });
    return `<svg class="elevation-profile-graph" viewBox="0 0 220 74" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="57" x2="220" y2="57"></line><path d="${path}"></path><text class="elevation-profile-endpoint-label" x="1" y="71" text-anchor="start">A</text><text class="elevation-profile-endpoint-label" x="219" y="71" text-anchor="end">B</text></svg>`;
  }

  function profileResultHtml(distance, values, start, end) {
    const valid = values.filter(Number.isFinite);
    if (!valid.length) return `<div class="elevation-profile-title">Elevation profile</div><div class="measurement-value elevation-profile-unavailable-row">Elevation unavailable</div>`;
    let gain = 0;
    let loss = 0;
    for (let index = 1; index < values.length; index += 1) {
      if (!Number.isFinite(values[index - 1]) || !Number.isFinite(values[index])) continue;
      const delta = values[index] - values[index - 1];
      if (delta > 0) gain += delta;
      else loss -= delta;
    }
    const bearing = window.FAElevationHost?.formatBearing?.(start, end) || "Unavailable";
    return `<div class="elevation-profile-title">Elevation profile</div><div class="elevation-profile-stats"><div class="measurement-row elevation-profile-distance"><span class="measurement-title">Distance</span><span class="measurement-value">${formatProfileDistance(distance)}</span></div><div class="measurement-row elevation-profile-bearing"><span class="measurement-title">Bearing</span><span class="measurement-value">${bearing}</span></div><div class="measurement-row"><span class="measurement-title">Start</span><span class="measurement-value">${formatProfileElevation(values[0])}</span></div><div class="measurement-row"><span class="measurement-title">End</span><span class="measurement-value">${formatProfileElevation(values[values.length - 1])}</span></div><div class="measurement-row"><span class="measurement-title">Min</span><span class="measurement-value">${formatProfileElevation(Math.min(...valid))}</span></div><div class="measurement-row"><span class="measurement-title">Max</span><span class="measurement-value">${formatProfileElevation(Math.max(...valid))}</span></div><div class="measurement-row"><span class="measurement-title">Gain</span><span class="measurement-value">+${formatProfileElevation(gain)}</span></div><div class="measurement-row"><span class="measurement-title">Loss</span><span class="measurement-value">-${formatProfileElevation(loss)}</span></div></div>${profileGraph(values)}`;
  }


  function clearLineOfSightLayers(line) {
    if (!line) return;
    for (const layer of [line._losClearLayer, line._losBlockedLayer, line._losBlockMarker]) {
      if (layer && map?.hasLayer(layer)) map.removeLayer(layer);
    }
    line._losClearLayer = line._losBlockedLayer = line._losBlockMarker = null;
  }

  function lineOfSightSectionColor(kind) {
    return kind === "clear" ? "#46c17c" : kind === "blocked" ? "#f06b6b" : "#909090";
  }

  function lineOfSightGraph(result) {
    const values = result.adjusted.filter(Number.isFinite);
    if (!values.length) return "";
    const min = Math.min(...values, ...result.sight);
    const max = Math.max(...values, ...result.sight);
    const range = Math.max(1, max - min);
    const graphX = fraction => (fraction * 220).toFixed(2);
    const graphY = value => (56 - (value - min) / range * 50).toFixed(2);
    const path = series => {
      let out = "";
      let previous = false;
      series.forEach((value, index) => {
        if (!Number.isFinite(value)) { previous = false; return; }
        out += `${previous ? " L" : "M"}${graphX(index / (series.length - 1))} ${graphY(value)}`;
        previous = true;
      });
      return out;
    };
    const fills = (result.sections || []).map(section => {
      const from = Number(graphX(section.from));
      const to = Number(graphX(section.to));
      const width = Math.max(.01, to - from);
      return `<rect x="${from.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="57" fill="${lineOfSightSectionColor(section.kind)}" opacity="0.12"></rect>`;
    }).join("");
    const rays = (result.sections || []).map(section => {
      const left = result.sight[0] + (result.sight[result.sight.length - 1] - result.sight[0]) * section.from;
      const right = result.sight[0] + (result.sight[result.sight.length - 1] - result.sight[0]) * section.to;
      return `<path class="elevation-los-ray" style="stroke:${lineOfSightSectionColor(section.kind)}" d="M${graphX(section.from)} ${graphY(left)} L${graphX(section.to)} ${graphY(right)}"></path>`;
    }).join("");
    return `<svg class="elevation-profile-graph elevation-los-graph" viewBox="0 0 220 74" preserveAspectRatio="none" aria-label="Terrain profile and sight line, green where clear and red where obstructed"><line x1="0" y1="57" x2="220" y2="57"></line>${fills}<path class="elevation-los-terrain" d="${path(result.adjusted)}"></path>${rays}<text x="1" y="71">A</text><text x="219" y="71" text-anchor="end">B</text></svg>`;
  }

  function lineOfSightHtml(distance, values, result, start, finish) {
    const unavailable = result.status === "unavailable";
    const name = unavailable ? (distance > window.FALineOfSight.MAX_DISTANCE_M ? "Maximum analysis distance: 300 km" : "Elevation unavailable") : result.status === "clear" ? "<strong>Clear</strong> (estimated)" : result.status === "obstructed" ? "<strong>Obstructed</strong> (estimated)" : "Incomplete elevation data";
    const classification = result.status === "clear" ? "clear" : result.status === "obstructed" ? "blocked" : "unknown";
    const rows = [
      ["Distance", formatProfileDistance(distance)],
      ["Bearing", window.FAElevationHost?.formatBearing?.(start, finish) || "Unavailable"],
      ["First obstruction", result.firstDistance === null ? (result.status === "clear" ? "None detected" : "Unknown") : formatProfileDistance(result.firstDistance)],
      ["Min clearance", result.minimumClearance === null ? "Unavailable" : formatProfileElevation(result.minimumClearance)],
      ["Observer height", formatProfileElevation(result.observerHeight)],
      ["Target height", formatProfileElevation(result.targetHeight)]
    ];
    return `<div class="elevation-profile-title">Line of sight</div><div class="elevation-los-status elevation-los-${classification}">${name}</div><div class="elevation-profile-stats elevation-los-stats">${rows.map(([key, value]) => `<div class="measurement-row"><span class="measurement-title">${key}</span><span class="measurement-value">${value}</span></div>`).join("")}</div>${unavailable ? "" : lineOfSightGraph(result)}${result.missing ? `<div class="elevation-los-note">Some terrain samples unavailable.</div>` : ""}`;
  }

  function renderLineOfSightMap(line, result) {
    clearLineOfSightLayers(line);
    if (!line || line._profileRemoved || line._profileEditing) return;
    const sections = result.sections || [];
    if (!sections.length || !map) {
      line.setStyle({color: profileColor(), weight: 2, opacity: .9});
      return;
    }
    const start = map.project(line._profileStart, 0);
    const end = map.project(line._profileEnd, 0);
    const pointAt = t => map.unproject(L.point(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t), 0);
    const groups = {clear: [], blocked: [], unknown: []};
    for (const section of sections) {
      if (!groups[section.kind]) continue;
      groups[section.kind].push([pointAt(section.from), pointAt(section.to)]);
    }
    line.setStyle({color: profileColor(), weight: 2, opacity: 0});
    for (const [kind, property] of [["clear", "_losClearLayer"], ["blocked", "_losBlockedLayer"], ["unknown", "_losBlockMarker"]]) {
      if (!groups[kind].length) continue;
      const layer = L.polyline(groups[kind], {color: lineOfSightSectionColor(kind), weight: 2, opacity: .9, interactive: false, bubblingMouseEvents: false, snapIgnore: true}).addTo(map);
      layer.options.pmIgnore = true;
      line[property] = layer;
    }
  }

  function setProfileTooltipContent(line, content) {
    line?._profileTooltip?.setContent(content);
  }

  function renderProfileCachedResult(line) {
    if (!line || line._profileRemoved || !line._profileTooltip) return;
    const stats = line._faCachedProfileStats;
    if (!stats) return;
    if (!line._profileLos) {
      clearLineOfSightLayers(line);
      line.setStyle({color: profileColor(), weight: 2, opacity: .9});
      setProfileTooltipContent(line, profileResultHtml(stats.distance, stats.values, stats.start, stats.finish));
      return;
    }
    const result = window.FALineOfSight.analyze(stats.distance, stats.values, line._profileLos.observerHeight, line._profileLos.targetHeight);
    setProfileTooltipContent(line, lineOfSightHtml(stats.distance, stats.values, result, stats.start, stats.finish));
    renderLineOfSightMap(line, result);
  }

  async function refreshElevationProfile(line) {
    if (!map || !line || line._profileRemoved || !line._profileTooltip) return;
    clearLineOfSightLayers(line);
    const start = L.latLng(line._profileStart);
    const finish = L.latLng(line._profileEnd);
    const request = (line._profileLoadRequest || 0) + 1;
    line._profileLoadRequest = request;
    line._profileTooltip.setLatLng(profileDisplayMidpoint(start, finish));
    showProfileLoading(line, line._profileTooltip);
    await new Promise(resolve => requestAnimationFrame(resolve));
    const distance = map.distance(start, finish);
    if (line._profileLos && (distance > window.FALineOfSight.MAX_DISTANCE_M || distance <= 0)) {
      stopProfileLoading(line);
      line._faCachedProfileStats = {distance, values: [], start, finish, points: []};
      renderProfileCachedResult(line);
      ensureElevationProfileTooltipVisible(line);
      return;
    }
    const count = line._profileLos && distance <= window.FALineOfSight.MAX_DISTANCE_M ? Math.max(64, Math.min(401, Math.ceil(distance / (distance <= 20000 ? 50 : 250)) + 1)) : Math.max(48, Math.min(160, Math.ceil(distance / 150) + 1));
    const zoom = distance <= 5000 ? 15 : distance <= 20000 ? 14 : distance <= 80000 ? 13 : 12;
    const points = Array.from({ length: count }, (_, index) => interpolateProfilePoint(start, finish, index / (count - 1)));
    const values = await loadProfileValues(points, zoom, line);
    if (line._profileRemoved || line._profileLoadRequest !== request) return;
    stopProfileLoading(line);
    line._faCachedProfileStats = {distance, values, start, finish, points};
    renderProfileCachedResult(line);
    ensureElevationProfileTooltipVisible(line);
    if (!line._profileTooltipHidden && !map.hasLayer(line._profileTooltip)) line._profileTooltip.addTo(map);
  }

  function setElevationProfileEditing(line, editing) {
    if (editing) map?._faLeaveScreenSvg?.();
    if (!map || !line) return;
    if (editing && line._profileRemoved) return;
    if (!editing) {
      const wasEditing = Boolean(line._profileEditing);
      const wasReversed = Boolean(line._profileEditReverse);
      for (const marker of [line._profileEditStartNode, line._profileEditEndNode]) {
        if (marker && map.hasLayer(marker)) map.removeLayer(marker);
      }
      if (line._profileEditTooltip && map.hasLayer(line._profileEditTooltip)) map.removeLayer(line._profileEditTooltip);
      line._profileEditStartNode = null;
      line._profileEditEndNode = null;
      line._profileEditTooltip = null;
      line._profileEditing = false;
      line.setStyle({dashArray: null, opacity: 0.9});
      if (wasEditing && wasReversed) {
        const node = line._profileStartNode;
        line._profileStartNode = line._profileEndNode;
        line._profileEndNode = node;
      }
      setProfileNodeLabel(line._profileStartNode, "A");
      setProfileNodeLabel(line._profileEndNode, "B");
      positionProfileNodeLabels(line._profileStartNode, line._profileEndNode);
      if (profileLine === line) {
        profileStart = line._profileStart;
        profileStartNode = line._profileStartNode;
        profileEndNode = line._profileEndNode;
      }
      if (wasEditing && !line._profileRemoved && line._profileTooltip) {
        if (!line._profileEditDirty) renderProfileCachedResult(line);
        line._profileTooltip.setLatLng(profileDisplayMidpoint(line._profileStart, line._profileEnd));
        if (!line._profileTooltipHidden && !map.hasLayer(line._profileTooltip)) line._profileTooltip.addTo(map);
        if (line._profileEditDirty) refreshElevationProfile(line);
      }
      if (wasEditing && line._profileLocked && line._profileEditDirty) syncPersistedElevationProfiles();
      map?._faMaybeResumeScreenSvg?.();
      if (wasEditing && line._profileEditDirty && !line._profileRemoved) recordElevationProfileUpdate(line._profileEditBefore, elevationProfileSnapshot(line));
      line._profileEditBefore = null;
      line._profileEditDirty = false;
      line._profileEditReverse = false;
      return;
    }
    if (line._profileEditing) return;
    line._profileEditBefore = elevationProfileSnapshot(line);
    line._profileEditing = true;
    line._profileEditDirty = false;
    line._profileEditReverse = false;
    line.setStyle({dashArray: "5,5", opacity: 0.9});
    clearLineOfSightLayers(line);
    line._profileLoadRequest = (line._profileLoadRequest || 0) + 1;
    stopProfileLoading(line);
    if (line._profileTooltip && map.hasLayer(line._profileTooltip)) map.removeLayer(line._profileTooltip);
    const startMarker = makeProfileEditNode(line._profileStart).addTo(map);
    const endMarker = makeProfileEditNode(line._profileEnd).addTo(map);
    line._profileEditStartNode = startMarker;
    line._profileEditEndNode = endMarker;
    const sync = (activeMarker, snap = false) => {
      if (snap && activeMarker) {
        const snapped = window.FAElevationHost?.snapLatLng?.(activeMarker.getLatLng(), 20, line, true);
        if (snapped) activeMarker.setLatLng(snapped);
      }
      const markerStart = L.latLng(startMarker.getLatLng());
      const markerEnd = L.latLng(endMarker.getLatLng());
      if (activeMarker === startMarker) line._profileEditReverse = true;
      else if (activeMarker === endMarker) line._profileEditReverse = false;
      const logicalStart = line._profileEditReverse ? markerEnd : markerStart;
      const logicalEnd = line._profileEditReverse ? markerStart : markerEnd;
      line._profileStart = logicalStart;
      line._profileEnd = logicalEnd;
      line.setLatLngs([markerStart, markerEnd]);
      line._profileHitLayer?.setLatLngs([markerStart, markerEnd]);
      line._profileStartNode?.setLatLng(markerStart);
      line._profileEndNode?.setLatLng(markerEnd);
      if (line._profileEditReverse) {
        setProfileNodeLabel(line._profileStartNode, "B");
        setProfileNodeLabel(line._profileEndNode, "A");
      } else {
        setProfileNodeLabel(line._profileStartNode, "A");
        setProfileNodeLabel(line._profileEndNode, "B");
      }
      positionProfileNodeLabels(line._profileStartNode, line._profileEndNode);
      line._profileTooltip?.setLatLng(profileDisplayMidpoint(logicalStart, logicalEnd));
      if (line._profileEditTooltip && activeMarker) {
        line._profileEditTooltip.setLatLng(activeMarker.getLatLng()).setContent(profileMeasurementTooltipHtml(logicalStart, logicalEnd));
      }
    };
    const beginDrag = marker => {
      line._profileEditDirty = true;
      if (!line._profileEditTooltip) {
        line._profileEditTooltip = L.tooltip({ permanent: true, direction: "top", offset: L.point(0, -8), className: "measurement-tooltip", opacity: 1 });
      }
      sync(marker);
      if (!map.hasLayer(line._profileEditTooltip)) line._profileEditTooltip.addTo(map);
    };
    const bindMarker = marker => {
      marker.on("dragstart", () => beginDrag(marker));
      marker.on("drag", () => sync(marker, true));
      marker.on("dragend", () => { sync(marker, true); window.FAElevationHost?.clearSnapPreview?.(); });
    };
    bindMarker(startMarker);
    bindMarker(endMarker);
    profileToast("Drag either endpoint to edit the elevation profile.");
  }

  function stopProfileLoading(line = profileLine) {
    const timer = line?._profileLoadingTimer || (line === profileLine ? profileLoadingTimer : 0);
    if (timer) clearInterval(timer);
    if (line) line._profileLoadingTimer = 0;
    if (line === profileLine) profileLoadingTimer = 0;
  }

  function elevationLoadingDotsHtml(dots) {
    return `<div class="measurement-value elevation-loading-dots">${".".repeat(dots)}</div>`;
  }

  function showProfileLoading(line = profileLine, tooltip = profileTooltip) {
    if (!line || !tooltip || !map) return;
    if (!line._profileTooltipHidden && !map.hasLayer(tooltip)) tooltip.addTo(map);
    let dots = 1;
    const render = () => setProfileTooltipContent(line, `<div class="elevation-profile-title">${line._profileLos ? "Line of sight" : "Elevation profile"}</div>${elevationLoadingDotsHtml(dots)}`);
    render();
    stopProfileLoading(line);
    line._profileLoadingTimer = setInterval(() => { dots = dots % 3 + 1; render(); }, 350);
    if (line === profileLine) profileLoadingTimer = line._profileLoadingTimer;
  }

  function ensureElevationProfileTooltipVisible(line) {
    if (!map || !line || line._profileRemoved || line._profileEditing || line._profileTooltipHidden || !line._profileTooltip) return;
    if (line._profileStart && line._profileEnd) {
      line._profileTooltip.setLatLng(profileDisplayMidpoint(line._profileStart, line._profileEnd));
    }
    if (!map.hasLayer(line._profileTooltip)) line._profileTooltip.addTo(map);
  }

  function ensureElevationProfileTooltipsVisible() {
    const lines = new Set([...lockedElevationProfiles]);
    if (profileLine) lines.add(profileLine);
    for (const line of lines) ensureElevationProfileTooltipVisible(line);
  }

  function detachProfileDrawing() {
    profilePointerStart = null;
    map?.off("mousemove", onProfileMouseMove);
    window.FAElevationHost?.clearSnapPreview?.();
    map?.getContainer()?.classList.remove("elevation-profile-drawing");
    if (profileEscapeHandler) {
      document.removeEventListener("keydown", profileEscapeHandler);
      profileEscapeHandler = null;
    }
  }

  function clearElevationProfile() {
    profileRequest += 1;
    detachProfileDrawing();
    map?._faMaybeResumeScreenSvg?.();
    const line = profileLine;
    if (line?._elevationProfile) {
      removeElevationProfileLine(line);
    } else {
      stopProfileLoading(line);
      [profileLine, profileStartNode, profileEndNode, profileCursorNode, profileCursorTooltip, profileTooltip].forEach(item => {
        if (item && map?.hasLayer(item)) map.removeLayer(item);
      });
      profileDrawing = false;
      profileStart = null;
      profileLine = null;
      profileStartNode = null;
      profileEndNode = null;
      profileCursorNode = null;
      profileCursorTooltip = null;
      profileTooltip = null;
    }
  }

  function cancelElevationProfile() {
    const start = profileStart ? L.latLng(profileStart) : null;
    clearElevationProfile();
    if (start && isEnabled()) updateReadout({ latlng: start });
  }

  function onProfileMouseMove(event) {
    if (!profileDrawing || !profileStart || !event?.latlng) return;
    const target = window.FAElevationHost?.snapLatLng?.(event.latlng, 20, profileLine, true) || event.latlng;
    profileLine?.setLatLngs([profileStart, target]);
    profileCursorNode?.setLatLng(target);
    positionProfileNodeLabels(profileStartNode, profileCursorNode);
    updateProfileDrawingTooltip(target);
  }

  function beginElevationProfile(mode = "profile") {
    map?._faLeaveScreenSvg?.();
    if (!map || !isEnabled() || !clickMarker || !map.hasLayer(clickMarker)) return;
    const start = L.latLng(clickMarker.getLatLng());
    clearElevationProfile();
    profileStart = start;
    profileDrawingMode = mode === "los" ? "los" : "profile";
    profileDrawing = true;
    hideProfileContextMenu();
    readoutRequest += 1;
    hideReadout(true);
    profileLine = L.polyline([start, start], { color: profileColor(), weight: 2, opacity: 0.9, dashArray: "5,5", interactive: true, bubblingMouseEvents: true, snapIgnore: false, className: "elevation-profile-line" }).addTo(map);
    profileLine.options.pmIgnore = true;
    profileLine.options.snapIgnore = false;
    profileStartNode = makeProfileNode(start, "", "A").addTo(map);
    profileCursorNode = makeProfileNode(start, "elevation-profile-cursor-node", "B").addTo(map);
    positionProfileNodeLabels(profileStartNode, profileCursorNode);
    map.getContainer().classList.add("elevation-profile-drawing");
    map.on("mousemove", onProfileMouseMove);
    profileEscapeHandler = event => { if (event.key === "Escape" && profileDrawing) cancelElevationProfile(); };
    document.addEventListener("keydown", profileEscapeHandler);
  }

  async function loadProfileValues(points, zoom, line) {
    const values = new Array(points.length).fill(null);
    let cursor = 0;
    async function worker() {
      while (cursor < points.length && !line?._profileRemoved) {
        const index = cursor++;
        try { values[index] = await getElevationAt(points[index], zoom); } catch { values[index] = null; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(6, points.length) }, () => worker()));
    return values;
  }

  async function finishElevationProfile(end) {
    if (!profileDrawing || !profileStart || !map || !end) return;
    const start = L.latLng(profileStart);
    const finish = L.latLng(end);
    const line = profileLine;
    profileDrawing = false;
    profilePointerStart = null;
    detachProfileDrawing();
    map?._faMaybeResumeScreenSvg?.();
    if (profileCursorTooltip && map.hasLayer(profileCursorTooltip)) map.removeLayer(profileCursorTooltip);
    profileCursorTooltip = null;
    line?.setLatLngs([start, finish]);
    line?.setStyle({dashArray: null, opacity: 0.9});
    if (line?.options) line.options.bubblingMouseEvents = false;
    if (profileCursorNode) {
      profileCursorNode.setLatLng(finish);
      profileEndNode = profileCursorNode;
      profileCursorNode = null;
    } else {
      profileEndNode = makeProfileNode(finish, "", "B").addTo(map);
    }
    positionProfileNodeLabels(profileStartNode, profileEndNode);
    profileTooltip = L.tooltip({ permanent: true, direction: "top", offset: L.point(0, -10), className: "measurement-tooltip elevation-profile-tooltip", opacity: 1 })
      .setLatLng(profileDisplayMidpoint(start, finish))
      .addTo(map);
    if (!line) return;
    line._elevationProfile = true;
    line._profileLos = profileDrawingMode === "los" ? {observerHeight: 2, targetHeight: 2} : null;
    line._profileStart = start;
    line._profileEnd = finish;
    line._profileStartNode = profileStartNode;
    line._profileEndNode = profileEndNode;
    line._profileTooltip = profileTooltip;
    line._profileTooltipHidden = false;
    line._profileLocked = false;
    line._profileEditing = false;
    line._profileRemoved = false;
    line._profileIgnoreClickUntil = Date.now() + 400;
    line._profileHitLayer = L.polyline([start, finish], {color: profileColor(), weight: 14, opacity: 0, interactive: true, bubblingMouseEvents: false, snapIgnore: true}).addTo(map);
    line._profileHitLayer.options.pmIgnore = true;
    line._profileHitLayer.options.snapIgnore = true;
    attachElevationProfileInteractions(line);
    recordElevationProfileAction("create", elevationProfileSnapshot(line));
    await refreshElevationProfile(line);
  }

  function restoreElevationProfile(snapshot) {
    if (!map || !snapshot?.start || !snapshot?.end) return false;
    if (profileLine && !profileLine._profileLocked) withoutProfileHistory(() => clearElevationProfile());
    const start = L.latLng(snapshot.start);
    const finish = L.latLng(snapshot.end);
    profileStart = start;
    profileDrawingMode = snapshot.los ? "los" : "profile";
    profileDrawing = true;
    profileLine = L.polyline([start, finish], { color: profileColor(), weight: 2, opacity: 0.9, interactive: true, bubblingMouseEvents: true, snapIgnore: false, className: "elevation-profile-line" }).addTo(map);
    profileLine.options.pmIgnore = true;
    profileLine.options.snapIgnore = false;
    profileStartNode = makeProfileNode(start, "", "A").addTo(map);
    profileCursorNode = makeProfileNode(finish, "elevation-profile-cursor-node", "B").addTo(map);
    const task = withoutProfileHistory(() => finishElevationProfile(finish));
    const restoredLine = profileLine;
    if (!restoredLine) return false;
    restoredLine._profileHistoryId = snapshot.id || null;
    restoredLine._profileLos = snapshot.los ? {observerHeight: window.FALineOfSight.clampHeight(snapshot.los.observerHeight), targetHeight: window.FALineOfSight.clampHeight(snapshot.los.targetHeight)} : null;
    restoredLine._profileTooltipHidden = Boolean(snapshot.tooltipHidden);
    if (restoredLine._profileTooltipHidden && restoredLine._profileTooltip && map.hasLayer(restoredLine._profileTooltip)) map.removeLayer(restoredLine._profileTooltip);
    if (snapshot.locked) {
      restoredLine._profileLocked = true;
      lockedElevationProfiles.add(restoredLine);
      resetCurrentProfileRefs(restoredLine);
      if (!restoringPersistedProfiles) syncPersistedElevationProfiles();
    }
    Promise.resolve(task).catch(error => void 0);
    return true;
  }

  function removeElevationProfileByHistoryId(id) {
    if (!id) return false;
    const candidates = [profileLine, ...lockedElevationProfiles].filter(Boolean);
    const line = candidates.find(candidate => candidate._profileHistoryId === id && !candidate._profileRemoved);
    if (!line) return false;
    removeElevationProfileLine(line);
    return true;
  }

  function showClickMarker(latlng) {
    if (!map || !latlng) return;
    if (!clickMarker) {
      clickMarker = L.marker(latlng, {
        icon: L.divIcon({
          className: "elevation-click-dot-marker",
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        }),
        interactive: true,
        bubblingMouseEvents: false,
        keyboard: false
      });
      clickMarker.options.pmIgnore = true;
      clickMarker.options.snapIgnore = false;
      clickMarker.on("click", event => {
        if (event?.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        if (!isEnabled() || profileDrawing) return;
        recordElevationPointChange(elevationPointSnapshot(), null);
        readoutRequest += 1;
        hideReadout(true);
      });
      clickMarker.on("contextmenu", showProfileContextMenu);
    } else {
      clickMarker.setLatLng(latlng);
    }
    clickMarker._elevationValue = null;
    if (!map.hasLayer(clickMarker)) clickMarker.addTo(map);
  }

  function hideReadout(clearMarker = false) {
    if (readout && map?.hasLayer(readout)) map.removeLayer(readout);
    if (clearMarker && clickMarker && map?.hasLayer(clickMarker)) map.removeLayer(clickMarker);
    if (clearMarker) hideProfileContextMenu();
  }

  async function getElevationAt(latlng, zoomOverride = null) {
    if (!map || !latlng) return null;
    const pointLatLng = L.latLng(Number(latlng.lat), normalizeElevationLongitude(latlng.lng));
    const preferredZoom = zoomOverride === null
      ? Math.min(MAX_NATIVE_ZOOM, Math.max(12, Math.floor(map.getZoom())))
      : Math.min(MAX_NATIVE_ZOOM, Math.max(0, Math.floor(zoomOverride)));
    const sampleInfo = z => {
      const point = map.project(pointLatLng, z);
      const worldTiles = Math.pow(2, z);
      const rawX = Math.floor(point.x / TILE_SIZE);
      const x = ((rawX % worldTiles) + worldTiles) % worldTiles;
      const y = Math.floor(point.y / TILE_SIZE);
      const px = Math.floor((point.x - rawX * TILE_SIZE) * 2);
      const py = Math.floor((point.y - y * TILE_SIZE) * 2);
      return {z, x, y, px, py, key: `${z}/${x}/${y}`};
    };
    const readValue = (info, data) => {
      const value = elevation(data, info.px, info.py);
      return Number.isFinite(value) && value > -32760 ? value : null;
    };
    async function tryZooms(zooms) {
      const infos = [...new Set(zooms.filter(z => Number.isFinite(z) && z >= 0))].map(sampleInfo);
      for (const info of infos) {
        const cached = cache.get(info.key);
        if (!cached) continue;
        const value = readValue(info, cached);
        if (Number.isFinite(value)) return value;
      }
      if (!infos.length) return null;
      return new Promise(resolve => {
        let remaining = infos.length;
        let settled = false;
        const finishOne = value => {
          if (settled) return;
          if (Number.isFinite(value)) { settled = true; resolve(value); return; }
          remaining -= 1;
          if (remaining <= 0) { settled = true; resolve(null); }
        };
        for (const info of infos) {
          loadElevationData(info.z, info.x, info.y).then(data => finishOne(readValue(info, data))).catch(() => finishOne(null));
        }
      });
    }
    const primaryValue = await tryZooms(preferredZoom > 12 ? [preferredZoom, 12] : [preferredZoom]);
    if (Number.isFinite(primaryValue)) return primaryValue;
    const fallbackValue = await tryZooms([Math.min(10, preferredZoom - 1), Math.min(8, preferredZoom - 1)]);
    return Number.isFinite(fallbackValue) ? fallbackValue : null;
  }

  function formatReadoutCoordinates(latlng) {
    return window.FAElevationHost?.formatCoordinates?.(latlng.lat, latlng.lng) || `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
  }

  async function updateReadout(event) {
    if (!readout || !isEnabled() || !event?.latlng) return hideReadout(true);
    const request = ++readoutRequest;
    showClickMarker(event.latlng);
    hideReadout();
    if (readoutLoadingTimer) clearInterval(readoutLoadingTimer);
    let dots = 1;
    const renderLoading = () => {
      if (request !== readoutRequest || !isEnabled()) return;
      readout
        .setLatLng(event.latlng)
        .setContent(`<div class="measurement-row"><span class="measurement-title">Coordinates</span><span class="measurement-value">${formatReadoutCoordinates(event.latlng)}</span></div><div class="measurement-title">Elevation</div>${elevationLoadingDotsHtml(dots)}`);
      if (!map.hasLayer(readout)) readout.addTo(map);
    };
    renderLoading();
    readoutLoadingTimer = setInterval(() => {
      dots = dots % 3 + 1;
      renderLoading();
    }, 350);
    await new Promise(resolve => requestAnimationFrame(resolve));

    let value = null;
    try {
      value = await getElevationAt(event.latlng);
    } finally {
      if (readoutLoadingTimer) { clearInterval(readoutLoadingTimer); readoutLoadingTimer = 0; }
    }
    if (request !== readoutRequest || !isEnabled()) return;
    if (clickMarker && map.hasLayer(clickMarker) && clickMarker.getLatLng().equals(event.latlng)) clickMarker._elevationValue = Number.isFinite(value) ? value : null;
    if (!Number.isFinite(value)) {
      readout
        .setLatLng(event.latlng)
        .setContent(`<div class="measurement-row"><span class="measurement-title">Coordinates</span><span class="measurement-value">${formatReadoutCoordinates(event.latlng)}</span></div><div class="measurement-row"><span class="measurement-title">Elevation</span><span class="measurement-value">Unavailable</span></div>`);
      if (!map.hasLayer(readout)) readout.addTo(map);
      return;
    }

    readout
      .setLatLng(event.latlng)
      .setContent(`<div class="measurement-row"><span class="measurement-title">Coordinates</span><span class="measurement-value">${formatReadoutCoordinates(event.latlng)}</span></div><div class="measurement-row"><span class="measurement-title">Elevation</span><span class="measurement-value">${formatProfileElevation(value)}</span></div>`);
    if (!map.hasLayer(readout)) readout.addTo(map);
  }

  function onMapClick(event) {
    if (Date.now() < profileSkipClickUntil) return;
    if (event?.originalEvent?.target?.closest?.(".leaflet-marker-icon, .leaflet-interactive") && !profileDrawing) return;
    if (window.FAElevationHost?.isLineMeasurementEditing?.()) { readoutRequest += 1; hideReadout(true); return; }
    hideProfileLineContextMenu();
    hideProfileContextMenu();
    if (profileDrawing) {
      finishElevationProfile(profileCursorNode?.getLatLng?.() || event.latlng);
      return;
    }
    if (clickMarker && map.hasLayer(clickMarker)) {
      const clickedPoint = map.latLngToContainerPoint(event.latlng);
      const markerPoint = map.latLngToContainerPoint(clickMarker.getLatLng());
      if (clickedPoint.distanceTo(markerPoint) <= 6) {
        recordElevationPointChange(elevationPointSnapshot(), null);
        readoutRequest += 1;
        hideReadout(true);
        return;
      }
    }
    recordElevationPointChange(elevationPointSnapshot(), {lat: event.latlng.lat, lng: event.latlng.lng});
    updateReadout(event);
  }

  function init(nextMap) {
    if (!nextMap) return;
    if (map && map !== nextMap) {
      restoringPersistedProfiles = true;
      map.off("click", onMapClick);
      map.off("zoomend", updateProfileNodeLabelPositions);
      map.off("rotate", updateProfileNodeLabelPositions);
      clearAllElevationProfiles();
      profileLineContextMenu?.remove();
      profileContextMenu?.remove();
      profileContextMenu = null;
      profileLineContextMenu = null;
      profileContextTarget = null;
      restoringPersistedProfiles = false;
      persistedProfilesLoaded = false;
    }
    map = nextMap;
    ensurePane();
    ensureReadout();
    map.off("click", onMapClick).on("click", onMapClick);
    const container = map.getContainer();
    if (map._faElevationProfilePointerDown) container.removeEventListener("pointerdown", map._faElevationProfilePointerDown, true);
    if (map._faElevationProfilePointerUp) container.removeEventListener("pointerup", map._faElevationProfilePointerUp, true);
    if (map._faElevationPoiProfileClick) container.removeEventListener("click", map._faElevationPoiProfileClick, true);
    const isUiTarget = target => Boolean(target?.closest?.(".map-context-menu, .leaflet-control, .leaflet-tooltip, .leaflet-popup, .map-toast, button, input, select, textarea"));
    map._faElevationProfilePointerDown = event => {
      profilePointerStart = profileDrawing && isEnabled() && event.button === 0 && !isUiTarget(event.target)
        ? {x: event.clientX, y: event.clientY, id: event.pointerId} : null;
    };
    map._faElevationProfilePointerUp = event => {
      const start = profilePointerStart;
      profilePointerStart = null;
      if (!start || !profileDrawing || !isEnabled() || event.button !== 0 || event.pointerId !== start.id || isUiTarget(event.target)) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7 || map.dragging?.moved?.()) return;
      const icon = event.target?.closest?.(".leaflet-marker-icon");
      const marker = icon?.querySelector?.(".poi-marker") ? map._targets?.[L.Util.stamp(icon)] : null;
      const point = marker?.getLatLng?.() || map.mouseEventToLatLng(event);
      const snapped = window.FAElevationHost?.snapLatLng?.(point, 20, profileLine, false) || point;
      profileSkipClickUntil = Date.now() + 350;
      event.preventDefault();
      event.stopPropagation();
      finishElevationProfile(snapped);
    };
    map._faElevationPoiProfileClick = event => {
      if (!profileDrawing || !isEnabled() || isUiTarget(event.target)) return;
      const icon = event.target?.closest?.(".leaflet-marker-icon");
      if (!icon?.querySelector?.(".poi-marker")) return;
      const marker = map._targets?.[L.Util.stamp(icon)];
      if (!marker?.getLatLng) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      profileSkipClickUntil = Date.now() + 350;
      finishElevationProfile(marker.getLatLng());
    };
    container.addEventListener("pointerdown", map._faElevationProfilePointerDown, true);
    container.addEventListener("pointerup", map._faElevationProfilePointerUp, true);
    container.addEventListener("click", map._faElevationPoiProfileClick, true);
    map.off("zoomend", updateProfileNodeLabelPositions).on("zoomend", updateProfileNodeLabelPositions);
    map.off("rotate", updateProfileNodeLabelPositions).on("rotate", updateProfileNodeLabelPositions);
    map.off("moveend", ensureElevationProfileTooltipsVisible).on("moveend", ensureElevationProfileTooltipsVisible);
    map.off("zoomend", ensureElevationProfileTooltipsVisible).on("zoomend", ensureElevationProfileTooltipsVisible);
    loadPersistedElevationProfiles(false);
  }

  function isEnabled() {
    return Boolean(map && layer && map.hasLayer(layer));
  }

  function setEnabled(enabled) {
    const next = ensureLayer();
    if (!next || !map) return false;
    if (enabled) {
      window.FAWorldCover?.clearInspector?.();
      if (window.FADoubleClickZoomLock?.acquire) window.FADoubleClickZoomLock.acquire(map, "elevation");
      else map.doubleClickZoom?.disable?.();
      if (!map.hasLayer(next)) next.addTo(map);
    } else {
      clearElevationProfile();
      hideProfileContextMenu();
      hideProfileLineContextMenu();
      if (map.hasLayer(next)) map.removeLayer(next);
      if (window.FADoubleClickZoomLock?.release) window.FADoubleClickZoomLock.release(map, "elevation");
      else map.doubleClickZoom?.enable?.();
      readoutRequest += 1;
      hideReadout(true);
    }
    return isEnabled();
  }

  function toggle() {
    return setEnabled(!isEnabled());
  }

  function refreshDisplayUnits() {
    if (profileContextTarget?._profileLos && !profileLineContextMenu?.classList.contains("hidden")) refreshProfileLineContextControls(profileContextTarget);
    for (const line of new Set([profileLine, ...lockedElevationProfiles])) {
      const stats = line?._faCachedProfileStats;
      if (stats && !line._profileRemoved && line._profileTooltip) {
        renderProfileCachedResult(line);
      }
    }
    if (readout && map?.hasLayer(readout) && clickMarker && Number.isFinite(clickMarker._elevationValue)) {
      const point = clickMarker.getLatLng();
      readout.setContent(`<div class="measurement-row"><span class="measurement-title">Coordinates</span><span class="measurement-value">${formatReadoutCoordinates(point)}</span></div><div class="measurement-row"><span class="measurement-title">Elevation</span><span class="measurement-value">${formatProfileElevation(clickMarker._elevationValue)}</span></div>`);
    }
  }
  window.FAElevation = { init, toggle, setEnabled, isEnabled, refreshDisplayUnits, setOpacity: setElevationOpacity, getOpacity: getElevationOpacity, hasProfiles() { return Boolean(profileLine || lockedElevationProfiles.size); }, isEditingOrDrawing() { return profileDrawing || Boolean(profileLine?._profileEditing) || [...lockedElevationProfiles].some(line => line._profileEditing); }, getElevationAt, reloadPersistedProfiles() { loadPersistedElevationProfiles(true); }, restoreProfile: restoreElevationProfile, removeProfileByHistoryId: removeElevationProfileByHistoryId, hideContextMenus() { hideProfileContextMenu(); hideProfileLineContextMenu(); } };
})();
})();
