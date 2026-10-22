(() => {
  "use strict";
  function createCoreBasemaps({state, $, syncStyledRange, scheduleSettingsSave, updateZoomStatus, showToast, networkFetch}) {
  function clampSatelliteBrightness(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(1.5, Math.max(0.25, numeric)) : 1;
  }

  function applySatelliteBrightness() {
    state.satelliteBrightness = clampSatelliteBrightness(state.satelliteBrightness);
    const layer = state.baseLayers.satellite;
    const container = layer?.getContainer?.() || layer?._container;
    if (container) container.style.filter = Math.abs(state.satelliteBrightness - 1) < 0.0001 ? "" : `brightness(${state.satelliteBrightness})`;
    const quickInput = $("satellite-brightness-quick");
    const quickValue = $("satellite-brightness-quick-value");
    const quickReset = $("satellite-brightness-quick-reset");
    if (quickInput) { quickInput.value = String(Math.round(state.satelliteBrightness * 100)); syncStyledRange(quickInput); }
    if (quickValue) quickValue.textContent = `${Math.round(state.satelliteBrightness * 100)}%`;
    if (quickReset) quickReset.disabled = Math.abs(state.satelliteBrightness - 1) < 0.0001;
    const overzoom = $("satellite-raster-overzoom");
    if (overzoom) overzoom.checked = state.satelliteRasterOverzoom;
  }


  function updateSatelliteBrightnessInfo() {
    const info = $("satellite-brightness-info");
    if (!info) return;
    const visible = state.currentBaseName === "satellite";
    info.classList.toggle("hidden", !visible);
    if (!visible) {
      info.classList.remove("legend-pinned");
      $("satellite-brightness-info-button")?.setAttribute("aria-expanded", "false");
      return;
    }
    applySatelliteBrightness();
  }

  function applyOsmBrightness() {
    state.osmBrightness = clampSatelliteBrightness(state.osmBrightness);
    const layer = state.baseLayers.osm;
    const container = layer?.getContainer?.() || layer?._container;
    if (container) container.style.filter = Math.abs(state.osmBrightness - 1) < 0.0001 ? "" : `brightness(${state.osmBrightness})`;
    const input = $("osm-brightness-quick");
    const value = $("osm-brightness-quick-value");
    const reset = $("osm-brightness-quick-reset");
    if (input) { input.value = String(Math.round(state.osmBrightness * 100)); syncStyledRange(input); }
    if (value) value.textContent = `${Math.round(state.osmBrightness * 100)}%`;
    if (reset) reset.disabled = Math.abs(state.osmBrightness - 1) < 0.0001;
    const overzoom = $("osm-raster-overzoom");
    if (overzoom) overzoom.checked = state.osmRasterOverzoom;
  }

  function updateOsmBrightnessInfo() {
    const info = $("osm-brightness-info");
    if (!info) return;
    const visible = state.currentBaseName === "osm";
    info.classList.toggle("hidden", !visible);
    if (!visible) {
      info.classList.remove("legend-pinned");
      $("osm-brightness-info-button")?.setAttribute("aria-expanded", "false");
      return;
    }
    applyOsmBrightness();
  }

  function createOsmBaseLayer() {
    // The OSM Foundation's standard raster server needs an HTTP Referer, which a
    // directly opened file:// page cannot provide. Use an OSM-based street layer
    // from OpenStreetMap Germany for file:// use (noncommercial, modest traffic).
    // Ordinary HTTP(S) deployments retain the standard OpenStreetMap raster layer.
    // Neither provider is guaranteed to serve requests indefinitely. No proxy,
    // fake Referer, impersonation, or other workaround is used.
    const fromFile = location.protocol === "file:";
    const tileUrl = fromFile
      ? "https://tile.openstreetmap.de/{z}/{x}/{y}.png"
      : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
    return L.tileLayer(tileUrl, {
      maxZoom: state.osmRasterOverzoom ? 24 : 19,
      ...(state.osmRasterOverzoom ? {maxNativeZoom: 19} : {}),
      noWrap: false,
      ...(fromFile ? {} : {referrerPolicy: "strict-origin-when-cross-origin"}),
      attribution: osmAttribution
    });
  }

  function rebuildOsmBaseLayer() {
    if (!state.map) return;
    const previous = state.baseLayers.osm;
    const active = state.currentBaseName === "osm";
    if (active && previous && state.map.hasLayer(previous)) state.map.removeLayer(previous);
    const replacement = createOsmBaseLayer();
    state.baseLayers.osm = replacement;
    if (active) {
      state.currentBase = replacement.addTo(state.map);
      replacement.bringToBack?.();
    }
    applyOsmBrightness();
  }

  function setOsmRasterOverzoom(enabled) {
    const next = Boolean(enabled);
    if (state.osmRasterOverzoom === next) return;
    state.osmRasterOverzoom = next;
    rebuildOsmBaseLayer();
    updateRasterOverzoomNotice();
    scheduleSettingsSave();
  }

  let rasterOverzoomNoticeKey = "";
  const satelliteTileAvailabilityCache = new Map();
  const SATELLITE_TILE_AVAILABILITY_CACHE_MAX = 8192;
  const SATELLITE_TILEMAP_BLOCK_SIZE = 8;
  let satelliteNativeZoomCheckTimer = null;
  let satelliteNativeZoomAbortController = null;
  let satelliteNativeZoomCheckSerial = 0;

  function updateRasterOverzoomNotice() {
    updateZoomStatus();
    if (!state.map) return;
    const zoom = Number(state.map.getZoom());
    let key = "";
    if (state.currentBaseName === "satellite" && state.satelliteRasterOverzoom) {
      const layer = state.baseLayers.satellite;
      const nativeMaxZoom = Number(layer?._faNativeMaxZoom ?? satelliteNativeMaxZoom());
      if (Number.isFinite(zoom) && Number.isFinite(nativeMaxZoom) && zoom > nativeMaxZoom) key = `satellite:${nativeMaxZoom}`;
    } else if (state.currentBaseName === "osm" && state.osmRasterOverzoom) {
      if (Number.isFinite(zoom) && zoom > 19) key = "osm:19";
    }
    if (key && key !== rasterOverzoomNoticeKey && !Array.from($("toast-stack")?.children || []).some(toast => toast.textContent === "Raster overzoom.")) showToast("Raster overzoom.", "info");
    rasterOverzoomNoticeKey = key;
  }

  function satelliteNativeMaxZoom() {
    const configured = Number(state.config?.satellite?.maxZoom);
    return Number.isFinite(configured) && configured > 0 ? configured : 19;
  }

  function satelliteTilemapInfo() {
    const satellite = state.config?.satellite || {};
    const value = String(satellite.url || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}");
    const marker = "/tile/{z}/{y}/{x}";
    const markerIndex = value.toLowerCase().indexOf(marker);
    if (markerIndex < 0) return null;
    const root = value.slice(0, markerIndex);
    const suffix = value.slice(markerIndex + marker.length);
    const queryString = suffix.startsWith("?") ? suffix.slice(1) : "";
    const query = queryString.split("&").filter(part => {
      if (!part) return false;
      const key = part.split("=", 1)[0].toLowerCase();
      return key !== "blanktile" && key !== "f";
    });
    return {root, query, cachePrefix: `${root}?${query.join("&")}`};
  }

  function satelliteAvailabilityCacheKey(info, zoom, x, y) {
    return `${info.cachePrefix}|${zoom}/${x}/${y}`;
  }

  function getSatelliteTileAvailability(info, zoom, x, y) {
    const key = satelliteAvailabilityCacheKey(info, zoom, x, y);
    if (!satelliteTileAvailabilityCache.has(key)) return undefined;
    const value = satelliteTileAvailabilityCache.get(key);
    satelliteTileAvailabilityCache.delete(key);
    satelliteTileAvailabilityCache.set(key, value);
    return value;
  }

  function setSatelliteTileAvailability(info, zoom, x, y, available) {
    const key = satelliteAvailabilityCacheKey(info, zoom, x, y);
    satelliteTileAvailabilityCache.delete(key);
    satelliteTileAvailabilityCache.set(key, Boolean(available));
    while (satelliteTileAvailabilityCache.size > SATELLITE_TILE_AVAILABILITY_CACHE_MAX) {
      const oldest = satelliteTileAvailabilityCache.keys().next().value;
      if (oldest == null) break;
      satelliteTileAvailabilityCache.delete(oldest);
    }
  }

  function satelliteVisibleTileRange(zoom) {
    if (!state.map || !Number.isFinite(zoom) || zoom < 0) return null;
    const size = state.map.getSize();
    if (!size || size.x <= 0 || size.y <= 0) return null;

    const mapContainer = state.map.getContainer();
    const mapRect = mapContainer.getBoundingClientRect();
    const sidebar = document.querySelector(".sidebar");
    const app = $("app");
    const sidebarExpanded = window.innerWidth > 760 && sidebar && app && !app.classList.contains("sidebar-collapsed");
    const sidebarRect = sidebarExpanded ? sidebar.getBoundingClientRect() : null;
    const left = sidebarRect ? Math.max(0, Math.min(size.x, sidebarRect.right - mapRect.left)) : 0;
    const right = Math.max(left, size.x - 0.001);
    const bottom = Math.max(0, size.y - 0.001);
    const points = [
      L.point(left, 0),
      L.point(right, 0),
      L.point(right, bottom),
      L.point(left, bottom)
    ];

    const span = Math.pow(2, zoom);
    const centerTileX = state.map.project(state.map.getCenter(), zoom).x / 256;
    let minTileX = Infinity;
    let maxTileX = -Infinity;
    let minTileY = Infinity;
    let maxTileY = -Infinity;

    for (const point of points) {
      const latlng = state.map.containerPointToLatLng(point);
      const projected = state.map.project(latlng, zoom);
      let tileX = projected.x / 256;
      tileX += Math.round((centerTileX - tileX) / span) * span;
      const tileY = projected.y / 256;
      minTileX = Math.min(minTileX, tileX);
      maxTileX = Math.max(maxTileX, tileX);
      minTileY = Math.min(minTileY, tileY);
      maxTileY = Math.max(maxTileY, tileY);
    }

    if (![minTileX, maxTileX, minTileY, maxTileY].every(Number.isFinite)) return null;
    const minX = Math.floor(minTileX);
    const maxX = Math.floor(maxTileX);
    const minY = Math.max(0, Math.floor(minTileY));
    const maxY = Math.min(span - 1, Math.floor(maxTileY));
    if (maxX < minX || maxY < minY) return null;
    return {minX, maxX, minY, maxY, span};
  }

  async function querySatelliteTilemapBlock(info, zoom, x, y, width, height, signal) {
    const params = [...info.query, "f=json"].join("&");
    const url = `${info.root}/tilemap/${zoom}/${y}/${x}/${width}/${height}?${params}`;
    let response;
    let data;
    try {
      response = await networkFetch(url, {cache: "force-cache", signal}, {timeoutMs: 15000, retries: 1, label: "Satellite tile availability"});
      data = await response.json().catch(() => null);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return false;
    }

    if (Number(data?.error?.code) === 422) {
      for (let row = y; row < y + height; row += 1) {
        for (let column = x; column < x + width; column += 1) {
          setSatelliteTileAvailability(info, zoom, column, row, false);
        }
      }
      return true;
    }
    if (!response.ok || data?.error || !Array.isArray(data?.data) || !data?.location) return false;

    const left = Number(data.location.left);
    const top = Number(data.location.top);
    const actualWidth = Number(data.location.width);
    const actualHeight = Number(data.location.height);
    if (![left, top, actualWidth, actualHeight].every(Number.isFinite) || actualWidth <= 0 || actualHeight <= 0) return false;
    if (data.data.length < actualWidth * actualHeight) return false;

    for (let row = 0; row < actualHeight; row += 1) {
      for (let column = 0; column < actualWidth; column += 1) {
        setSatelliteTileAvailability(info, zoom, left + column, top + row, Number(data.data[row * actualWidth + column]) === 1);
      }
    }
    return true;
  }

  async function satelliteViewportLevelAvailable(info, zoom, signal) {
    const range = satelliteVisibleTileRange(zoom);
    if (!range) return null;
    const tileCount = (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
    if (!Number.isFinite(tileCount) || tileCount <= 0 || tileCount > 2048) return null;

    for (let rawY = range.minY; rawY <= range.maxY; rawY += 1) {
      let rawX = range.minX;
      while (rawX <= range.maxX) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const normalizedX = ((rawX % range.span) + range.span) % range.span;
        const cached = getSatelliteTileAvailability(info, zoom, normalizedX, rawY);
        if (cached === false) return false;
        if (cached === true) {
          rawX += 1;
          continue;
        }

        const width = Math.max(1, Math.min(SATELLITE_TILEMAP_BLOCK_SIZE, range.maxX - rawX + 1, range.span - normalizedX));
        const height = Math.max(1, Math.min(SATELLITE_TILEMAP_BLOCK_SIZE, range.maxY - rawY + 1));
        const queried = await querySatelliteTilemapBlock(info, zoom, normalizedX, rawY, width, height, signal);
        if (!queried) return null;
        const resolved = getSatelliteTileAvailability(info, zoom, normalizedX, rawY);
        if (resolved === undefined) return null;
      }
    }
    return true;
  }

  function applySatelliteEffectiveNativeMaxZoom(level) {
    const layer = state.baseLayers.satellite;
    if (!layer || !state.satelliteRasterOverzoom) return;
    const configuredMax = satelliteNativeMaxZoom();
    const next = Math.max(0, Math.min(configuredMax, Math.floor(Number(level))));
    if (!Number.isFinite(next)) return;
    const previousRaw = Number(layer._faNativeMaxZoom);
    const previous = Number.isFinite(previousRaw) ? previousRaw : configuredMax;
    if (next === previous) return;

    layer.options.maxNativeZoom = next;
    layer._faNativeMaxZoom = next;
    layer._faMaxZoomNoticeActive = false;
    updateRasterOverzoomNotice();

    const mapZoom = Number(state.map?.getZoom?.());
    if (state.currentBaseName !== "satellite" || !state.map?.hasLayer?.(layer) || !Number.isFinite(mapZoom) || mapZoom <= Math.min(previous, next)) return;
    if (typeof layer._setView === "function") layer._setView(state.map.getCenter(), mapZoom, false, false);
    else layer.redraw?.();
  }

  function cancelSatelliteNativeZoomDetection() {
    satelliteNativeZoomCheckSerial += 1;
    if (satelliteNativeZoomCheckTimer !== null) clearTimeout(satelliteNativeZoomCheckTimer);
    satelliteNativeZoomCheckTimer = null;
    if (satelliteNativeZoomAbortController) satelliteNativeZoomAbortController.abort();
    satelliteNativeZoomAbortController = null;
  }

  async function detectSatelliteNativeZoom(serial) {
    if (!state.map || state.currentBaseName !== "satellite" || !state.satelliteRasterOverzoom) return;
    if (serial !== satelliteNativeZoomCheckSerial) return;
    const layer = state.baseLayers.satellite;
    const info = satelliteTilemapInfo();
    if (!layer || !info) return;

    const configuredMax = satelliteNativeMaxZoom();
    const mapZoom = Math.floor(Number(state.map.getZoom()));
    if (!Number.isFinite(mapZoom) || mapZoom < Math.max(0, configuredMax - 4)) return;
    const topLevel = mapZoom >= configuredMax ? configuredMax : Math.min(configuredMax, mapZoom + 2);

    const controller = new AbortController();
    satelliteNativeZoomAbortController = controller;
    try {
      const topAvailable = await satelliteViewportLevelAvailable(info, topLevel, controller.signal);
      if (topAvailable == null || controller.signal.aborted || serial !== satelliteNativeZoomCheckSerial) return;

      let detectedLevel = topLevel;
      if (!topAvailable) {
        detectedLevel = -1;
        for (let level = topLevel - 1; level >= 0; level -= 1) {
          const available = await satelliteViewportLevelAvailable(info, level, controller.signal);
          if (available == null || controller.signal.aborted || serial !== satelliteNativeZoomCheckSerial) return;
          if (available) {
            detectedLevel = level;
            break;
          }
        }
        if (detectedLevel < 0) return;
      }

      const currentRaw = Number(layer._faNativeMaxZoom);
      const current = Number.isFinite(currentRaw) ? currentRaw : configuredMax;
      const next = topAvailable ? Math.max(current, detectedLevel) : detectedLevel;
      applySatelliteEffectiveNativeMaxZoom(next);
    } catch (error) {
      if (error?.name !== "AbortError") return;
    } finally {
      if (satelliteNativeZoomAbortController === controller) satelliteNativeZoomAbortController = null;
    }
  }

  function scheduleSatelliteNativeZoomDetection(delay = 90) {
    if (!state.map || state.currentBaseName !== "satellite" || !state.satelliteRasterOverzoom) {
      cancelSatelliteNativeZoomDetection();
      return;
    }
    if (!satelliteTilemapInfo()) return;
    satelliteNativeZoomCheckSerial += 1;
    const serial = satelliteNativeZoomCheckSerial;
    if (satelliteNativeZoomCheckTimer !== null) clearTimeout(satelliteNativeZoomCheckTimer);
    if (satelliteNativeZoomAbortController) satelliteNativeZoomAbortController.abort();
    satelliteNativeZoomAbortController = null;
    satelliteNativeZoomCheckTimer = setTimeout(() => {
      satelliteNativeZoomCheckTimer = null;
      detectSatelliteNativeZoom(serial);
    }, Math.max(0, Number(delay) || 0));
  }

  function createSatelliteBaseLayer() {
    const satellite = state.config.satellite || {};
    const satelliteUrl = satellite.url || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    const tileUrl = state.blackUnavailableSatelliteTiles ? `${satelliteUrl}${satelliteUrl.includes("?") ? "&" : "?"}blankTile=false` : satelliteUrl;
    const nativeMaxZoom = satelliteNativeMaxZoom();
    const layer = L.tileLayer(tileUrl, {
      maxZoom: Math.max(nativeMaxZoom, 24),
      ...(state.satelliteRasterOverzoom ? {maxNativeZoom: nativeMaxZoom} : {}),
      errorTileUrl: state.blackUnavailableSatelliteTiles ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg5+cHAABeAC5T8sYiAAAAAElFTkSuQmCC" : null,
      noWrap: false,
      attribution: satellite.attribution || "Satellite imagery"
    });
    layer._faNativeMaxZoom = nativeMaxZoom;
    layer._faMaxZoomNoticeActive = false;
    layer.on("tileerror", () => {
      const zoom = state.map?.getZoom?.();
      if (state.satelliteRasterOverzoom) {
        scheduleSatelliteNativeZoomDetection(0);
        return;
      }
      if (!state.blackUnavailableSatelliteTiles || !Number.isFinite(zoom) || zoom <= nativeMaxZoom || layer._faMaxZoomNoticeActive) return;
      layer._faMaxZoomNoticeActive = true;
      showToast("Max zoom reached.", "info");
    });
    return layer;
  }

  function rebuildSatelliteBaseLayer() {
    if (!state.map) return;
    cancelSatelliteNativeZoomDetection();
    const previous = state.baseLayers.satellite;
    const active = state.currentBaseName === "satellite";
    if (active && previous && state.map.hasLayer(previous)) state.map.removeLayer(previous);
    const replacement = createSatelliteBaseLayer();
    state.baseLayers.satellite = replacement;
    if (active) {
      state.currentBase = replacement.addTo(state.map);
      replacement.bringToBack?.();
      if (state.satelliteRasterOverzoom) scheduleSatelliteNativeZoomDetection(0);
    }
    applySatelliteBrightness();
  }

  function setSatelliteRasterOverzoom(enabled) {
    const next = Boolean(enabled);
    if (state.satelliteRasterOverzoom === next) return;
    state.satelliteRasterOverzoom = next;
    rebuildSatelliteBaseLayer();
    updateRasterOverzoomNotice();
    scheduleSettingsSave();
  }

  function applyUnavailableSatelliteTileSetting() {
    const layer = state.baseLayers.satellite;
    if (!layer) return;
    const satellite = state.config.satellite || {};
    const satelliteUrl = satellite.url || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    const tileUrl = state.blackUnavailableSatelliteTiles ? `${satelliteUrl}${satelliteUrl.includes("?") ? "&" : "?"}blankTile=false` : satelliteUrl;
    layer.options.errorTileUrl = state.blackUnavailableSatelliteTiles ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg5+cHAABeAC5T8sYiAAAAAElFTkSuQmCC" : null;
    layer.setUrl(tileUrl);
  }

    return {clampSatelliteBrightness, applySatelliteBrightness, updateSatelliteBrightnessInfo, applyOsmBrightness, updateOsmBrightnessInfo, createOsmBaseLayer, setOsmRasterOverzoom, updateRasterOverzoomNotice, satelliteNativeMaxZoom, cancelSatelliteNativeZoomDetection, scheduleSatelliteNativeZoomDetection, createSatelliteBaseLayer, setSatelliteRasterOverzoom, applyUnavailableSatelliteTileSetting};
  }
  function createCoreNavigation({state, $, showToast}) {
  function normalizeViewBearing(value) {
    const bearing = Number(value) || 0;
    return ((bearing % 360) + 360) % 360;
  }

  function beginViewBearingReadoutEdit() {
    const input = $("view-bearing-readout");
    if (!input || !state.viewBearingReadout) return;
    input.dataset.editing = "true";
    input.value = String(Math.round(normalizeViewBearing(state.viewBearing)));
  }

  function finishViewBearingReadoutEdit(commit = true) {
    const input = $("view-bearing-readout");
    if (!input || input.dataset.editing !== "true") {
      updateViewCompass();
      return;
    }
    const raw = input.value.trim().replace(String.fromCharCode(176), "");
    delete input.dataset.editing;
    if (commit) {
      const requested = Number(raw);
      if (Number.isFinite(requested)) {
        cancelViewBearingAnimation();
        stopMapMotionForRotation();
        state.viewBearing = normalizeViewBearing(requested);
        applyViewOrientation();
        input.value = `${Math.round(state.viewBearing)}${String.fromCharCode(176)}`;
        return;
      }
      showToast("Enter a numeric bearing.");
    }
    input.value = `${Math.round(normalizeViewBearing(state.viewBearing))}${String.fromCharCode(176)}`;
    updateViewCompass();
  }

  function updateViewCompass() {
    const button = $("view-compass");
    const needle = $("view-compass-needle");
    const readout = $("view-bearing-readout");
    if (!button || !needle) return;
    const bearing = normalizeViewBearing(state.viewBearing);
    const rotated = Math.min(bearing, 360 - bearing) > 0.1;
    state.map?.getContainer?.()?.classList.toggle("map-bearing-rotated", rotated);
    button.classList.toggle("is-visible", rotated);
    if (readout) {
      const readoutVisible = rotated && state.viewBearingReadout;
      if (document.activeElement !== readout) {
        readout.value = `${Math.round(bearing)}${String.fromCharCode(176)}`;
      }
      readout.classList.toggle("is-visible", readoutVisible);
      readout.setAttribute("aria-hidden", readoutVisible ? "false" : "true");
    }
    needle.style.transform = `rotate(${-bearing}deg)`;
    button.title = `Bearing ${bearing.toFixed(1)} degrees. Click to reset north.`;
  }

  function applyViewOrientation() {
    if (state.map?._animatingZoom) state.map._onZoomTransitionEnd?.();
    state.viewBearing = normalizeViewBearing(state.viewBearing);
    if (state.map && typeof state.map.setBearing === "function") state.map.setBearing(state.viewBearing);
    updateViewCompass();
  }

  function cancelViewBearingAnimation() {
    if (state.viewBearingAnimation !== null) {
      cancelAnimationFrame(state.viewBearingAnimation);
      state.viewBearingAnimation = null;
    }
  }

  function stopMapMotionForRotation() {
    const map = state.map;
    if (!map || typeof map.stop !== "function") return;
    if (map._animatingZoom && typeof map._onZoomTransitionEnd === "function") map._onZoomTransitionEnd();
    try { map.stop(); } catch (_) {}
  }

  function resetViewOrientation() {
    cancelViewBearingAnimation();
    stopMapMotionForRotation();
    const startBearing = normalizeViewBearing(
      state.map && typeof state.map.getBearing === "function" ? state.map.getBearing() : state.viewBearing
    );
    const shortestDistance = Math.min(startBearing, 360 - startBearing);
    if (shortestDistance <= 0.1) {
      state.viewBearing = 0;
      applyViewOrientation();
      return;
    }

    if (!state.northResetAnimation) {
      resetViewOrientationInstant();
      return;
    }
    const delta = startBearing > 180 ? 360 - startBearing : -startBearing;
    const duration = 180;
    const startedAt = performance.now();
    const animate = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      state.viewBearing = normalizeViewBearing(startBearing + delta * eased);
      applyViewOrientation();
      if (progress < 1) {
        state.viewBearingAnimation = requestAnimationFrame(animate);
      } else {
        state.viewBearingAnimation = null;
        state.viewBearing = 0;
        applyViewOrientation();
      }
    };
    state.viewBearingAnimation = requestAnimationFrame(animate);
  }

  function resetViewOrientationInstant() {
    cancelViewBearingAnimation();
    stopMapMotionForRotation();
    state.viewBearing = 0;
    applyViewOrientation();
  }

  function moveMiddleViewGesture(event) {
    const gesture = state.middleViewGesture;
    if (!gesture) return;
    event.preventDefault();
    if (state.shapeConversion) {
      showToast("Finish or cancel shape conversion first.");
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) > 3) {
      gesture.moved = true;
      stopMapMotionForRotation();
    }
    if (!gesture.moved) return;
    state.pendingMiddleViewBearing = normalizeViewBearing(gesture.startBearing + dx * 0.35);
    if (state.middleViewBearingFrame === null) {
      state.middleViewBearingFrame = requestAnimationFrame(() => {
        state.middleViewBearingFrame = null;
        if (state.pendingMiddleViewBearing === null) return;
        state.viewBearing = state.pendingMiddleViewBearing;
        state.pendingMiddleViewBearing = null;
        applyViewOrientation();
      });
    }
  }

  function finishMiddleViewGesture(event) {
    const gesture = state.middleViewGesture;
    if (!gesture || event.button !== 1) return;
    event.preventDefault();
    if (state.shapeConversion) {
      showToast("Finish or cancel shape conversion first.");
      return;
    }
    event.stopPropagation();
    state.middleViewGesture = null;
    if (state.middleViewBearingFrame !== null) {
      cancelAnimationFrame(state.middleViewBearingFrame);
      state.middleViewBearingFrame = null;
    }
    if (state.pendingMiddleViewBearing !== null) {
      state.viewBearing = state.pendingMiddleViewBearing;
      state.pendingMiddleViewBearing = null;
      applyViewOrientation();
    }
    document.body.classList.remove("view-orientation-dragging");
    document.removeEventListener("mousemove", moveMiddleViewGesture, true);
    document.removeEventListener("mouseup", finishMiddleViewGesture, true);
    if (!gesture.moved) resetViewOrientation();
  }

  function startMiddleViewGesture(event) {
    if (event.button !== 1 || !state.map || event.target?.closest?.(".leaflet-tooltip a[href], .leaflet-popup a[href]")) return;
    event.preventDefault();
    if (state.shapeConversion) {
      showToast("Finish or cancel shape conversion first.");
      return;
    }
    event.stopPropagation();
    cancelViewBearingAnimation();
    stopMapMotionForRotation();
    const currentBearing = typeof state.map.getBearing === "function" ? state.map.getBearing() : state.viewBearing;
    state.viewBearing = normalizeViewBearing(currentBearing);
    state.middleViewGesture = {
      startX: event.clientX,
      startY: event.clientY,
      startBearing: state.viewBearing,
      moved: false
    };
    document.body.classList.add("view-orientation-dragging");
    document.addEventListener("mousemove", moveMiddleViewGesture, true);
    document.addEventListener("mouseup", finishMiddleViewGesture, true);
  }

  function installMiddleViewGesture() {
    const container = state.map && state.map.getContainer();
    if (!container) return;
    container.addEventListener("mousedown", startMiddleViewGesture, true);
    container.addEventListener("auxclick", event => {
      if (event.button === 1 && !event.target?.closest?.(".leaflet-tooltip a[href], .leaflet-popup a[href]")) event.preventDefault();
    }, true);
  }

  const mapViewStorageKey = "project-tracker-map-view";
  let mapViewSaveTimer = null;

  function scheduleMapViewSave() {
    if (mapViewSaveTimer !== null) clearTimeout(mapViewSaveTimer);
    mapViewSaveTimer = setTimeout(() => {
      mapViewSaveTimer = null;
      saveMapView();
    }, 180);
  }

  window.addEventListener("pagehide", () => {
    if (mapViewSaveTimer !== null) {
      clearTimeout(mapViewSaveTimer);
      mapViewSaveTimer = null;
    }
    saveMapView();
  });

  function loadSavedMapView() {
    try {
      const saved = JSON.parse(localStorage.getItem(mapViewStorageKey));
      const lat = Number(saved?.lat);
      const lon = Number(saved?.lon);
      const zoom = Number(saved?.zoom);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(zoom)) return null;
      if (Math.abs(lat) > 85.05112878 || Math.abs(lon) > 180) return null;
      return {lat, lon, zoom, bearing: normalizeViewBearing(saved?.bearing), anchor: saved?.anchor === "crosshair" ? "crosshair" : "map"};
    } catch {
      return null;
    }
  }

  function saveMapView() {
    if (!state.map) return;
    try {
      const center = state.followScreenCenter ? (visibleMapCenterLatLng() || state.map.getCenter()) : state.map.getCenter();
      localStorage.setItem(mapViewStorageKey, JSON.stringify({
        lat: center.lat,
        lon: center.lng,
        zoom: state.map.getZoom(),
        bearing: normalizeViewBearing(typeof state.map.getBearing === "function" ? state.map.getBearing() : state.viewBearing),
        anchor: state.followScreenCenter ? "crosshair" : "map"
      }));
    } catch {}
  }

  function mapNavigationCenter(center, zoom) {
    const target = L.latLng(center);
    const targetZoom = Number(zoom);
    if (!state.followScreenCenter || !state.map) return target;
    const container = state.map.getContainer?.();
    const crosshair = $("map-center-crosshair");
    if (!container || !crosshair) return target;
    const mapRect = container.getBoundingClientRect();
    const crosshairRect = crosshair.getBoundingClientRect();
    const desired = L.point(crosshairRect.left + crosshairRect.width / 2 - mapRect.left, crosshairRect.top + crosshairRect.height / 2 - mapRect.top);
    const mapCenter = state.map.getSize().divideBy(2);
    const mirrored = L.point(mapCenter.x * 2 - desired.x, mapCenter.y * 2 - desired.y);
    const currentZoom = state.map.getZoom();
    const centerLatLng = state.map.containerPointToLatLng(mapCenter);
    const mirroredLatLng = state.map.containerPointToLatLng(mirrored);
    const pixelOffset = state.map.project(mirroredLatLng, currentZoom).subtract(state.map.project(centerLatLng, currentZoom));
    return state.map.unproject(state.map.project(target, targetZoom).add(pixelOffset), targetZoom);
  }

  function navigateMap(center, options = {}) {
    if (!state.map || !center) return false;
    const targetZoom = Number(options.zoom ?? state.map.getZoom());
    if (!Number.isFinite(targetZoom)) return false;
    const targetCenter = options.crosshairAware === false ? L.latLng(center) : mapNavigationCenter(center, targetZoom);
    if (typeof options.animate === "boolean") state.map.setView(targetCenter, targetZoom, {animate: options.animate});
    else state.map.setView(targetCenter, targetZoom);
    return true;
  }

  function mapNavigationWillAnimate(center, zoom) {
    const map = state.map;
    if (!map || !map._loaded || typeof map._getCenterOffset !== "function") return false;
    const target = mapNavigationCenter(center, zoom);
    const targetZoom = typeof map._limitZoom === "function" ? map._limitZoom(zoom) : zoom;

    if (map.getZoom() !== targetZoom) {
      if (!map._zoomAnimated) return false;
      if (typeof map._nothingToAnimate === "function" && map._nothingToAnimate()) return false;
      if (Math.abs(targetZoom - map.getZoom()) > map.options.zoomAnimationThreshold) return false;
      const scale = map.getZoomScale(targetZoom);
      if (!Number.isFinite(scale) || scale === 1) return false;
      const offset = map._getCenterOffset(target)._divideBy(1 - 1 / scale);
      return map.getSize().contains(offset);
    }

    return map.getSize().contains(map._getCenterOffset(target)._trunc());
  }

  function visibleMapCenterLatLng() {
    if (!state.map) return null;
    const container = state.map.getContainer?.();
    const crosshair = $("map-center-crosshair");
    if (!container || !crosshair) return state.map.getCenter();
    const mapRect = container.getBoundingClientRect();
    const crosshairRect = crosshair.getBoundingClientRect();
    const x = crosshairRect.left + crosshairRect.width / 2 - mapRect.left;
    const y = crosshairRect.top + crosshairRect.height / 2 - mapRect.top;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return state.map.getCenter();
    return state.map.containerPointToLatLng(L.point(x, y));
  }

    return {normalizeViewBearing, beginViewBearingReadoutEdit, finishViewBearingReadoutEdit, updateViewCompass, applyViewOrientation, resetViewOrientation, resetViewOrientationInstant, installMiddleViewGesture, scheduleMapViewSave, loadSavedMapView, saveMapView, mapNavigationCenter, navigateMap, mapNavigationWillAnimate, visibleMapCenterLatLng};
  }
  function createCoreMap({state, start, normalizeViewBearing, installSingleTransientTooltipPolicy}) {
    state.viewBearing = normalizeViewBearing(start.bearing);
    const worldBounds = L.latLngBounds([[-85.05112878, -180], [85.05112878, 180]]);
    const horizontalPanBounds = L.latLngBounds([[-85.05112878, -1000000], [85.05112878, 1000000]]);
    state.map = L.map("map", {
      attributionControl: false,
      zoomControl: false,
      maxBounds: horizontalPanBounds,
      maxBoundsViscosity: 1.0,
      rotate: true,
      bearing: state.viewBearing,
      dragRotate: false,
      shiftKeyRotate: false,
      boxZoom: false,
      touchRotate: false,
      rotateControl: false
    }).setView([start.lat, start.lon], start.zoom);
    // Remove Leaflet's default self-promotional prefix, retaining the attribution
    // that map-data and imagery providers require for the layers currently shown.
    state.map.attributionControl?.setPrefix(false);
    state.map.attributionControl?.setPosition("bottomleft");
    if (state.closeSatelliteBrightnessInfo) state.map.on("movestart", state.closeSatelliteBrightnessInfo);
    if (state.closeOsmBrightnessInfo) state.map.on("movestart", state.closeOsmBrightnessInfo);
    installSingleTransientTooltipPolicy();
    if (state.optimizedRendering) {
      // Screen-aligned SVG: one real Leaflet path per geometry layer.
      function installPmdScreenRenderer(map) {
        const originalClip = L.Polyline.prototype._clipPoints;
        const originalPolyClip = L.Polygon.prototype._clipPoints;
        const ScreenSVG = L.SVG.extend({
          onAdd() {
            L.SVG.prototype.onAdd.call(this,this._map);
            this._container.style.overflow = 'visible';
            this._map.on('rotate', this._onBearing, this);
if (this.options.pane === 'fa-native-queryExtentPane') this._map.on('move', this._onBearing, this);
          },
          onRemove() {
            this._map.off('rotate', this._onBearing, this);
if (this.options.pane === 'fa-native-queryExtentPane') this._map.off('move', this._onBearing, this);
            if (this._bearingFrame) cancelAnimationFrame(this._bearingFrame);
            L.SVG.prototype.onRemove.call(this);
          },
          _onZoomEnd() {
            L.Renderer.prototype._onZoomEnd.call(this);
            this._update();
            this._updatePaths();
          },
          _onBearing() {
            if (this._bearingFrame) return;
            this._bearingFrame = requestAnimationFrame(() => {
              this._bearingFrame = null;
              if (this._map) this._updatePaths();
            });
          },
          _update() {
            if (this._map._animatingZoom && this._bounds) return;
            const map = this._map, pos = map._getMapPanePos(), size = map.getSize();
            const start = L.point(-pos.x, -pos.y);
            this._bounds = L.bounds(start, start.add(size));
            this._center = map.getCenter();
            this._zoom = map.getZoom();
            const svg = this._container;
            svg.setAttribute('width',size.x);
            svg.setAttribute('height',size.y);
            L.DomUtil.setPosition(svg,start);
            svg.setAttribute('viewBox', `${start.x} ${start.y} ${size.x} ${size.y}`);
            svg.style.overflow='visible';
            this.fire('update');
          },
          _updateTransform(center,zoom) {
            if (!this._map || !this._bounds) return;
            const map=this._map, scale=map.getZoomScale(zoom,this._zoom);
            const d=map.project(this._center,zoom).subtract(map.project(center,zoom));
            const shifted=d.rotate((map.getBearing?.() || 0)*Math.PI/180);
            const target=map.getSize().divideBy(2).add(shifted);
            const panePos=map._getMapPanePos();
            const old=map.latLngToContainerPoint(this._center).subtract(panePos);
            const offs=target.subtract(panePos).subtract(old.multiplyBy(scale)).add(this._bounds.min.multiplyBy(scale));
            L.DomUtil.setTransform(this._container,offs,scale);
          },
          _screenPoint(point) {
            return this._map.layerPointToContainerPoint(point).subtract(this._map._getMapPanePos());
          },
          _initPath(layer) {
            L.SVG.prototype._initPath.call(this, layer);
            layer._path.style.pointerEvents = layer.options.interactive ? 'visiblePainted' : 'none';
          },
          _updatePoly(layer, closed) {
            // Query outline only: clip its dashed edges to a buffered viewport.
            if (layer._faOverpassExtent) {
              const pos = this._map._getMapPanePos(), size = this._map.getSize();
              const pad = Math.max(256, Math.min(768, Math.max(size.x, size.y) / 2));
              const bounds = L.bounds(L.point(-pos.x - pad, -pos.y - pad), L.point(-pos.x + size.x + pad, -pos.y + size.y + pad));
              const parts = [];
              for (const ring of layer._parts || []) {
                const points = ring.map(point => this._screenPoint(point));
                for (let i = 0; i < points.length; i++) {
                  const segment = L.LineUtil.clipSegment(points[i], points[(i + 1) % points.length], bounds);
                  if (segment) parts.push(segment);
                }
              }
              return this._setPath(layer, L.SVG.pointsToPath(parts, false));
            }
            const parts=(layer._parts || []).map(part=>part.map(point=>this._screenPoint(point)));
            this._setPath(layer,L.SVG.pointsToPath(parts,closed));
          },
          _updateCircle(layer) {
            const center=layer._point;
            if (!center) return this._setPath(layer,'M0 0');
            const rx=Math.max(Math.round(layer._radius),1);
            const ry=Math.max(Math.round(layer._radiusY ?? layer._radius),1);
            const c=this._screenPoint(center);
            const right=this._screenPoint(center.add([rx,0]));
            const left=this._screenPoint(center.subtract([rx,0]));
            const up=this._screenPoint(center.add([0,ry]));
            const a=c.distanceTo(right), b=c.distanceTo(up);
            const angle=Math.atan2(right.y-c.y,right.x-c.x)*180/Math.PI;
            this._setPath(layer,`M${right.x},${right.y} A${a},${b} ${angle} 0 1 ${left.x},${left.y} A${a},${b} ${angle} 0 1 ${right.x},${right.y} Z`);
          }
        });
        // Compatibility mode retains Leaflet's built-in clipping.
        L.Polyline.prototype._clipPoints = function() {
          if (this._renderer instanceof ScreenSVG) { this._parts=this._rings.map(ring=>ring.slice()); return; }
          return originalClip.call(this);
        };
        L.Polygon.prototype._clipPoints = function() {
          if (this._renderer instanceof ScreenSVG) { this._parts=this._rings.map(ring=>ring.slice()); return; }
          return originalPolyClip.call(this);
        };
        const paneBySource=new Map();
        const screenPane = source => {
          if (paneBySource.has(source)) return paneBySource.get(source);
          const paneName = `fa-native-${source}`;
          const pane=map.createPane(paneName,map._norotatePane || map._mapPane);
          const src=map.getPane(source);
          pane.style.zIndex=src ? getComputedStyle(src).zIndex : '400';
          pane.style.pointerEvents='none';
          paneBySource.set(source,paneName);
          return paneName;
        };
        map._createRenderer=function(opts={}) {
          const originalPane=opts.pane || 'overlayPane';
          return new ScreenSVG({...opts,pane:screenPane(originalPane)});
        };
        map.options.renderer=new ScreenSVG({pane:screenPane('overlayPane')});
      }
      installPmdScreenRenderer(state.map);
      // Zoom has precedence over map dragging; finish the drag without inertia.
      state.map.getContainer().addEventListener("wheel", () => {
        const draggable = state.map.dragging?._draggable;
        if (draggable?._moving) draggable.finishDrag(true);
      }, {capture: true, passive: false});
    }
    return worldBounds;
  }
  function createCoreInteractions({state, formatMeasuredDistance}) {
    function installShiftPan() {
      const shiftPanDraggable = state.map.dragging?._draggable;
      if (shiftPanDraggable?._onDown && !shiftPanDraggable._faShiftPanPatched) {
        const originalShiftPanOnDown = shiftPanDraggable._onDown;
        shiftPanDraggable.disable();
        shiftPanDraggable._onDown = function (event) {
          const allowShiftPan = Boolean(
            event?.button === 0 && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey &&
            !event.target?.closest?.(".leaflet-interactive, .leaflet-marker-icon, .leaflet-control")
          );
          if (!allowShiftPan) return originalShiftPanOnDown.call(this, event);
          const unshiftedEvent = new Proxy(event, {
            get(target, property) {
              if (property === "shiftKey") return false;
              const value = Reflect.get(target, property, target);
              return typeof value === "function" ? value.bind(target) : value;
            },
            set(target, property, value) { return Reflect.set(target, property, value, target); }
          });
          return originalShiftPanOnDown.call(this, unshiftedEvent);
        };
        shiftPanDraggable._faShiftPanPatched = true;
        shiftPanDraggable.enable();
      }
    }
    function installEdgePan() {
      let edgePanFrame = null;
      const edgePanStep = () => {
        if (edgePanFrame === null) return;
        const draggable = state.map.dragging && state.map.dragging._draggable;
        const event = draggable && draggable._lastEvent;
        if (draggable && draggable._moving && draggable._newPos && draggable._startPoint && event) {
          const edge = 2;
          const speed = 10;
          const delta = L.point(0, 0);
          if (event.clientX <= edge) delta.x = -speed;
          else if (event.clientX >= window.innerWidth - edge) delta.x = speed;
          if (event.clientY <= edge) delta.y = -speed;
          else if (event.clientY >= window.innerHeight - edge) delta.y = speed;
          if (delta.x || delta.y) {
            const before = draggable._newPos.clone();
            draggable._newPos = draggable._newPos.add(delta);
            draggable._updatePosition();
            const applied = draggable._newPos.subtract(before);
            const scale = draggable._parentScale || L.point(1, 1);
            draggable._startPoint = draggable._startPoint.subtract(applied.scaleBy(scale));
          }
        }
        edgePanFrame = requestAnimationFrame(edgePanStep);
      };
      state.map.on("dragstart", () => {
        if (edgePanFrame === null) edgePanFrame = requestAnimationFrame(edgePanStep);
      });
      state.map.on("dragend", () => {
        if (edgePanFrame !== null) cancelAnimationFrame(edgePanFrame);
        edgePanFrame = null;
      });

    }
    function installScaleControl(onScaleAdded) {
      const simpleScaleControl = L.control({position: "bottomright"});
      simpleScaleControl.onAdd = function () {
        const div = L.DomUtil.create("div", "simple-scale");
        div.innerHTML = '<div class="simple-scale-label"></div><div class="simple-scale-bar"></div>';
        return div;
      };
      simpleScaleControl.addTo(state.map);

      onScaleAdded();

      function niceScaleNumber(meters) {
        if (!Number.isFinite(meters) || meters <= 0) return 1;
        const power = Math.pow(10, Math.floor(Math.log10(meters)));
        const scaled = meters / power;
        const step = scaled >= 5 ? 5 : scaled >= 2 ? 2 : 1;
        return step * power;
      }

      function formatScaleDistance(meters) {
        return formatMeasuredDistance(meters);
      }

      function updateSimpleScale() {
        const el = document.querySelector(".simple-scale");
        if (!el) return;
        el.classList.toggle("smooth-resize", state.smoothScaleResize !== false);
        el.classList.toggle("hidden", !state.scaleVisible);
        if (!state.scaleVisible) return;

        const maxWidth = 96;
        const y = Math.max(0, state.map.getSize().y - 24);
        const p1 = state.map.containerPointToLatLng([0, y]);
        const p2 = state.map.containerPointToLatLng([maxWidth, y]);
        const maxMeters = state.map.distance(p1, p2);
        const unitMeters = state.measurementSystem === "imperial"
          ? (maxMeters * 0.75 >= 1609.344 ? 1609.344 : 0.3048)
          : state.measurementSystem === "nautical"
            ? (maxMeters * 0.75 >= 1852 ? 1852 : 1)
            : (maxMeters * 0.75 >= 1000 ? 1000 : 1);
        const meters = niceScaleNumber(maxMeters * 0.75 / unitMeters) * unitMeters;
        const width = Math.max(18, Math.round(maxWidth * meters / maxMeters));

        el.querySelector(".simple-scale-label").textContent = formatScaleDistance(meters);
        el.querySelector(".simple-scale-bar").style.width = `${width}px`;
      }

      state.map.on("zoomend moveend resize", updateSimpleScale);
      state.refreshUnitScale = updateSimpleScale;
      setTimeout(updateSimpleScale, 0);


    }
    return {installShiftPan, installEdgePan, installScaleControl};
  }
  function createCoreBorders({state, $, syncStyledRange, scheduleSettingsSave, networkFetch, hideImageryInfoTooltip, updateSatelliteBrightnessInfo, updateOsmBrightnessInfo, updateRasterOverzoomNotice, scheduleSatelliteNativeZoomDetection, cancelSatelliteNativeZoomDetection}) {
  let optionalLayerMap = null;
  function borderWorldPoint(lon, lat) {
    const limitedLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0));
    const x = (Number(lon) + 180) / 360 * 256;
    const sin = Math.sin(limitedLat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 256;
    return [x, y];
  }

  function borderPointSegmentDistanceSq(point, a, b) {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = point[0] - x;
    dy = point[1] - y;
    return dx * dx + dy * dy;
  }

  function simplifyBorderLineIndices(points, tolerance) {
    const count = points.length;
    if (count <= 2 || !(tolerance > 0)) return Array.from({length: count}, (_, index) => index);
    const keep = new Uint8Array(count);
    keep[0] = 1;
    keep[count - 1] = 1;
    const toleranceSq = tolerance * tolerance;
    const stack = [[0, count - 1]];
    while (stack.length) {
      const [first, last] = stack.pop();
      let maxDistanceSq = toleranceSq;
      let maxIndex = -1;
      for (let index = first + 1; index < last; index += 1) {
        const distanceSq = borderPointSegmentDistanceSq(points[index], points[first], points[last]);
        if (distanceSq > maxDistanceSq) {
          maxDistanceSq = distanceSq;
          maxIndex = index;
        }
      }
      if (maxIndex !== -1) {
        keep[maxIndex] = 1;
        stack.push([first, maxIndex], [maxIndex, last]);
      }
    }
    const indices = [];
    for (let index = 0; index < count; index += 1) if (keep[index]) indices.push(index);
    return indices;
  }

  function borderTileLinesFromData(data, tolerance = 0) {
    const lines = [];
    const appendLine = (coordinates, metadata = {}) => {
      if (!Array.isArray(coordinates) || coordinates.length < 2) return;
      const rawPoints = [];
      const rawLatLngs = [];
      for (const coordinate of coordinates) {
        if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
        const lon = Number(coordinate[0]);
        const lat = Number(coordinate[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const point = borderWorldPoint(lon, lat);
        if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
        rawPoints.push(point);
        rawLatLngs.push([lat, lon]);
      }
      if (rawPoints.length < 2) return;
      const indices = simplifyBorderLineIndices(rawPoints, tolerance);
      const points = indices.map(index => rawPoints[index]);
      const latlngs = indices.map(index => rawLatLngs[index]);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let minLon = Infinity;
      let minLat = Infinity;
      let maxLon = -Infinity;
      let maxLat = -Infinity;
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        const latlng = latlngs[index];
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
        minLat = Math.min(minLat, latlng[0]);
        maxLat = Math.max(maxLat, latlng[0]);
        minLon = Math.min(minLon, latlng[1]);
        maxLon = Math.max(maxLon, latlng[1]);
      }
      if (points.length < 2) return;
      lines.push({
        points, latlngs, minX, minY, maxX, maxY, minLon, minLat, maxLon, maxLat,
        kind: metadata.kind || "unknown",
        status: metadata.status || "unknown",
        adminLevel: metadata.adminLevel == null ? null : Number(metadata.adminLevel),
        wayId: metadata.wayId == null ? null : metadata.wayId,
        relationIds: Array.isArray(metadata.relationIds) ? metadata.relationIds : [],
        schemaVersion: Number(metadata.schemaVersion) || 1,
        source: metadata.source || "",
        properties: metadata.properties && typeof metadata.properties === "object" ? metadata.properties : {}
      });
    };
    const appendGeometry = (geometry, metadata = {}) => {
      if (!geometry) return;
      if (geometry.type === "LineString") appendLine(geometry.coordinates, metadata);
      else if (geometry.type === "MultiLineString") {
        for (const line of geometry.coordinates || []) appendLine(line, metadata);
      }
    };
    if (Array.isArray(data)) {
      for (const coordinates of data) appendLine(coordinates, {schemaVersion: 1});
      return lines;
    }
    if (Number(data?.version) === 2 && Array.isArray(data?.segments)) {
      const common = {schemaVersion: 2, source: String(data.source || "")};
      for (const segment of data.segments) {
        if (!segment || typeof segment !== "object") continue;
        appendLine(segment.coordinates, {
          ...common,
          kind: segment.kind,
          status: segment.status,
          adminLevel: segment.adminLevel,
          wayId: segment.wayId,
          relationIds: segment.relationIds,
          properties: segment.properties
        });
      }
      return lines;
    }
    for (const feature of data?.features || []) {
      const properties = feature?.properties && typeof feature.properties === "object" ? feature.properties : {};
      appendGeometry(feature?.geometry, {
        schemaVersion: Number(data?.version) || 1,
        source: String(data?.source || ""),
        kind: properties.kind,
        status: properties.status,
        adminLevel: properties.adminLevel ?? properties.admin_level,
        wayId: properties.wayId ?? properties.way_id,
        relationIds: properties.relationIds ?? properties.relation_ids,
        properties
      });
    }
    return lines;
  }

  function normalizedBorderKind(kind) {
    if (kind === "outer") return "outer";
    if (kind === "shared-sea") return "shared-sea";
    if (kind === "outer-land") return "outer-land";
    return "shared";
  }

  function borderKindVisible(kind) {
    const normalized = normalizedBorderKind(kind);
    if (normalized === "outer") return state.borderOuterVisible;
    if (normalized === "shared-sea") return state.borderSharedSeaVisible;
    return state.borderSharedVisible;
  }

  function borderKindAppearance(kind) {
    const normalized = normalizedBorderKind(kind);
    const outer = normalized === "outer";
    const sea = normalized === "shared-sea";
    const outerLand = normalized === "outer-land";
    const style = outer ? state.borderOuterStyle : sea ? state.borderSharedSeaStyle : outerLand ? "dotted" : state.borderSharedStyle;
    return {
      color: outer ? state.borderOuterColor : sea ? state.borderSharedSeaColor : state.borderSharedColor,
      opacity: outer ? state.borderOuterOpacity : sea ? state.borderSharedSeaOpacity : state.borderSharedOpacity,
      dash: style === "dashed" ? "7 5" : style === "dotted" ? "2 4" : ""
    };
  }

  function syncBorderStyleControls() {
    const controls = [
      ["border-shared-toggle", "checked", state.borderSharedVisible],
      ["border-shared-sea-toggle", "checked", state.borderSharedSeaVisible],
      ["border-outer-toggle", "checked", state.borderOuterVisible],
      ["border-shared-color", "value", state.borderSharedColor],
      ["border-shared-sea-color", "value", state.borderSharedSeaColor],
      ["border-outer-color", "value", state.borderOuterColor],
      ["border-shared-opacity", "value", Math.round(state.borderSharedOpacity * 100)],
      ["border-shared-sea-opacity", "value", Math.round(state.borderSharedSeaOpacity * 100)],
      ["border-outer-opacity", "value", Math.round(state.borderOuterOpacity * 100)],
      ["border-shared-style", "value", state.borderSharedStyle],
      ["border-shared-sea-style", "value", state.borderSharedSeaStyle],
      ["border-outer-style", "value", state.borderOuterStyle]
    ];
    for (const [id, property, value] of controls) {
      const element = $(id);
      if (!element) continue;
      element[property] = value;
      element.disabled = !state.borderVisible;
      if (id.endsWith("-opacity")) syncStyledRange(element);
    }
    const settings = $("border-settings");
    const borderControl = $("border-toggle")?.closest(".satellite-border-control");
    if (borderControl) borderControl.classList.toggle("borders-off", !state.borderVisible);
    if (settings) {
      settings.classList.toggle("hidden", !state.borderVisible);
      if (!state.borderVisible) settings.open = false;
    }
    const values = [
      ["border-shared-opacity-value", state.borderSharedOpacity],
      ["border-shared-sea-opacity-value", state.borderSharedSeaOpacity],
      ["border-outer-opacity-value", state.borderOuterOpacity]
    ];
    for (const [id, value] of values) {
      const element = $(id);
      if (element) element.textContent = `${Math.round(value * 100)}%`;
    }
  }

  function updateBorderAppearance(kind, field, value) {
    const normalized = normalizedBorderKind(kind);
    const prefix = normalized === "outer" ? "borderOuter" : normalized === "shared-sea" ? "borderSharedSea" : "borderShared";
    if (field === "Visible") state[`${prefix}Visible`] = Boolean(value);
    else if (field === "Color" && /^#[0-9a-f]{6}$/i.test(String(value || ""))) state[`${prefix}Color`] = String(value);
    else if (field === "Opacity") state[`${prefix}Opacity`] = Math.max(0, Math.min(1, Number(value)));
    else if (field === "Style" && ["solid", "dashed", "dotted"].includes(value)) state[`${prefix}Style`] = value;
    scheduleSettingsSave();
    syncBorderStyleControls();
    state.borderLayer?.redraw?.();
    refreshBorderSnapLayer();
  }

  function createBorderTileLayer(lineSets) {
    const baseStrokeWidth = 1.2;

    const BorderGrid = L.GridLayer.extend({
      getEvents() {
        const events = L.GridLayer.prototype.getEvents.call(this);
        delete events.rotate;
        events.zoomend = this._finishBorderZoom;
        return events;
      },

      onRemove(map) {
        if (this._borderZoomFrame !== null && this._borderZoomFrame !== undefined) {
          cancelAnimationFrame(this._borderZoomFrame);
          this._borderZoomFrame = null;
        }
        L.GridLayer.prototype.onRemove.call(this, map);
      },

      _getTiledPixelBounds(center) {
        const map = this._map;
        const mapZoom = map._animatingZoom
          ? Math.max(map._animateToZoom, map.getZoom())
          : map.getZoom();
        const scale = map.getZoomScale(mapZoom, this._tileZoom);
        const pixelCenter = map.project(center, this._tileZoom).floor();
        const half = map.getSize().divideBy(Math.min(scale, 1) * 2);
        const radius = Math.ceil(Math.hypot(half.x, half.y) * 1.08);
        return new L.Bounds(
          pixelCenter.subtract([radius, radius]),
          pixelCenter.add([radius, radius])
        );
      },

      _tileReady(coords, error, tile) {
        if (error) this.fire("tileerror", {error, tile, coords});
        const key = this._tileCoordsToKey(coords);
        const record = this._tiles[key];
        if (!record) return;
        record.loaded = +new Date();
        record.active = true;
        L.DomUtil.setOpacity(record.el, 1);
        if (!error) {
          L.DomUtil.addClass(record.el, "leaflet-tile-loaded");
          this.fire("tileload", {tile: record.el, coords});
        }
        if (this._noTilesToLoad()) {
          this._loading = false;
          this.fire("load");
          if (!this._noPrune) this._pruneTiles();
        }
      },

      _setBorderLevelVisibility(zoom) {
        for (const key in this._levels) {
          const level = this._levels[key];
          if (!level?.el) continue;
          level.el.style.visibility = Number(key) === zoom ? "visible" : "hidden";
        }
      },

      _borderLevelScale(level) {
        if (!level?.el) return 1;
        const transform = getComputedStyle(level.el).transform;
        if (!transform || transform === "none") return 1;
        try {
          const Matrix = window.DOMMatrixReadOnly || window.DOMMatrix || window.WebKitCSSMatrix;
          if (Matrix) {
            const matrix = new Matrix(transform);
            const scale = Math.hypot(Number(matrix.a) || 0, Number(matrix.b) || 0);
            if (Number.isFinite(scale) && scale > 0) return scale;
          }
        } catch {}
        const match = transform.match(/^matrix\(([^)]+)\)$/);
        if (match) {
          const values = match[1].split(",").map(Number);
          const scale = Math.hypot(values[0] || 0, values[1] || 0);
          if (Number.isFinite(scale) && scale > 0) return scale;
        }
        return 1;
      },

      _applyBorderStrokeCompensation() {
        const zoom = this._borderPreferredZoom;
        if (!Number.isFinite(zoom)) return;
        const level = this._levels[zoom];
        if (!level) return;
        const scale = Math.max(0.25, Math.min(4, this._borderLevelScale(level)));
        const strokeWidth = baseStrokeWidth / scale;
        for (const key in this._tiles) {
          const record = this._tiles[key];
          if (record?.coords?.z !== zoom) continue;
          for (const path of record.el?._faBorderPaths || []) path.style.strokeWidth = `${strokeWidth}px`;
        }
      },

      _startBorderZoomCompensation() {
        if (this._borderZoomFrame !== null && this._borderZoomFrame !== undefined) {
          cancelAnimationFrame(this._borderZoomFrame);
        }
        const tick = () => {
          if (!this._map || !this._map._animatingZoom || !Number.isFinite(this._borderPreferredZoom)) {
            this._borderZoomFrame = null;
            return;
          }
          this._applyBorderStrokeCompensation();
          this._borderZoomFrame = requestAnimationFrame(tick);
        };
        this._applyBorderStrokeCompensation();
        this._borderZoomFrame = requestAnimationFrame(tick);
      },

      _resetBorderStrokeWidths() {
        for (const key in this._tiles) {
          for (const path of this._tiles[key].el?._faBorderPaths || []) path.style.strokeWidth = "";
        }
      },

      _finishBorderZoom() {
        if (this._borderZoomFrame !== null && this._borderZoomFrame !== undefined) {
          cancelAnimationFrame(this._borderZoomFrame);
          this._borderZoomFrame = null;
        }
        this._borderPreferredZoom = null;
        this._resetBorderStrokeWidths();
        for (const key in this._levels) {
          const level = this._levels[key];
          if (level?.el) level.el.style.visibility = "";
        }
      },

      _animateZoom(event) {
        const previousZoom = Number.isFinite(this._tileZoom) ? this._tileZoom : Math.round(this._map.getZoom());
        L.GridLayer.prototype._animateZoom.call(this, event);
        const targetZoom = Number.isFinite(this._tileZoom) ? this._tileZoom : Math.round(event.zoom);
        this._borderPreferredZoom = Math.max(previousZoom, targetZoom);
        this._setBorderLevelVisibility(this._borderPreferredZoom);
        this._startBorderZoomCompensation();
      },

      createTile(coords) {
        const tile = document.createElement("div");
        const size = this.getTileSize();
        tile.style.overflow = "hidden";
        tile.style.pointerEvents = "none";

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.style.display = "block";
        svg.style.overflow = "hidden";
        svg.style.pointerEvents = "none";

        const scale = Math.pow(2, coords.z);
        const originX = coords.x * size.x;
        const originY = coords.y * size.y;
        const margin = 3 / scale;
        const minX = originX / scale - margin;
        const minY = originY / scale - margin;
        const maxX = (originX + size.x) / scale + margin;
        const maxY = (originY + size.y) / scale + margin;
        const pathParts = {shared: [], "shared-sea": [], outer: [], "outer-land": []};
        const lines = borderLinesForZoom(coords.z);

        for (const line of lines) {
          const kind = normalizedBorderKind(line.kind);
          if (!borderKindVisible(kind)) continue;
          if (line.maxX < minX || line.minX > maxX || line.maxY < minY || line.minY > maxY) continue;
          const parts = pathParts[kind];
          const points = line.points;
          let active = false;
          for (let i = 1; i < points.length; i += 1) {
            const a = points[i - 1];
            const b = points[i];
            const visible = !(Math.max(a[0], b[0]) < minX || Math.min(a[0], b[0]) > maxX ||
              Math.max(a[1], b[1]) < minY || Math.min(a[1], b[1]) > maxY);
            if (!visible) {
              active = false;
              continue;
            }
            const ax = a[0] * scale - originX;
            const ay = a[1] * scale - originY;
            const bx = b[0] * scale - originX;
            const by = b[1] * scale - originY;
            if (!active) parts.push(`M${ax.toFixed(2)} ${ay.toFixed(2)}`);
            parts.push(`L${bx.toFixed(2)} ${by.toFixed(2)}`);
            active = true;
          }
        }

        tile._faBorderPaths = [];
        for (const kind of ["shared", "shared-sea", "outer", "outer-land"]) {
          const parts = pathParts[kind];
          if (!parts.length) continue;
          const appearance = borderKindAppearance(kind);
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", parts.join(" "));
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", appearance.color);
          path.setAttribute("stroke-opacity", String(appearance.opacity));
          path.setAttribute("stroke-width", String(baseStrokeWidth));
          if (appearance.dash) path.setAttribute("stroke-dasharray", appearance.dash);
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("stroke-linejoin", "round");
          path.setAttribute("shape-rendering", "geometricPrecision");
          svg.appendChild(path);
          tile._faBorderPaths.push(path);
        }

        tile.appendChild(svg);
        return tile;
      }
    });

    return new BorderGrid({
      pane: "borderPane",
      tileSize: 512,
      noWrap: false,
      bounds: [[-85.05112878, -180], [85.05112878, 180]],
      attribution: "&copy; OpenStreetMap contributors",
      updateWhenZooming: true,
      updateWhenIdle: false,
      updateInterval: 32,
      keepBuffer: 2
    });
  }

  const BORDER_DETAIL_LEVELS = [
    {key: "low", label: "0.1", file: "data/borders/osm-border-0-1.js", minZoom: 0, maxZoom: 4},
    {key: "medium", label: "0.01", file: "data/borders/osm-border-0-01.js", minZoom: 5, maxZoom: 6},
    {key: "high", label: "0.001", file: "data/borders/osm-border-0-001.js", minZoom: 7, maxZoom: 8},
    {key: "ultra", label: "0.0001", file: "data/borders/osm-border-0-0001.js", minZoom: 9, maxZoom: Infinity}
  ];

  function borderDetailForZoom(zoom = state.map?.getZoom?.() || 0) {
    return BORDER_DETAIL_LEVELS.find(level => zoom <= level.maxZoom) || BORDER_DETAIL_LEVELS[BORDER_DETAIL_LEVELS.length - 1];
  }

  function borderLinesForZoom(zoom = state.map?.getZoom?.() || 0) {
    const sets = state.borderLineSets || {};
    const desired = borderDetailForZoom(zoom);
    if (sets[desired.key]?.length) return sets[desired.key];
    const desiredIndex = BORDER_DETAIL_LEVELS.indexOf(desired);
    for (let index = desiredIndex - 1; index >= 0; index -= 1) {
      const lines = sets[BORDER_DETAIL_LEVELS[index].key];
      if (lines?.length) return lines;
    }
    for (let index = desiredIndex + 1; index < BORDER_DETAIL_LEVELS.length; index += 1) {
      const lines = sets[BORDER_DETAIL_LEVELS[index].key];
      if (lines?.length) return lines;
    }
    return [];
  }

  const BORDER_DETAIL_RETRY_DELAYS_MS = [10000, 30000, 90000];

  function borderDetailFailureIsSessionPermanent(error) {
    const status = Number(error?.status);
    if (Number.isFinite(status) && status >= 400 && status < 500 && status !== 408 && status !== 429) return true;
    return error?.name === "SyntaxError" || error?.code === "INVALID_BORDER_DATA";
  }

  function clearBorderDetailRetry(level, resetCount = false) {
    if (!level) return;
    const timer = state.borderDetailRetryTimers.get(level.key);
    if (timer !== undefined) clearTimeout(timer);
    state.borderDetailRetryTimers.delete(level.key);
    if (resetCount) state.borderDetailRetryCounts.delete(level.key);
  }

  function resetBorderDetailRetryBudget() {
    for (const timer of state.borderDetailRetryTimers.values()) clearTimeout(timer);
    state.borderDetailRetryTimers.clear();
    state.borderDetailRetryCounts.clear();
  }

  function borderDetailRetryLimitReached(level) {
    return Number(state.borderDetailRetryCounts.get(level?.key) || 0) > BORDER_DETAIL_RETRY_DELAYS_MS.length;
  }

  function scheduleBorderDetailRetry(level) {
    const failures = Number(state.borderDetailRetryCounts.get(level?.key) || 0);
    const delayMs = BORDER_DETAIL_RETRY_DELAYS_MS[failures - 1];
    if (!level || !Number.isFinite(delayMs) || state.borderDetailFailed.has(level.key) || state.borderDetailRetryTimers.has(level.key)) return;
    const timer = setTimeout(() => {
      state.borderDetailRetryTimers.delete(level.key);
      if (!state.map || state.currentBaseName !== "satellite" || !state.borderVisible) return;
      if (!state.borderLayer && level.key === BORDER_DETAIL_LEVELS[0].key) {
        void updateBorderLayer();
        return;
      }
      if (borderDetailForZoom().key === level.key) {
        void ensureBorderDetail(level);
        return;
      }
      preloadNextBorderDetailForZoom();
    }, delayMs);
    state.borderDetailRetryTimers.set(level.key, timer);
  }

  async function ensureBorderDetail(level) {
    if (!level) return null;
    if (state.borderLineSets[level.key]?.length) return state.borderLineSets[level.key];
    if (state.borderDetailFailed.has(level.key)) return null;
    if (borderDetailRetryLimitReached(level)) return null;
    if (state.borderDetailRetryTimers.has(level.key)) return null;
    if (state.borderDetailLoads.has(level.key)) return state.borderDetailLoads.get(level.key);

    // The app is distributed as a local file:// document. Browsers generally block
    // fetch() for sibling JSON files under file://; classic script tags are supported.
    // Load the bundled OSM geometry as an inert data assignment, one zoom level at a time.
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = level.file;
      script.async = true;
      script.onload = () => {
        script.remove();
        const payload = window.FABorderPayloads;
        const data = payload?.[level.key];
        if (payload) delete payload[level.key]; // release raw geometry after parsing
        if (!data) {
          const error = new Error(`Bundled OSM border ${level.label} contained no data`);
          error.code = "INVALID_BORDER_DATA";
          reject(error);
          return;
        }
        resolve(data);
      };
      script.onerror = () => {
        script.remove();
        reject(new Error(`Bundled OSM border ${level.label} could not be loaded`));
      };
      document.head.appendChild(script);
    })
      .then(borderData => {
        const lines = borderTileLinesFromData(borderData, 0);
        if (!lines.length) {
          const error = new Error(`Local OSM border ${level.label} contained no usable lines`);
          error.code = "INVALID_BORDER_DATA";
          throw error;
        }
        state.borderLineSets[level.key] = lines;
        state.borderDetailFailed.delete(level.key);
        clearBorderDetailRetry(level, true);
        if (borderDetailForZoom().key === level.key) {
          state.borderLayer?.redraw?.();
          refreshBorderSnapLayer();
        }
        return lines;
      })
      .catch(error => {
        if (borderDetailFailureIsSessionPermanent(error)) {
          state.borderDetailFailed.add(level.key);
          clearBorderDetailRetry(level, true);
        } else {
          const failures = Number(state.borderDetailRetryCounts.get(level.key) || 0) + 1;
          state.borderDetailRetryCounts.set(level.key, failures);
          scheduleBorderDetailRetry(level);
        }
        void 0;
        return null;
      })
      .finally(() => { state.borderDetailLoads.delete(level.key); });

    state.borderDetailLoads.set(level.key, promise);
    return promise;
  }

  function refreshBorderSnapLayer() {
    const group = state.borderSnapLayer;
    if (!group || !state.map || !state.map.hasLayer(group)) return;
    group.clearLayers();
    if (state.currentBaseName !== "satellite" || !state.borderVisible) return;
    const lines = borderLinesForZoom();
    if (!lines.length) return;
    const bounds = state.map.getBounds().pad(0.25);
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const worldIndex = Math.round(Number(state.map.getCenter()?.lng || 0) / 360);
    const worldOffsets = [worldIndex - 1, worldIndex, worldIndex + 1].map(index => index * 360);
    for (const line of lines) {
      if (!borderKindVisible(line.kind)) continue;
      for (const worldOffset of worldOffsets) {
        const minLon = line.minLon + worldOffset;
        const maxLon = line.maxLon + worldOffset;
        if (maxLon < west || minLon > east || line.maxLat < south || line.minLat > north) continue;
        let segment = [];
        const flush = () => {
          if (segment.length >= 2) {
            group.addLayer(L.polyline(segment, {
              interactive: false,
              pmIgnore: true,
              snapIgnore: false,
              opacity: 0,
              weight: 1
            }));
          }
          segment = [];
        };
        for (let index = 1; index < line.latlngs.length; index += 1) {
          const a = line.latlngs[index - 1];
          const b = line.latlngs[index];
          const aLng = Number(a[1]) + worldOffset;
          const bLng = Number(b[1]) + worldOffset;
          const visible = !(Math.max(aLng, bLng) < west || Math.min(aLng, bLng) > east ||
            Math.max(a[0], b[0]) < south || Math.min(a[0], b[0]) > north);
          if (!visible) {
            flush();
            continue;
          }
          if (!segment.length) segment.push([a[0], aLng]);
          segment.push([b[0], bLng]);
        }
        flush();
      }
    }
  }

  function preloadNextBorderDetailForZoom() {
    if (!state.map || !state.borderLayer) return;
    if (state.currentBaseName !== "satellite" || !state.borderVisible) return;
    const zoom = state.map.getZoom();
    const current = borderDetailForZoom(zoom);
    const index = BORDER_DETAIL_LEVELS.indexOf(current);
    const next = BORDER_DETAIL_LEVELS[index + 1];
    if (!next || zoom < next.minZoom - 1) return;
    if (state.borderLineSets[next.key]?.length || state.borderDetailLoads.has(next.key) || state.borderDetailFailed.has(next.key) || state.borderDetailRetryTimers.has(next.key) || borderDetailRetryLimitReached(next)) return;
    const run = () => ensureBorderDetail(next);
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, {timeout: 1200});
    else setTimeout(run, 150);
  }

  async function ensureBorderDetailForZoom() {
    if (!state.map || !state.borderLayer) return;
    if (state.currentBaseName !== "satellite" || !state.borderVisible) return;
    const level = borderDetailForZoom();
    if (state.borderLineSets[level.key]?.length) return;
    await ensureBorderDetail(level);
  }

  async function ensureBorderLayer() {
    if (state.borderLayer) return state.borderLayer;
    if (!state.borderLoading) {
      state.borderLoading = (async () => {
        const baseLevel = BORDER_DETAIL_LEVELS[0];
        const lines = await ensureBorderDetail(baseLevel);
        if (!lines?.length) throw new Error("OSM border data unavailable");
        state.borderSnapLayer = L.layerGroup();
        state.borderSnapLayer.options.pmIgnore = true;
        state.borderSnapLayer.options.snapIgnore = false;
        state.borderLayer = createBorderTileLayer(state.borderLineSets);
        return state.borderLayer;
      })().finally(() => { state.borderLoading = null; });
    }
    return state.borderLoading;
  }

  async function updateBorderLayer() {
    if (state.borderLayer && state.map.hasLayer(state.borderLayer)) state.map.removeLayer(state.borderLayer);
    if (state.borderSnapLayer && state.map.hasLayer(state.borderSnapLayer)) state.map.removeLayer(state.borderSnapLayer);

    const toggle = $("border-toggle");
    const satelliteActive = state.currentBaseName === "satellite";

    toggle.closest(".satellite-border-control")?.classList.toggle("hidden", !satelliteActive);
    toggle.checked = Boolean(state.borderVisible);
    syncBorderStyleControls();
    toggle.setAttribute("aria-label", state.borderVisible ? "Hide satellite borders" : "Show satellite borders");

    if (!satelliteActive || !state.borderVisible) return;

    try {
      const layer = await ensureBorderLayer();
      if (layer && state.currentBaseName === "satellite" && state.borderVisible && !state.map.hasLayer(layer)) layer.addTo(state.map);
      if (state.borderSnapLayer && state.currentBaseName === "satellite" && state.borderVisible && !state.map.hasLayer(state.borderSnapLayer)) state.borderSnapLayer.addTo(state.map);
      refreshBorderSnapLayer();
      ensureBorderDetailForZoom();
      if (typeof preloadNextBorderDetailForZoom === "function") preloadNextBorderDetailForZoom();
    } catch (error) {
      void 0;
      toggle.checked = Boolean(state.borderVisible);
    }
  }

  function switchBasemap(name) {
    resetBorderDetailRetryBudget();
    hideImageryInfoTooltip();
    if (!state.baseLayers[name]) name = "osm";
    if (state.borderLayer && state.map.hasLayer(state.borderLayer)) state.map.removeLayer(state.borderLayer);
    if (state.borderSnapLayer && state.map.hasLayer(state.borderSnapLayer)) state.map.removeLayer(state.borderSnapLayer);
    if (state.currentBase) state.map.removeLayer(state.currentBase);
    state.currentBaseName = name;
    state.currentBase = state.baseLayers[name].addTo(state.map);
    if (optionalLayerMap !== state.map) { window.FAWorldCover?.init?.(state.map); window.FAOverpass?.init?.(state.map); optionalLayerMap = state.map; }
    state.basemap = name;
    scheduleSettingsSave();
    $("basemap-toggle").textContent = name === "satellite" ? "OSM" : "SAT";
    window.FAVersaTiles?.setBasemap?.(name);
    updateSatelliteBrightnessInfo();
    updateOsmBrightnessInfo();
    updateRasterOverzoomNotice();
    if (name === "satellite" && state.satelliteRasterOverzoom) scheduleSatelliteNativeZoomDetection(0);
    else cancelSatelliteNativeZoomDetection();
    updateBorderLayer();
  }

  function toggleBorders(visible = !state.borderVisible) {
    resetBorderDetailRetryBudget();
    state.borderVisible = Boolean(visible);
    scheduleSettingsSave();
    updateBorderLayer();
  }

    return {updateBorderAppearance, refreshBorderSnapLayer, ensureBorderDetailForZoom, preloadNextBorderDetailForZoom, updateBorderLayer, switchBasemap, toggleBorders};
  }
  function createCoreStatus({state, $, formatCoordinatesAs, parseCoordinateInput, showToast, navigateMap, visibleMapCenterLatLng, satelliteNativeMaxZoom}) {
  function formatCoordinates(lat, lon) {
    return formatCoordinatesAs(lat, lon, state.coordFormat);
  }

  function positionGotoCoordinates() {
    const status = $("status");
    const mapRect = state.map?.getContainer()?.getBoundingClientRect();
    if (!mapRect) return;
    const extension = parseFloat(status.style.getPropertyValue("--status-zoom-extension")) || 0;
    $("goto-controls").style.left = `${status.getBoundingClientRect().right - mapRect.left + extension + 10}px`;
  }

  function setGotoCoordinatesOpen(open) {
    const isOpen = Boolean(open);
    const controls = $("goto-controls");
    if (controls._gotoHideTimer) {
      clearTimeout(controls._gotoHideTimer);
      controls._gotoHideTimer = null;
    }
    const quickMeasurementsOpen =
      $("quick-measurements")?.classList.contains("is-open") || false;
    $("status").setAttribute(
      "aria-expanded",
      String(isOpen || quickMeasurementsOpen)
    );
    if (isOpen) {
      positionGotoCoordinates();
      controls.classList.remove("goto-open");
      controls.classList.remove("hidden");
      void controls.offsetWidth;
      requestAnimationFrame(() => controls.classList.add("goto-open"));
      setTimeout(() => { const input = $("goto-coords"); input.focus(); if (input.value) input.select(); }, 0);
    } else {
      controls.classList.remove("goto-open");
      controls._gotoHideTimer = setTimeout(() => {
        controls.classList.add("hidden");
        controls._gotoHideTimer = null;
      }, 200);
    }
  }


  function goToCoordinates() {
    const parsed = parseCoordinateInput($("goto-coords").value, state.map.getCenter());
    if (!parsed || !Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lon)
      || Math.abs(parsed.lat) > 85.05112878 || Math.abs(parsed.lon) > 180) {
      showToast("Enter valid coordinates, a Plus Code, or a supported map URL.");
      return;
    }
    if (parsed.referenceUsed) showToast("Short Plus Code resolved near the current map center.", "info");
    navigateMap([parsed.lat, parsed.lon], {zoom: Math.max(14, state.map.getZoom())});
    setGotoCoordinatesOpen(false);
    $("goto-coords").blur();
  }



  function wakeCenterCrosshair() {
    if (state.crosshairIdleTimer) {
      clearTimeout(state.crosshairIdleTimer);
      state.crosshairIdleTimer = null;
    }
    $("map-center-crosshair").classList.remove("startup-faded", "idle-faded");
  }

  function scheduleCenterCrosshairIdleFade() {
    if (state.crosshairIdleTimer) clearTimeout(state.crosshairIdleTimer);
    state.crosshairIdleTimer = null;
    if (!state.followScreenCenter || !state.map) return;
    state.crosshairIdleTimer = setTimeout(() => {
      state.crosshairIdleTimer = null;
      if (state.followScreenCenter) $("map-center-crosshair").classList.add("idle-faded");
    }, 5000);
  }


  function fadeCenterCrosshairForPoi(immediate = false) {
    if (!state.followScreenCenter || !state.map) return;
    const crosshair = $("map-center-crosshair");
    crosshair.classList.remove("startup-faded", "idle-faded");
    crosshair.classList.toggle("poi-faded-instant", Boolean(immediate));
    crosshair.classList.add("poi-faded");
  }

  function updateCenterCrosshairVisibility() {
    const crosshair = $("map-center-crosshair");
    if (!state.followScreenCenter || !state.map) {
      crosshair.classList.add("hidden");
      return;
    }
    crosshair.classList.remove("hidden");
  }

  function updateCoordinateReadout(latlng = null) {
    if (!state.map) return;
    const point = state.followScreenCenter
      ? (visibleMapCenterLatLng() || state.map.getCenter())
      : (latlng || state.lastCursor || state.map.getCenter());
    $("status-coords").textContent = formatCoordinates(point.lat, point.lng);
  }

  function updateWorldStatus() {
    if (!state.map) return;
    const point = state.followScreenCenter ? (visibleMapCenterLatLng() || state.map.getCenter()) : state.map.getCenter();
    const world = Math.round(Number(point?.lng || 0) / 360);
    $("status-world").textContent = world > 0 ? `W+${world}` : `W${world}`;
  }

  function updateZoomStatus() {
    if (!state.map) return;
    const zoom = Number(state.map.getZoom());
    const nativeZoom = state.currentBaseName === "satellite" && state.satelliteRasterOverzoom
      ? Number(state.baseLayers.satellite?._faNativeMaxZoom ?? satelliteNativeMaxZoom())
      : state.currentBaseName === "osm" && state.osmRasterOverzoom ? 19 : Infinity;
    const overzoomed = Number.isFinite(zoom) && Number.isFinite(nativeZoom) && zoom > nativeZoom;
    const status = $("status-zoom");
    status.textContent = `Z${zoom}`;
    const source = $("status-zoom-source");
    if (overzoomed) source.textContent = `/ ${nativeZoom}`;
    source.classList.toggle("is-visible", overzoomed);
    source.setAttribute("aria-hidden", String(!overzoomed));
    const extension = overzoomed ? Math.max(0, Math.ceil(source.getBoundingClientRect().width - 4)) : 0;
    $("status").style.setProperty("--status-zoom-extension", `${extension}px`);
    if (!$("goto-controls").classList.contains("hidden")) positionGotoCoordinates();
    source.title = overzoomed ? `Raster overzoom: display Z${zoom}, source Z${nativeZoom}` : "";
    status.title = overzoomed ? `Raster overzoom (native Z${nativeZoom})` : "";
  }

    return {formatCoordinates, setGotoCoordinatesOpen, goToCoordinates, wakeCenterCrosshair, scheduleCenterCrosshairIdleFade, fadeCenterCrosshairForPoi, updateCenterCrosshairVisibility, updateCoordinateReadout, updateWorldStatus, updateZoomStatus};
  }
  function createCoreHelpers({state, $, updateCoordinateReadout, updateWorldStatus}) {
  const appTooltipController = (() => {
    let installedMap = null;
    let activeTooltip = null;

    const hideAndClose = tooltip => {
      if (!tooltip) return;
      const element = tooltip.getElement?.();
      if (element) element.style.setProperty("opacity", "0", "important");
      const source = tooltip._source;
      if (source && typeof source.closeTooltip === "function") source.closeTooltip();
      else if (typeof tooltip.remove === "function") tooltip.remove();
    };

    const handleOpen = event => {
      const tooltip = event?.tooltip;
      if (!tooltip || tooltip.options?.permanent) return;
      if (activeTooltip && activeTooltip !== tooltip) hideAndClose(activeTooltip);
      activeTooltip = tooltip;
    };

    const handleClose = event => {
      if (activeTooltip === event?.tooltip) activeTooltip = null;
    };

    const install = map => {
      if (!map || installedMap === map) return;
      if (installedMap) {
        installedMap.off("tooltipopen", handleOpen);
        installedMap.off("tooltipclose", handleClose);
      }
      installedMap = map;
      activeTooltip = null;
      installedMap.on("tooltipopen", handleOpen);
      installedMap.on("tooltipclose", handleClose);
    };

    const closeActive = () => {
      const tooltip = activeTooltip;
      activeTooltip = null;
      hideAndClose(tooltip);
    };

    const bind = (layer, content, options = {}) => {
      if (!layer || typeof layer.bindTooltip !== "function") return layer;
      layer.bindTooltip(content, options);
      return layer;
    };

    const unbindInteractiveLifecycle = layer => {
      const lifecycle = layer?._faInteractiveTooltipLifecycle;
      if (!lifecycle) return;
      if (lifecycle.mouseover) layer.off("mouseover", lifecycle.mouseover);
      layer.off("mouseout", lifecycle.mouseout);
      layer.off("remove", lifecycle.remove);
      layer.off("tooltipopen", lifecycle.tooltipopen);
      if (lifecycle.click) layer.off("click", lifecycle.click);
      delete layer._faInteractiveTooltipLifecycle;
    };

    const bindInteractive = (layer, content, options = {}, behavior = {}) => {
      if (!layer || typeof layer.bindTooltip !== "function") return layer;
      unbindInteractiveLifecycle(layer);
      bind(layer, content, options);
      layer.off("mouseout", layer.closeTooltip);

      const boundElements = new WeakSet();
      const closeIfOutside = event => {
        const relatedTarget = event?.originalEvent?.relatedTarget || event?.relatedTarget || null;
        const tooltipElement = layer.getTooltip?.()?.getElement?.();
        const sourceElement = layer._path || layer._icon;
        if (relatedTarget && ((tooltipElement && (tooltipElement === relatedTarget || tooltipElement.contains(relatedTarget))) || (sourceElement && (sourceElement === relatedTarget || sourceElement.contains(relatedTarget))))) return;
        layer.closeTooltip?.();
      };
      const mouseover = behavior.openOnHover === false ? null : event => {
        const ownTooltip = layer.getTooltip?.();
        if (activeTooltip && activeTooltip !== ownTooltip) closeActive();
        if (!layer.isTooltipOpen?.()) layer.openTooltip?.(behavior.openAtPointer ? event?.latlng : undefined);
      };
      const remove = () => layer.closeTooltip?.();
      const tooltipopen = event => {
        const element = layer.getTooltip?.()?.getElement?.();
        if (element && !boundElements.has(element)) {
          boundElements.add(element);
          element.addEventListener("mouseleave", closeIfOutside);
          if (behavior.disableClickPropagation !== false) L.DomEvent.disableClickPropagation(element);
          if (behavior.disableScrollPropagation) L.DomEvent.disableScrollPropagation(element);
          behavior.onElementReady?.(element, {closeIfOutside, event, layer});
        }
        behavior.onOpen?.(element, {closeIfOutside, event, layer});
      };
      const click = behavior.clickToOpen ? event => {
        if (behavior.stopClickPropagation && event?.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        const ownTooltip = layer.getTooltip?.();
        if (activeTooltip && activeTooltip !== ownTooltip) closeActive();
        layer.openTooltip?.();
      } : null;

      if (mouseover) layer.on("mouseover", mouseover);
      layer.on("mouseout", closeIfOutside);
      layer.on("remove", remove);
      layer.on("tooltipopen", tooltipopen);
      if (click) layer.on("click", click);
      layer._faInteractiveTooltipLifecycle = {mouseover, mouseout: closeIfOutside, remove, tooltipopen, click};
      return layer;
    };

    return {install, closeActive, bind, bindInteractive, unbindInteractiveLifecycle};
  })();

  window.FATooltips = appTooltipController;

  function installSingleTransientTooltipPolicy() {
    appTooltipController.install(state.map);
  }

  function installLayerDragAutoPan(layer) {
    if (!layer || layer._faDragAutoPanHandlers) return;
    let active = false;
    let pointer = null;
    let frame = null;
    let mapMoved = false;

    const rememberPointer = event => {
      const source = event?.originalEvent || event?.markerEvent?.originalEvent || event?.markerEvent;
      if (!source || !Number.isFinite(Number(source.clientX)) || !Number.isFinite(Number(source.clientY))) return;
      pointer = {clientX: Number(source.clientX), clientY: Number(source.clientY)};
    };

    const stop = () => {
      active = false;
      pointer = null;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      if (mapMoved && state.map) state.map.fire("moveend", {faDragAutoPan: true});
      mapMoved = false;
    };

    const step = () => {
      frame = null;
      if (!active || !pointer || !state.map) {
        if (active) frame = requestAnimationFrame(step);
        return;
      }

      const container = state.map.getContainer();
      const rect = container.getBoundingClientRect();
      const sidebar = document.querySelector(".sidebar");
      const sidebarVisible = sidebar && !$("app").classList.contains("sidebar-collapsed");
      const sidebarRect = sidebarVisible ? sidebar.getBoundingClientRect() : null;
      const leftEdge = sidebarRect ? Math.max(rect.left, sidebarRect.right) : rect.left;
      const edge = 32;
      const speed = 10;
      let dx = 0;
      let dy = 0;
      if (pointer.clientX <= leftEdge + edge) dx = -speed;
      else if (pointer.clientX >= rect.right - edge) dx = speed;
      if (pointer.clientY <= rect.top + edge) dy = -speed;
      else if (pointer.clientY >= rect.bottom - edge) dy = speed;

      if (dx || dy) {
        let delta = L.point(dx, dy);
        if (typeof state.map._limitOffset === "function" && state.map.options.maxBounds) {
          delta = state.map._limitOffset(delta, state.map.options.maxBounds);
        }
        if (delta.x || delta.y) {
          if (!mapMoved) state.map.fire("movestart", {faDragAutoPan: true});
          if (typeof state.map._rawPanBy === "function") {
            state.map._rawPanBy(delta);
            state.map.fire("move", {faDragAutoPan: true});
          } else {
            state.map.panBy(delta, {animate: false, noMoveStart: true});
          }
          mapMoved = true;
          const synthetic = new MouseEvent("mousemove", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: pointer.clientX,
            clientY: pointer.clientY,
            buttons: 1
          });
          synthetic._faDragAutoPan = true;
          container.dispatchEvent(synthetic);
        }
      }

      if (active) frame = requestAnimationFrame(step);
    };

    const start = event => {
      active = true;
      rememberPointer(event);
      if (frame === null) frame = requestAnimationFrame(step);
    };
    const drag = event => {
      rememberPointer(event);
      if (!active) start(event);
    };
    const end = () => stop();
    const releaseIfNeeded = event => {
      if (!active) return;
      if (event?.type === "mousemove" && Number(event.buttons) !== 0) return;
      stop();
    };
    const cleanup = () => {
      stop();
      document.removeEventListener("mouseup", releaseIfNeeded, true);
      document.removeEventListener("pointerup", releaseIfNeeded, true);
      document.removeEventListener("pointercancel", releaseIfNeeded, true);
      document.removeEventListener("mousemove", releaseIfNeeded, true);
      window.removeEventListener("blur", releaseIfNeeded);
    };
    document.addEventListener("mouseup", releaseIfNeeded, true);
    document.addEventListener("pointerup", releaseIfNeeded, true);
    document.addEventListener("pointercancel", releaseIfNeeded, true);
    document.addEventListener("mousemove", releaseIfNeeded, true);
    window.addEventListener("blur", releaseIfNeeded);

    layer.on("pm:dragstart", start);
    layer.on("pm:drag", drag);
    layer.on("pm:dragend", end);
    layer.on("remove", cleanup);
    layer._faDragAutoPanHandlers = {start, drag, end, cleanup};
  }

  let sidebarViewportSyncFrame = 0;

  function updateMapViewportForSidebar() {
    const app = $("app");
    const sidebar = document.querySelector(".sidebar");
    if (!app) return;
    const appRect = app.getBoundingClientRect();
    const sidebarExpanded = window.innerWidth > 760 && sidebar && !app.classList.contains("sidebar-collapsed");
    const inset = sidebarExpanded ? Math.max(0, Math.min(appRect.width, sidebar.getBoundingClientRect().width)) : 0;
    const centerX = inset + Math.max(0, appRect.width - inset) / 2;
    const centerY = appRect.height / 2;
    const dpr = window.devicePixelRatio || 1;
    const snapToDevicePixel = value => Math.round(value * dpr) / dpr;
    const crosshairCenterX = snapToDevicePixel(centerX);
    const crosshairCenterY = snapToDevicePixel(centerY);
    app.style.removeProperty("--map-sidebar-inset");
    app.style.setProperty("--map-visible-center-x", `${centerX}px`);
    app.style.setProperty("--map-crosshair-center-x", `${crosshairCenterX}px`);
    app.style.setProperty("--map-crosshair-center-y", `${crosshairCenterY}px`);
    if (!state.map) return;
    if (sidebarViewportSyncFrame) cancelAnimationFrame(sidebarViewportSyncFrame);
    const started = performance.now();
    const sync = now => {
      updateCoordinateReadout();
      updateWorldStatus();
      if (now - started < 280) sidebarViewportSyncFrame = requestAnimationFrame(sync);
      else {
        sidebarViewportSyncFrame = 0;
        updateCoordinateReadout();
        updateWorldStatus();
      }
    };
    sidebarViewportSyncFrame = requestAnimationFrame(sync);
  }


    return {appTooltipController, installSingleTransientTooltipPolicy, installLayerDragAutoPan, updateMapViewportForSidebar};
  }
  window.FACore = Object.freeze({createCoreBasemaps, createCoreNavigation, createCoreMap, createCoreInteractions, createCoreBorders, createCoreStatus, createCoreHelpers});
})();
