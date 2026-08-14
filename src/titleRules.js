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
// USCSS/Other Games titles ARE also auto-detected (see the "USCSS Games"
// block near the bottom of detectEarnedTitles) — individual game titles
// (DDCC, DDFO, etc.), the Gamer ladder (DDGA/Bronze/Silver/Gold), Gamer Pro
// (DDGP/DDGPX), and Championship (DDCH), all straight from Table 6/7/8 of
// the USCSS rulebook.
//
// What is NOT auto-detected (add these manually from the Titles tab):
// NACSW's Elite/Summit/Champion/Grand Champion tiers and Skills Achievement
// Challenges — these depend on cumulative point totals across many trials,
// judge counts, or B-section leg tracking that this app doesn't capture at
// the per-run level. Detecting them wrong would be worse than not detecting
// them, so they're left for manual entry.

export const ORG_ELEMENTS = {
  NACSW: ["Container", "Exterior", "Interior", "Vehicle"],
  AKC: ["Container", "Interior", "Exterior", "Buried"],
  UKC: ["Container", "Interior", "Exterior", "Vehicle"],
  "USCSS/Other": ["Container", "Exterior", "Interior", "Vehicle"],
};

// The official level/class ladder for each org, in order. This is the single
// source of truth for both title detection (below) AND the Level dropdown in
// the Results run form — so whatever a competitor picks when logging a run
// is guaranteed to be spelled exactly the way the detection engine expects.
export const ORG_LEVELS = {
  NACSW: ["NW1", "NW2", "NW3"],
  AKC: ["Novice", "Advanced", "Excellent", "Master"],
  UKC: ["Novice", "Advanced", "Superior", "Master", "Elite"],
  "USCSS/Other": ["Novice", "Intermediate", "Advanced", "Senior", "Master"],
};

// Everything a trial could plausibly offer, for the "what's being offered at
// this trial" multi-select on the admin Add Trial form — the main level
// ladder plus each org's other divisions/specialty classes/games, straight
// from the cheat sheets. This is deliberately broader than ORG_LEVELS (which
// is just the main titling ladder used for detection).
export const ORG_OFFERINGS = {
  NACSW: [
    "ORT", "NW1", "NW2", "NW3", "NW3 Elite",
    "Element Specialty L1", "Element Specialty L2", "Element Specialty L3",
    "Elite Division", "Summit League", "Skills Achievement Challenge",
  ],
  AKC: [
    "Novice", "Advanced", "Excellent", "Master",
    "Handler Discrimination Novice", "Handler Discrimination Advanced",
    "Handler Discrimination Excellent", "Handler Discrimination Master",
    "Detective Class",
  ],
  UKC: [
    "Novice", "Advanced", "Superior", "Master", "Elite",
    "Handler Discrimination Novice", "Handler Discrimination Advanced",
    "Handler Discrimination Excellent", "Handler Discrimination Master",
  ],
  "USCSS/Other": [
    "Novice", "Intermediate", "Advanced", "Senior", "Master", "Detection Dog Extreme",
    // Games classes
    "Copy Cat", "Double Dog Dare", "Go the Distance", "Heap O'Hides",
    "LudicrouSpeed", "Pairs Challenge", "Scenting Sweepstakes", "Team Spirit",
  ],
};

// ── USCSS Games ──────────────────────────────────────────────────
// Games aren't leveled — each one has a single fixed pass bar (Table 6 in
// the rulebook): a minimum point score and a max number of false alerts.
// One qualifying run in a game earns that game's title outright (no leg
// count, unlike Elements). This exact list is also what should populate
// the "Game" dropdown wherever a competitor logs a game run, so the names
// always match what this engine is looking for.
export const GAME_NAMES = [
  "Copy Cat", "Double Dog Dare", "Go the Distance", "Heap O'Hides",
  "LudicrouSpeed", "Pairs Challenge", "Scenting Sweepstakes", "Team Spirit",
];

const GAME_CRITERIA = {
  "Copy Cat":             { code: "DDCC", name: "Detection Dog Copy Cat",        minPoints: 95, maxFaults: 0 },
  "Double Dog Dare":      { code: "DDFO", name: "Detection Dog Focus",           minPoints: 90, maxFaults: 2 },
  "Go the Distance":      { code: "DDDI", name: "Detection Dog Distance",        minPoints: 95, maxFaults: 0 },
  "Heap O'Hides":         { code: "DDEN", name: "Detection Dog Endurance",       minPoints: 50, maxFaults: 2 },
  "LudicrouSpeed":        { code: "DDLS", name: "Detection Dog Speed",           minPoints: 50, maxFaults: 2 },
  "Pairs Challenge":      { code: "DDPC", name: "Detection Dog Pairs Challenge", minPoints: 75, maxFaults: 2 },
  "Scenting Sweepstakes": { code: "DDSW", name: "Detection Dog Sweepstakes",     minPoints: 75, maxFaults: 0 },
  "Team Spirit":          { code: "DDTW", name: "Detection Dog Teamwork",       minPoints: 90, maxFaults: 2 },
};

// Mirrors matchingLegs()'s "only check faults/points if they were actually
// logged" leniency — points/faults are optional fields on a run, so a run
// with a "Pass" result but no numbers filled in still counts.
function gameQualifies(run, crit) {
  return run.result === "Pass" &&
    (run.faults === "" || run.faults == null || Number(run.faults) <= crit.maxFaults) &&
    (run.points === "" || run.points == null || Number(run.points) >= crit.minPoints);
}

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

// Strips things like "Novice A", "Novice-A", "Novice (A)", "Novice Section B"
// down to just "novice" — AKC (and others) split some levels into Section
// A/B for entry eligibility, but it's the same searches/criteria either way,
// so it shouldn't matter for title detection: a Section A leg and a Section B
// leg both count toward the same element title. This also means runs already
// logged with a section suffix in any of these formats — before the Level
// dropdown/Section selector existed — will still match correctly.
function normalizeLevel(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/[()]/g, "")           // "Novice (A)" -> "novice a"
    .replace(/-/g, " ")             // "Novice-A" -> "novice a"
    .replace(/\s+/g, " ")           // collapse repeated spaces
    .trim()
    .replace(/\s+sec(tion)?\s+[ab]$/, "")  // "novice section a" / "novice sec a" -> "novice"
    .replace(/\s+[ab]$/, "");              // "novice a" -> "novice"
}
function sameLevel(a, b) {
  return normalizeLevel(a) === normalizeLevel(b);
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
    const levels = ORG_LEVELS.AKC;
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
    const levels = ORG_LEVELS.UKC;
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
    const levels = ORG_LEVELS["USCSS/Other"];
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
    const levels = ORG_LEVELS.NACSW;
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

// Live progress toward the basic element title while logging a run — e.g.
// "2 of 3 qualifying passes logged, 1 to go." Used by the Results run form
// so competitors can see how close they are without waiting for the
// suggestion banner. Returns null if this org/element/level has no basic
// element title (e.g. NACSW outside NW3, or a non-standard level).
// If the basic title is already earned, also reports progress toward the
// next AKC Elite tier (10 Qs), since that's the only org with a repeating
// tier built on the same qualifying-legs criteria.
export function elementProgress(org, element, level, results) {
  const defs = getTitleDefs(org);
  const def = defs.find(d => d.method === "qualifyingLegs" && d.element === element && sameLevel(d.level, level));
  if (!def) return null;
  const flat = flattenRuns(results, org);
  const legs = matchingLegs(flat, def);
  const legsHeld = legs.length;
  const basicComplete = legsHeld >= def.legsNeeded;
  const result = {
    label: def.label,
    legsHeld,
    legsNeeded: def.legsNeeded,
    remaining: Math.max(0, def.legsNeeded - legsHeld),
    basicComplete,
  };
  if (org === "AKC" && basicComplete) {
    const sinceBasic = legsHeld % 10;
    result.eliteLegsHeld = legsHeld;
    result.eliteRemaining = sinceBasic === 0 ? 0 : 10 - sinceBasic;
    result.eliteTiersEarned = Math.floor(legsHeld / 10);
  }
  return result;
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
    const levels = ORG_LEVELS.AKC;
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

  // ── USCSS Games ────────────────────────────────────────────────
  // Per Table 6/7/8 of the rulebook:
  //   - Each game's own title (DDCC, DDFO...) is earned with 1 qualifying run.
  //   - DDGA needs titles in 5 DIFFERENT games; Bronze/Silver/Gold add a
  //     6th/7th/8th different game (Gold = all 8, since that's the whole list).
  //   - DDGP doesn't require different games — it's earned once 10 total
  //     qualifying game runs have accumulated (repeats of the same game
  //     count), then DDGPX repeats every 5 more after that.
  //   - Championship (DDCH) = a Master level title + DDGA.
  if (org === "USCSS/Other") {
    const gameRuns = flat.filter(run => run.isGame && GAME_CRITERIA[run.gameName]);

    // Individual game titles — date of the FIRST qualifying run in each game.
    const titledGames = [];
    for (const gname of GAME_NAMES) {
      const crit = GAME_CRITERIA[gname];
      const qualifying = gameRuns
        .filter(run => run.gameName === gname && gameQualifies(run, crit))
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      if (qualifying.length > 0) {
        const first = qualifying[0];
        earned.push({
          key: `USCSS/Other|game|${gname}`,
          label: `${crit.code} (${crit.name} — ${gname} Game Title)`,
          org, date: first.date, trialName: first.trialName, trialId: first.trialId,
          nextLevel: null,
        });
        titledGames.push({ name: gname, date: first.date });
      }
    }

    // Gamer ladder — by count of distinct games titled, in the order each
    // was first earned.
    titledGames.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const gamerTiers = [
      { count: 5, key: "DDGA",  label: "DDGA (Detection Dog Gamer — titles in 5 different games)" },
      { count: 6, key: "DDGAB", label: "DDGAB (Detection Dog Gamer Bronze — title in a 6th different game)" },
      { count: 7, key: "DDGAS", label: "DDGAS (Detection Dog Gamer Silver — title in a 7th different game)" },
      { count: 8, key: "DDGAG", label: "DDGAG (Detection Dog Gamer Gold — title in an 8th different game)" },
    ];
    let ddgaEarned = null;
    for (const tier of gamerTiers) {
      if (titledGames.length >= tier.count) {
        const last = titledGames[tier.count - 1];
        earned.push({ key: `USCSS/Other|gamer|${tier.key}`, label: tier.label, org, date: last.date, trialName: null, trialId: null, nextLevel: null });
        if (tier.key === "DDGA") ddgaEarned = last.date;
      }
    }

    // Gamer Pro — every qualifying game run counts toward the running
    // total, repeats of the same game included: 10 for DDGP, then +5 for
    // each DDGPX after that.
    const allQualifyingRuns = gameRuns
      .filter(run => gameQualifies(run, GAME_CRITERIA[run.gameName]))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (allQualifyingRuns.length >= 10) {
      earned.push({
        key: "USCSS/Other|gamerPro|0",
        label: "DDGP (Detection Dog Gamer Pro — 10 Game titles)",
        org, date: allQualifyingRuns[9]?.date, trialName: null, trialId: null, nextLevel: null,
      });
      const extraTiers = Math.floor((allQualifyingRuns.length - 10) / 5);
      for (let t = 1; t <= extraTiers; t++) {
        const idx = 10 + t * 5 - 1;
        earned.push({
          key: `USCSS/Other|gamerPro|${t}`,
          label: t === 1
            ? `DDGPX (Detection Dog Gamer Pro X — ${10 + t * 5} Game titles)`
            : `DDGPX${t} (Detection Dog Gamer Pro X ${t} — ${10 + t * 5} Game titles)`,
          org, date: allQualifyingRuns[idx]?.date, trialName: null, trialId: null, nextLevel: null,
        });
      }
    }

    // Championship — Master (Classic or Variable) level title + DDGA.
    if (ddgaEarned) {
      const masterHeld = satisfied["USCSS/Other|level|Master"] || satisfied["USCSS/Other|classic|Master"];
      if (masterHeld) {
        const masterEntry = earned.find(e => e.key === "USCSS/Other|level|Master" || e.key === "USCSS/Other|classic|Master");
        const champDate = [masterEntry?.date, ddgaEarned].filter(Boolean).sort().pop();
        earned.push({
          key: "USCSS/Other|championship",
          label: "DDCH (Detection Dog Champion — Master title + DDGA)",
          org, date: champDate, trialName: null, trialId: null, nextLevel: null,
        });
      }
    }
  }

  return earned;
}
