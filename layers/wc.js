(() => {
  "use strict";

  const WMS_URL = "https://mapproxy.terrascope.be/mapproxy/service";
  const LAYER_NAME = "esa-worldcover-map-10m-2021-v2_map";
  const WORLD_COVER_OPACITY_KEY = "pt.worldcover.opacity";

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

  let worldCoverOpacity = readOverlayOpacity(WORLD_COVER_OPACITY_KEY, 0.80);

  function setWorldCoverOpacity(value) {
    worldCoverOpacity = Math.max(0, Math.min(1, Number(value) || 0));
    layer?.setOpacity?.(worldCoverOpacity);
    writeOverlayOpacity(WORLD_COVER_OPACITY_KEY, worldCoverOpacity);
    return worldCoverOpacity;
  }

  function getWorldCoverOpacity() { return worldCoverOpacity; }

  const WORLD_COVER_RETRY_DELAYS = [400, 900, 2000, 4000, 8000];

  const RetryingWorldCoverWms = L.TileLayer.WMS.extend({
    createTile(coords, done) {
      const tile = L.TileLayer.prototype.createTile.call(this, coords, done);
      tile._faWorldCoverUrl = tile.src;
      tile._faWorldCoverRetryCount = 0;
      tile._faWorldCoverRetryTimer = null;
      tile._faWorldCoverDisposed = false;
      tile._faWorldCoverRetryJitter = Math.abs((coords.x * 31 + coords.y * 17 + coords.z * 13) % 250);
      return tile;
    },

    _tileOnLoad(done, tile) {
      if (tile._faWorldCoverDisposed || tile.getAttribute("src") === L.Util.emptyImageUrl) return;
      if (tile._faWorldCoverRetryTimer) clearTimeout(tile._faWorldCoverRetryTimer);
      tile._faWorldCoverRetryTimer = null;
      tile._faWorldCoverRetryCount = 0;
      return L.TileLayer.prototype._tileOnLoad.call(this, done, tile);
    },

    _tileOnError(done, tile, error) {
      if (!this._map || tile._faWorldCoverDisposed || tile.getAttribute("src") === L.Util.emptyImageUrl) return;
      const retryCount = tile._faWorldCoverRetryCount || 0;
      if (retryCount >= WORLD_COVER_RETRY_DELAYS.length) {
        return L.TileLayer.prototype._tileOnError.call(this, done, tile, error);
      }
      tile._faWorldCoverRetryCount = retryCount + 1;
      const delay = WORLD_COVER_RETRY_DELAYS[retryCount] + (tile._faWorldCoverRetryJitter || 0);
      if (tile._faWorldCoverRetryTimer) clearTimeout(tile._faWorldCoverRetryTimer);
      tile._faWorldCoverRetryTimer = setTimeout(() => {
        tile._faWorldCoverRetryTimer = null;
        if (!this._map || tile._faWorldCoverDisposed || !tile.isConnected) return;
        tile.src = `${tile._faWorldCoverUrl}&_fa_retry=${tile._faWorldCoverRetryCount}`;
      }, delay);
    },

    _abortLoading() {
      for (const key in this._tiles) {
        const record = this._tiles[key];
        if (!record || record.coords.z === this._tileZoom) continue;
        const tile = record.el;
        tile._faWorldCoverDisposed = true;
        if (tile._faWorldCoverRetryTimer) clearTimeout(tile._faWorldCoverRetryTimer);
        tile._faWorldCoverRetryTimer = null;
      }
      return L.TileLayer.prototype._abortLoading.call(this);
    },

    _onTileRemove(event) {
      const tile = event?.tile;
      if (tile) {
        tile._faWorldCoverDisposed = true;
        if (tile._faWorldCoverRetryTimer) clearTimeout(tile._faWorldCoverRetryTimer);
        tile._faWorldCoverRetryTimer = null;
      }
      return L.TileLayer.prototype._onTileRemove.call(this, event);
    }
  });

  let map = null;
  let layer = null;

  const COVER_CLASSES = [
    ["Tree cover", "#006400"], ["Shrubland", "#ffbb22"],
    ["Grassland", "#ffff4c"], ["Cropland", "#f096ff"],
    ["Built-up", "#fa0000"], ["Bare / sparse vegetation", "#b4b4b4"],
    ["Snow and ice", "#f0f0f0"], ["Permanent water bodies", "#0064c8"],
    ["Herbaceous wetland", "#0096a0"], ["Mangroves", "#00cf75"],
    ["Moss and lichen", "#fae6a0"]
  ];
  let inspectorMarker = null;
  let inspectorTooltip = null;
  let inspectorAbort = null;
  let inspectorRequest = 0;

  function hideInspector() {
    inspectorRequest += 1;
    inspectorAbort?.abort();
    inspectorAbort = null;
    if (inspectorMarker && map?.hasLayer(inspectorMarker)) map.removeLayer(inspectorMarker);
    if (inspectorTooltip && map?.hasLayer(inspectorTooltip)) map.removeLayer(inspectorTooltip);
  }

  function colorClassification(pixel) {
    if (!pixel || pixel[3] < 180) return null;
    let closest = null;
    let error = Infinity;
    for (const [name, hex] of COVER_CLASSES) {
      const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      const distance = rgb.reduce((sum, v, i) => sum + (v - pixel[i]) ** 2, 0);
      if (distance < error) { closest = {name, hex}; error = distance; }
    }
    return error <= 3 * 14 ** 2 ? closest : null;
  }

  async function sampleCover(point, signal) {
    if (point.lat < -60 || point.lat > 83) return {error: "Outside the WorldCover coverage"};
    const lat = Math.max(-85, Math.min(85, point.lat));
    const projected = L.CRS.EPSG3857.project(L.latLng(lat, point.lng));
    const radius = 12 / Math.max(0.12, Math.cos(lat * Math.PI / 180));
    const params = new URLSearchParams({
      service: "WMS", request: "GetMap", version: "1.1.1", layers: LAYER_NAME,
      styles: "", format: "image/png", transparent: "true", srs: "EPSG:3857",
      bbox: [projected.x - radius, projected.y - radius, projected.x + radius, projected.y + radius].join(","),
      width: "3", height: "3"
    });
    const response = await fetch(`${WMS_URL}?${params}`, {signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.toLowerCase().includes("image/")) throw new Error("Non-image WMS response");
    const bitmap = await createImageBitmap(blob);
    try {
      if (bitmap.width !== 3 || bitmap.height !== 3) throw new Error("Unexpected WMS image size");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 3;
      const context = canvas.getContext("2d", {willReadFrequently: true});
      context.drawImage(bitmap, 0, 0);
      const pixel = context.getImageData(1, 1, 1, 1).data;
      return pixel[3] < 180 ? {error: "No WorldCover data at this location"} :
        (colorClassification(pixel) || {error: "Unrecognized land-cover pixel"});
    } finally { bitmap.close(); }
  }

  function inspectorContent(point, message, classification) {
    const coords = window.FAElevationHost?.formatCoordinates?.(point.lat, point.lng) || `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
    const category = classification ? `<span class="wc-inspector-category"><span class="wc-inspector-color" style="background:${classification.hex}"></span>${classification.name}</span>` : message;
    return `<div class="measurement-row"><span class="measurement-title">Coordinates</span><span class="measurement-value">${coords}</span></div><div class="measurement-row"><span class="measurement-title">Classification</span><span class="measurement-value">${category}</span></div>`;
  }

  async function onInspectorClick(event) {
    if (!isEnabled() || window.FAElevation?.isEnabled?.() || !event?.latlng) return;
    if (event.originalEvent?.target?.closest?.(".leaflet-marker-icon, .leaflet-interactive")) return;
    if (window.FAElevation?.isEditingOrDrawing?.() || window.FAElevationHost?.isLineMeasurementEditing?.()) return;
    const point = L.latLng(event.latlng);
    if (!inspectorMarker) {
      inspectorMarker = L.marker(point, {
        icon: L.divIcon({className: "elevation-click-dot-marker", iconSize: [14, 14], iconAnchor: [7, 7]}),
        interactive: true, bubblingMouseEvents: false, keyboard: false
      });
      inspectorMarker.options.pmIgnore = true;
      inspectorMarker.options.snapIgnore = false;
      inspectorMarker.on("click", event => {
        if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        hideInspector();
      });
    }
    if (!inspectorTooltip) inspectorTooltip = L.tooltip({
      permanent: true, direction: "top", offset: L.point(0, -7),
      className: "measurement-tooltip elevation-measurement-tooltip wc-inspector-tooltip", opacity: 1
    });
    inspectorMarker.setLatLng(point);
    if (!map.hasLayer(inspectorMarker)) inspectorMarker.addTo(map);
    inspectorTooltip.setLatLng(point).setContent(inspectorContent(point, "Loading..."));
    if (!map.hasLayer(inspectorTooltip)) inspectorTooltip.addTo(map);
    inspectorAbort?.abort();
    const controller = new AbortController();
    inspectorAbort = controller;
    const request = ++inspectorRequest;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const result = await sampleCover(point, controller.signal);
      if (request !== inspectorRequest || !isEnabled() || window.FAElevation?.isEnabled?.()) return;
      inspectorTooltip.setContent(inspectorContent(point, result.error || "", result.name ? result : null));
    } catch (error) {
      if (request !== inspectorRequest || !isEnabled() || window.FAElevation?.isEnabled?.()) return;
      inspectorTooltip.setContent(inspectorContent(point, "Classification unavailable"));
      void 0;
    } finally {
      clearTimeout(timeout);
      if (inspectorAbort === controller) inspectorAbort = null;
    }
  }


  function ensurePane() {
    if (!map || map.getPane("worldCoverPane")) return;

    const pane = map.createPane(
      "worldCoverPane",
      map._rotatePane || map.getPane("overlayPane")
    );

    pane.style.zIndex = "260";
    pane.style.pointerEvents = "none";
  }

  function ensureLayer() {
    if (!map) return null;

    ensurePane();

    if (!layer) {
      layer = new RetryingWorldCoverWms(WMS_URL, {
        layers: LAYER_NAME,
        format: "image/png",
        transparent: true,
        version: "1.1.1",
        opacity: worldCoverOpacity,
        pane: "worldCoverPane",
        noWrap: false,
        maxZoom: 24,
        maxNativeZoom: 14,
        updateWhenZooming: false,
        updateWhenIdle: true,
        keepBuffer: 3,
        attribution: "&copy; ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium"
      });
    }

    return layer;
  }

  function init(nextMap) {
    if (!nextMap) return;
    if (map && map !== nextMap) {
      map.off("click", onInspectorClick);
      hideInspector();
    }
    map = nextMap;
    ensurePane();
    map.off("click", onInspectorClick).on("click", onInspectorClick);
  }

  function isEnabled() {
    return Boolean(
      map &&
      layer &&
      map.hasLayer(layer)
    );
  }

  function setEnabled(enabled) {
    const next = ensureLayer();

    if (!next || !map) return false;

    if (enabled) {
      if (!map.hasLayer(next)) next.addTo(map);
      if (window.FAElevation?.isEnabled?.()) hideInspector();
    } else {
      hideInspector();
      if (map.hasLayer(next)) map.removeLayer(next);
    }

    return isEnabled();
  }

  function toggle() {
    return setEnabled(!isEnabled());
  }

  window.FAWorldCover = {
    init,
    toggle,
    setEnabled,
    isEnabled,
    setOpacity: setWorldCoverOpacity,
    getOpacity: getWorldCoverOpacity,
    clearInspector: hideInspector,
    isInspecting: () => isEnabled() && !window.FAElevation?.isEnabled?.()
  };
})();
