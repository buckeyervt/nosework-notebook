// ── Title auto-detection engine ─────────────────────────────────
// Scans a dog's logged Results (trials + runs) and figures out which titles
// have been earned, using the Pass/Fail + points + faults already captured
// per run in the Results tab.
//
// What IS auto-detected: basic element titles (N qualifying legs of one
// element/level), level titles (all 4 elements passed — either the same
// trial day, or one basic title per element), and USCSS Classic titles
// (all 4 elements passed the same Classic-flagged trial).
//
// What is NOT auto-detected (add these manually from the Titles tab):
// Elite / Summit / Champion / Grand Champion tiers, Skills Achievement
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

function qualifyingLegs(flat, { element, level, legsNeeded, maxFaultsPerRun, minPointsPerRun }) {
  const legs = flat.filter(run =>
    run.element === element &&
    sameLevel(run.level, level) &&
    run.result === "Pass" &&
    (maxFaultsPerRun == null || run.faults === "" || run.faults == null || Number(run.faults) <= maxFaultsPerRun) &&
    (minPointsPerRun == null || run.points === "" || run.points == null || Number(run.points) >= minPointsPerRun)
  );
  return legs.length >= legsNeeded ? legs : null;
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

function elementTitleDefs(org, elements, levels, legsConfigFor, labelFor) {
  const defs = [];
  for (const level of levels) {
    for (const element of elements) {
      defs.push({
        org, method: "qualifyingLegs",
        element, level,
        ...legsConfigFor(level),
        label: labelFor(element, level),
        key: `${org}|element|${element}|${level}`,
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
    const elDefs = elementTitleDefs("AKC", elements, levels, () => ({ legsNeeded: 3 }),
      (el, lvl) => `S${elCode[el]}${lvlCode[lvl]} (${lvl} ${el})`);
    const lvlDefs = levels.map(level => ({
      org: "AKC", method: "compositeAllElements", elements, level,
      childKeys: elements.map(el => `AKC|element|${el}|${level}`),
      label: `SW${lvlCode[level]} (${level} Level Title)`,
      key: `AKC|level|${level}`,
    }));
    return [...elDefs, ...lvlDefs];
  }

  if (org === "UKC") {
    const levels = ["Novice", "Advanced", "Superior", "Master", "Elite"];
    const elDefs = elementTitleDefs("UKC", elements, levels, () => ({ legsNeeded: 2, maxFaultsPerRun: 1 }),
      (el, lvl) => `UKC ${lvl} ${el} Element Title`);
    const lvlLabel = { Novice: "NN", Advanced: "AN", Superior: "SN", Master: "MN", Elite: "EN" };
    const lvlDefs = levels.map(level => ({
      org: "UKC", method: "compositeAllElements", elements, level,
      childKeys: elements.map(el => `UKC|element|${el}|${level}`),
      label: `${lvlLabel[level]} (UKC ${level} Nosework Title)`,
      key: `UKC|level|${level}`,
    }));
    return [...elDefs, ...lvlDefs];
  }

  if (org === "USCSS/Other") {
    const levels = ["Novice", "Intermediate", "Advanced", "Senior", "Master"];
    const minPts = { Novice: 85, Intermediate: 85, Advanced: 90, Senior: 100, Master: 100 };
    const elDefs = elementTitleDefs("USCSS/Other", elements, levels,
      (level) => ({ legsNeeded: 3, minPointsPerRun: minPts[level] }),
      (el, lvl) => `USCSS ${lvl} ${el} Element Title`);
    const lvlDefs = levels.map(level => ({
      org: "USCSS/Other", method: "compositeAllElements", elements, level,
      childKeys: elements.map(el => `USCSS/Other|element|${el}|${level}`),
      label: `USCSS ${level} Variable Title (all 4 elements)`,
      key: `USCSS/Other|level|${level}`,
    }));
    const classicDefs = levels.map(level => ({
      org: "USCSS/Other", method: "singleTrialAllElements", elements, level, trialType: "Classic",
      label: `USCSS ${level} Classic Title`,
      key: `USCSS/Other|classic|${level}`,
    }));
    return [...elDefs, ...lvlDefs, ...classicDefs];
  }

  if (org === "NACSW") {
    const levels = ["NW1", "NW2", "NW3"];
    const lvlDefs = levels.map(level => ({
      org: "NACSW", method: "singleTrialAllElements", elements, level, maxTotalFaults: 3,
      label: level,
      key: `NACSW|level|${level}`,
    }));
    const elCode = { Container: "C", Exterior: "E", Interior: "I", Vehicle: "V" };
    const elDefs = elements.map(el => ({
      org: "NACSW", method: "qualifyingLegs", element: el, level: "NW3", legsNeeded: 3,
      label: `NW3-${elCode[el]} (NW3 ${el} Element Title)`,
      key: `NACSW|element|${el}|NW3`,
    }));
    return [...lvlDefs, ...elDefs];
  }

  return [];
}

// Returns titles satisfied given a dog's results for one org, as:
// { key, label, org, date, trialName, trialId }
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
        earned.push({ key: def.key, label: def.label, org, date: last?.date, trialName: last?.trialName, trialId: last?.trialId });
      }
    } else if (def.method === "singleTrialAllElements") {
      const hit = singleTrialAllElements(results, org, def);
      if (hit) {
        satisfied[def.key] = true;
        earned.push({ key: def.key, label: def.label, org, date: hit.date, trialName: hit.trialName, trialId: hit.trialId });
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
        earned.push({ key: def.key, label: def.label, org, date: latest?.date, trialName: latest?.trialName, trialId: latest?.trialId });
      }
    }
  }

  return earned;
}
