// ── Title auto-detection engine ─────────────────────────────────
// Scans a dog's logged Results (trials + runs) and figures out which titles
// have been earned, using the Pass/Fail + points + faults already captured
// per run in the Results tab.
//
// What IS auto-detected: basic element titles (N qualifying legs of one
// element/level), level titles (all 4 elements passed — either the same
// trial day, or one basic title per element), USCSS Classic titles (all 4
// elements passed the same Classic-flagged trial), and AKC Elite element +
// level titles (10 qualifying legs per element, same as basic titles just a
// higher count — including the repeating numeric tiers for every +10 legs).
//
// Each earned title also carries a `nextLevel` field when earning it is what
// actually unlocks moving up to the next level per that org's rulebook:
//   - AKC & UKC: gating happens per ELEMENT (you must hold that element's
//     title at the current level before entering it at the next level), so
//     nextLevel is attached to the basic element titles.
//   - USCSS/Other & NACSW: gating happens per LEVEL (you need the full
//     level title — all 4 elements — before the next level unlocks), so
//     nextLevel is attached to the composite/level titles instead.
// `nextLevel` is null once a dog is already at the top level for that org.
//
// What is NOT auto-detected (add these manually from the Titles tab):
// NACSW's Elite/Summit/Champion/Grand Champion tiers, Skills Achievement
// Challenges, and Games titles — these depend on cumulative point totals
// across many trials, judge counts, or B-section leg tracking that this
// app doesn't capture at the per-run level. Detecting them wrong would be
// worse than not detecting them, so they're left for manual entry.

export const ORG_ELEMENTS = {
  NACSW: ["Container", "Exterior", "Interior", "Vehicle"],
  AKC: ["Container", "Interior", "Exterior", "Buried"],
  UKC: ["Container", "Interior", "Exterior", "Vehicle"],
  "USCSS/Other": ["Container", "Exterior", "Interior", "Vehicle"],
};

function flattenRuns(results, org) {
  // One row per run, tagged with which trial (result record) it came from.
  return (results || [])
    .filter(r => r.org === org && !r.isTitleOnly)
    .flatMap(r => (r.runs || []).map(run => ({
      ...run,
      trialId: r.id,
      date: r.date,
      trialName: r.trial,
      trialType: r.trialType || "",
    })));
}

function sameLevel(a, b) {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}

function nextLevelOf(levels, level) {
  const idx = levels.indexOf(level);
  return idx >= 0 && idx < levels.length - 1 ? levels[idx + 1] : null;
}

function matchingLegs(flat, { element, level, maxFaultsPerRun, minPointsPerRun }) {
  return flat.filter(run =>
    run.element === element &&
    sameLevel(run.level, level) &&
    run.result === "Pass" &&
    (maxFaultsPerRun == null || run.faults === "" || run.faults == null || Number(run.faults) <= maxFaultsPerRun) &&
    (minPointsPerRun == null || run.points === "" || run.points == null || Number(run.points) >= minPointsPerRun)
  );
}

function qualifyingLegs(flat, def) {
  const legs = matchingLegs(flat, def);
  return legs.length >= def.legsNeeded ? legs : null;
}

function singleTrialAllElements(results, org, { elements, level, maxTotalFaults, trialType }) {
  const trials = (results || []).filter(r => r.org === org && !r.isTitleOnly);
  for (const trial of trials) {
    if (trialType && (trial.trialType || "") !== trialType) continue;
    const runsAtLevel = (trial.runs || []).filter(run => sameLevel(run.level, level));
    const allPass = elements.every(el => runsAtLevel.some(run => run.element === el && run.result === "Pass"));
    if (!allPass) continue;
    if (maxTotalFaults != null) {
      const totalFaults = runsAtLevel
        .filter(run => elements.includes(run.element))
        .reduce((sum, run) => sum + (Number(run.faults) || 0), 0);
      if (totalFaults > maxTotalFaults) continue;
    }
    return { trialId: trial.id, date: trial.date, trialName: trial.trial };
  }
  return null;
}

function elementTitleDefs(org, elements, levels, legsConfigFor, labelFor, opts = {}) {
  const defs = [];
  for (const level of levels) {
    const nextLevel = opts.moveUpGate ? nextLevelOf(levels, level) : null;
    for (const element of elements) {
      defs.push({
        org, method: "qualifyingLegs",
        element, level,
        ...legsConfigFor(level),
        label: labelFor(element, level),
        key: `${org}|element|${element}|${level}`,
        nextLevel,
      });
    }
  }
  return defs;
}

export function getTitleDefs(org) {
  const elements = ORG_ELEMENTS[org];
  if (!elements) return [];

  if (org === "AKC") {
    const levels = ["Novice", "Advanced", "Excellent", "Master"];
    const elCode = { Container: "C", Interior: "I", Exterior: "E", Buried: "B" };
    const lvlCode = { Novice: "N", Advanced: "A", Excellent: "E", Master: "M" };
    // Basic element titles (3 Qs) are what actually let you move that element
    // up a level — see AKC rulebook "Moving Up" section.
    const elDefs = elementTitleDefs("AKC", elements, levels, () => ({ legsNeeded: 3 }),
      (el, lvl) => `S${elCode[el]}${lvlCode[lvl]} (${lvl} ${el})`, { moveUpGate: true });
    const lvlDefs = levels.map(level => ({
      org: "AKC", method: "compositeAllElements", elements, level,
      childKeys: elements.map(el => `AKC|element|${el}|${level}`),
      label: `SW${lvlCode[level]} (${level} Level Title)`,
      key: `AKC|level|${level}`,
      nextLevel: null, // move-up is already covered per-element above
    }));
    return [...elDefs, ...lvlDefs];
  }

  if (org === "UKC") {
    const levels = ["Novice", "Advanced", "Superior", "Master", "Elite"];
    // "Must hold an element's title at the current level before moving that
    // same element up a level" — per-element gating, same as AKC.
    const elDefs = elementTitleDefs("UKC", elements, levels, () => ({ legsNeeded: 2, maxFaultsPerRun: 1 }),
      (el, lvl) => `UKC ${lvl} ${el} Element Title`, { moveUpGate: true });
    const lvlLabel = { Novice: "NN", Advanced: "AN", Superior: "SN", Master: "MN", Elite: "EN" };
    const lvlDefs = levels.map(level => ({
      org: "UKC", method: "compositeAllElements", elements, level,
      childKeys: elements.map(el => `UKC|element|${el}|${level}`),
      label: `${lvlLabel[level]} (UKC ${level} Nosework Title)`,
      key: `UKC|level|${level}`,
      nextLevel: null,
    }));
    return [...elDefs, ...lvlDefs];
  }

  if (org === "USCSS/Other") {
    const levels = ["Novice", "Intermediate", "Advanced", "Senior", "Master"];
    const minPts = { Novice: 85, Intermediate: 85, Advanced: 90, Senior: 100, Master: 100 };
    // USCSS gates by the FULL level title (all 4 elements), not per element —
    // "earning any level's title unlocks the next level."
    const elDefs = elementTitleDefs("USCSS/Other", elements, levels,
      (level) => ({ legsNeeded: 3, minPointsPerRun: minPts[level] }),
      (el, lvl) => `USCSS ${lvl} ${el} Element Title`); // moveUpGate omitted — element titles alone don't unlock the next level
    const lvlDefs = levels.map(level => ({
      org: "USCSS/Other", method: "compositeAllElements", elements, level,
      childKeys: elements.map(el => `USCSS/Other|element|${el}|${level}`),
      label: `USCSS ${level} Variable Title (all 4 elements)`,
      key: `USCSS/Other|level|${level}`,
      nextLevel: nextLevelOf(levels, level),
    }));
    const classicDefs = levels.map(level => ({
      org: "USCSS/Other", method: "singleTrialAllElements", elements, level, trialType: "Classic",
      label: `USCSS ${level} Classic Title`,
      key: `USCSS/Other|classic|${level}`,
      nextLevel: nextLevelOf(levels, level),
    }));
    return [...elDefs, ...lvlDefs, ...classicDefs];
  }

  if (org === "NACSW") {
    const levels = ["NW1", "NW2", "NW3"];
    // NACSW gates by the full-day, all-4-elements level title.
    const lvlDefs = levels.map(level => ({
      org: "NACSW", method: "singleTrialAllElements", elements, level, maxTotalFaults: 3,
      label: level,
      key: `NACSW|level|${level}`,
      nextLevel: nextLevelOf(levels, level),
    }));
    const elCode = { Container: "C", Exterior: "E", Interior: "I", Vehicle: "V" };
    const elDefs = elements.map(el => ({
      org: "NACSW", method: "qualifyingLegs", element: el, level: "NW3", legsNeeded: 3,
      label: `NW3-${elCode[el]} (NW3 ${el} Element Title)`,
      key: `NACSW|element|${el}|NW3`,
      nextLevel: null, // NW3 is the top of the main ladder — this is a bonus title, not a gate
    }));
    return [...lvlDefs, ...elDefs];
  }

  return [];
}

// Returns titles satisfied given a dog's results for one org, as:
// { key, label, org, date, trialName, trialId, nextLevel }
export function detectEarnedTitles(org, results) {
  const defs = getTitleDefs(org);
  const flat = flattenRuns(results, org);
  const satisfied = {};
  const earned = [];

  for (const def of defs) {
    if (def.method === "qualifyingLegs") {
      const legs = qualifyingLegs(flat, def);
      if (legs) {
        const last = legs[legs.length - 1];
        satisfied[def.key] = true;
        earned.push({ key: def.key, label: def.label, org, date: last?.date, trialName: last?.trialName, trialId: last?.trialId, nextLevel: def.nextLevel || null });
      }
    } else if (def.method === "singleTrialAllElements") {
      const hit = singleTrialAllElements(results, org, def);
      if (hit) {
        satisfied[def.key] = true;
        earned.push({ key: def.key, label: def.label, org, date: hit.date, trialName: hit.trialName, trialId: hit.trialId, nextLevel: def.nextLevel || null });
      }
    }
  }

  for (const def of defs) {
    if (def.method === "compositeAllElements") {
      const allHeld = def.childKeys.every(k => satisfied[k]);
      if (allHeld) {
        const contributing = earned.filter(e => def.childKeys.includes(e.key));
        const latest = contributing.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""))[contributing.length - 1];
        satisfied[def.key] = true;
        earned.push({ key: def.key, label: def.label, org, date: latest?.date, trialName: latest?.trialName, trialId: latest?.trialId, nextLevel: def.nextLevel || null });
      }
    }
  }

  // ── AKC Elite tiers ────────────────────────────────────────────
  // Per the AKC rulebook: Elite element titles = 10 qualifying scores in
  // that element/level (same pass criteria as the basic title, just more of
  // them). Elite level titles are earned once Elite is held in all 4
  // elements. Numeric tiers (Elite2, Elite3...) repeat every +10 legs,
  // indefinitely — so unlike the rest of the engine, these are computed
  // directly from the leg count rather than a fixed list of defs, since the
  // number of tiers a dog can reach is unbounded and dog-specific.
  if (org === "AKC") {
    const levels = ["Novice", "Advanced", "Excellent", "Master"];
    const elements = ORG_ELEMENTS.AKC;
    const elCode = { Container: "C", Interior: "I", Exterior: "E", Buried: "B" };
    const lvlCode = { Novice: "N", Advanced: "A", Excellent: "E", Master: "M" };
    for (const level of levels) {
      const tiersByElement = {};
      for (const element of elements) {
        const legs = matchingLegs(flat, { element, level });
        const tiersEarned = Math.floor(legs.length / 10);
        tiersByElement[element] = tiersEarned;
        const basicCode = `S${elCode[element]}${lvlCode[level]}`;
        for (let tier = 1; tier <= tiersEarned; tier++) {
          const last = legs[legs.length - 1];
          earned.push({
            key: `AKC|elite|${element}|${level}|${tier}`,
            label: tier === 1
              ? `${basicCode}E (${level} ${element} Elite — 10 Qs)`
              : `${basicCode}E${tier} (${level} ${element} Elite ${tier} — ${tier * 10} Qs)`,
            org, date: last?.date, trialName: last?.trialName, trialId: last?.trialId,
            nextLevel: null,
          });
        }
      }
      const minTier = Math.min(...elements.map(el => tiersByElement[el]));
      for (let tier = 1; tier <= minTier; tier++) {
        earned.push({
          key: `AKC|eliteLevel|${level}|${tier}`,
          label: tier === 1
            ? `SW${lvlCode[level]}E (${level} Level Elite Title)`
            : `SW${lvlCode[level]}E${tier} (${level} Level Elite Title ${tier})`,
          org, date: null, trialName: null, trialId: null,
          nextLevel: null,
        });
      }
    }
  }

  return earned;
}
