// ── AKC "Event Search" CSV importer ──────────────────────────────
// AKC's public Event Search tool (https://webapps.akc.org/event-search/) lets
// you export search results as a CSV. This file turns that export into trial
// records matching this app's Firestore "trials" schema, so Tina doesn't have
// to hand-type every new Scent Work trial into the admin panel.
//
// Columns are matched by HEADER NAME (normalized — lowercased, punctuation
// and spaces stripped), not by position. That means:
//   - You can delete any columns you don't want before uploading (Eligible
//     Breeds, Event Chair info, Time Zone, etc.) — only the ones this file
//     actually uses need to stay.
//   - Columns can be in any order.
//   - Header spacing/typo differences in AKC's own export ("Opening Day/
//     Time" vs "Closing Date/Time", "Time Zome") don't matter, since they all
//     normalize the same way.
// The only hard requirement is that a "Name" column and a "Start Date" column
// exist somewhere in the file with a header row above the data.
//
// What's NOT in this export (AKC's public search doesn't include it): entry
// link, premium/flyer link, and the specific class/level being offered. Those
// still need to be added by hand — imported trials are flagged needsInfo:true
// so they show up under the existing "⚠️ Needs Info" filter in the admin
// panel as a to-do list.

// Canonical field -> normalized header name it should match.
// normalize() strips everything but letters/digits and lowercases, so
// "Opening Day/ Time", "Opening Day Time", and "OpeningDay/Time" all become
// the same key here — no alias list needed for spacing/punctuation variants.
const FIELD_HEADERS = {
  name: "name",
  eventNumber: "eventnumber",
  eventType: "eventtype",
  location: "location",
  address: "address",
  city: "city",
  state: "state",
  startDate: "startdate",
  openingDateTime: "openingdaytime",
  closingDateTime: "closingdatetime",
  secName: "superintendentsecretaryname",
  secPhone: "superintendentsecretaryphone",
  secEmail: "superintendentsecretaryemail",
  entryFee: "entryfee",
};

const MONTHS = { Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12" };

function normalize(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

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

// Scans the file for a row that contains both a "Name" and a "Start Date"
// header (in any position, among any other columns) — that's the real header
// row. AKC's export has a few metadata lines above it ("Club: All clubs" etc)
// that this skips automatically.
function findHeaderRow(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i] || !lines[i].includes(",")) continue;
    const cells = parseCsvLine(lines[i]);
    const normCells = cells.map(normalize);
    if (normCells.includes(FIELD_HEADERS.name) && normCells.includes(FIELD_HEADERS.startDate)) {
      return { idx: i, cells };
    }
  }
  return null;
}

// Returns { error: string|null, rows: [...] }. `rows` are ready to hand to
// Firestore as-is (each has a stable `id` so re-importing the same export is
// safe — it'll just overwrite with the same data, not duplicate).
export function parseAKCEventCsv(text) {
  const lines = (text || "").split(/\r?\n/);
  const header = findHeaderRow(lines);
  if (!header) {
    return { error: "Couldn't find a header row with \"Name\" and \"Start Date\" columns. Make sure those two columns are still in the file.", rows: [] };
  }
  const normHeaders = header.cells.map(normalize);
  const colIndex = {};
  Object.entries(FIELD_HEADERS).forEach(([field, wanted]) => {
    const idx = normHeaders.indexOf(wanted);
    if (idx !== -1) colIndex[field] = idx;
  });
  const get = (cells, field) => (colIndex[field] != null ? (cells[colIndex[field]] || "").trim() : "");

  const rows = [];
  const skipped = [];
  for (let i = header.idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const c = parseCsvLine(line);
    if (c.every(cell => !cell)) continue; // blank row

    // Only filter by Event Type if that column is actually present — if it
    // was trimmed out of the file, trust that the whole export is Scent Work.
    const eventType = get(c, "eventType");
    if (colIndex.eventType != null && eventType && eventType !== "SCWK") {
      skipped.push({ line: i + 1, reason: `Event Type "${eventType}", not Scent Work` });
      continue;
    }

    const name = get(c, "name");
    const date = parseAkcDate(get(c, "startDate"));
    if (!name || !date) { skipped.push({ line: i + 1, reason: "Missing club name or start date" }); continue; }

    const eventNumber = get(c, "eventNumber");
    const city = get(c, "city");
    const state = get(c, "state");
    const address = get(c, "address");
    const locationNote = get(c, "location");
    const venueNote = locationNote ? ` (${locationNote})` : "";
    const secName = get(c, "secName");
    const secPhone = get(c, "secPhone");
    const secEmail = get(c, "secEmail");
    const entryFee = get(c, "entryFee");
    const secLine = [secName, secPhone, secEmail].filter(Boolean).join(" ");

    rows.push({
      id: eventNumber ? `AKC-${eventNumber}` : `AKC-${date}-${i}`,
      org: "AKC",
      name: `${name}${city || state ? ` – ${[city, state].filter(Boolean).join(", ")}` : ""}`,
      date,
      location: [address, city, state].filter(Boolean).join(", ") + venueNote,
      level: [],
      entryOpens: parseAkcDate(get(c, "openingDateTime")),
      entryDeadline: parseAkcDate(get(c, "closingDateTime")),
      entryLink: "",
      premiumLink: "",
      notes: "",
      adminNotes: [
        "Imported from AKC CSV",
        eventNumber ? `(Event #${eventNumber})` : "",
        secLine ? `Secretary: ${secLine}.` : "",
        entryFee ? `Entry fee: ${entryFee}` : "",
      ].filter(Boolean).join(" ").trim(),
      needsInfo: true,
      _eventNumber: eventNumber,
    });
  }

  return { error: null, rows, skipped };
}
