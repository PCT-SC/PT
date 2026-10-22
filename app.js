(() => {
  "use strict";

  if (window.L?.Marker?.mergeOptions) {
    L.Marker.mergeOptions({autoPan: true, autoPanPadding: [32, 32], autoPanSpeed: 10});
  }

  const {formatCoordinatesAs, parseCoordinateInput} = window.FACoordinates;
  const {fetch: networkFetch} = window.FANetwork;
  const {SHORTCUT_DEFINITIONS, defaultShortcutBindings, normalizeShortcutBinding, shortcutFromKeyboardEvent} = window.FAShortcuts;
  const {providers, providerGroups} = window.FAExternalLinks;
  const {validPoiColor, normalizePlaceSearchText, placeMatchesSearch, clonePlaceRevisionValue, placeRevisionSnapshot, placeRevisionRestorePayload, stablePlaceRevisionValue, placeRevisionPayloadChanged} = window.FAPoiData;
  const {escapeMarkerText, markerIcon: createPoiMarkerIcon} = window.FAPoiMarkers;
  const {defaultSettings, settingsSnapshot: settingsSnapshotData, applySettings: applySettingsData, clearLegacyBrowserSettings} = window.FASettings;
  function settingsSnapshot() { return settingsSnapshotData(state); }
  function applySettings(settings) { return applySettingsData(state, settings, validPoiColor, clampSatelliteBrightness); }
  const $ = (id) => document.getElementById(id);

  const state = {
    bootState: "loading",
    bootPromise: null,
    configPromise: null,
    places: [],
    deletedPlaces: [],
    deletedCount: 0,
    trashMode: false,
    trashPreviewLayer: null,
    trashPreviewPlaceId: null,
    trashPreviewNavigating: false,
    placeHistoryPlaceId: null,
    placeHistoryRevisions: [],
    map: null,
    placeLayers: new Map(),
    poiWrappedLayers: new Map(),
    pendingLayer: null,
    editingLayer: null,
    selectedId: null,
    baseLayers: {},
    currentBaseName: null,
    basemap: "osm",
    borderLayer: null,
    borderSnapLayer: null,
    borderLoading: null,
    borderVisible: true,
    borderSharedVisible: true,
    borderSharedSeaVisible: true,
    borderOuterVisible: true,
    borderSharedColor: "#ffffff",
    borderSharedSeaColor: "#7fd8ff",
    borderOuterColor: "#7fd8ff",
    borderSharedOpacity: 0.78,
    borderSharedSeaOpacity: 0.78,
    borderOuterOpacity: 0.78,
    borderSharedStyle: "solid",
    borderSharedSeaStyle: "dashed",
    borderOuterStyle: "dotted",
    borderLineSets: {},
    borderDetailLoads: new Map(),
    borderDetailFailed: new Set(),
    borderDetailRetryTimers: new Map(),
    borderDetailRetryCounts: new Map(),
    currentBase: null,
    providerPrefs: {},
    contextExternalLinksTab: "maps",
    scaleVisible: true,
    blackUnavailableSatelliteTiles: true,
    satelliteBrightness: 1,
    satelliteRasterOverzoom: false,
    osmBrightness: 1,
    osmRasterOverzoom: false,
    poiColor: "#4aa3ff",
    varyMarkupColors: false,
    optimizedRendering: true,
    markupColorQueue: [],
    markupLastColor: null,
    markupMarkerNextIndex: 0,
    hidePois: false,
    hiddenPoiCategories: new Set(),
    filterMapByCategory: false,
    pinFavoritesInSidebar: false,
    showActiveLayerButtons: true,
    fillOpacity: 0.2,
    coordFormat: "dd",
    followScreenCenter: false,
    invertCrosshair: true,
    showPolygonArea: true,
    showPolygonPerimeter: false,
    showCircleArea: true,
    showCircleCircumference: true,
    showMeasurementMarkerCoordinates: true,
    showMeasurementLineBearing: true,
    showMeasurementPolygonArea: true,
    showMeasurementPolygonPerimeter: true,
    showMeasurementCircleDiameter: true,
    showMeasurementCircleRadius: true,
    showMeasurementCircleArea: true,
    showMeasurementCircleCircumference: true,
    showPoiMarkerCoordinates: false,
    showPoiCircleDiameter: true,
    showPoiCircleRadius: true,
    measurementSystem: "metric",
    areaUnits: "m2",
    areaThreshold: 1000000,
    lastCursor: null,
    editorSnapshot: null,
    editorAreaLookupToken: 0,
    editorAreaLookupTimer: null,
    editorAreaLookupController: null,
    editorAreaLookupKey: "",
    editorAreaCustom: false,
    placeHistoryLookupToken: 0,
    contextLookupToken: 0,
    contextLookupController: null,
    imageryInfoLookupToken: 0,
    imageryInfoLookupController: null,
    imageryInfoTooltip: null,
    contextClickMarker: null,
    mapContextFeatureAction: null,
    poiContextId: null,
    measureMode: null,
    measurePendingColor: null,
    measurePendingMarkerLabel: "",
    measureMarkerPreview: null,
    measureWorkingLayer: null,
    activeGeometryDraw: null,
    measureLayer: null,
    measureMarkers: [],
    measureHitLayer: null,
    measureStartLatLng: null,
    measureContextLayer: null,
    measureEditingLine: null,
    lockedMeasurements: new Set(),
    temporaryMeasurements: new Set(),
    elevationProfiles: [],
    legacyElevationProfiles: [],
    elevationProfileSaveQueue: Promise.resolve(),
    measurementSaveTimers: new Map(),
    pendingMeasurementConversion: null,
    markupShapeConversion: null,
    measurementHistories: new Map(),
    measurementHistoryLayer: null,
    measurementLifecycleUndo: [],
    measurementLifecycleRedo: [],
    measurementLifecycleApplying: false,
    mapFeatureUndo: [],
    mapFeatureRedo: [],
    historySequence: 0,
    measurementReplacementBefore: null,
    measurementMoveLayer: null,
    shapeRotationIgnoreMapClickUntil: 0,
    measurementVertexDragActive: false,
    measurementDragRelease: null,
    config: {},
    settingsRecordId: null,
    settingsLoaded: false,
    settingsSaveTimer: null,
    settingsSaveQueue: Promise.resolve(),
    settingsSaveRevision: 0,
    settingsSavedRevision: 0,
    settingsSaveRetryTimer: null,
    settingsSaveErrorShown: false,
    crosshairIdleTimer: null,
    polygonDragMode: "icon",
    viewBearing: 0,
    viewBearingReadout: true,
    northResetAnimation: true,
    smoothScaleResize: true,
    middleViewGesture: null,
    viewBearingAnimation: null,
    middleViewBearingFrame: null,
    pendingMiddleViewBearing: null,
    currentLocationLatLng: null,
    currentLocationAccuracy: null,
    currentLocationMarker: null,
    currentLocationAccuracyLayer: null,
    currentLocationRequesting: false,
    currentLocationFailed: false,
    currentLocationSuspended: false,
    currentLocationAddPoiSnapshot: null,
    currentLocationAddPoiPendingLayer: null,
    editHistory: {layer: null, undo: [], redo: [], current: null, timer: null, applying: false},
    shapeConversion: null,
    keyboardShortcuts: {},
    hideAllRequiresShift: true
  };

  const {api} = window.FALocalStore;

  const {saveSettingsNow, scheduleSettingsSave, loadSettings} = window.FASettingsPersistence.createSettingsPersistence({state, api, settingsSnapshot, defaultSettings, applySettings, syncSettingsUi, clearLegacyBrowserSettings, showToast});
  const {formatMeasurementBearing, geodesicInterpolateLatLng, firstLatLngInTree, rigidMoveLatLngOnGlobe, rigidMoveLatLngTreeOnGlobe, distanceMeasurementGeodesicLatLngs, formatMeasuredDistance, formatMeasuredElevation, nextMarkupColor, markerMarkupLabel, markerMarkupLabelIndex, nextMarkerMarkupLabel, consumeMarkerMarkupLabel, markupMarkerIcon, markerMarkupLayersInSequence} = window.FAMarkup.createMarkup({state, $, validPoiColor, escapeMarkerText, allMeasurementLayers});
  const {clampSatelliteBrightness, applySatelliteBrightness, updateSatelliteBrightnessInfo, applyOsmBrightness, updateOsmBrightnessInfo, createOsmBaseLayer, setOsmRasterOverzoom, updateRasterOverzoomNotice, satelliteNativeMaxZoom, cancelSatelliteNativeZoomDetection, scheduleSatelliteNativeZoomDetection, createSatelliteBaseLayer, setSatelliteRasterOverzoom, applyUnavailableSatelliteTileSetting} = window.FACore.createCoreBasemaps({state, $, syncStyledRange, scheduleSettingsSave, updateZoomStatus, showToast, networkFetch});
  const {normalizeViewBearing, beginViewBearingReadoutEdit, finishViewBearingReadoutEdit, updateViewCompass, applyViewOrientation, resetViewOrientation, resetViewOrientationInstant, installMiddleViewGesture, scheduleMapViewSave, loadSavedMapView, saveMapView, mapNavigationCenter, navigateMap, mapNavigationWillAnimate, visibleMapCenterLatLng} = window.FACore.createCoreNavigation({state, $, showToast});
  const {installShiftPan, installEdgePan, installScaleControl} = window.FACore.createCoreInteractions({state, formatMeasuredDistance});
  const {formatCoordinates, setGotoCoordinatesOpen, goToCoordinates, wakeCenterCrosshair, scheduleCenterCrosshairIdleFade, fadeCenterCrosshairForPoi, updateCenterCrosshairVisibility, updateCoordinateReadout, updateWorldStatus, updateZoomStatus: coreUpdateZoomStatus} = window.FACore.createCoreStatus({state, $, formatCoordinatesAs, parseCoordinateInput, showToast, navigateMap, visibleMapCenterLatLng, satelliteNativeMaxZoom});
  function updateZoomStatus() { return coreUpdateZoomStatus(); }
  const {updateBorderAppearance, refreshBorderSnapLayer, ensureBorderDetailForZoom, preloadNextBorderDetailForZoom, updateBorderLayer, switchBasemap, toggleBorders} = window.FACore.createCoreBorders({state, $, syncStyledRange, scheduleSettingsSave, networkFetch, hideImageryInfoTooltip, updateSatelliteBrightnessInfo, updateOsmBrightnessInfo, updateRasterOverzoomNotice, scheduleSatelliteNativeZoomDetection, cancelSatelliteNativeZoomDetection});
  const {appTooltipController, installSingleTransientTooltipPolicy, installLayerDragAutoPan, updateMapViewportForSidebar} = window.FACore.createCoreHelpers({state, $, updateCoordinateReadout, updateWorldStatus});
  const markupController = window.FAMarkup.createMarkupController({state, $, api, saveSettingsNow, validPoiColor, distanceMeasurementGeodesicLatLngs, firstLatLngInTree, markerMarkupLayersInSequence, markerMarkupLabel, markupMarkerIcon, markerMarkupLabelIndex, nextMarkerMarkupLabel, geodesicInterpolateLatLng, rigidMoveLatLngOnGlobe, rigidMoveLatLngTreeOnGlobe, formatMeasurementBearing, formatMeasuredDistance, consumeMarkerMarkupLabel, nextMarkupColor, formatCoordinates, installLayerDragAutoPan, setPoiSnapCoveredMarker, shiftedLatLngTreeLongitude, showToast, closeEditorWithPrompt, hideMapContextMenu, positionContextMenu, hideImageryInfoTooltip, hideContextClickMarker, placeColor, markerIcon, editorMarkerMeta, removeLayerAndCenter, applyLayerPresentation, bindLayerClicks, circleAreaMeters, circleCircumferenceMeters, hideCircleArea, polygonAreaMeters, polygonPerimeterMeters, formatPolygonArea, polygonAverageCenterLatLng, disableShapeEdgeRotation, enableShapeEdgeRotation, disablePolygonEdgeVertexInsert, enablePolygonEdgeVertexInsert, disablePolygonSelfSnapping, enablePolygonSelfSnapping, cloneLatLngTree, openEditor, editingPoiAreaTooltipElement, pointInsideEditingPoiShape, showPolygonArea, hidePolygonArea, showCircleArea, refreshPoiHoverPreviews});
  const {applyMeasurementFillOpacity, normalizeMeasurementLongitude, refreshDistanceMeasurementWorldCopies, refreshCircleMeasurementWorldCopies, scheduleCircleMeasurementWorldRefresh, refreshPolygonMeasurementWorldCopies, schedulePolygonMeasurementWorldRefresh, hasAnyMeasurements, removeMeasurementTooltip, resequenceMarkerMarkups, syncActiveGeometryHandleTheme, syncMarkupDrawInteractionMode, syncMarkerMeasurementPreviewIcon, clearMarkerMeasurementPreview, saveElevationProfilesToMeasurements, createLockedMeasurementRecord, clearLockedMeasurementSaveTimer, waitForLockedMeasurementSave, queueLockedMeasurementSave, scheduleLockedMeasurementSave, createDistanceMeasurementMarker, polygonMeasurementVertexMarkers, removePolygonMeasurementVertexAtPath, bindPolygonMeasurementVertexContextMenus, setMeasurementEditing, captureMeasurementState, commitMeasurementHistory, pushMeasurementCreationAction, cancelMarkupShapeConversion, finishMarkupInteractiveConversion, convertMarkupShape, syncMeasurementShapeConvertControl, pushMeasurementProfileConversionAction, recordMapFeatureAction, clearMapFeatureHistory, undoMapChange, redoMapChange, syncDistanceMarkersFromLayer, setMeasurementMoveMode, clearMeasurement, clearAllMeasurements, measurementTooltipHtml, syncMeasurementNodeColor, distanceMeasurementMarkerIcon, addDistanceMeasurementPoint, updateMeasurementTooltip, registerMeasurementLayer, finalizeMarkerMeasurement, finalizeMeasurement, setMeasurementLocked, toggleMeasurementTooltip, duplicateMeasurement, loadLockedMeasurements, startMeasurement, showMeasurementContextMenu, restorePendingMeasurementConversion, finalizePendingMeasurementConversion, convertMeasurementToPoi, changeMeasurementColor, elevationProfileSnapLatLng, updateMeasurementTooltipPointerFade, clearMeasurementTooltipPointerFade, refreshMeasurementLabels, updateAreaThresholdVisibility, measurementLayerAtLatLng} = markupController;
  function allMeasurementLayers() { return markupController.allMeasurementLayers(); }
  const placesController = window.FAPlaces.createPlaces({state, updateCurrentLocationStyle, visibleMapCenterLatLng, $, updateCenterCrosshairVisibility, scheduleSettingsSave, refreshCircleMeasurementWorldCopies, refreshPolygonMeasurementWorldCopies, refreshDistanceMeasurementWorldCopies, showToast, hideMapContextMenu, suspendCurrentLocationForAddPoi, updateLocateButton, restoreCurrentLocationAfterAddPoiCancel, hideContextClickMarker, hideImageryInfoTooltip, showMapContextMenu, positionContextMenu, validPoiColor, createPoiMarkerIcon, syncActiveGeometryHandleTheme, distanceMeasurementMarkerIcon, syncMeasurementNodeColor, appTooltipController, normalizeMeasurementLongitude, formatMeasuredElevation, formatMeasuredDistance, measurementTooltipHtml, distanceMeasurementGeodesicLatLngs, formatCoordinates, renderExternalLinks, syncDistanceMarkersFromLayer, updateMeasurementTooltip, commitMeasurementHistory, scheduleLockedMeasurementSave, bindPolygonMeasurementVertexContextMenus, rigidMoveLatLngOnGlobe, rigidMoveLatLngTreeOnGlobe, polygonMeasurementVertexMarkers, removePolygonMeasurementVertexAtPath, installLayerDragAutoPan, fadeCenterCrosshairForPoi, navigateMap, api, placeMatchesSearch, mapNavigationWillAnimate, networkFetch, placeRevisionSnapshot, placeRevisionRestorePayload, placeRevisionPayloadChanged, finalizePendingMeasurementConversion, finalizeCurrentLocationAddPoiSave, restorePendingMeasurementConversion, escapeMarkerText});
  const {syncHidePoisMapControl, applyPoiAppearance, updatePoiVisibility, loadPlaces, fadeTrashPreview, bindSnapGrabMarker, clearPoiSnapCoveredMarker, schedulePoiSnapCoveredMarkers, enablePolygonDrawSelfSnapping, finishPolygonShapeConversion, clearSidebarPlaceHighlightIfOffCenter, isLayerCentered, poiLayerVisualElements, reverseGeocode, serializeLayer, setTrashMode, saveForm, showPlaceHistory, showPlaceEditorView, duplicateCurrent, deleteCurrent, syncShapeConvertOffsetForDragMenu, setPolygonDragMode, resetPolygonDisplayCenter, convertEditingShape, layerCenter, editPlaceFromContext, duplicatePlaceFromContext, deletePlaceFromContext, addPoiAtLatLng, showEditorPanel, undoEditorGeometry, redoEditorGeometry, cancelPolygonShapeConversion, exportPlacesCsv, populateCategorySuggestions, handleEditorAutocompleteKeydown, hideEditorAutocomplete, populateTagSuggestions, updateEditorPresentation, renderList, renderShapeInfo, syncFavoritesToggle, toggleSidebarPoiVisibility} = placesController;
  function showCircleArea(...args) { return placesController.showCircleArea(...args); }
  function hideCircleArea(...args) { return placesController.hideCircleArea(...args); }
  function markerIcon(...args) { return placesController.markerIcon(...args); }
  function bindLayerClicks(...args) { return placesController.bindLayerClicks(...args); }
  function openEditor(...args) { return placesController.openEditor(...args); }
  function closeEditorWithPrompt(...args) { return placesController.closeEditorWithPrompt(...args); }
  function refreshPoiHoverPreviews(...args) { return placesController.refreshPoiHoverPreviews(...args); }
  function pointInsideEditingPoiShape(...args) { return placesController.pointInsideEditingPoiShape(...args); }
  function editingPoiAreaTooltipElement(...args) { return placesController.editingPoiAreaTooltipElement(...args); }
  function setPoiSnapCoveredMarker(...args) { return placesController.setPoiSnapCoveredMarker(...args); }
  function shiftedLatLngTreeLongitude(...args) { return placesController.shiftedLatLngTreeLongitude(...args); }
  function placeColor(...args) { return placesController.placeColor(...args); }
  function editorMarkerMeta(...args) { return placesController.editorMarkerMeta(...args); }
  function removeLayerAndCenter(...args) { return placesController.removeLayerAndCenter(...args); }
  function applyLayerPresentation(...args) { return placesController.applyLayerPresentation(...args); }
  function circleAreaMeters(...args) { return placesController.circleAreaMeters(...args); }
  function circleCircumferenceMeters(...args) { return placesController.circleCircumferenceMeters(...args); }
  function polygonAreaMeters(...args) { return placesController.polygonAreaMeters(...args); }
  function polygonPerimeterMeters(...args) { return placesController.polygonPerimeterMeters(...args); }
  function formatPolygonArea(...args) { return placesController.formatPolygonArea(...args); }
  function polygonAverageCenterLatLng(...args) { return placesController.polygonAverageCenterLatLng(...args); }
  function showPolygonArea(...args) { return placesController.showPolygonArea(...args); }
  function hidePolygonArea(...args) { return placesController.hidePolygonArea(...args); }
  function disableShapeEdgeRotation(...args) { return placesController.disableShapeEdgeRotation(...args); }
  function enableShapeEdgeRotation(...args) { return placesController.enableShapeEdgeRotation(...args); }
  function disablePolygonEdgeVertexInsert(...args) { return placesController.disablePolygonEdgeVertexInsert(...args); }
  function enablePolygonEdgeVertexInsert(...args) { return placesController.enablePolygonEdgeVertexInsert(...args); }
  function disablePolygonSelfSnapping(...args) { return placesController.disablePolygonSelfSnapping(...args); }
  function enablePolygonSelfSnapping(...args) { return placesController.enablePolygonSelfSnapping(...args); }
  function cloneLatLngTree(...args) { return placesController.cloneLatLngTree(...args); }

  function assignShortcutBinding(action, binding) {
    const normalized = normalizeShortcutBinding(binding);
    if (normalized) {
      const conflict = SHORTCUT_DEFINITIONS.find(definition => definition.id !== action && normalizeShortcutBinding(state.keyboardShortcuts[definition.id]).toLowerCase() === normalized.toLowerCase());
      if (conflict) {
        showToast(`${normalized} is already assigned to ${conflict.label}.`, "info");
        return false;
      }
    }
    state.keyboardShortcuts[action] = normalized;
    renderShortcutSettings();
    scheduleSettingsSave();
    return true;
  }

  function renderShortcutSettings() {
    const list = $("shortcut-settings-list");
    if (!list) return;
    if (!list.dataset.built) {
      for (const definition of SHORTCUT_DEFINITIONS) {
        const row = document.createElement("div");
        row.className = "shortcut-setting-row";
        const label = document.createElement("span");
        label.className = "shortcut-setting-label";
        label.textContent = definition.label;
        const input = document.createElement("input");
        input.type = "text";
        input.readOnly = true;
        input.className = "shortcut-setting-input";
        input.dataset.shortcutAction = definition.id;
        input.placeholder = "Disabled";
        input.setAttribute("aria-label", `${definition.label} shortcut`);
        input.title = "Focus and press a shortcut. Backspace or Delete disables it.";
        input.addEventListener("keydown", event => {
          if (event.key === "Tab") return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") { input.blur(); return; }
          if (event.key === "Backspace" || event.key === "Delete") { assignShortcutBinding(definition.id, ""); return; }
          const binding = shortcutFromKeyboardEvent(event);
          if (binding) assignShortcutBinding(definition.id, binding);
        });
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "secondary small shortcut-setting-clear";
        clear.textContent = "Clear";
        clear.addEventListener("click", () => assignShortcutBinding(definition.id, ""));
        row.append(label, input, clear);
        list.appendChild(row);
      }
      $("shortcut-reset-defaults")?.addEventListener("click", () => {
        state.keyboardShortcuts = defaultShortcutBindings();
        renderShortcutSettings();
        scheduleSettingsSave();
      });
      $("shortcut-show-cheat-sheet")?.addEventListener("click", toggleShortcutCheatSheet);
      list.dataset.built = "true";
    }
    for (const definition of SHORTCUT_DEFINITIONS) {
      const input = list.querySelector(`[data-shortcut-action="${definition.id}"]`);
      if (input) input.value = state.keyboardShortcuts[definition.id] || "";
    }
  }

  function ensureShortcutCheatSheet() {
    let overlay = $("shortcut-cheat-sheet");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "shortcut-cheat-sheet";
    overlay.className = "shortcut-cheat-sheet hidden";
    overlay.innerHTML = `<div class="shortcut-cheat-sheet-panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"><div class="shortcut-cheat-sheet-list"></div></div>`;
    overlay.addEventListener("click", event => { if (event.target === overlay) overlay.classList.add("hidden"); });
    document.body.appendChild(overlay);
    return overlay;
  }

  function toggleShortcutCheatSheet() {
    const overlay = ensureShortcutCheatSheet();
    const opening = overlay.classList.contains("hidden");
    if (opening) {
      const list = overlay.querySelector(".shortcut-cheat-sheet-list");
      list.innerHTML = "";
      for (const definition of SHORTCUT_DEFINITIONS) {
        const binding = state.keyboardShortcuts[definition.id] || "";
        if (!binding) continue;
        const row = document.createElement("div");
        row.className = "shortcut-cheat-sheet-row";
        const label = document.createElement("span");
        label.textContent = definition.label;
        const key = document.createElement("kbd");
        key.textContent = binding;
        row.append(label, key);
        list.appendChild(row);
      }
    }
    overlay.classList.toggle("hidden", !opening);
  }


  let hideLabelsShortcutHeld = false;
  let hideLabelsShortcutKey = "";
  let hideShortcutShiftHeld = false;
  let hideAllShortcutHeld = false;
  const hiddenOverlayPaneState = new Map();
  let hideAllFadeCleanupTimer = null;

  function setBordersTemporarilyHidden(hidden) {
    const pane = state.map?.getPane?.("borderPane");
    if (!pane) return;
    pane.style.transition = "opacity 180ms ease";
    requestAnimationFrame(() => { pane.style.opacity = hidden ? "0" : "1"; });
  }

  function ensureHideAllFadeStyle() {
    let style = document.getElementById("fa-hide-all-fade-style");
    if (style) return;
    style = document.createElement("style");
    style.id = "fa-hide-all-fade-style";
    style.textContent = `.fa-hide-all-fade-pane { transition: opacity 180ms ease !important; }
.fa-hide-all-fade-pane.fa-hide-all-fade-active { opacity: 0 !important; }`;
    document.head.appendChild(style);
  }

  function setAllMapOverlaysTemporarilyHidden(hidden) {
    if (!state.map?._panes) return;
    ensureHideAllFadeStyle();
    clearTimeout(hideAllFadeCleanupTimer);
    hideAllFadeCleanupTimer = null;

    if (hidden) {
      hiddenOverlayPaneState.clear();
      for (const [name, pane] of Object.entries(state.map._panes)) {
        if (!pane || name === "mapPane" || name === "tilePane") continue;
        hiddenOverlayPaneState.set(pane, true);
        pane.classList.add("fa-hide-all-fade-pane");
      }
      requestAnimationFrame(() => {
        if (!hideAllShortcutHeld) return;
        for (const pane of hiddenOverlayPaneState.keys()) {
          pane.classList.add("fa-hide-all-fade-active");
        }
      });
      return;
    }

    for (const pane of hiddenOverlayPaneState.keys()) {
      pane.classList.remove("fa-hide-all-fade-active");
    }
    hideAllFadeCleanupTimer = setTimeout(() => {
      if (hideAllShortcutHeld) return;
      for (const pane of hiddenOverlayPaneState.keys()) {
        pane.classList.remove("fa-hide-all-fade-pane");
      }
      hiddenOverlayPaneState.clear();
      hideAllFadeCleanupTimer = null;
    }, 200);
  }

  function applyHideLabelsShortcut(hidden) {
    window.FAVersaTiles?.setTemporarilyHidden?.(hidden);
    setBordersTemporarilyHidden(hidden);
  }

  function syncHideShortcutVisibility() {
    const shouldHideAll = Boolean(hideLabelsShortcutHeld && (!state.hideAllRequiresShift || hideShortcutShiftHeld));
    if (shouldHideAll === hideAllShortcutHeld) return;
    hideAllShortcutHeld = shouldHideAll;
    setAllMapOverlaysTemporarilyHidden(shouldHideAll);
  }

  function setHideLabelsShortcutHeld(held, key = "") {
    const next = Boolean(held);
    if (hideLabelsShortcutHeld === next) {
      if (next && key) hideLabelsShortcutKey = key;
      syncHideShortcutVisibility();
      return;
    }
    hideLabelsShortcutHeld = next;
    hideLabelsShortcutKey = next ? String(key || hideLabelsShortcutKey || "") : "";
    applyHideLabelsShortcut(next);
    syncHideShortcutVisibility();
  }

  function setHideShortcutShiftHeld(held) {
    const next = Boolean(held);
    if (hideShortcutShiftHeld === next) return;
    hideShortcutShiftHeld = next;
    syncHideShortcutVisibility();
  }

  function resetHideShortcutState() {
    setHideShortcutShiftHeld(false);
    setHideLabelsShortcutHeld(false);
    if (hideAllShortcutHeld) {
      hideAllShortcutHeld = false;
      setAllMapOverlaysTemporarilyHidden(false);
    }
  }

  async function runShortcutAction(action) {
    if (action === "cheatSheet") { toggleShortcutCheatSheet(); return; }
    if (!state.map) return;
    if (action === "home") {
      const home = state.config.mapStart || {lat: 15.470492, lon: 44.839600, zoom: 7};
      resetViewOrientationInstant();
      navigateMap([Number(home.lat), Number(home.lon)], {zoom: Number(home.zoom)});
    } else if (action === "sidebar") {
      $("sidebar-toggle")?.click();
    } else if (action === "copyCoordinates") {
      const point = state.followScreenCenter ? (visibleMapCenterLatLng() || state.map.getCenter()) : state.map.getCenter();
      await copyText(formatCoordinates(point.lat, point.lng));
      showToast("Coordinates copied.", "success");
    } else if (action === "basemap") {
      switchBasemap(state.currentBaseName === "satellite" ? "osm" : "satellite");
    } else if (action === "gotoCoordinates") {
      setGotoCoordinatesOpen(true);
    } else if (action === "sar") {
      window.FAOverpass?.toggleTool?.("sar");
    } else if (action === "overpass") {
      window.FAOverpass?.toggleTool?.("ovp");
    } else if (action === "oap") {
      window.FAOverpass?.toggleTool?.("oap");
    } else if (action === "oim") {
      window.FAOverpass?.toggleTool?.("oim");
    } else if (action === "elevation") {
      window.FAOverpass?.toggleTool?.("elv");
    } else if (action === "worldcover") {
      window.FAOverpass?.toggleTool?.("wc");
    } else if (action === "togglePoiCategory") {
      $("sidebar-hide-pois-toggle")?.click();
    } else if (action === "sketch") {
      window.FASketch?.toggle?.();
    } else if (action === "north") {
      resetViewOrientation();
    }
  }



  window.FASketchHost = { api, returnHome() { void runShortcutAction("home"); }, toast(message, tone = "info") { showToast(message, tone); } };

  const doubleClickZoomLocks = new WeakMap();
  window.FADoubleClickZoomLock = {
    acquire(targetMap, owner) {
      if (!targetMap || !owner) return;
      let lock = doubleClickZoomLocks.get(targetMap);
      if (!lock) {
        lock = {owners: new Set(), wasEnabled: Boolean(targetMap.doubleClickZoom?.enabled?.())};
        doubleClickZoomLocks.set(targetMap, lock);
      } else if (!lock.owners.size) {
        lock.wasEnabled = Boolean(targetMap.doubleClickZoom?.enabled?.());
      }
      lock.owners.add(String(owner));
      targetMap.doubleClickZoom?.disable?.();
    },
    release(targetMap, owner) {
      const lock = targetMap ? doubleClickZoomLocks.get(targetMap) : null;
      if (!lock || !owner) return;
      lock.owners.delete(String(owner));
      if (lock.owners.size) return;
      if (lock.wasEnabled) targetMap.doubleClickZoom?.enable?.();
      else targetMap.doubleClickZoom?.disable?.();
      doubleClickZoomLocks.delete(targetMap);
    }
  };

  async function handleConfiguredShortcut(event) {
    const hideLabelsBinding = normalizeShortcutBinding(state.keyboardShortcuts.hideLabels);
    const hideKey = hideLabelsBinding && !hideLabelsBinding.includes("+") ? hideLabelsBinding.toLowerCase() : "";
    const rawKey = String(event.key || "").toLowerCase();

    if (rawKey === "shift") {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        setHideShortcutShiftHeld(true);
        if (hideLabelsShortcutHeld) {
          event.preventDefault();
          return true;
        }
      }
      return false;
    }

    const pressed = shortcutFromKeyboardEvent(event);
    if (!pressed) return false;

    if (hideKey && rawKey === hideKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      setHideShortcutShiftHeld(Boolean(event.shiftKey));
      setHideLabelsShortcutHeld(true, rawKey);
      return true;
    }

    const definition = SHORTCUT_DEFINITIONS.find(item => normalizeShortcutBinding(state.keyboardShortcuts[item.id]).toLowerCase() === pressed.toLowerCase());
    if (!definition) return false;
    event.preventDefault();
    if (definition.id === "hideLabels") {
      setHideLabelsShortcutHeld(true, rawKey);
      return true;
    }
    if (event.repeat) return true;
    await runShortcutAction(definition.id);
    return true;
  }

  function settingsTabNames() {
    return ["general", "links", "display", "measurements", "shortcuts", "backup"];
  }

  function setSettingsTab(name, focus = false) {
    const names = settingsTabNames();
    const selected = names.includes(name) ? name : "general";
    const tabs = Array.from(document.querySelectorAll("#settings-tabs [data-settings-tab]"));
    for (const tab of tabs) {
      const active = tab.dataset.settingsTab === selected;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    }
    for (const panel of document.querySelectorAll("#config-panel [data-settings-panel]")) {
      panel.hidden = panel.dataset.settingsPanel !== selected;
    }
    try { sessionStorage.setItem("project-tracker-settings-tab", selected); } catch {}
  }

  function restoreSettingsTab() {
    let selected = "general";
    try { selected = sessionStorage.getItem("project-tracker-settings-tab") || selected; } catch {}
    setSettingsTab(selected);
  }

  function handleSettingsTabKeydown(event) {
    const tab = event.target.closest("[data-settings-tab]");
    if (!tab) return;
    const tabs = Array.from(document.querySelectorAll("#settings-tabs [data-settings-tab]"));
    const index = tabs.indexOf(tab);
    if (index < 0) return;
    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    setSettingsTab(tabs[next].dataset.settingsTab, true);
  }


  function syncBoundaryFillOpacityControl() {
    const input = $("fill-opacity");
    input.value = String(state.fillOpacity);
    syncStyledRange(input);
    $("fill-opacity-value").textContent = `${Math.round(state.fillOpacity * 100)}%`;
    $("fill-opacity-reset").disabled = Math.abs(state.fillOpacity - 0.2) < 0.0001;
  }
  function setBoundaryFillOpacity(value) {
    state.fillOpacity = Math.min(1, Math.max(0, Number(value)));
    syncBoundaryFillOpacityControl();
    scheduleSettingsSave();
    applyPoiAppearance();
    applyMeasurementFillOpacity();
    window.FAOverpass?.setBoundaryFillOpacity?.(state.fillOpacity);
  }

  const geometryLabelControls = {"measure-marker-coordinates": "showMeasurementMarkerCoordinates", "measure-line-distance": "showMeasurementLineDistance", "measure-line-bearing": "showMeasurementLineBearing", "measure-polygon-area": "showMeasurementPolygonArea", "measure-polygon-perimeter": "showMeasurementPolygonPerimeter", "measure-circle-diameter": "showMeasurementCircleDiameter", "measure-circle-radius": "showMeasurementCircleRadius", "measure-circle-area": "showMeasurementCircleArea", "measure-circle-circumference": "showMeasurementCircleCircumference", "poi-marker-coordinates": "showPoiMarkerCoordinates", "poi-circle-diameter": "showPoiCircleDiameter", "poi-circle-radius": "showPoiCircleRadius"};

  function syncSettingsUi() {
    renderShortcutSettings();
    $("hide-all-requires-shift").checked = state.hideAllRequiresShift;
    $("north-reset-animation").checked = state.northResetAnimation;
    $("smooth-scale-resize").checked = state.smoothScaleResize !== false;
    document.documentElement.style.setProperty("--poi-color", state.poiColor);
    $("poi-color").value = state.poiColor;
    $("vary-markup-colors").checked = state.varyMarkupColors;
    $("optimized-rendering").checked = state.optimizedRendering;
    syncHidePoisMapControl();
    $("pin-favorites-sidebar").checked = state.pinFavoritesInSidebar;
    $("show-active-layer-buttons").checked = state.showActiveLayerButtons;
    document.documentElement.classList.toggle("hide-active-layer-buttons", !state.showActiveLayerButtons);
    syncBoundaryFillOpacityControl();
    window.FAOIM?.setPointFillOpacity?.(state.fillOpacity);
    $("coordinate-format").value = state.coordFormat;
    $("center-coords-toggle").checked = state.followScreenCenter;
    $("invert-crosshair-toggle").checked = state.invertCrosshair;
    $("view-bearing-readout-toggle").checked = state.viewBearingReadout;
    $("invert-crosshair-setting").classList.toggle("hidden", !state.followScreenCenter);
    $("map-center-crosshair").classList.toggle("inverted", state.invertCrosshair);
    updateCenterCrosshairVisibility();
    $("show-polygon-area").checked = state.showPolygonArea;
    $("show-polygon-perimeter").checked = state.showPolygonPerimeter;
    $("show-circle-area").checked = state.showCircleArea;
    $("show-circle-circumference").checked = state.showCircleCircumference;
    for (const [id, key] of Object.entries(geometryLabelControls)) $(id).checked = Boolean(state[key]);
    $("measurement-system").value = state.measurementSystem;
    $("area-units").value = state.areaUnits;
    $("area-threshold").value = state.areaThreshold === null ? "" : String(state.areaThreshold);
    $("scale-toggle").checked = state.scaleVisible;
    $("black-unavailable-satellite-tiles").checked = state.blackUnavailableSatelliteTiles;
    applySatelliteBrightness();
    updateAreaThresholdVisibility();
    const scale = document.querySelector(".simple-scale");
    if (scale) scale.classList.toggle("hidden", !state.scaleVisible);
    if (state.map) {
      applyPoiAppearance();
      updatePoiVisibility();
      refreshCircleMeasurementWorldCopies();
      refreshPolygonMeasurementWorldCopies();
      refreshDistanceMeasurementWorldCopies();
    }
  }

  let reconnectDotsTimer = null;
  function showBootProgress(value, detail = "") {
    if (state.bootState !== "loading") return;
    const container = $("boot-progress");
    if (!container) return;
    const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    container.hidden = false;
    $("boot-progress-percent").textContent = `${percent}%`;
    $("boot-progress-detail").textContent = detail;
    $("boot-progress-bar").style.width = `${percent}%`;
    $("boot-progress-track").setAttribute("aria-valuenow", String(percent));
  }
  function setBootState(mode, message = "") {
    if (reconnectDotsTimer !== null) { clearInterval(reconnectDotsTimer); reconnectDotsTimer = null; }
    state.bootState = mode;
    if (mode !== "loading") {
      const progress = $("boot-progress");
      if (progress) progress.hidden = true;
    }
    const app = $("app");
    const bootScreen = $("boot-screen");
    const bootStatus = $("boot-status");
    const bootRetry = $("boot-retry");
    const showBoot = mode === "loading" || mode === "failed" || mode === "setup";
    const ready = mode === "ready";

    app?.classList.remove("hidden");
    app?.classList.toggle("app-booting", !ready);
    app?.toggleAttribute("inert", !ready);
    if (app) {
      if (ready) app.removeAttribute("aria-busy");
      else app.setAttribute("aria-busy", "true");
    }
    bootScreen?.classList.toggle("hidden", !showBoot);
    if (bootScreen) bootScreen.dataset.state = mode;
    if (bootStatus && showBoot) {
      const statusMessage = message || (mode === "failed" ? "Unable to load the app." : mode === "setup" ? "" : "Loading app data...");
      const reconnecting = mode === "loading" && /^Reconnecting to GitHub\.{0,3}$/.test(statusMessage);
      bootStatus.textContent = reconnecting ? "Reconnecting to GitHub" : statusMessage;
      bootStatus.classList.toggle("hidden", !statusMessage);
      if (reconnecting) {
        const dotsElement = document.createElement("span");
        dotsElement.setAttribute("aria-hidden", "true");
        bootStatus.append(dotsElement);
        let dots = 0;
        reconnectDotsTimer = setInterval(() => {
          dots = (dots + 1) % 4;
          dotsElement.textContent = ".".repeat(dots);
        }, 500);
      }
    }
    bootRetry?.classList.toggle("hidden", mode !== "failed");

  }

  async function initializeLocalApp() {
    if (state.bootPromise) return state.bootPromise;

    state.bootPromise = (async () => {
      try {
        setBootState("loading", "Loading settings...");
        showBootProgress(94, "Loading local settings");
        await loadSettings();
        window.FAOverpass?.setBoundaryFillOpacity?.(state.fillOpacity);
        window.FAOverpass?.setOptimizedRendering?.(state.optimizedRendering);
        setBootState("loading", "Preparing map...");
        showBootProgress(96, "Preparing map");
        if (!state.map) {
          initMap();
        } else {
          switchBasemap(state.basemap);
          updateBorderLayer();
        }
        loadProviderPrefs();
        setBootState("loading", "Loading sketches...");
        showBootProgress(97, "Loading local sketches");
        await window.FASketch?.load?.();
        setBootState("loading", "Loading measurements...");
        showBootProgress(98, "Loading local measurements");
        await loadLockedMeasurements();
        setBootState("loading", "Loading places...");
        showBootProgress(99, "Rendering places");
        await loadPlaces();
        showBootProgress(100, "Ready");
        setBootState("ready");
        requestAnimationFrame(() => state.map?.invalidateSize?.({pan: false}));
        return true;
      } catch (err) {
        void 0;
        setBootState("failed", `Unable to load local data: ${err?.message || "Unknown error"}`);
        return false;
      }
    })();

    try {
      return await state.bootPromise;
    } finally {
      state.bootPromise = null;
    }
  }

  function syncStyledRange(input) {
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value);
    const pct = Number.isFinite(value) && max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
    input.style.setProperty("--range-pct", `${pct}%`);
  }

  let livePathRendererRefreshFrame = null;

  function scheduleLivePathRendererRefresh() {
    if (livePathRendererRefreshFrame !== null || !state.map) return;
    livePathRendererRefreshFrame = requestAnimationFrame(() => {
      livePathRendererRefreshFrame = null;
      const renderers = new Set();
      for (const layer of allMeasurementLayers()) {
        if (layer?._renderer) renderers.add(layer._renderer);
        for (const copy of layer?._measurementWrappedCopies || []) {
          if (copy?._renderer) renderers.add(copy._renderer);
        }
      }
      for (const renderer of renderers) {
        if (!renderer || !state.map.hasLayer(renderer) || typeof renderer._update !== "function") continue;
        renderer._update();
      }
    });
  }

  function initMap() {
    updateMapViewportForSidebar();
    // Start at the configured home location, not the previous map view.
    const start = state.config.mapStart || {lat: 15.470492, lon: 44.839600, zoom: 7};
    const worldBounds = window.FACore.createCoreMap({state, start, normalizeViewBearing, installSingleTransientTooltipPolicy});
    installMiddleViewGesture();
    installShiftPan();
    const mapContainer = state.map.getContainer();
    mapContainer.addEventListener("pointermove", updateMeasurementTooltipPointerFade, {passive: true});
    mapContainer.addEventListener("pointerleave", clearMeasurementTooltipPointerFade, {passive: true});
    state.map.on("rotate", () => {
      hideMapContextMenu();
      if (typeof state.map.getBearing === "function") state.viewBearing = normalizeViewBearing(state.map.getBearing());
      scheduleSatelliteNativeZoomDetection(220);
      scheduleMapViewSave();
      updateViewCompass();
    });
    applyViewOrientation();
    const constrainWorldZoom = () => state.map.setMinZoom(state.map.getBoundsZoom(worldBounds, true));
    constrainWorldZoom();
    state.map.on("resize", constrainWorldZoom);
    state.map.on("moveend zoomend", refreshBorderSnapLayer);
    state.map.on("zoomend", ensureBorderDetailForZoom);
    state.map.on("zoomend", preloadNextBorderDetailForZoom);
    state.map.on("dragstart", () => { hideMapContextMenu(); if (state.trashPreviewLayer && !state.trashPreviewNavigating) fadeTrashPreview(); });
    state.map.on("movestart zoomstart", () => {
      hideMapContextMenu();
      if (state.trashPreviewLayer && !state.trashPreviewNavigating) fadeTrashPreview();
    });

    installEdgePan();
    installScaleControl(syncHidePoisMapControl);

    state.baseLayers.osm = createOsmBaseLayer();

    state.baseLayers.satellite = createSatelliteBaseLayer();
    state.map.on("zoomend", updateRasterOverzoomNotice);
    state.map.on("zoomend", () => {
      const layer = state.baseLayers.satellite;
      if (layer && state.map.getZoom() <= (layer._faNativeMaxZoom || 19)) layer._faMaxZoomNoticeActive = false;
    });

    state.map.on("moveend zoomend resize", () => scheduleSatelliteNativeZoomDetection());
    const borderPane = state.map.createPane("borderPane", state.map._rotatePane || state.map.getPane("overlayPane"));
    borderPane.style.zIndex = "350";
    borderPane.style.pointerEvents = "none";
    try { window.FASketch?.init?.(state.map); } catch (error) { void 0; }

    const requested = state.basemap;
    switchBasemap(requested);

    state.map.on("layeradd", event => { bindSnapGrabMarker(event.layer); schedulePoiSnapCoveredMarkers(); });
    state.map.on("layerremove moveend zoomend", schedulePoiSnapCoveredMarkers);
    state.map.on("pm:drawend", clearPoiSnapCoveredMarker);
    state.map.on("pm:drawend", () => { state.activeGeometryDraw = null; syncActiveGeometryHandleTheme(); });
    state.map.on("pm:drawend", () => state.map.getContainer().classList.remove("poi-geometry-draw-active"));

    state.map.on("pm:drawstart", (event) => {
      state.activeGeometryDraw = ["Polygon", "Circle", "Line", "Polyline"].includes(event.shape) ? {type: event.shape === "Circle" ? "circle" : event.shape === "Polygon" ? "polygon" : "line", color: validPoiColor(state.markupShapeConversion?.color || (state.shapeConversion ? placeColor(editorMarkerMeta()) : null) || (state.measureMode ? state.measurePendingColor : null)) || state.poiColor} : null;
      syncActiveGeometryHandleTheme();
      state.map.getContainer().classList.add("poi-geometry-draw-active");
      const workingLayer = event.workingLayer;
      const clearSnapPreviewOnVertex = () => clearPoiSnapCoveredMarker();
      workingLayer.on("pm:vertexadded", clearSnapPreviewOnVertex);
      state.map.once("pm:drawend", () => workingLayer.off("pm:vertexadded", clearSnapPreviewOnVertex));
      if (event.shape === "Polygon") enablePolygonDrawSelfSnapping(workingLayer);
      if (state.measureMode) {
        state.measureWorkingLayer = workingLayer;
        updateMeasurementTooltip(workingLayer, state.measureMode);
        return;
      }
      if (event.shape === "Circle" && workingLayer instanceof L.Circle) {
        const updateCircleMeasurement = () => showCircleArea(workingLayer);
        workingLayer.on("pm:change", updateCircleMeasurement);
        state.map.once("pm:drawend", () => {
          workingLayer.off("pm:change", updateCircleMeasurement);
          hideCircleArea(workingLayer);
        });
      }
    });

    state.map.on("pm:create", async (event) => {
      clearPoiSnapCoveredMarker();
      if (state.markupShapeConversion && state.markupShapeConversion.target === "polygon" && event.shape === "Polygon") {
        const conversion = state.markupShapeConversion;
        state.map.pm.disableDraw();
        await finishMarkupInteractiveConversion(conversion, event.layer, "polygon");
        return;
      }
      if (state.shapeConversion && event.shape === "Polygon") {
        const conversion = state.shapeConversion;
        state.shapeConversion = null;
        state.map.pm.disableDraw();
        finishPolygonShapeConversion(event.layer, conversion);
        return;
      }
      if (state.measureMode) {
        const mode = state.measureMode;
        const workingLayer = state.measureWorkingLayer;
        state.measureMode = null; syncMarkupDrawInteractionMode();
        clearMarkerMeasurementPreview();
        state.measurePendingColor = null;
        state.measurePendingMarkerLabel = "";
        clearMarkerMeasurementPreview();
        state.measurePendingColor = null;
        state.measureWorkingLayer = null;
        state.map.pm.disableDraw();
        removeMeasurementTooltip(workingLayer);
        finalizeMeasurement(event.layer, mode);
        state.measurePendingColor = null;
        return;
      }
      state.pendingLayer = event.layer;
      if (event.shape === "Marker") {
        event.layer.setIcon(markerIcon({icon: "location-dot"}));
      }
      bindLayerClicks(event.layer, null);
      state.map.pm.disableDraw();
      $("add-menu").classList.add("hidden");
      await openEditor(null, event.layer);
    });

    state.map.on("mousemove", (e) => {
      if (state.measureMode === "marker" && state.measureMarkerPreview) {
        state.measureMarkerPreview.setLatLng(e.latlng);
        syncMarkerMeasurementPreviewIcon();
      }
      state.lastCursor = e.latlng;
      if (!state.followScreenCenter) updateCoordinateReadout(e.latlng);
      if (state.measureMode && state.measureWorkingLayer) updateMeasurementTooltip(state.measureWorkingLayer, state.measureMode, e.latlng);
    });
    state.map.on("move", () => { scheduleCircleMeasurementWorldRefresh(); schedulePolygonMeasurementWorldRefresh(); scheduleLivePathRendererRefresh(); updateWorldStatus(); if (state.followScreenCenter) updateCoordinateReadout(); });
    state.map.on("zoom", () => { updateZoomStatus(); if (state.followScreenCenter) updateCoordinateReadout(); });
    if (state.followScreenCenter) {
      const crosshair = $("map-center-crosshair");
      crosshair.classList.add("startup-faded");
      updateCenterCrosshairVisibility();
    }
    if (state.followScreenCenter) {
      state.map.setView(mapNavigationCenter([start.lat, start.lon], start.zoom), start.zoom, {animate: false});
    }
    state.map.on("movestart zoomstart", wakeCenterCrosshair);
    state.map.on("moveend zoomend", scheduleCenterCrosshairIdleFade);
    setTimeout(() => {
      updateCoordinateReadout();
      updateWorldStatus();
      updateZoomStatus();
    }, 0);
    state.map.on("moveend", () => {
      saveMapView();
      updatePoiVisibility();
      refreshCircleMeasurementWorldCopies();
      refreshPolygonMeasurementWorldCopies();
      refreshDistanceMeasurementWorldCopies();
      updateCenterCrosshairVisibility();
      clearSidebarPlaceHighlightIfOffCenter();
    });
    state.map.on("contextmenu", showMapContextMenu);
    state.map.on("click", (event) => {
      hideMapContextMenu();
      if ((state.shapeRotationIgnoreMapClickUntil || 0) > Date.now()) return;
      if (state.measurementVertexDragActive) return;
      const measurementDragRelease = state.measurementDragRelease;
      if (measurementDragRelease) {
        if (measurementDragRelease.until <= Date.now()) {
          state.measurementDragRelease = null;
        } else if (measurementDragRelease.latlng) {
          const releasePoint = state.map.latLngToContainerPoint(measurementDragRelease.latlng);
          const clickPoint = state.map.latLngToContainerPoint(event.latlng);
          if (releasePoint.distanceTo(clickPoint) <= 32) {
            state.measurementDragRelease = null;
            return;
          }
        }
      }
      if (state.measureMode === "marker") {
        finalizeMarkerMeasurement(event.latlng);
        return;
      }
      if (state.measureMode === "distance") {
        const editingLine = state.measureEditingLine;
        if (editingLine && (editingLine._measurementIgnoreClickUntil || 0) > Date.now()) return;
        const point = event.latlng;
        addDistanceMeasurementPoint(point, editingLine);
      }
    });
    state.map.getContainer().addEventListener("contextmenu", event => event.preventDefault());
    ["pointerdown", "wheel", "keydown"].forEach(type => {
      state.map.getContainer().addEventListener(type, (event) => {
        if (type === "pointerdown" && event.button === 0) {
          clearPoiSnapCoveredMarker();
          const centeredPoiLayer = state.editingLayer || (state.selectedId ? state.placeLayers.get(state.selectedId) : null);
          if (centeredPoiLayer && isLayerCentered(centeredPoiLayer)) {
            const marker = centeredPoiLayer instanceof L.Marker ? centeredPoiLayer : centeredPoiLayer._poiCenterMarker;
            if (marker?._icon && marker._icon.contains(event.target)) return;
          }
          const selectedWrappedCopies = state.selectedId ? state.poiWrappedLayers.get(state.selectedId) : null;
          if (selectedWrappedCopies?.some(copy => copy.getLayers().some(member =>
            isLayerCentered(member) && poiLayerVisualElements(member).some(element => element.contains(event.target))
          ))) return;
          const currentLocationMarker = state.currentLocationMarker;
          if (
            currentLocationMarker &&
            state.currentLocationLatLng &&
            state.map?.hasLayer(currentLocationMarker) &&
            isLayerCentered(currentLocationMarker) &&
            currentLocationMarker._icon?.contains(event.target)
          ) return;
        }
        $("map-center-crosshair").classList.remove("poi-faded", "poi-faded-instant");
      }, {passive: true});
    });
  }

  function showToast(message, tone = "error") {
    const text = String(message || "").trim();
    if (!text) return;
    const toast = document.createElement("div");
    const toneClass = tone === "success" ? " map-toast-success" : (tone === "info" ? " map-toast-info" : "");
    toast.className = `map-toast${toneClass}`;
    toast.textContent = text;
    $("toast-stack").appendChild(toast);
    setTimeout(() => toast.remove(), 4800);
  }

  async function copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  function hideContextExternalLinks() {
    const panel = $("context-external-links-panel");
    const button = $("context-external-links-btn");
    if (panel) {
      panel.classList.add("hidden");
      panel.classList.remove("drawer");
      panel.style.left = "";
      panel.style.top = "";
    }
    if (button) {
      button.classList.remove("flyout-left");
      button.setAttribute("aria-expanded", "false");
    }
  }

  function positionContextExternalLinks() {
    const panel = $("context-external-links-panel");
    const button = $("context-external-links-btn");
    const menu = $("map-context-menu");
    const mapContainer = state.map?.getContainer?.();
    if (!panel || !button || !menu || !mapContainer || panel.classList.contains("hidden")) return;

    panel.classList.remove("drawer");
    button.classList.remove("flyout-left");
    panel.style.left = "";
    panel.style.top = "";

    const mapRect = mapContainer.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const controlsRect = menu.querySelector(".context-add-wrap")?.getBoundingClientRect();
    const margin = 6;
    const gap = 8;
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const rightSpace = mapRect.right - menuRect.right - gap - margin;
    const leftSpace = menuRect.left - mapRect.left - gap - margin;
    const useDrawer = mapRect.width < 640 || (rightSpace < panelWidth && leftSpace < panelWidth);

    if (useDrawer) {
      panel.classList.add("drawer");
      return;
    }

    let openLeft = rightSpace < panelWidth && leftSpace >= panelWidth;
    const desiredTop = buttonRect.top - mapRect.top;
    const maxTop = Math.max(margin, mapRect.height - panelHeight - margin);
    const top = Math.max(margin, Math.min(desiredTop, maxTop));
    const maxLeft = Math.max(margin, mapRect.width - panelWidth - margin);
    let left = openLeft
      ? menuRect.left - mapRect.left - panelWidth - gap
      : menuRect.right - mapRect.left + gap;

    if (!openLeft && controlsRect) {
      const panelTop = mapRect.top + top;
      const panelBottom = panelTop + panelHeight;
      const overlapsControls = panelTop < controlsRect.bottom + gap && panelBottom > controlsRect.top - gap;
      const clearOfControls = controlsRect.right - mapRect.left + gap;
      if (overlapsControls && left < clearOfControls) {
        if (clearOfControls + panelWidth <= mapRect.width - margin) {
          left = clearOfControls;
        } else if (leftSpace >= panelWidth) {
          openLeft = true;
          left = menuRect.left - mapRect.left - panelWidth - gap;
        } else {
          panel.classList.add("drawer");
          return;
        }
      }
    }

    button.classList.toggle("flyout-left", openLeft);
    panel.style.left = `${Math.max(margin, Math.min(left, maxLeft))}px`;
    panel.style.top = `${top}px`;
  }

  function toggleContextExternalLinks() {
    const panel = $("context-external-links-panel");
    const button = $("context-external-links-btn");
    if (!panel || !button) return;
    if (!panel.classList.contains("hidden")) {
      hideContextExternalLinks();
      return;
    }
    hideImageryInfoTooltip();
    $("context-add-menu").classList.add("hidden");
    panel.classList.remove("hidden");
    button.setAttribute("aria-expanded", "true");
    positionContextExternalLinks();
  }

  function hideMapContextMenu() {
    $("measurement-shape-convert-menu")?.classList.add("hidden");
    state.contextLookupToken += 1;
    if (state.contextLookupController) { try { state.contextLookupController.abort(); } catch {} }
    state.contextLookupController = null;
    window.FAElevation?.hideContextMenus?.();
    hideContextExternalLinks();
    hideImageryInfoTooltip();
    hideContextClickMarker();
    $("context-add-menu").classList.add("hidden");
    $("map-context-menu").classList.add("hidden");
    $("poi-context-menu").classList.add("hidden");
    $("measurement-context-menu").classList.add("hidden");
    $("current-location-context-menu").classList.add("hidden");
    state.poiContextId = null;
    state.measureContextLayer = null;
    state.mapContextFeatureAction = null;
    $("context-feature-actions")?.classList.add("hidden");
  }

  // Compatibility no-op: current-device GPS/location UI has been removed.
  function updateLocateButton() {}

  function currentLocationAccuracyText(accuracy) {
    const meters = Math.max(0, Number(accuracy) || 0);
    return meters ? `±${formatMeasuredDistance(meters)}` : "Unavailable";
  }

  function updateCurrentLocationStyle() {
    if (!state.currentLocationAccuracyLayer) return;
    state.currentLocationAccuracyLayer.setStyle({
      color: state.poiColor,
      weight: 3,
      opacity: 0.82,
      fillColor: state.poiColor,
      fillOpacity: 0.15
    });
  }

  function removeCurrentLocationLayers() {
    if (state.currentLocationMarker && state.map?.hasLayer(state.currentLocationMarker)) {
      state.map.removeLayer(state.currentLocationMarker);
    }
    if (state.currentLocationAccuracyLayer && state.map?.hasLayer(state.currentLocationAccuracyLayer)) {
      state.map.removeLayer(state.currentLocationAccuracyLayer);
    }
    state.currentLocationMarker = null;
    state.currentLocationAccuracyLayer = null;
  }

  function updateCurrentLocationLayers(latlng, accuracy) {
    const point = L.latLng(latlng);
    const radius = Math.max(1, Number(accuracy) || 1);

    if (!state.currentLocationAccuracyLayer) {
      state.currentLocationAccuracyLayer = L.circle(point, {
        radius,
        color: state.poiColor,
        weight: 3,
        opacity: 0.82,
        fillColor: state.poiColor,
        fillOpacity: 0.15,
        interactive: false,
        pmIgnore: true,
        snapIgnore: true
      }).addTo(state.map);
    } else {
      state.currentLocationAccuracyLayer.setLatLng(point);
      state.currentLocationAccuracyLayer.setRadius(radius);
      updateCurrentLocationStyle();
      if (!state.map.hasLayer(state.currentLocationAccuracyLayer)) state.currentLocationAccuracyLayer.addTo(state.map);
    }

    const tooltip = measurementTooltipHtml([
      ["CURRENT LOCATION", formatCoordinates(point.lat, point.lng)],
      ["ACCURACY", currentLocationAccuracyText(accuracy)]
    ]);

    if (!state.currentLocationMarker) {
      state.currentLocationMarker = L.marker(point, {
        icon: L.divIcon({
          className: "current-location-icon",
          html: `<svg class="current-location-glyph" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="currentColor"/><circle cx="12" cy="12" r="6" fill="none" stroke="#fff" stroke-width="2"/></svg>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        }),
        keyboard: false,
        bubblingMouseEvents: true,
        pmIgnore: true,
        snapIgnore: false,
        zIndexOffset: 1200
      }).addTo(state.map);
      appTooltipController.bind(state.currentLocationMarker, tooltip, {
        direction: "top",
        offset: L.point(0, -16),
        className: "current-location-tooltip",
        opacity: 1
      });
      state.currentLocationMarker.on("click", centerOnCurrentLocation);
      state.currentLocationMarker.on("contextmenu", showCurrentLocationContextMenu);
    } else {
      state.currentLocationMarker.setLatLng(point);
      state.currentLocationMarker.setTooltipContent(tooltip);
      if (!state.map.hasLayer(state.currentLocationMarker)) state.currentLocationMarker.addTo(state.map);
    }
  }

  function suspendCurrentLocationForAddPoi() {
    if (!state.currentLocationLatLng) return false;
    state.currentLocationAddPoiSnapshot = {
      lat: state.currentLocationLatLng.lat,
      lng: state.currentLocationLatLng.lng,
      accuracy: state.currentLocationAccuracy
    };
    state.currentLocationSuspended = true;
    removeCurrentLocationLayers();
    updateLocateButton();
    return true;
  }

  function restoreCurrentLocationAfterAddPoiCancel(layer) {
    if (!layer || state.currentLocationAddPoiPendingLayer !== layer) return;
    const snapshot = state.currentLocationAddPoiSnapshot;
    state.currentLocationAddPoiPendingLayer = null;
    state.currentLocationAddPoiSnapshot = null;
    state.currentLocationSuspended = false;
    if (snapshot) {
      state.currentLocationLatLng = L.latLng(snapshot.lat, snapshot.lng);
      state.currentLocationAccuracy = snapshot.accuracy;
      updateCurrentLocationLayers(state.currentLocationLatLng, state.currentLocationAccuracy);
    }
    updateLocateButton();
  }

  function finalizeCurrentLocationAddPoiSave(layer) {
    if (!layer || state.currentLocationAddPoiPendingLayer !== layer) return;
    state.currentLocationAddPoiPendingLayer = null;
    state.currentLocationAddPoiSnapshot = null;
    state.currentLocationSuspended = false;
    state.currentLocationLatLng = null;
    state.currentLocationFailed = false;
    state.currentLocationAccuracy = null;
    removeCurrentLocationLayers();
    updateLocateButton();
  }

  function hideCurrentLocation(showConfirmation = false) {
    removeCurrentLocationLayers();
    state.currentLocationLatLng = null;
    state.currentLocationFailed = false;
    state.currentLocationAccuracy = null;
    state.currentLocationSuspended = false;
    state.currentLocationAddPoiSnapshot = null;
    state.currentLocationAddPoiPendingLayer = null;
    hideMapContextMenu();
    updateLocateButton();
    if (showConfirmation) showToast("Current location hidden.", "success");
  }

  function centerCurrentLocationLikePoi(latlng = state.currentLocationLatLng) {
    if (!latlng || !state.map) return;
    const targetCenter = L.latLng(latlng);
    const targetZoom = Math.max(state.map.getZoom(), 13);
    const viewportCenter = state.followScreenCenter ? state.map.latLngToContainerPoint(visibleMapCenterLatLng() || state.map.getCenter()) : state.map.getSize().divideBy(2);
    const targetPoint = state.map.latLngToContainerPoint(targetCenter);
    if (state.map.getZoom() === targetZoom && targetPoint.distanceTo(viewportCenter) <= 2) {
      fadeCenterCrosshairForPoi();
      updatePoiVisibility();
      refreshCircleMeasurementWorldCopies();
      refreshPolygonMeasurementWorldCopies();
      refreshDistanceMeasurementWorldCopies();
      return;
    }
    fadeCenterCrosshairForPoi(!mapNavigationWillAnimate(targetCenter, targetZoom));
    navigateMap(targetCenter, {zoom: targetZoom});
    updatePoiVisibility();
  }

  function currentLocationGeometryInteractionActive() {
    const editingPoiShape = Boolean(
      state.editingLayer &&
      (state.editingLayer instanceof L.Polyline || state.editingLayer instanceof L.Circle)
    );
    const editingMeasurementShape = allMeasurementLayers().some(layer => layer?._measurementEditing);
    return Boolean(
      state.measureMode ||
      state.measureEditingLine ||
      editingPoiShape ||
      editingMeasurementShape ||
      state.map?.pm?.globalDrawModeEnabled?.() ||
      state.map?.pm?.globalEditModeEnabled?.()
    );
  }

  function centerOnCurrentLocation(event) {
    if (!state.currentLocationLatLng || !state.map) return;
    if (currentLocationGeometryInteractionActive()) return;
    if (event?.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
    hideMapContextMenu();
    centerCurrentLocationLikePoi();
  }

  function showCurrentLocationContextMenu(event) {
    hideContextClickMarker();
    hideImageryInfoTooltip();
    if (!state.currentLocationLatLng) return;
    if (event?.originalEvent) {
      event.originalEvent.preventDefault();
      L.DomEvent.stopPropagation(event.originalEvent);
    }
    $("map-context-menu").classList.add("hidden");
    $("poi-context-menu").classList.add("hidden");
    $("measurement-context-menu").classList.add("hidden");
    $("context-add-menu").classList.add("hidden");
    state.poiContextId = null;
    state.measureContextLayer = null;

    const menu = $("current-location-context-menu");
    menu.classList.remove("hidden");
    positionContextMenu(menu, event, state.currentLocationLatLng);
  }

  function positionContextMenu(menu, event, fallbackLatLng = null, rightReserve = 6) {
    const latlng = event?.latlng || fallbackLatLng;
    const point = event?.containerPoint || (latlng ? state.map.latLngToContainerPoint(latlng) : state.map.getSize().divideBy(2));
    const size = state.map.getSize();
    const left = Math.max(6, Math.min(point.x, size.x - menu.offsetWidth - rightReserve));
    const top = Math.max(6, Math.min(point.y, size.y - menu.offsetHeight - 6));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function isEsriWorldImageryActive() {
    if (state.currentBaseName !== "satellite") return false;
    const configured = String(state.baseLayers.satellite?._url || state.config?.satellite?.url || "");
    return /arcgisonline\.com\/.*World_Imagery\/MapServer/i.test(configured);
  }

  function hideImageryInfoTooltip() {
    if (state.imageryInfoLookupController) { try { state.imageryInfoLookupController.abort(); } catch {} }
    state.imageryInfoLookupController = null;
    state.imageryInfoLookupToken += 1;
    if (state.imageryInfoTooltip) state.imageryInfoTooltip.remove();
    state.imageryInfoTooltip = null;
    $("context-imagery-info-btn")?.classList.remove("active");
  }

  function hideContextClickMarker() {
    if (state.contextClickMarker && state.map) {
      try { state.map.removeLayer(state.contextClickMarker); } catch {}
    }
    state.contextClickMarker = null;
  }

  function showContextClickMarker(latlng) {
    if (!state.map || !latlng) return;
    if (!state.contextClickMarker) {
      state.contextClickMarker = L.marker(latlng, {
        icon: L.divIcon({
          className: "elevation-click-dot-marker",
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        }),
        interactive: false,
        bubblingMouseEvents: false,
        keyboard: false
      });
      state.contextClickMarker.options.pmIgnore = true;
      state.contextClickMarker.options.snapIgnore = true;
    } else {
      state.contextClickMarker.setLatLng(latlng);
    }
    if (!state.map.hasLayer(state.contextClickMarker)) state.contextClickMarker.addTo(state.map);
  }

  function imageryAttribute(attributes, ...names) {
    if (!attributes) return undefined;
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(attributes, name)) return attributes[name];
    }
    const keys = Object.keys(attributes);
    for (const name of names) {
      const wanted = String(name).toLowerCase();
      const key = keys.find(candidate => String(candidate).toLowerCase() === wanted);
      if (key !== undefined) return attributes[key];
    }
    return undefined;
  }

  function imageryMetadataDate(attributes = {}) {
    const value = imageryAttribute(attributes, "SRC_DATE2", "SRC_DATE", "DATE (YYYYMMDD)");
    if (value !== null && value !== undefined && value !== "") {
      const text = String(value).trim();
      if (/^[0-9]{11,}$/.test(text)) {
        const date = new Date(Number(text));
        if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
      }
      const compact = text.replace(/[^0-9]/g, "");
      if (/^[0-9]{8}$/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    }
    return "Not reported";
  }

  function imageryMetadataMeters(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric >= 99999) return "Not reported";
    const decimals = numeric < 10 ? 2 : numeric < 100 ? 1 : 0;
    return `${numeric.toFixed(decimals)} m`;
  }

  // Prefer the sampled image resolution Esri shows, preserving the source-resolution fallback.
  function imageryMetadataDisplayResolution(attributes) {
    const sampled = imageryAttribute(attributes, "SAMP_RES");
    const value = Number(sampled);
    const resolution = sampled != null && sampled !== "" && Number.isFinite(value) && value > 0 && value < 99999
      ? sampled : imageryAttribute(attributes, "SRC_RES", "RESOLUTION (M)");
    return imageryMetadataMeters(resolution);
  }
  function imageryMetadataDisplaySource(attributes) {
    const provider = String(imageryAttribute(attributes, "NICE_DESC") || "").trim();
    const sensor = String(imageryAttribute(attributes, "SRC_DESC") || "").trim();
    if (provider && sensor && provider.toLowerCase() !== sensor.toLowerCase()) return `${provider} (${sensor})`;
    return provider || sensor || String(imageryAttribute(attributes, "NICE_NAME", "SOURCE_INFO", "SOURCE", "DESCRIPTION") || "Esri World Imagery").trim();
  }
  function imageryMetadataTooltipContent(attributes) {
    const content = document.createElement("div");
    content.className = "imagery-info-content";
    const title = document.createElement("div");
    title.className = "imagery-info-title";
    title.textContent = imageryMetadataDisplaySource(attributes);
    content.appendChild(title);

    const rows = [
      ["Captured", imageryMetadataDate(attributes)],
      ["Resolution", imageryMetadataDisplayResolution(attributes)],
      ["Accuracy", imageryMetadataMeters(imageryAttribute(attributes, "SRC_ACC", "ACCURACY (M)"))]
    ];
    for (const [label, value] of rows) {
      const row = document.createElement("div");
      row.className = "imagery-info-row";
      const key = document.createElement("span");
      key.className = "imagery-info-label";
      key.textContent = label;
      const data = document.createElement("span");
      data.className = "imagery-info-value";
      data.textContent = value;
      row.append(key, data);
      content.appendChild(row);
    }
    const disclaimer = document.createElement("div");
    disclaimer.className = "imagery-info-disclaimer";
    disclaimer.textContent = "Data shown may differ from Esri.";
    content.appendChild(disclaimer);
    return content;
  }

  function showImageryInfoTooltip(latlng, content) {
    if (state.imageryInfoTooltip) state.imageryInfoTooltip.remove();
    const wrap = $("context-imagery-info-btn")?.closest(".context-add-wrap");
    if (!wrap) return;
    const tooltip = document.createElement("div");
    tooltip.className = "imagery-info-tooltip";
    tooltip.setAttribute("role", "status");
    tooltip.appendChild(content);
    wrap.appendChild(tooltip);
    state.imageryInfoTooltip = tooltip;
    $("context-imagery-info-btn")?.classList.add("active");
  }

  function effectiveEsriImageryMetadataZoom() {
    const displayZoom = Math.max(0, Math.round(Number(state.map?.getZoom?.() ?? 0)));
    if (!state.satelliteRasterOverzoom) return displayZoom;
    const layer = state.baseLayers.satellite;
    const detectedNativeZoom = Number(layer?._faNativeMaxZoom ?? layer?.options?.maxNativeZoom ?? satelliteNativeMaxZoom());
    if (!Number.isFinite(detectedNativeZoom)) return displayZoom;
    return Math.min(displayZoom, Math.max(0, Math.floor(detectedNativeZoom)));
  }

  async function queryEsriImageryMetadata(latlng, signal = undefined) {
    const zoom = effectiveEsriImageryMetadataZoom();
    const metadataLayerId = zoom >= 10 && zoom <= 23 ? 28 - zoom : 4;
    const params = new URLSearchParams({
      f: "json",
      where: "1=1",
      geometry: JSON.stringify({x: latlng.lng, y: latlng.lat, spatialReference: {wkid: 4326}}),
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "false"
    });
    const endpoint = ["https:", "", "services.arcgisonline.com", "ArcGIS", "rest", "services", "World_Imagery", "MapServer", String(metadataLayerId), "query"].join("/");
    const response = await networkFetch(`${endpoint}?${params.toString()}`, {signal}, {timeoutMs: 15000, retries: 1, label: "Esri imagery metadata"});
    if (!response.ok) throw new Error(`Esri metadata request failed (${response.status}).`);
    const data = await response.json();
    if (data?.error) {
      const detail = Array.isArray(data.error.details) ? data.error.details.find(Boolean) : "";
      throw new Error(detail || data.error.message || "Esri metadata request failed.");
    }
    const candidates = (data?.features || []).map(feature => feature?.attributes).filter(Boolean);
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      const aDate = Date.parse(imageryMetadataDate(a)) || 0;
      const bDate = Date.parse(imageryMetadataDate(b)) || 0;
      return bDate - aDate;
    });
    return candidates[0] || null;
  }

  async function showEsriImageryInfo(latlng) {
    if (!latlng || !isEsriWorldImageryActive()) return;
    if (state.imageryInfoLookupController) { try { state.imageryInfoLookupController.abort(); } catch {} }
    const controller = new AbortController();
    state.imageryInfoLookupController = controller;
    const token = ++state.imageryInfoLookupToken;
    const loading = document.createElement("div");
    loading.className = "imagery-info-content imagery-info-loading";
    loading.textContent = "Looking up World Imagery source...";
    showImageryInfoTooltip(latlng, loading);
    try {
      const attributes = await queryEsriImageryMetadata(latlng, controller.signal);
      if (token !== state.imageryInfoLookupToken || controller.signal.aborted) return;
      if (!attributes) {
        const unavailable = document.createElement("div");
        unavailable.className = "imagery-info-content imagery-info-loading";
        unavailable.textContent = "Imagery metadata unavailable at this location and zoom.";
        showImageryInfoTooltip(latlng, unavailable);
        return;
      }
      showImageryInfoTooltip(latlng, imageryMetadataTooltipContent(attributes));
    } catch (error) {
      if (token !== state.imageryInfoLookupToken || controller.signal.aborted) return;
      const unavailable = document.createElement("div");
      unavailable.className = "imagery-info-content imagery-info-loading";
      unavailable.textContent = error?.message || "Unable to load imagery metadata.";
      showImageryInfoTooltip(latlng, unavailable);
    } finally {
      if (state.imageryInfoLookupController === controller) state.imageryInfoLookupController = null;
    }
  }

  async function showMapContextMenu(event, featureAction = null) {
    if (!featureAction && event?.latlng && (!state.measureMode || state.measureMode === "distance") && !state.shapeConversion && !state.markupShapeConversion) {
      const markup = measurementLayerAtLatLng(event.latlng);
      if (markup) {
        showMeasurementContextMenu(event, markup);
        return;
      }
    }
    if (!featureAction && event && event.originalEvent && event.originalEvent._faFeatureContextHandled) return;
    hideImageryInfoTooltip();
    window.FAElevation?.hideContextMenus?.();
    $("current-location-context-menu").classList.add("hidden");
    $("measurement-context-menu").classList.add("hidden");
    state.measureContextLayer = null;
    $("poi-context-menu").classList.add("hidden");
    state.poiContextId = null;
    if (event.originalEvent) event.originalEvent.preventDefault();
    state.mapContextFeatureAction = featureAction && (typeof featureAction.hide === "function" || typeof featureAction.convert === "function") ? featureAction : null;
    const featureActions = $("context-feature-actions");
    const hideFeatureButton = $("context-hide-feature");
    const convertFeatureButton = $("context-convert-feature");
    if (featureActions && hideFeatureButton && convertFeatureButton) {
      const action = state.mapContextFeatureAction;
      const canHide = typeof action?.hide === "function";
      const canConvert = typeof action?.convert === "function";
      featureActions.classList.toggle("hidden", !canHide && !canConvert);
      hideFeatureButton.classList.toggle("hidden", !canHide);
      convertFeatureButton.classList.toggle("hidden", !canConvert);
      if (canHide) hideFeatureButton.textContent = action.label || "Hide boundary";
      if (canConvert) convertFeatureButton.textContent = action.convertLabel || "Convert to POI";
    }
    const latlng = event.latlng;
    state.measureStartLatLng = latlng ? L.latLng(latlng.lat, latlng.lng) : null;
    if (!latlng) return;
    showContextClickMarker(latlng);
    renderExternalLinks({lat: latlng.lat, lon: latlng.lng, name: "Map point"}, $("context-external-links"));
    hideContextExternalLinks();
    $("context-add-menu").classList.add("hidden");
    const imageryButton = $("context-imagery-info-btn");
    const imageryAvailable = isEsriWorldImageryActive();
    imageryButton.classList.toggle("hidden", !imageryAvailable);
    imageryButton.closest(".context-add-wrap")?.classList.toggle("imagery-unavailable", !imageryAvailable);
    if (!imageryAvailable) hideImageryInfoTooltip();
    imageryButton.disabled = !imageryAvailable;
    imageryButton.removeAttribute("title");
    const menu = $("map-context-menu");
    $("context-clear-all-measurements").disabled = !hasAnyMeasurements();
    $("context-coords-value").textContent = formatCoordinates(latlng.lat, latlng.lng);
    $("context-area-name").textContent = "Looking up area...";
    menu.classList.remove("hidden");

    positionContextMenu(menu, event, latlng, 54);

    if (state.contextLookupController) { try { state.contextLookupController.abort(); } catch {} }
    const controller = new AbortController();
    state.contextLookupController = controller;
    const token = ++state.contextLookupToken;
    const area = await reverseGeocode(latlng.lat, latlng.lng, controller.signal);
    if (state.contextLookupController === controller) state.contextLookupController = null;
    if (token === state.contextLookupToken && !controller.signal.aborted) $("context-area-name").textContent = area || "Area name unavailable";
  }

  window.FAMapContext = {
    showFeatureMenu(event, options = {}) {
      return showMapContextMenu(event, options);
    },
    recordAction(action) {
      return recordMapFeatureAction(action);
    },
    clearHistory(scope) {
      clearMapFeatureHistory(scope);
    }
  };

  function enabledProviderIds(groupId = null) {
    const ids = groupId ? (providerGroups[groupId]?.providers || []) : Object.keys(providers);
    return ids.filter(id => providers[id] && state.providerPrefs[id] !== false);
  }

  function contextExternalLinksSelection() {
    const available = Object.keys(providerGroups).filter(id => enabledProviderIds(id).length);
    let selected = state.contextExternalLinksTab;
    try { selected = sessionStorage.getItem("project-tracker-external-links-tab") || selected; } catch {}
    if (!available.includes(selected)) selected = available[0] || "maps";
    state.contextExternalLinksTab = selected;
    return {selected, available};
  }

  function appendExternalProviderLink(container, id, location) {
    const provider = providers[id];
    if (!provider || state.providerPrefs[id] === false) return;
    const a = document.createElement("a");
    const refreshHref = () => { a.href = provider.url({...location, zoom: state.map?.getZoom?.() ?? state.config?.mapStart?.zoom ?? 14}); };
    refreshHref();
    a.addEventListener("pointerdown", refreshHref);
    a.addEventListener("click", refreshHref);
    a.addEventListener("contextmenu", refreshHref);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = provider.name;
    container.appendChild(a);
  }

  function renderExternalLinks(location, box = $("external-links")) {
    box.replaceChildren();

    if (box.id === "context-external-links" || box.id === "external-links") {
      const {selected, available} = contextExternalLinksSelection();

      if (!available.length) {
        const empty = document.createElement("div");
        empty.className = "context-external-links-empty";
        empty.textContent = "No external links enabled.";
        box.appendChild(empty);
        return;
      }

      const tabs = document.createElement("div");
      tabs.className = "settings-tabs context-external-tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "External map link groups");
      for (const groupId of available) {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = groupId === selected ? "settings-tab active" : "settings-tab";
        tab.dataset.externalTab = groupId;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", groupId === selected ? "true" : "false");
        tab.textContent = providerGroups[groupId].label;
        tabs.appendChild(tab);
      }
      box.appendChild(tabs);

      const list = document.createElement("div");
      list.className = "context-external-link-list";

      const openGroup = document.createElement("button");
      openGroup.type = "button";
      openGroup.id = box.id === "context-external-links" ? "context-open-group" : "editor-open-group";
      openGroup.className = "external-open-all-chip";
      openGroup.title = "Open all enabled links in the selected group";
      openGroup.innerHTML = `<i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i><span>Open group</span>`;
      list.appendChild(openGroup);

      for (const id of enabledProviderIds(selected)) appendExternalProviderLink(list, id, location);
      box.appendChild(list);
      return;
    }

    for (const id of enabledProviderIds()) appendExternalProviderLink(box, id, location);
  }

  function openExternalLinks(location, providerIds) {
    if (!location) return;
    for (const id of providerIds) {
      const provider = providers[id];
      if (!provider || state.providerPrefs[id] === false) continue;
      window.open(provider.url({...location, zoom: state.map?.getZoom?.() ?? state.config?.mapStart?.zoom ?? 14}), "_blank", "noopener,noreferrer");
    }
  }

  function openExternalLinkGroup(location, groupId) {
    openExternalLinks(location, providerGroups[groupId]?.providers || []);
  }


  function loadProviderPrefs() {
    const defaults = Object.fromEntries(Object.keys(providers).map(key => [key, true]));
    state.providerPrefs = {...defaults, ...state.providerPrefs};

    const box = $("provider-settings");
    box.replaceChildren();

    for (const group of Object.values(providerGroups)) {
      const section = document.createElement("section");
      section.className = "provider-settings-section";

      const heading = document.createElement("div");
      heading.className = "provider-settings-heading";
      heading.textContent = group.label;
      section.appendChild(heading);

      for (const id of group.providers) {
        const provider = providers[id];
        if (!provider) continue;

        const label = document.createElement("label");
        label.className = "provider-line";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = state.providerPrefs[id] !== false;
        cb.addEventListener("change", () => {
          state.providerPrefs[id] = cb.checked;
          scheduleSettingsSave();
          const current = currentEditorLocation();
          if (current) renderExternalLinks(current);
        });

        label.append(cb, document.createTextNode(provider.name));
        section.appendChild(label);
      }

      box.appendChild(section);
    }
  }

  function currentEditorLocation() {
    const id = $("record-id").value;
    let layer = id ? state.placeLayers.get(id) : state.pendingLayer;
    if (!layer) return null;
    const geo = serializeLayer(layer);
    return {lat: geo.center.lat, lon: geo.center.lon, name: $("name").value || "Saved place"};
  }

  async function fetchAllBackupCollectionRecords(collection, sort = "created") {
    const records = [];
    let page = 1;
    while (true) {
      const data = await api(`/collections/${collection}/records?page=${page}&perPage=500&sort=${encodeURIComponent(sort)}`);
      records.push(...(data?.items || []));
      const totalPages = Math.max(1, Number(data?.totalPages || 1));
      if (page >= totalPages) break;
      page += 1;
    }
    return records;
  }

  async function flushPendingBackupSaves() {
    if (state.settingsSaveTimer || state.settingsSavedRevision < state.settingsSaveRevision) await saveSettingsNow();
    else await state.settingsSaveQueue.catch(() => {});
    if (state.settingsSavedRevision < state.settingsSaveRevision) {
      throw new Error("Settings still have unsaved changes. Check browser storage availability and try again.");
    }

    const lockedLayers = [...state.lockedMeasurements].filter(layer => layer?._measurementLocked && layer?._measurementRecordId);
    for (const layer of lockedLayers) {
      if (!state.measurementSaveTimers.has(layer)) continue;
      clearLockedMeasurementSaveTimer(layer);
      queueLockedMeasurementSave(layer, Number(layer._measurementSaveRevision) || 0);
    }
    await Promise.all(lockedLayers.map(waitForLockedMeasurementSave));
    const unsavedMeasurements = lockedLayers.filter(layer => (Number(layer._measurementSavedRevision) || 0) < (Number(layer._measurementSaveRevision) || 0));
    if (unsavedMeasurements.length) {
      throw new Error(`${unsavedMeasurements.length} locked markup${unsavedMeasurements.length === 1 ? "" : "s"} still ${unsavedMeasurements.length === 1 ? "has" : "have"} unsaved changes. Check browser storage availability and try again.`);
    }

    try { await state.elevationProfileSaveQueue; } catch {}
  }

  function backupMapViewSnapshot() {
    if (!state.map) return loadSavedMapView();
    const center = state.followScreenCenter ? (visibleMapCenterLatLng() || state.map.getCenter()) : state.map.getCenter();
    const bearing = typeof state.map.getBearing === "function" ? state.map.getBearing() : state.viewBearing;
    return {
      lat: Number(center.lat),
      lon: Number(center.lng),
      zoom: Number(state.map.getZoom()),
      bearing: normalizeViewBearing(bearing),
      anchor: state.followScreenCenter ? "crosshair" : "map"
    };
  }

  function backupLocalStorageValue(key, parseJson = false) {
    try {
      const value = localStorage.getItem(key);
      if (value === null) return null;
      return parseJson ? JSON.parse(value) : value;
    } catch {
      return null;
    }
  }

  async function exportFullBackupJson() {
    const button = $("export-json-btn");
    if (button?.disabled) return;
    const originalText = button?.textContent || "Export Backup (.json)";
    if (button) {
      button.disabled = true;
      button.textContent = "Preparing backup...";
    }
    try {
      await flushPendingBackupSaves();
      await window.FASketch?.flush?.();
      const [places, measurements, settings, sketches] = await Promise.all([
        fetchAllBackupCollectionRecords("places", "created"),
        fetchAllBackupCollectionRecords("measurements", "created"),
        fetchAllBackupCollectionRecords("settings", "created"),
        fetchAllBackupCollectionRecords("sketches", "created")
      ]);
      const rawAttachments = await window.FALocalStore.listAttachments();
      const attachments = [];
      // Include the actual binary data, not just filenames, in full disaster backups.
      for (const entry of rawAttachments) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error || new Error("Could not read an attachment for backup."));
          reader.readAsDataURL(entry.blob);
        });
        // data_url holds the full binary media content as Base64 inside JSON.
        // This preserves attachments in an offline backup; it does NOT encrypt them.
        attachments.push({id:entry.id, name:entry.name, type:entry.type,
          size:entry.size, created:entry.created, encoding:"base64-data-url", data_url:dataUrl});
      }
      const now = new Date();
      const sketchRecords = Array.isArray(sketches[0]?.data) ? sketches[0].data : [];
      const backup = {
        format: "project-tracker-disaster-backup",
        format_version: 4,
        app_build: "20261022-project-tracker-privacy-backup-1",
        exported_at: now.toISOString(),
        scope: "complete-application-data",
        counts: {
          places_total: places.length,
          places_active: places.filter(place => !place.deleted).length,
          places_trash: places.filter(place => Boolean(place.deleted)).length,
          measurements_total: measurements.length,
          sketch_records: sketchRecords.length,
          elevation_profiles: measurements.filter(record => record.type === "elevation").length,
          settings_records: settings.length,
          attachments_total: attachments.length
        },
        collections: {
          places,
          measurements,
          settings,
          sketches,
          attachments
        },
        client_state: {
          effective_settings: settingsSnapshot(),
          map_view: backupMapViewSnapshot(),
          sketches: sketchRecords,
          sketch_size: backupLocalStorageValue("fa-sketch-size-v1"),
          versatiles_overlay: backupLocalStorageValue("pt-versatiles-overlay-v1", true),
          map_tool_slot: backupLocalStorageValue("project-tracker-map-tool-slot-v1"),
          elevation_profiles: (state.elevationProfiles || []).map(profile => ({
            ...profile,
            start: profile?.start ? {...profile.start} : null,
            end: profile?.end ? {...profile.end} : null
          })),
          deployment_config: state.config && typeof state.config === "object" ? state.config : {}
        }
      };
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
      const link = document.createElement("a");
      link.href = url;
      link.download = `project-tracker-full-backup-${stamp}.json`;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
      }, 1000);
      showToast(`Full backup exported: ${places.length} places, ${measurements.length} markups, ${sketchRecords.length} sketches, ${attachments.length} attachments.`, "success");
    } catch (error) {
      void 0;
      showToast(`Backup export failed: ${error?.message || "unknown error"}`, "error");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  function setupQuickMeasurements() {
    if (document.getElementById("quick-measurements")) return;

    const panel = document.createElement("section");
    panel.id = "quick-measurements";
    panel.className = "quick-measure-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Quick measurement settings");
    panel.setAttribute("aria-hidden", "true");
    panel.tabIndex = -1;

    const coordOriginal = $("coordinate-format");
    const coordLabel = coordOriginal.closest("label").cloneNode(true);
    coordLabel.removeAttribute("id");
    const coordInput = coordLabel.querySelector("select, input");
    if (!coordInput) throw new Error("Coordinate format control not found");
    coordInput.id = "quick-coordinate-format";
    coordInput.value = coordOriginal.value;

    const coordTitle = document.createElement("span");
    coordTitle.className = "settings-group-label";
    coordTitle.textContent = "Coordinates";
    panel.append(coordTitle, coordLabel);

    const unitsTitle = document.createElement("span");
    unitsTitle.className = "settings-group-label";
    unitsTitle.textContent = "Units";
    panel.appendChild(unitsTitle);

    const group = document.createElement("div");
    group.className = "quick-measure-switches";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Measurement system");
    panel.appendChild(group);

    const systemOriginal = $("measurement-system");
    const buttons = new Map();
    const options = [
      ["metric", "Metric", "(m, km)"],
      ["imperial", "Imperial", "(ft, mi)"],
      ["nautical", "Nautical", "(m, nmi)"]
    ];

    function sync() {
      coordInput.value = coordOriginal.value;
      buttons.forEach((button, value) => {
        const active = value === systemOriginal.value;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }

    coordInput.addEventListener("change", () => {
      coordOriginal.value = coordInput.value;
      coordOriginal.dispatchEvent(new Event("change", {bubbles: true}));
      sync();
    });

    options.forEach(([value, label, units]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quick-measure-switch";
      button.dataset.value = value;
      button.setAttribute("aria-pressed", "false");

      const name = document.createElement("span");
      name.className = "quick-measure-switch-name";
      name.textContent = label;

      const unitText = document.createElement("span");
      unitText.className = "quick-measure-switch-units";
      unitText.textContent = units;

      button.append(name, unitText);
      button.addEventListener("click", () => {
        if (systemOriginal.value !== value) {
          systemOriginal.value = value;
          systemOriginal.dispatchEvent(
            new Event("change", {bubbles: true})
          );
        }
        sync();
      });

      group.appendChild(button);
      buttons.set(value, button);
    });

    coordOriginal.addEventListener("change", sync);
    systemOriginal.addEventListener("change", sync);
    $("status").parentElement.appendChild(panel);
    L.DomEvent.disableClickPropagation(panel);
    L.DomEvent.disableScrollPropagation(panel);

    function setOpen(open, focusActive = false) {
      if (open) {
        sync();
        setGotoCoordinatesOpen(false);
      }

      panel.classList.toggle("is-open", open);
      panel.setAttribute("aria-hidden", String(!open));

      const gotoOpen =
        $("goto-controls")?.classList.contains("goto-open") || false;
      $("status").setAttribute(
        "aria-expanded", String(open || gotoOpen)
      );

      if (open && focusActive) {
        const target =
          group.querySelector(".quick-measure-switch.is-active") ||
          group.querySelector(".quick-measure-switch");
        target?.focus({preventScroll: true});
      }
    }

    $("status").addEventListener("keydown", event => {
      if (!event.shiftKey || event.key !== "Enter") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const open = !panel.classList.contains("is-open");
      setOpen(open, open);
    });

    $("status").addEventListener("mousedown", event => {
      if (event.button === 1) event.preventDefault();
    });

    $("status").addEventListener("auxclick", event => {
      if (event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(!panel.classList.contains("is-open"));
    });

    $("status").addEventListener("click", () => setOpen(false));

    panel.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      $("status").focus();
    });

    document.addEventListener("pointerdown", event => {
      if (!panel.contains(event.target) &&
          !$("status").contains(event.target)) {
        setOpen(false);
      }
    });
  }

  function wireUi() {
    for (const [selector, key] of [[".custom-fields-block", "fa-custom-fields-open-v1"], ["#editor-external-links-details", "fa-external-links-open-v1"], ["#geometry-label-settings", "fa-geometry-labels-open-v1"]]) { const details = document.querySelector(selector); if (!details) continue; try { details.open = localStorage.getItem(key) === "true"; } catch { details.open = false; } details.addEventListener("toggle", () => { try { localStorage.setItem(key, String(details.open)); } catch {} }); }
    const appRoot = $("app");
    const editorPanel = $("editor");
    if (appRoot && editorPanel && editorPanel.parentElement !== appRoot) appRoot.appendChild(editorPanel);
    $("boot-retry").addEventListener("click", () => window.location.reload());
    const formatSyncTime = iso => { const t=Date.parse(iso||""); if(!Number.isFinite(t))return "Not yet"; const seconds=Math.max(0,Math.floor((Date.now()-t)/1000)); if(seconds<10)return "Just now"; if(seconds<60)return `${seconds} sec ago`; const minutes=Math.floor(seconds/60); if(minutes<60)return `${minutes} min ago`; const hours=Math.floor(minutes/60); if(hours<24)return `${hours} hr ago`; const days=Math.floor(hours/24); return `${days} day${days===1?"":"s"} ago`; };
    const syncSuccessSvg=`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M8.5 12.5L10.5 14.5L15.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const syncIcons = {
      ok: "fa-regular fa-circle-check",
      busy: "fa-solid fa-cloud-arrow-up",
      pending: "fa-solid fa-cloud-arrow-up",
      attention: "fa-solid fa-triangle-exclamation",
      offline: "fa-solid fa-cloud"
    };
    let refreshSyncPanelVersion=0;
    async function refreshSyncPanel(info=window.FAGitHubSync.snapshot()) {
      const version=++refreshSyncPanelVersion;
      const pending=await window.FALocalStore.syncStatus().then(v=>v.pending.length).catch(()=>null);
      if(version!==refreshSyncPanelVersion)return;
      const count=pending ?? info.pendingCount ?? 0;
      const mode=!info.connected?"offline":info.error||info.conflicts?"attention":info.busy?"busy":count?"pending":"ok";
      const label={offline:"Not connected",attention:"Sync needs attention",busy:"Syncing POIs...",pending:"Upload pending",ok:"Up to date"}[mode];
      const toolbar=$("sync-toolbar-btn");
      if(toolbar){
        toolbar.dataset.state=mode;
        toolbar.setAttribute("aria-label",`${label}. Open sync status`);
        toolbar.title=`${label}${count?` - ${count} pending POI change(s)`:""}. Click to view sync status.`;
        $("sync-toolbar-icon").innerHTML=mode==="ok"?syncSuccessSvg:`<i class="${syncIcons[mode]}" aria-hidden="true"></i>`;
        const indicator=$("sync-toolbar-pending");if(indicator)indicator.hidden=!(count>0);
      }
      const connection=$("sync-view-connection");if(connection)connection.textContent=label;
      const status=$("sync-view-status");if(status)status.textContent=info.status;
      const pendingField=$("sync-view-pending");if(pendingField)pendingField.textContent=pending==null?"Unavailable":String(pending);
      const conflictField=$("sync-view-conflicts");if(conflictField)conflictField.textContent=String(info.conflicts||0);
      const lastSuccess=$("sync-view-last-success");if(lastSuccess){lastSuccess.textContent=formatSyncTime(info.lastSuccessAt);lastSuccess.title=info.lastSuccessAt?new Date(info.lastSuccessAt).toLocaleString():"";}
      const error=$("sync-view-error");if(error){error.textContent=info.error||"";error.hidden=!info.error;}
    }
    window.FAGitHubSync.setHandlers(async () => {
      if(state.bootState!=="ready")return;
      // Do not replace a currently open POI editor while the user is typing.
      if(!$("editor")?.classList.contains("hidden")) {showToast("New research downloaded. Close the editor to refresh the map.","info");return;}
      try {await loadPlaces();}catch{showToast("Research downloaded, but map refresh failed. Reopen the application.","error");}
    }, info => {void refreshSyncPanel(info);}, progress => {
      if (state.bootState === "loading") showBootProgress(progress.percent, progress.detail);
    });
    window.addEventListener("pt-local-change",()=>void refreshSyncPanel());
    async function connectAndStart(token,passphrase) {
      await window.FAGitHubSync.connect({token,passphrase});
      if(!await initializeLocalApp())throw new Error("Could not load the map after connecting.");
      try {await window.PTRememberedLogin.save(token,passphrase);}
      catch (error) {showToast(`Connected, but your browser could not save the login (${error?.message || "storage unavailable"}). You may need to enter it next time.`,"error");}
      void refreshSyncPanel();
    }
    $("github-connect-form").addEventListener("submit",async event=>{
      event.preventDefault();
      const button=$("github-connect-btn");button.disabled=true;
      setBootState("loading","Connecting to the private GitHub repository...");
      showBootProgress(0, "Starting secure connection");
      try {
        await connectAndStart($("github-token").value,$("github-passphrase").value);
        $("github-token").value="";$("github-passphrase").value="";
      }catch(e){setBootState("setup",e?.message||"GitHub connection failed.");}
      finally{button.disabled=false;}
    });
    const syncButton=$("sync-toolbar-btn");
    const syncPopover=$("sync-popover"); setInterval(()=>{if(syncPopover?.classList.contains("hidden"))return;const el=$("sync-view-last-success"),iso=window.FAGitHubSync.snapshot().lastSuccessAt;if(el){el.textContent=formatSyncTime(iso);el.title=iso?new Date(iso).toLocaleString():"";}},15000);
    function closeSyncPopover() {
      syncPopover?.classList.add("hidden");
      syncButton?.setAttribute("aria-expanded","false");
    }
    function openSyncPopover() {
      $("add-menu")?.classList.add("hidden");
      // Keep this a lightweight, nonmodal panel while the map stays usable.
      syncPopover?.classList.remove("hidden");
      syncPopover.style.left=`${syncButton.offsetLeft}px`;
      syncButton?.setAttribute("aria-expanded","true");
      void refreshSyncPanel();
      syncPopover?.focus({preventScroll:true});
    }
    syncButton?.setAttribute("aria-controls","sync-popover");
    syncButton?.setAttribute("aria-expanded","false");
    syncButton?.addEventListener("click",event=>{
      event.stopPropagation();
      if(syncPopover?.classList.contains("hidden"))openSyncPopover();
      else closeSyncPopover();
    });
    $("sync-popover-close")?.addEventListener("click",closeSyncPopover);
    syncPopover?.addEventListener("click",event=>event.stopPropagation());
    document.addEventListener("pointerdown",event=>{
      if(!syncPopover?.classList.contains("hidden") && !syncPopover.contains(event.target) && !syncButton?.contains(event.target))closeSyncPopover();
    });
    document.addEventListener("keydown",event=>{
      if(event.key==="Escape" && !syncPopover?.classList.contains("hidden")){
        closeSyncPopover();syncButton?.focus();event.stopPropagation();
      }
    });
    $("github-sync-now-btn")?.addEventListener("click",()=>void window.FAGitHubSync.sync());
$("github-forget-login-btn")?.addEventListener("click",async()=>{
      if(window.FAGitHubSync.snapshot().busy){showToast("A sync is in progress. Try again when it finishes.","error");return;}
      const pending=(await window.FALocalStore.syncStatus()).pending.length;
      if(!window.confirm(`Forget the stored token and passphrase on this device, disconnect, and return to the login screen? ${pending ? `${pending} unsent change(s) will remain in this browser until you reconnect.` : ""}`))return;
      try{await window.PTRememberedLogin.clear();window.FAGitHubSync.disconnect();window.location.reload();}
      catch(e){showToast(`Could not clear the saved login: ${e.message}`,"error");}
    });
    $("github-publish-local-btn")?.addEventListener("click",async()=>{
      if(!window.FAGitHubSync.snapshot().connected){showToast("Connect to GitHub first.","error");return;}
      if(!window.confirm("Publish existing browser POIs and their attachments to the encrypted GitHub repository? Sketches and measurements remain local. Review POIs before sharing."))return;
      try{const count=await window.FAGitHubSync.publishExisting();showToast(`${count} existing POIs queued for encrypted sync.`,"success");window.FAGitHubSync.queueSoon();}
      catch(e){showToast(`Publish failed: ${e.message}`,"error");}
    });
    $("trash-btn").addEventListener("click", () => setTrashMode(!state.trashMode));
    window.addEventListener("resize", updateMapViewportForSidebar);
    $("sidebar-toggle").addEventListener("click", () => {
      const collapsed = !$("app").classList.contains("sidebar-collapsed");
      $("app").classList.toggle("sidebar-collapsed", collapsed);
      updateMapViewportForSidebar();
      scheduleSatelliteNativeZoomDetection(320);
      const button = $("sidebar-toggle");
      const icon = button.querySelector("i");
      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
      button.setAttribute("aria-label", collapsed ? "Show sidebar" : "Hide sidebar");
      button.title = collapsed ? "Show sidebar" : "Hide sidebar";
      if (icon) icon.className = collapsed ? "fa-solid fa-chevron-right" : "fa-solid fa-chevron-left";
    });
    $("place-form").addEventListener("submit", saveForm);
    $("history-btn").addEventListener("click", showPlaceHistory);
    $("history-back").addEventListener("click", showPlaceEditorView);
    $("duplicate-btn").addEventListener("click", duplicateCurrent);
    $("delete-btn").addEventListener("click", deleteCurrent);
    $("editor-close").addEventListener("click", closeEditorWithPrompt);
    L.DomEvent.disableClickPropagation($("polygon-drag-wrap"));
    L.DomEvent.disableScrollPropagation($("polygon-drag-wrap"));
    $("polygon-drag-btn").addEventListener("click", () => {
      $("shape-convert-menu").classList.add("hidden");
      $("polygon-drag-menu").classList.toggle("hidden");
      requestAnimationFrame(syncShapeConvertOffsetForDragMenu);
    });
    $("polygon-drag-menu").addEventListener("click", event => {
      const modeButton = event.target.closest("[data-polygon-drag-mode]");
      if (modeButton) setPolygonDragMode(modeButton.dataset.polygonDragMode);
      if (event.target.closest("#polygon-drag-reset")) resetPolygonDisplayCenter();
      $("polygon-drag-menu").classList.add("hidden");
      syncShapeConvertOffsetForDragMenu();
    });
    L.DomEvent.disableClickPropagation($("shape-convert-wrap"));
    L.DomEvent.disableScrollPropagation($("shape-convert-wrap"));
    $("shape-convert-btn").addEventListener("click", () => {
      $("polygon-drag-menu").classList.add("hidden");
      syncShapeConvertOffsetForDragMenu();
      $("shape-convert-menu").classList.toggle("hidden");
    });
    $("shape-convert-menu").addEventListener("click", event => {
      const button = event.target.closest("[data-shape-convert]");
      if (!button || button.disabled) return;
      $("shape-convert-menu").classList.add("hidden");
      convertEditingShape(button.dataset.shapeConvert);
    });
    $("external-links").addEventListener("click", event => {
      const location = currentEditorLocation();
      const tabButton = event.target.closest("[data-external-tab]");
      if (tabButton) {
        event.preventDefault();
        state.contextExternalLinksTab = tabButton.dataset.externalTab;
        try { sessionStorage.setItem("project-tracker-external-links-tab", state.contextExternalLinksTab); } catch {}
        if (location) renderExternalLinks(location);
        return;
      }
      if (event.target.closest("#editor-open-group")) {
        event.preventDefault();
        if (location) openExternalLinkGroup(location, state.contextExternalLinksTab);
      }
    });

    setupQuickMeasurements();
    L.DomEvent.disableClickPropagation($("status"));
    L.DomEvent.disableScrollPropagation($("status"));
    L.DomEvent.disableClickPropagation($("goto-controls"));
    L.DomEvent.disableScrollPropagation($("goto-controls"));
    $("status").addEventListener("click", () => {
      setGotoCoordinatesOpen(!$("goto-controls").classList.contains("goto-open"));
    });
    $("status").addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setGotoCoordinatesOpen(!$("goto-controls").classList.contains("goto-open"));
      }
    });
    $("invert-crosshair-toggle").addEventListener("change", event => {
      state.invertCrosshair = event.target.checked;
      $("map-center-crosshair").classList.toggle("inverted", state.invertCrosshair);
      scheduleSettingsSave();
    });
    $("center-coords-toggle").addEventListener("change", event => {
      state.followScreenCenter = event.target.checked;
      $("invert-crosshair-setting").classList.toggle("hidden", !state.followScreenCenter);
      updateCenterCrosshairVisibility();
      wakeCenterCrosshair();
      if (state.followScreenCenter) scheduleCenterCrosshairIdleFade();
      scheduleSettingsSave();
      updateCoordinateReadout();
      updateWorldStatus();
      saveMapView();
    });
    $("goto-coords-btn").addEventListener("click", goToCoordinates);
    $("goto-coords").addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        goToCoordinates();
      }
    });

    L.DomEvent.disableClickPropagation($("measurement-context-menu"));
    L.DomEvent.disableScrollPropagation($("measurement-context-menu"));
    $("measurement-context-menu").addEventListener("click", async event => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      const layer = state.measureContextLayer;
      if (!layer && button.id !== "measurement-context-clear-all") return;
      if (button.id === "measurement-context-color") {
        event.stopPropagation();

        const palette = $("measurement-context-color-menu");
        if (!palette) return;

        const open = palette.classList.contains("hidden");
        $("measurement-shape-convert-menu")?.classList.add("hidden");

        if (open) {
          const currentColor = String(
            layer?.options?.color || ""
          ).toLowerCase();

          palette.querySelectorAll("[data-measurement-color]").forEach(swatch => {
            const selected =
              String(swatch.dataset.measurementColor).toLowerCase() === currentColor;

            swatch.classList.toggle("is-selected", selected);
            swatch.setAttribute("aria-pressed", String(selected));
          });
        }

        palette.classList.toggle("hidden", !open);
        button.setAttribute("aria-expanded", String(open));
        return;
      }

      if (button.dataset.measurementColor) {
        event.stopPropagation();

        const palette = $("measurement-context-color-menu");
        const selectedColor = String(
          button.dataset.measurementColor || ""
        ).toLowerCase();

        const changed = changeMeasurementColor(layer, selectedColor);

        if (changed && palette) {
          palette.querySelectorAll("[data-measurement-color]").forEach(swatch => {
            const selected =
              String(swatch.dataset.measurementColor).toLowerCase() === selectedColor;

            swatch.classList.toggle("is-selected", selected);
            swatch.setAttribute("aria-pressed", String(selected));
          });
        }

        // Keep the palette open so additional colors can be selected.
        if (changed) showToast("Markup color updated.", "success");
        return;
      }

      if (button.id === "measurement-shape-convert-btn") {
        event.stopPropagation();
        $("measurement-context-color-menu")?.classList.add("hidden");
        $("measurement-context-color")?.setAttribute("aria-expanded", "false");
        syncMeasurementShapeConvertControl(layer);
        $("measurement-shape-convert-menu").classList.toggle("hidden");
        return;
      }
      const markupConvertTarget = button.dataset.measurementShapeConvert;
      if (markupConvertTarget) {
        event.stopPropagation();
        $("measurement-shape-convert-menu").classList.add("hidden");
        hideMapContextMenu();
        await convertMarkupShape(layer, markupConvertTarget, event);
        return;
      }
      if (button.id === "measurement-context-move") {
        event.stopPropagation();
        setMeasurementMoveMode(layer, !layer._measurementMoveEnabled);
        return;
      }
      if (button.id === "measurement-context-lock") {
        hideMapContextMenu();
        await setMeasurementLocked(layer, !layer._measurementLocked);
        return;
      }
      if (button.id === "measurement-context-tooltip") {
        hideMapContextMenu();
        toggleMeasurementTooltip(layer);
        return;
      }
      if (button.id === "measurement-context-edit") {
        const next = !layer._measurementEditing;
        hideMapContextMenu();
        setMeasurementEditing(layer, next);
        if (next) showToast("Markup editing enabled.", "success");
        return;
      }
      if (button.id === "measurement-context-resequence") {
        hideMapContextMenu();
        await resequenceMarkerMarkups();
        return;
      }
      if (button.id === "measurement-context-duplicate") {
        hideMapContextMenu();
        await duplicateMeasurement(layer);
        return;
      }
      if (button.id === "measurement-context-convert") {
        await convertMeasurementToPoi(layer);
        return;
      }
      if (button.id === "measurement-context-clear") {
        hideMapContextMenu();
        await clearMeasurement(layer);
        if (state.measureLayer === layer) state.measureMode = null; syncMarkupDrawInteractionMode();
        return;
      }
      if (button.id === "measurement-context-clear-all") {
        hideMapContextMenu();
        await clearAllMeasurements();
      }
    });
    L.DomEvent.disableClickPropagation($("poi-context-menu"));
    L.DomEvent.disableScrollPropagation($("poi-context-menu"));
    $("poi-context-menu").addEventListener("click", async event => {
      const button = event.target.closest("button");
      if (!button) return;
      const id = state.poiContextId;
      if (!id) return;
      if (button.id === "poi-context-copy") {
        const layer = state.placeLayers.get(id);
        if (layer) {
          const center = layerCenter(layer);
          await copyText(formatCoordinates(center.lat, center.lng));
          showToast("Coordinates copied.", "success");
        }
        hideMapContextMenu();
        return;
      }
      hideMapContextMenu();
      if (button.id === "poi-context-edit") await editPlaceFromContext(id);
      else if (button.id === "poi-context-duplicate") await duplicatePlaceFromContext(id);
      else if (button.id === "poi-context-delete") await deletePlaceFromContext(id);
    });


    $("context-coords").addEventListener("click", async () => {
      await copyText($("context-coords-value").textContent);
      showToast("Coordinates copied.", "success");
      hideMapContextMenu();
    });
    L.DomEvent.disableClickPropagation($("context-external-links-panel"));
    L.DomEvent.disableScrollPropagation($("context-external-links-panel"));
    $("context-external-links-panel").addEventListener("click", event => {
      event.stopPropagation();
      const latlng = state.measureStartLatLng;
      const location = latlng ? {lat: latlng.lat, lon: latlng.lng, name: "Map point"} : null;
      const tabButton = event.target.closest("[data-external-tab]");
      if (tabButton) {
        event.preventDefault();
        state.contextExternalLinksTab = tabButton.dataset.externalTab;
        try { sessionStorage.setItem("project-tracker-external-links-tab", state.contextExternalLinksTab); } catch {}
        if (location) renderExternalLinks(location, $("context-external-links"));
        positionContextExternalLinks();
        return;
      }
      if (event.target.closest("#context-open-group")) {
        event.preventDefault();
        if (location) openExternalLinkGroup(location, state.contextExternalLinksTab);
        return;
      }
      if (event.target.closest("a")) setTimeout(hideMapContextMenu, 0);
    });
    $("map-context-menu").addEventListener("click", async (event) => {
      const hideFeatureButton = event.target.closest("#context-hide-feature");
      if (hideFeatureButton) {
        const action = state.mapContextFeatureAction;
        hideMapContextMenu();
        try { await action?.hide?.(); } catch (error) {
          void 0;
          showToast(error?.message || "Unable to hide feature.");
        }
        return;
      }
      const convertFeatureButton = event.target.closest("#context-convert-feature");
      if (convertFeatureButton) {
        const action = state.mapContextFeatureAction;
        hideMapContextMenu();
        try { await action?.convert?.(); } catch (error) {
          void 0;
          showToast(error?.message || "Unable to convert feature to POI.");
        }
        return;
      }
      const externalLinksButton = event.target.closest("#context-external-links-btn");
      if (externalLinksButton) {
        event.preventDefault();
        event.stopPropagation();
        toggleContextExternalLinks();
        return;
      }
      const clearAllMeasurementsButton = event.target.closest("#context-clear-all-measurements");
      if (clearAllMeasurementsButton) {
        hideMapContextMenu();
        await clearAllMeasurements();
        return;
      }
      const imageryInfoButton = event.target.closest("#context-imagery-info-btn");
      if (imageryInfoButton) {
        hideContextExternalLinks();
        event.preventDefault();
        event.stopPropagation();
        const latlng = state.measureStartLatLng;
        if (latlng) await showEsriImageryInfo(latlng);
        return;
      }
      if (event.target.closest("#context-add-btn")) {
        hideContextExternalLinks();
        event.stopPropagation();
        $("context-add-menu").classList.toggle("hidden");
        return;
      }
      const drawButton = event.target.closest("[data-context-draw]");
      if (drawButton) {
        if (state.pendingLayer) {
          hideMapContextMenu();
          showToast("Save, Delete, or Close current POI prior to adding another.");
          showEditorPanel();
          $("name").focus();
          return;
        }
        const mainDrawButton = $("add-menu").querySelector(`[data-draw="${drawButton.dataset.contextDraw}"]`);
        hideMapContextMenu();
        if (mainDrawButton) mainDrawButton.click();
        return;
      }
      const button = event.target.closest("[data-measure]");
      if (button) startMeasurement(button.dataset.measure);
    });
    document.addEventListener("click", (event) => {
      if (!$("polygon-drag-wrap").contains(event.target)) {
        $("polygon-drag-menu").classList.add("hidden");
        syncShapeConvertOffsetForDragMenu();
      }
      if (!$("shape-convert-wrap").contains(event.target)) $("shape-convert-menu").classList.add("hidden");
      if (!$("map-context-menu").contains(event.target) && !$("poi-context-menu").contains(event.target) && !$("measurement-context-menu").contains(event.target) && !$("current-location-context-menu").contains(event.target) && !$("context-external-links-panel").contains(event.target)) hideMapContextMenu();
      if (!$("status").contains(event.target) && !$("goto-controls").contains(event.target)) setGotoCoordinatesOpen(false);
    });
    // On the map, configured shortcuts take precedence over native control activation.
    const mapKeyboardUiTarget = target => Boolean(target?.closest?.(
      "input, textarea, select, [contenteditable], [role=textbox], [role=combobox], [role=slider], #config-panel, #editor, #goto-controls, #shortcut-cheat-sheet, [role=dialog], [role=menu], .leaflet-popup"
    ) || target?.isContentEditable);
    const mapKeyboardActionTarget = target => target?.closest?.(
      "button, a[href], summary, [role=button], [role=link], .leaflet-interactive"
    );
    document.addEventListener("keydown", event => {
      if (state.bootState !== "ready" || mapKeyboardUiTarget(event.target)) return;
      if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (document.activeElement !== document.body) document.activeElement?.blur?.();
        return;
      }
      const space = event.key === " " || event.key === "Spacebar";
      if (space) event.preventDefault();
      if (!mapKeyboardActionTarget(event.target)) return;
      const sketchKey = !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey &&
        (space || ["1", "2", "3", "4", "5", "6", "h"].includes(String(event.key).toLowerCase()));
      if (sketchKey && document.body.classList.contains("fa-sketch-open")) return;
      const pressed = shortcutFromKeyboardEvent(event).toLowerCase();
      if (pressed && SHORTCUT_DEFINITIONS.some(definition => normalizeShortcutBinding(state.keyboardShortcuts[definition.id]).toLowerCase() === pressed)) {
        event.preventDefault();
        void handleConfiguredShortcut(event);
        event.stopImmediatePropagation();
      } else if (space || event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    document.addEventListener("keyup", event => {
      if (state.bootState === "ready" && !mapKeyboardUiTarget(event.target) && mapKeyboardActionTarget(event.target) &&
          (event.key === " " || event.key === "Spacebar" || event.key === "Enter")) event.preventDefault();
    }, true);
    document.addEventListener("keydown", async (event) => {
      if (state.bootState !== "ready") return;
      const keyboardTarget = event.target;
      const keyboardTargetEditable = Boolean(keyboardTarget && (keyboardTarget.matches?.("input, textarea, select") || keyboardTarget.isContentEditable));
      if (!$("editor").classList.contains("hidden") && !keyboardTargetEditable && !event.altKey && (event.ctrlKey || event.metaKey)) {
        const key = String(event.key || "").toLowerCase();
        if (key === "z" && !event.shiftKey && undoEditorGeometry()) {
          event.preventDefault();
          return;
        }
        if (((key === "z" && event.shiftKey) || key === "y") && redoEditorGeometry()) {
          event.preventDefault();
          return;
        }
      }
      if ($("editor").classList.contains("hidden") && !keyboardTargetEditable && !event.altKey && (event.ctrlKey || event.metaKey)) {
        const key = String(event.key || "").toLowerCase();
        if (key === "z" && !event.shiftKey && await undoMapChange()) {
          event.preventDefault();
          return;
        }
        if (((key === "z" && event.shiftKey) || key === "y") && await redoMapChange()) {
          event.preventDefault();
          return;
        }
      }
      const shortcutTargetBlocked = Boolean(keyboardTarget && (keyboardTarget.matches?.("input, textarea, select, button, a") || keyboardTarget.isContentEditable));
      if (!shortcutTargetBlocked && await handleConfiguredShortcut(event)) return;
      if (event.key !== "Escape") return;
      if (state.markupShapeConversion) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelMarkupShapeConversion();
        return;
      }
      if (state.shapeConversion) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelPolygonShapeConversion();
        return;
      }
      let handled = false;
      const shortcutCheatSheet = $("shortcut-cheat-sheet");
      if (shortcutCheatSheet && !shortcutCheatSheet.classList.contains("hidden")) {
        shortcutCheatSheet.classList.add("hidden");
        handled = true;
      }
      if ($("goto-controls").classList.contains("goto-open")) {
        setGotoCoordinatesOpen(false);
        handled = true;
      }
      if (!$("config-panel").classList.contains("hidden")) {
        $("config-panel").classList.add("hidden");
        handled = true;
      }
      if (!$("map-context-menu").classList.contains("hidden") || !$("poi-context-menu").classList.contains("hidden") || !$("measurement-context-menu").classList.contains("hidden") || !$("current-location-context-menu").classList.contains("hidden")) {
        hideMapContextMenu();
        handled = true;
      }
      if (!$("add-menu").classList.contains("hidden")) {
        $("add-menu").classList.add("hidden");
        handled = true;
      }
      if (!$("editor").classList.contains("hidden")) {
        handled = true;
        closeEditorWithPrompt();
      }
      if (state.measureMode) {
        state.map.pm.disableDraw();
        removeMeasurementTooltip(state.measureWorkingLayer);
        state.measureWorkingLayer = null;
        state.measureMode = null; syncMarkupDrawInteractionMode();
        clearMarkerMeasurementPreview();
        state.measurePendingColor = null;
        state.measurePendingMarkerLabel = "";
        clearMarkerMeasurementPreview();
        state.measurePendingColor = null;
        handled = true;
      }
      if (handled) event.preventDefault();
    });

    document.addEventListener("keyup", event => {
      const releasedKey = String(event.key || "").toLowerCase();
      if (releasedKey === "shift") {
        if (hideLabelsShortcutHeld) event.preventDefault();
        setHideShortcutShiftHeld(false);
        return;
      }
      if (!hideLabelsShortcutHeld) return;
      if (releasedKey !== hideLabelsShortcutKey.toLowerCase()) return;
      event.preventDefault();
      setHideLabelsShortcutHeld(false);
    });
    window.addEventListener("blur", resetHideShortcutState);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) resetHideShortcutState();
    });

    $("coords").addEventListener("click", async () => {
      if (!$("coords").value) return;
      await copyText($("coords").value);
      $("coords").blur();
      showToast("Coordinates copied.", "success");
    });



    $("add-btn").addEventListener("click", () => {
      if (state.pendingLayer) {
        $("add-menu").classList.add("hidden");
        showToast("Save, Delete, or Close current POI prior to adding another.");
        showEditorPanel();
        $("name").focus();
        return;
      }
      $("add-menu").classList.toggle("hidden");
    });
    $("add-menu").addEventListener("click", (event) => {
      const button = event.target.closest("[data-draw]");
      if (!button) return;
      const shape = button.dataset.draw;
      $("add-menu").classList.add("hidden");

      const options = shape === "Marker"
        ? {markerStyle: {icon: markerIcon({icon: "location-dot"})}}
        : {
            templineStyle: {color: state.poiColor, weight: 2, fillOpacity: state.fillOpacity},
            hintlineStyle: {color: state.poiColor, weight: 2, dashArray: "5,5"},
            pathOptions: {color: state.poiColor, weight: 2, fillOpacity: state.fillOpacity}
          };

      state.map.pm.enableDraw(shape, options);
    });

    $("settings-tabs").addEventListener("click", event => {
      const tab = event.target.closest("[data-settings-tab]");
      if (tab) setSettingsTab(tab.dataset.settingsTab);
    });
    $("settings-tabs").addEventListener("keydown", handleSettingsTabKeydown);
    restoreSettingsTab();

    window.FAElevationHost = {
      recordAction(action) { return recordMapFeatureAction(action); },
      isLineMeasurementEditing() { return state.measureMode === "distance" && Boolean(state.measureEditingLine?._measurementEditing); },
      loadProfiles() { return state.elevationProfiles.map(profile => ({...profile, start: {...profile.start}, end: {...profile.end}})); },
      saveProfiles(profiles) { return saveElevationProfilesToMeasurements(profiles); },
      formatDistance(meters) { return formatMeasuredDistance(meters); },
      formatElevation(meters) { return formatMeasuredElevation(meters); },
      getMeasurementSystem() { return state.measurementSystem; },
      formatBearing(from, to) { return formatMeasurementBearing(from, to); },
      formatCoordinates(lat, lon) { return formatCoordinates(lat, lon); },
      tooltipHtml(rows) { return measurementTooltipHtml(rows); },
      snapLatLng(latlng, maxDistance = 20, ignoreLayer = null, preview = false) {
        return elevationProfileSnapLatLng(latlng, maxDistance, ignoreLayer, preview);
      },
      clearSnapPreview() { clearPoiSnapCoveredMarker(); },
      async addPoiAtLatLng(latlng, customFields = null) {
        const before = state.pendingLayer;
        await addPoiAtLatLng(latlng, false, customFields);
        return Boolean(state.pendingLayer && state.pendingLayer !== before);
      },
      hideContextMenus() {
        hideMapContextMenu();
      },
      async createLineMeasurement(start, end, profileSnapshot = null) {
        if (!state.map || !start || !end) return false;
        if (state.measureEditingLine) setMeasurementEditing(state.measureEditingLine, false);
        if (state.measureLayer) {
          commitMeasurementHistory(state.measureLayer);
          if (!state.measurementReplacementBefore) state.measurementReplacementBefore = captureMeasurementState();
          await clearMeasurement(state.measureLayer, {recordHistory: false});
        }
        const points = [L.latLng(start), L.latLng(end)];
        const color = nextMarkupColor();
        const line = L.polyline(points, {
          color,
          weight: 2,
          opacity: 0,
          fillOpacity: 0,
          interactive: false,
          bubblingMouseEvents: false,
          snapIgnore: true
        }).addTo(state.map);
        line._measurementMode = "distance";
        line._measurementMarkers = points.map(point => createDistanceMeasurementMarker(point, line, false));
        const preserveLocked = Boolean(profileSnapshot?.locked);
        const preserveTooltipHidden = Boolean(profileSnapshot?.tooltipHidden);
        registerMeasurementLayer(line, "distance", {locked: false, temporary: false, tooltipHidden: preserveTooltipHidden, color, editable: false});
        if (preserveLocked) {
          try {
            await createLockedMeasurementRecord(line);
            line._measurementLocked = true;
            state.lockedMeasurements.add(line);
            if (state.measureLayer === line) {
              line._measurementMarkers = state.measureMarkers;
              line._measurementHitLayer = state.measureHitLayer || line._measurementHitLayer;
              state.measureLayer = null;
              state.measureMarkers = [];
              state.measureHitLayer = null;
              state.measureMode = null; syncMarkupDrawInteractionMode();
            }
          } catch (error) {
            await clearMeasurement(line, {recordHistory: false});
            showToast(`Unable to convert locked elevation profile: ${error.message}`);
            return false;
          }
        }
        if (profileSnapshot) pushMeasurementProfileConversionAction(line, profileSnapshot);
        else pushMeasurementCreationAction(line);
        state.measureMode = null; syncMarkupDrawInteractionMode();
        state.measureStartLatLng = null;
        state.measureWorkingLayer = null;
        showToast("Converted to line markup.", "success");
        return true;
      }
    };

    window.FAUI = window.FAUI || {};
    window.FAUI.openExclusive = owner => {
      document.querySelectorAll("[data-fa-exclusive]").forEach(element => {
        if (element.dataset.faExclusive !== owner) element.classList.add("hidden");
      });
      const osmInfo = $("osm-brightness-info");
      osmInfo?.classList.remove("legend-pinned");
      $("osm-brightness-info-button")?.setAttribute("aria-expanded", "false");
      const satelliteInfo = $("satellite-brightness-info");
      satelliteInfo?.classList.remove("legend-pinned");
      $("satellite-brightness-info-button")?.setAttribute("aria-expanded", "false");
    };

    window.FAOverpassHost = {
      showActiveToolButtons() { return state.showActiveLayerButtons !== false; },
      toast(message, tone = "info") { showToast(message, tone); },
      beforeOpen() {
        if (!closeEditorWithPrompt()) return false;
        $("config-panel").classList.add("hidden");
        return true;
      }
    };

    $("config-btn").addEventListener("click", () => {
      const opening = $("config-panel").classList.contains("hidden");
      if (!opening) {
        $("config-panel").classList.add("hidden");
        return;
      }
      if (!closeEditorWithPrompt()) return;
      window.FAUI?.openExclusive?.("config");
      $("config-panel").classList.remove("hidden");
    });
    $("config-close").addEventListener("click", () => $("config-panel").classList.add("hidden"));
    $("export-json-btn").addEventListener("click", exportFullBackupJson);
    window.PTReportExport?.setup({
      async getPlaces() {
        await flushPendingBackupSaves();
        return fetchAllBackupCollectionRecords("places", "created");
      },
      notify(message, tone) { showToast(message, tone); }
    });
    $("basemap-toggle").addEventListener("click", () => switchBasemap(state.currentBaseName === "satellite" ? "osm" : "satellite"));

    const osmBrightnessInfo = $("osm-brightness-info");
    const osmBrightnessInfoButton = $("osm-brightness-info-button");
    const closeOsmBrightnessInfo = () => {
      osmBrightnessInfo?.classList.remove("legend-pinned");
      osmBrightnessInfoButton?.setAttribute("aria-expanded", "false");
    };
    osmBrightnessInfoButton?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const pinned = !osmBrightnessInfo.classList.contains("legend-pinned");
      osmBrightnessInfo.classList.toggle("legend-pinned", pinned);
      osmBrightnessInfoButton.setAttribute("aria-expanded", String(pinned));
      if (pinned) applyOsmBrightness();
    });
    $("osm-raster-overzoom")?.addEventListener("change", event => setOsmRasterOverzoom(event.target.checked));
    $("osm-brightness-quick")?.addEventListener("input", event => {
      state.osmBrightness = clampSatelliteBrightness(Number(event.target.value) / 100);
      applyOsmBrightness();
    });
    $("osm-brightness-quick")?.addEventListener("change", scheduleSettingsSave);
    $("osm-brightness-quick-reset")?.addEventListener("click", () => {
      state.osmBrightness = 1;
      applyOsmBrightness();
      scheduleSettingsSave();
    });
    if (osmBrightnessInfo) { L.DomEvent.disableClickPropagation(osmBrightnessInfo); L.DomEvent.disableScrollPropagation(osmBrightnessInfo); }
    document.addEventListener("pointerdown", event => { if (osmBrightnessInfo && !osmBrightnessInfo.contains(event.target)) closeOsmBrightnessInfo(); }, true);
    document.addEventListener("wheel", event => { if (osmBrightnessInfo && !osmBrightnessInfo.contains(event.target)) closeOsmBrightnessInfo(); }, true);
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeOsmBrightnessInfo(); });
    state.closeOsmBrightnessInfo = closeOsmBrightnessInfo;

    const satelliteBrightnessInfo = $("satellite-brightness-info");
    const satelliteBrightnessInfoButton = $("satellite-brightness-info-button");
    const closeSatelliteBrightnessInfo = () => {
      satelliteBrightnessInfo?.classList.remove("legend-pinned");
      satelliteBrightnessInfoButton?.setAttribute("aria-expanded", "false");
    };
    satelliteBrightnessInfoButton?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const pinned = !satelliteBrightnessInfo.classList.contains("legend-pinned");
      satelliteBrightnessInfo.classList.toggle("legend-pinned", pinned);
      satelliteBrightnessInfoButton.setAttribute("aria-expanded", String(pinned));
      if (pinned) applySatelliteBrightness();
    });
    $("satellite-raster-overzoom")?.addEventListener("change", event => setSatelliteRasterOverzoom(event.target.checked));
    $("satellite-brightness-quick")?.addEventListener("input", event => {
      state.satelliteBrightness = clampSatelliteBrightness(Number(event.target.value) / 100);
      applySatelliteBrightness();
    });
    $("satellite-brightness-quick")?.addEventListener("change", scheduleSettingsSave);
    $("satellite-brightness-quick-reset")?.addEventListener("click", () => {
      state.satelliteBrightness = 1;
      applySatelliteBrightness();
      scheduleSettingsSave();
    });
    if (satelliteBrightnessInfo) { L.DomEvent.disableClickPropagation(satelliteBrightnessInfo); L.DomEvent.disableScrollPropagation(satelliteBrightnessInfo); }
    document.addEventListener("pointerdown", event => { if (satelliteBrightnessInfo && !satelliteBrightnessInfo.contains(event.target)) closeSatelliteBrightnessInfo(); }, true);
    document.addEventListener("wheel", event => { if (satelliteBrightnessInfo && !satelliteBrightnessInfo.contains(event.target)) closeSatelliteBrightnessInfo(); }, true);
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeSatelliteBrightnessInfo(); });
    state.closeSatelliteBrightnessInfo = closeSatelliteBrightnessInfo;
    $("border-toggle").addEventListener("change", event => toggleBorders(event.target.checked));
    $("border-shared-toggle")?.addEventListener("change", event => updateBorderAppearance("shared", "Visible", event.target.checked));
    $("border-shared-sea-toggle")?.addEventListener("change", event => updateBorderAppearance("shared-sea", "Visible", event.target.checked));
    $("border-outer-toggle")?.addEventListener("change", event => updateBorderAppearance("outer", "Visible", event.target.checked));
    $("border-shared-color")?.addEventListener("input", event => updateBorderAppearance("shared", "Color", event.target.value));
    $("border-shared-sea-color")?.addEventListener("input", event => updateBorderAppearance("shared-sea", "Color", event.target.value));
    $("border-outer-color")?.addEventListener("input", event => updateBorderAppearance("outer", "Color", event.target.value));
    $("border-shared-opacity")?.addEventListener("input", event => updateBorderAppearance("shared", "Opacity", Number(event.target.value) / 100));
    $("border-shared-sea-opacity")?.addEventListener("input", event => updateBorderAppearance("shared-sea", "Opacity", Number(event.target.value) / 100));
    $("border-outer-opacity")?.addEventListener("input", event => updateBorderAppearance("outer", "Opacity", Number(event.target.value) / 100));
    $("border-shared-style")?.addEventListener("change", event => updateBorderAppearance("shared", "Style", event.target.value));
    $("border-shared-sea-style")?.addEventListener("change", event => updateBorderAppearance("shared-sea", "Style", event.target.value));
    $("border-outer-style")?.addEventListener("change", event => updateBorderAppearance("outer", "Style", event.target.value));
    $("view-compass").addEventListener("click", resetViewOrientation);
    L.DomEvent.disableClickPropagation($("view-bearing-readout"));
    L.DomEvent.disableScrollPropagation($("view-bearing-readout"));
    $("view-bearing-readout").addEventListener("pointerdown", event => event.stopPropagation());
    $("view-bearing-readout").addEventListener("focus", beginViewBearingReadoutEdit);
    $("view-bearing-readout").addEventListener("blur", () => finishViewBearingReadoutEdit(true));
    $("view-bearing-readout").addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        finishViewBearingReadoutEdit(false);
        event.currentTarget.blur();
      }
    });

    $("category").addEventListener("change", () => { delete $("category").dataset.legacyCategory; });
    $("tags").addEventListener("focus", populateTagSuggestions);
    $("tags").addEventListener("input", populateTagSuggestions);
    $("tags").addEventListener("keydown", event => handleEditorAutocompleteKeydown(event, $("tag-suggestions")));
    $("tags").addEventListener("blur", () => setTimeout(() => hideEditorAutocomplete($("tag-suggestions"), $("tags")), 80));

    for (const id of ["name", "category", "tags", "icon", "place-color"]) {
      $(id).addEventListener("input", updateEditorPresentation);
      $(id).addEventListener("change", updateEditorPresentation);
    }

    document.documentElement.style.setProperty("--poi-color", state.poiColor);
    $("poi-color").value = state.poiColor;
    $("optimized-rendering").addEventListener("change", async event => {
      const input = event.currentTarget;
      const previous = state.optimizedRendering;
      state.optimizedRendering = input.checked;
      input.disabled = true;
      scheduleSettingsSave();
      await saveSettingsNow();
      if (state.settingsSavedRevision < state.settingsSaveRevision) {
        state.optimizedRendering = previous;
        input.checked = previous;
        input.disabled = false;
        showToast("Rendering preference could not be saved. Reload canceled.");
        return;
      }
      location.reload();
    });
    $("vary-markup-colors").addEventListener("change", (event) => {
      state.varyMarkupColors = event.target.checked;
      state.markupColorQueue = [];
      state.markupLastColor = null;
      scheduleSettingsSave();
    });

    $("poi-color").addEventListener("change", (event) => {
      state.poiColor = event.target.value;
      scheduleSettingsSave();
      applyPoiAppearance();
    });


    $("hide-all-requires-shift").addEventListener("change", (event) => {
      state.hideAllRequiresShift = event.target.checked;
      syncHideShortcutVisibility();
      scheduleSettingsSave();
    });

    $("north-reset-animation").addEventListener("change", (event) => {
      state.northResetAnimation = event.target.checked;
      scheduleSettingsSave();
    });

    $("smooth-scale-resize").addEventListener("change", (event) => {
      state.smoothScaleResize = event.target.checked;
      scheduleSettingsSave();
      state.refreshUnitScale?.();
    });







    $("pin-favorites-sidebar").addEventListener("change", (event) => {
      state.pinFavoritesInSidebar = event.target.checked;
      scheduleSettingsSave();
      renderList();
    });

    $("show-active-layer-buttons").addEventListener("change", (event) => {
      state.showActiveLayerButtons = event.target.checked;
      document.documentElement.classList.toggle("hide-active-layer-buttons", !state.showActiveLayerButtons);
      scheduleSettingsSave();
      window.FAOverpass?.refreshToolSlot?.();
    });

    $("category-map-filter").addEventListener("change", (event) => {
      state.filterMapByCategory = event.target.checked;
      scheduleSettingsSave();
      updatePoiVisibility();
      refreshCircleMeasurementWorldCopies();
      refreshPolygonMeasurementWorldCopies();
      refreshDistanceMeasurementWorldCopies();
    });


    syncBoundaryFillOpacityControl();
    window.FAOIM?.setPointFillOpacity?.(state.fillOpacity);
    $("fill-opacity").addEventListener("input", event => setBoundaryFillOpacity(event.target.value));
    $("fill-opacity-reset").addEventListener("click", () => setBoundaryFillOpacity(0.2));

    $("coordinate-format").value = state.coordFormat;
    $("center-coords-toggle").checked = state.followScreenCenter;
    $("invert-crosshair-toggle").checked = state.invertCrosshair;
    $("view-bearing-readout-toggle").checked = state.viewBearingReadout;
    $("invert-crosshair-setting").classList.toggle("hidden", !state.followScreenCenter);
    $("map-center-crosshair").classList.toggle("inverted", state.invertCrosshair);
    updateCenterCrosshairVisibility();
    $("coordinate-format").addEventListener("change", (event) => {
      state.coordFormat = event.target.value;
      scheduleSettingsSave();
      const current = currentEditorLocation();
      if (current && !$("editor").classList.contains("hidden")) $("coords").value = formatCoordinates(current.lat, current.lon);
      updateCoordinateReadout();
      updateWorldStatus();
      refreshPoiHoverPreviews();
    });

    for (const [id, key] of Object.entries(geometryLabelControls)) {
      const input = $(id);
      input.checked = Boolean(state[key]);
      input.addEventListener("change", () => {
        state[key] = input.checked;
        scheduleSettingsSave();
        refreshMeasurementLabels();
      });
    }
    for (const tab of document.querySelectorAll("#geometry-label-tabs [data-geometry-tab]")) {
      tab.addEventListener("click", () => {
        const selected = tab.dataset.geometryTab;
        for (const button of document.querySelectorAll("#geometry-label-tabs [data-geometry-tab]")) {
          const active = button.dataset.geometryTab === selected;
          button.classList.toggle("active", active);
          button.setAttribute("aria-selected", String(active));
          button.tabIndex = active ? 0 : -1;
        }
        $("geometry-label-measurements").hidden = selected !== "measurements";
        $("geometry-label-pois").hidden = selected !== "pois";
      });
    }
    $("show-polygon-area").checked = state.showPolygonArea;
    $("show-polygon-perimeter").checked = state.showPolygonPerimeter;
    $("show-polygon-area").addEventListener("change", (event) => {
      state.showPolygonArea = event.target.checked;
      scheduleSettingsSave();
      refreshMeasurementLabels();
    });

    $("show-polygon-perimeter").addEventListener("change", (event) => {
      state.showPolygonPerimeter = event.target.checked;
      scheduleSettingsSave();
      refreshMeasurementLabels();
    });

    $("show-circle-area").checked = state.showCircleArea;
    $("show-circle-circumference").checked = state.showCircleCircumference;
    $("measurement-system").value = state.measurementSystem;
    $("show-circle-area").addEventListener("change", (event) => {
      state.showCircleArea = event.target.checked;
      scheduleSettingsSave();
      refreshMeasurementLabels();
    });

    $("show-circle-circumference").addEventListener("change", (event) => {
      state.showCircleCircumference = event.target.checked;
      scheduleSettingsSave();
      refreshMeasurementLabels();
    });


    $("area-units").value = state.areaUnits;
    $("area-threshold").value = state.areaThreshold === null ? "" : String(state.areaThreshold);
    updateAreaThresholdVisibility();
    $("measurement-system").addEventListener("change", event => {
      state.measurementSystem = ["metric", "imperial", "nautical"].includes(event.target.value) ? event.target.value : "metric";
      scheduleSettingsSave();
      updateAreaThresholdVisibility();
      refreshMeasurementLabels();
      if (state.editingLayer instanceof L.Circle) renderShapeInfo(state.editingLayer);
      if (state.currentLocationLatLng && state.currentLocationMarker) {
        updateCurrentLocationLayers(state.currentLocationLatLng, state.currentLocationAccuracy);
      }
      state.refreshUnitScale?.();
      window.FAElevation?.refreshDisplayUnits?.();
    });
    $("area-units").addEventListener("change", (event) => {
      state.areaUnits = event.target.value;
      scheduleSettingsSave();
      updateAreaThresholdVisibility();
      refreshMeasurementLabels();
    });
    $("area-threshold").addEventListener("input", (event) => {
      const raw = event.target.value.trim();
      state.areaThreshold = raw === "" ? null : Math.max(0, Number(raw));
      scheduleSettingsSave();
      refreshMeasurementLabels();
    });

    $("scale-toggle").checked = state.scaleVisible;
    $("black-unavailable-satellite-tiles").checked = state.blackUnavailableSatelliteTiles;
    applySatelliteBrightness();
    $("view-bearing-readout-toggle").checked = state.viewBearingReadout;
    $("view-bearing-readout-toggle").addEventListener("change", (event) => {
      state.viewBearingReadout = event.target.checked;
      scheduleSettingsSave();
      updateViewCompass();
    });

    $("scale-toggle").addEventListener("change", (event) => {
      state.scaleVisible = event.target.checked;
      scheduleSettingsSave();
      const scale = document.querySelector(".simple-scale");
      if (scale) scale.classList.toggle("hidden", !state.scaleVisible);
    });




    $("black-unavailable-satellite-tiles").addEventListener("change", event => {
      state.blackUnavailableSatelliteTiles = event.target.checked;
      scheduleSettingsSave();
      applyUnavailableSatelliteTileSetting();
    });

    const rerenderSearch = () => {
      renderList();
    };
    $("search").addEventListener("input", rerenderSearch);
    $("search").addEventListener("change", rerenderSearch);
    $("search").addEventListener("search", rerenderSearch);
    $("search").addEventListener("keyup", rerenderSearch);
    $("category-filter").addEventListener("change", () => {
      renderList();
      updatePoiVisibility();
    });
    $("sort").addEventListener("change", () => {
      renderList();
    });
    $("favorites-only").addEventListener("change", () => {
      renderList();
      updatePoiVisibility();
    });

    $("favorites-toggle").addEventListener("click", () => {
      $("favorites-only").checked = !$("favorites-only").checked;
      syncFavoritesToggle();
      $("favorites-only").dispatchEvent(new Event("change"));
    });
    $("sidebar-hide-pois-toggle").addEventListener("click", () => {
      toggleSidebarPoiVisibility();
    });

    $("name").addEventListener("input", () => {
      const current = currentEditorLocation();
      if (current) {
        current.name = $("name").value;
        renderExternalLinks(current);
      }
    });
  }

  async function start() {
    wireUi();
    state.config = {"mapStart":{"lat":15.470492,"lon":44.839600,"zoom":7},"satellite":{"url":"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}","maxZoom":19,"attribution":"Esri World Imagery"},"reverseGeocoder":{"url":"https://nominatim.openstreetmap.org/reverse","attribution":"OpenStreetMap / Nominatim"}};
    // Restore a device-remembered login and check for new encrypted research.
    setBootState("loading","Checking for a saved GitHub login...");
    let remembered;
    try{remembered=await window.PTRememberedLogin.load();}
    catch(e){setBootState("setup",`${e.message} Enter your token and passphrase to reconnect.`);return;}
    if(!remembered){setBootState("setup");return;}
    setBootState("loading","Reconnecting to GitHub...");
    showBootProgress(0, "Starting secure connection");
    try{
      await window.FAGitHubSync.connect(remembered);
      if(!await initializeLocalApp())setBootState("setup","Could not open the app. Try reloading.");
    }catch(e){window.FAGitHubSync.disconnect();setBootState("setup",`Automatic connection failed: ${e.message} You can enter updated credentials below.`);}
  }

  start();
})();



