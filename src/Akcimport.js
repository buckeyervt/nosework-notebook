// ── AKC "Event Search" CSV importer ──────────────────────────────
// AKC's public Event Search tool (https://webapps.akc.org/event-search/) lets
// you export search results as a CSV. This file turns that export into trial
// records matching this app's Firestore "trials" schema, so Tina doesn't have
// to hand-type every new Scent Work trial into the admin panel.
//
// Why column POSITION instead of header name: AKC's own header row has
// inconsistent spacing/typos ("Opening Day/ Time" vs "Closing Date/Time",
// "Time Zome", "Superintendent/ Secretary Email" vs "...Secretary Phone" with
// no space) — matching by exact header text would be fragile. Column order is
// far more stable than AKC's header spelling, so we map by index and just
// sanity-check the first couple of headers before trusting the rest.
//
// What's NOT in this export (AKC's public search doesn't include it): entry
// link, premium/flyer link, and the specific class/level being offered. Those
// still need to be added by hand — imported trials are flagged needsInfo:true
// so they show up under the existing "⚠️ Needs Info" filter in the admin
// panel as a to-do list.

const COLS = {
  NAME: 0, EVENT_NUMBER: 1, EVENT_TYPE: 2, LOCATION: 3, ADDRESS: 4, CITY: 5, STATE: 6,
  START_DAY: 7, START_DATE: 8, ENTRY_METHOD: 9, ENTRY_LIMIT: 10,
  OPENING_DAY: 11, OPENING_DATETIME: 12, CLOSING_DAY: 13, CLOSING_DATETIME: 14, TIME_ZONE: 15,
  SEC_NAME: 16, SEC_PHONE: 17, SEC_EMAIL: 18, CHAIR_NAME: 19, CHAIR_PHONE: 20, CHAIR_EMAIL: 21,
  ELIGIBLE_BREEDS: 22, ENTRY_FEE: 23,
};

const MONTHS = { Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12" };

// Handles quoted CSV fields with embedded commas and doubled-quote escaping
// (e.g. "Dog Gone Fun Agility, LLC #2; 26310 Dobbin Huffsmith Rd").
function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { result.push(cur); cur = ""; }
      else cur += c;
    }
  }
  result.push(cur);
  return result.map(s => s.trim());
}

// "07-Aug-2026" or "03-Jun-2026, 9:00:00 AM" -> "2026-08-07" / "2026-06-03"
function parseAkcDate(raw) {
  const datePart = (raw || "").split(",")[0].trim();
  const m = datePart.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return "";
  const [, dd, mon, yyyy] = m;
  const mm = MONTHS[mon];
  if (!mm) return "";
  return `${yyyy}-${mm}-${dd.padStart(2, "0")}`;
}

// Returns { error: string|null, rows: [...] }. `rows` are ready to hand to
// Firestore as-is (each has a stable `id` so re-importing the same export is
// safe — it'll just overwrite with the same data, not duplicate).
export function parseAKCEventCsv(text) {
  const lines = (text || "").split(/\r?\n/);
  const headerIdx = lines.findIndex(l => l.trim().replace(/^"|"$/g, "").trim() === "Name" || l.trim().startsWith('"Name","Event Number"'));
  if (headerIdx === -1) {
    return { error: "Couldn't find the header row (expected a line starting with \"Name\",\"Event Number\"...). Is this an AKC Event Search CSV export?", rows: [] };
  }
  const headerCells = parseCsvLine(lines[headerIdx]);
  if ((headerCells[COLS.NAME] || "").toLowerCase() !== "name" || !(headerCells[COLS.START_DATE] || "").toLowerCase().includes("start date")) {
    return { error: "This doesn't look like a standard AKC Event Search export — the columns are in an unexpected order.", rows: [] };
  }

  const rows = [];
  const skipped = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const c = parseCsvLine(line);
    if (c.length < 9) continue;

    const eventType = c[COLS.EVENT_TYPE] || "";
    if (eventType && eventType !== "SCWK") { skipped.push({ line: i + 1, reason: `Event Type "${eventType}", not Scent Work` }); continue; }

    const name = c[COLS.NAME] || "";
    const date = parseAkcDate(c[COLS.START_DATE]);
    if (!name || !date) { skipped.push({ line: i + 1, reason: "Missing club name or start date" }); continue; }

    const eventNumber = c[COLS.EVENT_NUMBER] || "";
    const city = c[COLS.CITY] || "";
    const state = c[COLS.STATE] || "";
    const address = c[COLS.ADDRESS] || "";
    const venueNote = c[COLS.LOCATION] ? ` (${c[COLS.LOCATION]})` : "";
    const secName = c[COLS.SEC_NAME] || "";
    const secPhone = c[COLS.SEC_PHONE] || "";
    const secEmail = c[COLS.SEC_EMAIL] || "";
    const entryFee = c[COLS.ENTRY_FEE] || "";

    rows.push({
      id: eventNumber ? `AKC-${eventNumber}` : `AKC-${date}-${i}`,
      org: "AKC",
      name: `${name} – ${city}${city && state ? ", " : ""}${state}`,
      date,
      location: [address, city, state].filter(Boolean).join(", ") + venueNote,
      level: "",
      entryOpens: parseAkcDate(c[COLS.OPENING_DATETIME]),
      entryDeadline: parseAkcDate(c[COLS.CLOSING_DATETIME]),
      entryLink: "",
      premiumLink: "",
      notes: "",
      adminNotes: `Imported from AKC CSV (Event #${eventNumber || "?"}). Secretary: ${secName} ${secPhone} ${secEmail}. Entry fee: ${entryFee}`.trim(),
      needsInfo: true,
      _eventNumber: eventNumber,
    });
  }

  return { error: null, rows, skipped };
}
