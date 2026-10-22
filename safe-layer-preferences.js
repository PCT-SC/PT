(() => {
  "use strict";
  const migrations = [
    ["fa.worldcover.opacity", "pt.worldcover.opacity", "opacity"],
    ["fa.elevation.opacity", "pt.elevation.opacity", "opacity"],
    ["fa.openinframap.v1", "pt.openinframap.v1", "oim"],
    ["fa-versatiles-overlay-v1", "pt-versatiles-overlay-v1", "versatiles"],
    ["field-atlas-map-tool-slot-v1", "project-tracker-map-tool-slot-v1", "slot"]
  ];
  const numberBetween = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  function cleaned(type, raw) {
    if (type === "opacity") {
      const val = Number(raw);
      return Number.isFinite(val) && val >= 0 && val <= 1 ? String(val) : null;
    }
    if (type === "slot") return ["wc", "elv", "sar", "oap", "wiki", "oim"].includes(raw) ? raw : null;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return null; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (type === "oim") {
      const out = {};
      if (numberBetween(parsed.opacity, 0, 1)) out.opacity = parsed.opacity;
      if (typeof parsed.symbols === "boolean") out.symbols = parsed.symbols;
      const valid = ["power", "telecoms", "petroleum", "water", "other", "solar", "validation"];
      const cats = {};
      for (const id of valid) if (typeof parsed.categories?.[id] === "boolean") cats[id] = parsed.categories[id];
      out.categories = cats;
      return JSON.stringify(out);
    }
    if (type === "versatiles") {
      const bools = ["enabled", "labels", "waterLabels", "roads", "roadLabels", "borders", "preferEnglish", "uppercaseCountries", "strictCountryLabels"];
      const nums = ["labelScale", "countryWeight", "stateWeight", "cityWeight", "roadWeight", "haloWidth", "roadWidth", "borderWidth", "opacity"];
      const cols = ["labelColor", "haloColor", "roadColor", "borderColor"];
      const out = {};
      for (const k of bools) if (typeof parsed[k] === "boolean") out[k] = parsed[k];
      for (const k of nums) if (numberBetween(parsed[k], 0, 1000)) out[k] = parsed[k];
      for (const k of cols) if (typeof parsed[k] === "string" && /^#[0-9a-f]{6}$/i.test(parsed[k])) out[k] = parsed[k];
      if (parsed.source === "versatiles") out.source = "versatiles";
      if (parsed.fontFamily === "Roboto") out.fontFamily = "Roboto";
      return JSON.stringify(out);
    }
    return null;
  }
  try {
    for (const [from, to, type] of migrations) {
      if (localStorage.getItem(to) !== null) continue;
      const raw = localStorage.getItem(from);
      if (raw === null) continue;
      const clean = cleaned(type, raw);
      if (clean !== null) localStorage.setItem(to, clean);
    }
  } catch { /* Local storage may be unavailable on some file:// browsers. */ }
})();
