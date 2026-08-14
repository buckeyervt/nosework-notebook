// ── Rules & Regs cheat sheets ───────────────────────────────────
// "Fast pass" competitor summaries pulled from each org's official rulebook.
// This content is hand-curated and lives in code (not Firebase) since rulebooks
// only change every year or two. When an org updates their rules, update the
// relevant section below and bump the app version / What's New entry.
// The FULL rulebook PDF link shown under each org IS editable from the Admin
// Panel (Rules tab) and lives in Firestore, since that's the part Tina keeps current.

export const CHEAT_SHEETS = {
  NACSW: {
    sections: [
      {
        heading: "Classes & Path",
        bullets: [
          "**ORT** (Odor Recognition Test) — pass/fail on Birch, Anise, Clove; required before your first NW1.",
          "**NW1 → NW2 → NW3** — the main title ladder, earned in order.",
          "**NW3 Element Titles** (NW3-C/E/I/V) — one per element, earned alongside NW3.",
          "**NW3 Elite** — after 3 NW3 titles + an NW3 or Level 3 element title in all 4 elements.",
          "**Element Specialty Trials** (L1/L2/L3, per element) — a parallel single-element ladder roughly matched to NW1–NW3.",
          "**Elite Division** (ELT1 → ELT2 → ELT3 → ELT-CH) — requires NW3 Elite; points-based across multiple trials.",
          "**Summit League** (SMT) — requires ELT3/ELT-CH; 2-day placement title, top 20% of field.",
          "**Skills Achievement Challenges** (NSA1–NSAM) — no prerequisites, video-submitted, not run live.",
        ],
      },
      {
        heading: "What to Expect",
        bullets: [
          "**NW1/L1**: 4 searches — one each of Container, Exterior, Interior, Vehicle. 1 hide per area, unknown to you. Up to 3 vehicles.",
          "**NW2/L2**: 5 searches (every element + 1 extra). 1–3 hides/area — you're told the count but not the location. Up to 4 vehicles.",
          "**NW3/L3**: 6 searches (every element + 2 extra). 0–3 hides/area — count AND location unknown; up to 1 blank area allowed. Up to 5 vehicles.",
          "**Elite/Summit**: 3–5 searches per day, elements mixed together (e.g. Exterior+Vehicle combined), hide range announced before you search, location always unknown.",
          "Hide height guide: ~4 ft at NW1/NW2/L1/L2, ~6 ft at NW3/L3.",
          "Time limits aren't fixed by the rulebook — the Certifying Official sets them per search and announces at briefing (typically 2–4 min).",
        ],
      },
      {
        heading: "Moving Up",
        bullets: [
          "**NW1/NW2/L1/L2**: Perfect 100 pts, ≤3 faults, all 4 elements same day. (L1 can also use 2 qualifying 75+ scores across 2 trials.)",
          "**NW3/L2/L3**: Either a perfect 100/≤3 faults in one trial, or two qualifying scores (only 1 error, ≤3 faults) across two trials. Max 3 NW3 titles ever.",
          "**NW3 Element titles**: 3 qualifying passes of that element.",
          "**NW3 Elite**: 3 NW3 titles + an element title (NW3 or L3) in all 4 elements.",
          "**Elite**: cumulative points — 150/400/650/1000 for ELT1/2/3/CH; must score ≥43 pts/trial to count.",
          "**Summit**: top 20% placement at a Summit trial.",
          "Must wait at least 3 days after earning a title/ORT before trialing the next level.",
        ],
      },
      {
        heading: "Common Faults",
        bullets: [
          "**False Alert**: NW1/L1 = search ends, 0 pts. NW2 = keep points found so far. NW3/L2/L3 = 1 error + lose that hide's points; 2nd false alert ends the search. Elite/Summit = ½-hide deduction each, max 3.",
          "**Timed Out** (no 'Finish' called): NW2+ = full time charged; NW3+/Elite/Summit also lose points.",
          "**Faults** (up to 3 allowed, still title): damaging/pawing at property, contaminating the search area, safety violations (off-leash, dog under a vehicle, missed start line, wrong alert signal).",
          "**Elimination** (potty in/near search area): 0 pts + 4 faults (NW1–L3); Elite/Summit lose 1–2 hides' worth.",
          "**Excused**: judge stops for stress, pain, disruption, or dog out of control — 0 pts + 4 faults.",
          "**Absent**: 0 pts + 4 faults, full time charged.",
          "**Dismissed** (whole trial): grounds include aggression, harsh corrections, cheating — can mean a 1-year suspension.",
        ],
      },
    ],
  },

  AKC: {
    sections: [
      {
        heading: "Classes & Path",
        bullets: [
          "**Odor Search Division**: Novice → Advanced → Excellent → Master, per element (Container, Interior, Exterior, Buried). You can run 2 difficulty levels per element per trial.",
          "**Handler Discrimination Division**: Novice (Container) → Advanced (Interior) → Excellent (Exterior) → Master (2+ elements combined) — dog searches for handler's own scent.",
          "**Detective Class**: elite, single class — open once you've earned any Master title (SCM/SIM/SEM/SBM). One big indoor+outdoor search.",
          "Regional & National Championships are non-titling special events.",
        ],
      },
      {
        heading: "What to Expect",
        bullets: [
          "**Container**: Novice = 1 hide/10 boxes/2 min → Master = 1–3 unknown hides/20 boxes/4 min, no 30-sec warning.",
          "**Interior**: Novice = 1 hide, 100–200 sqft → Master = 2–6 unknown hides across 3 areas (1 may be blank), 600–1000 sqft.",
          "**Exterior**: Novice = 1 hide, 200–400 sqft → Master = 1–4 unknown hides, 1500–2000 sqft, hides may be inaccessible.",
          "**Buried**: Novice = 1 hide/6 sand boxes → Master = 1–4 unknown hides/16 boxes (8 sand + 8 water).",
          "Odors unlock by level: Novice = Birch, Advanced = +Anise, Excellent = +Clove, Master = +Cypress.",
          "**Handler Discrimination**: dog finds an article scented by YOU, with a judge-scented decoy planted as a distractor (Master adds a steward-scented decoy too).",
          "**Detective**: 2,000–5,000 sqft indoor+outdoor course, 5–10 unknown hides, any odor, no height limit.",
          "You must verbally call \"Alert\" on every find, and \"Finish\" whenever hide count isn't known to stop your time — miss this and it's an automatic NQ.",
        ],
      },
      {
        heading: "Moving Up",
        bullets: [
          "**Basic element titles**: 3 qualifying scores, any judges.",
          "**Level titles** (SWN/SWA/SWE/SWM): automatic once you hold the basic title in all 4 elements at that level.",
          "**Elite titles**: 10 qualifying scores per element; Elite level titles once held in all 4.",
          "Must hold Novice before Advanced, Advanced before Excellent, Excellent before Master — there is no \"double-Q\" system in this sport.",
          "Moving down a class is allowed anytime (except Regionals, which cap you at your highest title).",
        ],
      },
      {
        heading: "Common Faults",
        bullets: [
          "**Faults** (affect placement, not Q/NQ): handler interference, off-leash in an on-leash area, messy reward delivery.",
          "**Automatic NQ**: wrong-location \"Alert\" call, calling \"Finish\" early, going over time, can't point to the hide when asked, harsh corrections, damaging the search area, re-cuing after \"Alert\", discussing results before the class ends.",
          "**Excused** (can still run other classes): dog out of control, 10+ sec of no work after a warning, elimination, extreme stress, getting outside help.",
          "**\"Fix and Go On\"** (Detective Class only): after a wrong alert, you can keep working one specific hide if time remains — still scored NQ.",
          "30-sec time warnings are given at Novice/Advanced/Excellent — NOT at Master level or Detective, so watch your own clock.",
        ],
      },
    ],
  },

  UKC: {
    sections: [
      {
        heading: "Classes & Path",
        bullets: [
          "**Novice → Advanced → Superior → Master → Elite**, each tied to a required odor: Birch, Anise, Clove, Myrrh, Vetiver.",
          "Every level searches all 4 elements: Container, Interior, Exterior, Vehicle.",
          "\"A\" Section = haven't yet titled at that class; \"B\" Section = open to everyone.",
          "Separate **Handler Discrimination** ladder: Novice → Advanced → Excellent → Master (dog finds handler's scented article).",
          "**Nosework titles** (NN/AN/SN/MN/EN) once you hold all 4 element titles at a level → then Class Champion → Class Grand Champion → overall Nosework Champion/Grand Champion.",
        ],
      },
      {
        heading: "What to Expect",
        bullets: [
          "**Novice**: 1 hide, Birch only, 3 min, 2 ft max height, 12 containers, 100–150 sqft interior, no distractions.",
          "**Advanced**: 1 hide, Anise only, 4 min, 2 ft max, 1 distraction added.",
          "**Superior**: 2 hides (Clove + Birch/Anise), 5 min, 3 ft max, 2 interior areas.",
          "**Master**: 3 hides (Myrrh + others), 6 min, 4 ft max, 3 areas.",
          "**Elite**: 1–4 hides (count NOT told to you), Vetiver + 4 other odors, 6 min, 5 ft max, 2 distractions — you call \"Finish\" when you believe you've found them all.",
          "Hide location is always unknown to the handler at every level — only the count is announced (except Elite).",
          "Vehicles: 3 at Novice/Advanced up to 6 scattered at Elite; you may never open doors or direct your dog under/into a vehicle.",
        ],
      },
      {
        heading: "Moving Up",
        bullets: [
          "**Element title**: 2 qualifying passes at 2 different trials, ≤1 fault each.",
          "**Nosework title**: hold all 4 element titles (Container/Interior/Exterior/Vehicle) at that level.",
          "Must hold an element's title at the current level before moving that same element up a level.",
          "**Class Champion**: 3 qualifying \"B\" section legs per element (12 total) after the Nosework title.",
          "**Class Grand Champion**: 5 more \"B\" legs per element (20 total).",
          "**Nosework Champion/Grand Champion**: all 5 Class Champion/Grand Champion titles.",
          "**Handler Discrimination**: 3 qualifying passes per level at 3 different trials; Excellent/Master \"Supreme\" needs 10 more \"B\" passes.",
        ],
      },
      {
        heading: "Common Faults",
        bullets: [
          "Max 1 fault allowed per run to still qualify.",
          "**Faults**: pulling dog off odor, blocking odor, calling alert on an already-found hide, aggressive response (scratching/pawing/digging/biting), contaminating the area, unsafe handling.",
          "**Automatic NQ**: false/wrong-location alert call, dog exposes the hide before you call it, elimination in/near the area, non-indication at Master/Elite, timing out, more than 1 fault, kicking a container out of line.",
          "Novice gives one \"free\" incorrect alert call before NQ — that leniency disappears at higher levels.",
          "**Excused**: e.g. dog eliminates — still eligible for other classes that day. **Absent**: team not present for their run slot.",
        ],
      },
    ],
  },

  "USCSS/Other": {
    sections: [
      {
        heading: "Classes & Path",
        bullets: [
          "**Novice** (A = never titled Novice anywhere; B = have) **→ Intermediate → Advanced → Senior → Master**.",
          "**Element Classes**: Container, Exterior, Interior, Vehicle.",
          "**Games Classes** (capped at Advanced difficulty): Copy Cat, Double Dog Dare, Go the Distance, Heap O'Hides, LudicrouSpeed, Pairs Challenge, Scenting Sweepstakes, Team Spirit.",
          "**Detection Dog Extreme**: optional, needs 2+ Senior/Master element titles to enter.",
          "Trial types: **Classic** (all 4 elements same level/day — only way to earn a Classic title), **Variable** (any mix), **Select** (max 2 classes).",
        ],
      },
      {
        heading: "Games Basics",
        bullets: [
          "Games aren't leveled — same rules for everyone, all capped at Advanced-level difficulty. Each has its own hide count and scoring bar (see below); 3 qualifying runs (Qs) in that SAME game earns its title, just like an Element title.",
          "**Copy Cat** (DDCC): 1 known hide. Handler can't enter the search area, and once the dog is released, can't move or talk — the judge calls \"alert\" when the dog clearly indicates. 0 false alerts, 95 pts min.",
          "**Double Dog Dare** (DDFO): 1–2 known hides. Handler draws an action/word from a hat and must do it the whole search (redrawing costs 5 pts); up to 2 false alerts, 90 pts min.",
          "**Go the Distance** (DDDI): 1 hide, 6–10 ft outside a marked boundary. Handler must stay outside the boundary and can't cross to reward until after calling \"Alert\" and getting the judge's OK. 0 false alerts, 95 pts min.",
          "**Heap O'Hides** (DDEN): endurance search, 1–10 unknown hides — find as many as you can before time or faults run out. Up to 2 false alerts, 50 pts min, scored as a % of hides found.",
          "**LudicrouSpeed** (DDLS): 5–10 unknown hides against a ticking \"hide timer\" (45 sec for the first, 30 sec each after) that resets on every find. Up to 2 false alerts, 50 pts min.",
          "**Pairs Challenge** (DDPC): 2-dog teams, 5–10 unknown hides, on-leash, only one teammate searching at a time — each dog must find at least 2 hides or it's a DQ. Up to 2 false alerts, 75 pts min.",
          "**Scenting Sweepstakes** (DDSW): 1–5 unknown hides; top 4 placements split a pot from that game's entry fees. 0 false alerts allowed, 75 pts min.",
          "**Team Spirit** (DDTW): 4-dog teams, 4 hides total in a set running order — one hide per teammate, and every teammate must find theirs for the team to Q. Up to 2 false alerts, 90 pts min.",
        ],
      },
      {
        heading: "What to Expect",
        bullets: [
          "**Novice**: Birch only, 1 hide, 85 pts to Q, 2 ft max, 8–14 accessible containers.",
          "**Intermediate**: +Anise, 2 hides, 85 pts, 2 ft max, \"Finish\" call required.",
          "**Advanced**: +Clove, 3 hides, 90 pts, 3 ft max, hides may be inaccessible.",
          "**Senior**: 1–3 unknown hides, 100 pts, 4 ft max, 0–2 distractors.",
          "**Master**: 0–4 unknown hides, 100 pts, 5 ft max, 0–3 distractors — the ONLY level where failing to call \"Finish\" is a fault.",
          "**Extreme**: 1,500–3,500 sqft, up to 3 elements combined, 7–10 unknown hides, 10-min limit, 1 false alert allowed, 75 pts min.",
          "No fixed time limit is written into the rulebook for standard element searches — the host/judge sets it per search.",
        ],
      },
      {
        heading: "Moving Up",
        bullets: [
          "**Element title**: 3 Qs in one element at one level (e.g. Interior+Novice = \"IN\"); 3 more Qs = the repeat \"X2\" title.",
          "**Full level title** (Variable): 3 Qs in each of the 4 elements at that level.",
          "**Classic title**: Qs in all 4 elements in the SAME Classic trial.",
          "You don't have to finish every Novice title before starting Intermediate — earning any level's title unlocks the next level.",
          "Each individual **game title** needs 3 Qs in that same game (e.g. 3 qualifying Copy Cat runs = DDCC) — same pattern as an Element title, just not leveled.",
          "**Gamer titles**: DDGA (titles in 5 different games) → Bronze/Silver/Gold (title in a 6th/7th/8th different game — Gold = every game). Then **DDGP** (Gamer Pro) once you've got 10 total Game Titles — repeats of the same game count — with **DDGPX** repeating every 5 more Game Titles after that.",
          "**Championship (DDCH)**: a Master title (Classic or Variable) + a DDGA (Gamer) title.",
        ],
      },
      {
        heading: "Common Faults",
        bullets: [
          "Every fault = **–5 points**, and they stack.",
          "**5-pt faults**: false alert (in games only — always NQ in element classes), missing the start line, not rewarding after a correct alert, toy/food faults, damaging the search area, unsafe leash handling, missed \"Finish\" call (Master level & Extreme only).",
          "**Instant DQ** (0 pts, run ends): elimination anywhere/anytime during the search, destroying the search area, dog aggression, harsh reprimands, unsportsmanlike conduct, double-handling, missing 2 hides in Pairs Challenge.",
          "You can voluntarily excuse your dog (stress/illness) for 0 points and still run your other entered classes.",
          "Judge's decision is final — no video challenges.",
        ],
      },
      {
        heading: "Recent Changes (v3.1)",
        bullets: [
          "30-sec warning now standard almost everywhere except Copy Cat.",
          "Flexi leashes now OK while actively searching.",
          "Food can never be delivered from the ground, in or out of the search area.",
          "New game added: Pairs Challenge.",
          "Extreme now allows 1 false alert and needs only 75 pts (was 85).",
        ],
      },
    ],
  },
};
