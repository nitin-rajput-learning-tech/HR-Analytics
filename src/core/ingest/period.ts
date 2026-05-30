export interface ParsedPeriod {
  asOf: string | null;
  periodLabel: string | null;
  confidence: number;
  note: string;
}

const ISO_DATE = /(20\d{2})[-_/.](\d{1,2})[-_/.](\d{1,2})/;
const ISO_MONTH = /(20\d{2})[-_/.](\d{1,2})(?![-_/.]\d)/;
const CYCLE = /(FY\s?\d{2,4}\s?[-_]?\s?(?:H[12]|Q[1-4]|FULL|ANNUAL))/i;

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
  return { asOf: null, periodLabel: null, confidence: 0, note: "Could not parse a period from filename." };
}
