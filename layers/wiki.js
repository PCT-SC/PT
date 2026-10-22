(() => {
  "use strict";
  function createWikipedia({syncToolSlotButtonExternal, notifyOverpass, setQueryExtentVisible, clearQueryExtent, canonicalViewportBboxes, normalizeWorldLongitude, esc, managedFetch, installTooltipMiddleClickLinks, beginExternalResultPoiDraft, category, captureQueryExtentGeometry, setQueryExtent}) {
  let map = null, wikiInfo = null, wikiPanel = null;
  const WIKI_API_URL = "https://en.wikipedia.org/w/api.php";
  const WIKI_MIN_ZOOM = 11;
  function wikiSyncZoomHint() {
    if (!map || !wikiPanel) return;
    const available = map.getZoom() >= WIKI_MIN_ZOOM;
    const button = wikiPanel.querySelector("#wiki-query");
    if (button) button.disabled = !available;
    const status = wikiPanel.querySelector("#wiki-status");
    if (!status) return;
    if (!available) {
      status.textContent = "Zoom in to query Wikipedia (11+)";
      status.title = "";
      status.classList.remove("error");
    } else if (status.dataset.wikiZoomLimited === "1") {
      status.textContent = "Ready";
      status.title = "";
      status.classList.remove("error");
    }
    status.dataset.wikiZoomLimited = available ? "0" : "1";
  }
  const WIKI_TILE_LIMIT = 500;
  const WIKI_MAX_SPLIT_DEPTH = 5;
  const WIKI_MAX_TOTAL_RESULTS = 2500;
  let wikiLayer = null;
  let wikiSharedIcon = null;
  let wikiController = null;
  let wikiHasQueried = false;
  const wikiDetailCache = new Map();
  const wikiDetailLoads = new Map();

  function wikiEnsureLayer() {
    if (!wikiLayer) {
      wikiLayer = L.layerGroup();
      wikiLayer.options.pmIgnore = true;
      wikiLayer.options.snapIgnore = true;
    }
    return wikiLayer;
  }

  function wikiClosePanel() {
    wikiPanel?.classList.add("hidden");
    wikiInfo?.classList.remove("legend-pinned");
    wikiInfo?.querySelector(".tool-settings-info-button")?.setAttribute("aria-expanded", "false");
  }

  function wikiSetStatus(text, error = false, detail = "") {
    const el = wikiPanel?.querySelector("#wiki-status");
    if (el) {
      el.textContent = text;
      el.title = error && detail ? String(detail) : "";
      el.classList.toggle("error", error);
    }
    wikiSyncZoomHint();
    syncToolSlotButtonExternal();
  }

  function wikiHasResults() {
    return Boolean(wikiLayer?.getLayers?.().length);
  }

  function wikiResultsVisible() {
    return wikiHasResults() && Boolean(map?.hasLayer?.(wikiLayer));
  }

  function wikiToggleResults() {
    if (!map) return;
    if (!wikiHasResults()) {
      if (!wikiHasQueried) notifyOverpass("Run a Wikipedia query first.", "info");
      return;
    }
    if (map.hasLayer(wikiLayer)) {
      map.removeLayer(wikiLayer);
      setQueryExtentVisible("wiki", false);
    } else {
      wikiLayer.addTo(map);
      setQueryExtentVisible("wiki", true);
    }
    syncToolSlotButtonExternal();
  }

  function wikiClearResults() {
    window.FAMapContext?.clearHistory?.("wiki");
    if (wikiController) {
      wikiController.abort();
      wikiController = null;
    }
    wikiLayer?.clearLayers?.();
    wikiHasQueried = false;
    clearQueryExtent("wiki");
    wikiSetStatus("Results cleared");
  }

  function wikiViewQuery(geometry) {
    if (!geometry?.bounds?.isValid?.() || !geometry?.corners?.length) throw new Error("Unable to determine the current map view.");
    const bboxes = canonicalViewportBboxes(geometry.bounds);
    if (!bboxes.length) throw new Error("Unable to determine the current map view.");
    return {bboxes, corners: geometry.corners};
  }

  function wikiPointInView(lat, lon, corners) {
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
      const intersects = ((yi > pointLat) !== (yj > pointLat)) &&
        (pointLng < (xj - xi) * (pointLat - yi) / ((yj - yi) || Number.EPSILON) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function wikiLongitudeForCurrentWorld(lon) {
    const normalized = normalizeWorldLongitude(lon);
    const current = Number(map?.getCenter?.().lng || 0);
    return normalized + Math.round((current - normalized) / 360) * 360;
  }

  function wikiIcon() {
    if (!wikiSharedIcon) {
      wikiSharedIcon = L.divIcon({
        className: "wiki-marker-icon",
        html: `<span class="wiki-marker-glyph" aria-hidden="true"><i class="fa-solid fa-file-word"></i></span>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        tooltipAnchor: [0, -10]
      });
    }
    return wikiSharedIcon;
  }



  function wikiPopupHtml(page, loading = false) {
    const title = esc(page?.title || "Wikipedia article");
    const extract = String(page?.extract || "").trim();
    const thumbnail = page?.thumbnail?.source ? `<img class="wiki-popup-thumb" src="${esc(page.thumbnail.source)}" alt="">` : "";
    const articleUrl = page?.fullurl || `https://en.wikipedia.org/?curid=${encodeURIComponent(page?.pageid || "")}`;
    const summary = loading ? `<div class="wiki-popup-extract">Loading article summary...</div>` : extract ? `<div class="wiki-popup-extract">${esc(extract)}</div>` : "";
    const openRow = `<div class="sar-popup-meta wiki-popup-meta"><div><span>Open</span><strong><a class="sar-meta-link" href="${esc(articleUrl)}" target="_blank" rel="noopener noreferrer">Wikipedia</a></strong></div></div>`;
    return `<div class="wiki-popup-card"><strong class="wiki-popup-title">${title}</strong>${thumbnail}<div class="wiki-popup-body">${summary}${openRow}</div></div>`;
  }

  async function wikiFetchPageDetails(page, signal) {
    const key = String(page?.pageid ?? page?.title ?? "");
    if (!key) return page;
    if (wikiDetailCache.has(key)) return wikiDetailCache.get(key);
    if (wikiDetailLoads.has(key)) return wikiDetailLoads.get(key);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      pageids: String(page.pageid),
      prop: "pageimages|extracts|info",
      inprop: "url",
      pithumbsize: "220",
      exintro: "1",
      explaintext: "1",
      exsentences: "2"
    });
    const load = managedFetch(`${WIKI_API_URL}?${params.toString()}`, {signal}, {timeoutMs: 20000, retries: 1, label: "Wikipedia details", onRetry: () => wikiSetStatus("Wikipedia request delayed; retrying...")})
      .then(response => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      })
      .then(data => {
        if (data?.error) throw new Error(data.error.info || data.error.code || "Wikipedia API error");
        const details = Object.values(data?.query?.pages || {})[0] || {};
        const merged = {...page, ...details, lat: page.lat, lon: page.lon};
        wikiDetailCache.set(key, merged);
        return merged;
      })
      .finally(() => wikiDetailLoads.delete(key));
    wikiDetailLoads.set(key, load);
    return load;
  }

  function wikiSplitBbox([west, south, east, north]) {
    const midLon = (west + east) / 2;
    const midLat = (south + north) / 2;
    return [
      [west, midLat, midLon, north],
      [midLon, midLat, east, north],
      [west, south, midLon, midLat],
      [midLon, south, east, midLat]
    ];
  }

  async function wikiFetchTile(bbox, signal) {
    const [west, south, east, north] = bbox;
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      list: "geosearch",
      gsbbox: `${north}|${west}|${south}|${east}`,
      gslimit: String(WIKI_TILE_LIMIT),
      gsnamespace: "0",
      gsprimary: "primary"
    });
    const response = await managedFetch(`${WIKI_API_URL}?${params.toString()}`, {signal}, {timeoutMs: 20000, retries: 1, label: "Wikipedia query", onRetry: () => wikiSetStatus("Wikipedia request delayed; retrying...")});
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const data = await response.json();
    if (data?.error) throw new Error(data.error.info || data.error.code || "Wikipedia API error");
    return Array.isArray(data?.query?.geosearch) ? data.query.geosearch : [];
  }

  async function wikiCollectBbox(bbox, signal, depth, pageMap) {
    if (pageMap.size >= WIKI_MAX_TOTAL_RESULTS) return;
    let rows;
    try { rows = await wikiFetchTile(bbox, signal); }
    catch (error) {
      const tooBig = /Bounding box is too big|toobig/i.test(String(error?.message || error));
      if (!tooBig || depth >= WIKI_MAX_SPLIT_DEPTH) throw error;
      for (const child of wikiSplitBbox(bbox)) {
        if (pageMap.size >= WIKI_MAX_TOTAL_RESULTS) break;
        await wikiCollectBbox(child, signal, depth + 1, pageMap);
      }
      return;
    }
    if (rows.length >= WIKI_TILE_LIMIT && depth < WIKI_MAX_SPLIT_DEPTH) {
      for (const child of wikiSplitBbox(bbox)) {
        if (pageMap.size >= WIKI_MAX_TOTAL_RESULTS) break;
        await wikiCollectBbox(child, signal, depth + 1, pageMap);
      }
      return;
    }
    for (const page of rows) {
      const lat = Number(page?.lat);
      const lon = Number(page?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      pageMap.set(String(page.pageid ?? page.title), page);
      if (pageMap.size >= WIKI_MAX_TOTAL_RESULTS) break;
    }
  }

  function wikiBindTooltip(marker, page) {
    window.FATooltips.bindInteractive(
      marker,
      wikiPopupHtml(page, true),
      {className: "app-tooltip wiki-article-tooltip", direction: "auto", offset: [0, -12], interactive: true, opacity: 1},
      {
        openOnHover: false,
        clickToOpen: true,
        stopClickPropagation: true,
        disableScrollPropagation: true,
        onElementReady: installTooltipMiddleClickLinks,
        onOpen: () => {
          wikiFetchPageDetails(page, wikiController?.signal).then(details => {
            if (marker.isTooltipOpen()) marker.setTooltipContent(wikiPopupHtml(details, false));
          }).catch(error => {
            if (error?.name === "AbortError") return;
            if (marker.isTooltipOpen()) marker.setTooltipContent(wikiPopupHtml(page, false));
          });
        }
      }
    );
  }

  function wikiRender(pages, query) {
    window.FAMapContext?.clearHistory?.("wiki");
    const layer = wikiEnsureLayer();
    layer.clearLayers();
    let count = 0;
    for (const page of pages) {
      const lat = Number(page?.lat);
      const lon = Number(page?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !wikiPointInView(lat, lon, query.corners)) continue;
      const marker = L.marker([lat, wikiLongitudeForCurrentWorld(lon)], {
        icon: wikiIcon(),
        pmIgnore: true,
        snapIgnore: false,
        keyboard: false,
        bubblingMouseEvents: false,
      });
      wikiBindTooltip(marker, page);
      marker.on("contextmenu", event => {
        if (!window.FAMapContext?.showFeatureMenu) return;
        if (event.originalEvent) {
          event.originalEvent.preventDefault();
          event.originalEvent._faFeatureContextHandled = true;
          L.DomEvent.stopPropagation(event.originalEvent);
        }
        marker.closeTooltip?.();
        const articleUrl = page?.fullurl || `https://en.wikipedia.org/?curid=${encodeURIComponent(page?.pageid || "")}`;
        window.FAMapContext.showFeatureMenu(event, {
          label: "Hide marker",
          hide: () => {
            layer.removeLayer(marker);
            notifyOverpass("Wikipedia marker hidden.", "success");
            window.FAMapContext?.recordAction?.({
              scope: "wiki",
              undoMessage: "Wikipedia marker restored.",
              redoMessage: "Wikipedia marker hidden.",
              undo: () => {
                marker.addTo(layer);
                syncToolSlotButtonExternal();
              },
              redo: () => {
                layer.removeLayer(marker);
                syncToolSlotButtonExternal();
              }
            });
            syncToolSlotButtonExternal();
          },
          convert: () => beginExternalResultPoiDraft(marker, {
            name: page?.title || "Wikipedia article",
            category: "Wikipedia",
            tags: ["Wikipedia"],
            notes: String(page?.extract || ""),
            color: "#1b1e22",
            customFields: {source: "Wikipedia", page_id: page?.pageid ?? "", source_url: articleUrl}
          })
        });
      });
      marker.addTo(layer);
      count += 1;
    }
    if (count && !map.hasLayer(layer)) layer.addTo(map);
    syncToolSlotButtonExternal();
    return count;
  }

  async function wikiQueryCurrentView() {
    if (!map) return;
    if (map.getZoom() < WIKI_MIN_ZOOM) { wikiSyncZoomHint(); return; }
    const queryGeometry = captureQueryExtentGeometry();
    let query;
    try { query = wikiViewQuery(queryGeometry); }
    catch (error) { void 0; const detail = `Wikipedia query failed: ${error?.message || error}`; wikiSetStatus("Query failed.", true, detail); notifyOverpass(detail, "error"); return; }
    setQueryExtent("wiki", queryGeometry);
    wikiLayer?.clearLayers?.();
    syncToolSlotButtonExternal();
    if (wikiController) wikiController.abort();
    const requestController = new AbortController();
    wikiController = requestController;
    wikiHasQueried = true;
    wikiSetStatus("Scanning current view...");
    try {
      const pageMap = new Map();
      for (const bbox of query.bboxes) {
        if (pageMap.size >= WIKI_MAX_TOTAL_RESULTS) break;
        await wikiCollectBbox(bbox, requestController.signal, 0, pageMap);
      }
      if (wikiController !== requestController || requestController.signal.aborted) return;
      const pages = [...pageMap.values()];
      const count = wikiRender(pages, query);
      const capped = pageMap.size >= WIKI_MAX_TOTAL_RESULTS;
      wikiSetStatus(count ? `${count} article${count === 1 ? "" : "s"}${capped ? " (display limit)" : ""}` : "No articles in this view");
      notifyOverpass(count ? `${count} article${count === 1 ? "" : "s"} returned.` : "No articles returned.", count ? "success" : "info");
    } catch (error) {
      if (error?.name === "AbortError") return;
      const wikiTooBig = /Bounding box is too big|toobig/i.test(String(error?.message || error));
      const detail = wikiTooBig ? "" : `Wikipedia query failed: ${error?.message || error}`;
      if (!wikiTooBig) void 0;
      wikiSetStatus(wikiTooBig ? "View too large." : "Query failed.", !wikiTooBig, detail);
      if (!wikiTooBig) notifyOverpass(detail, "error");
    } finally { if (wikiController === requestController) wikiController = null; }
  }

    window.FAWikipedia = {clear: wikiClearResults, isEnabled() {return wikiResultsVisible();}, query: wikiQueryCurrentView, toggle: wikiToggleResults};
    return {init(nextMap) { map = nextMap; nextMap.on("zoomend", wikiSyncZoomHint); wikiSyncZoomHint(); }, attachUi(info, panel) { wikiInfo = info; wikiPanel = panel; wikiSyncZoomHint(); }, wikiClosePanel, wikiResultsVisible, wikiToggleResults, wikiClearResults, wikiQueryCurrentView};
  }
  window.FAWikiModule = Object.freeze({createWikipedia});
})();
