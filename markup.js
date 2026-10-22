(() => {
  "use strict";
  function createMarkup({state, $, validPoiColor, escapeMarkerText, allMeasurementLayers}) {
  function measurementInitialBearing(from, to) {
    if (!from || !to) return null;
    const lat1 = Number(from.lat) * Math.PI / 180;
    const lat2 = Number(to.lat) * Math.PI / 180;
    const deltaLon = (Number(to.lng) - Number(from.lng)) * Math.PI / 180;
    if (![lat1, lat2, deltaLon].every(Number.isFinite)) return null;
    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) return null;
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function measurementBearingCardinal(bearing) {
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return directions[Math.round(bearing / 22.5) % directions.length];
  }

  function formatMeasurementBearing(from, to) {
    const bearing = measurementInitialBearing(from, to);
    if (!Number.isFinite(bearing)) return "";
    return `${bearing.toFixed(1)}${String.fromCharCode(176)} ${measurementBearingCardinal(bearing)}`;
  }

  function geodesicInterpolateLatLng(from, to, fraction) {
    const lat1 = Number(from.lat) * Math.PI / 180;
    const lon1 = Number(from.lng) * Math.PI / 180;
    const lat2 = Number(to.lat) * Math.PI / 180;
    const lon2 = Number(to.lng) * Math.PI / 180;
    if (![lat1, lon1, lat2, lon2, fraction].every(Number.isFinite)) return L.latLng(from);
    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    const sinLat2 = Math.sin(lat2);
    const cosLat2 = Math.cos(lat2);
    const deltaLon = lon2 - lon1;
    const cosDelta = Math.max(-1, Math.min(1, sinLat1 * sinLat2 + cosLat1 * cosLat2 * Math.cos(deltaLon)));
    const delta = Math.acos(cosDelta);
    if (delta < 1e-12) return L.latLng(from);
    const sinDelta = Math.sin(delta);
    if (Math.abs(sinDelta) < 1e-12) {
      return L.latLng(
        Number(from.lat) + (Number(to.lat) - Number(from.lat)) * fraction,
        Number(from.lng) + (Number(to.lng) - Number(from.lng)) * fraction
      );
    }
    const a = Math.sin((1 - fraction) * delta) / sinDelta;
    const b = Math.sin(fraction * delta) / sinDelta;
    const x = a * cosLat1 * Math.cos(lon1) + b * cosLat2 * Math.cos(lon2);
    const y = a * cosLat1 * Math.sin(lon1) + b * cosLat2 * Math.sin(lon2);
    const z = a * sinLat1 + b * sinLat2;
    const lat = Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI;
    const lng = Math.atan2(y, x) * 180 / Math.PI;
    return L.latLng(lat, lng);
  }

  function firstLatLngInTree(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = firstLatLngInTree(item);
        if (found) return found;
      }
      return null;
    }
    if (!value || !Number.isFinite(Number(value.lat)) || !Number.isFinite(Number(value.lng))) return null;
    return L.latLng(Number(value.lat), Number(value.lng), value.alt);
  }

  function globeUnitVector(latlng) {
    const lat = Number(latlng.lat) * Math.PI / 180;
    const lng = Number(latlng.lng) * Math.PI / 180;
    const cosLat = Math.cos(lat);
    return [cosLat * Math.cos(lng), cosLat * Math.sin(lng), Math.sin(lat)];
  }

  function globeVectorCross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function globeVectorDot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function rigidMoveLatLngOnGlobe(point, fromAnchor, toAnchor) {
    if (!point || !fromAnchor || !toAnchor) return point ? L.latLng(point) : point;
    const from = globeUnitVector(fromAnchor);
    const to = globeUnitVector(toAnchor);
    const source = globeUnitVector(point);
    let axis = globeVectorCross(from, to);
    let axisLength = Math.hypot(axis[0], axis[1], axis[2]);
    let cosAngle = Math.max(-1, Math.min(1, globeVectorDot(from, to)));
    let sinAngle = axisLength;
    if (axisLength < 1e-12) {
      if (cosAngle > 0) return L.latLng(Number(point.lat), Number(point.lng), point.alt);
      const basis = Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      axis = globeVectorCross(from, basis);
      axisLength = Math.hypot(axis[0], axis[1], axis[2]) || 1;
      sinAngle = 0;
      cosAngle = -1;
    }
    axis = axis.map(value => value / axisLength);
    const cross = globeVectorCross(axis, source);
    const axisDot = globeVectorDot(axis, source);
    const rotated = [0, 1, 2].map(index =>
      source[index] * cosAngle +
      cross[index] * sinAngle +
      axis[index] * axisDot * (1 - cosAngle)
    );
    const length = Math.hypot(rotated[0], rotated[1], rotated[2]) || 1;
    const x = rotated[0] / length;
    const y = rotated[1] / length;
    const z = Math.max(-1, Math.min(1, rotated[2] / length));
    const lat = Math.asin(z) * 180 / Math.PI;
    const lng = Math.atan2(y, x) * 180 / Math.PI;
    return L.latLng(lat, lng, point.alt);
  }

  function rigidMoveLatLngTreeOnGlobe(value, fromAnchor, toAnchor) {
    if (Array.isArray(value)) return value.map(item => rigidMoveLatLngTreeOnGlobe(item, fromAnchor, toAnchor));
    return rigidMoveLatLngOnGlobe(value, fromAnchor, toAnchor);
  }

  function distanceMeasurementGeodesicLatLngs(points, maxSteps = 2048) {

    const controls = (points || []).flat(Infinity).filter(point =>
      point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))
    );
    if (!controls.length) return [];

    const normalizeLongitude = longitude => {
      const value = Number(longitude);
      if (!Number.isFinite(value)) return 0;
      return ((value + 180) % 360 + 360) % 360 - 180;
    };

    if (controls.length < 2) {
      return [[L.latLng(Number(controls[0].lat), normalizeLongitude(controls[0].lng))]];
    }

    const samples = [];
    for (let index = 0; index < controls.length - 1; index += 1) {
      const from = L.latLng(controls[index]);
      const to = L.latLng(controls[index + 1]);
      const meters = state.map ? state.map.distance(from, to) : 0;
      const stepCap = Math.max(1, Math.min(2048, Number(maxSteps) || 2048));
      const steps = Math.max(1, Math.min(stepCap, Math.ceil((Number.isFinite(meters) ? meters : 0) / 25000)));
      for (let step = 0; step <= steps; step += 1) {
        if (index > 0 && step === 0) continue;
        const point = geodesicInterpolateLatLng(from, to, step / steps);
        samples.push(L.latLng(point.lat, normalizeLongitude(point.lng)));
      }
    }

    if (samples.length < 2) return samples.length ? [samples] : [];

    const parts = [];
    let currentPart = [samples[0]];

    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      const rawDelta = current.lng - previous.lng;

      if (Math.abs(rawDelta) <= 180) {
        currentPart.push(current);
        continue;
      }

      const unwrappedCurrentLng = rawDelta > 180 ? current.lng - 360 : current.lng + 360;
      const boundaryLng = unwrappedCurrentLng > previous.lng ? 180 : -180;
      const denominator = unwrappedCurrentLng - previous.lng;
      const fraction = Math.abs(denominator) > 1e-12
        ? Math.max(0, Math.min(1, (boundaryLng - previous.lng) / denominator))
        : 0.5;
      const boundaryLat = previous.lat + (current.lat - previous.lat) * fraction;

      currentPart.push(L.latLng(boundaryLat, boundaryLng));
      if (currentPart.length >= 2) parts.push(currentPart);

      currentPart = [
        L.latLng(boundaryLat, boundaryLng === 180 ? -180 : 180),
        current
      ];
    }

    if (currentPart.length >= 2) parts.push(currentPart);
    return parts;
  }

  function formatMeasuredDistance(meters) {
    if (!Number.isFinite(meters)) return "";
    const pretty = value => Number(value.toFixed(2)).toLocaleString();
    if (state.measurementSystem === "imperial") {
      return Math.abs(meters) >= 1609.344 ? `${pretty(meters / 1609.344)} mi` : `${Math.round(meters / 0.3048).toLocaleString()} ft`;
    }
    if (state.measurementSystem === "nautical") {
      return Math.abs(meters) >= 1852 ? `${pretty(meters / 1852)} nmi` : `${Math.round(meters).toLocaleString()} m`;
    }
    return Math.abs(meters) >= 1000 ? `${pretty(meters / 1000)} km` : `${Math.round(meters).toLocaleString()} m`;
  }

  function formatMeasuredElevation(meters) {
    if (!Number.isFinite(meters)) return "Unavailable";
    const factor = state.measurementSystem === "imperial" ? 1 / 0.3048 : 1;
    const units = factor === 1 ? "m" : "ft";
    return `${Math.round(meters * factor).toLocaleString()} ${units}`;
  }


  function availableMarkupColors() {
    const options = Array.from($("poi-color")?.options || []);
    const colors = options.filter(option => !option.hasAttribute("data-exclude-markup-cycle")).map(option => validPoiColor(option.value)).filter(Boolean);
    return [...new Set(colors)];
  }

  function refillMarkupColorQueue() {
    const colors = availableMarkupColors();
    for (let i = colors.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    if (colors.length > 1 && state.markupLastColor && colors[0] === state.markupLastColor) {
      const swapIndex = 1 + Math.floor(Math.random() * (colors.length - 1));
      [colors[0], colors[swapIndex]] = [colors[swapIndex], colors[0]];
    }
    state.markupColorQueue = colors;
  }

  function nextMarkupColor() {
    if (!state.varyMarkupColors) return state.poiColor;
    if (!state.markupColorQueue.length) refillMarkupColorQueue();
    const color = validPoiColor(state.markupColorQueue.shift()) || state.poiColor;
    state.markupLastColor = color;
    return color;
  }

  function markerMarkupLabel(index) {
    let value = Math.max(0, Math.floor(Number(index) || 0)) + 1;
    let label = "";
    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }
    return label || "A";
  }

  function markerMarkupLabelIndex(label) {
    const value = String(label || "").trim().toUpperCase();
    if (!/^[A-Z]+$/.test(value)) return -1;
    let index = 0;
    for (const character of value) index = index * 26 + character.charCodeAt(0) - 64;
    return index - 1;
  }

  function nextMarkerMarkupLabel() {
    return markerMarkupLabel(state.markupMarkerNextIndex);
  }

  function consumeMarkerMarkupLabel() {
    const label = nextMarkerMarkupLabel();
    state.markupMarkerNextIndex += 1;
    return label;
  }

  function markupMarkerIcon(label, color) {
    const markerColor = validPoiColor(color) || state.poiColor;
    return L.divIcon({
      className: "markup-marker-icon",
      html: `<div class="poi-marker markup-marker" style="--marker-color:${markerColor}"><span class="markup-marker-label">${escapeMarkerText(label || "A")}</span></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }

  function markerMarkupLayersInSequence() {
    return allMeasurementLayers()
      .filter(layer => layer?._measurementMode === "marker" && layer instanceof L.Marker)
      .map((layer, index) => ({layer, index, labelIndex: markerMarkupLabelIndex(layer._measurementLabel)}))
      .sort((a, b) => {
        if (a.labelIndex >= 0 && b.labelIndex >= 0 && a.labelIndex !== b.labelIndex) return a.labelIndex - b.labelIndex;
        if (a.labelIndex >= 0 && b.labelIndex < 0) return -1;
        if (a.labelIndex < 0 && b.labelIndex >= 0) return 1;
        return a.index - b.index;
      })
      .map(item => item.layer);
  }

    return {formatMeasurementBearing, geodesicInterpolateLatLng, firstLatLngInTree, rigidMoveLatLngOnGlobe, rigidMoveLatLngTreeOnGlobe, distanceMeasurementGeodesicLatLngs, formatMeasuredDistance, formatMeasuredElevation, nextMarkupColor, markerMarkupLabel, markerMarkupLabelIndex, nextMarkerMarkupLabel, consumeMarkerMarkupLabel, markupMarkerIcon, markerMarkupLayersInSequence};
  }
  function createMarkupController({state, $, api, saveSettingsNow, validPoiColor, distanceMeasurementGeodesicLatLngs, firstLatLngInTree, markerMarkupLayersInSequence, markerMarkupLabel, markupMarkerIcon, markerMarkupLabelIndex, nextMarkerMarkupLabel, geodesicInterpolateLatLng, rigidMoveLatLngOnGlobe, rigidMoveLatLngTreeOnGlobe, formatMeasurementBearing, formatMeasuredDistance, consumeMarkerMarkupLabel, nextMarkupColor, formatCoordinates, installLayerDragAutoPan, setPoiSnapCoveredMarker, shiftedLatLngTreeLongitude, showToast, closeEditorWithPrompt, hideMapContextMenu, positionContextMenu, hideImageryInfoTooltip, hideContextClickMarker, placeColor, markerIcon, editorMarkerMeta, removeLayerAndCenter, applyLayerPresentation, bindLayerClicks, circleAreaMeters, circleCircumferenceMeters, hideCircleArea, polygonAreaMeters, polygonPerimeterMeters, formatPolygonArea, polygonAverageCenterLatLng, disableShapeEdgeRotation, enableShapeEdgeRotation, disablePolygonEdgeVertexInsert, enablePolygonEdgeVertexInsert, disablePolygonSelfSnapping, enablePolygonSelfSnapping, cloneLatLngTree, openEditor, editingPoiAreaTooltipElement, pointInsideEditingPoiShape, showPolygonArea, hidePolygonArea, showCircleArea, refreshPoiHoverPreviews}) {
  function updateMeasurementTooltipPointerFade(event) {
    const x = Number(event.clientX);
    const y = Number(event.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const editorOpen = !$("editor").classList.contains("hidden");
    const editingShape = editorOpen ? (state.editingLayer || state.pendingLayer) : null;
    const editingTooltip = editingPoiAreaTooltipElement(editingShape);
    let pointerInsideEditingShape = false;
    if (editingTooltip && state.map && (editingShape instanceof L.Circle || editingShape instanceof L.Polygon)) {
      pointerInsideEditingShape = pointInsideEditingPoiShape(state.map.mouseEventToLatLng(event), editingShape);
    }

    for (const tooltip of document.querySelectorAll(".leaflet-tooltip.measurement-tooltip")) {
      const rect = tooltip.getBoundingClientRect();
      const overTooltip = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      const overEditingShape = tooltip === editingTooltip && pointerInsideEditingShape;
      tooltip.classList.toggle("measurement-tooltip-pointer-fade", overTooltip || overEditingShape);
    }
  }

  function clearMeasurementTooltipPointerFade() {
    for (const tooltip of document.querySelectorAll(".leaflet-tooltip.measurement-tooltip-pointer-fade")) {
      tooltip.classList.remove("measurement-tooltip-pointer-fade");
    }
  }

  function refreshMeasurementLabels() {
    const layer = state.editingLayer;
    if (layer instanceof L.Polygon) {
      if (state.showPolygonArea || state.showPolygonPerimeter) showPolygonArea(layer);
      else hidePolygonArea(layer);
    }
    if (layer instanceof L.Circle) showCircleArea(layer);
    if (state.measureWorkingLayer instanceof L.Circle && state.measureMode === "circle") {
      updateMeasurementTooltip(state.measureWorkingLayer, "circle");
    }
    const measurementLayers = new Set(state.lockedMeasurements);
    for (const measurement of state.temporaryMeasurements) measurementLayers.add(measurement);
    if (state.measureLayer) measurementLayers.add(state.measureLayer);
    for (const measurement of measurementLayers) {
      updateMeasurementTooltip(measurement, measurement._measurementMode);
    }
    refreshPoiHoverPreviews();
  }

  function applyMeasurementFillOpacity() {
    const seen = new Set();
    const apply = layer => {
      if (!layer || seen.has(layer)) return;
      seen.add(layer);
      if (!(layer instanceof L.Circle || layer instanceof L.Polygon)) return;
      layer.setStyle({fillOpacity: state.fillOpacity});
      for (const copy of layer._measurementWrappedCopies || []) copy.setStyle({fillOpacity: state.fillOpacity});
    };
    for (const layer of allMeasurementLayers()) apply(layer);
    apply(state.measureWorkingLayer);
    apply(state.markupShapeConversion?.previewLayer);
  }

  function updateAreaThresholdVisibility() {
    const metric = state.measurementSystem === "metric";
    $("metric-area-units-wrap").classList.toggle("hidden", !metric);
    $("area-threshold-wrap").classList.toggle("hidden", !metric || state.areaUnits !== "m2");
  }

  function normalizeMeasurementLongitude(longitude) {
    const value = Number(longitude);
    if (!Number.isFinite(value)) return 0;
    return ((value + 180) % 360 + 360) % 360 - 180;
  }

  function measurementNearestWorldOffset(longitude) {
    const value = normalizeMeasurementLongitude(longitude);
    const centerLongitude = Number(state.map?.getCenter()?.lng || 0);
    return Math.round((centerLongitude - value) / 360) * 360;
  }

  function distanceMeasurementCanonicalMarkerPoint(marker) {
    if (!marker) return null;
    const point = marker.getLatLng();
    const offset = Number.isFinite(Number(marker._measurementWorldOffset)) ? Number(marker._measurementWorldOffset) : 0;
    return L.latLng(Number(point.lat), normalizeMeasurementLongitude(Number(point.lng) - offset), point.alt);
  }

  function positionDistanceMeasurementMarkerInCurrentWorld(marker) {
    const canonical = distanceMeasurementCanonicalMarkerPoint(marker);
    if (!canonical) return;
    const offset = measurementNearestWorldOffset(canonical.lng);
    marker._measurementWorldOffset = offset;
    marker.setLatLng(L.latLng(canonical.lat, canonical.lng + offset, canonical.alt));
  }

  function distanceMeasurementWrappedGeodesicLatLngs(points, maxSteps = 2048, splitAtVertices = false) {
    const controls = (points || []).flat(Infinity).filter(point => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
    const parts = splitAtVertices && controls.length > 1
      ? controls.slice(1).flatMap((to, index) => distanceMeasurementGeodesicLatLngs([controls[index], to], maxSteps))
      : distanceMeasurementGeodesicLatLngs(points, maxSteps);
    if (!state.map || !parts.length) return parts;
    const worldIndex = Math.round(Number(state.map.getCenter()?.lng || 0) / 360);
    const offsets = [worldIndex - 1, worldIndex, worldIndex + 1].map(index => index * 360);
    const wrapped = [];
    for (const offset of offsets) {
      for (const part of parts) {
        wrapped.push(part.map(point => L.latLng(point.lat, point.lng + offset, point.alt)));
      }
    }
    return wrapped;
  }

  function refreshDistanceMeasurementWorldCopies() {
    if (!state.map) return;
    for (const layer of allMeasurementLayers()) {
      if (layer?._measurementMode !== "distance") continue;
      syncDistanceMeasurementVisual(layer, true);
      if (layer._measurementEditing) {
        for (const marker of layer._measurementMarkers || []) {
          if (!marker._measurementDragging) positionDistanceMeasurementMarkerInCurrentWorld(marker);
        }
      }
      updateMeasurementTooltip(layer, "distance");
    }
  }

  function circleMeasurementCanonicalCenter(layer) {
    if (!(layer instanceof L.Circle)) return null;
    const center = layer.getLatLng();
    const offset = Number.isFinite(Number(layer._measurementWorldOffset)) ? Number(layer._measurementWorldOffset) : 0;
    return L.latLng(Number(center.lat), normalizeMeasurementLongitude(Number(center.lng) - offset), center.alt);
  }

  function clearCircleMeasurementWorldCopies(layer) {
    if (!layer?._measurementWrappedCopies) return;
    for (const copy of layer._measurementWrappedCopies) {
      if (state.map?.hasLayer(copy)) state.map.removeLayer(copy);
    }
    layer._measurementWrappedCopies = [];
  }

  let circleMeasurementWorldRefreshFrame = null;

  function syncCircleMeasurementWorldCopies(layer, recenterOriginal = true) {
    if (!(layer instanceof L.Circle) || layer._measurementMode !== "circle" || !state.map) return;
    const canonical = circleMeasurementCanonicalCenter(layer);
    if (!canonical) return;
    const currentCenter = layer.getLatLng();
    const activeOffset = recenterOriginal
      ? measurementNearestWorldOffset(canonical.lng)
      : Math.round((Number(currentCenter.lng) - canonical.lng) / 360) * 360;
    layer._measurementWorldOffset = activeOffset;
    if (recenterOriginal) {
      layer.setLatLng(L.latLng(canonical.lat, canonical.lng + activeOffset, canonical.alt));
    }
    const worldIndex = Math.round(Number(state.map.getCenter()?.lng || 0) / 360);
    const copyOffsets = [worldIndex - 1, worldIndex, worldIndex + 1]
      .map(index => index * 360)
      .filter(worldOffset => worldOffset !== activeOffset);
    const color = layer.options?.color || state.poiColor;
    const weight = Number(layer.options?.weight) || 2;
    const fillOpacity = Number.isFinite(Number(layer.options?.fillOpacity)) ? Number(layer.options?.fillOpacity) : state.fillOpacity;
    const dashArray = layer._measurementEditing ? "5,5" : null;
    const radius = layer.getRadius();
    const existing = new Map((layer._measurementWrappedCopies || []).map(copy => [copy._measurementWorldOffset, copy]));
    const copies = [];
    for (const worldOffset of copyOffsets) {
      let copy = existing.get(worldOffset);
      if (!copy) {
        copy = L.circle([canonical.lat, canonical.lng + worldOffset], {
          radius,
          color,
          fillColor: color,
          weight,
          fillOpacity,
          dashArray,
          interactive: false,
          bubblingMouseEvents: false,
          snapIgnore: true,
          pmIgnore: true,
          pane: layer.options?.pane || "overlayPane"
        }).addTo(state.map);
      } else {
        existing.delete(worldOffset);
        copy.setLatLng(L.latLng(canonical.lat, canonical.lng + worldOffset, canonical.alt));
        copy.setRadius(radius);
        copy.setStyle({color, fillColor: color, weight, fillOpacity, dashArray});
        if (!state.map.hasLayer(copy)) copy.addTo(state.map);
      }
      copy._measurementWorldOffset = worldOffset;
      copies.push(copy);
    }
    for (const copy of existing.values()) {
      if (state.map.hasLayer(copy)) state.map.removeLayer(copy);
    }
    layer._measurementWrappedCopies = copies;
  }

  function refreshCircleMeasurementWorldCopies(recenterOriginal = true) {
    if (!state.map) return;
    for (const layer of allMeasurementLayers()) {
      if (layer?._measurementMode !== "circle" || !(layer instanceof L.Circle)) continue;
      syncCircleMeasurementWorldCopies(layer, recenterOriginal);
      updateMeasurementTooltip(layer, "circle");
    }
  }

  function scheduleCircleMeasurementWorldRefresh() {
    if (circleMeasurementWorldRefreshFrame !== null) return;
    circleMeasurementWorldRefreshFrame = requestAnimationFrame(() => {
      circleMeasurementWorldRefreshFrame = null;
      refreshCircleMeasurementWorldCopies(false);
    });
  }

  function unwrapMeasurementRingLongitudes(ring, referenceLng = null) {
    if (!Array.isArray(ring)) return ring;
    let previous = Number.isFinite(Number(referenceLng)) ? Number(referenceLng) : null;
    return ring.map(item => {
      const point = L.latLng(item);
      let lng = Number(point.lng);
      if (previous === null) {
        lng = normalizeMeasurementLongitude(lng);
      } else {
        while (lng - previous > 180) lng -= 360;
        while (lng - previous < -180) lng += 360;
      }
      previous = lng;
      return L.latLng(Number(point.lat), lng, point.alt);
    });
  }

  function unwrapMeasurementPolygonLatLngTree(value, referenceLng = null) {
    if (!Array.isArray(value)) return value;
    if (value.length && value.every(item => item && !Array.isArray(item) && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)))) {
      return unwrapMeasurementRingLongitudes(value, referenceLng);
    }
    let childReference = Number.isFinite(Number(referenceLng)) ? Number(referenceLng) : null;
    return value.map((item, index) => {
      const unwrapped = unwrapMeasurementPolygonLatLngTree(item, childReference);
      const first = firstLatLngInTree(unwrapped);
      if (index === 0 && first) childReference = first.lng;
      return unwrapped;
    });
  }

  function polygonMeasurementCanonicalLatLngs(layer) {
    if (!(layer instanceof L.Polygon)) return [];
    return unwrapMeasurementPolygonLatLngTree(cloneLatLngTree(layer.getLatLngs()));
  }

  function polygonMeasurementReferenceLatLng(latlngs) {
    const points = (latlngs || []).flat(Infinity).filter(point => point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)));
    if (!points.length) return null;
    return polygonAverageCenterLatLng(points, L.latLng(points[0]));
  }

  function polygonMeasurementCurrentWorldOffset(layer, canonicalLatLngs) {
    const currentFirst = firstLatLngInTree(layer?.getLatLngs?.());
    const canonicalFirst = firstLatLngInTree(canonicalLatLngs);
    if (!currentFirst || !canonicalFirst) return 0;
    return Math.round((Number(currentFirst.lng) - Number(canonicalFirst.lng)) / 360) * 360;
  }

  function polygonMeasurementNearestWorldOffset(referenceLng) {
    const centerLongitude = Number(state.map?.getCenter()?.lng || 0);
    return Math.round((centerLongitude - Number(referenceLng || 0)) / 360) * 360;
  }

  function normalizeMeasurementGeoJsonCoordinates(value) {
    if (!Array.isArray(value)) return value;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      return [normalizeMeasurementLongitude(Number(value[0])), Number(value[1]), ...value.slice(2)];
    }
    return value.map(item => normalizeMeasurementGeoJsonCoordinates(item));
  }

  function clearPolygonMeasurementWorldCopies(layer) {
    if (!layer?._measurementWrappedCopies) return;
    for (const copy of layer._measurementWrappedCopies) {
      if (state.map?.hasLayer(copy)) state.map.removeLayer(copy);
    }
    layer._measurementWrappedCopies = [];
  }

  let polygonMeasurementWorldRefreshFrame = null;

  function syncPolygonMeasurementWorldCopies(layer, recenterOriginal = true) {
    if (!(layer instanceof L.Polygon) || layer instanceof L.Circle || layer._measurementMode !== "polygon" || !state.map) return;
    const canonical = polygonMeasurementCanonicalLatLngs(layer);
    const reference = polygonMeasurementReferenceLatLng(canonical);
    if (!reference) return;
    let activeOffset = polygonMeasurementCurrentWorldOffset(layer, canonical);
    const canRepositionOriginal = !layer._measurementEditing || layer._measurementMoving;
    if (recenterOriginal && canRepositionOriginal) activeOffset = polygonMeasurementNearestWorldOffset(reference.lng);
    layer._measurementWorldOffset = activeOffset;
    if (canRepositionOriginal) {
      layer.setLatLngs(shiftedLatLngTreeLongitude(canonical, activeOffset));
      if (layer.redraw) layer.redraw();
    }

    const worldIndex = Math.round(Number(state.map.getCenter()?.lng || 0) / 360);
    const copyOffsets = [worldIndex - 1, worldIndex, worldIndex + 1]
      .map(index => index * 360)
      .filter(worldOffset => worldOffset !== activeOffset);
    const color = layer.options?.color || state.poiColor;
    const fillColor = layer.options?.fillColor || color;
    const weight = Number(layer.options?.weight) || 2;
    const opacity = Number.isFinite(Number(layer.options?.opacity)) ? Number(layer.options.opacity) : 1;
    const fillOpacity = Number.isFinite(Number(layer.options?.fillOpacity)) ? Number(layer.options.fillOpacity) : state.fillOpacity;
    const dashArray = layer.options?.dashArray || null;
    const existing = new Map((layer._measurementWrappedCopies || []).map(copy => [copy._measurementWorldOffset, copy]));
    const copies = [];
    for (const worldOffset of copyOffsets) {
      const shifted = shiftedLatLngTreeLongitude(canonical, worldOffset);
      let copy = existing.get(worldOffset);
      if (!copy) {
        copy = L.polygon(shifted, {
          color, fillColor, weight, opacity, fillOpacity, dashArray,
          interactive: false, bubblingMouseEvents: false, snapIgnore: true, pmIgnore: true,
          pane: layer.options?.pane || "overlayPane"
        }).addTo(state.map);
      } else {
        existing.delete(worldOffset);
        copy.setLatLngs(shifted);
        copy.setStyle({color, fillColor, weight, opacity, fillOpacity, dashArray});
        if (!state.map.hasLayer(copy)) copy.addTo(state.map);
      }
      copy._measurementWorldOffset = worldOffset;
      copies.push(copy);
    }
    for (const copy of existing.values()) {
      if (state.map.hasLayer(copy)) state.map.removeLayer(copy);
    }
    layer._measurementWrappedCopies = copies;
  }

  function refreshPolygonMeasurementWorldCopies(recenterOriginal = true) {
    if (!state.map) return;
    for (const layer of allMeasurementLayers()) {
      if (layer?._measurementMode !== "polygon" || !(layer instanceof L.Polygon) || layer instanceof L.Circle) continue;
      syncPolygonMeasurementWorldCopies(layer, recenterOriginal);
      updateMeasurementTooltip(layer, "polygon");
    }
  }

  function schedulePolygonMeasurementWorldRefresh() {
    if (polygonMeasurementWorldRefreshFrame !== null) return;
    polygonMeasurementWorldRefreshFrame = requestAnimationFrame(() => {
      polygonMeasurementWorldRefreshFrame = null;
      refreshPolygonMeasurementWorldCopies(false);
    });
  }

  function syncDistanceMeasurementVisual(layer, syncHit = true) {
    if (!layer || layer._measurementMode !== "distance" || !state.map) return [];
    const controls = layer.getLatLngs().flat(Infinity).filter(point => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
    const geodesic = distanceMeasurementWrappedGeodesicLatLngs(controls, 2048, true);
    const color = layer.options?.color || state.poiColor;
    const weight = Number(layer.options?.weight) || 2;
    const dashArray = layer._measurementEditing ? "5,5" : null;
    if (!layer._measurementGeodesicLayer) {
      layer._measurementGeodesicLayer = L.polyline(geodesic, {
        color, weight, opacity: 1, dashArray, fillOpacity: 0, interactive: false,
        bubblingMouseEvents: false, snapIgnore: true, pmIgnore: true,
        pane: layer.options?.pane || "overlayPane"
      }).addTo(state.map);
    } else {
      layer._measurementGeodesicLayer.setLatLngs(geodesic);
      layer._measurementGeodesicLayer.setStyle({color, weight, opacity: 1, dashArray});
      if (!state.map.hasLayer(layer._measurementGeodesicLayer)) layer._measurementGeodesicLayer.addTo(state.map);
    }
    layer.setStyle({opacity: 0});
    const controlElement = layer.getElement?.();
    if (controlElement) controlElement.style.pointerEvents = "none";
    if (syncHit && layer._measurementHitLayer) layer._measurementHitLayer.setLatLngs(distanceMeasurementWrappedGeodesicLatLngs(controls));
    return geodesic;
  }

  // Display conversion only: all saved distances and radii remain in meters.
  function measurementIsRetained(layer) {
    return Boolean(layer && (
      state.measureLayer === layer ||
      state.lockedMeasurements.has(layer) ||
      state.temporaryMeasurements.has(layer)
    ));
  }

  function allMeasurementLayers() {
    const layers = new Set(state.lockedMeasurements);
    for (const layer of state.temporaryMeasurements) layers.add(layer);
    if (state.measureLayer) layers.add(state.measureLayer);
    return [...layers];
  }

  function closedDistanceMeasurementPolygonPoints(layer) {
    if (!state.map || !layer || layer._measurementMode !== "distance" || typeof layer.getLatLngs !== "function") return null;
    const points = layer.getLatLngs().flat(Infinity).filter(point => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
    if (points.length < 4) return null;
    const first = points[0];
    const last = points[points.length - 1];
    if (state.map.distance(first, last) > 0.25) return null;
    const ring = points.slice(0, -1).map(point => L.latLng(point.lat, point.lng));
    const unique = new Set(ring.map(point => `${point.lat.toFixed(8)},${point.lng.toFixed(8)}`));
    return unique.size >= 3 ? ring : null;
  }

  function hasAnyMeasurements() {
    return allMeasurementLayers().length > 0 || state.elevationProfiles.length > 0 || Boolean(window.FAElevation?.hasProfiles?.());
  }

  function removeMeasurementTooltip(layer) {
    if (!layer || !layer._measurementTooltip) return;
    if (state.map && state.map.hasLayer(layer._measurementTooltip)) state.map.removeLayer(layer._measurementTooltip);
    layer._measurementTooltip = null;
  }

  function markerResequenceWouldChange() {
    const markers = markerMarkupLayersInSequence();
    if (!markers.length) return false;
    return markers.some((marker, index) => String(marker._measurementLabel || "").trim() !== markerMarkupLabel(index));
  }

  async function resequenceMarkerMarkups() {
    const markers = markerMarkupLayersInSequence();
    if (!markers.length) {
      showToast("No markers to resequence.");
      return;
    }
    const before = captureMeasurementState();
    let changed = false;
    try {
      for (const marker of markers) {
        if (!marker._measurementLocked) continue;
        cancelLockedMeasurementSave(marker);
        await waitForLockedMeasurementSave(marker);
      }
      markers.forEach((marker, index) => {
        const label = markerMarkupLabel(index);
        if (marker._measurementLabel !== label) changed = true;
        marker._measurementLabel = label;
        marker.setIcon(markupMarkerIcon(label, validPoiColor(marker.options?.color) || state.poiColor));
        updateMeasurementTooltip(marker, "marker");
      });
      for (const marker of markers) {
        if (marker._measurementLocked) await updateLockedMeasurementRecord(marker);
      }
      state.markupMarkerNextIndex = markers.length;
      const after = captureMeasurementState();
      if (changed) {
        pushMeasurementTransaction(before, after);
        showToast("Marker letters resequenced.", "success");
      } else {
        showToast("Marker letters are already sequenced.");
      }
    } catch (err) {
      try { await applyMeasurementStateSnapshot(before); } catch {}
      showToast(`Unable to resequence markers: ${err.message}`);
    }
  }

  async function syncLockedMarkerLabels(records) {
    const markerRecords = (Array.isArray(records) ? records : []).filter(record => record?.type === "marker");
    const used = new Set();
    for (const record of markerRecords) {
      const index = markerMarkupLabelIndex(record.label);
      if (index >= 0) used.add(index);
    }
    let candidate = 0;
    for (const record of markerRecords) {
      if (markerMarkupLabelIndex(record.label) >= 0) continue;
      while (used.has(candidate)) candidate += 1;
      const label = markerMarkupLabel(candidate);
      record.label = label;
      used.add(candidate);
      try {
        await api(`/collections/measurements/records/${record.id}`, {method: "PATCH", body: JSON.stringify({label})});
      } catch (err) {
        void 0;
      }
      candidate += 1;
    }
    state.markupMarkerNextIndex = used.size ? Math.max(...used) + 1 : 0;
  }

  // Shared Geoman handle theme: same styling and the active geometry color for drawing and editing.
  function syncActiveGeometryHandleTheme() {
    const container = state.map?.getContainer?.();
    if (!container) return;
    const shapeType = layer => layer instanceof L.Circle ? "circle" : layer instanceof L.Polygon ? "polygon" : layer instanceof L.Polyline ? "line" : null;
    const draw = state.activeGeometryDraw;
    const conversion = state.markupShapeConversion || state.shapeConversion;
    const place = state.editingLayer;
    const measurement = allMeasurementLayers().find(layer => layer?._measurementEditing && shapeType(layer));
    let type = null;
    let color = null;
    if (draw?.type) {
      type = draw.type;
      color = draw.color;
    } else if (conversion) {
      type = conversion.target === "polygon" || conversion.type === "polygon" ? "polygon" : conversion.target === "circle" || conversion.type === "circle" ? "circle" : null;
      color = conversion.color || (state.shapeConversion ? placeColor(editorMarkerMeta()) : null);
    } else if (shapeType(place)) {
      type = shapeType(place);
      color = place.options?.color || placeColor(editorMarkerMeta());
    } else if (measurement) {
      type = shapeType(measurement);
      color = measurement.options?.color;
    } else if (["distance", "polygon", "circle"].includes(state.measureMode)) {
      type = state.measureMode === "distance" ? "line" : state.measureMode;
      color = state.measurePendingColor;
    }
    const resolved = validPoiColor(color) || state.poiColor;
    if (container.style.getPropertyValue("--fa-handle-color") !== resolved) container.style.setProperty("--fa-handle-color", resolved);
    container.classList.toggle("fa-handle-active", Boolean(type));
    if (type) container.dataset.faHandleType = type;
    else delete container.dataset.faHandleType;
  }
  function syncMarkupDrawInteractionMode() {
    const container = state.map?.getContainer?.();
    if (!container) return;
    const active = Boolean(state.measureMode);
    container.classList.toggle("markup-draw-active", active);
    container.classList.toggle("markup-distance-draw-active", state.measureMode === "distance");
    container.classList.toggle("markup-polygon-draw-active", state.measureMode === "polygon");
    container.classList.toggle("markup-circle-draw-active", state.measureMode === "circle");
    if (active) container.style.setProperty("--markup-draw-color", validPoiColor(state.measurePendingColor) || state.poiColor);
    else container.style.removeProperty("--markup-draw-color");
    syncActiveGeometryHandleTheme();
  }

  function syncMarkerMeasurementPreviewIcon() {
    const preview = state.measureMarkerPreview;
    if (!preview) return;
    const label = String(state.measurePendingMarkerLabel || "").trim() || nextMarkerMarkupLabel();
    const color = validPoiColor(state.measurePendingColor) || state.poiColor;
    const currentLabel = preview.getElement?.()?.querySelector?.(".markup-marker-label")?.textContent?.trim() || "";
    const hasMarkupIcon = Boolean(preview.getElement?.()?.querySelector?.(".markup-marker"));
    if (preview._measurementPreviewLabel === label && currentLabel === label && hasMarkupIcon) return;
    preview._measurementPreviewLabel = label;
    preview.setIcon(markupMarkerIcon(label, color));
  }

  function clearMarkerMeasurementPreview() {
    const preview = state.measureMarkerPreview;
    state.measureMarkerPreview = null;
    if (preview && state.map?.hasLayer(preview)) state.map.removeLayer(preview);
  }

  function measurementRecordPayload(layer) {
    if (!layer || !layer._measurementMode) throw new Error("Invalid measurement layer.");
    const type = layer._measurementMode;
    const payload = {
      type,
      tooltip_hidden: Boolean(layer._measurementTooltipHidden),
      color: validPoiColor(layer.options?.color) || state.poiColor
    };

    if (type === "marker" && layer instanceof L.Marker) {
      const point = layer.getLatLng();
      payload.center = {lon: normalizeMeasurementLongitude(point.lng), lat: point.lat};
      payload.label = String(layer._measurementLabel || "").trim();
      return payload;
    }

    if (type === "circle" && layer instanceof L.Circle) {
      const center = circleMeasurementCanonicalCenter(layer) || layer.getLatLng();
      payload.center = {lon: center.lng, lat: center.lat};
      payload.radius_m = layer.getRadius();
      return payload;
    }

    if (type === "polygon" && layer instanceof L.Polygon) {
      const canonical = polygonMeasurementCanonicalLatLngs(layer);
      const geometry = preservePolygonMeasurementVertices(L.polygon([])).setLatLngs(canonical).toGeoJSON().geometry;
      payload.geometry = {...geometry, coordinates: normalizeMeasurementGeoJsonCoordinates(geometry.coordinates)};
      return payload;
    }

    if (type === "distance" && typeof layer.toGeoJSON === "function") {
      payload.geometry = layer.toGeoJSON().geometry;
      return payload;
    }

    throw new Error(`Unsupported measurement type: ${type}`);
  }

  function normalizeElevationProfile(profile) {
    const startLat = Number(profile?.start?.lat);
    const startLng = Number(profile?.start?.lng);
    const endLat = Number(profile?.end?.lat);
    const endLng = Number(profile?.end?.lng);
    if (![startLat, startLng, endLat, endLng].every(Number.isFinite)) return null;
    return {
      id: profile?.id || null,
      recordId: profile?.recordId || null,
      start: {lat: startLat, lng: normalizeMeasurementLongitude(startLng)},
      end: {lat: endLat, lng: normalizeMeasurementLongitude(endLng)},
      locked: true,
      tooltipHidden: Boolean(profile?.tooltipHidden),
      los: profile?.los ? {observerHeight: Math.max(0, Math.min(10000, Number(profile.los.observerHeight) || 0)), targetHeight: Math.max(0, Math.min(10000, Number(profile.los.targetHeight) || 0))} : null
    };
  }

  function elevationProfileMeasurementPayload(profile) {
    const normalized = normalizeElevationProfile(profile);
    if (!normalized) throw new Error("Invalid elevation profile.");
    return {
      type: "elevation",
      geometry: {
        type: "LineString",
        coordinates: [
          [normalizeMeasurementLongitude(normalized.start.lng), normalized.start.lat],
          [normalizeMeasurementLongitude(normalized.end.lng), normalized.end.lat]
        ],
        ...(normalized.los ? {pmdLos: normalized.los} : {})
      },
      tooltip_hidden: Boolean(normalized.tooltipHidden),
      color: "#171717"
    };
  }

  function elevationProfileFromRecord(record) {
    if (!record || record.type !== "elevation" || record.geometry?.type !== "LineString") return null;
    const coordinates = Array.isArray(record.geometry.coordinates) ? record.geometry.coordinates : [];
    if (coordinates.length < 2) return null;
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (!Array.isArray(first) || !Array.isArray(last)) return null;
    return normalizeElevationProfile({
      id: `elv-profile-${record.id}`,
      recordId: record.id,
      start: {lat: Number(first[1]), lng: Number(first[0])},
      end: {lat: Number(last[1]), lng: Number(last[0])},
      locked: true,
      tooltipHidden: Boolean(record.tooltip_hidden),
      los: record.geometry.pmdLos || null
    });
  }

  function sameElevationProfileGeometry(a, b) {
    const first = normalizeElevationProfile(a);
    const second = normalizeElevationProfile(b);
    if (!first || !second) return false;
    const close = (x, y) => Math.abs(x - y) <= 1e-8;
    return close(first.start.lat, second.start.lat) && close(first.start.lng, second.start.lng) && close(first.end.lat, second.end.lat) && close(first.end.lng, second.end.lng);
  }

  async function migrateLegacyElevationProfiles(records) {
    const legacy = state.legacyElevationProfiles.map(normalizeElevationProfile).filter(Boolean);
    if (!legacy.length) return;
    const existing = records.map(elevationProfileFromRecord).filter(Boolean);
    for (const profile of legacy) {
      if (existing.some(saved => sameElevationProfileGeometry(saved, profile))) continue;
      const record = await api("/collections/measurements/records", {
        method: "POST",
        body: JSON.stringify(elevationProfileMeasurementPayload(profile))
      });
      records.push(record);
      const saved = elevationProfileFromRecord(record);
      if (saved) existing.push(saved);
    }
    state.legacyElevationProfiles = [];
    state.settingsSaveRevision += 1;
    await saveSettingsNow();
  }

  async function reconcileElevationProfileRecords(profiles) {
    const desired = (Array.isArray(profiles) ? profiles : []).map(normalizeElevationProfile).filter(Boolean);
    const currentById = new Map(state.elevationProfiles.filter(profile => profile?.id).map(profile => [profile.id, profile]));
    const next = [];
    for (const profile of desired) {
      const existing = profile.id ? currentById.get(profile.id) : null;
      if (existing?.recordId) {
        const record = await api(`/collections/measurements/records/${existing.recordId}`, {
          method: "PATCH",
          body: JSON.stringify(elevationProfileMeasurementPayload(profile))
        });
        next.push({...profile, id: profile.id, recordId: record.id});
        currentById.delete(profile.id);
      } else {
        const record = await api("/collections/measurements/records", {
          method: "POST",
          body: JSON.stringify(elevationProfileMeasurementPayload(profile))
        });
        next.push({...profile, id: profile.id || `elv-profile-${record.id}`, recordId: record.id});
      }
    }
    for (const profile of currentById.values()) {
      if (!profile?.recordId) continue;
      try {
        await api(`/collections/measurements/records/${profile.recordId}`, {method: "DELETE"});
      } catch (err) {
        if (err.status !== 404) throw err;
      }
    }
    state.elevationProfiles = next;
    return next;
  }

  function saveElevationProfilesToMeasurements(profiles) {
    const desired = (Array.isArray(profiles) ? profiles : []).map(profile => ({...profile, start: {...profile.start}, end: {...profile.end}, locked: true}));
    state.elevationProfileSaveQueue = state.elevationProfileSaveQueue
      .catch(() => {})
      .then(() => reconcileElevationProfileRecords(desired))
      .catch(err => {
        void 0;
        showToast(`Unable to save elevation profile: ${err.message}`);
      });
    return state.elevationProfileSaveQueue;
  }

  async function createLockedMeasurementRecord(layer) {
    const record = await api("/collections/measurements/records", {
      method: "POST",
      body: JSON.stringify(measurementRecordPayload(layer))
    });
    layer._measurementRecordId = record.id;
    return record;
  }

  async function updateLockedMeasurementRecord(layer, recordId = layer?._measurementRecordId) {
    if (!layer?._measurementLocked || !recordId) return null;
    const record = await api(`/collections/measurements/records/${recordId}`, {
      method: "PATCH",
      body: JSON.stringify(measurementRecordPayload(layer))
    });
    if (layer._measurementRecordId === recordId) layer._measurementRecordId = record.id;
    return record;
  }

  function clearLockedMeasurementSaveTimer(layer) {
    const timer = state.measurementSaveTimers.get(layer);
    if (timer) clearTimeout(timer);
    state.measurementSaveTimers.delete(layer);
  }

  function clearLockedMeasurementRetryTimer(layer) {
    if (!layer?._measurementSaveRetryTimer) return;
    clearTimeout(layer._measurementSaveRetryTimer);
    layer._measurementSaveRetryTimer = null;
  }

  function cancelLockedMeasurementSave(layer) {
    if (!layer) return;
    clearLockedMeasurementSaveTimer(layer);
    clearLockedMeasurementRetryTimer(layer);
    layer._measurementSaveEpoch = (Number(layer._measurementSaveEpoch) || 0) + 1;
  }

  function waitForLockedMeasurementSave(layer) {
    return (layer?._measurementSaveQueue || Promise.resolve()).catch(() => {});
  }

  function scheduleLockedMeasurementRetry(layer, delay = 2000) {
    if (!layer?._measurementLocked || !layer._measurementRecordId || layer._measurementSaveRetryTimer) return;
    if ((Number(layer._measurementSavedRevision) || 0) >= (Number(layer._measurementSaveRevision) || 0)) return;
    layer._measurementSaveRetryTimer = setTimeout(() => {
      layer._measurementSaveRetryTimer = null;
      if (!layer._measurementLocked || !layer._measurementRecordId) return;
      queueLockedMeasurementSave(layer, Number(layer._measurementSaveRevision) || 0);
    }, delay);
  }

  function queueLockedMeasurementSave(layer, revision = Number(layer?._measurementSaveRevision) || 0) {
    if (!layer?._measurementLocked || !layer._measurementRecordId) return Promise.resolve();
    const recordId = layer._measurementRecordId;
    const epoch = Number(layer._measurementSaveEpoch) || 0;
    const previous = layer._measurementSaveQueue || Promise.resolve();
    layer._measurementSaveQueue = previous
      .catch(() => {})
      .then(async () => {
        if (!layer._measurementLocked || layer._measurementRecordId !== recordId || (Number(layer._measurementSaveEpoch) || 0) !== epoch) return;
        try {
          await updateLockedMeasurementRecord(layer, recordId);
        } catch (err) {
          if (!layer._measurementLocked || layer._measurementRecordId !== recordId || (Number(layer._measurementSaveEpoch) || 0) !== epoch) return;
          void 0;
          if (!layer._measurementSaveErrorShown) {
            layer._measurementSaveErrorShown = true;
            showToast(`Unable to save locked markup: ${err.message}. Retrying automatically.`);
          }
          scheduleLockedMeasurementRetry(layer);
          return;
        }
        if (!layer._measurementLocked || layer._measurementRecordId !== recordId || (Number(layer._measurementSaveEpoch) || 0) !== epoch) return;
        layer._measurementSavedRevision = Math.max(Number(layer._measurementSavedRevision) || 0, revision);
        const recovered = Boolean(layer._measurementSaveErrorShown);
        layer._measurementSaveErrorShown = false;
        if ((Number(layer._measurementSavedRevision) || 0) >= (Number(layer._measurementSaveRevision) || 0)) {
          clearLockedMeasurementRetryTimer(layer);
          if (recovered) showToast("Locked markup saved after retry.", "success");
        } else if (!state.measurementSaveTimers.has(layer)) {
          scheduleLockedMeasurementRetry(layer, 250);
        }
      });
    return layer._measurementSaveQueue;
  }

  function scheduleLockedMeasurementSave(layer) {
    if (!layer?._measurementLocked || !layer._measurementRecordId) return;
    layer._measurementSaveRevision = (Number(layer._measurementSaveRevision) || 0) + 1;
    clearLockedMeasurementSaveTimer(layer);
    clearLockedMeasurementRetryTimer(layer);
    const revision = layer._measurementSaveRevision;
    const timer = setTimeout(() => {
      state.measurementSaveTimers.delete(layer);
      queueLockedMeasurementSave(layer, revision);
    }, 250);
    state.measurementSaveTimers.set(layer, timer);
  }

  async function deleteLockedMeasurementRecord(layer) {
    if (!layer?._measurementRecordId) return;
    cancelLockedMeasurementSave(layer);
    await waitForLockedMeasurementSave(layer);
    const id = layer._measurementRecordId;
    try {
      await api(`/collections/measurements/records/${id}`, {method: "DELETE"});
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    if (layer._measurementRecordId === id) layer._measurementRecordId = null;
  }


  function createDistanceMeasurementMarker(latlng, layer = null, editable = true) {
    const marker = L.marker(latlng, {
      icon: distanceMeasurementMarkerIcon(),
      draggable: false,
      keyboard: false,
      riseOnHover: true,
      snapIgnore: true
    }).addTo(state.map);
    marker._measurementLayer = layer;
    syncMeasurementNodeColor(marker, validPoiColor(layer?.options?.color || state.measurePendingColor) || state.poiColor);
    installLayerDragAutoPan(marker);
    const markerPoint = marker.getLatLng();
    marker._measurementWorldOffset = Number(markerPoint.lng) - normalizeMeasurementLongitude(markerPoint.lng);

    const dragStart = () => {
      const parent = marker._measurementLayer;
      marker._measurementDragging = true;
      state.measurementVertexDragActive = true;
      state.measurementDragRelease = null;
      marker._measureIgnoreClickUntil = Number.MAX_SAFE_INTEGER;
      if (parent) {
        parent._measurementVertexDragging = true;
        parent._measurementIgnoreClickUntil = Number.MAX_SAFE_INTEGER;
      }
    };

    const dragSync = () => {
      const parent = marker._measurementLayer;
      if (parent && marker._measurementDragging) {
        syncDistanceMeasurementDragVisual(parent);
      }
    };

    const dragEnd = () => {
      const parent = marker._measurementLayer;
      if (parent) syncDistanceMeasurementLayer(parent);
      const ignoreUntil = Date.now() + 500;
      state.measurementVertexDragActive = false;
      state.measurementDragRelease = {until: Date.now() + 1000, latlng: marker.getLatLng()};
      marker._measurementDragging = false;
      marker._measureIgnoreClickUntil = ignoreUntil;
      if (parent) {
        parent._measurementVertexDragging = false;
        parent._measurementIgnoreClickUntil = ignoreUntil;
        commitMeasurementHistory(parent);
      }
      if (parent?._measurementLocked) scheduleLockedMeasurementSave(parent);
    };

    marker._measurementDragStart = dragStart;
    marker._measurementDragSync = dragSync;
    marker._measurementDragEnd = dragEnd;
    marker.on("pm:dragstart", dragStart);
    marker.on("move", dragSync);
    marker.on("pm:snap", dragSync);
    marker.on("pm:unsnap", dragSync);
    marker.on("pm:dragend", dragEnd);
    marker.on("click", event => removeDistanceMeasurementPoint(marker, event));
    marker.on("contextmenu", event => {
      const parent = marker._measurementLayer;
      if (parent) showMeasurementContextMenu(event, parent);
    });
    setDistanceMeasurementMarkerEditable(marker, editable);
    return marker;
  }

  function setDistanceMeasurementMarkerEditable(marker, editable) {
    if (!marker?.pm) return;
    if (editable) {
      positionDistanceMeasurementMarkerInCurrentWorld(marker);
      if (!state.map.hasLayer(marker)) marker.addTo(state.map);
      syncMeasurementNodeColor(marker, validPoiColor(marker._measurementLayer?.options?.color || marker._measurementNodeColor || state.measurePendingColor) || state.poiColor);
      marker.pm.enable({
        draggable: true,
        snappable: true,
        snapDistance: 20,
        snapSegment: true,
        preventMarkerRemoval: true
      });
    } else {
      const canonical = distanceMeasurementCanonicalMarkerPoint(marker);
      if (canonical) marker.setLatLng(canonical);
      marker._measurementWorldOffset = 0;
      if (marker.pm.enabled()) marker.pm.disable();
      if (state.map.hasLayer(marker)) state.map.removeLayer(marker);
    }
  }

  function refreshConvertedDistanceSnapping(layer) {
    if (!layer || layer._measurementMode !== "distance" || !layer._measurementEditing) return;
    const markers = Array.isArray(layer._measurementMarkers) ? layer._measurementMarkers : [];
    for (const marker of markers) {
      setDistanceMeasurementMarkerEditable(marker, false);
      setDistanceMeasurementMarkerEditable(marker, true);
    }
    const hit = ensureDistanceHitLayer(layer);
    hit?.bringToFront?.();
    attachMeasurementInteractions(layer);
  }

  function ensureDistanceHitLayer(layer) {
    if (!layer || layer._measurementMode !== "distance") return null;
    const points = distanceMeasurementWrappedGeodesicLatLngs(layer.getLatLngs());
    let hit = layer._measurementHitLayer;
    if (!hit) {
      hit = L.polyline(points, {
        color: layer.options?.color || state.poiColor,
        weight: 14,
        opacity: 0,
        fillOpacity: 0,
        interactive: true,
        bubblingMouseEvents: false,
        snapIgnore: false,
      }).addTo(state.map);
      layer._measurementHitLayer = hit;
    } else {
      hit.setLatLngs(points);
      if (!state.map.hasLayer(hit)) hit.addTo(state.map);
    }
    if (layer._measurementClearHandler) {
      hit.off("click", layer._measurementClearHandler);
      hit.on("click", layer._measurementClearHandler);
    }
    if (layer._measurementContextHandler) {
      hit.off("contextmenu", layer._measurementContextHandler);
      hit.on("contextmenu", layer._measurementContextHandler);
    }
    return hit;
  }

  function detachMeasurementInteractions(layer) {
    if (!layer) return;
    if (layer._measurementClearHandler) {
      layer.off("click", layer._measurementClearHandler);
      delete layer._measurementClearHandler;
    }
    if (layer._measurementContextHandler) {
      layer.off("contextmenu", layer._measurementContextHandler);
      delete layer._measurementContextHandler;
    }
    const hit = layer._measurementHitLayer;
    if (hit) {
      hit.off("click");
      hit.off("contextmenu");
    }
  }

  function handleMeasurementLeftClick(event, layer) {
    if (state.measureMode && layer?._measurementMode === "marker") return;
    if (event?.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
    if (layer?._measurementMoving) return;
    if ((layer?._measurementIgnoreClickUntil || 0) > Date.now()) return;
    if ((layer?._shapeRotationIgnoreClickUntil || 0) > Date.now()) return;
    if (!measurementIsRetained(layer)) return;
    if (layer._measurementLocked) {
      showToast("Markup locked.");
      return;
    }
    clearMeasurement(layer);
    if (state.measureLayer === layer) state.measureMode = null; syncMarkupDrawInteractionMode();
  }

  function attachMeasurementInteractions(layer) {
    if (!layer) return;
    detachMeasurementInteractions(layer);
    const clearHandler = event => handleMeasurementLeftClick(event, layer);
    const contextHandler = event => showMeasurementContextMenu(event, layer);
    layer._measurementClearHandler = clearHandler;
    layer._measurementContextHandler = contextHandler;
    if (layer._measurementMode === "distance") {
      const hit = ensureDistanceHitLayer(layer);
      hit.on("click", clearHandler);
      hit.on("contextmenu", contextHandler);
    } else {
      layer.on("click", clearHandler);
      layer.on("contextmenu", contextHandler);
    }
  }

  function disableMeasurementEditing(layer) {
    if (!layer) return;
    disablePolygonEdgeVertexInsert(layer);
    disablePolygonSelfSnapping(layer);
    if (layer._measurementMode === "distance") disableShapeEdgeRotation(layer);
    if (layer._measurementEditChangeHandler) {
      layer.off("pm:change", layer._measurementEditChangeHandler);
      delete layer._measurementEditChangeHandler;
    }
    if (layer._faMarkupRebindAfterChange) {
      layer.off("pm:markerdragend pm:vertexadded pm:vertexremoved", layer._faMarkupRebindAfterChange);
      delete layer._faMarkupRebindAfterChange;
    }
    if (layer.pm?.enabled()) layer.pm.disable();
    if (layer._measurementMode === "distance") {
      for (const marker of layer._measurementMarkers || []) setDistanceMeasurementMarkerEditable(marker, false);
    }
    if (layer._measurementMode === "polygon") {
      state.map?.getContainer()?.classList.remove("polygon-vertex-edit-mode");
      state.map?.getContainer?.().style.removeProperty("--polygon-measurement-color");
    }
    layer._measurementEditing = false;
    if (layer._measurementMode === "polygon" && layer instanceof L.Polygon) syncPolygonMeasurementWorldCopies(layer, true);
    if (layer._measurementMode === "distance") syncDistanceMeasurementVisual(layer, true);
    if (layer._measurementMode === "circle" && layer instanceof L.Circle) syncCircleMeasurementWorldCopies(layer);
  }

  function finishOtherMarkupEditing(activeLayer) {
    for (const other of allMeasurementLayers()) {
      if (!other || other === activeLayer || !other._measurementEditing) continue;
      setMeasurementEditing(other, false);
    }
    if (state.measureMode === "distance" && !state.measureLayer && Array.isArray(state.measureMarkers) && state.measureMarkers.length) {
      for (const marker of state.measureMarkers) if (state.map?.hasLayer(marker)) state.map.removeLayer(marker);
      state.measureMarkers = [];
      state.measureHitLayer = null;
      state.measureMode = null;
      state.measureStartLatLng = null;
      state.measureWorkingLayer = null;
      state.measurePendingColor = null;
      if (typeof syncMarkupDrawInteractionMode === "function") syncMarkupDrawInteractionMode();
    }
  }

  function polygonMeasurementVertexMarkers(layer) {
    const output = [];
    const walk = value => {
      if (Array.isArray(value)) { for (const child of value) walk(child); return; }
      if (value instanceof L.Marker) output.push(value);
    };
    walk(layer?.pm?._markers || []);
    return output;
  }

  function removePolygonMeasurementVertexAtPath(tree, path) {
    if (!Array.isArray(path) || !path.length) return false;
    let parent = tree;
    for (let i = 0; i < path.length - 1; i += 1) {
      if (!Array.isArray(parent) || !Array.isArray(parent[path[i]])) return false;
      parent = parent[path[i]];
    }
    const index = path[path.length - 1];
    if (!Array.isArray(parent) || !Number.isInteger(index) || index < 0 || index >= parent.length || parent.length <= 3) return false;
    parent.splice(index, 1);
    return true;
  }

  function rebuildPolygonMeasurementEditMarkers(layer) {
    if (!layer || layer._measurementMode !== "polygon" || !layer.pm?.enabled?.()) return;
    if (typeof layer.pm._initMarkers === "function") layer.pm._initMarkers();
    if (layer.pm.options?.snappable && typeof layer.pm._initSnappableMarkers === "function") layer.pm._initSnappableMarkers();
    bindPolygonMeasurementVertexContextMenus(layer);
  }

  function bindPolygonMeasurementVertexContextMenus(layer) {
    if (!layer || layer._measurementMode !== "polygon" || !layer.pm?.enabled?.()) return;
    for (const marker of polygonMeasurementVertexMarkers(layer)) {
      if (marker._faMarkupContextHandler) marker.off("contextmenu", marker._faMarkupContextHandler);
      if (marker._faMarkupRemoveHandler) marker.off("click", marker._faMarkupRemoveHandler);
      if (marker._faMarkupDragStartHandler) marker.off("dragstart", marker._faMarkupDragStartHandler);
      if (marker._faMarkupDragEndHandler) marker.off("dragend", marker._faMarkupDragEndHandler);
      const stop = event => {
        if (!event?.originalEvent) return;
        event.originalEvent.preventDefault();
        L.DomEvent.stopPropagation(event.originalEvent);
      };
      const dragStart = () => { marker._faMarkupSuppressRemoveUntil = Number.MAX_SAFE_INTEGER; };
      const dragEnd = () => {
        marker._faMarkupSuppressRemoveUntil = Date.now() + 400;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (layer._measurementEditing && layer.pm?.enabled?.()) bindPolygonMeasurementVertexContextMenus(layer);
        }));
      };
      const remove = event => {
        stop(event);
        if ((marker._faMarkupSuppressRemoveUntil || 0) > Date.now()) return;
        const found = L.PM?.Utils?.findDeepMarkerIndex?.(layer.pm?._markers || [], marker);
        if (!Array.isArray(found?.indexPath)) return;
        const nextLatLngs = cloneLatLngTree(layer.getLatLngs());
        if (!removePolygonMeasurementVertexAtPath(nextLatLngs, found.indexPath)) return;
        layer.setLatLngs(nextLatLngs);
        layer.redraw?.();
        syncPolygonMeasurementWorldCopies(layer, false);
        updateMeasurementTooltip(layer, "polygon");
        layer._poiEdgeInsertHandlers?.sync?.();
        commitMeasurementHistory(layer);
        if (layer._measurementLocked) scheduleLockedMeasurementSave(layer);
        setTimeout(() => rebuildPolygonMeasurementEditMarkers(layer), 0);
      };
      const context = event => { stop(event); showMeasurementContextMenu(event, layer); };
      marker._faMarkupDragStartHandler = dragStart;
      marker._faMarkupDragEndHandler = dragEnd;
      marker._faMarkupRemoveHandler = remove;
      marker._faMarkupContextHandler = context;
      marker.on("dragstart", dragStart);
      marker.on("dragend", dragEnd);
      marker.on("click", remove);
      marker.on("contextmenu", context);
    }
  }

  function polygonMeasurementVertexCount(value) {
    if (!Array.isArray(value)) return value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng)) ? 1 : 0;
    return value.reduce((sum, child) => sum + polygonMeasurementVertexCount(child), 0);
  }



  function preservePolygonMeasurementVertices(layer) {
    if (layer instanceof L.Polygon && !(layer instanceof L.Circle)) {
      layer._convertLatLngs = L.Polyline.prototype._convertLatLngs;
    }
    return layer;
  }

  function setMeasurementEditing(layer, enabled) {
    if (!measurementIsRetained(layer)) return;
    if (layer._measurementMode === "polygon") preservePolygonMeasurementVertices(layer);
    if (enabled) finishOtherMarkupEditing(layer);

    if (enabled && layer._measurementMoveEnabled) setMeasurementMoveMode(layer, false);
    if (enabled && layer._measurementMode === "distance" && state.measureEditingLine && state.measureEditingLine !== layer) {
      setMeasurementEditing(state.measureEditingLine, false);
    }

    const wasEditingLine = state.measureEditingLine === layer;
    disableMeasurementEditing(layer);
    layer._measurementEditing = Boolean(enabled);
    state.map?.getContainer()?.classList.toggle("fa-measurement-edit-mode", allMeasurementLayers().some(item => item?._measurementEditing));
    syncActiveGeometryHandleTheme();

    if (!enabled) {
      if (layer._measurementMode === "distance") {
        if (wasEditingLine) state.measureEditingLine = null;
        if ((wasEditingLine || state.measureLayer === layer) && state.measureMode === "distance") {
          state.measureMode = null; syncMarkupDrawInteractionMode();
          state.measureStartLatLng = null;
          state.measureWorkingLayer = null;
        }
      }
      commitMeasurementHistory(layer);
      if (layer._measurementLocked) scheduleLockedMeasurementSave(layer);
      return;
    }

    ensureMeasurementHistory(layer);

    if (layer._measurementMode === "distance") {
      state.measureEditingLine = layer;
      state.measureMode = "distance"; syncMarkupDrawInteractionMode();
      state.measureStartLatLng = null;
      state.measureWorkingLayer = null;
      for (const marker of layer._measurementMarkers || []) setDistanceMeasurementMarkerEditable(marker, true);
      enableShapeEdgeRotation(layer);
      const rotationHitLayer = layer._shapeRotationHandlers?.hitLayer;
      if (rotationHitLayer && layer._measurementClearHandler) {
        rotationHitLayer.on("click", layer._measurementClearHandler);
        if (layer._measurementContextHandler) rotationHitLayer.on("contextmenu", layer._measurementContextHandler);
      }
      syncDistanceMeasurementVisual(layer, true);
      return;
    }

    if (layer.pm) {
      const editOptions = {
        snappable: true,
        snapDistance: 20,
        snapSegment: true,
        snapVertex: true,
        hideMiddleMarkers: layer._measurementMode === "polygon",
        preventMarkerRemoval: layer._measurementMode === "polygon",
        removeVertexOn: "contextmenu",
        removeLayerBelowMinVertexCount: false
      };
      if (layer._measurementMode === "circle") {
        editOptions.hintlineStyle = {
          color: layer.options?.color || state.poiColor,
          weight: 2,
          dashArray: "5,5"
        };
      }
      installLayerDragAutoPan(layer);
      layer.pm.enable(editOptions);
      if (layer._measurementMode === "polygon") enablePolygonSelfSnapping(layer);
      if (layer._measurementMode === "polygon") {
        bindPolygonMeasurementVertexContextMenus(layer);
      }
      attachMeasurementInteractions(layer);
    }

    if (layer._measurementMode === "polygon") {
      state.map?.getContainer()?.classList.add("polygon-vertex-edit-mode");
      state.map?.getContainer?.().style.setProperty("--polygon-measurement-color", validPoiColor(layer.options?.color) || state.poiColor);
      enablePolygonEdgeVertexInsert(layer);
    }

    const changed = () => {
      if (layer._measurementMode === "polygon") bindPolygonMeasurementVertexContextMenus(layer);
      if (layer._measurementMode === "circle") syncCircleMeasurementWorldCopies(layer, false);
      if (layer._measurementMode === "polygon") syncPolygonMeasurementWorldCopies(layer, false);
      updateMeasurementTooltip(layer, layer._measurementMode);
      layer._shapeRotationHandlers?.sync?.();
      if (layer._shapeRotateDragging) return;
      scheduleMeasurementHistoryCommit(layer);
      if (layer._measurementLocked) scheduleLockedMeasurementSave(layer);
    };
    layer._measurementEditChangeHandler = changed;
    layer.on("pm:change", changed);
    if (layer._measurementMode === "polygon") {
      layer._faMarkupRebindAfterChange = event => {
        if (event.type === "pm:markerdragend") {
          const until = Date.now() + 250;
          const dragged = event.markerEvent?.target;
          if (dragged) dragged._faMarkupSuppressRemoveUntil = until;
          for (const marker of polygonMeasurementVertexMarkers(layer)) {
            if (marker._faMarkupSuppressRemoveUntil === Number.MAX_SAFE_INTEGER) marker._faMarkupSuppressRemoveUntil = until;
          }
        }
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (layer._measurementEditing && layer.pm?.enabled?.()) bindPolygonMeasurementVertexContextMenus(layer);
        }));
      };
      layer.on("pm:markerdragend pm:vertexadded pm:vertexremoved", layer._faMarkupRebindAfterChange);
    }
  }

  function cloneMeasurementHistoryValue(value) {
    return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function newMeasurementHistoryId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `measurement-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function measurementLifecycleSnapshot(layer) {
    if (!layer || !measurementIsRetained(layer)) return null;
    if (!layer._measurementHistoryId) layer._measurementHistoryId = newMeasurementHistoryId();
    return {
      historyId: layer._measurementHistoryId,
      payload: cloneMeasurementHistoryValue(measurementRecordPayload(layer)),
      recordId: layer._measurementRecordId || null,
      locked: Boolean(layer._measurementLocked),
      temporary: state.temporaryMeasurements.has(layer),
      current: state.measureLayer === layer,
      editing: Boolean(layer._measurementEditing)
    };
  }

  function captureMeasurementState() {
    return allMeasurementLayers()
      .map(measurementLifecycleSnapshot)
      .filter(Boolean)
      .sort((a, b) => String(a.historyId).localeCompare(String(b.historyId)))
      .map(cloneMeasurementHistoryValue);
  }

  function measurementStateSignature(snapshots) {
    const stable = (snapshots || []).map(snapshot => ({
      historyId: snapshot.historyId,
      payload: snapshot.payload,
      locked: Boolean(snapshot.locked),
      temporary: Boolean(snapshot.temporary),
      current: Boolean(snapshot.current)
    }));
    return JSON.stringify(stable);
  }

  function resetMeasurementHistoryTracking() {
    for (const history of state.measurementHistories.values()) {
      if (history?.timer) clearTimeout(history.timer);
    }
    state.measurementHistories.clear();
    state.measurementHistoryLayer = null;
  }

  function rebaselineActiveMeasurementHistories(snapshot = captureMeasurementState()) {
    const baseline = (snapshot || []).map(cloneMeasurementHistoryValue);
    for (const layer of allMeasurementLayers()) {
      if (!layer._measurementEditing && !layer._measurementMoveEnabled) continue;
      state.measurementHistories.set(layer, {before: baseline.map(cloneMeasurementHistoryValue), timer: null});
      state.measurementHistoryLayer = layer;
    }
  }

  function pushMeasurementTransaction(before, after, options = {}) {
    if (state.measurementLifecycleApplying) return false;
    const beforeState = (before || []).map(cloneMeasurementHistoryValue);
    const afterState = (after || []).map(cloneMeasurementHistoryValue);
    if (measurementStateSignature(beforeState) === measurementStateSignature(afterState) && !options.profile) return false;
    state.measurementLifecycleUndo.push({
      sequence: ++state.historySequence,
      kind: options.kind || "state",
      before: beforeState,
      after: afterState,
      profile: options.profile ? cloneMeasurementHistoryValue(options.profile) : null
    });
    if (state.measurementLifecycleUndo.length > 100) state.measurementLifecycleUndo.shift();
    state.measurementLifecycleRedo = [];
    state.mapFeatureRedo = [];
    state.measurementReplacementBefore = null;
    resetMeasurementHistoryTracking();
    rebaselineActiveMeasurementHistories(afterState);
    return true;
  }

  function ensureMeasurementHistory(layer) {
    if (!layer || !measurementIsRetained(layer) || state.measurementLifecycleApplying) return null;
    let history = state.measurementHistories.get(layer);
    if (!history) {
      history = {before: captureMeasurementState(), timer: null};
      state.measurementHistories.set(layer, history);
    }
    state.measurementHistoryLayer = layer;
    return history;
  }

  function commitMeasurementHistory(layer) {
    if (!layer || !measurementIsRetained(layer) || state.measurementLifecycleApplying) return false;
    const history = state.measurementHistories.get(layer) || ensureMeasurementHistory(layer);
    if (!history) return false;
    if (history.timer) {
      clearTimeout(history.timer);
      history.timer = null;
    }
    const before = history.before;
    const after = captureMeasurementState();
    const changed = pushMeasurementTransaction(before, after);
    if (measurementIsRetained(layer)) {
      const baseline = {before: after, timer: null};
      state.measurementHistories.set(layer, baseline);
      state.measurementHistoryLayer = layer;
    }
    return changed;
  }

  function scheduleMeasurementHistoryCommit(layer, delay = 140) {
    const history = ensureMeasurementHistory(layer);
    if (!history) return;
    if (history.timer) clearTimeout(history.timer);
    history.timer = setTimeout(() => {
      history.timer = null;
      commitMeasurementHistory(layer);
    }, delay);
  }

  function pushMeasurementLifecycleAction(snapshots) {
    if (state.measurementLifecycleApplying) return;
    const removedIds = new Set((snapshots || []).filter(Boolean).map(snapshot => snapshot.historyId));
    const after = captureMeasurementState();
    const before = [...after, ...(snapshots || []).filter(Boolean).map(cloneMeasurementHistoryValue)]
      .filter(snapshot => snapshot?.historyId)
      .filter((snapshot, index, array) => array.findIndex(item => item.historyId === snapshot.historyId) === index)
      .sort((a, b) => String(a.historyId).localeCompare(String(b.historyId)));
    if (removedIds.size) pushMeasurementTransaction(before, after);
  }

  function pushMeasurementCreationAction(layer) {
    if (state.measurementLifecycleApplying || !measurementIsRetained(layer)) return;
    const after = captureMeasurementState();
    const before = state.measurementReplacementBefore
      ? cloneMeasurementHistoryValue(state.measurementReplacementBefore)
      : after.filter(snapshot => snapshot.historyId !== layer._measurementHistoryId);
    state.measurementReplacementBefore = null;
    pushMeasurementTransaction(before, after);
    if (measurementIsRetained(layer)) ensureMeasurementHistory(layer);
  }

  function pushMeasurementModeConversionAction(before, after) {
    pushMeasurementTransaction(before, after);
  }

  async function convertClosedDistanceMeasurementToPolygon(layer) {
    if (!measurementIsRetained(layer)) return false;
    const ring = closedDistanceMeasurementPolygonPoints(layer);
    if (!ring) {
      showToast("Close the line by connecting its last point to its first point.");
      return false;
    }
    commitMeasurementHistory(layer);
    const transactionBefore = captureMeasurementState();
    const historyId = layer._measurementHistoryId || newMeasurementHistoryId();
    const wasLocked = Boolean(layer._measurementLocked);
    const wasTemporary = state.temporaryMeasurements.has(layer);
    const wasEditing = Boolean(layer._measurementEditing);
    const recordId = layer._measurementRecordId || null;
    const color = validPoiColor(layer.options?.color) || state.poiColor;
    const tooltipHidden = Boolean(layer._measurementTooltipHidden);
    const polygon = L.polygon(ring, {color, weight: 2, fillOpacity: state.fillOpacity, interactive: true, bubblingMouseEvents: false});
    polygon._measurementMode = "polygon";
    polygon._measurementHistoryId = historyId;
    polygon._measurementTooltipHidden = tooltipHidden;
    const polygonPayload = measurementRecordPayload(polygon);
    if (wasLocked) {
      try {
        cancelLockedMeasurementSave(layer);
        await waitForLockedMeasurementSave(layer);
        await api(`/collections/measurements/records/${recordId}`, {method: "PATCH", body: JSON.stringify(polygonPayload)});
      } catch (err) {
        showToast(`Unable to convert markup: ${err.message}`);
        return false;
      }
    }
    if (state.measureEditingLine === layer) state.measureEditingLine = null;
    if (state.measureLayer === layer && state.measureMode === "distance") state.measureMode = null; syncMarkupDrawInteractionMode();
    removeMeasurementLayer(layer);
    const converted = registerMeasurementLayer(polygon, "polygon", {
      locked: wasLocked,
      temporary: wasTemporary,
      tooltipHidden,
      color,
      editable: wasEditing && !wasLocked,
      recordId: wasLocked ? recordId : null
    });
    converted._measurementHistoryId = historyId;
    pushMeasurementModeConversionAction(transactionBefore, captureMeasurementState());
    showToast("Converted to polygon markup.", "success");
    return true;
  }

  function markupLineLengthMeters(layer) {
    const points = layer?.getLatLngs?.().flat(Infinity).filter(point => point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))) || [];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) total += state.map.distance(points[i - 1], points[i]);
    return total;
  }

  function markupLineMidpoint(layer) {
    const points = layer?.getLatLngs?.().flat(Infinity).filter(point => point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))) || [];
    if (!points.length) return null;
    if (points.length === 1) return L.latLng(points[0]);
    const total = markupLineLengthMeters(layer);
    if (!(total > 0)) return L.latLng(points[0]);
    const target = total / 2;
    let walked = 0;
    for (let i = 1; i < points.length; i += 1) {
      const segment = state.map.distance(points[i - 1], points[i]);
      if (walked + segment >= target) {
        const t = segment > 0 ? (target - walked) / segment : 0;
        return geodesicInterpolateLatLng(points[i - 1], points[i], t);
      }
      walked += segment;
    }
    return L.latLng(points[points.length - 1]);
  }

  function markupConversionCenter(layer) {
    if (layer instanceof L.Marker) return L.latLng(layer.getLatLng());
    if (layer instanceof L.Circle) return L.latLng(circleMeasurementCanonicalCenter(layer) || layer.getLatLng());
    if (layer?._measurementMode === "polygon" && layer instanceof L.Polygon) return polygonMeasurementReferenceLatLng(polygonMeasurementCanonicalLatLngs(layer));
    if (layer?._measurementMode === "distance") return markupLineMidpoint(layer);
    return null;
  }


  function markupPolygonOuterRing(layer) {
    if (!(layer instanceof L.Polygon) || layer instanceof L.Circle) return [];
    const canonical = polygonMeasurementCanonicalLatLngs(layer);
    let ring = canonical;
    while (Array.isArray(ring) && ring.length && Array.isArray(ring[0]) && !Number.isFinite(Number(ring[0]?.lat))) ring = ring[0];
    const points = (Array.isArray(ring) ? ring : []).filter(point => point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))).map(point => L.latLng(point));
    if (points.length > 1) {
      const first = points[0];
      const last = points[points.length - 1];
      if (Math.abs(first.lat - last.lat) > 1e-9 || Math.abs(normalizeMeasurementLongitude(first.lng) - normalizeMeasurementLongitude(last.lng)) > 1e-9) points.push(L.latLng(first));
    }
    return points;
  }

  function markupConversionPayload(layer, mode, source) {
    const color = validPoiColor(source?.options?.color) || state.poiColor;
    layer._measurementMode = mode;
    layer._measurementTooltipHidden = Boolean(source?._measurementTooltipHidden);
    if (layer.options) layer.options.color = color;
    if (mode === "marker" && layer instanceof L.Marker) layer._measurementLabel = String(layer._measurementLabel || "").trim() || nextMarkerMarkupLabel();
    return measurementRecordPayload(layer);
  }

  function restoreMarkupLayerVisual(layer) {
    if (!layer || !measurementIsRetained(layer) || !state.map) return;
    if (!state.map.hasLayer(layer)) layer.addTo(state.map);
    if (layer._measurementMode === "circle" && layer instanceof L.Circle) syncCircleMeasurementWorldCopies(layer, true);
    if (layer._measurementMode === "polygon" && layer instanceof L.Polygon) syncPolygonMeasurementWorldCopies(layer, true);
    if (layer._measurementMode === "distance") {
      syncDistanceMeasurementVisual(layer, true);
      ensureDistanceHitLayer(layer)?.bringToFront?.();
      if (layer._measurementEditing) {
        for (const marker of layer._measurementMarkers || []) setDistanceMeasurementMarkerEditable(marker, true);
      }
    }
    attachMeasurementInteractions(layer);
    if (layer._measurementTooltipHidden) removeMeasurementTooltip(layer);
    else updateMeasurementTooltip(layer, layer._measurementMode);
  }

  function hideMarkupConversionSource(conversion) {
    const source = conversion?.sourceLayer;
    if (!source || !state.map) return;
    conversion.sourceWasVisible = state.map.hasLayer(source);
    removeMeasurementTooltip(source);
    if (source._measurementMode === "circle") clearCircleMeasurementWorldCopies(source);
    if (source._measurementMode === "polygon") clearPolygonMeasurementWorldCopies(source);
    if (source._measurementMode === "distance") {
      if (source._measurementGeodesicLayer && state.map.hasLayer(source._measurementGeodesicLayer)) state.map.removeLayer(source._measurementGeodesicLayer);
      if (source._measurementHitLayer && state.map.hasLayer(source._measurementHitLayer)) state.map.removeLayer(source._measurementHitLayer);
      for (const marker of source._measurementMarkers || []) if (state.map.hasLayer(marker)) state.map.removeLayer(marker);
    }
    if (state.map.hasLayer(source)) state.map.removeLayer(source);
  }

  function restoreMarkupConversionSource(conversion) {
    const source = conversion?.sourceLayer;
    if (!source || !measurementIsRetained(source)) return;
    restoreMarkupLayerVisual(source);
  }

  async function replaceMarkupGeometry(source, targetLayer, targetMode, successText, {editing = false} = {}) {
    if (!measurementIsRetained(source) || !targetLayer || !targetMode) return false;
    commitMeasurementHistory(source);
    const before = captureMeasurementState();
    const sourceId = source._measurementHistoryId;
    const sourceMode = source._measurementMode;
    const payload = markupConversionPayload(targetLayer, targetMode, source);
    removeMeasurementTooltip(source);
    hideCircleArea(targetLayer);
    removeMeasurementTooltip(targetLayer);
    if (state.map?.hasLayer(targetLayer) && targetLayer !== source) state.map.removeLayer(targetLayer);
    const after = before.map(snapshot => snapshot.historyId === sourceId ? {...snapshot, payload, editing: Boolean(editing)} : snapshot);
    try {
      await applyMeasurementStateSnapshot(after);
      const replacement = allMeasurementLayers().find(layer => layer?._measurementHistoryId === sourceId) || null;
      if (targetMode === "distance" && editing && replacement) refreshConvertedDistanceSnapping(replacement);
      if (targetMode === "marker" && sourceMode !== "marker") state.markupMarkerNextIndex += 1;
      pushMeasurementModeConversionAction(before, captureMeasurementState());
      showToast(successText || `Converted to ${targetMode === "distance" ? "line" : targetMode} markup.`, "success");
      return true;
    } catch (err) {
      try { await applyMeasurementStateSnapshot(before); } catch {}
      const restored = allMeasurementLayers().find(layer => layer?._measurementHistoryId === sourceId);
      if (restored) restoreMarkupLayerVisual(restored);
      showToast(`Unable to convert markup: ${err.message}`);
      return false;
    }
  }

  function cleanupMarkupShapeConversion(conversion, {cancelDraw = false, preservePreview = false, restoreSource = false} = {}) {
    if (!conversion) return;
    if (conversion.moveHandler) state.map?.off("mousemove", conversion.moveHandler);
    if (conversion.clickHandler) state.map?.off("click", conversion.clickHandler);
    if (cancelDraw && conversion.target === "polygon") state.map?.pm?.disableDraw?.();
    if (conversion.previewLayer instanceof L.Circle) hideCircleArea(conversion.previewLayer);
    if (conversion.previewLayer) removeMeasurementTooltip(conversion.previewLayer);
    for (const helper of [conversion.helperLine, conversion.centerMarker, conversion.endpointMarker]) {
      if (helper && state.map?.hasLayer(helper)) state.map.removeLayer(helper);
    }
    if (!preservePreview && conversion.previewLayer && state.map?.hasLayer(conversion.previewLayer)) state.map.removeLayer(conversion.previewLayer);
    state.map?.getContainer()?.classList.remove("markup-shape-conversion-mode");
    if (conversion.target === "polygon" && state.measureMode !== "polygon") {
      state.map?.getContainer?.().classList.remove("markup-polygon-draw-active");
      if (!state.measureMode) state.map?.getContainer?.().style.removeProperty("--markup-draw-color");
    }
    if (restoreSource) restoreMarkupConversionSource(conversion);
  }

  function cancelMarkupShapeConversion() {
    if (state.markupShapeConversion?.target === "line-normal") {
      const conversion = state.markupShapeConversion;
      state.markupShapeConversion = null;
      for (const marker of state.measureMarkers || []) if (state.map?.hasLayer(marker)) state.map.removeLayer(marker);
      state.measureMarkers = [];
      state.measureLayer = null;
      state.measureHitLayer = null;
      state.measureMode = null; syncMarkupDrawInteractionMode();
      state.measureStartLatLng = null;
      state.measureWorkingLayer = null;
      state.measurePendingColor = null;
      state.measurementReplacementBefore = null;
      applyMeasurementStateSnapshot(conversion.before || []).catch(error => { void 0; showToast(`Unable to restore markup: ${error.message}`); });
      return;
    }
    const conversion = state.markupShapeConversion;
    if (!conversion) return;
    state.markupShapeConversion = null;
    syncActiveGeometryHandleTheme();
    cleanupMarkupShapeConversion(conversion, {cancelDraw: true, restoreSource: true});
  }

  async function finishMarkupInteractiveConversion(conversion, targetLayer, targetMode) {
    if (!conversion || state.markupShapeConversion !== conversion || !targetLayer) return;
    state.markupShapeConversion = null;
    syncActiveGeometryHandleTheme();
    cleanupMarkupShapeConversion(conversion, {preservePreview: targetLayer === conversion.previewLayer});
    const converted = await replaceMarkupGeometry(conversion.sourceLayer, targetLayer, targetMode, undefined, {editing: targetMode === "distance"});
    if (!converted) restoreMarkupConversionSource(conversion);
  }

  async function convertPolygonMarkupToEditableLine(source) {
    if (!measurementIsRetained(source) || source._measurementMode !== "polygon" || !(source instanceof L.Polygon)) return false;
    const points = markupPolygonOuterRing(source).map(point => L.latLng(point));
    if (points.length < 2) return false;
    commitMeasurementHistory(source);
    const before = captureMeasurementState();
    const color = validPoiColor(source.options?.color) || state.poiColor;
    hideMapContextMenu();
    await clearMeasurement(source, {recordHistory: false});
    state.measurementReplacementBefore = null;
    const wasApplying = state.measurementLifecycleApplying;
    state.measurementLifecycleApplying = true;
    try {
      state.measureStartLatLng = L.latLng(points[0]);
      startMeasurement("distance", {color});
      for (let i = 1; i < points.length; i += 1) addDistanceMeasurementPoint(L.latLng(points[i]));
    } finally {
      state.measurementLifecycleApplying = wasApplying;
    }
    const line = state.measureLayer;
    if (!line || line._measurementMode !== "distance") {
      try { await applyMeasurementStateSnapshot(before); } catch {}
      showToast("Unable to convert polygon to line.");
      return false;
    }
    attachMeasurementInteractions(line);
    ensureDistanceHitLayer(line);
    pushMeasurementModeConversionAction(before, captureMeasurementState());
    ensureMeasurementHistory(line);
    showToast("Converted to line markup.", "success");
    return true;
  }

  async function beginMarkupLineConversionWithNormalMeasurement(source) {
    if (!measurementIsRetained(source)) return false;
    const center = markupConversionCenter(source);
    if (!center) return false;
    commitMeasurementHistory(source);
    const before = captureMeasurementState();
    const color = validPoiColor(source.options?.color) || state.poiColor;
    hideMapContextMenu();
    await clearMeasurement(source, {recordHistory: false});
    state.measurementReplacementBefore = before;
    state.markupShapeConversion = {target: "line-normal", before: before.map(cloneMeasurementHistoryValue), color};
    state.measureStartLatLng = L.latLng(center);
    startMeasurement("distance", {color});
    return true;
  }

  function beginMarkupShapeConversion(source, target, pointerEvent = null) {
    if (!measurementIsRetained(source) || state.markupShapeConversion || state.shapeConversion) return;
    const center = markupConversionCenter(source);
    if (!center) return;
    hideMapContextMenu();
    const color = validPoiColor(source.options?.color) || state.poiColor;
    const conversion = {sourceLayer: source, target, center: L.latLng(center), color, previewLayer: null, helperLine: null, centerMarker: null, endpointMarker: null, moveHandler: null, clickHandler: null, sourceWasVisible: false};
    state.markupShapeConversion = conversion;
    syncActiveGeometryHandleTheme();
    hideMarkupConversionSource(conversion);
    state.map.getContainer().classList.add("markup-shape-conversion-mode");
    let pointerLatLng = null;
    try {
      if (pointerEvent && state.map?.mouseEventToLatLng) pointerLatLng = state.map.mouseEventToLatLng(pointerEvent);
    } catch {}
    if (!pointerLatLng && state.lastCursor) pointerLatLng = L.latLng(state.lastCursor);
    const initialEndpoint = target === "line" ? L.latLng(pointerLatLng || center) : (elevationProfileSnapLatLng(pointerLatLng || center, 20, source, true) || L.latLng(pointerLatLng || center));

    if (target === "polygon") {
      state.map.getContainer().classList.add("markup-polygon-draw-active");
      state.map.getContainer().style.setProperty("--markup-draw-color", color);
      state.map.pm.enableDraw("Polygon", {
        templineStyle: {color, weight: 2, fillOpacity: state.fillOpacity},
        hintlineStyle: {color, weight: 2, dashArray: "5,5"},
        pathOptions: {color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity},
        snappable: true,
        snapDistance: 20,
        snapSegment: true
      });
      state.map.once("pm:drawend", () => setTimeout(() => { if (state.markupShapeConversion === conversion) cancelMarkupShapeConversion(); }, 0));
      return;
    }

    if (target === "circle") {
      conversion.previewLayer = L.circle(center, {radius: Math.max(1, state.map.distance(center, initialEndpoint)), color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity, interactive: false, pmIgnore: true, snapIgnore: true}).addTo(state.map);
      conversion.helperLine = L.polyline([center, initialEndpoint], {color, weight: 2, opacity: 1, dashArray: "5,5", interactive: false, pmIgnore: true, snapIgnore: true}).addTo(state.map);
    } else {
      conversion.previewLayer = L.polyline([center, initialEndpoint], {color, weight: 2, opacity: 1, dashArray: "5,5", fillOpacity: 0, interactive: false, pmIgnore: true, snapIgnore: true}).addTo(state.map);
    }
    conversion.centerMarker = L.marker(center, {icon: distanceMeasurementMarkerIcon(), interactive: false, keyboard: false, riseOnHover: false, zIndexOffset: 1000, pmIgnore: true, snapIgnore: true}).addTo(state.map);
    conversion.endpointMarker = L.marker(initialEndpoint, {icon: distanceMeasurementMarkerIcon(), interactive: false, keyboard: false, riseOnHover: false, zIndexOffset: 1000, pmIgnore: true, snapIgnore: true}).addTo(state.map);
    syncMeasurementNodeColor(conversion.centerMarker, color);
    syncMeasurementNodeColor(conversion.endpointMarker, color);
    if (target === "circle") updateMeasurementTooltip(conversion.previewLayer, "circle");
    else updateMeasurementTooltip(conversion.previewLayer, "distance");
    conversion.moveHandler = event => {
      if (state.markupShapeConversion !== conversion || !event?.latlng) return;
      const endpoint = target === "line" ? L.latLng(event.latlng) : (elevationProfileSnapLatLng(event.latlng, 20, source, true) || L.latLng(event.latlng));
      conversion.endpointMarker.setLatLng(endpoint);
      syncMeasurementNodeColor(conversion.endpointMarker, color);
      if (target === "circle") {
        conversion.previewLayer.setRadius(Math.max(1, state.map.distance(center, endpoint)));
        conversion.helperLine.setLatLngs([center, endpoint]);
        updateMeasurementTooltip(conversion.previewLayer, "circle");
      } else {
        conversion.previewLayer.setLatLngs([center, endpoint]);
        updateMeasurementTooltip(conversion.previewLayer, "distance");
      }
    };
    conversion.clickHandler = async event => {
      if (state.markupShapeConversion !== conversion || !event?.latlng) return;
      if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
      const endpoint = target === "line" ? L.latLng(event.latlng) : (elevationProfileSnapLatLng(event.latlng, 20, source, false) || L.latLng(event.latlng));
      if (state.map.distance(center, endpoint) < 1) return;
      if (target === "circle") {
        conversion.previewLayer.setRadius(state.map.distance(center, endpoint));
        await finishMarkupInteractiveConversion(conversion, conversion.previewLayer, "circle");
      } else {
        conversion.previewLayer.setLatLngs([center, endpoint]);
        await finishMarkupInteractiveConversion(conversion, conversion.previewLayer, "distance");
      }
    };
    state.map.on("mousemove", conversion.moveHandler);
    state.map.on("click", conversion.clickHandler);
  }

  async function convertMarkupShape(layer, target, pointerEvent = null) {
    if (!measurementIsRetained(layer)) return false;
    const mode = layer._measurementMode;
    const color = validPoiColor(layer.options?.color) || state.poiColor;
    if ((target === "marker" && mode === "marker") || (target === "line" && mode === "distance") || (target === "circle" && mode === "circle") || (target === "polygon" && mode === "polygon")) return false;
    if (target === "line" && mode !== "distance") {
      if (mode === "polygon") return await convertPolygonMarkupToEditableLine(layer);
      await beginMarkupLineConversionWithNormalMeasurement(layer);
      return true;
    }
    if (mode === "marker" && ["circle", "polygon"].includes(target)) {
      beginMarkupShapeConversion(layer, target, pointerEvent);
      return true;
    }
    if (target === "marker") {
      const center = markupConversionCenter(layer);
      if (!center) return false;
      const marker = L.marker(center, {color, keyboard: false, riseOnHover: false, bubblingMouseEvents: false});
      marker._measurementLabel = nextMarkerMarkupLabel();
      return replaceMarkupGeometry(layer, marker, "marker", "Converted to marker markup.");
    }
    if (target === "line") return false;
    if (target === "circle" || target === "circle-area" || target === "circle-perimeter") {
      const center = markupConversionCenter(layer);
      if (!center) return false;
      let radius = 0;
      if (mode === "distance") radius = markupLineLengthMeters(layer) / (2 * Math.PI);
      else if (mode === "polygon" && target === "circle-area") radius = Math.sqrt(polygonAreaMeters(layer) / Math.PI);
      else if (mode === "polygon" && target === "circle-perimeter") radius = polygonPerimeterMeters(layer) / (2 * Math.PI);
      if (!(radius > 0)) return false;
      return replaceMarkupGeometry(layer, L.circle(center, {radius, color, fillColor: color, weight: 2, fillOpacity: state.fillOpacity}), "circle", "Converted to circle markup.");
    }
    if (target === "polygon") {
      state.map.getContainer().classList.add("markup-polygon-draw-active");
      state.map.getContainer().style.setProperty("--markup-draw-color", color);
      if (mode === "distance") return convertClosedDistanceMeasurementToPolygon(layer);
      if (mode === "circle" && layer instanceof L.Circle) {
        beginMarkupShapeConversion(layer, "polygon", pointerEvent);
        return true;
      }
    }
    return false;
  }

  function syncMeasurementShapeConvertControl(layer = state.measureContextLayer) {
    const menu = $("measurement-shape-convert-menu");
    if (!menu || !layer) return;
    const mode = layer._measurementMode;
    const markerButton = $("measurement-shape-convert-marker");
    const lineButton = $("measurement-shape-convert-line");
    const circleButton = $("measurement-shape-convert-circle");
    const polygonButton = $("measurement-shape-convert-polygon");
    const areaButton = $("measurement-shape-convert-circle-area");
    const perimeterButton = $("measurement-shape-convert-circle-perimeter");
    const circleLabel = $("measurement-shape-convert-circle-label");
    const currentTarget = mode === "marker" ? "marker" : mode === "distance" ? "line" : mode;
    for (const [button, target] of [[markerButton, "marker"], [lineButton, "line"], [circleButton, "circle"], [polygonButton, "polygon"]]) {
      button.classList.toggle("active", currentTarget === target);
      button.disabled = currentTarget === target;
    }
    const polygonSource = mode === "polygon";
    areaButton.classList.toggle("hidden", !polygonSource);
    perimeterButton.classList.toggle("hidden", !polygonSource);
    circleButton.classList.toggle("hidden", polygonSource);
    if (circleLabel) circleLabel.textContent = mode === "distance" ? "Circle (same length)" : "Circle";
    if (mode === "distance") polygonButton.disabled = !closedDistanceMeasurementPolygonPoints(layer);
  }

  function pushMeasurementProfileConversionAction(layer, profileSnapshot) {
    if (state.measurementLifecycleApplying || !measurementIsRetained(layer) || !profileSnapshot) return;
    const after = captureMeasurementState();
    const before = state.measurementReplacementBefore
      ? cloneMeasurementHistoryValue(state.measurementReplacementBefore)
      : after.filter(snapshot => snapshot.historyId !== layer._measurementHistoryId);
    state.measurementReplacementBefore = null;
    pushMeasurementTransaction(before, after, {kind: "profile-convert", profile: profileSnapshot});
  }

  function measurementLayerFromSnapshot(snapshot, recordId = null) {
    const payload = cloneMeasurementHistoryValue(snapshot?.payload);
    if (!payload?.type) throw new Error("Invalid measurement snapshot.");
    const layer = measurementFromRecord(payload);
    if (!layer) throw new Error("Unable to recreate measurement geometry.");
    layer._measurementHistoryId = snapshot.historyId || newMeasurementHistoryId();
    if (payload.type === "distance") {
      layer._measurementMode = "distance";
      layer._measurementMarkers = layer.getLatLngs().flat(Infinity).map(point => createDistanceMeasurementMarker(point, layer, false));
    }
    const registered = registerMeasurementLayer(layer, payload.type, {
      locked: Boolean(snapshot.locked),
      temporary: Boolean(snapshot.temporary) && !snapshot.current,
      tooltipHidden: Boolean(payload.tooltip_hidden),
      color: payload.color,
      editable: Boolean(snapshot.editing) && !snapshot.locked,
      recordId: snapshot.locked ? recordId : null
    });
    registered._measurementHistoryId = layer._measurementHistoryId;
    return registered;
  }

  async function createMeasurementFromSnapshot(snapshot) {
    const payload = cloneMeasurementHistoryValue(snapshot?.payload);
    let recordId = null;
    if (snapshot.locked) {
      const record = await api("/collections/measurements/records", {
        method: "POST",
        body: JSON.stringify(snapshot.recordId ? {...payload, id: snapshot.recordId} : payload)
      });
      recordId = record.id;
    }
    return measurementLayerFromSnapshot(snapshot, recordId);
  }

  async function persistMeasurementSnapshotTransition(layer, snapshot) {
    const payload = cloneMeasurementHistoryValue(snapshot.payload);
    const currentlyLocked = Boolean(layer._measurementLocked);
    if (currentlyLocked) {
      cancelLockedMeasurementSave(layer);
      await waitForLockedMeasurementSave(layer);
    }
    const currentRecordId = layer._measurementRecordId || null;
    if (currentlyLocked && snapshot.locked) {
      if (!currentRecordId) throw new Error("Locked measurement record is missing.");
      await api(`/collections/measurements/records/${currentRecordId}`, {method: "PATCH", body: JSON.stringify(payload)});
      return currentRecordId;
    }
    if (currentlyLocked && !snapshot.locked) {
      await deleteLockedMeasurementRecord(layer);
      return null;
    }
    if (!currentlyLocked && snapshot.locked) {
      const record = await api("/collections/measurements/records", {
        method: "POST",
        body: JSON.stringify(snapshot.recordId ? {...payload, id: snapshot.recordId} : payload)
      });
      return record.id;
    }
    return null;
  }

  function classifyMeasurementLayer(layer, snapshot, recordId = null) {
    state.lockedMeasurements.delete(layer);
    state.temporaryMeasurements.delete(layer);
    if (state.measureLayer === layer) {
      state.measureLayer = null;
      state.measureMarkers = [];
      state.measureHitLayer = null;
    }
    layer._measurementLocked = Boolean(snapshot.locked);
    layer._measurementRecordId = snapshot.locked ? recordId : null;
    if (snapshot.locked) {
      state.lockedMeasurements.add(layer);
    } else if (snapshot.temporary && !snapshot.current) {
      state.temporaryMeasurements.add(layer);
    } else {
      state.measureLayer = layer;
    }
  }

  function applyMeasurementPayload(layer, snapshot, recordId = null) {
    const payload = cloneMeasurementHistoryValue(snapshot.payload);
    disableMeasurementMove(layer);
    disableMeasurementEditing(layer);
    cancelLockedMeasurementSave(layer);

    if (payload.type === "marker" && layer instanceof L.Marker) {
      layer._measurementLabel = String(payload.label || layer._measurementLabel || "").trim() || nextMarkerMarkupLabel();
      layer.setLatLng([Number(payload.center.lat), Number(payload.center.lon)]);
    } else if (payload.type === "circle" && layer instanceof L.Circle) {
      layer.setLatLng([Number(payload.center.lat), Number(payload.center.lon)]);
      layer.setRadius(Number(payload.radius_m));
    } else if (payload.type === "polygon" && layer instanceof L.Polygon) {
      const source = measurementFromRecord(payload);
      if (!source) throw new Error("Unable to restore polygon geometry.");
      layer.setLatLngs(source.getLatLngs());
      if (layer.redraw) layer.redraw();
    } else if (payload.type === "distance" && layer._measurementMode === "distance") {
      const source = measurementFromRecord(payload);
      if (!source) throw new Error("Unable to restore line geometry.");
      const points = source.getLatLngs().flat(Infinity).map(point => L.latLng(point));
      layer.setLatLngs(points);
      classifyMeasurementLayer(layer, snapshot, recordId);
      rebuildDistanceMeasurementMarkers(layer, points);
      syncDistanceMeasurementVisual(layer, true);
    } else {
      throw new Error("Measurement type changed.");
    }

    if (payload.type !== "distance") classifyMeasurementLayer(layer, snapshot, recordId);
    layer._measurementMode = payload.type;
    layer._measurementHistoryId = snapshot.historyId || layer._measurementHistoryId || newMeasurementHistoryId();
    layer._measurementTooltipHidden = Boolean(payload.tooltip_hidden);
    if (payload.type === "marker" && layer instanceof L.Marker) {
      layer._measurementLabel = String(payload.label || layer._measurementLabel || "").trim() || nextMarkerMarkupLabel();
      const markerColor = validPoiColor(payload.color) || state.poiColor;
      layer.options.color = markerColor;
      layer.setIcon(markupMarkerIcon(layer._measurementLabel || nextMarkerMarkupLabel(), markerColor));
    }
    if (layer instanceof L.Path) {
      layer.setStyle({
        color: validPoiColor(payload.color) || state.poiColor,
        weight: 2,
        fillOpacity: payload.type === "distance" ? 0 : state.fillOpacity
      });
    }
    attachMeasurementInteractions(layer);
    if (layer._measurementTooltipHidden) removeMeasurementTooltip(layer);
    else updateMeasurementTooltip(layer, payload.type);
    if (snapshot.editing && !snapshot.locked && payload.type !== "marker") setMeasurementEditing(layer, true);
  }

  function repairMeasurementInteractions(layer) {
    if (!layer || !measurementIsRetained(layer)) return;
    if (layer._measurementMode === "distance") {
      syncDistanceMeasurementVisual(layer, true);
      const color = validPoiColor(layer.options?.color) || state.poiColor;
      for (const marker of layer._measurementMarkers || []) syncMeasurementNodeColor(marker, color);
      ensureDistanceHitLayer(layer)?.bringToFront?.();
    }
    attachMeasurementInteractions(layer);
  }

  async function applyMeasurementStateSnapshot(snapshots) {
    const desired = (snapshots || []).map(cloneMeasurementHistoryValue);
    const desiredById = new Map(desired.map(snapshot => [snapshot.historyId, snapshot]));
    state.measurementReplacementBefore = null;
    resetMeasurementHistoryTracking();

    state.measureMode = null; syncMarkupDrawInteractionMode();
    state.measureWorkingLayer = null;
    state.measureStartLatLng = null;
    if (state.measureEditingLine) setMeasurementEditing(state.measureEditingLine, false);

    for (const layer of allMeasurementLayers()) {
      if (!layer._measurementHistoryId) layer._measurementHistoryId = newMeasurementHistoryId();
      if (desiredById.has(layer._measurementHistoryId)) continue;
      if (layer._measurementLocked) await deleteLockedMeasurementRecord(layer);
      removeMeasurementLayer(layer);
    }

    const currentById = new Map(allMeasurementLayers().map(layer => [layer._measurementHistoryId, layer]));
    for (const snapshot of desired) {
      let layer = currentById.get(snapshot.historyId) || null;
      if (!layer) {
        layer = await createMeasurementFromSnapshot(snapshot);
        currentById.set(snapshot.historyId, layer);
        continue;
      }

      cancelLockedMeasurementSave(layer);
      const recordId = await persistMeasurementSnapshotTransition(layer, snapshot);
      if (layer._measurementMode !== snapshot.payload?.type) {
        removeMeasurementLayer(layer);
        layer = measurementLayerFromSnapshot(snapshot, recordId);
        currentById.set(snapshot.historyId, layer);
      } else {
        applyMeasurementPayload(layer, snapshot, recordId);
      }
    }

    resetMeasurementHistoryTracking();
    for (const layer of allMeasurementLayers()) repairMeasurementInteractions(layer);
    rebaselineActiveMeasurementHistories(captureMeasurementState());
  }

  async function undoMeasurementLifecycleAction() {
    const action = state.measurementLifecycleUndo.pop();
    if (!action) return false;
    const rollback = captureMeasurementState();
    state.measurementLifecycleApplying = true;
    try {
      await applyMeasurementStateSnapshot(action.before);
      if (action.kind === "profile-convert") {
        const restored = await window.FAElevation?.restoreProfile?.(action.profile);
        if (!restored) throw new Error("Unable to restore elevation profile.");
      }
      state.measurementLifecycleRedo.push(action);
      showToast(action.kind === "profile-convert" ? "Converted line restored to elevation profile." : "Markup change undone.", "success");
      return true;
    } catch (err) {
      try { await applyMeasurementStateSnapshot(rollback); } catch {}
      state.measurementLifecycleUndo.push(action);
      showToast(`Unable to undo markup change: ${err.message}`);
      return true;
    } finally {
      state.measurementLifecycleApplying = false;
    }
  }

  async function redoMeasurementLifecycleAction() {
    const action = state.measurementLifecycleRedo.pop();
    if (!action) return false;
    const rollback = captureMeasurementState();
    state.measurementLifecycleApplying = true;
    try {
      if (action.kind === "profile-convert") window.FAElevation?.removeProfileByHistoryId?.(action.profile?.id);
      await applyMeasurementStateSnapshot(action.after);
      state.measurementLifecycleUndo.push(action);
      showToast(action.kind === "profile-convert" ? "Elevation profile converted to line markup." : "Markup change redone.", "success");
      return true;
    } catch (err) {
      try { await applyMeasurementStateSnapshot(rollback); } catch {}
      if (action.kind === "profile-convert") {
        try { await window.FAElevation?.restoreProfile?.(action.profile); } catch {}
      }
      state.measurementLifecycleRedo.push(action);
      showToast(`Unable to redo markup change: ${err.message}`);
      return true;
    } finally {
      state.measurementLifecycleApplying = false;
    }
  }

  function recordMapFeatureAction(action) {
    if (!action || typeof action.undo !== "function" || typeof action.redo !== "function") return false;
    state.mapFeatureUndo.push({...action, sequence: ++state.historySequence});
    if (state.mapFeatureUndo.length > 100) state.mapFeatureUndo.shift();
    state.mapFeatureRedo = [];
    state.measurementLifecycleRedo = [];
    return true;
  }

  function clearMapFeatureHistory(scope) {
    if (!scope) {
      state.mapFeatureUndo = [];
      state.mapFeatureRedo = [];
      return;
    }
    state.mapFeatureUndo = state.mapFeatureUndo.filter(action => action.scope !== scope);
    state.mapFeatureRedo = state.mapFeatureRedo.filter(action => action.scope !== scope);
  }

  async function undoMapFeatureAction() {
    const action = state.mapFeatureUndo.pop();
    if (!action) return false;
    try {
      await action.undo();
      state.mapFeatureRedo.push(action);
      showToast(action.undoMessage || "Boundary restored.", "success");
    } catch (err) {
      state.mapFeatureUndo.push(action);
      showToast(`Unable to undo boundary hide: ${err.message}`);
    }
    return true;
  }

  async function redoMapFeatureAction() {
    const action = state.mapFeatureRedo.pop();
    if (!action) return false;
    try {
      await action.redo();
      state.mapFeatureUndo.push(action);
      showToast(action.redoMessage || "Boundary hidden.", "success");
    } catch (err) {
      state.mapFeatureRedo.push(action);
      showToast(`Unable to redo boundary hide: ${err.message}`);
    }
    return true;
  }

  async function undoMapChange() {
    const layer = state.measurementHistoryLayer;
    if (layer && measurementIsRetained(layer)) commitMeasurementHistory(layer);
    const measurementAction = state.measurementLifecycleUndo[state.measurementLifecycleUndo.length - 1] || null;
    const featureAction = state.mapFeatureUndo[state.mapFeatureUndo.length - 1] || null;
    if (!measurementAction && !featureAction) return false;
    if (featureAction && (!measurementAction || Number(featureAction.sequence || 0) > Number(measurementAction.sequence || 0))) return undoMapFeatureAction();
    return undoMeasurementLifecycleAction();
  }

  async function redoMapChange() {
    const layer = state.measurementHistoryLayer;
    if (layer && measurementIsRetained(layer)) commitMeasurementHistory(layer);
    const measurementAction = state.measurementLifecycleRedo[state.measurementLifecycleRedo.length - 1] || null;
    const featureAction = state.mapFeatureRedo[state.mapFeatureRedo.length - 1] || null;
    if (!measurementAction && !featureAction) return false;
    if (featureAction && (!measurementAction || Number(featureAction.sequence || 0) < Number(measurementAction.sequence || 0))) return redoMapFeatureAction();
    return redoMeasurementLifecycleAction();
  }



  function rebuildDistanceMeasurementMarkers(layer, points) {
    for (const marker of layer._measurementMarkers || []) {
      if (state.map.hasLayer(marker)) state.map.removeLayer(marker);
    }
    const editable = Boolean(layer._measurementEditing);
    const markers = points.map(point => createDistanceMeasurementMarker(point, layer, editable));
    layer._measurementMarkers = markers;
    if (state.measureLayer === layer) {
      state.measureMarkers = markers;
      state.measureHitLayer = ensureDistanceHitLayer(layer);
    } else {
      ensureDistanceHitLayer(layer);
    }
  }

  function forgetMeasurementHistory(layer) {
    if (!layer) return;
    const history = state.measurementHistories.get(layer);
    if (history?.timer) clearTimeout(history.timer);
    state.measurementHistories.delete(layer);
    if (state.measurementHistoryLayer === layer) state.measurementHistoryLayer = null;
  }

  function syncDistanceMarkersFromLayer(
    layer,
    syncHit = true
  ) {
    if (
      !layer ||
      layer._measurementMode !== "distance"
    ) {
      return;
    }

    const points =
      layer.getLatLngs().flat(Infinity);

    const markers =
      layer._measurementMarkers || [];

    if (markers.length !== points.length) {
      rebuildDistanceMeasurementMarkers(
        layer,
        points
      );
      syncDistanceMeasurementVisual(layer, syncHit);
      return;
    }

    markers.forEach((marker, index) =>
      marker.setLatLng(points[index])
    );

    syncDistanceMeasurementVisual(layer, syncHit);
  }

  function disableMeasurementMove(layer) {
    if (!layer) return;

    const handlers =
      layer._measurementMoveHandlers;

    if (handlers) {
      const {
        target,
        start,
        drag,
        end
      } = handlers;

      target.off("pm:dragstart", start);
      target.off("pm:drag", drag);
      target.off("pm:dragend", end);

      if (
        typeof target.pm?.disableLayerDrag ===
        "function"
      ) {
        target.pm.disableLayerDrag();
      }

      delete layer._measurementMoveHandlers;
    }

    layer._measurementMoveEnabled = false;
    layer._measurementMoving = false;

    if (state.measurementMoveLayer === layer) {
      state.measurementMoveLayer = null;
    }
  }

  function setMeasurementMoveMode(
    layer,
    enabled
  ) {
    if (!measurementIsRetained(layer)) return;

    if (!enabled) {
      disableMeasurementMove(layer);
      syncMeasurementMoveButton(layer);
      showToast("Whole-markup movement disabled.", "success");
      return;
    }

    if (
      state.measurementMoveLayer &&
      state.measurementMoveLayer !== layer
    ) {
      disableMeasurementMove(
        state.measurementMoveLayer
      );
    }

    if (layer._measurementEditing) {
      setMeasurementEditing(layer, false);
    }

    disableMeasurementMove(layer);

    const target =
      layer._measurementMode === "distance"
        ? ensureDistanceHitLayer(layer)
        : layer;

    if (
      !target ||
      typeof target.pm?.enableLayerDrag !==
        "function"
    ) {
      showToast(
        "Whole-markup movement is unavailable for this shape."
      );
      return;
    }

    ensureMeasurementHistory(layer);

    let distanceStartPoints = null;
    let distanceStartAnchor = null;
    let polygonStartLatLngs = null;
    let polygonStartAnchor = null;

    const start = () => {
      state.measurementHistoryLayer = layer;
      layer._measurementMoving = true;
      layer._measurementIgnoreClickUntil =
        Number.MAX_SAFE_INTEGER;

      if (layer._measurementMode === "distance" && target !== layer) {
        distanceStartPoints = layer.getLatLngs().flat(Infinity).map(point => L.latLng(point));
        const targetPoints = target.getLatLngs().flat(Infinity);
        distanceStartAnchor = targetPoints.length ? L.latLng(targetPoints[0]) : null;
      } else if (layer._measurementMode === "polygon" && target === layer) {
        polygonStartLatLngs = cloneLatLngTree(layer.getLatLngs());
        polygonStartAnchor = firstLatLngInTree(polygonStartLatLngs);
      }
    };

    const drag = () => {
      if (
        target !== layer &&
        layer._measurementMode === "distance" &&
        distanceStartPoints &&
        distanceStartAnchor
      ) {
        const targetPoints = target.getLatLngs().flat(Infinity);
        if (targetPoints.length) {
          const currentAnchor = L.latLng(targetPoints[0]);
          layer.setLatLngs(distanceStartPoints.map(point =>
            rigidMoveLatLngOnGlobe(point, distanceStartAnchor, currentAnchor)
          ));
        }
      } else if (
        target === layer &&
        layer._measurementMode === "polygon" &&
        polygonStartLatLngs &&
        polygonStartAnchor
      ) {
        const currentAnchor = firstLatLngInTree(layer.getLatLngs());
        if (currentAnchor) {
          const movedCanonical = unwrapMeasurementPolygonLatLngTree(rigidMoveLatLngTreeOnGlobe(
            polygonStartLatLngs,
            polygonStartAnchor,
            currentAnchor
          ));
          const movedFirst = firstLatLngInTree(movedCanonical);
          const dragWorldOffset = movedFirst
            ? Math.round((Number(currentAnchor.lng) - Number(movedFirst.lng)) / 360) * 360
            : 0;
          layer.setLatLngs(shiftedLatLngTreeLongitude(movedCanonical, dragWorldOffset));
          if (layer.redraw) layer.redraw();
        }
      }

      if (layer._measurementMode === "distance") {
        syncDistanceMarkersFromLayer(layer, false);
      }

      if (layer._measurementMode === "circle") syncCircleMeasurementWorldCopies(layer, false);
      if (layer._measurementMode === "polygon") syncPolygonMeasurementWorldCopies(layer, false);
      updateMeasurementTooltip(
        layer,
        layer._measurementMode
      );
    };

    const end = () => {
      drag();

      if (layer._measurementMode === "distance") {
        syncDistanceMeasurementVisual(layer, true);
      }

      if (layer._measurementMode === "circle") syncCircleMeasurementWorldCopies(layer, true);
      if (layer._measurementMode === "polygon") syncPolygonMeasurementWorldCopies(layer, true);
      distanceStartPoints = null;
      distanceStartAnchor = null;
      polygonStartLatLngs = null;
      polygonStartAnchor = null;
      layer._measurementMoving = false;
      layer._measurementIgnoreClickUntil =
        Date.now() + 500;

      commitMeasurementHistory(layer);

      if (layer._measurementLocked) {
        scheduleLockedMeasurementSave(layer);
      }
    };

    target.on("pm:dragstart", start);
    target.on("pm:drag", drag);
    target.on("pm:dragend", end);

    installLayerDragAutoPan(target);
    target.pm.enableLayerDrag();

    layer._measurementMoveHandlers = {
      target,
      start,
      drag,
      end
    };

    layer._measurementMoveEnabled = true;
    state.measurementMoveLayer = layer;

    syncMeasurementMoveButton(layer);
    syncMeasurementShapeConvertControl(layer);
    $("measurement-shape-convert-menu")?.classList.add("hidden");
    showToast("Whole-markup movement enabled.", "success");
  }

  function syncMeasurementMoveButton(

    layer = state.measureContextLayer
  ) {
    const button =
      $("measurement-context-move");

    if (!button) return;

    const active =
      Boolean(layer?._measurementMoveEnabled);

    button.classList.toggle(
      "active",
      active
    );

    button.setAttribute(
      "aria-pressed",
      active ? "true" : "false"
    );

    button.title = active
      ? "Disable move markup"
      : "Move whole markup";

    button.setAttribute(
      "aria-label",
      button.title
    );

    if (
      layer &&
      state.measureContextLayer === layer
    ) {
      $("measurement-context-edit").textContent =
        layer._measurementEditing
          ? "Finish editing"
          : "Edit markup";
    }
  }
  function removeMeasurementLayer(layer) {
    if (!layer) return;
    if (state.measureEditingLine === layer) {
      state.measureEditingLine = null;
      if (state.measureMode === "distance") state.measureMode = null; syncMarkupDrawInteractionMode();
    }
    cancelLockedMeasurementSave(layer);
    disableMeasurementMove(layer);
    forgetMeasurementHistory(layer);
    state.lockedMeasurements.delete(layer);
    state.temporaryMeasurements.delete(layer);
    disableMeasurementEditing(layer);
    detachMeasurementInteractions(layer);
    removeMeasurementTooltip(layer);
    clearCircleMeasurementWorldCopies(layer);
    clearPolygonMeasurementWorldCopies(layer);
    if (state.map?.hasLayer(layer)) state.map.removeLayer(layer);
    if (layer._measurementGeodesicLayer && state.map?.hasLayer(layer._measurementGeodesicLayer)) state.map.removeLayer(layer._measurementGeodesicLayer);
    if (layer._measurementHitLayer && state.map?.hasLayer(layer._measurementHitLayer)) state.map.removeLayer(layer._measurementHitLayer);
    for (const marker of layer._measurementMarkers || []) {
      if (state.map?.hasLayer(marker)) state.map.removeLayer(marker);
    }
    if (state.measureLayer === layer) {
      state.measureLayer = null;
      state.measureMarkers = [];
      state.measureHitLayer = null;
    }
    if (state.measureContextLayer === layer) state.measureContextLayer = null;
    delete layer._measurementMode;
    delete layer._measurementLocked;
    delete layer._measurementTooltipHidden;
    delete layer._measurementRecordId;
    delete layer._measurementHitLayer;
    delete layer._measurementGeodesicLayer;
    delete layer._measurementMarkers;
    delete layer._measurementSaveErrorShown;
    delete layer._measurementMoveEnabled;
    delete layer._measurementMoving;
    delete layer._measurementWrappedCopies;
    delete layer._measurementWorldOffset;
    delete layer._measurementCreationRecorded;
  }

  async function clearMeasurement(layer = state.measureLayer, {recordHistory = true} = {}) {
    if (!layer) return;
    if (recordHistory) commitMeasurementHistory(layer);
    const wasCurrent = state.measureLayer === layer;
    const recoverySnapshot = recordHistory ? measurementLifecycleSnapshot(layer) : null;
    if (layer._measurementLocked) {
      try {
        await deleteLockedMeasurementRecord(layer);
      } catch (err) {
        showToast(`Unable to clear locked markup: ${err.message}`);
        return;
      }
    }
    removeMeasurementLayer(layer);
    if (recordHistory && recoverySnapshot) pushMeasurementLifecycleAction([recoverySnapshot]);
    if (wasCurrent) state.measureMode = null; syncMarkupDrawInteractionMode();
    $("measurement-context-menu")?.classList.add("hidden");
  }

  async function fetchAllMeasurementRecords() {
    const records = [];
    let page = 1;
    while (true) {
      const data = await api(`/collections/measurements/records?page=${page}&perPage=500&sort=created`);
      records.push(...(data.items || []));
      if (!data.totalPages || page >= data.totalPages) break;
      page += 1;
    }
    return records;
  }

  async function clearAllMeasurements() {
    if (state.pendingMeasurementConversion) {
      showToast("Save or close POI conversion before clearing all markups.");
      return;
    }

    try { await state.elevationProfileSaveQueue; } catch {}
    if (state.measurementHistoryLayer && measurementIsRetained(state.measurementHistoryLayer)) commitMeasurementHistory(state.measurementHistoryLayer);
    const localLayers = allMeasurementLayers();
    const recoverySnapshots = new Map(localLayers.map(layer => [layer, measurementLifecycleSnapshot(layer)]));
    let records = [];
    try {
      records = await fetchAllMeasurementRecords();
    } catch (err) {
      showToast(`Unable to list locked markups: ${err.message}`);
      return;
    }

    const persistedIds = new Set(records.map(record => record.id));
    const markupCount = records.length + localLayers.filter(layer => !layer._measurementRecordId || !persistedIds.has(layer._measurementRecordId)).length;
    if (markupCount > 0) {
      const confirmed = window.confirm(markupCount === 1 ? "Clear 1 markup?" : `Clear all ${markupCount} markups?`);
      if (!confirmed) return;
    }

    for (const layer of localLayers) {
      if (layer._measurementLocked) cancelLockedMeasurementSave(layer);
    }
    await Promise.all(localLayers.filter(layer => layer._measurementLocked).map(waitForLockedMeasurementSave));

    const failedIds = new Set();
    for (const record of records) {
      try {
        await api(`/collections/measurements/records/${record.id}`, {method: "DELETE"});
      } catch (err) {
        if (err.status !== 404) {
          void 0;
          failedIds.add(record.id);
        }
      }
    }

    let removedLocal = 0;
    const removedSnapshots = [];
    for (const layer of localLayers) {
      if (layer._measurementLocked && failedIds.has(layer._measurementRecordId)) continue;
      const recoverySnapshot = recoverySnapshots.get(layer);
      removeMeasurementLayer(layer);
      if (recoverySnapshot) removedSnapshots.push(recoverySnapshot);
      removedLocal += 1;
    }
    if (removedSnapshots.length) pushMeasurementLifecycleAction(removedSnapshots);

    state.elevationProfiles = records
      .filter(record => record.type === "elevation" && failedIds.has(record.id))
      .map(elevationProfileFromRecord)
      .filter(Boolean);
    window.FAElevation?.reloadPersistedProfiles?.();

    state.measureMode = null; syncMarkupDrawInteractionMode();
    state.measureWorkingLayer = null;
    state.measureStartLatLng = null;
    $("measurement-context-menu")?.classList.add("hidden");
    state.measureContextLayer = null;

    if (failedIds.size) {
      showToast(`${failedIds.size} locked markup${failedIds.size === 1 ? "" : "s"} could not be cleared.`);
    } else if (records.length || removedLocal) {
      showToast("All markups cleared.", "success");
    } else {
      showToast("No markups to clear.");
    }
  }

  function measurementTooltipHtml(rows) {
    return rows.map(([label, value]) => `<div class="measurement-row"><span class="measurement-title">${label}</span><span class="measurement-value">${value}</span></div>`).join("");
  }

  function syncMeasurementNodeColor(marker, color) {
    if (!marker) return;
    const markerColor = validPoiColor(color) || state.poiColor;
    marker._measurementNodeColor = markerColor;
    const apply = () => marker.getElement?.()?.style.setProperty("--measurement-color", marker._measurementNodeColor);
    apply();
    requestAnimationFrame(apply);
  }

  function distanceMeasurementMarkerIcon() {
    return L.divIcon({
      className: "measurement-node-icon",
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
  }

  function syncDistanceMeasurementDragVisual(layer) {
    if (!layer || layer._measurementMode !== "distance") return;
    const markers = Array.isArray(layer._measurementMarkers) ? layer._measurementMarkers : [];
    const points = markers.map(marker => distanceMeasurementCanonicalMarkerPoint(marker)).filter(Boolean);
    if (points.length < 2) return;

    layer.setLatLngs(points);
    const visual = layer._measurementGeodesicLayer;
    if (visual) visual.setLatLngs(distanceMeasurementWrappedGeodesicLatLngs(points, 96, true));
    updateMeasurementTooltip(layer, "distance");
  }

  function syncDistanceMeasurementLayer(layer) {
    if (!layer || layer._measurementMode !== "distance") return;
    const markers = Array.isArray(layer._measurementMarkers) ? layer._measurementMarkers : [];
    const points = markers.map(marker => distanceMeasurementCanonicalMarkerPoint(marker)).filter(Boolean);
    if (points.length < 2) {
      if (measurementIsRetained(layer) && !layer._measurementLocked) removeMeasurementLayer(layer);
      return;
    }
    layer.setLatLngs(points);
    syncDistanceMeasurementVisual(layer, true);
    updateMeasurementTooltip(layer, "distance");
  }

  function syncDistanceMeasurement() {
    const points = state.measureMarkers.map(marker => distanceMeasurementCanonicalMarkerPoint(marker)).filter(Boolean);
    if (points.length < 2) {
      if (state.measureLayer) removeMeasurementLayer(state.measureLayer);
      state.measureLayer = null;
      state.measureHitLayer = null;
      return;
    }

    if (!state.measureLayer) {
      const color = validPoiColor(state.measurePendingColor) || state.poiColor;
      const layer = L.polyline(points, {
        color,
        weight: 2,
        opacity: 0,
        fillOpacity: 0,
        interactive: false,
        bubblingMouseEvents: false,
        snapIgnore: true
      }).addTo(state.map);
      layer._measurementMode = "distance";
      layer._measurementLocked = false;
      layer._measurementTooltipHidden = false;
      layer._measurementEditing = true;
      layer._measurementMarkers = state.measureMarkers;
      state.measureLayer = layer;
      for (const marker of state.measureMarkers) {
        marker._measurementLayer = layer;
        syncMeasurementNodeColor(marker, color);
      }
      syncDistanceMeasurementVisual(layer, false);
      const hit = ensureDistanceHitLayer(layer);
      state.measureHitLayer = hit;
      attachMeasurementInteractions(layer);
      ensureMeasurementHistory(layer);
      pushMeasurementCreationAction(layer);
      if (state.markupShapeConversion?.target === "line-normal") {
        state.markupShapeConversion = null;
        showToast("Converted to line markup.", "success");
      }
    } else {
      state.measureLayer._measurementMarkers = state.measureMarkers;
      for (const marker of state.measureMarkers) {
        marker._measurementLayer = state.measureLayer;
        syncMeasurementNodeColor(marker, validPoiColor(state.measureLayer.options?.color) || state.poiColor);
      }
      state.measureLayer.setLatLngs(points);
      const color = validPoiColor(state.measureLayer.options?.color) || state.poiColor;
      state.measureLayer.setStyle({color, opacity: 0});
      syncDistanceMeasurementVisual(state.measureLayer, true);
      const hit = ensureDistanceHitLayer(state.measureLayer);
      state.measureHitLayer = hit;
      hit.setStyle({color});
    }
    updateMeasurementTooltip(state.measureLayer, "distance");
  }

  function removeDistanceMeasurementPoint(marker, event) {
    if (event?.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
    if (marker._measurementDragging || (marker._measureIgnoreClickUntil || 0) > Date.now()) return;
    const layer = marker._measurementLayer || state.measureLayer;
    if (!layer) return;
    if (layer._measurementLocked && !layer._measurementEditing) {
      showToast("Markup locked.");
      return;
    }
    const markers = layer._measurementMarkers || state.measureMarkers;
    const index = markers.indexOf(marker);
    if (index < 0) return;
    if (markers.length <= 2) {
      showToast("Distance markup needs at least two points.");
      return;
    }
    ensureMeasurementHistory(layer);
    markers.splice(index, 1);
    if (state.map.hasLayer(marker)) state.map.removeLayer(marker);
    if (layer === state.measureLayer) {
      state.measureMarkers = markers;
      syncDistanceMeasurement();
    } else {
      syncDistanceMeasurementLayer(layer);
    }
    commitMeasurementHistory(layer);
    if (layer._measurementLocked) scheduleLockedMeasurementSave(layer);
  }

  function addDistanceMeasurementPoint(latlng, targetLayer = state.measureEditingLine) {
    if (!latlng || state.measureMode !== "distance") return;

    if (targetLayer) {
      if (!measurementIsRetained(targetLayer) || targetLayer._measurementMode !== "distance") {
        if (state.measureEditingLine === targetLayer) state.measureEditingLine = null;
        return;
      }
      ensureMeasurementHistory(targetLayer);
      const marker = createDistanceMeasurementMarker(latlng, targetLayer, true);
      const markers = targetLayer._measurementMarkers || [];
      markers.push(marker);
      targetLayer._measurementMarkers = markers;
      marker._measurementLayer = targetLayer;
      syncDistanceMeasurementLayer(targetLayer);
      commitMeasurementHistory(targetLayer);
      if (targetLayer._measurementLocked) scheduleLockedMeasurementSave(targetLayer);
      return;
    }

    const currentHistoryLayer = state.measureLayer;
    if (currentHistoryLayer) ensureMeasurementHistory(currentHistoryLayer);
    const marker = createDistanceMeasurementMarker(latlng, state.measureLayer, true);
    state.measureMarkers.push(marker);
    if (state.measureLayer) {
      marker._measurementLayer = state.measureLayer;
      state.measureLayer._measurementMarkers = state.measureMarkers;
    }
    syncDistanceMeasurement();
    if (currentHistoryLayer && state.measureLayer === currentHistoryLayer) commitMeasurementHistory(currentHistoryLayer);
    else if (state.measureLayer) ensureMeasurementHistory(state.measureLayer);
  }

  function updateMeasurementTooltip(layer, mode, cursorLatLng = null) {
    if (!layer) return;
    if (layer._measurementTooltipHidden) {
      removeMeasurementTooltip(layer);
      return;
    }
    let text = "";
    let position = null;

    if (mode === "marker" && layer instanceof L.Marker) {
      if (!state.showMeasurementMarkerCoordinates) { removeMeasurementTooltip(layer); return; }
      const point = layer.getLatLng();
      text = measurementTooltipHtml([["COORDINATES", formatCoordinates(point.lat, point.lng)]]);
      position = point;
    } else if (mode === "distance" && typeof layer.getLatLngs === "function") {
      const points = layer.getLatLngs().flat(Infinity).filter(point => point && Number.isFinite(point.lat));
      if (points.length >= 2) {
        let totalMeters = 0;
        for (let i = 1; i < points.length; i += 1) totalMeters += state.map.distance(points[i - 1], points[i]);
        const lastPoint = points[points.length - 1];
        const previousPoint = points[points.length - 2];
        const bearing = formatMeasurementBearing(previousPoint, lastPoint);
        const rows = [];
        if (state.showMeasurementLineDistance) rows.push(["DISTANCE", formatMeasuredDistance(totalMeters)]);
        if (state.showMeasurementLineBearing && bearing) rows.push(["BEARING (LAST POINT)", bearing]);
        text = measurementTooltipHtml(rows);
        const tooltipOffset = measurementNearestWorldOffset(lastPoint.lng);
        position = L.latLng(lastPoint.lat, normalizeMeasurementLongitude(lastPoint.lng) + tooltipOffset, lastPoint.alt);
      }
    } else if (mode === "polygon" && typeof layer.getLatLngs === "function") {
      if (cursorLatLng) {
        removeMeasurementTooltip(layer);
        return;
      }
      const canonical = polygonMeasurementCanonicalLatLngs(layer);
      const points = canonical.flat(Infinity).filter(point => point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)));
      if (points.length >= 3) {
        const rows = [];
        if (state.showMeasurementPolygonArea) rows.push(["AREA", formatPolygonArea(polygonAreaMeters(layer))]);
        if (state.showMeasurementPolygonPerimeter) rows.push(["PERIMETER", formatMeasuredDistance(polygonPerimeterMeters(layer))]);
        text = measurementTooltipHtml(rows);
        const center = polygonMeasurementReferenceLatLng(canonical);
        if (center) {
          const tooltipOffset = polygonMeasurementNearestWorldOffset(center.lng);
          position = L.latLng(center.lat, center.lng + tooltipOffset, center.alt);
        }
      }
    } else if (mode === "circle" && layer instanceof L.Circle) {
      const radius = layer.getRadius();
      if (!Number.isFinite(radius) || radius <= 0) {
        removeMeasurementTooltip(layer);
        return;
      }
      const rows = [];
      if (state.showMeasurementCircleDiameter) rows.push(["DIAMETER", formatMeasuredDistance(radius * 2)]);
      if (state.showMeasurementCircleRadius) rows.push(["RADIUS", formatMeasuredDistance(radius)]);
      if (state.showMeasurementCircleArea) rows.push(["AREA", formatPolygonArea(circleAreaMeters(layer))]);
      if (state.showMeasurementCircleCircumference) rows.push(["CIRCUMFERENCE", formatMeasuredDistance(circleCircumferenceMeters(layer))]);
      text = measurementTooltipHtml(rows);
      const center = circleMeasurementCanonicalCenter(layer) || layer.getLatLng();
      const tooltipOffset = measurementNearestWorldOffset(center.lng);
      position = L.latLng(center.lat, center.lng + tooltipOffset, center.alt);
    }

    if (!text || !position) {
      removeMeasurementTooltip(layer);
      return;
    }

    if (!layer._measurementTooltip) {
      layer._measurementTooltip = L.tooltip({
        permanent: true,
        direction: "top",
        offset: L.point(0, -8),
        className: "measurement-tooltip",
        opacity: 1
      }).setLatLng(position).setContent(text).addTo(state.map);
    } else {
      layer._measurementTooltip.setLatLng(position).setContent(text);
      if (!state.map.hasLayer(layer._measurementTooltip)) layer._measurementTooltip.addTo(state.map);
    }
  }

  function registerMeasurementLayer(layer, mode, {locked = false, temporary = false, tooltipHidden = false, color = null, editable = false, recordId = null} = {}) {
    if (!layer) return null;
    if (!layer._measurementHistoryId) layer._measurementHistoryId = newMeasurementHistoryId();
    layer._measurementMode = mode;
    if (mode === "polygon") preservePolygonMeasurementVertices(layer);
    layer._measurementLocked = Boolean(locked);
    layer._measurementTooltipHidden = Boolean(tooltipHidden);
    layer._measurementEditing = false;
    if (layer._measurementMode === "distance") syncDistanceMeasurementVisual(layer, true);
    if (layer._measurementMode === "circle" && layer instanceof L.Circle) syncCircleMeasurementWorldCopies(layer);
    layer._measurementMoveEnabled = false;
    layer._measurementRecordId = locked ? recordId : null;
    if (layer.options) layer.options.bubblingMouseEvents = false;
    if (mode === "marker" && layer instanceof L.Marker) {
      layer._measurementLabel = String(layer._measurementLabel || "").trim() || nextMarkerMarkupLabel();
      layer.options.riseOnHover = false;
      const markerColor = validPoiColor(color || layer.options?.color) || state.poiColor;
      layer.options.color = markerColor;
      layer.setIcon(markupMarkerIcon(layer._measurementLabel || nextMarkerMarkupLabel(), markerColor));
    }
    if (layer instanceof L.Path) {
      layer.setStyle({
        color: validPoiColor(color || layer.options?.color) || state.poiColor,
        weight: 2,
        fillOpacity: mode === "distance" ? 0 : state.fillOpacity
      });
    }
    if (!state.map.hasLayer(layer)) layer.addTo(state.map);
    if (mode === "polygon" && layer instanceof L.Polygon) syncPolygonMeasurementWorldCopies(layer, true);
    if (locked) state.lockedMeasurements.add(layer);
    else if (temporary) state.temporaryMeasurements.add(layer);
    else state.measureLayer = layer;
    if (mode === "distance") {
      syncDistanceMeasurementVisual(layer, false);
      if (state.measureLayer === layer) {
        state.measureMarkers = layer._measurementMarkers || [];
        state.measureHitLayer = ensureDistanceHitLayer(layer);
      }
    }
    attachMeasurementInteractions(layer);
    updateMeasurementTooltip(layer, mode);
    if (editable && mode !== "marker") setMeasurementEditing(layer, true);
    return layer;
  }

  function finalizeMarkerMeasurement(latlng) {
    if (!latlng || state.measureMode !== "marker") return;
    const color = validPoiColor(state.measurePendingColor) || state.poiColor;
    const label = String(state.measurePendingMarkerLabel || "").trim() || nextMarkerMarkupLabel();
    clearMarkerMeasurementPreview();
    const marker = L.marker(latlng, {
      icon: markupMarkerIcon(label, color),
      color,
      keyboard: false,
      riseOnHover: false,
      bubblingMouseEvents: false
    });
    marker._measurementLabel = label;
    const registered = registerMeasurementLayer(marker, "marker", {locked: false, temporary: false, color});
    state.measureMode = null; syncMarkupDrawInteractionMode();
    state.measurePendingColor = null;
    state.measurePendingMarkerLabel = "";
    state.measureStartLatLng = null;
    if (registered) {
      state.markupMarkerNextIndex += 1;
      pushMeasurementCreationAction(registered);
    }
  }

  function finalizeMeasurement(layer, mode) {
    const registered = registerMeasurementLayer(layer, mode, {locked: false, temporary: false});
    if (registered) pushMeasurementCreationAction(registered);
  }

  async function setMeasurementLocked(layer, locked) {
    if (!measurementIsRetained(layer)) return;
    commitMeasurementHistory(layer);
    const transactionBefore = captureMeasurementState();
    resetMeasurementHistoryTracking();

    if (locked) {
      if (layer._measurementLocked) return;
      try {
        await createLockedMeasurementRecord(layer);
      } catch (err) {
        showToast(`Unable to lock markup: ${err.message}`);
        return;
      }

      state.temporaryMeasurements.delete(layer);
      layer._measurementLocked = true;
      state.lockedMeasurements.add(layer);
      if (state.measureLayer === layer) {
        if (layer._measurementMode === "distance") {
          layer._measurementMarkers = state.measureMarkers;
          layer._measurementHitLayer = state.measureHitLayer || layer._measurementHitLayer;
        }
        state.measureLayer = null;
        state.measureMarkers = [];
        state.measureHitLayer = null;
        state.measureMode = null; syncMarkupDrawInteractionMode();
      }
      setMeasurementEditing(layer, false);
      attachMeasurementInteractions(layer);
      pushMeasurementTransaction(transactionBefore, captureMeasurementState());
      showToast("Markup locked.", "success");
      return;
    }

    if (!layer._measurementLocked) return;
    try {
      await deleteLockedMeasurementRecord(layer);
    } catch (err) {
      showToast(`Unable to unlock markup: ${err.message}`);
      return;
    }

    state.lockedMeasurements.delete(layer);
    layer._measurementLocked = false;
    layer._measurementRecordId = null;
    state.temporaryMeasurements.add(layer);
    attachMeasurementInteractions(layer);
    pushMeasurementTransaction(transactionBefore, captureMeasurementState());
    showToast("Markup unlocked.", "success");
  }

  function toggleMeasurementTooltip(layer) {
    if (!measurementIsRetained(layer)) return;
    commitMeasurementHistory(layer);
    const transactionBefore = captureMeasurementState();
    resetMeasurementHistoryTracking();
    layer._measurementTooltipHidden = !layer._measurementTooltipHidden;
    if (layer._measurementTooltipHidden) removeMeasurementTooltip(layer);
    else updateMeasurementTooltip(layer, layer._measurementMode);
    if (layer._measurementLocked) scheduleLockedMeasurementSave(layer);
    pushMeasurementTransaction(transactionBefore, captureMeasurementState());
  }

  function cloneMeasurementLayer(layer) {
    if (!layer) return null;
    const color = validPoiColor(layer.options?.color) || state.poiColor;
    if (layer._measurementMode === "marker" && layer instanceof L.Marker) {
      const label = String(layer._measurementLabel || "").trim() || nextMarkerMarkupLabel();
      const copy = L.marker(layer.getLatLng(), {icon: markupMarkerIcon(label, color), color, keyboard: false, riseOnHover: false, bubblingMouseEvents: false});
      copy._measurementLabel = label;
      return copy;
    }
    if (layer._measurementMode === "circle" && layer instanceof L.Circle) {
      return L.circle(circleMeasurementCanonicalCenter(layer) || layer.getLatLng(), {radius: layer.getRadius(), color, weight: 2, fillOpacity: state.fillOpacity});
    }
    if (layer._measurementMode === "polygon" && layer instanceof L.Polygon) {
      return preservePolygonMeasurementVertices(L.polygon([], {color, weight: 2, fillOpacity: state.fillOpacity})).setLatLngs(cloneLatLngTree(layer.getLatLngs()));
    }
    if (layer._measurementMode === "distance") {
      return L.polyline(cloneLatLngTree(layer.getLatLngs()), {color, weight: 2, fillOpacity: 0, interactive: true, bubblingMouseEvents: false, snapIgnore: true});
    }
    return null;
  }

  async function duplicateMeasurement(layer) {
    if (!measurementIsRetained(layer)) return;
    commitMeasurementHistory(layer);
    const duplicate = cloneMeasurementLayer(layer);
    if (!duplicate) return;
    const mode = layer._measurementMode;
    if (mode === "marker" && duplicate instanceof L.Marker) {
      duplicate._measurementLabel = consumeMarkerMarkupLabel();
      duplicate.setIcon(markupMarkerIcon(duplicate._measurementLabel, validPoiColor(layer.options?.color) || state.poiColor));
    }
    duplicate._measurementMode = mode;
    duplicate._measurementTooltipHidden = Boolean(layer._measurementTooltipHidden);

    if (mode === "distance") {
      duplicate._measurementMarkers = duplicate.getLatLngs().map(point => createDistanceMeasurementMarker(point, duplicate, true));
      duplicate._measurementHitLayer = null;
    }

    registerMeasurementLayer(duplicate, mode, {
      locked: false,
      temporary: true,
      tooltipHidden: Boolean(layer._measurementTooltipHidden),
      color: layer.options?.color || state.poiColor,
      editable: mode !== "distance" && mode !== "marker",
      recordId: null
    });

    if (mode === "distance") {
      for (const marker of duplicate._measurementMarkers) marker._measurementLayer = duplicate;
      ensureDistanceHitLayer(duplicate);
      setMeasurementEditing(duplicate, true);
    }

    pushMeasurementCreationAction(duplicate);
    showToast(mode === "marker" ? "Marker duplicated." : "Markup duplicated.", "success");
  }

  function measurementFromRecord(record) {
    if (!record || typeof record !== "object") return null;
    const mode = record.type;
    const color = validPoiColor(record.color) || state.poiColor;

    if (mode === "marker") {
      const lat = Number(record.center?.lat ?? record.center?.[1]);
      const lon = Number(record.center?.lon ?? record.center?.lng ?? record.center?.[0]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const label = String(record.label || "").trim() || nextMarkerMarkupLabel();
      const marker = L.marker([lat, lon], {icon: markupMarkerIcon(label, color), color, keyboard: false, riseOnHover: false, bubblingMouseEvents: false});
      marker._measurementLabel = label;
      return marker;
    }

    if (mode === "circle") {
      const lat = Number(record.center?.lat ?? record.center?.[1]);
      const lon = Number(record.center?.lon ?? record.center?.lng ?? record.center?.[0]);
      const radius = Number(record.radius_m);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radius) || radius <= 0) return null;
      return L.circle([lat, lon], {radius, color, weight: 2, fillOpacity: state.fillOpacity});
    }

    if ((mode === "polygon" || mode === "distance") && record.geometry) {
      const layer = L.geoJSON(record.geometry, {
        style: {color, weight: 2, fillOpacity: mode === "distance" ? 0 : state.fillOpacity}
      }).getLayers()[0];
      if (mode === "polygon" && layer instanceof L.Polygon) {
        preservePolygonMeasurementVertices(layer);
        layer.setLatLngs(unwrapMeasurementPolygonLatLngTree(layer.getLatLngs()));
        if (layer.redraw) layer.redraw();
        return layer;
      }
      if (mode === "distance" && layer instanceof L.Polyline && !(layer instanceof L.Polygon)) return layer;
    }

    return null;
  }

  async function loadLockedMeasurements() {
    if (!state.map) return;

    for (const existing of [...state.lockedMeasurements]) removeMeasurementLayer(existing);
    state.lockedMeasurements.clear();

    try {
      const records = await fetchAllMeasurementRecords();
      await syncLockedMarkerLabels(records);
      await migrateLegacyElevationProfiles(records);
      state.elevationProfiles = records.map(elevationProfileFromRecord).filter(Boolean);

      for (const record of records) {
        if (record.type === "elevation") continue;
        const layer = measurementFromRecord(record);
        if (!layer) {
          void 0;
          continue;
        }

        if (record.type === "distance") {
          layer._measurementMode = "distance";
          layer._measurementMarkers = layer.getLatLngs().flat(Infinity).map(point => createDistanceMeasurementMarker(point, layer, false));
        }

        registerMeasurementLayer(layer, record.type, {
          locked: true,
          tooltipHidden: Boolean(record.tooltip_hidden),
          color: record.color,
          editable: false,
          recordId: record.id
        });
      }
      window.FAElevation?.reloadPersistedProfiles?.();
    } catch (err) {
      void 0;
      throw err;
    }
  }

  function startMeasurement(mode, options = {}) {
    if (state.measureEditingLine) setMeasurementEditing(state.measureEditingLine, false);
    hideMapContextMenu();
    if (!$("editor").classList.contains("hidden")) {
      showToast("Close POI editor before starting a markup.");
      return;
    }

    // Only the ordinary current measurement is replaced. Measurements that were
    // explicitly unlocked from browser storage remain as temporary retained layers.
    if (state.measureLayer) {
      commitMeasurementHistory(state.measureLayer);
      if (!state.measurementReplacementBefore) state.measurementReplacementBefore = captureMeasurementState();
      clearMeasurement(state.measureLayer, {recordHistory: false});
    }

    clearMarkerMeasurementPreview();
    state.measurePendingColor = validPoiColor(options.color) || nextMarkupColor();
    state.map.pm.disableDraw();
    removeMeasurementTooltip(state.measureWorkingLayer);
    state.measureWorkingLayer = null;
    state.measureMode = mode; syncMarkupDrawInteractionMode();
    state.measurePendingMarkerLabel = mode === "marker" ? nextMarkerMarkupLabel() : "";
    if (mode === "marker") {
      const previewPoint = state.measureStartLatLng || state.lastCursor || state.map.getCenter();
      state.measureStartLatLng = null;
      const color = validPoiColor(state.measurePendingColor) || state.poiColor;
      state.measureMarkerPreview = L.marker(previewPoint, {
        icon: markerIcon({color}),
        interactive: false,
        keyboard: false,
        opacity: 0.78,
        zIndexOffset: 2500
      }).addTo(state.map);
      state.measureMarkerPreview._measurementPreviewLabel = "";
      syncMarkerMeasurementPreviewIcon();
      requestAnimationFrame(syncMarkerMeasurementPreviewIcon);
      return;
    }
    if (mode === "distance") {
      const firstPoint = state.measureStartLatLng;
      state.measureStartLatLng = null;
      if (firstPoint) addDistanceMeasurementPoint(firstPoint);
      return;
    }
    state.measureStartLatLng = null;
    const shape = mode === "polygon" ? "Polygon" : "Circle";
    const color = validPoiColor(state.measurePendingColor) || state.poiColor;
    state.map.pm.enableDraw(shape, {
      templineStyle: {color, weight: 2, fillOpacity: state.fillOpacity},
      hintlineStyle: {color, weight: 2, dashArray: "5,5"},
      pathOptions: {color, weight: 2, fillOpacity: state.fillOpacity}
    });
  }

  function changeMeasurementColor(layer, color) {
    if (!measurementIsRetained(layer) || !layer.options) return false;
    const nextColor = validPoiColor(color);
    if (!nextColor) return false;

    const before = captureMeasurementState();
    layer.options.color = nextColor;

    if (layer._measurementMode === "marker" && layer instanceof L.Marker) {
      layer.setIcon(markupMarkerIcon(
        layer._measurementLabel || nextMarkerMarkupLabel(),
        nextColor
      ));
    } else {
      if (typeof layer.setStyle === "function") {
        layer.setStyle({color: nextColor, fillColor: nextColor});
      }

      if (layer._measurementMode === "circle" && layer instanceof L.Circle) {
        syncCircleMeasurementWorldCopies(layer, false);
      } else if (
        layer._measurementMode === "polygon" &&
        layer instanceof L.Polygon
      ) {
        syncPolygonMeasurementWorldCopies(layer, false);

        if (layer._measurementEditing) {
          state.map?.getContainer?.().style.setProperty(
            "--polygon-measurement-color", nextColor
          );
        }

        for (const marker of polygonMeasurementVertexMarkers(layer)) {
          syncMeasurementNodeColor(marker, nextColor);
        }
      } else if (layer._measurementMode === "distance") {
        syncDistanceMeasurementVisual(layer, true);
        const hit = ensureDistanceHitLayer(layer);
        if (hit) hit.setStyle({color: nextColor});

        for (const marker of layer._measurementMarkers || []) {
          syncMeasurementNodeColor(marker, nextColor);
        }
      }
    }

    syncActiveGeometryHandleTheme();

    if (layer._measurementLocked) {
      scheduleLockedMeasurementSave(layer);
    }

    if (!layer._measurementTooltipHidden) {
      updateMeasurementTooltip(layer, layer._measurementMode);
    }

    const after = captureMeasurementState();
    pushMeasurementTransaction(before, after, {kind: "color"});
    rebaselineActiveMeasurementHistories(after);
    return true;
  }

  function showMeasurementContextMenu(event, layer) {
    hideContextClickMarker();
    hideImageryInfoTooltip();
    if (!measurementIsRetained(layer)) return;
    $("current-location-context-menu").classList.add("hidden");
    if (event?.originalEvent) {
      event.originalEvent.preventDefault();
      L.DomEvent.stopPropagation(event.originalEvent);
    }
    $("map-context-menu").classList.add("hidden");
    $("poi-context-menu").classList.add("hidden");
    $("context-add-menu").classList.add("hidden");
    state.poiContextId = null;
    state.measureContextLayer = layer;
    ensureMeasurementHistory(layer);
    const resequenceButton = $("measurement-context-resequence");
    if (resequenceButton && layer._measurementMode === "marker") {
      const markerCount = typeof markerMarkupLayersInSequence === "function" ? markerMarkupLayersInSequence().length : 0;
      resequenceButton.textContent = markerCount === 1 ? "Resequence marker" : "Resequence markers";
    }

    const contextNoun = layer._measurementMode === "marker" ? "marker" : "markup";
    $("measurement-context-lock").textContent = layer._measurementLocked ? `Unlock ${contextNoun}` : `Lock ${contextNoun}`;
    $("measurement-context-tooltip").textContent = layer._measurementTooltipHidden ? `Show ${contextNoun} tooltip` : `Hide ${contextNoun} tooltip`;
    $("measurement-context-edit").textContent = layer._measurementEditing ? "Finish editing" : "Edit markup";
    $("measurement-context-edit").classList.toggle("hidden", layer._measurementMode === "marker");
    $("measurement-context-duplicate").textContent = layer._measurementMode === "marker" ? "Duplicate marker" : "Duplicate markup";
    if (resequenceButton) {
      const markerContext = layer._measurementMode === "marker";
      const wouldChange = markerContext && markerResequenceWouldChange();
      resequenceButton.classList.toggle("hidden", !markerContext);
      resequenceButton.disabled = !wouldChange;
      resequenceButton.style.color = wouldChange ? "" : "#666d74";
      resequenceButton.style.opacity = wouldChange ? "" : "0.55";
      resequenceButton.style.cursor = wouldChange ? "" : "default";
      resequenceButton.title = wouldChange ? "Resequence marker letters" : "Marker letters are already sequenced";
      resequenceButton.setAttribute("aria-disabled", String(!wouldChange));
    }
    $("measurement-context-clear").textContent = layer._measurementMode === "marker" ? "Clear marker" : "Clear markup";
    $("measurement-context-convert").classList.toggle("hidden", layer._measurementMode === "distance");
    $("measurement-context-clear-all").disabled = !hasAnyMeasurements();
    syncMeasurementMoveButton(layer);
    syncMeasurementShapeConvertControl(layer);
    $("measurement-shape-convert-menu")?.classList.add("hidden");
    const colorMenu = $("measurement-context-color-menu");
    colorMenu?.classList.add("hidden");
    $("measurement-context-color")?.setAttribute("aria-expanded", "false");

    const currentColor = validPoiColor(layer.options?.color) || state.poiColor;
    colorMenu?.querySelectorAll("[data-measurement-color]").forEach(swatch => {
      const selected =
        String(swatch.dataset.measurementColor).toLowerCase() ===
        currentColor.toLowerCase();
      swatch.classList.toggle("is-selected", selected);
      swatch.setAttribute("aria-pressed", String(selected));
    });

    const menu = $("measurement-context-menu");
    menu.classList.remove("hidden");
    let fallback = null;
    if (layer instanceof L.Circle) fallback = layer.getLatLng();
    else if (layer instanceof L.Marker) fallback = layer.getLatLng();
    else if (typeof layer.getBounds === "function") fallback = layer.getBounds().getCenter();
    positionContextMenu(menu, event, fallback, 54);
  }

  function restorePendingMeasurementConversion() {
    const conversion = state.pendingMeasurementConversion;
    if (!conversion) return false;

    const source = conversion.sourceLayer;
    const pending = state.pendingLayer;
    if (pending) removeLayerAndCenter(pending);
    state.pendingLayer = null;

    if (source && !state.map.hasLayer(source)) source.addTo(state.map);
    if (source?._measurementMode === "polygon") syncPolygonMeasurementWorldCopies(source, true);
    if (source) {
      attachMeasurementInteractions(source);
      updateMeasurementTooltip(source, source._measurementMode);
      if (conversion.sourceWasEditing) setMeasurementEditing(source, true);
    }

    state.pendingMeasurementConversion = null;
    return true;
  }

  async function finalizePendingMeasurementConversion() {
    const conversion = state.pendingMeasurementConversion;
    if (!conversion) return;

    const source = conversion.sourceLayer;
    if (source?._measurementLocked) {
      try {
        await deleteLockedMeasurementRecord(source);
      } catch (err) {
        if (source && !state.map.hasLayer(source)) source.addTo(state.map);
        attachMeasurementInteractions(source);
        updateMeasurementTooltip(source, source._measurementMode);
        state.pendingMeasurementConversion = null;
        showToast(`POI saved, but the original locked markup could not be removed: ${err.message}`);
        return;
      }
    }

    removeMeasurementLayer(source);
    state.pendingMeasurementConversion = null;
  }

  async function convertMeasurementToPoi(layer = state.measureContextLayer) {
    if (!measurementIsRetained(layer) || !(layer instanceof L.Marker || layer instanceof L.Circle || layer instanceof L.Polygon)) return;
    if (state.pendingLayer) {
      showToast("Save, Delete, or Close current unsaved POI first.");
      return;
    }
    if (!$("editor").classList.contains("hidden") && !closeEditorWithPrompt()) return;

    hideMapContextMenu();

    const poiLayer = layer._measurementMode === "marker" && layer instanceof L.Marker
      ? L.marker(layer.getLatLng(), {icon: markerIcon({}), keyboard: false})
      : cloneMeasurementLayer(layer);
    if (!poiLayer) return;

    state.pendingMeasurementConversion = {
      sourceLayer: layer,
      sourceWasEditing: Boolean(layer._measurementEditing)
    };

    disableMeasurementEditing(layer);
    removeMeasurementTooltip(layer);
    clearCircleMeasurementWorldCopies(layer);
    clearPolygonMeasurementWorldCopies(layer);
    if (state.map.hasLayer(layer)) state.map.removeLayer(layer);

    state.measureContextLayer = null;

    state.measureMode = null; syncMarkupDrawInteractionMode();
    state.measureWorkingLayer = null;
    state.measureStartLatLng = null;

    state.pendingLayer = poiLayer;
    bindLayerClicks(poiLayer, null);
    applyLayerPresentation(poiLayer, {});
    await openEditor(null, poiLayer);
  }

  function elevationProfilePointOnSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return L.point(a.x, a.y);
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    return L.point(a.x + dx * t, a.y + dy * t);
  }

  function elevationProfileDestination(center, bearingDegrees, distanceMeters) {
    const radius = 6371008.8;
    const delta = Math.max(0, Number(distanceMeters) || 0) / radius;
    const theta = bearingDegrees * Math.PI / 180;
    const phi1 = center.lat * Math.PI / 180;
    const lambda1 = center.lng * Math.PI / 180;
    const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
    const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
    const lambda2 = lambda1 + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2));
    return L.latLng(phi2 * 180 / Math.PI, ((lambda2 * 180 / Math.PI + 540) % 360) - 180);
  }

  function elevationProfileSnapLatLng(latlng, maxDistance = 20, ignoreLayer = null, preview = false) {
    if (!state.map || !latlng) return latlng;
    const cursorPoint = state.map.latLngToContainerPoint(latlng);
    let bestLatLng = null;
    let bestDistance = Math.max(0, Number(maxDistance) || 20);
    let bestLayer = null;

    const considerLatLng = (candidate, sourceLayer = null) => {
      if (!candidate) return;
      const candidateLatLng = L.latLng(candidate);
      const candidatePoint = state.map.latLngToContainerPoint(candidateLatLng);
      const distance = cursorPoint.distanceTo(candidatePoint);
      if (distance <= bestDistance) {
        bestDistance = distance;
        bestLatLng = candidateLatLng;
        bestLayer = sourceLayer;
      }
    };

    const considerPath = (latlngs, sourceLayer = null) => {
      if (!Array.isArray(latlngs) || !latlngs.length) return;
      if (latlngs[0] && Number.isFinite(latlngs[0].lat) && Number.isFinite(latlngs[0].lng)) {
        if (latlngs.length === 1) {
          considerLatLng(latlngs[0], sourceLayer);
          return;
        }
        for (let index = 1; index < latlngs.length; index += 1) {
          const a = state.map.latLngToContainerPoint(latlngs[index - 1]);
          const b = state.map.latLngToContainerPoint(latlngs[index]);
          const closest = elevationProfilePointOnSegment(cursorPoint, a, b);
          const distance = cursorPoint.distanceTo(closest);
          if (distance <= bestDistance) {
            bestDistance = distance;
            bestLatLng = state.map.containerPointToLatLng(closest);
            bestLayer = sourceLayer;
          }
        }
        return;
      }
      latlngs.forEach(child => considerPath(child, sourceLayer));
    };

    const considerLayer = layer => {
      if (!layer || layer === ignoreLayer || !state.map.hasLayer(layer)) return;
      if (layer instanceof L.Marker) {
        considerLatLng(layer.getLatLng(), layer);
        return;
      }
      if (layer instanceof L.Circle) {
        const center = layer.getLatLng();
        const cursor = state.map.containerPointToLatLng(cursorPoint);
        const phi1 = center.lat * Math.PI / 180;
        const phi2 = cursor.lat * Math.PI / 180;
        const deltaLambda = (cursor.lng - center.lng) * Math.PI / 180;
        const y = Math.sin(deltaLambda) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        considerLatLng(elevationProfileDestination(center, bearing, layer.getRadius()), layer);
        return;
      }
      if (layer instanceof L.Polyline) considerPath(layer.getLatLngs(), layer);
    };

    const candidates = new Set();
    for (const layer of state.placeLayers.values()) candidates.add(layer);
    if (state.pendingLayer) candidates.add(state.pendingLayer);
    if (state.editingLayer) candidates.add(state.editingLayer);
    for (const layer of state.lockedMeasurements || []) candidates.add(layer);
    for (const layer of state.temporaryMeasurements || []) candidates.add(layer);
    if (state.measureLayer) candidates.add(state.measureLayer);

    for (const layer of candidates) {
      considerLayer(layer);
      if (layer?._poiCenterMarker) considerLayer(layer._poiCenterMarker);
      for (const marker of layer?._measurementMarkers || []) considerLayer(marker);
    }

    if (state.borderSnapLayer && state.map.hasLayer(state.borderSnapLayer)) {
      state.borderSnapLayer.eachLayer(considerLayer);
    }

    state.map.eachLayer(layer => { if (layer?.options?.snapIgnore === false) considerLayer(layer); });
    if (preview) setPoiSnapCoveredMarker(bestLayer);
    return bestLatLng || latlng;
  }

  function measurementLayerAtLatLng(latlng, tolerance = 14) {
    if (!state.map || !latlng) return null;
    const layerPoint = state.map.latLngToLayerPoint(latlng);
    const containerPoint = state.map.latLngToContainerPoint(latlng);
    const layers = allMeasurementLayers().slice().reverse();
    for (const layer of layers) {
      if (!measurementIsRetained(layer)) continue;
      if (layer instanceof L.Marker) {
        if (containerPoint.distanceTo(state.map.latLngToContainerPoint(layer.getLatLng())) <= tolerance) return layer;
        continue;
      }
      if (layer._measurementMode === "distance") {
        const hit = ensureDistanceHitLayer(layer);
        try {
          if (hit && typeof hit._containsPoint === "function" && hit._containsPoint(layerPoint)) return layer;
        } catch {}
        continue;
      }
      try {
        if (typeof layer._containsPoint === "function" && layer._containsPoint(layerPoint)) return layer;
      } catch {}
    }
    return null;
  }

    return {applyMeasurementFillOpacity, normalizeMeasurementLongitude, refreshDistanceMeasurementWorldCopies, refreshCircleMeasurementWorldCopies, scheduleCircleMeasurementWorldRefresh, refreshPolygonMeasurementWorldCopies, schedulePolygonMeasurementWorldRefresh, allMeasurementLayers, hasAnyMeasurements, removeMeasurementTooltip, resequenceMarkerMarkups, syncActiveGeometryHandleTheme, syncMarkupDrawInteractionMode, syncMarkerMeasurementPreviewIcon, clearMarkerMeasurementPreview, saveElevationProfilesToMeasurements, createLockedMeasurementRecord, clearLockedMeasurementSaveTimer, waitForLockedMeasurementSave, queueLockedMeasurementSave, scheduleLockedMeasurementSave, createDistanceMeasurementMarker, polygonMeasurementVertexMarkers, removePolygonMeasurementVertexAtPath, bindPolygonMeasurementVertexContextMenus, setMeasurementEditing, captureMeasurementState, commitMeasurementHistory, pushMeasurementCreationAction, cancelMarkupShapeConversion, finishMarkupInteractiveConversion, convertMarkupShape, syncMeasurementShapeConvertControl, pushMeasurementProfileConversionAction, recordMapFeatureAction, clearMapFeatureHistory, undoMapChange, redoMapChange, syncDistanceMarkersFromLayer, setMeasurementMoveMode, clearMeasurement, clearAllMeasurements, measurementTooltipHtml, syncMeasurementNodeColor, distanceMeasurementMarkerIcon, addDistanceMeasurementPoint, updateMeasurementTooltip, registerMeasurementLayer, finalizeMarkerMeasurement, finalizeMeasurement, setMeasurementLocked, toggleMeasurementTooltip, duplicateMeasurement, loadLockedMeasurements, startMeasurement, showMeasurementContextMenu, restorePendingMeasurementConversion, finalizePendingMeasurementConversion, convertMeasurementToPoi, changeMeasurementColor, elevationProfileSnapLatLng, updateMeasurementTooltipPointerFade, clearMeasurementTooltipPointerFade, refreshMeasurementLabels, updateAreaThresholdVisibility, measurementLayerAtLatLng};
  }
  window.FAMarkup = Object.freeze({createMarkup, createMarkupController});
})();
