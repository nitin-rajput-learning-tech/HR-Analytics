export interface ParsedPeriod {
  asOf: string | null;
  periodLabel: string | null;
  confidence: number;
  note: string;
  // Set when the filename yields a day + month but NO year (e.g. "as on 5th May").
  // The caller resolves the year from "today" via resolveMonthDayYear (keeps this
  // module pure — no Date.now here).
  monthDay?: { month: number; day: number };
}

const ISO_DATE = /(20\d{2})[-_/.](\d{1,2})[-_/.](\d{1,2})/;
const ISO_MONTH = /(20\d{2})[-_/.](\d{1,2})(?![-_/.]\d)/;
const CYCLE = /(FY\s?\d{2,4}\s?[-_]?\s?(?:H[12]|Q[1-4]|FULL|ANNUAL))/i;

const pad2 = (n: number) => String(n).padStart(2, "0");
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MON = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
// "5th May 2026" / "5 May" / "05-May-2026"  and  "May 5, 2026" / "May 5". The
// (?!\d) guards stop the day group from swallowing a 4-digit year ("May 2026").
const DAY_MON = new RegExp(`\\b(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?[\\s.\\-]+(${MON})[a-z]*\\.?(?:[\\s,.\\-]+(\\d{4}))?`, "i");
const MON_DAY = new RegExp(`\\b(${MON})[a-z]*\\.?[\\s.\\-]+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:[\\s,.\\-]+(\\d{4}))?`, "i");

function parseNaturalDate(s: string): { y?: number; m: number; d: number } | null {
  let m = s.match(DAY_MON);
  if (m) return { d: +m[1], m: MONTHS[m[2].slice(0, 3).toLowerCase()], y: m[3] ? +m[3] : undefined };
  m = s.match(MON_DAY);
  if (m) return { m: MONTHS[m[1].slice(0, 3).toLowerCase()], d: +m[2], y: m[3] ? +m[3] : undefined };
  return null;
}

// Resolve a year-less month/day to the most recent occurrence on or before today.
// Pure: the caller passes today's ISO date (the UI layer, which may use Date.now);
// an unparseable todayISO yields null rather than guessing.
export function resolveMonthDayYear(month: number, day: number, todayISO: string): string | null {
  const t = new Date(`${todayISO}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;
  let y = t.getUTCFullYear();
  if (Date.UTC(y, month - 1, day) > t.getTime()) y -= 1;
  return `${y}-${pad2(month)}-${pad2(day)}`;
}

function lastDay(y: number, m: number): string {
  const d = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of month m
  return `${y}-${String(m).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function cycleToDate(label: string): string | null {
  const m = label.match(/FY\s?(\d{2,4})\s?[-_]?\s?(H[12]|Q[1-4]|FULL|ANNUAL)/i);
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  const fyEnd = yy < 100 ? 2000 + yy : yy; // FY26 -> ends Mar 2026
  const part = m[2].toUpperCase();
  const map: Record<string, string> = {
    H1: `${fyEnd - 1}-09-30`,
    H2: `${fyEnd}-03-31`,
    Q1: `${fyEnd - 1}-06-30`,
    Q2: `${fyEnd - 1}-09-30`,
    Q3: `${fyEnd - 1}-12-31`,
    Q4: `${fyEnd}-03-31`,
    FULL: `${fyEnd}-03-31`,
    ANNUAL: `${fyEnd}-03-31`,
  };
  return map[part] ?? null;
}

export function parsePeriod(fileName: string, periodKind: "month" | "cycle" | "as_of"): ParsedPeriod {
  const iso = fileName.match(ISO_DATE);
  if (iso) {
    const v = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    return { asOf: v, periodLabel: v, confidence: 1, note: "ISO date in filename." };
  }
  // Natural-language date with a year, e.g. "as on 5th May 2026".
  const nat = parseNaturalDate(fileName);
  if (nat?.y) {
    const v = `${nat.y}-${pad2(nat.m)}-${pad2(nat.d)}`;
    return { asOf: v, periodLabel: v, confidence: 0.9, note: "Date in filename." };
  }
  if (periodKind === "cycle") {
    const c = fileName.match(CYCLE);
    if (c) {
      const label = c[1].replace(/\s+/g, "").toUpperCase();
      const d = cycleToDate(label);
      return { asOf: d, periodLabel: label, confidence: d ? 1 : 0.6, note: "Review cycle from filename." };
    }
  }
  const mon = fileName.match(ISO_MONTH);
  if (mon) {
    const y = +mon[1];
    const mo = +mon[2];
    if (mo >= 1 && mo <= 12) {
      return {
        asOf: lastDay(y, mo),
        periodLabel: `${mon[1]}-${mon[2].padStart(2, "0")}`,
        confidence: 1,
        note: "Month from filename.",
      };
    }
  }
  // Day + month but no year (e.g. "as on 5th May") — hand the month/day up so the
  // caller can resolve the year from today's date.
  if (nat) {
    return { asOf: null, periodLabel: null, confidence: 0, note: "Found a day/month in the filename but no year — set or confirm the as-of date.", monthDay: { month: nat.m, day: nat.d } };
  }
  return { asOf: null, periodLabel: null, confidence: 0, note: "Could not parse a period from filename." };
}
