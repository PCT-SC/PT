(() => {
  "use strict";
  const {defaultShortcutBindings, SHORTCUT_DEFINITIONS, normalizeShortcutBinding} = window.FAShortcuts;
  const {providers} = window.FAExternalLinks;
  // Restored general and display preferences from the original installation.
  // Deliberately omits site content, custom categories, history, map coordinates and other private records.
  const RESTORED_PREFERENCES = Object.freeze({"areaThreshold":1000000,"areaUnits":"m2","basemap":"satellite","blackUnavailableSatelliteTiles":true,"borderOuterColor":"#7fd8ff","borderOuterOpacity":0.6,"borderOuterStyle":"dotted","borderOuterVisible":true,"borderSharedColor":"#ffffff","borderSharedOpacity":0.8,"borderSharedSeaColor":"#ffffff","borderSharedSeaOpacity":0.8,"borderSharedSeaStyle":"solid","borderSharedSeaVisible":true,"borderSharedStyle":"solid","borderSharedVisible":true,"borderVisible":true,"coordinateFormat":"dd","coordinatesFollowScreenCenter":true,"defaultColor":"#ff5c5c","externalMapLinks":{"apple":true,"bing":true,"copernicus":true,"earth":true,"earthsearch":true,"firms":true,"geohack":true,"google":true,"landcover":true,"landsat":true,"openstreetmap":true,"sentinel1":true,"sentinel2":true,"wayback":true,"windy":true,"worldview":true},"fillOpacity":0.25,"filterMapByCategory":true,"hideAllRequiresShift":false,"hidePois":false,"invertCrosshair":false,"keyboardShortcuts":{"basemap":"`","cheatSheet":"?","copyCoordinates":"C","elevation":"","gotoCoordinates":"G","hideLabels":"F","home":"Space","north":"","oap":"","overpass":"","sar":"","sidebar":"Shift+Space","sketch":"S","togglePoiCategory":"Shift+H","worldcover":""},"measurementSystem":"metric","northResetAnimation":true,"optimizedRendering":true,"osmBrightness":1,"osmRasterOverzoom":true,"pinFavoritesInSidebar":true,"satelliteBrightness":0.8,"satelliteRasterOverzoom":true,"scaleVisible":true,"showActiveLayerButtons":false,"showCircleArea":true,"showCircleCircumference":true,"showMeasurementCircleArea":true,"showMeasurementCircleCircumference":true,"showMeasurementCircleDiameter":true,"showMeasurementCircleRadius":true,"showMeasurementLineBearing":true,"showMeasurementLineDistance":true,"showMeasurementMarkerCoordinates":true,"showMeasurementPolygonArea":true,"showMeasurementPolygonPerimeter":true,"showPoiCircleDiameter":true,"showPoiCircleRadius":true,"showPoiMarkerCoordinates":true,"showPolygonArea":true,"showPolygonPerimeter":true,"smoothScaleResize":true,"varyMarkupColors":true,"viewBearingReadout":true});
  function defaultSettings() {
    const defaults = {
      defaultColor: "#4aa3ff",
      varyMarkupColors: false,
      optimizedRendering: true,
      basemap: "osm",
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
      scaleVisible: true,
    blackUnavailableSatelliteTiles: true,
    satelliteBrightness: 1,
    satelliteRasterOverzoom: false,
    osmBrightness: 1,
    osmRasterOverzoom: false,
      hidePois: false,
      hiddenPoiCategories: [],
      filterMapByCategory: false,
      pinFavoritesInSidebar: false,
      showActiveLayerButtons: true,
      fillOpacity: 0.2,
      coordinateFormat: "dd",
      coordinatesFollowScreenCenter: false,
      viewBearingReadout: true,
      northResetAnimation: true,
      smoothScaleResize: true,
      invertCrosshair: true,
      showPolygonArea: true,
      showPolygonPerimeter: false,
      showCircleArea: true,
      showCircleCircumference: true,
      showMeasurementMarkerCoordinates: true,
      showMeasurementLineBearing: true,
      showMeasurementLineDistance: true,
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
      keyboardShortcuts: defaultShortcutBindings(),
      hideAllRequiresShift: true,
      externalMapLinks: Object.fromEntries(Object.keys(providers).map(key => [key, true]))
    };
    return {...defaults, ...RESTORED_PREFERENCES};
  }

  function clearLegacyBrowserSettings() {
    for (const key of [
      "project-tracker-providers",
      "project-tracker-basemap",
      "project-tracker-borders",
      "project-tracker-scale",
      "project-tracker-color",
      "project-tracker-hide-pois",
      "project-tracker-fill-opacity",
      "project-tracker-coordinate-format",
      "project-tracker-show-polygon-area",
      "project-tracker-show-circle-area",
      "project-tracker-area-units",
      "project-tracker-area-threshold"
    ]) localStorage.removeItem(key);
  }

  function settingsSnapshot(state) {
    return {
      defaultColor: state.poiColor,
      varyMarkupColors: state.varyMarkupColors,
      optimizedRendering: state.optimizedRendering,
      basemap: state.basemap,
      borderVisible: state.borderVisible,
      borderSharedVisible: state.borderSharedVisible,
      borderSharedSeaVisible: state.borderSharedSeaVisible,
      borderOuterVisible: state.borderOuterVisible,
      borderSharedColor: state.borderSharedColor,
      borderSharedSeaColor: state.borderSharedSeaColor,
      borderOuterColor: state.borderOuterColor,
      borderSharedOpacity: state.borderSharedOpacity,
      borderSharedSeaOpacity: state.borderSharedSeaOpacity,
      borderOuterOpacity: state.borderOuterOpacity,
      borderSharedStyle: state.borderSharedStyle,
      borderSharedSeaStyle: state.borderSharedSeaStyle,
      borderOuterStyle: state.borderOuterStyle,
      scaleVisible: state.scaleVisible,
      blackUnavailableSatelliteTiles: state.blackUnavailableSatelliteTiles,
      satelliteBrightness: state.satelliteBrightness,
      satelliteRasterOverzoom: state.satelliteRasterOverzoom,
      osmBrightness: state.osmBrightness,
      osmRasterOverzoom: state.osmRasterOverzoom,
      hidePois: state.hidePois,
      hiddenPoiCategories: [...state.hiddenPoiCategories],
      filterMapByCategory: state.filterMapByCategory,
      pinFavoritesInSidebar: state.pinFavoritesInSidebar,
      showActiveLayerButtons: state.showActiveLayerButtons,
      fillOpacity: state.fillOpacity,
      coordinateFormat: state.coordFormat,
      coordinatesFollowScreenCenter: state.followScreenCenter,
      invertCrosshair: state.invertCrosshair,
      viewBearingReadout: state.viewBearingReadout,
      northResetAnimation: state.northResetAnimation,
      smoothScaleResize: state.smoothScaleResize,
      showPolygonArea: state.showPolygonArea,
      showPolygonPerimeter: state.showPolygonPerimeter,
      showCircleArea: state.showCircleArea,
      showCircleCircumference: state.showCircleCircumference,
      showMeasurementMarkerCoordinates: state.showMeasurementMarkerCoordinates,
      showMeasurementLineBearing: state.showMeasurementLineBearing,
      showMeasurementLineDistance: state.showMeasurementLineDistance,
      showMeasurementPolygonArea: state.showMeasurementPolygonArea,
      showMeasurementPolygonPerimeter: state.showMeasurementPolygonPerimeter,
      showMeasurementCircleDiameter: state.showMeasurementCircleDiameter,
      showMeasurementCircleRadius: state.showMeasurementCircleRadius,
      showMeasurementCircleArea: state.showMeasurementCircleArea,
      showMeasurementCircleCircumference: state.showMeasurementCircleCircumference,
      showPoiMarkerCoordinates: state.showPoiMarkerCoordinates,
      showPoiCircleDiameter: state.showPoiCircleDiameter,
      showPoiCircleRadius: state.showPoiCircleRadius,
      measurementSystem: state.measurementSystem,
      areaUnits: state.areaUnits,
      areaThreshold: state.areaThreshold,
      keyboardShortcuts: {...state.keyboardShortcuts},
      hideAllRequiresShift: state.hideAllRequiresShift,
      ...(state.legacyElevationProfiles.length ? {elevationProfiles: state.legacyElevationProfiles.map(profile => ({...profile, start: {...profile.start}, end: {...profile.end}}))} : {}),
      externalMapLinks: {...state.providerPrefs}
    };
  }

  function applySettings(state, settings, validPoiColor, clampSatelliteBrightness) {
    const fallback = defaultSettings();
    const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
    const merged = {
      ...fallback,
      ...source,
      externalMapLinks: {...fallback.externalMapLinks, ...(source.externalMapLinks || {})},
      keyboardShortcuts: {...fallback.keyboardShortcuts, ...(source.keyboardShortcuts || {})}
    };
    state.poiColor = validPoiColor(merged.defaultColor) || "#4aa3ff";
    state.varyMarkupColors = Boolean(merged.varyMarkupColors);
    state.optimizedRendering = merged.optimizedRendering !== false;
    state.markupColorQueue = [];
    state.markupLastColor = null;
    state.basemap = merged.basemap === "satellite" ? "satellite" : "osm";
    state.borderVisible = merged.borderVisible !== false;
    state.borderSharedVisible = merged.borderSharedVisible !== false;
    state.borderSharedSeaVisible = merged.borderSharedSeaVisible !== false;
    state.borderOuterVisible = merged.borderOuterVisible !== false;
    state.borderSharedColor = /^#[0-9a-f]{6}$/i.test(String(merged.borderSharedColor || "")) ? String(merged.borderSharedColor) : "#ffffff";
    state.borderSharedSeaColor = /^#[0-9a-f]{6}$/i.test(String(merged.borderSharedSeaColor || "")) ? String(merged.borderSharedSeaColor) : "#7fd8ff";
    state.borderOuterColor = /^#[0-9a-f]{6}$/i.test(String(merged.borderOuterColor || "")) ? String(merged.borderOuterColor) : "#7fd8ff";
    state.borderSharedOpacity = Math.max(0, Math.min(1, Number(merged.borderSharedOpacity ?? 0.78)));
    state.borderSharedSeaOpacity = Math.max(0, Math.min(1, Number(merged.borderSharedSeaOpacity ?? 0.78)));
    state.borderOuterOpacity = Math.max(0, Math.min(1, Number(merged.borderOuterOpacity ?? 0.78)));
    state.borderSharedStyle = ["solid", "dashed", "dotted"].includes(merged.borderSharedStyle) ? merged.borderSharedStyle : "solid";
    state.borderSharedSeaStyle = ["solid", "dashed", "dotted"].includes(merged.borderSharedSeaStyle) ? merged.borderSharedSeaStyle : "dashed";
    state.borderOuterStyle = ["solid", "dashed", "dotted"].includes(merged.borderOuterStyle) ? merged.borderOuterStyle : "dotted";
    state.scaleVisible = merged.scaleVisible !== false;
    state.blackUnavailableSatelliteTiles = merged.blackUnavailableSatelliteTiles !== false;
    state.satelliteBrightness = clampSatelliteBrightness(merged.satelliteBrightness);
    state.satelliteRasterOverzoom = Boolean(merged.satelliteRasterOverzoom);
    state.osmBrightness = clampSatelliteBrightness(merged.osmBrightness);
    state.osmRasterOverzoom = Boolean(merged.osmRasterOverzoom);
    state.hidePois = Boolean(merged.hidePois);
    state.hiddenPoiCategories = new Set(Array.isArray(merged.hiddenPoiCategories) ? merged.hiddenPoiCategories.map(value => String(value || "").trim()).filter(Boolean) : []);
    state.filterMapByCategory = Boolean(merged.filterMapByCategory);
    state.pinFavoritesInSidebar = Boolean(merged.pinFavoritesInSidebar);
    state.showActiveLayerButtons = merged.showActiveLayerButtons !== false;
    state.fillOpacity = Math.min(1, Math.max(0, Number(merged.fillOpacity ?? 0.2)));
    state.coordFormat = ["dd", "ddm", "dms"].includes(merged.coordinateFormat) ? merged.coordinateFormat : "dd";
    state.followScreenCenter = Boolean(merged.coordinatesFollowScreenCenter);
    state.invertCrosshair = merged.invertCrosshair !== false;
    state.viewBearingReadout = merged.viewBearingReadout !== false;
    state.northResetAnimation = merged.northResetAnimation !== false;
    state.smoothScaleResize = merged.smoothScaleResize !== false;
    state.showPolygonArea = merged.showPolygonArea !== false;
    state.showPolygonPerimeter = Boolean(merged.showPolygonPerimeter);
    state.showCircleArea = merged.showCircleArea !== false;
    state.showCircleCircumference = merged.showCircleCircumference !== false;
    state.showMeasurementMarkerCoordinates = merged.showMeasurementMarkerCoordinates !== false;
    state.showMeasurementLineBearing = merged.showMeasurementLineBearing !== false;
    state.showMeasurementLineDistance = merged.showMeasurementLineDistance !== false;
    state.showMeasurementPolygonArea = merged.showMeasurementPolygonArea !== false;
    state.showMeasurementPolygonPerimeter = merged.showMeasurementPolygonPerimeter !== false;
    state.showMeasurementCircleDiameter = merged.showMeasurementCircleDiameter !== false;
    state.showMeasurementCircleRadius = merged.showMeasurementCircleRadius !== false;
    state.showMeasurementCircleArea = merged.showMeasurementCircleArea !== false;
    state.showMeasurementCircleCircumference = merged.showMeasurementCircleCircumference !== false;
    state.showPoiMarkerCoordinates = Boolean(merged.showPoiMarkerCoordinates);
    state.showPoiCircleDiameter = merged.showPoiCircleDiameter !== false;
    state.showPoiCircleRadius = merged.showPoiCircleRadius !== false;
    state.measurementSystem = ["metric", "imperial", "nautical"].includes(merged.measurementSystem) ? merged.measurementSystem : "metric";
    state.areaUnits = ["m2", "km2", "ha"].includes(merged.areaUnits) ? merged.areaUnits : "m2";
    state.keyboardShortcuts = Object.fromEntries(SHORTCUT_DEFINITIONS.map(definition => [definition.id, normalizeShortcutBinding(merged.keyboardShortcuts?.[definition.id])]));
    state.hideAllRequiresShift = merged.hideAllRequiresShift !== false;
    state.areaThreshold = merged.areaThreshold === null || merged.areaThreshold === ""
      ? null
      : Math.max(0, Number(merged.areaThreshold ?? 1000000));
    state.elevationProfiles = [];
    state.legacyElevationProfiles = Array.isArray(source.elevationProfiles) ? source.elevationProfiles.filter(profile => profile && Number.isFinite(Number(profile.start?.lat)) && Number.isFinite(Number(profile.start?.lng)) && Number.isFinite(Number(profile.end?.lat)) && Number.isFinite(Number(profile.end?.lng))).map(profile => ({id: profile.id || null, start: {lat: Number(profile.start.lat), lng: Number(profile.start.lng)}, end: {lat: Number(profile.end.lat), lng: Number(profile.end.lng)}, locked: true, tooltipHidden: Boolean(profile.tooltipHidden)})) : [];
    state.providerPrefs = {...merged.externalMapLinks};
  }

  window.FASettings = Object.freeze({defaultSettings, settingsSnapshot, applySettings, clearLegacyBrowserSettings, RESTORED_PREFERENCES});
})();
(() => {
  "use strict";
  function createSettingsPersistence({state, api, settingsSnapshot, defaultSettings, applySettings, syncSettingsUi, clearLegacyBrowserSettings, showToast}) {
  function scheduleSettingsRetry(delay = 2000) {
    if (!state.settingsLoaded || state.settingsSaveRetryTimer) return;
    if (state.settingsSavedRevision >= state.settingsSaveRevision) return;
    state.settingsSaveRetryTimer = setTimeout(() => {
      state.settingsSaveRetryTimer = null;
      if (state.settingsSavedRevision < state.settingsSaveRevision) saveSettingsNow();
    }, delay);
  }

  function saveSettingsNow() {
    if (!state.settingsLoaded) return Promise.resolve();
    if (state.settingsSaveTimer) {
      clearTimeout(state.settingsSaveTimer);
      state.settingsSaveTimer = null;
    }
    const revision = state.settingsSaveRevision;
    const body = JSON.stringify({settings: settingsSnapshot()});
    state.settingsSaveQueue = state.settingsSaveQueue
      .catch(() => {})
      .then(async () => {
        try {
          if (state.settingsRecordId) {
            await api(`/collections/settings/records/${state.settingsRecordId}`, {method: "PATCH", body});
          } else {
            const record = await api("/collections/settings/records", {method: "POST", body});
            state.settingsRecordId = record.id;
          }
        } catch (err) {
          void 0;
          if (!state.settingsSaveErrorShown) {
            state.settingsSaveErrorShown = true;
            showToast(`Unable to save settings: ${err.message}. Retrying automatically.`);
          }
          scheduleSettingsRetry();
          return;
        }
        state.settingsSavedRevision = Math.max(state.settingsSavedRevision, revision);
        const recovered = state.settingsSaveErrorShown;
        state.settingsSaveErrorShown = false;
        if (state.settingsSavedRevision >= state.settingsSaveRevision) {
          if (state.settingsSaveRetryTimer) clearTimeout(state.settingsSaveRetryTimer);
          state.settingsSaveRetryTimer = null;
          if (recovered) showToast("Settings saved after retry.", "success");
        } else if (!state.settingsSaveTimer) {
          scheduleSettingsRetry(250);
        }
      });
    return state.settingsSaveQueue;
  }

  function scheduleSettingsSave() {
    if (!state.settingsLoaded) return;
    state.settingsSaveRevision += 1;
    if (state.settingsSaveRetryTimer) {
      clearTimeout(state.settingsSaveRetryTimer);
      state.settingsSaveRetryTimer = null;
    }
    if (state.settingsSaveTimer) clearTimeout(state.settingsSaveTimer);
    state.settingsSaveTimer = setTimeout(() => {
      state.settingsSaveTimer = null;
      saveSettingsNow();
    }, 250);
  }

  async function loadSettings() {
    const fallback = defaultSettings();
    const data = await api("/collections/settings/records?page=1&perPage=1&sort=created");
    let record = data.items && data.items[0];
    if (!record) {
      record = await api("/collections/settings/records", {
        method: "POST",
        body: JSON.stringify({settings: fallback})
      });
    }
    state.settingsRecordId = record.id;
    // Apply the bundled safe preferences once, including for upgrades from the previous clean local build.
    // This changes only the settings record, never the places, sketches or measurements collections.
    const restoreMarker = "project-tracker-prefs-restored-v2";
    let needsRestoration = true;
    try { needsRestoration = localStorage.getItem(restoreMarker) !== "1"; } catch {}
    const effective = {
      ...fallback,
      ...(record.settings || {}),
      ...(needsRestoration ? window.FASettings.RESTORED_PREFERENCES : {}),
      ...(needsRestoration ? {hiddenPoiCategories: []} : {}),
      externalMapLinks: {...fallback.externalMapLinks, ...(record.settings?.externalMapLinks || {}), ...(needsRestoration ? window.FASettings.RESTORED_PREFERENCES.externalMapLinks : {})}
    };
    applySettings(effective);
    state.settingsLoaded = true;
    syncSettingsUi();
    state.settingsSaveRevision += 1;
    await saveSettingsNow();
    if (needsRestoration && state.settingsSavedRevision >= state.settingsSaveRevision) {
      try { localStorage.setItem(restoreMarker, "1"); } catch {}
    }
    clearLegacyBrowserSettings();
  }

    return {saveSettingsNow, scheduleSettingsSave, loadSettings};
  }
  window.FASettingsPersistence = Object.freeze({createSettingsPersistence});
})();
