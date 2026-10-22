(() => {
  "use strict";
  const EARTH_RADIUS_M = 6371000;
  const MAX_DISTANCE_M = 300000;
  const clampHeight = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(10000, Number(value))) : 2;

  function clearanceSections(adjusted, sight) {
    const sections = [];
    const length = adjusted.length;
    if (length < 2) return sections;
    const add = (from, to, kind) => {
      if (to - from < 1e-10) return;
      const last = sections[sections.length - 1];
      if (last && last.kind === kind && Math.abs(last.to - from) < 1e-9) last.to = to;
      else sections.push({from, to, kind});
    };
    for (let i = 1; i < length; i += 1) {
      const from = (i - 1) / (length - 1);
      const to = i / (length - 1);
      const left = Number.isFinite(adjusted[i - 1]) ? sight[i - 1] - adjusted[i - 1] : NaN;
      const right = Number.isFinite(adjusted[i]) ? sight[i] - adjusted[i] : NaN;
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        add(from, to, "unknown");
      } else if (left >= 0 && right >= 0) {
        add(from, to, "clear");
      } else if (left <= 0 && right <= 0) {
        add(from, to, "blocked");
      } else {
        const crossing = from + (to - from) * Math.abs(left) / (Math.abs(left) + Math.abs(right));
        add(from, crossing, left > 0 ? "clear" : "blocked");
        add(crossing, to, right > 0 ? "clear" : "blocked");
      }
    }
    return sections;
  }

  function analyze(distance, values, observerHeight = 2, targetHeight = 2) {
    const heights = {observerHeight: clampHeight(observerHeight), targetHeight: clampHeight(targetHeight)};
    const data = Array.isArray(values) ? values : [];
    const empty = {status: "unavailable", firstIndex: -1, firstDistance: null, minimumClearance: null, adjusted: [], sight: [], ...heights};
    if (!Number.isFinite(distance) || distance <= 0 || distance > MAX_DISTANCE_M || data.length < 3 || !Number.isFinite(data[0]) || !Number.isFinite(data[data.length - 1])) return empty;
    const start = data[0] + heights.observerHeight;
    const end = data[data.length - 1] + heights.targetHeight;
    const adjusted = [];
    const sight = [];
    let firstIndex = -1;
    let minimumClearance = Infinity;
    let missing = false;
    for (let i = 0; i < data.length; i += 1) {
      const t = i / (data.length - 1);
      const ray = start + (end - start) * t;
      sight.push(ray);
      if (!Number.isFinite(data[i])) { missing = true; adjusted.push(null); continue; }
      const bulge = (distance * distance * t * (1 - t)) / (2 * EARTH_RADIUS_M);
      const terrain = data[i] + bulge;
      adjusted.push(terrain);
      if (i === 0 || i === data.length - 1) continue;
      const clearance = ray - terrain;
      if (clearance < minimumClearance) minimumClearance = clearance;
      if (clearance <= 0 && firstIndex < 0) firstIndex = i;
    }
    return {
      status: firstIndex >= 0 ? "obstructed" : missing ? "incomplete" : "clear",
      firstIndex,
      firstDistance: firstIndex >= 0 ? distance * firstIndex / (data.length - 1) : null,
      minimumClearance: Number.isFinite(minimumClearance) ? minimumClearance : null,
      adjusted, sight, sections: clearanceSections(adjusted, sight), missing,
      ...heights
    };
  }

  window.FALineOfSight = {analyze, clampHeight, MAX_DISTANCE_M};
})();
