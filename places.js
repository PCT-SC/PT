(() => {
  "use strict";
  function validPoiColor(value) {
    const color = String(value || "").trim();
    if (["#d9dde3", "#c3c7cd"].includes(color.toLowerCase())) return "";
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
  }

  function normalizePlaceSearchText(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  }

  function placeMatchesSearch(place, query) {
    const terms = normalizePlaceSearchText(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    let searchable = "";
    try {
      searchable = JSON.stringify({
        name: place?.name || "",
        category: place?.category || "",
        area_name: place?.area_name || "",
        notes: place?.notes || "",
        sources: place?.sources || [],
        attachments: (place?.attachments || []).map(file => file.name || ""),
        tags: place?.tags || [],
        custom_fields: place?.custom_fields || {},
        center: place?.center || {},
        shape_type: place?.shape_type || "",
        icon: place?.icon || ""
      });
    } catch {
      searchable = [place?.name, place?.category, place?.area_name, place?.notes].join(" ");
    }
    const haystack = normalizePlaceSearchText(searchable);
    return terms.every(term => haystack.includes(term));
  }

  function clonePlaceRevisionValue(value) {
    if (value === undefined) return null;
    return JSON.parse(JSON.stringify(value));
  }

  function placeRevisionSnapshot(place) {
    return {
      name: place?.name || "",
      category: place?.category || "",
      tags: Array.isArray(place?.tags) ? [...place.tags] : [],
      notes: place?.notes || "",
      sources: clonePlaceRevisionValue(place?.sources || []),
      attachments: clonePlaceRevisionValue(place?.attachments || []),
      custom_fields: clonePlaceRevisionValue(place?.custom_fields || {}),
      geometry: clonePlaceRevisionValue(place?.geometry),
      shape_type: place?.shape_type || "point",
      radius_m: Number(place?.radius_m || 0),
      display_center: clonePlaceRevisionValue(place?.display_center),
      area_name: place?.area_name || "",
      area_custom: Boolean(place?.area_custom),
      center: clonePlaceRevisionValue(place?.center),
      favorite: Boolean(place?.favorite),
      icon: place?.icon || "",
      color: validPoiColor(place?.color)
    };
  }

  function placeRevisionRestorePayload(snapshot) {
    const value = snapshot && typeof snapshot === "object" ? snapshot : {};
    return {
      name: String(value.name || ""),
      category: String(value.category || ""),
      tags: Array.isArray(value.tags) ? value.tags : [],
      notes: String(value.notes || ""),
      sources: clonePlaceRevisionValue(value.sources || []),
      attachments: clonePlaceRevisionValue(value.attachments || []),
      custom_fields: clonePlaceRevisionValue(value.custom_fields || {}),
      geometry: clonePlaceRevisionValue(value.geometry),
      shape_type: String(value.shape_type || "point"),
      radius_m: Number(value.radius_m || 0),
      display_center: clonePlaceRevisionValue(value.display_center),
      area_name: String(value.area_name || ""),
      area_custom: Boolean(value.area_custom),
      center: clonePlaceRevisionValue(value.center),
      favorite: Boolean(value.favorite),
      icon: String(value.icon || ""),
      color: validPoiColor(value.color)
    };
  }

  function stablePlaceRevisionValue(value) {
    if (Array.isArray(value)) return value.map(stablePlaceRevisionValue);
    if (value && typeof value === "object") {
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = stablePlaceRevisionValue(value[key]);
      return out;
    }
    return value;
  }

  function placeRevisionPayloadChanged(place, payload) {
    const current = placeRevisionRestorePayload(placeRevisionSnapshot(place));
    const next = placeRevisionRestorePayload(payload);
    return JSON.stringify(stablePlaceRevisionValue(current)) !== JSON.stringify(stablePlaceRevisionValue(next));
  }

  window.FAPoiData = Object.freeze({validPoiColor, normalizePlaceSearchText, placeMatchesSearch, clonePlaceRevisionValue, placeRevisionSnapshot, placeRevisionRestorePayload, stablePlaceRevisionValue, placeRevisionPayloadChanged});
})();
(() => {
  "use strict";
  function markerLabel(meta = {}) {
    const tags = Array.isArray(meta.tags)
      ? meta.tags
      : String(meta.tags || "").split(",").map(tag => tag.trim()).filter(Boolean);
    const source = String(meta.category || "").trim() || tags[0] || String(meta.name || "").trim() || "P";
    return (Array.from(source)[0] || "P").toUpperCase();
  }

  function escapeMarkerText(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function sanitizedSvgIcon(value) {
    const raw = String(value || "").trim();
    if (!raw.toLowerCase().startsWith("<svg")) return "";
    try {
      const parsed = new DOMParser().parseFromString(raw, "image/svg+xml");
      const svg = parsed.documentElement;
      if (!svg || String(svg.localName || "").toLowerCase() !== "svg" || parsed.querySelector("parsererror")) return "";
      const allowedTags = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "lineargradient", "radialgradient", "stop", "clippath", "mask", "use", "symbol", "title", "desc", "pattern", "marker", "text", "tspan"]);
      const sanitizeAttributes = element => {
        for (const attr of Array.from(element.attributes || [])) {
          const name = String(attr.name || "").toLowerCase();
          const attrValue = String(attr.value || "").trim();
          const lowerValue = attrValue.toLowerCase();
          const isNamespace = name === "xmlns" || name === "xmlns:xlink";
          const hasUnsafeUrl = lowerValue.includes("url(") && !(lowerValue.startsWith("url(#") && lowerValue.endsWith(")") && lowerValue.indexOf("url(", 4) === -1);
          if (name.startsWith("on") || name === "style" || (!isNamespace && (lowerValue.includes("javascript:") || lowerValue.includes("data:") || lowerValue.includes("://") || hasUnsafeUrl))) {
            element.removeAttribute(attr.name);
            continue;
          }
          if ((name === "href" || name === "xlink:href") && attrValue && !attrValue.startsWith("#")) {
            element.removeAttribute(attr.name);
          }
        }
      };
      sanitizeAttributes(svg);
      for (const element of Array.from(svg.querySelectorAll("*"))) {
        if (!allowedTags.has(String(element.localName || "").toLowerCase())) {
          element.remove();
          continue;
        }
        sanitizeAttributes(element);
      }
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      return new XMLSerializer().serializeToString(svg);
    } catch {
      return "";
    }
  }

  function fontAwesomeClass(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.length <= 1) return "";
    const parts = raw.toLowerCase().split(/\s+/);
    const style = parts.find(part => /^fa-(solid|regular|brands)$/.test(part)) || "fa-solid";
    let icon = parts.find(part => /^fa-[a-z0-9-]+$/.test(part) && part !== style);
    if (!icon) {
      const name = raw.toLowerCase().replace(/^fa-/, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (name) icon = `fa-${name}`;
    }
    return icon ? `${style} ${icon}` : "";
  }

  let markerSvgInstance = 0;
  function markerIcon(meta = {}, resolveColor) {
    const rawIcon = String(meta.icon || "").trim();
    const customSvg = sanitizedSvgIcon(rawIcon);
    const iconClass = customSvg || rawIcon.startsWith("<") ? "" : fontAwesomeClass(rawIcon);
    const content = customSvg || (iconClass ? `<i class="${iconClass}" aria-hidden="true"></i>` : escapeMarkerText(markerLabel(meta)));
    const color = resolveColor(meta);
    const icon = L.divIcon({
      className: "",
      html: `<div class="poi-marker" style="--marker-color:${color}">${content}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    if (customSvg) {
      const baseCreateIcon = icon.createIcon;
      icon.createIcon = function(oldIcon) {
        const element = baseCreateIcon.call(this, oldIcon);
        const svg = element.querySelector(".poi-marker svg");
        if (!svg) return element;
        const ids = new Map();
        for (const node of [svg, ...svg.querySelectorAll("[id]")]) {
          const id = node.getAttribute("id");
          if (!id) continue;
          const unique = `fa-svg-${++markerSvgInstance}`;
          ids.set(id, unique);
          node.setAttribute("id", unique);
        }
        for (const node of [svg, ...svg.querySelectorAll("*")]) {
          for (const attr of Array.from(node.attributes)) {
            let value = attr.value;
            if ((attr.name === "href" || attr.name === "xlink:href") && value.startsWith("#")) {
              value = "#" + (ids.get(value.slice(1)) || value.slice(1));
            } else if (attr.name === "aria-labelledby" || attr.name === "aria-describedby") {
              value = value.split(/\s+/).map(id => ids.get(id) || id).join(" ");
            } else {
              value = value.replace(/url\(#([^)]+)\)/g, (match, id) => ids.has(id) ? `url(#${ids.get(id)})` : match);
            }
            if (value !== attr.value) node.setAttribute(attr.name, value);
          }
        }
        return element;
      };
    }
    return icon;
  }

  window.FAPoiMarkers = Object.freeze({markerLabel, escapeMarkerText, sanitizedSvgIcon, fontAwesomeClass, markerIcon});
})();
(() => {
  "use strict";
  function createPoiHoverPreviews({state, serializeLayer, formatCoordinates, formatMeasuredDistance, circleAreaMeters, circleCircumferenceMeters, polygonAreaMeters, polygonPerimeterMeters, formatPolygonArea, escapeMarkerText, placeColor}) {
  function poiHoverPreviewHtml(layer, meta = {}) {
    const geo = serializeLayer(layer);
    const center = geo && geo.center ? geo.center : null;
    const name = String(meta.name || "").trim() || "Untitled";
    const category = String(meta.category || "").trim() || "Uncategorized";
    const coordinates = center ? formatCoordinates(center.lat, center.lon) : "Coordinates unavailable";
    const measurements = [];

    if (layer instanceof L.Circle) {
      const radius = layer.getRadius();
      if (state.showPoiCircleDiameter) measurements.push(["DIAMETER", formatMeasuredDistance(radius * 2)]);
      if (state.showPoiCircleRadius) measurements.push(["RADIUS", formatMeasuredDistance(radius)]);
      if (state.showCircleArea) {
        const area = circleAreaMeters(layer);
        if (Number.isFinite(area) && area > 0) measurements.push(["AREA", formatPolygonArea(area)]);
      }
      if (state.showCircleCircumference) {
        const circumference = circleCircumferenceMeters(layer);
        if (Number.isFinite(circumference) && circumference > 0) measurements.push(["CIRCUMFERENCE", formatMeasuredDistance(circumference)]);
      }
    } else if (layer instanceof L.Polygon) {
      if (state.showPolygonArea) {
        const area = polygonAreaMeters(layer);
        if (Number.isFinite(area) && area > 0) measurements.push(["AREA", formatPolygonArea(area)]);
      }
      if (state.showPolygonPerimeter) {
        const perimeter = polygonPerimeterMeters(layer);
        if (Number.isFinite(perimeter) && perimeter > 0) measurements.push(["PERIMETER", formatMeasuredDistance(perimeter)]);
      }
    }

    const measurementHtml = measurements.map(([label, value]) =>
      `<div class="poi-hover-detail"><span class="poi-hover-label">${escapeMarkerText(label)}</span><span>${escapeMarkerText(value)}</span></div>`
    ).join("");

    return `<div class="poi-hover-preview"><div class="poi-hover-name">${escapeMarkerText(name)}</div><div class="poi-hover-category"><span class="poi-hover-category-dot" style="background:${placeColor(meta)}"></span><span>${escapeMarkerText(category)}</span></div><div class="poi-hover-detail"><span class="poi-hover-label">COORDS</span><span>${escapeMarkerText(coordinates)}</span></div>${measurementHtml}</div>`;
  }

  function poiHoverPreviewWithElevation(layer, meta, elevationText) {
    const label = layer instanceof L.Marker ? "ELEVATION" : "ELEVATION (POINT)";
    const row = `<div class="poi-hover-detail"><span class="poi-hover-label">${label}</span><span>${escapeMarkerText(elevationText)}</span></div>`;
    const html = poiHoverPreviewHtml(layer, meta);
    return `${html.slice(0, -6)}${row}</div>`;
  }

    return {poiHoverPreviewWithElevation};
  }
  window.FAPoiHover = Object.freeze({createPoiHoverPreviews});
})();
(() => {
  "use strict";
  function createPlaces({state, updateCurrentLocationStyle, visibleMapCenterLatLng, $, updateCenterCrosshairVisibility, scheduleSettingsSave, refreshCircleMeasurementWorldCopies, refreshPolygonMeasurementWorldCopies, refreshDistanceMeasurementWorldCopies, showToast, hideMapContextMenu, suspendCurrentLocationForAddPoi, updateLocateButton, restoreCurrentLocationAfterAddPoiCancel, hideContextClickMarker, hideImageryInfoTooltip, showMapContextMenu, positionContextMenu, validPoiColor, createPoiMarkerIcon, syncActiveGeometryHandleTheme, distanceMeasurementMarkerIcon, syncMeasurementNodeColor, appTooltipController, normalizeMeasurementLongitude, formatMeasuredElevation, formatMeasuredDistance, measurementTooltipHtml, distanceMeasurementGeodesicLatLngs, formatCoordinates, renderExternalLinks, syncDistanceMarkersFromLayer, updateMeasurementTooltip, commitMeasurementHistory, scheduleLockedMeasurementSave, bindPolygonMeasurementVertexContextMenus, rigidMoveLatLngOnGlobe, rigidMoveLatLngTreeOnGlobe, polygonMeasurementVertexMarkers, removePolygonMeasurementVertexAtPath, installLayerDragAutoPan, fadeCenterCrosshairForPoi, navigateMap, api, placeMatchesSearch, mapNavigationWillAnimate, networkFetch, placeRevisionSnapshot, placeRevisionRestorePayload, placeRevisionPayloadChanged, finalizePendingMeasurementConversion, finalizeCurrentLocationAddPoiSave, restorePendingMeasurementConversion, escapeMarkerText}) {
  function pointInProjectedPoiRing(latlng, ring) {
    if (!state.map || !latlng || !Array.isArray(ring) || ring.length < 3) return false;
    const point = state.map.latLngToLayerPoint(latlng);
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = state.map.latLngToLayerPoint(ring[i]);
      const b = state.map.latLngToLayerPoint(ring[j]);
      const crosses = (a.y > point.y) !== (b.y > point.y);
      if (!crosses) continue;
      const xAtY = (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
      if (point.x < xAtY) inside = !inside;
    }
    return inside;
  }

  function pointInsideEditingPoiShape(latlng, layer) {
    if (!state.map || !latlng || !layer) return false;
    if (layer instanceof L.Circle) {
      return state.map.distance(layer.getLatLng(), latlng) <= layer.getRadius();
    }
    if (!(layer instanceof L.Polygon)) return false;
    const latlngs = layer.getLatLngs();
    if (!Array.isArray(latlngs) || !latlngs.length) return false;
    let polygons;
    if (latlngs[0] && typeof latlngs[0].lat === "number") polygons = [[latlngs]];
    else if (latlngs[0] && latlngs[0][0] && typeof latlngs[0][0].lat === "number") polygons = [latlngs];
    else polygons = latlngs;
    return polygons.some(rings => {
      if (!Array.isArray(rings) || !rings.length || !pointInProjectedPoiRing(latlng, rings[0])) return false;
      return !rings.slice(1).some(ring => pointInProjectedPoiRing(latlng, ring));
    });
  }

  function editingPoiAreaTooltipElement(layer) {
    if (layer instanceof L.Circle) return layer._poiCircleAreaTooltip?.getElement?.() || null;
    if (layer instanceof L.Polygon) return layer.getTooltip?.()?.getElement?.() || null;
    return null;
  }

  let poiSnapCoveredMarkers = new Set();
  let poiSnapRefreshQueued = false;

  function poiSnapVisualElement(layer) {
    if (!(layer instanceof L.Marker)) return null;
    const element = layer.getElement?.() || layer._icon || null;
    return element?.querySelector?.(".poi-marker") || null;
  }

  function isSnapGrabMarker(marker) {
    if (!(marker instanceof L.Marker)) return false;
    const className = String(marker.options?.icon?.options?.className || "");
    const classes = className.split(/\s+/);
    return classes.includes("marker-icon") || classes.includes("measurement-node-icon");
  }

  function refreshPoiSnapCoveredMarkers() {
    poiSnapRefreshQueued = false;
    const map = state.map;
    const handles = [];
    const pois = [];
    const visited = new Set();
    const visit = layer => {
      if (!layer || visited.has(layer)) return;
      visited.add(layer);
      if (layer instanceof L.Marker && layer.getElement?.()) {
        if (isSnapGrabMarker(layer)) handles.push(map.latLngToContainerPoint(layer.getLatLng()));
        else if (poiSnapVisualElement(layer)) pois.push(layer);
      }
      if (typeof layer.eachLayer === "function") layer.eachLayer(visit);
    };
    if (map) map.eachLayer(visit);
    const covered = new Set();
    for (const poi of pois) {
      const position = map.latLngToContainerPoint(poi.getLatLng());
      if (handles.some(point => position.distanceTo(point) <= 3)) covered.add(poi);
    }
    for (const poi of poiSnapCoveredMarkers) {
      if (!covered.has(poi)) poiSnapVisualElement(poi)?.classList.remove("snap-handle-overlap");
    }
    for (const poi of covered) poiSnapVisualElement(poi)?.classList.add("snap-handle-overlap");
    poiSnapCoveredMarkers = covered;
  }

  function schedulePoiSnapCoveredMarkers() {
    if (poiSnapRefreshQueued) return;
    poiSnapRefreshQueued = true;
    requestAnimationFrame(refreshPoiSnapCoveredMarkers);
  }

  function clearPoiSnapCoveredMarker() {
    for (const poi of poiSnapCoveredMarkers) poiSnapVisualElement(poi)?.classList.remove("snap-handle-overlap");
    poiSnapCoveredMarkers.clear();
    schedulePoiSnapCoveredMarkers();
  }

  function setPoiSnapCoveredMarker(layer) {
    schedulePoiSnapCoveredMarkers();
  }

  function bindSnapGrabMarker(marker) {
    if (!isSnapGrabMarker(marker) || marker._poiSnapPreviewBound) return;
    marker._poiSnapPreviewBound = true;
    marker.on("pm:snap pm:unsnap pm:drag pm:dragend move remove", schedulePoiSnapCoveredMarkers);
  }

  function applyPoiAppearance() {
    document.documentElement.style.setProperty("--poi-color", state.poiColor);
    updateCurrentLocationStyle();
    if (!state.map) return;
    for (const [id, layer] of state.placeLayers.entries()) {
      const place = state.places.find(item => item.id === id);
      if (place) applyLayerPresentation(layer, place);
    }
    if (state.pendingLayer) applyLayerPresentation(state.pendingLayer, editorMarkerMeta());
  }

  function layerCenter(layer) {
    if (layer instanceof L.Marker) return layer.getLatLng();
    if (layer._poiCenterMarker) return layer._poiCenterMarker.getLatLng();
    if (layer instanceof L.Circle) return layer._poiDisplayCenter || layer.getLatLng();
    if (layer instanceof L.Polygon) return layer._poiDisplayCenter || polygonLayerAverageCenter(layer);
    return layer.getBounds().getCenter();
  }

  function isLayerCentered(layer) {
    if (!state.map || !layer) return false;
    const center = layerCenter(layer);
    if (!center) return false;
    const viewportLatLng = state.followScreenCenter ? (visibleMapCenterLatLng() || state.map.getCenter()) : state.map.getCenter();
    const worldShift = Math.round((Number(viewportLatLng.lng) - Number(center.lng)) / 360) * 360;
    const target = L.latLng(center.lat, center.lng + worldShift, center.alt);
    const targetPoint = state.map.latLngToContainerPoint(target);
    const viewportCenter = state.followScreenCenter ? state.map.latLngToContainerPoint(viewportLatLng) : state.map.getSize().divideBy(2);
    return targetPoint.distanceTo(viewportCenter) <= 2;
  }

  function clearSidebarPlaceHighlightIfOffCenter() {
    if (!state.selectedId) return;
    const layer = state.placeLayers.get(state.selectedId);
    if (layer && isLayerCentered(layer)) return;
    state.selectedId = null;
    $("place-list")?.querySelector(".place-item.active")?.classList.remove("active");
    updateCenterCrosshairVisibility();
  }




  function clearWrappedPoiCopies(id = null) {
    if (!state.map) return;
    const remove = key => {
      const copies = state.poiWrappedLayers.get(key) || [];
      for (const copy of copies) {
        if (state.map.hasLayer(copy)) state.map.removeLayer(copy);
      }
      state.poiWrappedLayers.delete(key);
    };
    if (id !== null && id !== undefined) {
      remove(id);
      return;
    }
    for (const key of [...state.poiWrappedLayers.keys()]) remove(key);
  }

  function poiWorldOffsetForLongitude(longitude) {
    const value = Number(longitude);
    return Number.isFinite(value) ? Math.round(value / 360) * 360 : 0;
  }

  function poiWorldOffsetForLayer(layer) {
    if (!layer) return 0;
    const center = layerCenter(layer);
    return center ? poiWorldOffsetForLongitude(center.lng) : 0;
  }

  function shiftedLatLngTreeLongitude(value, longitudeDelta) {
    if (Array.isArray(value)) return value.map(item => shiftedLatLngTreeLongitude(item, longitudeDelta));
    if (!value || !Number.isFinite(Number(value.lat)) || !Number.isFinite(Number(value.lng))) return value;
    return L.latLng(Number(value.lat), Number(value.lng) + longitudeDelta, value.alt);
  }

  function setPoiLayerWorldOffset(layer, longitudeOffset) {
    if (!layer) return;
    const targetOffset = Number.isFinite(Number(longitudeOffset)) ? Number(longitudeOffset) : 0;
    const currentOffset = Number.isFinite(Number(layer._poiWorldOffset)) ? Number(layer._poiWorldOffset) : 0;
    const delta = targetOffset - currentOffset;
    if (Math.abs(delta) < 1e-9) {
      layer._poiWorldOffset = targetOffset;
      return;
    }
    if (layer instanceof L.Marker || layer instanceof L.Circle) {
      const point = layer.getLatLng();
      layer.setLatLng([point.lat, point.lng + delta]);
    } else if (layer instanceof L.Polygon) {
      layer.setLatLngs(shiftedLatLngTreeLongitude(layer.getLatLngs(), delta));
      if (layer.redraw) layer.redraw();
    }
    if (layer._poiDisplayCenter) {
      layer._poiDisplayCenter = L.latLng(layer._poiDisplayCenter.lat, layer._poiDisplayCenter.lng + delta);
    }
    if (layer._poiCenterMarker) {
      const markerPoint = layer._poiCenterMarker.getLatLng();
      layer._poiCenterMarker.setLatLng([markerPoint.lat, markerPoint.lng + delta]);
    }
    layer._poiWorldOffset = targetOffset;
  }

  function shiftedGeoJsonCoordinates(value, longitudeOffset) {
    if (!Array.isArray(value)) return value;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      return [Number(value[0]) + longitudeOffset, Number(value[1]), ...value.slice(2)];
    }
    return value.map(item => shiftedGeoJsonCoordinates(item, longitudeOffset));
  }

  function wrappedPoiCopyFromPlace(place, longitudeOffset) {
    if (!state.map || !place?.geometry || !Number.isFinite(longitudeOffset) || longitudeOffset === 0) return null;
    const color = placeColor(place);
    const members = [];
    let shape = null;

    if (place.shape_type === "circle") {
      const [lon, lat] = place.geometry.coordinates || [];
      if (!Number.isFinite(Number(lon)) || !Number.isFinite(Number(lat))) return null;
      shape = L.circle([Number(lat), Number(lon) + longitudeOffset], {
        radius: Number(place.radius_m || 0),
        color,
        fillColor: color,
        weight: 2,
        fillOpacity: state.fillOpacity,
        interactive: true
      });
      members.push(shape);
      const display = displayCenterLatLng(place.display_center);
      const center = display
        ? L.latLng(display.lat, display.lng + longitudeOffset)
        : L.latLng(Number(lat), Number(lon) + longitudeOffset);
      members.push(L.marker(center, {icon: markerIcon(place), interactive: true, keyboard: false}));
    } else if (place.shape_type === "polygon") {
      const geometry = {...place.geometry, coordinates: shiftedGeoJsonCoordinates(place.geometry.coordinates, longitudeOffset)};
      const group = L.geoJSON(geometry, {
        style: {color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity, interactive: true}
      });
      shape = group.getLayers()[0] || null;
      if (!shape) return null;
      shape.options.interactive = true;
      members.push(shape);
      const display = displayCenterLatLng(place.display_center);
      const center = display
        ? L.latLng(display.lat, display.lng + longitudeOffset)
        : polygonLayerAverageCenter(shape);
      if (center) members.push(L.marker(center, {icon: markerIcon(place), interactive: true, keyboard: false}));
    } else {
      const [lon, lat] = place.geometry.coordinates || [];
      if (!Number.isFinite(Number(lon)) || !Number.isFinite(Number(lat))) return null;
      members.push(L.marker([Number(lat), Number(lon) + longitudeOffset], {
        icon: markerIcon(place),
        interactive: true,
        keyboard: false
      }));
    }

    const hoverLayer = shape || members[0] || null;
    const hoverTarget = hoverLayer instanceof L.Marker
      ? hoverLayer
      : members.find(member => member instanceof L.Marker) || null;
    if (hoverLayer) {
      hoverLayer._poiId = place.id;
      hoverLayer._poiWorldOffset = longitudeOffset;
      if (hoverTarget && hoverTarget !== hoverLayer) {
        hoverLayer._poiCenterMarker = hoverTarget;
        hoverTarget._poiParentInteractionsBound = true;
      }
      bindPoiHoverPreview(hoverLayer, place);
    }

    for (const member of members) {
      if (member instanceof L.Path) member.options.className = "fa-poi-hit-target";
      member._poiId = place.id;
      member._poiWorldOffset = longitudeOffset;
      member.options.pmIgnore = true;
      member.options.snapIgnore = false;
      member.options.bubblingMouseEvents = false;
      member.on("click", event => {
        if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        selectPlace(place.id, true, longitudeOffset);
      });
      member.on("contextmenu", event => {
        if (event.originalEvent) {
          event.originalEvent.preventDefault();
          L.DomEvent.stopPropagation(event.originalEvent);
        }
        const contextLayer = shape || member;
        contextLayer._poiId = place.id;
        contextLayer._poiWorldOffset = longitudeOffset;
        showPoiContextMenu(event, contextLayer);
      });
      member.on("dblclick", event => {
        if (event.originalEvent) {
          L.DomEvent.preventDefault(event.originalEvent);
          L.DomEvent.stopPropagation(event.originalEvent);
        }
        selectPlace(place.id, true, longitudeOffset, true);
      });
    }
    const copy = L.layerGroup(members);
    copy.options.pmIgnore = true;
    copy.options.snapIgnore = false;
    return copy;
  }

  function refreshWrappedPoiCopies() {

    if (!state.map) return;
    clearWrappedPoiCopies();
    const centerLongitude = Number(state.map.getCenter()?.lng || 0);
    const worldIndex = Math.round(centerLongitude / 360);
    const worldOffsets = [worldIndex - 1, worldIndex, worldIndex + 1]
      .filter(index => index !== 0)
      .map(index => index * 360);
    if (!worldOffsets.length) return;

    const category = $("category-filter").value;
    for (const place of state.places) {
      const layer = state.placeLayers.get(place.id);
      if (!layer || state.editingLayer === layer || state.pendingLayer === layer) continue;
      const categoryVisible = !state.filterMapByCategory || placeMatchesCategoryFilter(place, category);
      const favoritesVisible = !$("favorites-only").checked || Boolean(place.favorite);
      const hidePoisVisible = (!state.hidePois && !isPlaceCategoryHidden(place)) || isLayerCentered(layer);
      if (!(categoryVisible && favoritesVisible && hidePoisVisible)) continue;
      const copies = [];
      for (const longitudeOffset of worldOffsets) {
        const copy = wrappedPoiCopyFromPlace(place, longitudeOffset);
        if (!copy) continue;
        copy.addTo(state.map);
        copies.push(copy);
      }
      if (copies.length) state.poiWrappedLayers.set(place.id, copies);
    }
  }

  // Research source URLs are saved in place JSON. Media blobs are stored separately in IndexedDB.
  let editorAttachments = [];
  let newlyAddedAttachmentIds = new Set();
  let attachmentPreviewUrls = [];
  let addingAttachments = false;
  let editorResearchSession = 0;

  function editorSources() {
    return Array.from($("poi-source-list").querySelectorAll("input"))
      .map(input => input.value.trim()).filter(Boolean);
  }

  function renderSources(values = []) {
    const container = $("poi-source-list");
    container.replaceChildren();
    for (const source of values) addSourceRow(source);
    if (!values.length) {
      const hint = document.createElement("div");
      hint.className = "poi-attachment-help";
      hint.textContent = "No sources yet";
      container.append(hint);
    }
  }

  function addSourceRow(value = "") {
    const container = $("poi-source-list");
    const empty = container.querySelector(".poi-attachment-help");
    if (empty) empty.remove();
    const row = document.createElement("div");
    row.className = "poi-source-row";
    const input = document.createElement("input");
    input.type = "url";
    input.setAttribute("aria-label", "Source URL");
    input.placeholder = "https://...";
    input.autocomplete = "off";
    input.value = value;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary small";
    remove.setAttribute("aria-label", "Remove source");
    remove.title = "Remove source";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      row.remove();
      if (!container.querySelector(".poi-source-row")) renderSources([]);
    });
    const open = document.createElement("a");
    open.href = "#";
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "↗";
    open.setAttribute("aria-label", "Open source");
    open.title = "Open source";
    const updateLink = () => {
      try { const url = new URL(input.value.trim());
        open.href = ["https:", "http:"].includes(url.protocol) ? url.href : "#";
      } catch { open.href = "#"; }
      open.hidden = open.getAttribute("href") === "#";
    };
    input.addEventListener("input", updateLink);
    open.addEventListener("click", event => { if (open.hidden) event.preventDefault(); });
    updateLink();
    row.append(input, open, remove);
    container.append(row);
    return input;
  }

  function clearAttachmentPreviews() {
    for (const url of attachmentPreviewUrls) URL.revokeObjectURL(url);
    attachmentPreviewUrls = [];
    $("poi-attachment-list").replaceChildren();
  }

  async function renderAttachments() {
    clearAttachmentPreviews();
    const container = $("poi-attachment-list");
    if (!editorAttachments.length) {
      const hint = document.createElement("div");
      hint.textContent = "No attachments yet";
      hint.className = "poi-attachment-help";
      container.append(hint);
      return;
    }
    const expectedId = $("record-id").value;
    const expectedAttachmentIds = editorAttachments.map(a => a.id).join(",");
    for (const item of editorAttachments) {
      const stored = await window.FALocalStore.readAttachment(item.id);
      if (expectedId !== $("record-id").value || expectedAttachmentIds !== editorAttachments.map(a => a.id).join(",")) return;
      const card = document.createElement("div");
      card.className = "poi-attachment-card";
      if (stored?.blob instanceof Blob) {
        const url = URL.createObjectURL(stored.blob);
        attachmentPreviewUrls.push(url);
        const preview = document.createElement(item.type.startsWith("video/") ? "video" : "img");
        preview.className = "poi-attachment-preview";
        preview.src = url;
        if (preview.tagName === "VIDEO") { preview.controls = true; preview.preload = "metadata"; }
        else preview.alt = item.name;
        if (preview.tagName === "IMG") {
          const link = document.createElement("a");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.setAttribute("aria-label", "Open attachment");
          link.append(preview);
          card.append(link);
        } else card.append(preview);
      }
      const filename = document.createElement("span");
      filename.className = "poi-attachment-name";
      filename.textContent = item.name;
      filename.title = item.name;
      filename.setAttribute("data-no-translate", "");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary small poi-remove-media";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove attachment");
      remove.addEventListener("click", () => {
        editorAttachments = editorAttachments.filter(attachment => attachment.id !== item.id);
        void renderAttachments().catch(() => {});
      });
      card.append(filename, remove);
      container.append(card);
    }
  }

  // Re-encoding removes the source image EXIF/XMP and original filename; visible content may still identify people or locations.
  function anonymousMediaName(prefix, extension) {
    const random = new Uint8Array(8);
    crypto.getRandomValues(random);
    const suffix = Array.from(random, byte => byte.toString(16).padStart(2, "0")).join("");
    return `${prefix}-${suffix}.${extension}`;
  }

  async function prepareImage(file) {
    const bitmap = await createImageBitmap(file);
    try {
      const factor = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * factor));
      canvas.height = Math.max(1, Math.round(bitmap.height * factor));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", .88));
      if (!blob) throw new Error("Image conversion was not supported by this browser.");
      return {blob, name: anonymousMediaName("image", "webp")};
    } finally { bitmap.close(); }
  }

  async function addSelectedAttachments(files) {
    if (addingAttachments) return;
    addingAttachments = true;
    $("poi-add-attachment").disabled = true;
    const initialId = $("record-id").value;
    const initialSession = editorResearchSession;
    let videoWarningAccepted = false;
    const stillEditing = () => editorResearchSession === initialSession &&
      !$("editor").classList.contains("hidden") && $("record-id").value === initialId;
    try {
      for (const file of files) {
        if (!stillEditing()) break;
        const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
        const isVideo = ["video/mp4", "video/webm", "video/quicktime"].includes(file.type);
        if (!isImage && !isVideo) { showToast("Choose a JPG, PNG, WebP, MP4, WebM, or MOV file."); continue; }
        if (file.size > (isImage ? 15 : 25) * 1024 * 1024) { showToast("File is too large (15 MB images, 25 MB videos)."); continue; }
        try {
          // We cannot remove video metadata safely with the available browser-only codecs.
          // Obtain explicit consent for retaining an original video file.
          if (isVideo && !videoWarningAccepted) {
            videoWarningAccepted = window.confirm("Videos are stored without removing embedded metadata. They may expose device, capture time or GPS information. Add these videos anyway?");
            if (!videoWarningAccepted) break;
          }
          const prepared = isImage ? await prepareImage(file) : {
            blob: file,
            name: anonymousMediaName("video", file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4")
          };
          if (!stillEditing()) break;
          const entry = await window.FALocalStore.saveAttachment(prepared.blob, {name:prepared.name});
          if (!stillEditing()) {
            await window.FALocalStore.deleteUnreferencedAttachments([entry.id]);
            break;
          }
          editorAttachments.push(entry);
          newlyAddedAttachmentIds.add(entry.id);
          await renderAttachments();
        } catch (error) {
          showToast(`Unable to add attachment: ${error.message}`);
        }
      }
    } finally {
      addingAttachments = false;
      $("poi-add-attachment").disabled = false;
      $("poi-attachment-input").value = "";
    }
  }

  function resetEditorResearch(place) {
    editorResearchSession += 1;
    const abandoned = [...newlyAddedAttachmentIds];
    newlyAddedAttachmentIds = new Set();
    if (abandoned.length) void window.FALocalStore.deleteUnreferencedAttachments(abandoned).catch(() => {});
    editorAttachments = Array.isArray(place?.attachments) ? place.attachments.map(item => ({...item})) : [];
    clearAttachmentPreviews();
    renderSources(Array.isArray(place?.sources) ? place.sources : []);
    void renderAttachments().catch(() => {});
  }

  function finishSavedResearch(oldAttachments = []) {
    const removed = oldAttachments.filter(item => !editorAttachments.some(next => next.id === item.id)).map(item => item.id);
    newlyAddedAttachmentIds = new Set();
    if (removed.length) void window.FALocalStore.deleteUnreferencedAttachments(removed).catch(() => {});
  }

  $("poi-add-source").addEventListener("click", () => addSourceRow().focus());
  $("poi-add-attachment").addEventListener("click", () => $("poi-attachment-input").click());
  $("poi-attachment-input").addEventListener("change", event => void addSelectedAttachments(Array.from(event.target.files || [])));

  const UNCATEGORIZED_CATEGORY_FILTER = "__fa_uncategorized__";

  function placeCategoryFilterValue(place) {
    const category = String(place?.category || "").trim();
    return category || UNCATEGORIZED_CATEGORY_FILTER;
  }

  function allPoiCategoryFilterValues() {
    return [...new Set(state.places.map(placeCategoryFilterValue))];
  }

  function activeHiddenPoiCategoryCount() {
    const available = new Set(allPoiCategoryFilterValues());
    let count = 0;
    for (const category of state.hiddenPoiCategories) if (available.has(category)) count += 1;
    return count;
  }

  function isPlaceCategoryHidden(place) {
    return state.hiddenPoiCategories.has(placeCategoryFilterValue(place));
  }

  function poiLayerHiddenByVisibility(layer) {
    const id = layer?._poiId;
    const place = id ? state.places.find(item => item.id === id) : null;
    return Boolean(state.hidePois || (place && isPlaceCategoryHidden(place)));
  }

  function refreshPoiCategoryHideUi() {
    populateCategories();
    syncHidePoisMapControl();
  }

  function syncHidePoisMapControl() {
    const button = $("sidebar-hide-pois-toggle");
    if (!button) return;
    const selectedCategory = $("category-filter")?.value || "";
    const categoryHidden = Boolean(selectedCategory && (state.hidePois || state.hiddenPoiCategories.has(selectedCategory)));
    const allHidden = Boolean(!selectedCategory && state.hidePois);
    const partiallyHidden = Boolean(!selectedCategory && !state.hidePois && activeHiddenPoiCategoryCount() > 0);
    const hidden = categoryHidden || allHidden;
    button.innerHTML = `<i class="fa-solid ${hidden || partiallyHidden ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i>`;
    button.classList.toggle("active", hidden);
    button.classList.toggle("mixed", partiallyHidden);
    let label = "Hide all POIs";
    if (selectedCategory) {
      const name = selectedCategory === UNCATEGORIZED_CATEGORY_FILTER ? "Uncategorized" : selectedCategory;
      label = categoryHidden ? `Show ${name} POIs` : `Hide ${name} POIs`;
    } else if (allHidden) {
      label = "Show all POIs";
    }
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", partiallyHidden ? "mixed" : (hidden ? "true" : "false"));
  }

  function syncFavoritesToggle() {
    const input = $("favorites-only");
    const button = $("favorites-toggle");
    if (!input || !button) return;
    const active = Boolean(input.checked);
    button.innerHTML = `<i class="${active ? "fa-solid" : "fa-regular"} fa-star" aria-hidden="true"></i>`;
    button.classList.toggle("active", active);
    const label = active ? "Show all places" : "Show favorites only";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function setHidePois(nextValue) {
    state.hidePois = Boolean(nextValue);
    scheduleSettingsSave();
    if (!state.hidePois) {
      for (const layer of state.placeLayers.values()) {
        layer._hiddenPoiSidebarPreview = false;
        layer._hiddenPoiSidebarPreviewShown = false;
        layer._hiddenPoiSidebarPreviewFading = false;
        for (const element of poiLayerVisualElements(layer)) {
          element.style.removeProperty("transition");
          element.style.removeProperty("opacity");
        }
      }
    }
    updatePoiVisibility();
    refreshCircleMeasurementWorldCopies();
    refreshPolygonMeasurementWorldCopies();
    refreshDistanceMeasurementWorldCopies();
    syncHidePoisMapControl();
  }

  function toggleSidebarPoiVisibility() {
    const selectedCategory = $("category-filter")?.value || "";
    if (!selectedCategory) {
      const hasHiddenCategories = activeHiddenPoiCategoryCount() > 0;
      if (state.hidePois || hasHiddenCategories) {
        state.hiddenPoiCategories.clear();
        setHidePois(false);
        refreshPoiCategoryHideUi();
        return;
      }
      setHidePois(true);
      return;
    }

    if (state.hidePois) {
      state.hidePois = false;
      state.hiddenPoiCategories = new Set(allPoiCategoryFilterValues().filter(value => value !== selectedCategory));
    } else if (state.hiddenPoiCategories.has(selectedCategory)) {
      state.hiddenPoiCategories.delete(selectedCategory);
    } else {
      state.hiddenPoiCategories.add(selectedCategory);
    }

    scheduleSettingsSave();
    refreshPoiCategoryHideUi();
    updatePoiVisibility();
    refreshCircleMeasurementWorldCopies();
    refreshPolygonMeasurementWorldCopies();
    refreshDistanceMeasurementWorldCopies();
  }

  function poiLayerVisualElements(layer) {
    return [layer?._icon, layer?._path, layer?._poiCenterMarker?._icon].filter(Boolean);
  }

  function fadeHiddenPoiPreviewIn(layer) {
    if (!layer || !poiLayerHiddenByVisibility(layer) || layer._hiddenPoiSidebarPreviewShown) return;
    layer._hiddenPoiSidebarPreview = true;
    layer._hiddenPoiSidebarPreviewShown = true;
    const elements = poiLayerVisualElements(layer);
    for (const element of elements) {
      element.style.transition = "none";
      element.style.opacity = "0";
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!layer._hiddenPoiSidebarPreview || !state.map?.hasLayer(layer)) return;
      for (const element of elements) {
        element.style.transition = "opacity 260ms ease";
        element.style.opacity = "1";
      }
    }));
  }

  function fadeHiddenPoiPreviewOut(layer) {
    if (!layer?._hiddenPoiSidebarPreview || layer._hiddenPoiSidebarPreviewFading) return false;
    layer._hiddenPoiSidebarPreviewFading = true;
    const elements = poiLayerVisualElements(layer);
    for (const element of elements) {
      element.style.transition = "opacity 260ms ease";
      element.style.opacity = "1";
    }
    requestAnimationFrame(() => { for (const element of elements) element.style.opacity = "0"; });
    setTimeout(() => {
      layer._hiddenPoiSidebarPreviewFading = false;
      layer._hiddenPoiSidebarPreview = false;
      layer._hiddenPoiSidebarPreviewShown = false;
      for (const element of elements) {
        element.style.removeProperty("transition");
        element.style.removeProperty("opacity");
      }
      if (poiLayerHiddenByVisibility(layer) && state.editingLayer !== layer && !isLayerCentered(layer)) removeLayerAndCenter(layer);
    }, 280);
    return true;
  }

  function updatePoiVisibility() {
    if (!state.map) return;
    const category = $("category-filter").value;
    for (const [id, layer] of state.placeLayers.entries()) {
      const place = state.places.find(item => item.id === id);
      const categoryVisible = !state.filterMapByCategory || placeMatchesCategoryFilter(place, category);
      const favoritesVisible = !$("favorites-only").checked || Boolean(place?.favorite);
      const hidePoisVisible = (!state.hidePois && !isPlaceCategoryHidden(place)) || state.editingLayer === layer || isLayerCentered(layer);
      const visible = state.editingLayer === layer || (categoryVisible && favoritesVisible && hidePoisVisible);
      if (visible && !state.map.hasLayer(layer)) layer.addTo(state.map);
      if (!visible && state.map.hasLayer(layer) && !fadeHiddenPoiPreviewOut(layer)) state.map.removeLayer(layer);
      if (layer._poiCenterMarker) {
        if (visible && !state.map.hasLayer(layer._poiCenterMarker)) layer._poiCenterMarker.addTo(state.map);
        if (!visible && state.map.hasLayer(layer._poiCenterMarker) && !layer._hiddenPoiSidebarPreviewFading) state.map.removeLayer(layer._poiCenterMarker);
      }
      syncPoiMarkerCoordinates(layer);
      if (visible && layer._hiddenPoiSidebarPreview && !layer._hiddenPoiSidebarPreviewFading) fadeHiddenPoiPreviewIn(layer);
    }
    refreshWrappedPoiCopies();
    syncHidePoisMapControl();
  }

  function editorStateSignature() {
    const id = $("record-id").value;
    const layer = id ? state.placeLayers.get(id) : state.pendingLayer;
    if (!layer) return "";
    const geo = serializeLayer(layer);
    return JSON.stringify({
      name: $("name").value,
      category: editorCategoryValue(),
      tags: $("tags").value,
      notes: $("notes").value,
      sources: editorSources(),
      attachments: editorAttachments.map(({id, name, type, size}) => ({id, name, type, size})),
      custom_fields: $("custom-fields").value,
      area_name: $("area-name").value,
      area_custom: state.editorAreaCustom,
      favorite: $("favorite").checked,
      icon: $("icon").value,
      color: $("place-color").value,
      geometry: geo.geometry,
      radius_m: geo.radius_m,
      display_center: serializedDisplayCenter(layer)
    });
  }

  function hasUnsavedEditorChanges() {
    if ($("editor").classList.contains("hidden")) return false;
    if (!$("record-id").value && state.pendingLayer) return true;
    return state.editorSnapshot !== null && editorStateSignature() !== state.editorSnapshot;
  }

  function closeEditorWithPrompt() {
    if ($("editor").classList.contains("hidden")) return true;
    if (hasUnsavedEditorChanges() && !window.confirm("Discard unsaved changes?")) return false;
    closeEditor();
    return true;
  }

  window.addEventListener("beforeunload", event => {
    if (!hasUnsavedEditorChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  async function addPoiAtLatLng(latlng, fromCurrentLocation = false, initialCustomFields = null) {
    if (!latlng) return;
    if (state.pendingLayer) {
      showToast("Save, Delete, or Close current POI prior to adding another.");
      showEditorPanel();
      $("name").focus();
      return;
    }
    if (!$("editor").classList.contains("hidden") && !closeEditorWithPrompt()) return;

    state.map.pm.disableDraw();
    $("add-menu").classList.add("hidden");
    hideMapContextMenu();

    const customFields = initialCustomFields && typeof initialCustomFields === "object" ? {...initialCustomFields} : {};
    if (fromCurrentLocation) {
      const accuracy = Number(state.currentLocationAccuracy);
      if (Number.isFinite(accuracy) && accuracy > 0) customFields.gps_accuracy_m = Math.round(accuracy * 10) / 10;
      if (!suspendCurrentLocationForAddPoi()) return;
    }

    const layer = L.marker(L.latLng(latlng), {icon: markerIcon({icon: "location-dot"})}).addTo(state.map);
    state.pendingLayer = layer;
    if (fromCurrentLocation) {
      state.currentLocationAddPoiPendingLayer = layer;
      updateLocateButton();
    }
    bindLayerClicks(layer, null);
    try {
      await openEditor(null, layer);
      if (Object.keys(customFields).length) {
        $("custom-fields").value = JSON.stringify(customFields, null, 2);
        state.editorSnapshot = editorStateSignature();
      }
    } catch (error) {
      if (fromCurrentLocation) restoreCurrentLocationAfterAddPoiCancel(layer);
      throw error;
    }
  }

  function showPoiContextMenu(event, layer) {
    hideContextClickMarker();
    hideImageryInfoTooltip();
    $("current-location-context-menu").classList.add("hidden");
    $("measurement-context-menu").classList.add("hidden");
    state.measureContextLayer = null;
    if (event?.originalEvent) {
      event.originalEvent.preventDefault();
      L.DomEvent.stopPropagation(event.originalEvent);
    }
    const id = layer?._poiId;
    const place = id ? state.places.find(item => item.id === id) : null;
    if (!id || !place) {
      showMapContextMenu(event);
      return;
    }

    $("map-context-menu").classList.add("hidden");
    $("context-add-menu").classList.add("hidden");
    state.poiContextId = id;
    const target = layer instanceof L.Marker ? layer : layer._poiCenterMarker;
    if (target && typeof target.closeTooltip === "function") target.closeTooltip();

    const menu = $("poi-context-menu");
    menu.classList.remove("hidden");
    positionContextMenu(menu, event, layerCenter(layer));
  }

  function placeColor(place) {
    return validPoiColor(place && place.color) || state.poiColor;
  }


  function markerIcon(meta = {}) { return createPoiMarkerIcon(meta, placeColor); }

  function editorMarkerMeta() {
    return {
      name: $("name").value,
      category: editorCategoryValue(),
      tags: $("tags").value,
      icon: $("icon").value,
      color: $("place-color").value || state.poiColor
    };
  }

  function removeLayerAndCenter(layer) {
    if (!layer || !state.map) return;
    if (layer._poiCoordinatesTooltip) { state.map.removeLayer(layer._poiCoordinatesTooltip); layer._poiCoordinatesTooltip = null; }
    if (layer._poiCenterMarker && state.map.hasLayer(layer._poiCenterMarker)) state.map.removeLayer(layer._poiCenterMarker);
    if (state.map.hasLayer(layer)) state.map.removeLayer(layer);
  }

  function displayCenterLatLng(value) {
    const lat = Number(value?.lat);
    const lon = Number(value?.lon ?? value?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return L.latLng(lat, lon);
  }

  function polygonDisplayCenter(layer) {
    return layer?._poiDisplayCenter || polygonLayerAverageCenter(layer);
  }

  function serializedDisplayCenter(layer) {
    if (!(layer instanceof L.Circle || layer instanceof L.Polygon) || !layer._poiDisplayCenter) return null;
    const worldOffset = poiWorldOffsetForLayer(layer);
    return {lat: layer._poiDisplayCenter.lat, lon: layer._poiDisplayCenter.lng - worldOffset};
  }

  function editorPoiIconLatLng(layer) {
    if (!layer) return null;
    if (layer instanceof L.Marker) return layer.getLatLng();
    if (layer._poiCenterMarker) return layer._poiCenterMarker.getLatLng();
    if (layer._poiDisplayCenter) return layer._poiDisplayCenter;
    if (layer instanceof L.Circle) return layer.getLatLng();
    if (layer instanceof L.Polygon) return polygonLayerAverageCenter(layer);
    return null;
  }

  function shapeTypeForLayer(layer) {
    if (layer instanceof L.Circle) return "circle";
    if (layer instanceof L.Marker) return "point";
    if (layer instanceof L.Polygon) return "polygon";
    return "";
  }

  function syncShapeConvertOffsetForDragMenu() {
    const convertWrap = $("shape-convert-wrap");
    const dragWrap = $("polygon-drag-wrap");
    const dragMenu = $("polygon-drag-menu");
    if (!convertWrap || !dragWrap || !dragMenu) return;
    const dragMenuOpen = !dragWrap.classList.contains("hidden") && !dragMenu.classList.contains("hidden");
    convertWrap.classList.toggle("drag-menu-open", dragMenuOpen);
    convertWrap.style.removeProperty("top");
  }

  function syncShapeConvertControl() {
    const layer = state.editingLayer;
    const wrap = $("shape-convert-wrap");
    if (!wrap) return;
    if (!layer || $("editor").classList.contains("hidden")) {
      wrap.classList.add("hidden");
      $("shape-convert-menu").classList.add("hidden");
      return;
    }

    const current = shapeTypeForLayer(layer);
    wrap.classList.remove("hidden");
    wrap.classList.toggle("below-drag", current === "circle" || current === "polygon");

    const pointButton = $("shape-convert-point");
    const circleButton = $("shape-convert-circle");
    const polygonButton = $("shape-convert-polygon");
    const areaButton = $("shape-convert-circle-area");
    const perimeterButton = $("shape-convert-circle-perimeter");

    pointButton.classList.toggle("active", current === "point");
    pointButton.disabled = current === "point";
    polygonButton.classList.toggle("active", current === "polygon");
    polygonButton.disabled = current === "polygon";

    const polygonSource = current === "polygon";
    circleButton.classList.toggle("hidden", polygonSource);
    circleButton.classList.toggle("active", current === "circle");
    circleButton.disabled = current === "circle";
    areaButton.classList.toggle("hidden", !polygonSource);
    perimeterButton.classList.toggle("hidden", !polygonSource);
    requestAnimationFrame(syncShapeConvertOffsetForDragMenu);
  }

  function makeEditorLayerFromSnapshot(snapshot) {
    if (!snapshot || !snapshot.geometry) return null;
    const color = placeColor(editorMarkerMeta());
    let layer = null;
    if (snapshot.shape_type === "point") {
      const [lon, lat] = snapshot.geometry.coordinates;
      layer = L.marker([lat, lon], {icon: markerIcon(editorMarkerMeta())});
    } else if (snapshot.shape_type === "circle") {
      const [lon, lat] = snapshot.geometry.coordinates;
      layer = L.circle([lat, lon], {
        radius: Number(snapshot.radius_m) || 1000,
        color,
        fillColor: color,
        weight: 2,
        fillOpacity: state.fillOpacity
      });
      layer._poiDisplayCenter = displayCenterLatLng(snapshot.display_center);
    } else if (snapshot.shape_type === "polygon") {
      const group = L.geoJSON(snapshot.geometry, {
        style: {color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity}
      });
      layer = group.getLayers()[0] || null;
      if (layer) layer._poiDisplayCenter = displayCenterLatLng(snapshot.display_center);
    }
    return layer;
  }

  function replaceEditingLayer(newLayer, {commitHistory = true} = {}) {
    const oldLayer = state.editingLayer;
    if (!oldLayer || !newLayer) return null;
    const id = $("record-id").value;

    disableGeometryEditing(true);
    removeLayerAndCenter(oldLayer);

    if (id) {
      newLayer._poiId = id;
      state.placeLayers.set(id, newLayer);
    } else {
      state.pendingLayer = newLayer;
    }

    if (!state.map.hasLayer(newLayer)) newLayer.addTo(state.map);
    bindLayerClicks(newLayer, id || null);
    applyLayerPresentation(newLayer, editorMarkerMeta());
    enableGeometryEditing(newLayer, true);
    updateEditorGeometry(newLayer);
    syncShapeConvertControl();
    if (commitHistory) commitEditorHistory(newLayer);
    return newLayer;
  }

  function convertEditingShape(target) {
    const layer = state.editingLayer;
    if (!layer) return;
    const current = shapeTypeForLayer(layer);
    if (!current) return;
    commitEditorHistory(layer);

    const color = placeColor(editorMarkerMeta());
    if (target === "polygon") {
      state.map.getContainer().classList.add("markup-polygon-draw-active");
      state.map.getContainer().style.setProperty("--markup-draw-color", color);
      if (current === "polygon") return;
      beginPolygonShapeConversion();
      return;
    }

    if (target === "point") {
      if (current === "point") return;
      const iconCenter = editorPoiIconLatLng(layer);
      if (!iconCenter) return;
      replaceEditingLayer(L.marker(iconCenter, {icon: markerIcon(editorMarkerMeta())}));
      return;
    }

    if (target === "circle") {
      if (current === "circle") return;
      if (current === "point") {
        beginCircleShapeConversion();
      }
      return;
    }

    if (current === "polygon" && (target === "circle-area" || target === "circle-perimeter")) {
      const iconCenter = editorPoiIconLatLng(layer);
      const center = iconCenter || polygonLayerAverageCenter(layer);
      const radius = target === "circle-area"
        ? Math.sqrt(polygonAreaMeters(layer) / Math.PI)
        : polygonPerimeterMeters(layer) / (2 * Math.PI);
      if (!center || !Number.isFinite(radius) || radius <= 0) {
        showToast("Unable to calculate equivalent circle.");
        return;
      }
      const circle = L.circle(center, {
        radius,
        color: placeColor(editorMarkerMeta()),
        fillColor: placeColor(editorMarkerMeta()),
        weight: 2,
        fillOpacity: state.fillOpacity
      });
      if (iconCenter) circle._poiDisplayCenter = L.latLng(iconCenter.lat, iconCenter.lng);
      replaceEditingLayer(circle);
    }
  }

  function fadeOutEditorSideControlsForPolygonConversion() {
    const wraps = [$("polygon-drag-wrap"), $("shape-convert-wrap")];
    for (const wrap of wraps) {
      if (!wrap) continue;
      wrap.classList.add("conversion-fade-out");
      wrap.classList.add("hidden");
    }
    $("polygon-drag-menu").classList.add("hidden");
    $("shape-convert-menu").classList.add("hidden");
    setTimeout(() => {
      for (const wrap of wraps) {
        if (wrap?.classList.contains("hidden")) wrap.classList.remove("conversion-fade-out");
      }
    }, 120);
  }

  function detachCircleShapeConversion(conversion) {
    if (!conversion) return;
    if (conversion.moveHandler) state.map?.off("mousemove", conversion.moveHandler);
    if (conversion.clickHandler) state.map?.off("click", conversion.clickHandler);
    state.map?.getContainer()?.classList.remove("circle-radius-conversion-mode");
    if (conversion.previewLayer) hideCircleArea(conversion.previewLayer);
    for (const helper of [conversion.radiusLine, conversion.centerMarker, conversion.radiusMarker]) {
      if (helper && state.map?.hasLayer(helper)) state.map.removeLayer(helper);
    }
  }

  function beginCircleShapeConversion() {
    const sourceLayer = state.editingLayer;
    if (!(sourceLayer instanceof L.Marker) || state.shapeConversion) return;
    const id = $("record-id").value;
    const center = L.latLng(sourceLayer.getLatLng());
    const conversion = {type: "circle", sourceLayer, id, center, previewLayer: null, radiusLine: null, centerMarker: null, radiusMarker: null, moveHandler: null, clickHandler: null};
    state.shapeConversion = conversion;
    syncActiveGeometryHandleTheme();
    disableGeometryEditing(true);
    removeLayerAndCenter(sourceLayer);
    if (id) state.placeLayers.delete(id);
    else state.pendingLayer = null;
    fadeOutEditorSideControlsForPolygonConversion();
    const color = placeColor(editorMarkerMeta());
    const preview = L.circle(center, {radius: 1, color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity, interactive: false, pmIgnore: true, snapIgnore: true}).addTo(state.map);
    conversion.previewLayer = preview;
    conversion.radiusLine = L.polyline([center, center], {color, weight: 2, opacity: 1, dashArray: "5,5", interactive: false, pmIgnore: true, snapIgnore: true}).addTo(state.map);
    conversion.centerMarker = L.marker(center, {icon: distanceMeasurementMarkerIcon(), interactive: false, keyboard: false, riseOnHover: true, zIndexOffset: 1000, pmIgnore: true, snapIgnore: true}).addTo(state.map);
    conversion.radiusMarker = L.marker(center, {icon: distanceMeasurementMarkerIcon(), interactive: false, keyboard: false, riseOnHover: true, zIndexOffset: 1000, pmIgnore: true, snapIgnore: true}).addTo(state.map);
    syncMeasurementNodeColor(conversion.centerMarker, color);
    syncMeasurementNodeColor(conversion.radiusMarker, color);
    state.map.getContainer().classList.add("circle-radius-conversion-mode");
    const update = latlng => {
      if (!latlng) return;
      const endpoint = L.latLng(latlng);
      preview.setRadius(Math.max(1, state.map.distance(center, endpoint)));
      conversion.radiusLine.setLatLngs([center, endpoint]);
      conversion.radiusMarker.setLatLng(endpoint);
      conversion.radiusLine.bringToFront?.();
      conversion.centerMarker.setZIndexOffset?.(1000);
      conversion.radiusMarker.setZIndexOffset?.(1000);
      showCircleArea(preview);
    };
    conversion.moveHandler = event => {
      if (state.shapeConversion !== conversion || !event?.latlng) return;
      update(event.latlng);
    };
    conversion.clickHandler = event => {
      if (state.shapeConversion !== conversion || !event?.latlng) return;
      if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
      update(event.latlng);
      finishCircleShapeConversion(conversion);
    };
    state.map.on("mousemove", conversion.moveHandler);
    state.map.on("click", conversion.clickHandler);
  }

  function finishCircleShapeConversion(conversion) {
    if (!conversion || state.shapeConversion !== conversion || !conversion.previewLayer) return;
    const radius = conversion.previewLayer.getRadius();
    const center = L.latLng(conversion.center);
    const id = conversion.id;
    const color = placeColor(editorMarkerMeta());
    detachCircleShapeConversion(conversion);
    if (state.map.hasLayer(conversion.previewLayer)) state.map.removeLayer(conversion.previewLayer);
    state.shapeConversion = null;
    syncActiveGeometryHandleTheme();
    const layer = L.circle(center, {radius: Math.max(1, radius), color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity}).addTo(state.map);
    if (id) {
      layer._poiId = id;
      state.placeLayers.set(id, layer);
    } else {
      state.pendingLayer = layer;
    }
    bindLayerClicks(layer, id || null);
    applyLayerPresentation(layer, editorMarkerMeta());
    enableGeometryEditing(layer, true);
    updateEditorGeometry(layer);
    syncShapeConvertControl();
    commitEditorHistory(layer);
  }

  function beginPolygonShapeConversion() {
    const sourceLayer = state.editingLayer;
    if (!sourceLayer || state.shapeConversion) return;
    const id = $("record-id").value;
    const iconCenter = editorPoiIconLatLng(sourceLayer);
    const conversion = {type: "polygon", sourceLayer, id, iconCenter: iconCenter ? L.latLng(iconCenter.lat, iconCenter.lng) : null};
    state.shapeConversion = conversion;
    syncActiveGeometryHandleTheme();

    disableGeometryEditing(true);
    removeLayerAndCenter(sourceLayer);
    if (id) state.placeLayers.delete(id);
    else state.pendingLayer = null;
    fadeOutEditorSideControlsForPolygonConversion();


    const color = placeColor(editorMarkerMeta());
    state.map.getContainer().classList.add("markup-polygon-draw-active");
    state.map.getContainer().style.setProperty("--markup-draw-color", color);
    syncActiveGeometryHandleTheme();
    state.map.pm.enableDraw("Polygon", {
      templineStyle: {color, weight: 2, fillOpacity: state.fillOpacity},
      hintlineStyle: {color, weight: 2, dashArray: "5,5"},
      pathOptions: {color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity},
      snappable: true,
      snapDistance: 20,
      snapSegment: true
    });

    state.map.once("pm:drawend", () => {
      if (state.shapeConversion === conversion) cancelPolygonShapeConversion();
    });
  }

  function finishPolygonShapeConversion(layer, conversion) {
    state.map?.getContainer()?.classList.remove("markup-polygon-draw-active");
    if (!state.measureMode) state.map?.getContainer()?.style.removeProperty("--markup-draw-color");
    if (!layer || !conversion) return;
    const id = conversion.id;
    if (conversion.iconCenter) layer._poiDisplayCenter = L.latLng(conversion.iconCenter.lat, conversion.iconCenter.lng);
    if (id) {
      layer._poiId = id;
      state.placeLayers.set(id, layer);
    } else {
      state.pendingLayer = layer;
    }
    bindLayerClicks(layer, id || null);
    applyLayerPresentation(layer, editorMarkerMeta());
    enableGeometryEditing(layer, true);
    updateEditorGeometry(layer);
    syncShapeConvertControl();
    commitEditorHistory(layer);
  }

  function cancelPolygonShapeConversion() {
    state.map?.getContainer()?.classList.remove("markup-polygon-draw-active");
    if (!state.measureMode) state.map?.getContainer()?.style.removeProperty("--markup-draw-color");
    const conversion = state.shapeConversion;
    if (!conversion) return;
    if (conversion.type === "circle") {
      detachCircleShapeConversion(conversion);
      if (conversion.previewLayer && state.map.hasLayer(conversion.previewLayer)) state.map.removeLayer(conversion.previewLayer);
    } else {
      state.map.pm.disableDraw();
    }
    state.shapeConversion = null;
    syncActiveGeometryHandleTheme();
    const {sourceLayer, id} = conversion;
    if (id) {
      sourceLayer._poiId = id;
      state.placeLayers.set(id, sourceLayer);
    } else {
      state.pendingLayer = sourceLayer;
    }
    if (!state.map.hasLayer(sourceLayer)) sourceLayer.addTo(state.map);
    applyLayerPresentation(sourceLayer, editorMarkerMeta());
    enableGeometryEditing(sourceLayer, true);
    updateEditorGeometry(sourceLayer);
    syncShapeConvertControl();
  }

  function wholeShapeMoveIconHtml() {
    return `<svg class="whole-shape-move-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"><path d="M90.34,61.66a8,8,0,0,1,0-11.32l32-32a8,8,0,0,1,11.32,0l32,32a8,8,0,0,1-11.32,11.32L136,43.31V96a8,8,0,0,1-16,0V43.31L101.66,61.66A8,8,0,0,1,90.34,61.66Zm64,132.68L136,212.69V160a8,8,0,0,0-16,0v52.69l-18.34-18.35a8,8,0,0,0-11.32,11.32l32,32a8,8,0,0,0,11.32,0l32-32a8,8,0,0,0-11.32-11.32Zm83.32-72-32-32a8,8,0,0,0-11.32,11.32L212.69,120H160a8,8,0,0,0,0,16h52.69l-18.35,18.34a8,8,0,0,0,11.32,11.32l32-32A8,8,0,0,0,237.66,122.34ZM43.31,136H96a8,8,0,0,0,0-16H43.31l18.35-18.34A8,8,0,0,0,50.34,90.34l-32,32a8,8,0,0,0,0,11.32l32,32a8,8,0,0,0,11.32-11.32Z"></path></svg>`;
  }

  function syncPolygonDragControl() {
    const layer = state.editingLayer;
    const polygon = layer instanceof L.Polygon;
    const circle = layer instanceof L.Circle;
    const shape = !$("editor").classList.contains("hidden") && (polygon || circle);
    $("polygon-drag-wrap").classList.toggle("hidden", !shape);
    if (!shape) {
      $("polygon-drag-menu").classList.add("hidden");
      syncShapeConvertOffsetForDragMenu();
      return;
    }
    const shapeName = circle ? "Circle" : "Polygon";
    const dragModeButton = $("polygon-drag-btn");
    if (dragModeButton) {
      dragModeButton.innerHTML = state.polygonDragMode === "polygon"
        ? wholeShapeMoveIconHtml()
        : `<i class="fa-solid fa-location-dot" aria-hidden="true"></i>`;
    }
    $("polygon-drag-shape-label").textContent = shapeName;
    $("polygon-drag-icon-mode").classList.toggle("active", state.polygonDragMode === "icon");
    $("polygon-drag-polygon-mode").classList.toggle("active", state.polygonDragMode === "polygon");
    $("polygon-drag-reset").disabled = !layer._poiDisplayCenter;
    $("polygon-drag-btn").title = state.polygonDragMode === "icon" ? "Drag icon" : `Drag ${shapeName.toLowerCase()}`;
    $("polygon-drag-btn").setAttribute("aria-label", $("polygon-drag-btn").title);
  }

  function setPolygonDragMode(mode) {
    state.polygonDragMode = mode === "polygon" ? "polygon" : "icon";
    updateEditorPresentation();
    syncPolygonDragControl();
  }

  function resetPolygonDisplayCenter() {
    const layer = state.editingLayer;
    if (!(layer instanceof L.Circle || layer instanceof L.Polygon)) return;
    layer._poiDisplayCenter = null;
    if (layer._poiCenterMarker) {
      layer._poiCenterMarker.setLatLng(layer instanceof L.Circle ? layer.getLatLng() : polygonLayerAverageCenter(layer));
    }
    if (layer instanceof L.Circle) showCircleArea(layer);
    else showPolygonArea(layer);
    updateEditorGeometry(layer);
    syncPolygonDragControl();
  }

  function syncShapeCenterMarker(layer, meta = {}) {
    if (!layer || layer instanceof L.Marker || !(layer instanceof L.Circle || layer instanceof L.Polygon)) return;
    const center = layer._poiDisplayCenter || (layer instanceof L.Circle ? layer.getLatLng() : polygonLayerAverageCenter(layer));
    const centerMarkerDraggable = Boolean(layer._poiPolygonDragEnabled);
    const centerMarkerMeta = meta;
    if (!center) return;
    if (!layer._poiCenterMarker) {
      layer._poiCenterMarker = L.marker(center, {
        icon: markerIcon(centerMarkerMeta),
        interactive: true,
        draggable: centerMarkerDraggable,
        keyboard: false
      });
      if (state.map.hasLayer(layer)) layer._poiCenterMarker.addTo(state.map);
    } else {
      layer._poiCenterMarker.setLatLng(center);
      layer._poiCenterMarker.setIcon(markerIcon(centerMarkerMeta));
    }
  }

  const {poiHoverPreviewWithElevation} = window.FAPoiHover.createPoiHoverPreviews({state, serializeLayer, formatCoordinates, formatMeasuredDistance, circleAreaMeters, circleCircumferenceMeters, polygonAreaMeters, polygonPerimeterMeters, formatPolygonArea, escapeMarkerText, placeColor});

  function syncPoiMarkerCoordinates(layer) {
    if (!(layer instanceof L.Marker) || !state.map) return;
    const editorVisible = !$("editor").classList.contains("hidden");
    const isActiveEditorPoint = editorVisible && (layer === state.editingLayer || layer === state.pendingLayer);
    const visible = state.showPoiMarkerCoordinates && state.map.hasLayer(layer) && isActiveEditorPoint &&
      (layer === state.pendingLayer || layer._poiId && state.placeLayers.get(layer._poiId) === layer);
    if (!visible) {
      if (layer._poiCoordinatesTooltip) {
        state.map.removeLayer(layer._poiCoordinatesTooltip);
        layer._poiCoordinatesTooltip = null;
      }
      return;
    }
    if (!layer._poiCoordinatesMoveBound) {
      layer.on("move", () => {
        if (layer._poiCoordinatesTooltip) syncPoiMarkerCoordinates(layer);
      });
      layer._poiCoordinatesMoveBound = true;
    }
    const point = layer.getLatLng();
    const text = measurementTooltipHtml([["COORDINATES", formatCoordinates(point.lat, normalizeMeasurementLongitude(point.lng))]]);
    if (!layer._poiCoordinatesTooltip) {
      layer._poiCoordinatesTooltip = L.tooltip({permanent: true, direction: "top", offset: L.point(0, -10),
        className: "measurement-tooltip poi-marker-coordinates-tooltip", opacity: 1})
        .setLatLng(point).setContent(text).addTo(state.map);
    } else {
      layer._poiCoordinatesTooltip.setLatLng(point).setContent(text);
      if (!state.map.hasLayer(layer._poiCoordinatesTooltip)) layer._poiCoordinatesTooltip.addTo(state.map);
    }
  }

  function bindPoiHoverPreview(layer, meta = {}) {
    if (!layer) return;
    const target = layer instanceof L.Marker ? layer : layer._poiCenterMarker;
    if (!target || typeof target.bindTooltip !== "function") return;
    if (layer === state.editingLayer || layer === state.pendingLayer) {
      if (typeof target.closeTooltip === "function") target.closeTooltip();
      if (typeof target.unbindTooltip === "function") target.unbindTooltip();
      return;
    }

    appTooltipController.bind(target, poiHoverPreviewWithElevation(layer, meta, "."), {
      direction: "top",
      offset: [0, -10],
      className: "poi-hover-tooltip",
      opacity: 1
    });

    if (target._poiElevationHoverHandler) target.off("tooltipopen", target._poiElevationHoverHandler);
    if (target._poiElevationCloseHandler) target.off("tooltipclose", target._poiElevationCloseHandler);
    target._poiElevationHoverHandler = async () => {
      const hoverPoint = typeof target.getLatLng === "function" ? target.getLatLng() : null;
      const point = hoverPoint ? L.latLng(hoverPoint.lat, normalizeMeasurementLongitude(hoverPoint.lng), hoverPoint.alt) : null;
      const tooltip = target.getTooltip?.();
      if (!point || !tooltip) return;
      const request = (target._poiElevationRequest || 0) + 1;
      target._poiElevationRequest = request;
      if (target._poiElevationLoadingTimer) clearInterval(target._poiElevationLoadingTimer);
      let loadingDots = 1;
      tooltip.setContent(poiHoverPreviewWithElevation(layer, meta, "."));
      target._poiElevationLoadingTimer = setInterval(() => {
        if (request !== target._poiElevationRequest) {
          clearInterval(target._poiElevationLoadingTimer);
          target._poiElevationLoadingTimer = null;
          return;
        }
        loadingDots = loadingDots % 3 + 1;
        tooltip.setContent(poiHoverPreviewWithElevation(layer, meta, ".".repeat(loadingDots)));
      }, 400);
      let value = null;
      try {
        value = await window.FAElevation?.getElevationAt?.(point);
      } catch {}
      if (target._poiElevationLoadingTimer) {
        clearInterval(target._poiElevationLoadingTimer);
        target._poiElevationLoadingTimer = null;
      }
      if (request !== target._poiElevationRequest) return;
      const currentTooltip = target.getTooltip?.();
      if (!currentTooltip) return;
      const roundedValue = Number.isFinite(value) ? Math.round(value) : null;
      const displayValue = Object.is(roundedValue, -0) ? 0 : roundedValue;
      currentTooltip.setContent(poiHoverPreviewWithElevation(
        layer,
        meta,
        Number.isFinite(displayValue) ? formatMeasuredElevation(displayValue) : "Unavailable"
      ));
    };
    target._poiElevationCloseHandler = () => {
      target._poiElevationRequest = (target._poiElevationRequest || 0) + 1;
      if (target._poiElevationLoadingTimer) {
        clearInterval(target._poiElevationLoadingTimer);
        target._poiElevationLoadingTimer = null;
      }
    };
    target.on("tooltipopen", target._poiElevationHoverHandler);
    target.on("tooltipclose", target._poiElevationCloseHandler);

    if (target !== layer && !target._poiParentInteractionsBound) {
      target.on("click", event => {
        if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        if (layer === state.editingLayer && isLayerCentered(layer) && !$("editor").classList.contains("hidden")) return;
        const poiId = layer._poiId;
        if (poiId) selectPlace(poiId);
      });
      target.on("contextmenu", event => {
        if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        showPoiContextMenu(event, layer);
      });
      target._poiParentInteractionsBound = true;
    }
  }

  function refreshPoiHoverPreviews() {
    for (const [id, layer] of state.placeLayers.entries()) {
      const place = state.places.find(item => item.id === id);
      if (place) bindPoiHoverPreview(layer, place);
      syncPoiMarkerCoordinates(layer);
    }
    if (state.pendingLayer) {
      bindPoiHoverPreview(state.pendingLayer, editorMarkerMeta());
      syncPoiMarkerCoordinates(state.pendingLayer);
    }
  }

  function applyLayerPresentation(layer, meta = {}) {
    if (!layer) return;
    const color = placeColor(meta);
    if (layer instanceof L.Path) layer.setStyle({color, fillColor: color, fillOpacity: state.fillOpacity});
    if (layer === state.editingLayer && (layer instanceof L.Polygon || layer instanceof L.Circle)) {
      state.map?.getContainer()?.style.setProperty("--polygon-measurement-color", color);
    }
    if (layer instanceof L.Marker) layer.setIcon(markerIcon({...meta, color}));
    else syncShapeCenterMarker(layer, {...meta, color});
    bindPoiHoverPreview(layer, meta);
    syncPoiMarkerCoordinates(layer);
  }

  function updateEditorPresentation() {
    const activeLayer = state.editingLayer || state.pendingLayer;
    if (activeLayer && (activeLayer._poiPolygonDragging || activeLayer._shapeRotateDragging)) return;
    const layer = state.editingLayer || state.pendingLayer;
    if (layer && !$("editor").classList.contains("hidden")) {
      applyLayerPresentation(layer, editorMarkerMeta());
      syncActiveGeometryHandleTheme();
      if (state.editingLayer === layer) {
        syncPolygonDragControl();
        syncShapeConvertControl();
      }
    }
  }

  function bindLayerClicks(layer, id) {
    if (layer instanceof L.Path) {
      layer.options.className = `${layer.options.className || ""} fa-poi-hit-target`.trim();
      layer._path?.classList.add("fa-poi-hit-target");
    }
    if (id) layer._poiId = id;
    layer.on("contextmenu", (e) => {
      if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
      if (layer === state.editingLayer && !$("editor").classList.contains("hidden")) return;
      showPoiContextMenu(e, layer);
    });
    layer.on("click", (e) => {
      if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
      if (layer instanceof L.Marker && layer === state.editingLayer && isLayerCentered(layer) && !$("editor").classList.contains("hidden")) return;
      const poiId = layer._poiId;
      if (poiId) selectPlace(poiId);
    });

  }

  function restorePersistedGeometry(layer, place) {
    layer._poiWorldOffset = 0;
    if (layer instanceof L.Circle) {
      const [lon, lat] = place.geometry.coordinates;
      layer.setLatLng([lat, lon]);
      layer.setRadius(Number(place.radius_m || 0));
    } else if (layer instanceof L.Marker) {
      const [lon, lat] = place.geometry.coordinates;
      layer.setLatLng([lat, lon]);
    } else {
      const original = L.geoJSON(place.geometry).getLayers()[0];
      layer.setLatLngs(original.getLatLngs());
    }
    if (layer instanceof L.Circle || layer instanceof L.Polygon) layer._poiDisplayCenter = displayCenterLatLng(place.display_center);
    if (layer.redraw) layer.redraw();
  }

  function restorePersistedPlaceLayer(id, layer, place) {
    if (!id || !layer || !place) return layer;
    if (shapeTypeForLayer(layer) === place.shape_type) {
      restorePersistedGeometry(layer, place);
      applyLayerPresentation(layer, place);
      return layer;
    }
    removeLayerAndCenter(layer);
    const restored = layerFromPlace(place);
    state.placeLayers.set(id, restored);
    return restored;
  }



  function hideCircleRadius(layer) {
    if (!(layer instanceof L.Circle)) return;
    const tooltip = layer.getTooltip();
    if (tooltip && tooltip.options && tooltip.options.className === "measurement-tooltip") {
      layer.unbindTooltip();
    }
  }

  function circleAreaMeters(layer) {
    const radius = layer instanceof L.Circle ? layer.getRadius() : 0;
    return Math.PI * radius * radius;
  }

  function circleCircumferenceMeters(layer) {
    const radius = layer instanceof L.Circle ? layer.getRadius() : 0;
    return 2 * Math.PI * radius;
  }

  function showCircleArea(layer) {
    if (!(layer instanceof L.Circle)) {
      hideCircleArea(layer);
      return;
    }
    const radius = layer.getRadius();
    const area = circleAreaMeters(layer);
    const circumference = circleCircumferenceMeters(layer);
    if (!Number.isFinite(radius) || radius <= 0) {
      hideCircleArea(layer);
      return;
    }
    const rows = [];
    if (state.showPoiCircleDiameter) rows.push(["DIAMETER", formatMeasuredDistance(radius * 2)]);
    if (state.showPoiCircleRadius) rows.push(["RADIUS", formatMeasuredDistance(radius)]);
    if (state.showCircleArea && Number.isFinite(area) && area > 0) rows.push(["AREA", formatPolygonArea(area)]);
    if (state.showCircleCircumference && Number.isFinite(circumference) && circumference > 0) rows.push(["CIRCUMFERENCE", formatMeasuredDistance(circumference)]);
    if (!rows.length) { hideCircleArea(layer); return; }
    const center = layer._poiCenterMarker?.getLatLng() || layer._poiDisplayCenter || layer.getLatLng();
    const text = measurementTooltipHtml(rows);
    if (!layer._poiCircleAreaTooltip) {
      layer._poiCircleAreaTooltip = L.tooltip({permanent: true, direction: "center", className: "measurement-tooltip", opacity: 1})
        .setLatLng(center)
        .setContent(text)
        .addTo(state.map);
    } else {
      layer._poiCircleAreaTooltip.setLatLng(center).setContent(text);
      if (!state.map.hasLayer(layer._poiCircleAreaTooltip)) layer._poiCircleAreaTooltip.addTo(state.map);
    }
  }

  function hideCircleArea(layer) {
    if (!layer || !layer._poiCircleAreaTooltip) return;
    if (state.map && state.map.hasLayer(layer._poiCircleAreaTooltip)) state.map.removeLayer(layer._poiCircleAreaTooltip);
    layer._poiCircleAreaTooltip = null;
  }

  function ringAreaMeters(latlngs) {
    if (!Array.isArray(latlngs) || latlngs.length < 3) return 0;
    const earthRadius = 6378137;
    let sum = 0;
    for (let i = 0; i < latlngs.length; i += 1) {
      const a = latlngs[i];
      const b = latlngs[(i + 1) % latlngs.length];
      let deltaLon = (b.lng - a.lng) * Math.PI / 180;
      if (deltaLon > Math.PI) deltaLon -= 2 * Math.PI;
      if (deltaLon < -Math.PI) deltaLon += 2 * Math.PI;
      sum += deltaLon * (2 + Math.sin(a.lat * Math.PI / 180) + Math.sin(b.lat * Math.PI / 180));
    }
    return Math.abs(sum * earthRadius * earthRadius / 2);
  }

  function polygonAreaMeters(layer) {
    const latlngs = layer && typeof layer.getLatLngs === "function" ? layer.getLatLngs() : [];
    if (!Array.isArray(latlngs) || !latlngs.length) return 0;
    let polygons;
    if (latlngs[0] && typeof latlngs[0].lat === "number") polygons = [[latlngs]];
    else if (latlngs[0] && latlngs[0][0] && typeof latlngs[0][0].lat === "number") polygons = [latlngs];
    else polygons = latlngs;
    return polygons.reduce((total, rings) => {
      if (!Array.isArray(rings) || !rings.length) return total;
      const outer = ringAreaMeters(rings[0]);
      const holes = rings.slice(1).reduce((holeTotal, ring) => holeTotal + ringAreaMeters(ring), 0);
      return total + Math.max(0, outer - holes);
    }, 0);
  }

  function ringPerimeterMeters(latlngs) {
    if (!Array.isArray(latlngs) || latlngs.length < 2) return 0;
    let meters = 0;
    for (let i = 0; i < latlngs.length; i += 1) {
      const a = latlngs[i];
      const b = latlngs[(i + 1) % latlngs.length];
      meters += a.distanceTo(b);
    }
    return meters;
  }

  function polygonPerimeterMeters(layer) {
    const latlngs = layer && typeof layer.getLatLngs === "function" ? layer.getLatLngs() : [];
    if (!Array.isArray(latlngs) || !latlngs.length) return 0;
    let polygons;
    if (latlngs[0] && typeof latlngs[0].lat === "number") polygons = [[latlngs]];
    else if (latlngs[0] && latlngs[0][0] && typeof latlngs[0][0].lat === "number") polygons = [latlngs];
    else polygons = latlngs;
    return polygons.reduce((total, rings) => {
      if (!Array.isArray(rings)) return total;
      return total + rings.reduce((ringTotal, ring) => ringTotal + ringPerimeterMeters(ring), 0);
    }, 0);
  }

  function formatPolygonArea(area) {
    if (!Number.isFinite(area)) return "";
    const compact = value => Number(value.toFixed(2)).toLocaleString();
    if (state.measurementSystem === "imperial") {
      return area >= 100000 ? `${compact(area / 2589988.110336)} mi²` : `${Math.round(area / (0.3048 * 0.3048)).toLocaleString()} ft²`;
    }
    if (state.measurementSystem === "nautical") {
      return area >= 100000 ? `${compact(area / (1852 * 1852))} nmi²` : `${Math.round(area).toLocaleString()} m²`;
    }
    if (state.areaUnits === "km2") return `${compact(area / 1000000)} km²`;
    if (state.areaUnits === "ha") return `${compact(area / 10000)} ha`;
    if (state.areaThreshold !== null && area >= state.areaThreshold) return `${compact(area / 1000000)} km²`;
    return `${Math.round(area).toLocaleString()} m²`;
  }

  function polygonAverageCenterLatLng(latlngs, fallback = null) {
    if (!Array.isArray(latlngs) || latlngs.length === 0) return fallback;
    const points = latlngs.map(latlng => state.map.project(latlng, 0));
    const total = points.reduce((sum, point) => L.point(sum.x + point.x, sum.y + point.y), L.point(0, 0));
    return state.map.unproject(L.point(total.x / points.length, total.y / points.length), 0);
  }

  function polygonLayerAverageCenter(layer) {
    let ring = layer && typeof layer.getLatLngs === "function" ? layer.getLatLngs() : [];
    while (Array.isArray(ring) && ring.length && Array.isArray(ring[0])) ring = ring[0];
    const fallback = layer && layer.getBounds && layer.getBounds().isValid() ? layer.getBounds().getCenter() : null;
    return polygonAverageCenterLatLng(ring, fallback);
  }

  function showPolygonArea(layer) {
    if (!state.showPolygonArea && !state.showPolygonPerimeter) { hidePolygonArea(layer); return; }
    if (!layer || !layer.getBounds || !layer.getBounds().isValid()) {
      hidePolygonArea(layer);
      return;
    }
    const rows = [];
    if (state.showPolygonArea) {
      const area = polygonAreaMeters(layer);
      if (Number.isFinite(area) && area > 0) rows.push(["AREA", formatPolygonArea(area)]);
    }
    if (state.showPolygonPerimeter) {
      const perimeter = polygonPerimeterMeters(layer);
      if (Number.isFinite(perimeter) && perimeter > 0) rows.push(["PERIMETER", formatMeasuredDistance(perimeter)]);
    }
    if (!rows.length) { hidePolygonArea(layer); return; }
    const text = measurementTooltipHtml(rows);
    const center = polygonDisplayCenter(layer);
    const tooltip = layer.getTooltip && layer.getTooltip();
    if (!tooltip || !tooltip.options || tooltip.options.className !== "measurement-tooltip") {
      appTooltipController.bind(layer, text, {
        permanent: true,
        direction: "center",
        className: "measurement-tooltip",
        opacity: 1
      });
    } else {
      layer.setTooltipContent(text);
    }
    layer.openTooltip(center);
    if (layer.getTooltip()) layer.getTooltip().setLatLng(center);
  }

  function hidePolygonArea(layer) {
    if (!layer || typeof layer.getTooltip !== "function") return;
    const tooltip = layer.getTooltip();
    if (tooltip && tooltip.options && tooltip.options.className === "measurement-tooltip") {
      layer.unbindTooltip();
    }
  }

  function polygonVertexCount(layer) {
    let count = 0;
    const visit = value => {
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value.lat === "number" && typeof value.lng === "number") {
        count += 1;
      }
    };
    visit(layer.getLatLngs());
    return count;
  }

  function formatEditorCircleRadius(meters) {
    if (state.measurementSystem === "imperial") {
      const miles = meters / 1609.344;
      return miles < 1 ? `${Number((meters / 0.3048).toFixed(1))} ft` : `${Number(miles.toFixed(2))} mi`;
    }
    if (state.measurementSystem === "nautical") {
      const miles = meters / 1852;
      return miles < 1 ? `${Math.round(meters)} m` : `${Number(miles.toFixed(2))} nmi`;
    }
    const km = meters / 1000;
    return km < 1 ? `${Math.round(meters)} m` : `${Number(km.toFixed(2))} km`;
  }

  function parseCircleRadiusInput(value) {
    const normalized = String(value ?? "").toLowerCase().replace(/[\s,\u00a0]/g, "");
    const match = /^(\d+(?:\.\d+)?)(nmi|nm|km|mi|ft|m)?$/.exec(normalized);
    if (!match) return null;
    const defaultUnit = state.measurementSystem === "imperial" ? "ft" : "m";
    const factors = {m: 1, km: 1000, ft: 0.3048, mi: 1609.344, nmi: 1852, nm: 1852};
    const meters = Number(match[1]) * factors[match[2] || defaultUnit];
    return Number.isFinite(meters) && meters > 0 ? meters : null;
  }

  function renderShapeInfo(layer, geo = serializeLayer(layer)) {
    const box = $("shape-info");
    if (geo.shape_type !== "circle") {
      box.textContent = geo.shape_type === "polygon" ? `Polygon / Vertices: ${polygonVertexCount(layer)}` : "Point";
      return;
    }

    const radiusValue = document.createElement("span");
    radiusValue.className = "shape-radius-value";
    radiusValue.textContent = formatEditorCircleRadius(geo.radius_m);
    radiusValue.contentEditable = "true";
    radiusValue.spellcheck = false;
    radiusValue.setAttribute("role", "textbox");
    radiusValue.setAttribute("aria-label", `Circle radius, currently ${radiusValue.textContent}. Press Enter to apply.`);

    radiusValue.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const meters = parseCircleRadiusInput(radiusValue.textContent);
        if (meters === null) {
          showToast("Enter a radius with units: m, km, ft, mi or nmi.", "error");
          return;
        }
        layer.setRadius(meters);
        if (layer.redraw) layer.redraw();
        if (layer.pm && layer.pm.enabled() && typeof layer.pm._initMarkers === "function") { layer.pm._initMarkers(); if (layer.pm.options?.snappable && typeof layer.pm._initSnappableMarkers === "function") layer.pm._initSnappableMarkers(); }
        showCircleArea(layer);
        updateEditorGeometry(layer);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        radiusValue.textContent = formatEditorCircleRadius(layer.getRadius());
        radiusValue.blur();
      }
    });

    radiusValue.addEventListener("blur", () => {
      if (radiusValue.isConnected && state.editingLayer === layer) {
        radiusValue.textContent = formatEditorCircleRadius(layer.getRadius());
      }
    });

    box.replaceChildren(document.createTextNode("Circle / Radius: "), radiusValue);
  }

  function cloneEditorHistoryValue(value) {
    return value === null || value === undefined ? null : JSON.parse(JSON.stringify(value));
  }

  function captureEditorHistorySnapshot(layer) {
    if (!layer) return null;
    const geo = serializeLayer(layer);
    return {
      shape_type: geo.shape_type,
      geometry: cloneEditorHistoryValue(geo.geometry),
      radius_m: Number(geo.radius_m) || 0,
      display_center: cloneEditorHistoryValue(serializedDisplayCenter(layer))
    };
  }

  function editorHistorySnapshotSignature(snapshot) {
    return snapshot ? JSON.stringify(snapshot) : "";
  }

  function resetEditorHistory(layer = null) {
    const history = state.editHistory;
    if (history.timer) clearTimeout(history.timer);
    history.layer = layer;
    history.undo = [];
    history.redo = [];
    history.current = layer ? captureEditorHistorySnapshot(layer) : null;
    history.timer = null;
    history.applying = false;
  }

  function commitEditorHistory(layer = state.editingLayer) {
    const history = state.editHistory;
    if (history.timer) {
      clearTimeout(history.timer);
      history.timer = null;
    }
    if (!layer || history.layer !== layer || history.applying) return false;
    const next = captureEditorHistorySnapshot(layer);
    if (!next) return false;
    if (editorHistorySnapshotSignature(next) === editorHistorySnapshotSignature(history.current)) return false;
    if (history.current) history.undo.push(history.current);
    if (history.undo.length > 100) history.undo.shift();
    history.current = next;
    history.redo = [];
    return true;
  }

  function scheduleEditorHistoryCommit(layer = state.editingLayer) {
    const history = state.editHistory;
    if (!layer || history.layer !== layer || history.applying) return;
    if (history.timer) clearTimeout(history.timer);
    history.timer = setTimeout(() => commitEditorHistory(layer), 140);
  }

  function applyEditorHistorySnapshot(layer, snapshot) {
    if (!layer || !snapshot) return;
    const history = state.editHistory;
    history.applying = true;
    try {
      if (shapeTypeForLayer(layer) !== snapshot.shape_type) {
        const replacement = makeEditorLayerFromSnapshot(snapshot);
        if (!replacement) return;
        const newLayer = replaceEditingLayer(replacement, {commitHistory: false});
        history.layer = newLayer;
        return;
      }

      if (layer instanceof L.Circle) {
        const [lon, lat] = snapshot.geometry.coordinates;
        layer.setLatLng([lat, lon]);
        layer.setRadius(Number(snapshot.radius_m) || 0);
      } else if (layer instanceof L.Marker) {
        const [lon, lat] = snapshot.geometry.coordinates;
        layer.setLatLng([lat, lon]);
      } else {
        const restored = L.geoJSON(snapshot.geometry).getLayers()[0];
        if (restored) layer.setLatLngs(restored.getLatLngs());
      }

      if (layer instanceof L.Circle || layer instanceof L.Polygon) {
        layer._poiDisplayCenter = displayCenterLatLng(snapshot.display_center);
      }
      if (layer.redraw) layer.redraw();
      if (layer._poiEdgeInsertHandlers?.hitLayer) layer._poiEdgeInsertHandlers.hitLayer.setLatLngs(layer._measurementMode === "distance" ? distanceMeasurementGeodesicLatLngs(layer.getLatLngs()) : layer.getLatLngs());
      if (layer.pm && layer.pm.enabled() && typeof layer.pm._initMarkers === "function") { layer.pm._initMarkers(); if (layer.pm.options?.snappable && typeof layer.pm._initSnappableMarkers === "function") layer.pm._initSnappableMarkers(); }
      if (layer instanceof L.Circle || layer instanceof L.Polygon) syncShapeCenterMarker(layer, editorMarkerMeta());
      if (layer instanceof L.Circle) showCircleArea(layer);
      else if (layer instanceof L.Polygon) showPolygonArea(layer);
      updateEditorGeometry(layer);
    } finally {
      history.applying = false;
    }
  }

  function undoEditorGeometry() {
    const layer = state.editingLayer;
    const history = state.editHistory;
    if (!layer || history.layer !== layer) return false;
    commitEditorHistory(layer);
    if (!history.undo.length) return false;
    const previous = history.undo.pop();
    if (history.current) history.redo.push(history.current);
    history.current = cloneEditorHistoryValue(previous);
    applyEditorHistorySnapshot(layer, history.current);
    return true;
  }

  function redoEditorGeometry() {
    const layer = state.editingLayer;
    const history = state.editHistory;
    if (!layer || history.layer !== layer) return false;
    commitEditorHistory(layer);
    if (!history.redo.length) return false;
    const next = history.redo.pop();
    if (history.current) history.undo.push(history.current);
    history.current = cloneEditorHistoryValue(next);
    applyEditorHistorySnapshot(layer, history.current);
    return true;
  }

  function editorAreaLocationKey(lat, lon) {
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
    return `${latitude.toFixed(7)},${normalizeMeasurementLongitude(longitude).toFixed(7)}`;
  }

  function cancelEditorAreaLookup({resetKey = false} = {}) {
    state.editorAreaLookupToken += 1;
    if (state.editorAreaLookupTimer) clearTimeout(state.editorAreaLookupTimer);
    state.editorAreaLookupTimer = null;
    if (state.editorAreaLookupController) {
      try { state.editorAreaLookupController.abort(); } catch {}
    }
    state.editorAreaLookupController = null;
    if (resetKey) state.editorAreaLookupKey = "";
  }

  function scheduleEditorAreaLookup(layer, lat, lon, {immediate = false, force = false} = {}) {
    if (!layer || state.editingLayer !== layer || $("editor").classList.contains("hidden") || state.editorAreaCustom) return;
    const key = editorAreaLocationKey(lat, lon);
    if (!key) return;
    const changed = state.editorAreaLookupKey !== key;
    if (!changed && !force) return;
    cancelEditorAreaLookup();
    state.editorAreaLookupKey = key;
    const token = state.editorAreaLookupToken;
    const input = $("area-name");
    input.value = "";
    input.placeholder = "Looking up area...";

    const run = async () => {
      state.editorAreaLookupTimer = null;
      if (token !== state.editorAreaLookupToken || state.editingLayer !== layer || $("editor").classList.contains("hidden")) return;
      const controller = new AbortController();
      state.editorAreaLookupController = controller;
      const area = await reverseGeocode(lat, lon, controller.signal);
      if (state.editorAreaLookupController === controller) state.editorAreaLookupController = null;
      if (token !== state.editorAreaLookupToken || controller.signal.aborted || state.editingLayer !== layer || $("editor").classList.contains("hidden") || state.editorAreaCustom) return;
      const currentGeo = serializeLayer(layer);
      if (editorAreaLocationKey(currentGeo?.center?.lat, currentGeo?.center?.lon) !== key) return;
      input.value = area || "";
      input.placeholder = area ? "Reverse geocoding..." : "Area name unavailable";
    };

    if (immediate) void run();
    else state.editorAreaLookupTimer = setTimeout(run, 500);
  }

  $("area-name").addEventListener("input", () => {
    state.editorAreaCustom = Boolean($("area-name").value.trim());
    cancelEditorAreaLookup({resetKey: true});
    if (!state.editorAreaCustom && state.editingLayer && !$("editor").classList.contains("hidden")) {
      const geo = serializeLayer(state.editingLayer);
      scheduleEditorAreaLookup(state.editingLayer, geo.center.lat, geo.center.lon, {immediate: true, force: true});
    }
  });

  function updateEditorGeometry(layer) {
    if (layer instanceof L.Polygon && !(layer instanceof L.Circle)) bindPoiPolygonVertexClickRemoval(layer);
    if (state.editingLayer !== layer || $("editor").classList.contains("hidden")) return;
    const geo = serializeLayer(layer);
    scheduleEditorAreaLookup(layer, geo.center.lat, geo.center.lon);
    $("coords").value = formatCoordinates(geo.center.lat, geo.center.lon);
    renderShapeInfo(layer, geo);
    renderExternalLinks({lat: geo.center.lat, lon: geo.center.lon, name: $("name").value || "Saved place"});
    updateEditorPresentation();
    if (!layer._shapeRotateDragging) scheduleEditorHistoryCommit(layer);
  }

  function rebuildShapeCenterMarker(layer) {
    if (!layer || layer instanceof L.Marker || !(layer instanceof L.Circle || layer instanceof L.Polygon)) return;
    const icon = layer._poiCenterMarker?.options?.icon || null;
    if (layer._poiCenterMarker && state.map.hasLayer(layer._poiCenterMarker)) state.map.removeLayer(layer._poiCenterMarker);
    layer._poiCenterMarker = null;
    syncShapeCenterMarker(layer);
    if (icon && layer._poiCenterMarker) layer._poiCenterMarker.setIcon(icon);
  }

  function polygonEdgeInsertRings(value, rings = []) {
    if (!Array.isArray(value) || !value.length) return rings;
    if (!Array.isArray(value[0])) {
      if (value.length >= 3) rings.push(value);
      return rings;
    }
    for (const child of value) polygonEdgeInsertRings(child, rings);
    return rings;
  }

  function nearestPolygonEdgeInsert(layer, cursorLatLng) {
    if (!(layer instanceof L.Polygon) || layer instanceof L.Circle || !state.map) return null;
    const root = layer.getLatLngs();
    const cursor = state.map.latLngToLayerPoint(cursorLatLng);
    let best = null;

    for (const ring of polygonEdgeInsertRings(root)) {
      for (let index = 0; index < ring.length; index += 1) {
        const nextIndex = (index + 1) % ring.length;
        const aPoint = state.map.latLngToLayerPoint(ring[index]);
        const bPoint = state.map.latLngToLayerPoint(ring[nextIndex]);
        const distanceToA = cursor.distanceTo(aPoint);
        const distanceToB = cursor.distanceTo(bPoint);
        if (Math.min(distanceToA, distanceToB) < 16) continue;
        const closest = L.LineUtil.closestPointOnSegment(cursor, aPoint, bPoint);
        const distance = cursor.distanceTo(closest);
        if (distance > 22 || (best && distance >= best.distance)) continue;
        best = {
          root,
          ring,
          segmentIndex: index,
          distance,
          latlng: state.map.layerPointToLatLng(closest)
        };
      }
    }
    return best;
  }

  function shapeRotationSegments(layer) {
    const segments = [];
    if (layer instanceof L.Polygon && !(layer instanceof L.Circle)) {
      for (const ring of polygonEdgeInsertRings(layer.getLatLngs())) {
        for (let index = 0; index < ring.length; index += 1) {
          segments.push([ring[index], ring[(index + 1) % ring.length]]);
        }
      }
      return segments;
    }

    if (layer?._measurementMode === "distance" && typeof layer.getLatLngs === "function") {
      const parts = distanceMeasurementGeodesicLatLngs(layer.getLatLngs());
      for (const points of parts) {
        for (let index = 0; index < points.length - 1; index += 1) {
          segments.push([points[index], points[index + 1]]);
        }
      }
    }
    return segments;
  }

  function nearestShapeRotationEdge(layer, cursorLatLng, minDistance = 24, maxDistance = 42) {
    if (!state.map || !cursorLatLng) return null;
    const cursor = state.map.latLngToLayerPoint(cursorLatLng);
    const polygon = layer instanceof L.Polygon && !(layer instanceof L.Circle);
    let inside = false;
    let best = null;

    for (const [aLatLng, bLatLng] of shapeRotationSegments(layer)) {
      const a = state.map.latLngToLayerPoint(aLatLng);
      const b = state.map.latLngToLayerPoint(bLatLng);
      // Even-odd point-in-polygon: also handles holes and multipart polygons.
      // Work in map layer coordinates, which also work when the map is rotated.
      if (polygon && (a.y > cursor.y) !== (b.y > cursor.y) &&
          cursor.x < a.x + (cursor.y - a.y) * (b.x - a.x) / (b.y - a.y)) {
        inside = !inside;
      }
      const closest = L.LineUtil.closestPointOnSegment(cursor, a, b);
      const distance = cursor.distanceTo(closest);
      if (distance < minDistance || distance > maxDistance ||
          (best && distance >= best.distance)) continue;
      best = {distance, closestLatLng: state.map.layerPointToLatLng(closest)};
    }

    // Do not advertise or start edge rotation from the filled side.
    return polygon && inside ? null : best;
  }

  function shapeRotationInteractionActive(layer) {
    if (!layer || !state.map) return false;

    if (
      layer._measurementMode === "polygon" ||
      layer._measurementMode === "distance"
    ) {
      return Boolean(
        layer._measurementEditing &&
        !layer._measurementMoveEnabled
      );
    }

    return Boolean(
      state.editingLayer === layer &&
      layer instanceof L.Polygon &&
      !(layer instanceof L.Circle) &&
      !layer._poiPolygonDragging
    );
  }

  function shapeRotationPivot(layer) {
    if (!layer) return null;

    if (layer._measurementMode === "polygon") {
      return polygonLayerAverageCenter(layer);
    }

    if (layer._measurementMode === "distance") {
      return layer.getBounds?.().isValid?.()
        ? layer.getBounds().getCenter()
        : null;
    }

    return editorPoiIconLatLng(layer) || polygonLayerAverageCenter(layer);
  }

  function rotateLatLngTreeAroundProjectedPoint(value, pivotPoint, angle, zoom, cos = Math.cos(angle), sin = Math.sin(angle)) {
    if (Array.isArray(value)) {
      return value.map(item =>
        rotateLatLngTreeAroundProjectedPoint(item, pivotPoint, angle, zoom, cos, sin)
      );
    }

    const point = state.map.project(value, zoom);
    const dx = point.x - pivotPoint.x;
    const dy = point.y - pivotPoint.y;

    return state.map.unproject(
      L.point(
        pivotPoint.x + dx * cos - dy * sin,
        pivotPoint.y + dx * sin + dy * cos
      ),
      zoom
    );
  }

  // Move existing Geoman handles to match the live geometry during rotation.
  // Marker.setLatLng fires a move event that Geoman treats as a vertex edit;
  // updating its position without that event avoids repeating the edit work.
  function syncShapeRotationVertexHandles(layer) {
    const markers = layer.pm?._markers;
    const points = layer.getLatLngs();
    const matches = (nodes, coords) => {
      if (Array.isArray(nodes)) return Array.isArray(coords) &&
        nodes.length === coords.length &&
        nodes.every((node, index) => matches(node, coords[index]));
      return nodes instanceof L.Marker && coords instanceof L.LatLng;
    };
    if (!matches(markers, points)) return false;
    const update = (nodes, coords) => {
      if (Array.isArray(nodes)) {
        nodes.forEach((node, index) => update(node, coords[index]));
      } else {
        nodes._latlng = coords;
        nodes.update();
      }
    };
    update(markers, points);
    return true;
  }

  function disableShapeEdgeRotation(layer) {
    if (!layer || !layer._shapeRotationHandlers || !state.map) return;

    const handlers = layer._shapeRotationHandlers;

    handlers.hitLayer?.off("mousemove", handlers.move);
    handlers.hitLayer?.off("mouseout", handlers.hide);
    handlers.hitLayer?.off("mousedown", handlers.start);

    if (handlers.sync) {
      layer.off("pm:change", handlers.sync);
    }

    state.map.off("mousemove", handlers.drag);
    document.removeEventListener("mouseup", handlers.end, true);

    if (
      handlers.ownsHitLayer &&
      handlers.hitLayer &&
      state.map.hasLayer(handlers.hitLayer)
    ) {
      state.map.removeLayer(handlers.hitLayer);
    }

    if (
      handlers.hint &&
      state.map.hasLayer(handlers.hint)
    ) {
      state.map.removeLayer(handlers.hint);
    }

    if (
      handlers.restoreMapDrag &&
      !state.map.dragging.enabled()
    ) {
      state.map.dragging.enable();
    }

    state.map
      .getContainer()
      .classList.remove(
        "shape-rotate-hover",
        "shape-rotate-dragging"
      );

    delete layer._shapeRotateDragging;
    delete layer._shapeRotationHandlers;
  }

  function enableShapeEdgeRotation(layer, existingHitLayer = null) {
    if (!state.map || !layer) return;

    disableShapeEdgeRotation(layer);

    const supported =
      (layer instanceof L.Polygon && !(layer instanceof L.Circle)) ||
      layer._measurementMode === "distance";

    if (!supported) return;

    const ownsHitLayer = !existingHitLayer;

    const hitLayer =
      existingHitLayer ||
      L.polyline(layer._measurementMode === "distance" ? distanceMeasurementGeodesicLatLngs(layer.getLatLngs()) : layer.getLatLngs(), {
        color: layer.options?.color || state.poiColor,
        weight: 84,
        opacity: 0,
        interactive: true,
        bubblingMouseEvents: true,
        snapIgnore: false,
        pmIgnore: true,
        pane: "overlayPane"
      }).addTo(state.map);

    hitLayer._pmTempLayer = true;

    if (typeof hitLayer.bringToFront === "function") {
      hitLayer.bringToFront();
    }

    const hint = L.marker([0, 0], {
      icon: L.divIcon({
        className: "shape-rotate-hint-marker",
        html: '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      }),
      interactive: false,
      keyboard: false,
      pmIgnore: true,
      pane: "markerPane",
      zIndexOffset: 920
    });

    hint._pmTempLayer = true;

    let candidate = null;
    let originalLatLngs = null;
    let pivotPoint = null;
    let zoom = null;
    let lastPointerAngle = 0;
    let accumulatedAngle = 0;
    let restoreMapDrag = false;

    const hide = () => {
      candidate = null;

      if (!layer._shapeRotateDragging) {
        if (state.map.hasLayer(hint)) {
          state.map.removeLayer(hint);
        }

        state.map
          .getContainer()
          .classList.remove("shape-rotate-hover");
      }
    };

    const sync = () => {
      if (
        ownsHitLayer &&
        state.map.hasLayer(hitLayer)
      ) {
        hitLayer.setLatLngs(layer._measurementMode === "distance" ? distanceMeasurementGeodesicLatLngs(layer.getLatLngs()) : layer.getLatLngs());
      }

      hide();
    };

    const move = event => {
      if (
        !shapeRotationInteractionActive(layer) ||
        layer._shapeRotateDragging
      ) {
        hide();
        return;
      }

      const nearest = nearestShapeRotationEdge(
        layer,
        event.latlng
      );

      if (!nearest) {
        hide();
        return;
      }

      candidate = nearest;
      hint.setLatLng(event.latlng);

      if (!state.map.hasLayer(hint)) {
        hint.addTo(state.map);
      }

      state.map
        .getContainer()
        .classList.add("shape-rotate-hover");
    };

    const drag = event => {
      if (
        !layer._shapeRotateDragging ||
        !pivotPoint ||
        !originalLatLngs ||
        !event?.latlng
      ) {
        return;
      }

      const pointer = state.map.project(
        event.latlng,
        zoom
      );

      const currentAngle = Math.atan2(
        pointer.y - pivotPoint.y,
        pointer.x - pivotPoint.x
      );

      let step =
        currentAngle - lastPointerAngle;

      while (step > Math.PI) {
        step -= Math.PI * 2;
      }

      while (step < -Math.PI) {
        step += Math.PI * 2;
      }

      accumulatedAngle += step;
      lastPointerAngle = currentAngle;

      layer.setLatLngs(
        rotateLatLngTreeAroundProjectedPoint(
          originalLatLngs,
          pivotPoint,
          accumulatedAngle,
          zoom
        )
      );


      if (
        ownsHitLayer &&
        state.map.hasLayer(hitLayer)
      ) {
        hitLayer.setLatLngs(layer._measurementMode === "distance" ? distanceMeasurementGeodesicLatLngs(layer.getLatLngs()) : layer.getLatLngs());
      }

      if (layer._poiEdgeInsertHandlers?.hitLayer) {
        layer._poiEdgeInsertHandlers.hitLayer
          .setLatLngs(layer.getLatLngs());
      }

      if (layer._measurementMode === "distance") {
        syncDistanceMarkersFromLayer(layer, true);
        updateMeasurementTooltip(layer, "distance");
      } else if (
        layer._measurementMode === "polygon"
      ) {
        updateMeasurementTooltip(layer, "polygon");
      } else {
        showPolygonArea(layer);
        updateEditorGeometry(layer);
      }

      if (
        layer.pm?.enabled() &&
        !syncShapeRotationVertexHandles(layer) &&
        typeof layer.pm._initMarkers === "function"
      ) {
        layer.pm._initMarkers();
      }
    };

    const end = () => {
      if (!layer._shapeRotateDragging) return;

      state.map.off("mousemove", drag);
      document.removeEventListener(
        "mouseup",
        end,
        true
      );

      if (
        restoreMapDrag &&
        !state.map.dragging.enabled()
      ) {
        state.map.dragging.enable();
      }

      restoreMapDrag = false;

      delete layer._shapeRotateDragging;

      layer._shapeRotationIgnoreClickUntil =
        Date.now() + 400;

      state.shapeRotationIgnoreMapClickUntil =
        Date.now() + 400;

      state.map
        .getContainer()
        .classList.remove(
          "shape-rotate-dragging"
        );

      hide();

      if (
        layer.pm?.enabled() &&
        typeof layer.pm._initMarkers === "function"
      ) {
        layer.pm._initMarkers();
      }

      if (
        layer._measurementMode === "polygon" ||
        layer._measurementMode === "distance"
      ) {
        updateMeasurementTooltip(
          layer,
          layer._measurementMode
        );

        commitMeasurementHistory(layer);

        if (layer._measurementLocked) {
          scheduleLockedMeasurementSave(layer);
        }
      } else {
        showPolygonArea(layer);
        syncShapeCenterMarker(
          layer,
          editorMarkerMeta()
        );

        commitEditorHistory(layer);
        updateEditorGeometry(layer);
      }
    };

    const start = event => {
      if (!shapeRotationInteractionActive(layer)) {
        return;
      }

      const nearest = nearestShapeRotationEdge(
        layer,
        event.latlng
      );

      if (!nearest) return;

      if (event.originalEvent) {
        event.originalEvent.preventDefault();
        L.DomEvent.stopPropagation(
          event.originalEvent
        );
      }

      const pivot = shapeRotationPivot(layer);

      if (!pivot) return;

      if (
        layer._measurementMode === "polygon" ||
        layer._measurementMode === "distance"
      ) {
        commitMeasurementHistory(layer);
      } else {
        commitEditorHistory(layer);
      }

      zoom = state.map.getZoom();

      pivotPoint = state.map.project(
        pivot,
        zoom
      );

      const pointer = state.map.project(
        event.latlng,
        zoom
      );

      lastPointerAngle = Math.atan2(
        pointer.y - pivotPoint.y,
        pointer.x - pivotPoint.x
      );

      accumulatedAngle = 0;

      originalLatLngs =
        cloneLatLngTree(layer.getLatLngs());

      layer._shapeRotateDragging = true;
      candidate = nearest;
      hint.setLatLng(event.latlng);

      if (!state.map.hasLayer(hint)) {
        hint.addTo(state.map);
      }

      restoreMapDrag =
        state.map.dragging.enabled();

      if (restoreMapDrag) {
        state.map.dragging.disable();
      }

      if (state.map.hasLayer(hint)) {
        state.map.removeLayer(hint);
      }

      state.map
        .getContainer()
        .classList.remove(
          "shape-rotate-hover"
        );

      state.map
        .getContainer()
        .classList.add(
          "shape-rotate-dragging"
        );

      state.map.on("mousemove", drag);

      document.addEventListener(
        "mouseup",
        end,
        true
      );
    };

    hitLayer.on("mousemove", move);
    hitLayer.on("mouseout", hide);
    hitLayer.on("mousedown", start);

    if (ownsHitLayer) {
      layer.on("pm:change", sync);
    }

    layer._shapeRotationHandlers = {
      hitLayer,
      hint,
      move,
      hide,
      start,
      drag,
      end,
      sync,
      ownsHitLayer,
      get restoreMapDrag() {
        return restoreMapDrag;
      }
    };
  }

  function disablePolygonEdgeVertexInsert(layer) {
    disableShapeEdgeRotation(layer);
    if (!layer || !layer._poiEdgeInsertHandlers || !state.map) return;
    const handlers = layer._poiEdgeInsertHandlers;
    if (handlers.hitLayer) {
      handlers.hitLayer.off();
      if (state.map.hasLayer(handlers.hitLayer)) state.map.removeLayer(handlers.hitLayer);
    }
    if (handlers.marker && state.map.hasLayer(handlers.marker)) state.map.removeLayer(handlers.marker);
    if (handlers.sync) layer.off("pm:change", handlers.sync);
    delete layer._poiEdgeInsertHandlers;
  }

  function enablePolygonEdgeVertexInsert(layer) {
    if (!(layer instanceof L.Polygon) || layer instanceof L.Circle || !state.map) return;
    disablePolygonEdgeVertexInsert(layer);

    const measurementPolygon = layer._measurementMode === "polygon";
    const hitLayer = L.polygon(layer.getLatLngs(), {
      stroke: true,
      weight: 84,
      opacity: 0,
      fill: false,
      interactive: true,
      bubblingMouseEvents: false,
      pmIgnore: true,
      pane: "overlayPane"
    }).addTo(state.map);
    hitLayer._pmTempLayer = true;
    if (typeof hitLayer.bringToFront === "function") hitLayer.bringToFront();
    enableShapeEdgeRotation(layer, hitLayer);

    const marker = L.marker([0, 0], {
      icon: L.divIcon({
        className: "poi-edge-insert-dot-marker",
        iconSize: [10, 10],
        iconAnchor: [5, 5]
      }),
      interactive: false,
      keyboard: false,
      pmIgnore: true,
      pane: "markerPane",
      zIndexOffset: 900
    });
    marker._pmTempLayer = true;
    let candidate = null;

    const hide = () => {
      candidate = null;
      if (state.map.hasLayer(marker)) state.map.removeLayer(marker);
    };

    const sync = () => {
      if (state.map.hasLayer(hitLayer)) hitLayer.setLatLngs(layer._measurementMode === "distance" ? distanceMeasurementGeodesicLatLngs(layer.getLatLngs()) : layer.getLatLngs());
      hide();
    };

    const move = event => {
      const active = measurementPolygon ? layer._measurementEditing : state.editingLayer === layer;
      if (!active || !layer.pm || !layer.pm.enabled() || layer._poiPolygonDragging) {
        hide();
        return;
      }
      const nearest = nearestPolygonEdgeInsert(layer, event.latlng);
      if (!nearest) {
        hide();
        return;
      }
      candidate = nearest;

      marker.setLatLng(nearest.latlng);
      if (!state.map.hasLayer(marker)) marker.addTo(state.map);
    };

    const stopPointerEvent = event => {
      if (event.originalEvent) L.DomEvent.stop(event.originalEvent);
    };

    hitLayer.on("mousemove", move);
    hitLayer.on("mouseout", hide);
    hitLayer.on("mousedown", stopPointerEvent);
    hitLayer.on("click", event => {
      if ((layer._shapeRotationIgnoreClickUntil || 0) > Date.now()) return;
      stopPointerEvent(event);
      const active = measurementPolygon ? layer._measurementEditing : state.editingLayer === layer;
      if (!active) return;
      const nearest = nearestPolygonEdgeInsert(layer, event.latlng);
      if (!nearest) return;
      const inserted = L.latLng(nearest.latlng.lat, nearest.latlng.lng);
      nearest.ring.splice(nearest.segmentIndex + 1, 0, inserted);
      layer.setLatLngs(nearest.root);
      if (layer.redraw) layer.redraw();
      if (layer.pm && layer.pm.enabled() && typeof layer.pm._initMarkers === "function") { layer.pm._initMarkers(); if (layer.pm.options?.snappable && typeof layer.pm._initSnappableMarkers === "function") layer.pm._initSnappableMarkers(); }
      hitLayer.setLatLngs(layer._measurementMode === "distance" ? distanceMeasurementGeodesicLatLngs(layer.getLatLngs()) : layer.getLatLngs());
      hide();

      if (measurementPolygon) bindPolygonMeasurementVertexContextMenus(layer);
      if (measurementPolygon) {
        updateMeasurementTooltip(layer, "polygon");
        commitMeasurementHistory(layer);
        if (layer._measurementLocked) scheduleLockedMeasurementSave(layer);
      } else {
        showPolygonArea(layer);
        updateEditorGeometry(layer);
      }
    });

    layer.on("pm:change", sync);
    layer._poiEdgeInsertHandlers = {hitLayer, marker, move, hide, sync};
  }

  function enablePolygonDrawSelfSnapping(workingLayer) {
    const draw = state.map?.pm?.Draw?.Polygon;
    if (!draw || !workingLayer || workingLayer._faDrawSelfSnapHandler) return;

    const sync = () => {
      const latlngs = workingLayer.getLatLngs?.();
      const points = Array.isArray(latlngs) ? latlngs.flat(Infinity).filter(value => value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))) : [];
      if (points.length < 2) return;
      if (!Array.isArray(draw._otherSnapLayers)) draw._otherSnapLayers = [];
      if (!draw._otherSnapLayers.includes(workingLayer)) {
        draw._otherSnapLayers.push(workingLayer);
        delete draw._snapList;
      }
    };

    const cleanup = () => {
      workingLayer.off("pm:vertexadded", sync);
      if (Array.isArray(draw._otherSnapLayers)) {
        const index = draw._otherSnapLayers.indexOf(workingLayer);
        if (index >= 0) draw._otherSnapLayers.splice(index, 1);
      }
      delete draw._snapList;
      delete workingLayer._faDrawSelfSnapHandler;
    };

    workingLayer.on("pm:vertexadded", sync);
    state.map.once("pm:drawend", cleanup);
    workingLayer._faDrawSelfSnapHandler = {sync, cleanup};
    sync();
  }

  function polygonSnapRings(value, path = [], output = []) {
    if (!Array.isArray(value) || value.length === 0) return output;
    if (value[0] && !Array.isArray(value[0]) && Number.isFinite(Number(value[0].lat)) && Number.isFinite(Number(value[0].lng))) {
      output.push({ring: value, path});
      return output;
    }
    value.forEach((child, index) => polygonSnapRings(child, [...path, index], output));
    return output;
  }

  function polygonSnapPathEquals(a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function polygonSelfSnapSegments(layer, indexPath) {
    if (!(layer instanceof L.Polygon) || layer instanceof L.Circle || !Array.isArray(indexPath) || indexPath.length === 0) return [];
    const draggedIndex = Number(indexPath[indexPath.length - 1]);
    const draggedRingPath = indexPath.slice(0, -1);
    if (!Number.isInteger(draggedIndex)) return [];
    const segments = [];
    for (const {ring, path} of polygonSnapRings(layer.getLatLngs())) {
      if (!Array.isArray(ring) || ring.length < 2) continue;
      for (let index = 0; index < ring.length; index += 1) {
        const next = (index + 1) % ring.length;
        if (polygonSnapPathEquals(path, draggedRingPath) && (index === draggedIndex || next === draggedIndex)) continue;
        segments.push([L.latLng(ring[index]), L.latLng(ring[next])]);
      }
    }
    return segments;
  }

  function clearPolygonSelfSnapTarget(layer) {
    const pm = layer?.pm;
    if (!pm) return;
    if (pm._faSelfSnapHadOtherLayers) pm._otherSnapLayers = pm._faSelfSnapPreviousOtherLayers;
    else if (pm._faSelfSnapTarget) delete pm._otherSnapLayers;
    delete pm._faSelfSnapHadOtherLayers;
    delete pm._faSelfSnapPreviousOtherLayers;
    if (pm._faSelfSnapTarget && Array.isArray(pm._snapList)) pm._snapList = pm._snapList.filter(candidate => candidate !== pm._faSelfSnapTarget);
    delete pm._faSelfSnapTarget;
  }

  function disablePolygonSelfSnapping(layer) {
    if (!layer) return;
    const handlers = layer._faPolygonSelfSnapHandlers;
    if (handlers) {
      layer.off("pm:markerdragstart", handlers.start);
      layer.off("pm:markerdragend", handlers.end);
      layer.off("pm:disable", handlers.end);
      delete layer._faPolygonSelfSnapHandlers;
    }
    clearPolygonSelfSnapTarget(layer);
  }

  function enablePolygonSelfSnapping(layer) {
    if (!(layer instanceof L.Polygon) || layer instanceof L.Circle || !layer.pm) return;
    disablePolygonSelfSnapping(layer);
    const start = event => {
      clearPolygonSelfSnapTarget(layer);
      const segments = polygonSelfSnapSegments(layer, event?.indexPath);
      if (segments.length === 0) return;
      const pm = layer.pm;
      const hadOtherLayers = Object.prototype.hasOwnProperty.call(pm, "_otherSnapLayers");
      const previousOtherLayers = pm._otherSnapLayers;
      const existing = Array.isArray(previousOtherLayers) ? previousOtherLayers : [];
      const target = L.polyline(segments, {interactive: false, pmIgnore: true});
      pm._faSelfSnapHadOtherLayers = hadOtherLayers;
      pm._faSelfSnapPreviousOtherLayers = previousOtherLayers;
      pm._faSelfSnapTarget = target;
      pm._otherSnapLayers = [...existing, target];
      if (Array.isArray(pm._snapList) && !pm._snapList.includes(target)) pm._snapList.push(target);
    };
    const end = () => clearPolygonSelfSnapTarget(layer);
    layer.on("pm:markerdragstart", start);
    layer.on("pm:markerdragend", end);
    layer.on("pm:disable", end);
    layer._faPolygonSelfSnapHandlers = {start, end};
  }

  function cloneLatLngTree(value) {
    if (Array.isArray(value)) return value.map(cloneLatLngTree);
    return L.latLng(value.lat, value.lng, value.alt);
  }

  function translateLatLngTree(value, delta) {
    if (Array.isArray(value)) return value.map(item => translateLatLngTree(item, delta));
    return state.map.unproject(state.map.project(value, 0).add(delta), 0);
  }

  function enablePolygonCenterDrag(layer) {
    if (!(layer instanceof L.Circle || layer instanceof L.Polygon)) return;
    layer._poiPolygonDragEnabled = true;
    rebuildShapeCenterMarker(layer);
    const marker = layer._poiCenterMarker;
    if (!marker) return;

    let dragOrigin = null;
    let originalLatLngs = null;
    let originalCircleCenter = null;
    let originalDisplayCenter = null;
    const start = () => {
      layer._poiPolygonDragging = true;
      if (state.polygonDragMode === "polygon") {
        dragOrigin = L.latLng(marker.getLatLng());
        originalLatLngs = layer instanceof L.Polygon ? cloneLatLngTree(layer.getLatLngs()) : null;
        originalCircleCenter = layer instanceof L.Circle ? L.latLng(layer.getLatLng().lat, layer.getLatLng().lng) : null;
        originalDisplayCenter = layer._poiDisplayCenter ? L.latLng(layer._poiDisplayCenter.lat, layer._poiDisplayCenter.lng) : null;
      }
    };
    const drag = () => {
      if (state.polygonDragMode === "icon") {
        const current = marker.getLatLng();
        layer._poiDisplayCenter = L.latLng(current.lat, current.lng);
        if (layer instanceof L.Circle) showCircleArea(layer);
        else showPolygonArea(layer);
        syncPolygonDragControl();
        return;
      }
      if (!dragOrigin || (!originalLatLngs && !originalCircleCenter)) return;
      const currentAnchor = L.latLng(marker.getLatLng());
      if (layer instanceof L.Circle) {
        layer.setLatLng(rigidMoveLatLngOnGlobe(originalCircleCenter, dragOrigin, currentAnchor));
      } else {
        layer.setLatLngs(rigidMoveLatLngTreeOnGlobe(originalLatLngs, dragOrigin, currentAnchor));
      }
      if (originalDisplayCenter) {
        layer._poiDisplayCenter = rigidMoveLatLngOnGlobe(originalDisplayCenter, dragOrigin, currentAnchor);
      }
      if (layer.redraw) layer.redraw();
      if (layer._poiEdgeInsertHandlers?.hitLayer) layer._poiEdgeInsertHandlers.hitLayer.setLatLngs(layer._measurementMode === "distance" ? distanceMeasurementGeodesicLatLngs(layer.getLatLngs()) : layer.getLatLngs());
      if (layer.pm && layer.pm.enabled() && typeof layer.pm._initMarkers === "function") { layer.pm._initMarkers(); if (layer.pm.options?.snappable && typeof layer.pm._initSnappableMarkers === "function") layer.pm._initSnappableMarkers(); }
      if (layer instanceof L.Circle) showCircleArea(layer);
      else showPolygonArea(layer);
      updateEditorGeometry(layer);
    };
    const end = () => {
      if (state.polygonDragMode === "icon") {
        const current = marker.getLatLng();
        layer._poiDisplayCenter = L.latLng(current.lat, current.lng);
        if (layer instanceof L.Circle) showCircleArea(layer);
        else showPolygonArea(layer);
      } else if (layer.pm && layer.pm.enabled() && typeof layer.pm._initMarkers === "function") {
        layer.pm._initMarkers();
      }
      dragOrigin = null;
      originalLatLngs = null;
      originalCircleCenter = null;
      originalDisplayCenter = null;
      delete layer._poiPolygonDragging;
      syncPolygonDragControl();
      updateEditorGeometry(layer);
    };

    marker.on("dragstart", start);
    marker.on("drag", drag);
    marker.on("dragend", end);
    layer._poiPolygonDragHandlers = {marker, start, drag, end};
  }

  function disablePolygonCenterDrag(layer) {
    if (!(layer instanceof L.Circle || layer instanceof L.Polygon)) return;
    const handlers = layer._poiPolygonDragHandlers;
    if (handlers) {
      handlers.marker.off("dragstart", handlers.start);
      handlers.marker.off("drag", handlers.drag);
      handlers.marker.off("dragend", handlers.end);
      delete layer._poiPolygonDragHandlers;
    }
    delete layer._poiPolygonDragging;
    layer._poiPolygonDragEnabled = false;
    rebuildShapeCenterMarker(layer);
  }


  function disableGeometryEditing(preserveHistory = false) {
    if (!preserveHistory) resetEditorHistory(null);
    $("shape-convert-wrap").classList.add("hidden");
    $("shape-convert-menu").classList.add("hidden");
    const layer = state.editingLayer;
    $("polygon-drag-wrap").classList.add("hidden");
    $("polygon-drag-menu").classList.add("hidden");
    state.map?.getContainer()?.classList.remove("polygon-vertex-edit-mode");
    state.map?.getContainer()?.classList.remove("poi-circle-edit-mode");
      state.map?.getContainer?.().style.removeProperty("--polygon-measurement-color");
    if (!layer) return;
    if (layer._faRebindClickRemoval) {
      layer.off("pm:vertexadded pm:vertexremoved pm:markerdragend", layer._faRebindClickRemoval);
      delete layer._faRebindClickRemoval;
    }
    if (layer._poiEditorChangeHandler) {
      layer.off("pm:change", layer._poiEditorChangeHandler);
      delete layer._poiEditorChangeHandler;
    }
    if (layer._poiRadiusHandlers) {
      layer.off("pm:markerdragstart", layer._poiRadiusHandlers.start);
      layer.off("pm:markerdrag", layer._poiRadiusHandlers.drag);
      layer.off("pm:markerdragend", layer._poiRadiusHandlers.end);
      delete layer._poiRadiusHandlers;
    }
    disablePolygonEdgeVertexInsert(layer);
    disablePolygonSelfSnapping(layer);
    unbindPoiPolygonVertexClickRemoval(layer);
    disablePolygonCenterDrag(layer);
    hideCircleRadius(layer);
    hideCircleArea(layer);
    hidePolygonArea(layer);
    if (layer.pm && layer.pm.enabled()) layer.pm.disable();
    state.editingLayer = null;
    syncActiveGeometryHandleTheme();
    if (!preserveHistory) {
      const persistedPlace = state.places.find(item => item.id === layer._poiId);
      if (persistedPlace) applyLayerPresentation(layer, persistedPlace);
    }
    updatePoiVisibility();
  }

  // Match polygon measurements: click a POI vertex to delete it, drag to move it.
  function bindPoiPolygonVertexClickRemoval(layer) {
    if (!(layer instanceof L.Polygon) || layer instanceof L.Circle ||
        state.editingLayer !== layer || !layer.pm?.enabled?.()) return;
    for (const marker of polygonMeasurementVertexMarkers(layer)) {
      if (marker._faPoiVertexClickHandlers) continue;
      const start = () => { marker._faPoiSuppressDeleteUntil = Infinity; };
      const end = () => { marker._faPoiSuppressDeleteUntil = Date.now() + 500; };
      const click = event => {
        const original = event?.originalEvent;
        if (original && original.button !== undefined && original.button !== 0) return;
        if (original) { original.preventDefault(); L.DomEvent.stopPropagation(original); }
        if (state.editingLayer !== layer || !layer.pm?.enabled?.() ||
            (marker._faPoiSuppressDeleteUntil || 0) > Date.now()) return;
        const found = L.PM?.Utils?.findDeepMarkerIndex?.(layer.pm._markers || [], marker);
        if (!Array.isArray(found?.indexPath)) return;
        const next = cloneLatLngTree(layer.getLatLngs());
        if (!removePolygonMeasurementVertexAtPath(next, found.indexPath)) return;
        commitEditorHistory(layer);
        layer.setLatLngs(next);
        layer.redraw?.();
        layer._poiEdgeInsertHandlers?.sync?.();
        syncShapeCenterMarker(layer, editorMarkerMeta());
        showPolygonArea(layer);
        updateEditorGeometry(layer);
        commitEditorHistory(layer);
        // Geoman owns the handles: rebuild after the current click dispatch ends.
        setTimeout(() => {
          if (state.editingLayer !== layer || !layer.pm?.enabled?.()) return;
          layer.pm._initMarkers?.();
          if (layer.pm.options?.snappable) layer.pm._initSnappableMarkers?.();
          bindPoiPolygonVertexClickRemoval(layer);
        }, 0);
      };
      marker._faPoiVertexClickHandlers = {start, end, click};
      marker.on("dragstart", start);
      marker.on("dragend", end);
      marker.on("click", click);
    }
  }

  function unbindPoiPolygonVertexClickRemoval(layer) {
    for (const marker of polygonMeasurementVertexMarkers(layer)) {
      const handlers = marker._faPoiVertexClickHandlers;
      if (!handlers) continue;
      marker.off("dragstart", handlers.start);
      marker.off("dragend", handlers.end);
      marker.off("click", handlers.click);
      delete marker._faPoiVertexClickHandlers;
    }
  }

  function enableGeometryEditing(layer, preserveHistory = false) {
    disableGeometryEditing(preserveHistory);
    state.editingLayer = layer;
    syncActiveGeometryHandleTheme();
    if (layer._poiId) clearWrappedPoiCopies(layer._poiId);
    if (preserveHistory) state.editHistory.layer = layer;
    else resetEditorHistory(layer);
    state.map?.getContainer()?.classList.toggle("polygon-vertex-edit-mode", layer instanceof L.Polygon && !(layer instanceof L.Circle));
    state.map?.getContainer()?.classList.toggle("poi-circle-edit-mode", layer instanceof L.Circle);
    if (layer instanceof L.Polygon || layer instanceof L.Circle) {
      state.map?.getContainer()?.style.setProperty("--polygon-measurement-color", validPoiColor(layer.options?.color) || state.poiColor);
    }
    if (!state.map.hasLayer(layer)) layer.addTo(state.map);
    layer._poiEditorChangeHandler = () => {
      updateEditorGeometry(layer);
      if (layer instanceof L.Polygon) showPolygonArea(layer);
      if (layer instanceof L.Circle) showCircleArea(layer);
    };
    layer.on("pm:change", layer._poiEditorChangeHandler);
    if (layer instanceof L.Polygon && !(layer instanceof L.Circle)) {
      layer._faRebindClickRemoval = () => requestAnimationFrame(() => {
        if (state.editingLayer === layer && layer.pm?.enabled?.()) bindPoiPolygonVertexClickRemoval(layer);
      });
      layer.on("pm:vertexadded pm:vertexremoved pm:markerdragend", layer._faRebindClickRemoval);
    }
    if (layer instanceof L.Polygon && !(layer instanceof L.Circle)) {
    }
    installLayerDragAutoPan(layer);
    if (layer.pm && !layer.pm.enabled()) {
      if (layer instanceof L.Polygon && !(layer instanceof L.Circle)) layer.pm.enable({hideMiddleMarkers: true, preventMarkerRemoval: true, removeVertexOn: "contextmenu", removeLayerBelowMinVertexCount: false, snappable: true, snapDistance: 20, snapSegment: true, snapVertex: true});
      else if (layer instanceof L.Marker) layer.pm.enable({preventMarkerRemoval: true});
      else if (layer instanceof L.Circle) layer.pm.enable({hintlineStyle: {color: layer.options?.color || placeColor(editorMarkerMeta()) || state.poiColor, weight: 2, dashArray: "5,5"}});
      else layer.pm.enable();
    }
    if (layer instanceof L.Polygon && !(layer instanceof L.Circle)) enablePolygonSelfSnapping(layer);
    if (layer instanceof L.Polygon && !(layer instanceof L.Circle)) bindPoiPolygonVertexClickRemoval(layer);
    enablePolygonEdgeVertexInsert(layer);
    if (layer instanceof L.Circle || layer instanceof L.Polygon) {
      state.polygonDragMode = "icon";
      enablePolygonCenterDrag(layer);
      if (layer instanceof L.Circle) showCircleArea(layer);
      else showPolygonArea(layer);
      syncPolygonDragControl();
    } else {
      $("polygon-drag-wrap").classList.add("hidden");
      $("polygon-drag-menu").classList.add("hidden");
      syncShapeConvertOffsetForDragMenu();
    }
    syncShapeConvertControl();
  }

  function serializeLayer(layer) {
    const worldOffset = poiWorldOffsetForLayer(layer);
    if (layer instanceof L.Circle) {
      const c = layer.getLatLng();
      return {
        shape_type: "circle",
        geometry: {type: "Point", coordinates: [c.lng - worldOffset, c.lat]},
        center: {lat: c.lat, lon: c.lng - worldOffset},
        radius_m: layer.getRadius()
      };
    }

    if (layer instanceof L.Marker) {
      const c = layer.getLatLng();
      return {
        shape_type: "point",
        geometry: {type: "Point", coordinates: [c.lng - worldOffset, c.lat]},
        center: {lat: c.lat, lon: c.lng - worldOffset},
        radius_m: 0
      };
    }

    const rawGeometry = layer.toGeoJSON().geometry;
    const geometry = worldOffset
      ? {...rawGeometry, coordinates: shiftedGeoJsonCoordinates(rawGeometry.coordinates, -worldOffset)}
      : rawGeometry;
    const c = layer.getBounds().getCenter();
    return {
      shape_type: "polygon",
      geometry,
      center: {lat: c.lat, lon: c.lng - worldOffset},
      radius_m: 0
    };
  }

  function layerFromPlace(place) {

    let layer;
    const color = placeColor(place);

    if (place.shape_type === "circle") {
      const [lon, lat] = place.geometry.coordinates;
      layer = L.circle([lat, lon], {
        radius: Number(place.radius_m || 0),
        color,
        fillColor: color,
        weight: 2,
        fillOpacity: state.fillOpacity
      });
      layer._poiDisplayCenter = displayCenterLatLng(place.display_center);
    } else if (place.shape_type === "polygon") {
      const group = L.geoJSON(place.geometry, {
        style: {color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity}
      });
      layer = group.getLayers()[0];
      layer._poiDisplayCenter = displayCenterLatLng(place.display_center);
    } else {
      const [lon, lat] = place.geometry.coordinates;
      layer = L.marker([lat, lon], {icon: markerIcon(place)});
    }

    layer.addTo(state.map);
    layer._poiWorldOffset = 0;
    bindLayerClicks(layer, place.id);
    applyLayerPresentation(layer, place);
    return layer;
  }


  function externalPoiDraftLayerFromGeometry(geometry, meta = {}) {
    if (!geometry || typeof geometry !== "object") return null;
    let copy;
    try { copy = JSON.parse(JSON.stringify(geometry)); } catch (_) { return null; }
    const type = String(copy.type || "");
    const color = validPoiColor(meta.color) || state.poiColor;
    if (type === "Point") {
      const coordinates = copy.coordinates;
      const lon = Number(coordinates?.[0]);
      const lat = Number(coordinates?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return L.marker([lat, lon], {icon: markerIcon({...meta, color})});
    }
    if (type !== "Polygon" && type !== "MultiPolygon") return null;
    try {
      const group = L.geoJSON({type: "Feature", properties: {}, geometry: copy}, {
        style: {color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity}
      });
      const polygons = group.getLayers().filter(candidate => candidate instanceof L.Polygon && !(candidate instanceof L.Circle));
      return polygons.length === 1 ? polygons[0] : null;
    } catch (_) {
      return null;
    }
  }

  async function beginExternalPoiDraft(payload = {}) {
    if (state.pendingLayer) {
      showToast("Save, Delete, or Close current unsaved POI first.");
      showEditorPanel();
      $("name").focus();
      return false;
    }
    if (!$("editor").classList.contains("hidden") && !closeEditorWithPrompt()) return false;

    hideMapContextMenu();
    const customFields = payload.customFields && typeof payload.customFields === "object" ? payload.customFields : {};
    const tags = Array.isArray(payload.tags) ? payload.tags.map(value => String(value || "").trim()).filter(Boolean) : [];
    const meta = {
      name: String(payload.name || "").trim(),
      category: String(payload.category || "").trim(),
      tags,
      notes: String(payload.notes || ""),
      custom_fields: customFields,
      favorite: false,
      icon: String(payload.icon || "").trim() || "location-dot",
      color: validPoiColor(payload.color) || "",
      area_name: String(payload.areaName || "").trim(),
      area_custom: Boolean(String(payload.areaName || "").trim())
    };
    const layer = externalPoiDraftLayerFromGeometry(payload.geometry, meta);
    if (!layer) {
      showToast("This result cannot be converted to a point or polygon POI.");
      return false;
    }

    layer.addTo(state.map);
    state.pendingLayer = layer;
    bindLayerClicks(layer, null);
    applyLayerPresentation(layer, meta);
    await openEditor(null, layer);

    $("name").value = meta.name;
    setEditorCategoryValue(meta.category);
    $("tags").value = meta.tags.join(", ");
    $("notes").value = meta.notes;
    resizeNotesToContent();
    $("custom-fields").value = JSON.stringify(meta.custom_fields, null, 2);
    $("favorite").checked = false;
    $("icon").value = meta.icon;
    $("place-color").value = meta.color;
    if (meta.area_name) {
      state.editorAreaCustom = true;
      cancelEditorAreaLookup();
      const draftGeo = serializeLayer(layer);
      state.editorAreaLookupKey = editorAreaLocationKey(draftGeo.center.lat, draftGeo.center.lon);
      $("area-name").value = meta.area_name;
    }
    populateEditorSuggestions();
    updateEditorPresentation();
    const geo = serializeLayer(layer);
    $("coords").value = formatCoordinates(geo.center.lat, geo.center.lon);
    renderExternalLinks({lat: geo.center.lat, lon: geo.center.lon, name: meta.name || "New place"});
    state.editorSnapshot = editorStateSignature();
    $("name").focus({preventScroll: true});
    return true;
  }

  window.FAPOI = {
    beginExternalDraft: beginExternalPoiDraft
  };

  function clearTrashPreview() {
    const layer = state.trashPreviewLayer;
    if (layer) removeLayerAndCenter(layer);
    state.trashPreviewLayer = null;
    state.trashPreviewPlaceId = null;
    state.trashPreviewNavigating = false;
  }

  function fadeTrashPreviewIn(layer) {
    if (!layer) return;
    const elements = [layer._icon, layer._path, layer._poiCenterMarker?._icon].filter(Boolean);
    for (const element of elements) {
      element.style.transition = "none";
      element.style.opacity = "0";
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const element of elements) {
          element.style.transition = "opacity 260ms ease";
          element.style.opacity = "1";
        }
      });
    });
  }

  function fadeTrashPreview() {
    const layer = state.trashPreviewLayer;
    if (!layer) return;
    state.trashPreviewLayer = null;
    state.trashPreviewPlaceId = null;
    state.trashPreviewNavigating = false;
    const elements = [layer._icon, layer._path, layer._poiCenterMarker?._icon].filter(Boolean);
    for (const element of elements) {
      element.style.transition = "opacity 260ms ease";
      element.style.opacity = "1";
    }
    requestAnimationFrame(() => {
      for (const element of elements) element.style.opacity = "0";
    });
    setTimeout(() => removeLayerAndCenter(layer), 280);
  }

  function trashPreviewLayerFromPlace(place) {
    if (!state.map || !place?.geometry) return null;
    const color = placeColor(place);
    let layer = null;
    if (place.shape_type === "circle") {
      const [lon, lat] = place.geometry.coordinates;
      layer = L.circle([lat, lon], {radius: Number(place.radius_m || 0), color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity, interactive: false});
      layer._poiDisplayCenter = displayCenterLatLng(place.display_center);
    } else if (place.shape_type === "polygon") {
      const group = L.geoJSON(place.geometry, {style: {color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity, interactive: false}});
      layer = group.getLayers()[0] || null;
      if (layer) {
        layer.options.interactive = false;
        layer._poiDisplayCenter = displayCenterLatLng(place.display_center);
      }
    } else {
      const [lon, lat] = place.geometry.coordinates;
      layer = L.marker([lat, lon], {icon: markerIcon(place), interactive: false, keyboard: false});
    }
    if (!layer) return null;
    layer.options.pmIgnore = true;
    layer.options.snapIgnore = true;
      layer.options.bubblingMouseEvents = false;
    layer.addTo(state.map);
    if (layer instanceof L.Circle || layer instanceof L.Polygon) {
      const center = layer._poiDisplayCenter || (layer instanceof L.Circle ? layer.getLatLng() : polygonLayerAverageCenter(layer));
      if (center) {
        layer._poiCenterMarker = L.marker(center, {icon: markerIcon(place), interactive: false, keyboard: false});
        layer._poiCenterMarker.options.pmIgnore = true;
        layer._poiCenterMarker.options.snapIgnore = true;
        layer._poiCenterMarker.addTo(state.map);
      }
    }
    return layer;
  }

  function previewDeletedPlace(place) {
    if (!state.map || !place?.geometry) {
      showToast("Deleted place has no geometry to preview.");
      return;
    }
    clearTrashPreview();
    let layer = null;
    try {
      layer = trashPreviewLayerFromPlace(place);
    } catch (err) {
      showToast(`Unable to preview deleted place: ${err.message}`);
      return;
    }
    if (!layer) {
      showToast("Unable to preview deleted place.");
      return;
    }
    state.trashPreviewLayer = layer;
    state.trashPreviewPlaceId = place.id;
    state.trashPreviewNavigating = true;
    fadeCenterCrosshairForPoi(true);
    fadeTrashPreviewIn(layer);
    const center = layerCenter(layer);
    let zoom = state.map.getZoom();
    if (layer instanceof L.Marker) {
      zoom = Math.max(zoom, 13);
    } else if (typeof layer.getBounds === "function") {
      zoom = Math.max(zoom, Math.min(state.map.getBoundsZoom(layer.getBounds(), false, L.point(80, 80)), 14));
    }
    const finishNavigation = () => {
      if (state.trashPreviewPlaceId === place.id) state.trashPreviewNavigating = false;
    };
    state.map.once("moveend", finishNavigation);
    navigateMap(center, {zoom});
    setTimeout(finishNavigation, 350);
  }

  async function fetchPlacesByDeleted(deleted, sort) {
    const all = [];
    const filter = encodeURIComponent(`deleted = ${deleted ? "true" : "false"}`);
    let page = 1;
    let totalPages = 1;
    do {
      const data = await api(`/collections/places/records?page=${page}&perPage=500&sort=${encodeURIComponent(sort)}&filter=${filter}`);
      all.push(...data.items);
      totalPages = data.totalPages;
      page += 1;
    } while (page <= totalPages);
    return all;
  }




  async function refreshDeletedCount() {
    const filter = encodeURIComponent("deleted = true");
    const data = await api(`/collections/places/records?page=1&perPage=1&filter=${filter}`);
    state.deletedCount = Number(data.totalItems || 0);
    updateTrashButton();
  }

  async function loadDeletedPlaces() {
    state.deletedPlaces = await fetchPlacesByDeleted(true, "-deleted_at");
    state.deletedCount = state.deletedPlaces.length;
    updateTrashButton();
    renderList();
  }

  async function loadPlaces() {
    const all = await fetchPlacesByDeleted(false, "-updated");

    for (const layer of state.placeLayers.values()) removeLayerAndCenter(layer);
    state.placeLayers.clear();

    state.places = all;
    for (const place of state.places) {
      if (!place.geometry) continue;
      const layer = layerFromPlace(place);
      state.placeLayers.set(place.id, layer);
    }

    await refreshDeletedCount();
    populateCategories();
    populateEditorSuggestions();
    renderList();
    updatePoiVisibility();
  }

  function existingEditorCategories() {
    const values = state.places
      .map(place => String(place.category || "").trim())
      .filter(Boolean);
    const unique = new Map();
    for (const value of values) {
      const key = value.toLocaleLowerCase();
      if (!unique.has(key)) unique.set(key, value);
    }
    return [...unique.values()].sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"}));
  }

  function existingEditorTags() {
    const unique = new Map();
    for (const place of state.places) {
      const tags = Array.isArray(place.tags) ? place.tags : String(place.tags || "").split(",");
      for (const tag of tags) {
        const value = String(tag || "").trim();
        if (!value) continue;
        const key = value.toLocaleLowerCase();
        if (!unique.has(key)) unique.set(key, value);
      }
    }
    return [...unique.values()].sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"}));
  }

  function hideEditorAutocomplete(list, input) {
    if (!list) return;
    list.classList.add("hidden");
    input?.setAttribute("aria-expanded", "false");
    if (input) input._autocompleteIndex = -1;
  }

  function setEditorAutocompleteOptions(list, input, options, onSelect) {
    if (!list || !input) return;
    list.replaceChildren();
    input._autocompleteIndex = -1;

    if (!options.length || document.activeElement !== input) {
      hideEditorAutocomplete(list, input);
      return;
    }

    for (const option of options.slice(0, 10)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editor-autocomplete-option";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");
      button.textContent = option.label;
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => {
        onSelect(option.value);
        hideEditorAutocomplete(list, input);
        input.focus();
      });
      list.appendChild(button);
    }

    list.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
  }

  function updateEditorAutocompleteSelection(input, list, index) {
    const options = [...list.querySelectorAll(".editor-autocomplete-option")];
    if (!options.length) return;
    const next = Math.max(0, Math.min(index, options.length - 1));
    input._autocompleteIndex = next;
    options.forEach((option, optionIndex) => {
      const selected = optionIndex === next;
      option.classList.toggle("active", selected);
      option.setAttribute("aria-selected", selected ? "true" : "false");
    });
    options[next].scrollIntoView({block: "nearest"});
  }

  function handleEditorAutocompleteKeydown(event, list) {
    if (!list || list.classList.contains("hidden")) return false;
    const options = [...list.querySelectorAll(".editor-autocomplete-option")];
    if (!options.length) return false;
    const current = Number.isInteger(event.currentTarget._autocompleteIndex) ? event.currentTarget._autocompleteIndex : -1;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateEditorAutocompleteSelection(event.currentTarget, list, current < options.length - 1 ? current + 1 : 0);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      updateEditorAutocompleteSelection(event.currentTarget, list, current > 0 ? current - 1 : options.length - 1);
      return true;
    }
    if (event.key === "Enter" && current >= 0) {
      event.preventDefault();
      options[current].click();
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      hideEditorAutocomplete(list, event.currentTarget);
      return true;
    }
    return false;
  }

  function commitEditorAutocomplete(input, value) {
    input.value = value;
    input.dispatchEvent(new Event("input", {bubbles: true}));
  }

  const EDITOR_CATEGORY_OPTIONS = new Set(["Tunnel", "Site", "Facility", "Area", "Event", "Other"]);
  function setEditorCategoryValue(value) {
    const select = $("category");
    const category = String(value || "").trim();
    select.value = EDITOR_CATEGORY_OPTIONS.has(category) ? category : "";
    if (category && !EDITOR_CATEGORY_OPTIONS.has(category)) select.dataset.legacyCategory = category;
    else delete select.dataset.legacyCategory;
  }
  function editorCategoryValue() {
    const select = $("category");
    return select.value || select.dataset.legacyCategory || "";
  }

  function populateCategorySuggestions() {
    const list = $("category-suggestions");
    const input = $("category");
    if (!list || !input) return;
    const typed = input.value.trim().toLocaleLowerCase();
    const options = existingEditorCategories()
      .filter(value => {
        const key = value.toLocaleLowerCase();
        return (!typed || key.startsWith(typed)) && key !== typed;
      })
      .map(value => ({label: value, value}));
    setEditorAutocompleteOptions(list, input, options, value => commitEditorAutocomplete(input, value));
  }

  function populateTagSuggestions() {
    const list = $("tag-suggestions");
    const input = $("tags");
    if (!list || !input) return;

    const raw = input.value;
    const commaIndex = raw.lastIndexOf(",");
    const prefix = commaIndex >= 0 ? raw.slice(0, commaIndex + 1) : "";
    const typed = raw.slice(commaIndex + 1).trim().toLocaleLowerCase();
    const previous = commaIndex >= 0 ? raw.slice(0, commaIndex) : "";
    const used = new Set(previous.split(",").map(value => value.trim().toLocaleLowerCase()).filter(Boolean));
    const spacer = prefix && !prefix.endsWith(" ") ? " " : "";

    const options = existingEditorTags()
      .filter(value => {
        const key = value.toLocaleLowerCase();
        return !used.has(key) && (!typed || key.startsWith(typed)) && key !== typed;
      })
      .map(value => ({label: value, value: `${prefix}${spacer}${value}`}));

    setEditorAutocompleteOptions(list, input, options, value => commitEditorAutocomplete(input, value));
  }

  function populateEditorSuggestions() {
    populateCategorySuggestions();
    populateTagSuggestions();
  }




  function placeMatchesCategoryFilter(place, selectedCategory) {
    const selected = String(selectedCategory || "");
    if (!selected) return true;
    return placeCategoryFilterValue(place) === selected;
  }

  function populateCategories() {
    const select = $("category-filter");
    if (!select) return;
    const current = select.value;
    const categories = [...new Set(state.places.map(p => String(p.category || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"}));
    const hasUncategorized = state.places.some(p => !String(p.category || "").trim());
    const availableCategoryValues = new Set([...categories, ...(hasUncategorized ? [UNCATEGORIZED_CATEGORY_FILTER] : [])]);
    for (const hiddenCategory of [...state.hiddenPoiCategories]) if (!availableCategoryValues.has(hiddenCategory)) state.hiddenPoiCategories.delete(hiddenCategory);

    select.replaceChildren();

    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All categories";
    select.appendChild(all);

    for (const category of categories) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      if (state.hiddenPoiCategories.has(category)) { option.classList.add("poi-category-hidden"); option.style.color = "#ff5c5c"; }
      select.appendChild(option);
    }

    if (hasUncategorized) {
      const uncategorized = document.createElement("option");
      uncategorized.value = UNCATEGORIZED_CATEGORY_FILTER;
      uncategorized.textContent = "Uncategorized";
      if (state.hiddenPoiCategories.has(UNCATEGORIZED_CATEGORY_FILTER)) { uncategorized.classList.add("poi-category-hidden"); uncategorized.style.color = "#ff5c5c"; }
      select.appendChild(uncategorized);
    }

    select.value = (categories.includes(current) || (current === UNCATEGORIZED_CATEGORY_FILTER && hasUncategorized)) ? current : "";
  }

  function filteredPlaces() {
    const q = $("search").value.trim();
    if (state.trashMode) {
      return state.deletedPlaces
        .filter(place => placeMatchesSearch(place, q))
        .sort((a, b) => String(b.deleted_at || b.updated).localeCompare(String(a.deleted_at || a.updated)));
    }

    const category = $("category-filter").value;
    const favOnly = $("favorites-only").checked;
    const sort = $("sort").value;

    const out = state.places.filter(place => {
      if (!placeMatchesCategoryFilter(place, category)) return false;
      if (favOnly && !place.favorite) return false;
      return placeMatchesSearch(place, q);
    });

    out.sort((a, b) => {
      if (state.pinFavoritesInSidebar && Boolean(a.favorite) !== Boolean(b.favorite)) return Number(b.favorite) - Number(a.favorite);
      if (sort === "name") return (a.name || "").localeCompare(b.name || "");
      if (sort === "created") return String(b.created).localeCompare(String(a.created));
      if (sort === "favorite") return Number(b.favorite) - Number(a.favorite) || String(b.updated).localeCompare(String(a.updated));
      return String(b.updated).localeCompare(String(a.updated));
    });

    return out;
  }

  function updateTrashButton() {
    const button = $("trash-btn");
    if (!button) return;
    if (state.trashMode) {
      button.innerHTML = '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i><span>Back to saved</span>';
    } else {
      button.textContent = `Trash (${state.deletedCount})`;
    }
  }

  function syncSidebarModeUi() {
    const title = $("sidebar-title");
    if (title) title.textContent = state.trashMode ? "Trash" : "Saved places";
    $("search").placeholder = state.trashMode ? "Search deleted places" : "Search places";
    $("saved-filters").classList.toggle("hidden", state.trashMode);
    $("favorites-wrap").classList.toggle("hidden", state.trashMode);
    updateTrashButton();
  }

  async function setTrashMode(enabled) {
    const next = Boolean(enabled);
    if (next === state.trashMode) return;
    if (next && !closeEditorWithPrompt()) return;
    state.trashMode = next;
    if (!next) clearTrashPreview();
    state.selectedId = null;
    $("search").value = "";
    syncSidebarModeUi();
    updateCenterCrosshairVisibility();
    if (next) {
      try {
        await loadDeletedPlaces();
      } catch (err) {
        state.trashMode = false;
        syncSidebarModeUi();
        renderList();
        showToast(err.message);
      }
      return;
    }
    renderList();
  }

  function renderList() {
    syncFavoritesToggle();
    const items = filteredPlaces();
    const list = $("place-list");
    list.replaceChildren();

    if (state.trashMode) {
      $("place-count").textContent = `${items.length}/${state.deletedPlaces.length}`;
      for (const place of items) {
        const item = document.createElement("div");
        item.className = "place-item trash-item";
        item.addEventListener("click", event => {
          if (event.detail > 1 || event.target.closest("button")) return;
          previewDeletedPlace(place);
        });

        const title = document.createElement("div");
        title.className = "place-title";
        const name = document.createElement("span");
        name.className = "place-name";
        name.textContent = place.name || "Unnamed place";
        title.appendChild(name);

        const category = document.createElement("div");
        category.className = "poi-hover-category trash-category";
        const categoryDot = document.createElement("span");
        categoryDot.className = "poi-hover-category-dot";
        categoryDot.style.background = placeColor(place);
        const categoryText = document.createElement("span");
        categoryText.textContent = String(place.category || "").trim() || "Uncategorized";
        category.append(categoryDot, categoryText);

        const meta = document.createElement("div");
        meta.className = "place-meta";
        meta.textContent = place.area_name || "";

        const deletedMeta = document.createElement("div");
        deletedMeta.className = "place-meta trash-deleted-at";
        const deletedAt = formatRecordTimestamp(place.deleted_at);
        deletedMeta.textContent = deletedAt ? `Deleted ${deletedAt}` : "Deleted";

        const actions = document.createElement("div");
        actions.className = "trash-actions";
        const restore = document.createElement("button");
        restore.type = "button";
        restore.className = "secondary small";
        restore.textContent = "Restore";
        restore.addEventListener("click", () => restoreDeletedPlace(place.id));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "secondary small trash-delete";
        remove.textContent = "Delete permanently";
        remove.addEventListener("click", () => permanentlyDeletePlace(place.id));
        actions.append(restore, remove);

        item.append(title, category, meta, deletedMeta, actions);
        list.appendChild(item);
      }
      return;
    }

    $("place-count").textContent = `${items.length}/${state.places.length}`;
    for (const place of items) {
      const item = document.createElement("div");
      item.className = "place-item" + (state.selectedId === place.id ? " active" : "");
      item.addEventListener("contextmenu", event => {
        event.preventDefault();
        event.stopPropagation();
        const layer = state.placeLayers.get(place.id);
        if (!layer || !state.map) return;
        showPoiContextMenu({originalEvent: event, containerPoint: state.map.mouseEventToContainerPoint(event)}, layer);
      });
      item.addEventListener("click", (event) => {
        if (event.detail > 1) return;
        selectPlace(place.id, true);
      });

      const title = document.createElement("div");
      title.className = "place-title";

      const name = document.createElement("span");
      name.className = "place-name";
      name.textContent = place.name || "Unnamed place";
      title.appendChild(name);

      if (place.favorite) {
        const star = document.createElement("span");
        star.className = "star";
        star.textContent = "*";
        name.append(" ", star);
      }


      const meta = document.createElement("div");
      meta.className = "place-meta";
      const bits = [place.category, place.area_name].filter(Boolean);
      meta.textContent = bits.join(" - ");

      item.append(title, meta);
      list.appendChild(item);
    }
  }

  async function selectPlace(id, allowEditor = true, longitudeOffset = 0, forceEditor = false) {
    const place = state.places.find(p => p.id === id);
    const layer = state.placeLayers.get(id);
    if (!place || !layer) return;

    const requestedOffset = Number.isFinite(Number(longitudeOffset)) ? Number(longitudeOffset) : 0;
    const currentOffset = Number.isFinite(Number(layer._poiWorldOffset)) ? Number(layer._poiWorldOffset) : 0;
    const baseCenter = layerCenter(layer);
    const targetCenter = L.latLng(baseCenter.lat, baseCenter.lng + requestedOffset - currentOffset);
    const targetPoint = state.map.latLngToContainerPoint(targetCenter);
    const viewportCenter = state.followScreenCenter ? state.map.latLngToContainerPoint(visibleMapCenterLatLng() || state.map.getCenter()) : state.map.getSize().divideBy(2);
    if (allowEditor && (forceEditor || targetPoint.distanceTo(viewportCenter) <= 2)) {
      fadeCenterCrosshairForPoi();
      if (state.pendingLayer) {
        showToast("Save, Delete, or Close current POI prior to adding another.");
        showEditorPanel();
        $("name").focus();
        return;
      }
      if (!$("editor").classList.contains("hidden") && $("record-id").value === id && state.editingLayer === layer) {
        $("name").focus();
        return;
      }
      state.selectedId = id;
      renderList();
      updateCenterCrosshairVisibility();
      if (forceEditor && targetPoint.distanceTo(viewportCenter) > 2) navigateMap(targetCenter, {zoom: state.map.getZoom()});
      setPoiLayerWorldOffset(layer, requestedOffset);
      clearWrappedPoiCopies(id);
      await openEditor(place, layer);
      return;
    }

    state.selectedId = id;
    renderList();
    updateCenterCrosshairVisibility();

    if (layer instanceof L.Marker) {
      const targetZoom = Math.max(state.map.getZoom(), 13);
      fadeCenterCrosshairForPoi(!mapNavigationWillAnimate(targetCenter, targetZoom));
      navigateMap(targetCenter, {zoom: targetZoom});
      if (requestedOffset === 0) { layer._hiddenPoiSidebarPreview = poiLayerHiddenByVisibility(layer); layer._hiddenPoiSidebarPreviewShown = false; updatePoiVisibility(); }
      return;
    }

    const targetZoom = Math.max(
      state.map.getZoom(),
      Math.min(state.map.getBoundsZoom(layer.getBounds(), false, L.point(80, 80)), 14)
    );
    fadeCenterCrosshairForPoi(!mapNavigationWillAnimate(targetCenter, targetZoom));
    navigateMap(targetCenter, {zoom: targetZoom});
    if (requestedOffset === 0) { layer._hiddenPoiSidebarPreview = poiLayerHiddenByVisibility(layer); layer._hiddenPoiSidebarPreviewShown = false; updatePoiVisibility(); }
  }

  function formatRecordTimestamp(value) {

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(undefined, {dateStyle: "medium", timeStyle: "short"});
  }

  function normalizeAppViewport() {
    const appRoot = $("app");
    if (appRoot) {
      appRoot.scrollLeft = 0;
      appRoot.scrollTop = 0;
    }
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }

  function resizeNotesToContent() { const el = $("notes"); const css = getComputedStyle(el); const line = parseFloat(css.lineHeight) || (parseFloat(css.fontSize) || 14) * 1.35; const border = (parseFloat(css.borderTopWidth) || 0) + (parseFloat(css.borderBottomWidth) || 0); const padding = (parseFloat(css.paddingTop) || 0) + (parseFloat(css.paddingBottom) || 0); el.style.height = "auto"; el.style.height = Math.ceil(el.value ? el.scrollHeight + border + 2 * line : padding + border + 3 * line) + "px"; }
  $("notes").addEventListener("input", resizeNotesToContent);
  function showEditorPanel() {
    window.FAOverpass?.close?.();
    window.FASAR?.close?.();
    normalizeAppViewport();
    $("editor").classList.remove("hidden");
    resizeNotesToContent();
    syncPolygonDragControl();
    syncShapeConvertControl();
    requestAnimationFrame(normalizeAppViewport);
  }

  function hideEditorPanel() {
    cancelEditorAreaLookup({resetKey: true});
    state.placeHistoryLookupToken += 1;
    $("place-history").classList.add("hidden");
    $("place-form").classList.remove("hidden");
    state.placeHistoryPlaceId = null;
    state.placeHistoryRevisions = [];
    $("editor").classList.add("hidden");
    resetEditorResearch(null);
    $("polygon-drag-wrap").classList.add("hidden");
    $("polygon-drag-menu").classList.add("hidden");
    $("shape-convert-wrap").classList.add("hidden");
    $("shape-convert-menu").classList.add("hidden");
    normalizeAppViewport();
  }

  async function openEditor(place, layer) {
    cancelEditorAreaLookup({resetKey: true});
    state.placeHistoryLookupToken += 1;
    $("config-panel").classList.add("hidden");
    enableGeometryEditing(layer);
    const geo = serializeLayer(layer);
    $("record-id").value = place?.id || "";
    $("place-history").classList.add("hidden");
    $("place-form").classList.remove("hidden");
    state.placeHistoryPlaceId = null;
    state.placeHistoryRevisions = [];
    $("editor-title").textContent = place ? "Edit place" : "New place";
    $("name").value = place?.name || "";
    setEditorCategoryValue(place?.category || "");
    $("tags").value = Array.isArray(place?.tags) ? place.tags.join(", ") : "";
    populateEditorSuggestions();
    $("notes").value = place?.notes || "";
    resetEditorResearch(place);
    $("custom-fields").value = JSON.stringify(place?.custom_fields || {}, null, 2);
    $("favorite").checked = Boolean(place?.favorite);
    $("icon").value = place ? (typeof place.icon === "string" && place.icon.trim().length > 1 ? place.icon : "") : "location-dot";
    $("place-color").value = validPoiColor(place?.color) || "";
    applyLayerPresentation(layer, editorMarkerMeta());
    $("coords").value = formatCoordinates(geo.center.lat, geo.center.lon);
    state.editorAreaCustom = Boolean(place?.area_custom);
    $("area-name").value = place?.area_name || "";
    $("area-name").placeholder = "Reverse geocoding...";
    if (place?.area_name) state.editorAreaLookupKey = editorAreaLocationKey(geo.center.lat, geo.center.lon);
    $("delete-btn").classList.toggle("hidden", !place);
    $("duplicate-btn").classList.toggle("hidden", !place);
    $("history-btn").classList.add("hidden");
    const createdMeta = $("place-created-meta"); createdMeta.classList.remove("hidden"); $("place-created-value").textContent = "Created: " + formatRecordTimestamp(place?.created || new Date()); if (place?.updated) createdMeta.title = "Last updated: " + formatRecordTimestamp(place.updated); else createdMeta.removeAttribute("title");
    updateEditorPresentation();
    state.editorSnapshot = editorStateSignature();

    renderShapeInfo(layer, geo);

    renderExternalLinks({
      lat: geo.center.lat,
      lon: geo.center.lon,
      name: place?.name || $("name").value || "Saved place"
    });

    showEditorPanel();
    syncPoiMarkerCoordinates(layer);
    // Refresh older verbose lookups, which may include country/postcode and English labels.
    const previousArea = String(place?.area_name || "");
    if (!state.editorAreaCustom && (!previousArea || /(?:^|,)\s*\d{4,7}(?:,|$)|Saudi Arabia|United Arab Emirates|,\s*السعودية(?:,|$)/i.test(previousArea))) {
      scheduleEditorAreaLookup(layer, geo.center.lat, geo.center.lon, {immediate: true, force: true});
    }

    setTimeout(() => {
      $("name").focus({preventScroll: true});
      normalizeAppViewport();
    }, 0);
  }

  async function reverseGeocode(lat, lon, signal = undefined) {
    try {
      const geocoder = state.config.reverseGeocoder || {};
      const url = new URL(geocoder.url || "https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", lat);
      url.searchParams.set("lon", lon);
      url.searchParams.set("zoom", "10");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("accept-language", "ar");
      const response = await networkFetch(url, {headers: {"Accept": "application/json", "Accept-Language": "ar"}, signal}, {timeoutMs: 15000, retries: 1, retryStatuses: [408, 500, 502, 503, 504], label: "Reverse geocoding"});
      if (!response.ok) return "";
      const data = await response.json();
      const address = data.address || {};
      const preferred = [
        address.neighbourhood || address.suburb || address.quarter || address.residential,
        address.city_district || address.district,
        address.city || address.town || address.village || address.municipality || address.hamlet,
        address.county || address.state_district,
        address.state || address.region || address.province
      ].filter(Boolean);
      const unique = [...new Set(preferred.map(part => String(part).trim()).filter(Boolean))];
      if (unique.length) return unique.slice(0, 4).join("، ");
      const parts = String(data.display_name || "").split(",").map(part => part.trim()).filter(Boolean);
      const postcode = String(address.postcode || "").trim();
      const country = String(address.country || "").trim();
      return parts.filter(part => part !== postcode && part !== country && !/^\d{4,7}$/.test(part)).slice(0, 4).join("، ");
    } catch {
      return "";
    }
  }

  function customFieldsEditorFormattingChanged() {
    if (!state.editorSnapshot) return false;
    try {
      const snapshot = JSON.parse(state.editorSnapshot);
      return String(snapshot.custom_fields ?? "") !== $("custom-fields").value;
    } catch {
      return false;
    }
  }

  function revisionOrdinalDay(day) {
    const value = Number(day);
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
    if (value % 10 === 1) return `${value}st`;
    if (value % 10 === 2) return `${value}nd`;
    if (value % 10 === 3) return `${value}rd`;
    return `${value}th`;
  }

  function formatRevisionDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const month = date.toLocaleString("en-US", {month: "long"});
    return `${month} ${revisionOrdinalDay(date.getDate())}, ${date.getFullYear()}`;
  }

  function formatRevisionTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString(undefined, {hour: "numeric", minute: "2-digit"});
  }

  async function createPlaceRevision() { return null; }

  async function removePlaceRevisionQuietly() {}

  async function fetchPlaceRevisions() { return []; }

  function showPlaceEditorView() {
    state.placeHistoryLookupToken += 1;
    $("place-history").classList.add("hidden");
    $("place-form").classList.remove("hidden");
    $("history-btn").classList.add("hidden");
    $("editor-title").textContent = $("record-id").value ? "Edit place" : "New place";
    state.placeHistoryPlaceId = null;
    state.placeHistoryRevisions = [];
  }

  function renderPlaceHistory(place, revisions) {
    const list = $("history-list");
    list.replaceChildren();

    const current = document.createElement("div");
    current.className = "place-history-item current";
    const currentTop = document.createElement("div");
    currentTop.className = "place-history-row";
    const currentTitle = document.createElement("strong");
    currentTitle.textContent = formatRevisionDate(place.updated);
    const currentInlineTime = document.createElement("span");
    currentInlineTime.className = "place-history-inline-time";
    currentInlineTime.textContent = formatRevisionTime(place.updated);
    currentTitle.append(" ", currentInlineTime);
    const currentStatus = document.createElement("span");
    currentStatus.className = "place-history-status";
    currentStatus.textContent = "Current";
    currentTop.append(currentTitle, currentStatus);
    current.append(currentTop);
    list.appendChild(current);

    if (!revisions.length) {
      const empty = document.createElement("div");
      empty.className = "place-history-empty";
      empty.textContent = "No previous revisions yet.";
      list.appendChild(empty);
      return;
    }

    for (const [revisionIndex, revision] of revisions.entries()) {
      const snapshot = revision.snapshot || {};
      const item = document.createElement("div");
      item.className = "place-history-item";

      const top = document.createElement("div");
      top.className = "place-history-row";
      const title = document.createElement("strong");
      title.textContent = formatRevisionDate(revision.created);
      const inlineTime = document.createElement("span");
      inlineTime.className = "place-history-inline-time";
      inlineTime.textContent = formatRevisionTime(revision.created);
      title.append(" ", inlineTime);
      if (revisionIndex === 0) {
        const lastTag = document.createElement("span");
        lastTag.className = "place-history-last";
        lastTag.textContent = "(LAST)";
        title.append(" ", lastTag);
      }
      const status = document.createElement("span");
      status.className = "place-history-status";
      status.textContent = revision.action === "restore" ? "Restore" : "Edit";
      top.append(title, status);

      const summary = document.createElement("div");
      summary.className = "place-history-summary";
      summary.textContent = [snapshot.name || "Unnamed place", snapshot.category || "Uncategorized"].join(" - ");

      const actions = document.createElement("div");
      actions.className = "place-history-actions";

      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "secondary small";
      preview.textContent = "Preview";
      preview.addEventListener("click", () => previewPlaceRevision(revision.id));

      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "secondary small";
      restore.textContent = "Restore";
      restore.addEventListener("click", () => restorePlaceRevision(revision.id));
      actions.append(preview, restore);

      const bottom = document.createElement("div");
      bottom.className = "place-history-bottom";
      bottom.append(actions);

      item.append(top, summary, bottom);
      list.appendChild(item);
    }
  }

  async function showPlaceHistory() {
    const id = $("record-id").value;
    const lookupToken = ++state.placeHistoryLookupToken;
    const place = state.places.find(item => item.id === id);
    if (!id || !place) return;

    state.placeHistoryPlaceId = id;
    $("place-form").classList.add("hidden");
    $("place-history").classList.remove("hidden");
    $("history-btn").classList.add("hidden");
    $("editor-title").textContent = "Revision history";

    const list = $("history-list");
    list.textContent = "Loading history...";
    try {
      const revisions = await fetchPlaceRevisions(id);
      if (lookupToken !== state.placeHistoryLookupToken || state.placeHistoryPlaceId !== id) return;
      state.placeHistoryRevisions = revisions;
      renderPlaceHistory(place, revisions);
    } catch (err) {
      if (lookupToken !== state.placeHistoryLookupToken || state.placeHistoryPlaceId !== id) return;
      list.textContent = `Unable to load history: ${err.message}`;
    }
  }

  async function previewPlaceRevision(revisionId) {
    const id = state.placeHistoryPlaceId || $("record-id").value;
    const place = state.places.find(item => item.id === id);
    const revision = state.placeHistoryRevisions.find(item => item.id === revisionId);
    if (!id || !place || !revision) return;

    if (hasUnsavedEditorChanges() && !window.confirm("Preview this revision? Unsaved changes will be discarded.")) return;

    const previewPayload = placeRevisionRestorePayload(revision.snapshot);
    const previewPlace = {
      ...place,
      ...previewPayload,
      id: place.id,
      created: place.created,
      updated: place.updated,
      deleted: Boolean(place.deleted),
      deleted_at: place.deleted_at || ""
    };

    disableGeometryEditing();
    const oldLayer = state.placeLayers.get(id);
    if (oldLayer) removeLayerAndCenter(oldLayer);
    const previewLayer = layerFromPlace(previewPlace);
    state.placeLayers.set(id, previewLayer);
    state.selectedId = id;
    renderList();
    updatePoiVisibility();
    await openEditor(previewPlace, previewLayer);
    showToast("Previewing revision. Save to apply it.", "success");
  }

  async function restorePlaceRevision(revisionId) {
    const id = state.placeHistoryPlaceId || $("record-id").value;
    const place = state.places.find(item => item.id === id);
    const revision = state.placeHistoryRevisions.find(item => item.id === revisionId);
    if (!id || !place || !revision) return;

    const message = hasUnsavedEditorChanges()
      ? "Restore this revision? Unsaved changes will be discarded."
      : "Restore this revision?";
    if (!window.confirm(message)) return;

    const restorePayload = placeRevisionRestorePayload(revision.snapshot);
    if (!placeRevisionPayloadChanged(place, restorePayload)) {
      disableGeometryEditing();
      const currentLayer = state.placeLayers.get(id);
      const restoredLayer = restorePersistedPlaceLayer(id, currentLayer, place);
      await openEditor(place, restoredLayer);
      showToast("That revision already matches the current version.");
      return;
    }

    let archive = null;
    try {
      archive = await createPlaceRevision(place, "restore");
      const saved = await api(`/collections/places/records/${id}`, {
        method: "PATCH",
        body: JSON.stringify(restorePayload)
      });

      disableGeometryEditing();
      const oldLayer = state.placeLayers.get(id);
      if (oldLayer) removeLayerAndCenter(oldLayer);
      const restoredLayer = layerFromPlace(saved);
      state.placeLayers.set(id, restoredLayer);
      Object.assign(place, saved);
      state.selectedId = id;
      populateCategories();
      populateEditorSuggestions();
      renderList();
      updatePoiVisibility();
      refreshCircleMeasurementWorldCopies();
      refreshPolygonMeasurementWorldCopies();
      refreshDistanceMeasurementWorldCopies();
      await openEditor(place, restoredLayer);
      showToast("Revision restored.", "success");
    } catch (err) {
      if (archive) await removePlaceRevisionQuietly(archive);
      showToast(`Unable to restore revision: ${err.message}`);
    }
  }

  async function saveForm(event) {
    event.preventDefault();
    if (state.shapeConversion) {
      showToast("Finish or cancel shape conversion first.");
      return;
    }

    if (addingAttachments) { showToast("Finish adding attachments before saving."); return; }
    const id = $("record-id").value;
    const layer = id ? state.placeLayers.get(id) : state.pendingLayer;
    if (!layer) return;

    let customFields;
    try {
      customFields = JSON.parse($("custom-fields").value || "{}");
    } catch {
      showToast("Custom fields must be valid JSON.");
      return;
    }

    for (const source of editorSources()) {
      try { if (!["http:", "https:"].includes(new URL(source).protocol)) throw new Error(); }
      catch { showToast("Each source must be a valid http:// or https:// URL."); return; }
    }
    const colorOverride = validPoiColor($("place-color").value);

    const geo = serializeLayer(layer);
    const payload = {
      name: $("name").value.trim(),
      category: editorCategoryValue().trim(),
      tags: $("tags").value.split(",").map(s => s.trim()).filter(Boolean),
      notes: $("notes").value,
      sources: editorSources(),
      attachments: editorAttachments.map(({id, name, type, size}) => ({id, name, type, size})),
      custom_fields: customFields,
      geometry: geo.geometry,
      shape_type: geo.shape_type,
      radius_m: geo.radius_m,
      display_center: serializedDisplayCenter(layer),
      area_name: $("area-name").value.trim(),
      area_custom: state.editorAreaCustom,
      center: {lon: geo.center.lon, lat: geo.center.lat},
      favorite: $("favorite").checked,
      icon: $("icon").value.trim(),
      color: colorOverride
    };

    const previousAttachments = id ? (state.places.find(p => p.id === id)?.attachments || []).map(item => ({...item})) : [];
    try {
      let saved;
      if (id) {
        const old = state.places.find(p => p.id === id);
        if (!old) throw new Error("Unable to find the saved place for revision history.");
        if (!placeRevisionPayloadChanged(old, payload) && !customFieldsEditorFormattingChanged()) {
          disableGeometryEditing();
          restorePersistedPlaceLayer(id, layer, old);
          populateCategories();
          populateEditorSuggestions();
          renderList();
          hideEditorPanel();
          state.editorSnapshot = null;
          showToast("No changes to save.", "success");
          return;
        }
        saved = await api(`/collections/places/records/${id}`, {method: "PATCH", body: JSON.stringify(payload)});
        Object.assign(old, saved);
        applyLayerPresentation(layer, saved);
      } else {
        saved = await api("/collections/places/records", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        layer._poiId = saved.id;
        state.placeLayers.set(saved.id, layer);
        state.places.unshift(saved);
        await finalizePendingMeasurementConversion();
        finalizeCurrentLocationAddPoiSave(layer);
        state.pendingLayer = null;
        state.selectedId = saved.id;
        applyLayerPresentation(layer, saved);
      }

      if (saved) { restorePersistedGeometry(layer, saved); layer._poiWorldOffset = 0; }
      finishSavedResearch(previousAttachments);
      disableGeometryEditing();
      populateCategories();
    populateEditorSuggestions();
      renderList();
      hideEditorPanel();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function duplicateCurrent() {
    if (state.shapeConversion) {
      showToast("Finish or cancel shape conversion first.");
      return;
    }
    const id = $("record-id").value;
    if (!id) return;
    const sourcePlace = state.places.find(place => place.id === id);
    const layer = state.placeLayers.get(id);
    if (!sourcePlace || !layer) return;

    const baseName = $("name").value.trim() || sourcePlace.name || "Untitled";
    if (!window.confirm(`Duplicate "${baseName}"?`)) return;

    let customFields;
    try {
      customFields = JSON.parse($("custom-fields").value || "{}");
    } catch {
      showToast("Custom fields must be valid JSON.");
      return;
    }

    const geo = serializeLayer(layer);
    const payload = {
      name: `${baseName}  (duplicate)`,
      category: editorCategoryValue().trim(),
      tags: $("tags").value.split(",").map(s => s.trim()).filter(Boolean),
      notes: $("notes").value,
      sources: editorSources(),
      attachments: editorAttachments.map(({id, name, type, size}) => ({id, name, type, size})),
      custom_fields: customFields,
      geometry: geo.geometry,
      shape_type: geo.shape_type,
      radius_m: geo.radius_m,
      display_center: serializedDisplayCenter(layer),
      area_name: $("area-name").value.trim(),
      area_custom: state.editorAreaCustom,
      center: {lon: geo.center.lon, lat: geo.center.lat},
      favorite: $("favorite").checked,
      icon: $("icon").value.trim(),
      color: validPoiColor($("place-color").value)
    };

    try {
      const saved = await api("/collections/places/records", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      disableGeometryEditing();
      restorePersistedPlaceLayer(id, layer, sourcePlace);

      const duplicateLayer = layerFromPlace(saved);
      state.placeLayers.set(saved.id, duplicateLayer);
      state.places.unshift(saved);
      state.selectedId = saved.id;
      populateCategories();
    populateEditorSuggestions();
      renderList();
      await openEditor(saved, duplicateLayer);
      showToast("Place duplicated.", "success");
    } catch (err) {
      showToast(err.message);
    }
  }

  async function editPlaceFromContext(id) {
    const place = state.places.find(item => item.id === id);
    const layer = state.placeLayers.get(id);
    if (!place || !layer) return;
    if (!$("editor").classList.contains("hidden")) {
      if ($("record-id").value === id) {
        $("name").focus();
        return;
      }
      if (!closeEditorWithPrompt()) return;
    }
    state.selectedId = id;
    renderList();
    await openEditor(place, layer);
  }

  async function duplicatePlaceFromContext(id) {
    if (!id) return;
    if (!$("editor").classList.contains("hidden") && $("record-id").value === id) {
      await duplicateCurrent();
      return;
    }
    if (!$("editor").classList.contains("hidden") && !closeEditorWithPrompt()) return;

    const sourcePlace = state.places.find(item => item.id === id);
    const layer = state.placeLayers.get(id);
    if (!sourcePlace || !layer) return;
    const baseName = String(sourcePlace.name || "Untitled").trim() || "Untitled";
    if (!window.confirm(`Duplicate "${baseName}"?`)) return;

    const geo = serializeLayer(layer);
    const payload = {
      name: `${baseName}  (duplicate)`,
      category: sourcePlace.category || "",
      tags: Array.isArray(sourcePlace.tags) ? sourcePlace.tags : String(sourcePlace.tags || "").split(",").map(value => value.trim()).filter(Boolean),
      notes: sourcePlace.notes || "",
      sources: Array.isArray(sourcePlace.sources) ? [...sourcePlace.sources] : [],
      attachments: Array.isArray(sourcePlace.attachments) ? sourcePlace.attachments.map(item => ({...item})) : [],
      custom_fields: sourcePlace.custom_fields || {},
      geometry: geo.geometry,
      shape_type: geo.shape_type,
      radius_m: geo.radius_m,
      display_center: serializedDisplayCenter(layer),
      area_name: sourcePlace.area_name || "",
      area_custom: Boolean(sourcePlace.area_custom),
      center: {lon: geo.center.lon, lat: geo.center.lat},
      favorite: Boolean(sourcePlace.favorite),
      icon: sourcePlace.icon || "",
      color: validPoiColor(sourcePlace.color)
    };

    try {
      const saved = await api("/collections/places/records", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const duplicateLayer = layerFromPlace(saved);
      state.placeLayers.set(saved.id, duplicateLayer);
      state.places.unshift(saved);
      state.selectedId = saved.id;
      populateCategories();
      populateEditorSuggestions();
      renderList();
      await openEditor(saved, duplicateLayer);
      showToast("Place duplicated.", "success");
    } catch (err) {
      showToast(err.message);
    }
  }

  async function movePlaceToTrash(id) {
    if (!id) return false;
    const place = state.places.find(item => item.id === id);
    if (!place || !window.confirm(`Move "${place.name || "this place"}" to Trash?`)) return false;
    try {
      const saved = await api(`/collections/places/records/${id}`, {
        method: "PATCH",
        body: JSON.stringify({deleted: true, deleted_at: new Date().toISOString()})
      });
      if ($("record-id").value === id && !$("editor").classList.contains("hidden")) {
        disableGeometryEditing();
        hideEditorPanel();
        state.editorSnapshot = null;
      }
      const layer = state.placeLayers.get(id);
      if (layer) removeLayerAndCenter(layer);
      state.placeLayers.delete(id);
      clearWrappedPoiCopies(id);
      state.places = state.places.filter(item => item.id !== id);
      state.deletedPlaces = state.deletedPlaces.filter(item => item.id !== id);
      state.deletedPlaces.unshift(saved);
      state.deletedCount += 1;
      if (state.selectedId === id) state.selectedId = null;
      updateCenterCrosshairVisibility();
      populateCategories();
      populateEditorSuggestions();
      updateTrashButton();
      renderList();
      showToast("Moved to Trash.", "success");
      return true;
    } catch (err) {
      showToast(err.message);
      return false;
    }
  }

  async function restoreDeletedPlace(id) {
    if (state.trashPreviewPlaceId === id) clearTrashPreview();
    const place = state.deletedPlaces.find(item => item.id === id);
    if (!place) return;
    try {
      const saved = await api(`/collections/places/records/${id}`, {
        method: "PATCH",
        body: JSON.stringify({deleted: false, deleted_at: ""})
      });
      state.deletedPlaces = state.deletedPlaces.filter(item => item.id !== id);
      state.deletedCount = Math.max(0, state.deletedCount - 1);
      state.places.unshift(saved);
      if (saved.geometry) {
        const layer = layerFromPlace(saved);
        state.placeLayers.set(saved.id, layer);
      }
      populateCategories();
      populateEditorSuggestions();
      updateTrashButton();
      renderList();
      updatePoiVisibility();
      refreshCircleMeasurementWorldCopies();
      refreshPolygonMeasurementWorldCopies();
      refreshDistanceMeasurementWorldCopies();
      await selectPlace(saved.id, false);
      showToast(`Restored "${saved.name || "place"}".`, "success");
    } catch (err) {
      showToast(err.message);
    }
  }

  async function permanentlyDeletePlace(id) {
    if (state.trashPreviewPlaceId === id) clearTrashPreview();
    const place = state.deletedPlaces.find(item => item.id === id);
    if (!place) return;
    if (!window.confirm(`Permanently delete "${place.name || "this place"}"?

This cannot be undone.`)) return;
    try {
      await api(`/collections/places/records/${id}`, {method: "DELETE"});
      if (Array.isArray(place.attachments) && place.attachments.length) {
        await window.FALocalStore.deleteUnreferencedAttachments(place.attachments.map(file => file.id));
      }
      state.deletedPlaces = state.deletedPlaces.filter(item => item.id !== id);
      state.deletedCount = Math.max(0, state.deletedCount - 1);
      updateTrashButton();
      renderList();
      showToast("Place permanently deleted.", "success");
    } catch (err) {
      showToast(err.message);
    }
  }

  async function deletePlaceFromContext(id) {
    if (!id) return;
    if (!$("editor").classList.contains("hidden") && $("record-id").value === id) {
      await deleteCurrent();
      return;
    }
    await movePlaceToTrash(id);
  }

  async function deleteCurrent() {
    if (state.shapeConversion) cancelPolygonShapeConversion();
    const id = $("record-id").value;
    if (!id) return;
    await movePlaceToTrash(id);
  }

  function closeEditor() {
    if (state.shapeConversion) cancelPolygonShapeConversion();
    const id = $("record-id").value;
    const editingLayer = state.editingLayer;
    const pendingLayerBeforeClose = !id ? state.pendingLayer : null;
    disableGeometryEditing();
    if (id && editingLayer) {
      const place = state.places.find(p => p.id === id);
      if (place) restorePersistedPlaceLayer(id, editingLayer, place);
    }
    if (!id && state.pendingLayer) {
      if (!restorePendingMeasurementConversion()) {
        removeLayerAndCenter(state.pendingLayer);
        state.pendingLayer = null;
      }
    }
    if (pendingLayerBeforeClose) restoreCurrentLocationAfterAddPoiCancel(pendingLayerBeforeClose);
    hideEditorPanel();
    $("shape-convert-wrap").classList.add("hidden");
    state.editorSnapshot = null;
  }

  function csvCell(value) {
    if (value === null || value === undefined) return "";
    let text = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (typeof value === "string" && /^[\t\r\n ]*[=+\-@]/.test(text)) text = String.fromCharCode(39) + text;
    return `"${text.replace(/"/g, `""`)}"`;
  }

  function exportCoordinate(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function exportPlaceCenter(place) {
    const center = place && place.center ? place.center : null;
    const lat = exportCoordinate(center && center.lat);
    const lon = exportCoordinate(center && (center.lon ?? center.lng));
    if (lat !== null && lon !== null) return {lat, lon};
    const coordinates = place && place.geometry && place.geometry.type === "Point" ? place.geometry.coordinates : null;
    if (Array.isArray(coordinates)) {
      const geometryLon = exportCoordinate(coordinates[0]);
      const geometryLat = exportCoordinate(coordinates[1]);
      if (geometryLat !== null && geometryLon !== null) return {lat: geometryLat, lon: geometryLon};
    }
    return {lat: "", lon: ""};
  }

  function exportPlaceDisplayCenter(place) {
    const fallback = exportPlaceCenter(place);
    const displayCenter = place && place.display_center ? place.display_center : null;
    const lat = exportCoordinate(displayCenter && displayCenter.lat);
    const lon = exportCoordinate(displayCenter && (displayCenter.lon ?? displayCenter.lng));
    return {
      lat: lat !== null ? lat : fallback.lat,
      lon: lon !== null ? lon : fallback.lon
    };
  }

  function exportPlacesCsv() {
    try {
      const columns = [
        ["id", place => place.id],
        ["name", place => place.name],
        ["category", place => place.category],
        ["tags", place => Array.isArray(place.tags) ? place.tags.join(", ") : (place.tags || "")],
        ["shape_type", place => place.shape_type],
        ["center_latitude", place => exportPlaceCenter(place).lat],
        ["center_longitude", place => exportPlaceCenter(place).lon],
        ["icon_latitude", place => exportPlaceDisplayCenter(place).lat],
        ["icon_longitude", place => exportPlaceDisplayCenter(place).lon],
        ["radius_m", place => place.radius_m],
        ["area_name", place => place.area_name],
        ["favorite", place => Boolean(place.favorite)],
        ["icon", place => place.icon],
        ["color", place => place.color],
        ["notes", place => place.notes],
        ["sources", place => Array.isArray(place.sources) ? place.sources.join(" | ") : ""],
        ["attachments", place => Array.isArray(place.attachments) ? place.attachments.map(item => item.name).join(" | ") : ""],
        ["custom_fields", place => place.custom_fields || {}],
        ["geometry", place => place.geometry || null],
        ["created", place => place.created],
        ["updated", place => place.updated]
      ];
      const rows = [columns.map(([name]) => csvCell(name)).join(",")];
      for (const place of state.places) {
        rows.push(columns.map(([, getValue]) => csvCell(getValue(place))).join(","));
      }

      const csv = String.fromCharCode(0xfeff) + rows.join(String.fromCharCode(13, 10));
      const blob = new Blob([csv], {type: "application/octet-stream"});
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const filename = `project-tracker-places-${stamp}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
      }, 1000);
      showToast(`Exported ${state.places.length} places as CSV.`, "success");
    } catch (error) {
      void 0;
      showToast(`CSV export failed: ${error && error.message ? error.message : "unknown error"}`, "error");
    }
  }

    return {syncHidePoisMapControl,applyPoiAppearance,updatePoiVisibility,loadPlaces,fadeTrashPreview,bindSnapGrabMarker,clearPoiSnapCoveredMarker,enablePolygonDrawSelfSnapping,showCircleArea,hideCircleArea,finishPolygonShapeConversion,markerIcon,bindLayerClicks,openEditor,clearSidebarPlaceHighlightIfOffCenter,isLayerCentered,poiLayerVisualElements,reverseGeocode,serializeLayer,setTrashMode,saveForm,showPlaceHistory,showPlaceEditorView,duplicateCurrent,deleteCurrent,closeEditorWithPrompt,syncShapeConvertOffsetForDragMenu,setPolygonDragMode,resetPolygonDisplayCenter,convertEditingShape,layerCenter,editPlaceFromContext,duplicatePlaceFromContext,deletePlaceFromContext,addPoiAtLatLng,showEditorPanel,undoEditorGeometry,redoEditorGeometry,cancelPolygonShapeConversion,exportPlacesCsv,populateCategorySuggestions,handleEditorAutocompleteKeydown,hideEditorAutocomplete,populateTagSuggestions,updateEditorPresentation,renderList,refreshPoiHoverPreviews,renderShapeInfo,syncFavoritesToggle,toggleSidebarPoiVisibility,pointInsideEditingPoiShape,editingPoiAreaTooltipElement,setPoiSnapCoveredMarker,schedulePoiSnapCoveredMarkers,shiftedLatLngTreeLongitude,placeColor,editorMarkerMeta,removeLayerAndCenter,applyLayerPresentation,circleAreaMeters,circleCircumferenceMeters,polygonAreaMeters,polygonPerimeterMeters,formatPolygonArea,polygonAverageCenterLatLng,showPolygonArea,hidePolygonArea,disableShapeEdgeRotation,enableShapeEdgeRotation,disablePolygonEdgeVertexInsert,enablePolygonEdgeVertexInsert,disablePolygonSelfSnapping,enablePolygonSelfSnapping,cloneLatLngTree};
  }
  window.FAPlaces = Object.freeze({createPlaces});
})();
