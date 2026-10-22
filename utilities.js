(() => {
  "use strict";
  function formatCoordinatesAs(lat, lon, format) {
    const degree = String.fromCharCode(176);
    const minute = String.fromCharCode(39);
    const second = String.fromCharCode(34);
    if (format === "ddm") {
      const formatDdm = (value, positive, negative) => {
        const totalMinutes = Math.round(Math.abs(value) * 60 * 1000) / 1000;
        const degrees = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes - degrees * 60;
        return `${degrees}${degree}${minutes.toFixed(3)}${minute}${value >= 0 ? positive : negative}`;
      };
      return `${formatDdm(lat, "N", "S")}, ${formatDdm(lon, "E", "W")}`;
    }
    if (format === "dms") {
      const formatDms = (value, positive, negative) => {
        const totalSeconds = Math.round(Math.abs(value) * 360000) / 100;
        const degrees = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds - degrees * 3600) / 60);
        const seconds = totalSeconds - degrees * 3600 - minutes * 60;
        return `${degrees}${degree}${minutes}${minute}${seconds.toFixed(2)}${second}${value >= 0 ? positive : negative}`;
      };
      return `${formatDms(lat, "N", "S")}, ${formatDms(lon, "E", "W")}`;
    }
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }

  const OLC_ALPHABET = "23456789CFGHJMPQRVWX";
  const OLC_PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125];

  function validLocation(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ? {lat, lon} : null;
  }

  function parseDecimalPair(input) {
    const number = "([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))";
    const plain = new RegExp(`^\\s*${number}\\s*\\u00b0?\\s*(?:[,;]|\\s+)\\s*${number}\\s*\\u00b0?\\s*$`);
    const match = input.match(plain);
    if (match) {
      const first = Number(match[1]), second = Number(match[2]);
      return Math.abs(first) > 90 && Math.abs(second) <= 90
        ? validLocation(second, first) : validLocation(first, second);
    }
    const named = input.match(/^\s*lat(?:itude)?\s*[:=]\s*([+-]?\d+(?:\.\d+)?)\s*[,; ]+\s*(?:lon|lng|longitude)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)\s*$/i);
    if (named) return validLocation(Number(named[1]), Number(named[2]));
    const reverse = input.match(/^\s*(?:lon|lng|longitude)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)\s*[,; ]+\s*lat(?:itude)?\s*[:=]\s*([+-]?\d+(?:\.\d+)?)\s*$/i);
    return reverse ? validLocation(Number(reverse[2]), Number(reverse[1])) : null;
  }

  function parseAngle(input) {
    const raw = input.trim();
    const match = raw.match(/^([NSEW])?\s*([+-]?\d+(?:\.\d+)?)\s*(?:\u00b0|deg(?:rees?)?|d)?\s*(?:(\d+(?:\.\d+)?)\s*(?:'|min(?:utes?)?|m))?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|sec(?:onds?)?|s))?\s*([NSEW])?$/i);
    if (!match || (!match[1] && !match[5] && !/[\u00b0'\"]/.test(raw))) return null;
    const prefix = match[1]?.toUpperCase(), suffix = match[5]?.toUpperCase();
    if (prefix && suffix && prefix !== suffix) return null;
    const dir = prefix || suffix || null;
    const degrees = Number(match[2]), minutes = match[3] === undefined ? 0 : Number(match[3]);
    const seconds = match[4] === undefined ? 0 : Number(match[4]);
    if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes >= 60 || seconds >= 60) return null;
    if ((match[3] !== undefined || match[4] !== undefined) && !Number.isInteger(degrees)) return null;
    if (match[4] !== undefined && match[3] === undefined) return null;
    if (degrees < 0 && dir && dir !== "S" && dir !== "W") return null;
    let value = Math.abs(degrees) + minutes / 60 + seconds / 3600;
    if (degrees < 0 || dir === "S" || dir === "W") value = -value;
    return {value, dir};
  }

  function parseAngularPair(text) {
    const normalized = text.replace(/[\u00ba\u02da]/g, "\u00b0")
      .replace(/[\u2032\u2019\u2018]/g, "'")
      .replace(/[\u2033\u201c\u201d]/g, '"')
      .replace(/[\u2212\u2013]/g, "-");
    let parts = normalized.split(/\s*[,;]\s*/).filter(Boolean);
    if (parts.length === 1) {
      const separated = normalized.replace(/([NSEW])\s+(?=[+-]?\d)/gi, "$1,")
        .replace(/([NSEW])(?=[NSEW]\s*[+-]?\d)/gi, "$1,");
      parts = separated.split(/\s*,\s*/).filter(Boolean);
      if (parts.length === 1) parts = normalized.trim().split(/\s+(?=[NSEW]\s*[+-]?\d)/i).filter(Boolean);
    }
    if (parts.length !== 2) return null;
    const one = parseAngle(parts[0]), two = parseAngle(parts[1]);
    if (!one || !two) return null;
    const aLat = one.dir === "N" || one.dir === "S";
    const aLon = one.dir === "E" || one.dir === "W";
    const bLat = two.dir === "N" || two.dir === "S";
    const bLon = two.dir === "E" || two.dir === "W";
    if ((aLat && bLat) || (aLon && bLon) || (aLat && !bLon) || (aLon && !bLat) || (bLat && !aLon) || (bLon && !aLat)) {
      if (!((aLat && !two.dir) || (aLon && !two.dir) || (bLat && !one.dir) || (bLon && !one.dir))) return null;
    }
    if (aLon || bLat) return validLocation(two.value, one.value);
    return validLocation(one.value, two.value);
  }

  function decodePlusCode(value, reference) {
    const code = String(value || "").trim().toUpperCase();
    const plus = code.indexOf("+");
    if (plus < 2 || plus > 8 || plus % 2 !== 0 || code.lastIndexOf("+") !== plus) return null;
    const before = code.slice(0, plus), after = code.slice(plus + 1);
    if (!/^[23456789CFGHJMPQRVWX0]+$/.test(before) || !/^[23456789CFGHJMPQRVWX]*$/.test(after)) return null;
    if (plus < 8 && (before.includes("0") || after.length < 2)) return null;
    if (plus === 8 && after.length === 1) return null;
    if (before.includes("0") && (!/^([23456789CFGHJMPQRVWX]{2,6})(0{2}|0{4}|0{6})$/.test(before) || after)) return null;
    if (before.length + after.length > 15) return null;
    let full = code, referenceUsed = false, resolution = 0;
    if (plus < 8) {
      if (!reference || !validLocation(Number(reference.lat), Number(reference.lng ?? reference.lon))) return null;
      const missing = 8 - plus;
      const latRef = Math.min(90 - 1e-12, Math.max(-90, Number(reference.lat)));
      const lonRef = Number(reference.lng ?? reference.lon);
      let lat = latRef + 90, lon = (lonRef === 180 ? -180 : lonRef) + 180;
      let prefix = "";
      for (const step of OLC_PAIR_RESOLUTIONS.slice(0, 4)) {
        const row = Math.min(19, Math.floor(lat / step));
        const col = Math.min(19, Math.floor(lon / step));
        prefix += OLC_ALPHABET[row] + OLC_ALPHABET[col];
        lat -= row * step;
        lon -= col * step;
      }
      full = prefix.slice(0, missing) + code;
      referenceUsed = true;
      resolution = OLC_PAIR_RESOLUTIONS[missing / 2 - 1];
    }
    const significant = full.replace("+", "").replace(/0+$/, "");
    if (significant.length < 2 || significant.length > 15) return null;
    if (OLC_ALPHABET.indexOf(significant[0]) >= 9 || OLC_ALPHABET.indexOf(significant[1]) >= 18) return null;
    let south = -90, west = -180, latSize = 20, lonSize = 20;
    for (let i = 0; i < Math.min(10, significant.length); i += 2) {
      if (i + 1 >= significant.length) return null;
      const step = OLC_PAIR_RESOLUTIONS[i / 2];
      south += OLC_ALPHABET.indexOf(significant[i]) * step;
      west += OLC_ALPHABET.indexOf(significant[i + 1]) * step;
      latSize = lonSize = step;
    }
    for (let i = 10; i < significant.length; i++) {
      const digit = OLC_ALPHABET.indexOf(significant[i]);
      latSize /= 5;
      lonSize /= 4;
      south += Math.floor(digit / 4) * latSize;
      west += (digit % 4) * lonSize;
    }
    let lat = south + latSize / 2, lon = west + lonSize / 2;
    if (referenceUsed) {
      const latRef = Number(reference.lat), lonRef = Number(reference.lng ?? reference.lon);
      if (lat + resolution / 2 < latRef && lat + resolution <= 90) lat += resolution;
      else if (lat - resolution / 2 > latRef && lat - resolution >= -90) lat -= resolution;
      if (lon + resolution / 2 < lonRef) lon += resolution;
      else if (lon - resolution / 2 > lonRef) lon -= resolution;
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
    }
    const result = validLocation(lat, lon);
    return result ? {...result, referenceUsed} : null;
  }

  function parseGeoHackParameters(params) {
    const match = String(params || "").match(/^([+-]?\d+(?:\.\d+)?)(?:_(\d+(?:\.\d+)?))?(?:_(\d+(?:\.\d+)?))?_([NS])_([+-]?\d+(?:\.\d+)?)(?:_(\d+(?:\.\d+)?))?(?:_(\d+(?:\.\d+)?))?_([EW])(?:_|$)/i);
    if (!match) return null;
    const convert = (d, m, s, hemisphere) => {
      const degree = Number(d), minute = Number(m || 0), second = Number(s || 0);
      if (degree < 0 || minute >= 60 || second >= 60 || (m && !Number.isInteger(degree))) return NaN;
      const value = degree + minute / 60 + second / 3600;
      return /[SW]/i.test(hemisphere) ? -value : value;
    };
    return validLocation(convert(match[1], match[2], match[3], match[4]), convert(match[5], match[6], match[7], match[8]));
  }

  function parseMapURL(value, reference) {
    let url;
    try { url = new URL(value); } catch { return null; }
    if (url.protocol === "geo:") {
      const match = url.pathname.match(/^([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)(?:,[+-]?\d+(?:\.\d+)?)?(?:;u=\d+(?:\.\d+)?)?$/);
      return match ? validLocation(Number(match[1]), Number(match[2])) : null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    const path = (() => { try { return decodeURIComponent(url.pathname); } catch { return url.pathname; } })();
    const pair = (text) => {
      const match = String(text || "").match(/^\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*$/);
      return match ? validLocation(Number(match[1]), Number(match[2])) : null;
    };
    if (host === "geohack.toolforge.org" || host === "tools.wmflabs.org" && path.includes("geohack")) {
      return parseGeoHackParameters(url.searchParams.get("params"));
    }
    if (host === "plus.codes" || host === "www.plus.codes") {
      return decodePlusCode(path.replace(/^\//, ""), reference);
    }
    if (host === "openstreetmap.org" || host.endsWith(".openstreetmap.org")) {
      const markerLat = url.searchParams.get("mlat"), markerLon = url.searchParams.get("mlon");
      if (markerLat !== null && markerLon !== null) return validLocation(Number(markerLat), Number(markerLon));
      const hash = url.hash.match(/(?:^#|[?&])map=\d+(?:\.\d+)?\/([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)/);
      if (hash) return validLocation(Number(hash[1]), Number(hash[2]));
      const lat = url.searchParams.get("lat"), lon = url.searchParams.get("lon");
      return lat !== null && lon !== null ? validLocation(Number(lat), Number(lon)) : null;
    }
    const isGoogleMaps = /^(?:[a-z0-9-]+\.)*google\.[a-z.]+$/.test(host) && (path.startsWith("/maps") || host.startsWith("maps."));
    const isGoogleEarth = host === "earth.google.com";
    if (!isGoogleMaps && !isGoogleEarth) return null;
    if (isGoogleMaps) {
      const positions = [...(path + url.hash).matchAll(/!3d([+-]?\d+(?:\.\d+)?)!4d([+-]?\d+(?:\.\d+)?)/g)];
      if (positions.length) {
        const position = positions[positions.length - 1];
        return validLocation(Number(position[1]), Number(position[2]));
      }
      for (const key of ["query", "q", "ll", "center"]) {
        const term = url.searchParams.get(key);
        if (term) {
          const result = pair(term) || decodePlusCode(term, reference);
          if (result) return result;
        }
      }
    }
    const at = path.match(/@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)(?:[,/]|$)/);
    if (at) return validLocation(Number(at[1]), Number(at[2]));
    if (isGoogleEarth) {
      const search = path.match(/\/web\/search\/([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)(?:\/|$)/);
      return search ? validLocation(Number(search[1]), Number(search[2])) : null;
    }
    const search = path.match(/\/maps\/(?:search|place)\/([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)(?:\/|$)/);
    return search ? validLocation(Number(search[1]), Number(search[2])) : null;
  }

  function parseCoordinateInput(value, reference) {
    const text = String(value || "").trim();
    if (!text) return null;
    if (/^(?:https?:\/\/|geo:)/i.test(text)) return parseMapURL(text, reference);
    const plain = parseDecimalPair(text);
    if (plain) return plain;
    const plus = decodePlusCode(text, reference);
    if (plus) return plus;
    return parseAngularPair(text);
  }
  window.FACoordinates = Object.freeze({formatCoordinatesAs, parseCoordinateInput});
})();
(() => {
  "use strict";
  const SHORTCUT_DEFINITIONS = [
    {id: "home", label: "Return to home", defaultBinding: "Space"},
    {id: "sidebar", label: "Toggle sidebar", defaultBinding: "Shift+Space"},
    {id: "copyCoordinates", label: "Copy crosshair coordinates", defaultBinding: "C"},
    {id: "basemap", label: "Toggle OSM / SAT", defaultBinding: "O"},
    {id: "gotoCoordinates", label: "Go to coordinates", defaultBinding: "G"},
    {id: "sar", label: "Toggle SAR", defaultBinding: "S"},
    {id: "overpass", label: "Toggle OVP", defaultBinding: "V"},
    {id: "oap", label: "Toggle OAP", defaultBinding: "A"},
    {id: "oim", label: "Toggle OIM", defaultBinding: "I"},
    {id: "elevation", label: "Toggle ELV", defaultBinding: "E"},
    {id: "worldcover", label: "Toggle WC", defaultBinding: "W"},
    {id: "north", label: "Return to north", defaultBinding: "N"},
    {id: "sketch", label: "Toggle sketch mode", defaultBinding: "Shift+S"},
    {id: "hideLabels", label: "Hide/show labels while held", defaultBinding: "Y"},
    {id: "togglePoiCategory", label: "Hide/show selected POI category", defaultBinding: "Shift+H"},
    {id: "cheatSheet", label: "Show shortcut cheat sheet", defaultBinding: "?"}
  ];

  function defaultShortcutBindings() {
    return Object.fromEntries(SHORTCUT_DEFINITIONS.map(definition => [definition.id, definition.defaultBinding]));
  }

  function normalizeShortcutBinding(value) {
    return String(value || "").trim().replace(/\s*\+\s*/g, "+");
  }

  function shortcutFromKeyboardEvent(event) {
    const raw = String(event.key || "");
    if (!raw || ["Shift", "Control", "Alt", "Meta"].includes(raw)) return "";
    let key = raw === " " || raw === "Spacebar" ? "Space" : raw;
    if (key.length === 1 && /[a-z]/i.test(key)) key = key.toUpperCase();
    else if (key === "Esc") key = "Escape";
    const shiftedSymbol = event.shiftKey && key.length === 1 && !/[A-Z0-9]/.test(key);
    const modifiers = [];
    if (event.ctrlKey) modifiers.push("Ctrl");
    if (event.metaKey) modifiers.push("Meta");
    if (event.altKey) modifiers.push("Alt");
    if (event.shiftKey && !shiftedSymbol) modifiers.push("Shift");
    return [...modifiers, key].join("+");
  }

  window.FAShortcuts = {SHORTCUT_DEFINITIONS, defaultShortcutBindings, normalizeShortcutBinding, shortcutFromKeyboardEvent};
})();
(() => {
  "use strict";
  const providers = {
    geohack: {
      name: "GeoHack",
      url: ({lat, lon, zoom}) => {
        const ns = lat >= 0 ? "N" : "S";
        const ew = lon >= 0 ? "E" : "W";
        return `https://geohack.toolforge.org/geohack.php?params=${Math.abs(lat)}_${ns}_${Math.abs(lon)}_${ew}`;
      }
    },
    openstreetmap: {
      name: "OpenStreetMap",
      url: ({lat, lon, zoom}) =>
        `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`
    },
    wayback: {
      name: "Esri Wayback",
      url: ({lat, lon, zoom}) =>
        `https://livingatlas.arcgis.com/wayback/#mapCenter=${encodeURIComponent(`${lon},${lat},${zoom}`)}&mode=explore`
    },
    sentinel1: {
      name: "Esri Sentinel-1 Explorer",
      url: ({lat, lon, zoom}) =>
        `https://livingatlas.arcgis.com/sentinel1explorer/#mapCenter=${encodeURIComponent(`${lon},${lat},${zoom}`)}`
    },
    sentinel2: {
      name: "Esri Sentinel-2 Explorer",
      url: ({lat, lon, zoom}) =>
        `https://livingatlas.arcgis.com/sentinel2explorer/#mapCenter=${encodeURIComponent(`${lon},${lat},${zoom}`)}`
    },
    landsat: {
      name: "Esri Landsat Explorer",
      url: ({lat, lon, zoom}) =>
        `https://livingatlas.arcgis.com/landsatexplorer/#mapCenter=${encodeURIComponent(`${lon},${lat},${zoom}`)}`
    },
    landcover: {
      name: "Esri Land Cover Explorer",
      url: ({lat, lon, zoom}) =>
        `https://livingatlas.arcgis.com/landcoverexplorer/#mapCenter=${encodeURIComponent(`${lon},${lat},${zoom}`)}`
    },
    worldview: {
      name: "NASA Worldview",
      url: ({lat, lon, zoom}) => {
        const z = Math.max(1, Math.min(18, Number(zoom) || 3));
        const lonHalf = Math.max(0.02, 180 / Math.pow(2, z));
        const latHalf = Math.max(0.02, lonHalf * 0.55);
        const west = Math.max(-180, Number(lon) - lonHalf);
        const east = Math.min(180, Number(lon) + lonHalf);
        const south = Math.max(-90, Number(lat) - latHalf);
        const north = Math.min(90, Number(lat) + latHalf);
        return `https://worldview.earthdata.nasa.gov/?v=${west.toFixed(6)},${south.toFixed(6)},${east.toFixed(6)},${north.toFixed(6)}`;
      }
    },
    earthsearch: {
      name: "Element 84 Earth Search",
      url: ({lat, lon, zoom}) =>
        `https://console.earth-search.aws.element84.com/?z=${zoom}&c=${encodeURIComponent(`${lat},${lon}`)}`
    },
    copernicus: {
      name: "Copernicus Browser",
      url: ({lat, lon, zoom}) =>
        `https://browser.dataspace.copernicus.eu/?zoom=${zoom}&lat=${lat}&lng=${lon}&themeId=DEFAULT-THEME`
    },
    firms: {
      name: "NASA FIRMS",
      url: ({lat, lon, zoom}) =>
        `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${lon},${lat},${zoom}z`
    },
    windy: {
      name: "Windy",
      url: ({lat, lon}) =>
        `https://www.windy.com/?temp,${Number(lat).toFixed(6)},${Number(lon).toFixed(6)},8`
    },
    google: {
      name: "Google Maps",
      url: ({lat, lon, zoom}) =>
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`
    },
    earth: {
      name: "Google Earth",
      url: ({lat, lon, zoom}) =>
        `https://earth.google.com/web/search/${encodeURIComponent(`${lat},${lon}`)}`
    },
    apple: {
      name: "Apple Maps",
      url: ({lat, lon, name}) =>
        `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(name || "Saved place")}&t=h`
    },
    bing: {
      name: "Bing Aerial",
      url: ({lat, lon, zoom}) =>
        `https://bing.com/maps/default.aspx?cp=${lat}~${lon}&lvl=${zoom}&style=h`
    }
  };


  const providerGroups = {
    maps: {label: "Maps", providers: ["geohack", "openstreetmap", "wayback", "google", "earth", "apple", "bing"]},
    imagery: {label: "Imagery", providers: ["sentinel1", "sentinel2", "landsat", "worldview", "earthsearch", "copernicus"]},
    environment: {label: "Environment", providers: ["landcover", "firms", "windy"]}
  };

  window.FAExternalLinks = {providers, providerGroups};
})();
