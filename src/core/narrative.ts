// Deterministic, rule-based narrative engine — turns numbers into prose.
// No LLM, no randomness; every output is a pure function of its inputs.
// Ported 1:1 from the Python narrative.py.

export interface Flag {
  level: "good" | "watch" | "alert" | "neutral";
  phrase: string;
}

// --------------------------------------------------------------- numbers

export function humanizeInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  return Math.round(value).toLocaleString("en-US");
}

export function humanizeMoneyInr(value: number | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);
  if (amount >= 1_00_00_000) return `${sign}₹${(amount / 1_00_00_000).toFixed(2)} Cr`;
  if (amount >= 1_00_000) return `${sign}₹${(amount / 1_00_000).toFixed(2)} L`;
  if (amount >= 1_000) return `${sign}₹${(amount / 1_000).toFixed(1)}K`;
  return `${sign}₹${amount.toFixed(0)}`;
}

export function pct(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  digits = 1,
): number | null {
  if (!denominator) return null;
  if (numerator === null || numerator === undefined) return null;
  const factor = 10 ** digits;
  return Math.round((numerator / denominator) * 100 * factor) / factor;
}

export function formatPct(value: number | null, digits = 1): string {
  return value === null ? "n/a" : `${value.toFixed(digits)}%`;
}

// --------------------------------------------------------------- deltas & trends

export function formatDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  opts: { asMoney?: boolean; showPct?: boolean; unit?: string } = {},
): string | null {
  const { asMoney = false, showPct = true, unit = "" } = opts;
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  const diff = current - previous;
  if (diff === 0) return "no change vs prior";
  const arrow = diff > 0 ? "▲" : "▼";
  const sign = diff > 0 ? "+" : "−";
  const magnitude = asMoney ? humanizeMoneyInr(Math.abs(diff)) : `${Math.abs(diff).toLocaleString("en-US")}${unit}`;
  let text = `${arrow} ${sign}${magnitude}`;
  if (showPct && previous) {
    const changePct = (diff / Math.abs(previous)) * 100;
    text += ` (${sign}${Math.abs(changePct).toFixed(1)}%)`;
  }
  return `${text} vs prior`;
}

export function trendPhrase(values: number[] | null | undefined): string {
  if (!values || values.length < 2) return "insufficient history to establish a trend";
  const recent = values[values.length - 1];
  const prior = values[values.length - 2];
  let run = 1;
  for (let i = values.length - 1; i > 0; i--) {
    if (values[i] - values[i - 1] > 0 && recent >= prior) run++;
    else if (values[i] - values[i - 1] < 0 && recent <= prior) run++;
    else break;
  }
  const direction = recent > prior ? "rising" : recent < prior ? "easing" : "flat";
  if (direction === "flat") return "broadly flat over recent periods";
  if (run >= 3) return `${direction} for ${run} consecutive periods`;
  return `${direction} versus the prior period`;
}

export function thresholdFlag(
  value: number | null,
  opts: {
    watch: number;
    alert: number;
    higherIsWorse?: boolean;
    goodPhrase?: string;
    watchPhrase?: string;
    alertPhrase?: string;
  },
): Flag {
  const {
    watch, alert, higherIsWorse = true,
    goodPhrase = "within healthy range", watchPhrase = "worth watching", alertPhrase = "needs attention",
  } = opts;
  if (value === null) return { level: "neutral", phrase: "no data" };
  if (higherIsWorse) {
    if (value >= alert) return { level: "alert", phrase: alertPhrase };
    if (value >= watch) return { level: "watch", phrase: watchPhrase };
    return { level: "good", phrase: goodPhrase };
  }
  if (value <= alert) return { level: "alert", phrase: alertPhrase };
  if (value <= watch) return { level: "watch", phrase: watchPhrase };
  return { level: "good", phrase: goodPhrase };
}

// --------------------------------------------------------------- sentences

export function sentenceForKpi(
  label: string,
  current: number | null | undefined,
  previous: number | null | undefined = null,
  opts: { asMoney?: boolean; suffix?: string } = {},
): string {
  const { asMoney = false, suffix = "" } = opts;
  const valueText = asMoney ? humanizeMoneyInr(current) : humanizeInt(current);
  let sentence = `${label} stands at ${valueText}${suffix}`;
  const delta = formatDelta(current, previous, { asMoney });
  if (delta && delta !== "no change vs prior") {
    const clean = delta.replace("▲ ", "").replace("▼ ", "");
    const direction = clean.split(" ")[0].includes("+") ? "up" : "down";
    const magnitude = clean.split(" vs ")[0].replace(/^[+−]/, "");
    sentence += `, ${direction} ${magnitude}`;
  } else if (delta === "no change vs prior") {
    sentence += ", unchanged since the prior period";
  }
  return sentence + ".";
}

export function joinClauses(clauses: string[]): string {
  const items = clauses.filter((c) => c && c.trim()).map((c) => c.trim());
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return items.slice(0, -1).join(", ") + `, and ${items[items.length - 1]}`;
}
