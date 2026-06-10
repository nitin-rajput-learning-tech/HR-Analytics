// Deterministic synthetic "Acme" organisation generator.
//
// Models the SHAPE of a real Indian fintech / payments employer — its legal-entity
// mix, department structure, field-sales-heavy workforce, deep reporting hierarchy,
// gender skew, tenure curve and attrition concentration — WITHOUT using any real
// data. Every identity (name, email, employee number, phone) is drawn from generic
// public name pools, so the output is PII-safe by construction: no value is derived
// from any real person's record.
//
// Used at BUILD time only (not shipped in the app bundle) to seed:
//   • the demo showroom workspace            (scripts/build-sample-workspace.mjs)
//   • the sample intake-pack .xlsx workbooks (scripts/gen-intake-pack.mjs)
//
// Output rows use the employee_master canonical (snake_case) field names from
// src/core/datasets.ts, so generateFunctionalDemo() and the importer both accept them.

// ---- seeded RNG (same LCG as src/core/intake/demoData.ts, so runs are reproducible)
export function makeRng(seedValue = 7) {
  let seed = seedValue >>> 0 || 1;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const chance = (p) => rnd() < p;
  // weighted pick: items = [{v, w}, …]
  const weighted = (items) => {
    const total = items.reduce((s, it) => s + it.w, 0);
    let r = rnd() * total;
    for (const it of items) { r -= it.w; if (r <= 0) return it.v; }
    return items[items.length - 1].v;
  };
  return { rnd, int, pick, chance, weighted };
}

// ---- generic name pools (common Indian given names + surnames; public, not real records)
const FIRST_M = [
  "Aarav", "Aditya", "Akash", "Amit", "Aniket", "Anuj", "Arjun", "Ashok", "Deepak", "Gaurav",
  "Harsh", "Imran", "Jatin", "Karan", "Kunal", "Manish", "Mohit", "Naveen", "Nikhil", "Pankaj",
  "Pranav", "Rahul", "Rajesh", "Rakesh", "Rohan", "Rohit", "Sachin", "Sandeep", "Saurabh", "Siddharth",
  "Sumit", "Suresh", "Tarun", "Varun", "Vijay", "Vikas", "Vinay", "Vishal", "Yash", "Abhishek",
];
const FIRST_F = [
  "Aarti", "Ananya", "Anjali", "Bhavna", "Deepa", "Divya", "Gauri", "Isha", "Jyoti", "Kavya",
  "Kiran", "Komal", "Manisha", "Megha", "Neha", "Nisha", "Pooja", "Prachi", "Priya", "Priyanka",
  "Radhika", "Rashmi", "Riya", "Sakshi", "Sapna", "Shreya", "Shruti", "Sneha", "Swati", "Tanvi",
];
const SURNAMES = [
  "Agarwal", "Bansal", "Bhat", "Chauhan", "Desai", "Deshpande", "Gupta", "Iyer", "Jain", "Joshi",
  "Kapoor", "Khanna", "Kulkarni", "Kumar", "Malhotra", "Mehta", "Menon", "Mishra", "Nair", "Pandey",
  "Patel", "Pillai", "Rao", "Reddy", "Sharma", "Shetty", "Singh", "Sinha", "Verma", "Yadav",
  "Bose", "Chopra", "Das", "Ghosh", "Naik", "Pawar", "Saxena", "Thakur", "Trivedi", "Walia",
];
const CITIES = [
  "Mumbai", "Thane", "Navi Mumbai", "Pune", "Bengaluru", "Hyderabad", "Chennai", "Delhi", "Gurugram",
  "Noida", "Kolkata", "Ahmedabad", "Kochi", "Indore", "Jaipur", "Mohali", "Lucknow", "Coimbatore",
];

// ---- legal entities (Acme group; relative sizes echo the modelled org: one dominant, a long tail)
const ENTITIES = [
  { v: "Acme Payments Pvt Ltd", w: 50 },
  { v: "Acme Technologies Pvt Ltd", w: 23 },
  { v: "Acme Financial Services Pvt Ltd", w: 13 },
  { v: "Acme Distribution Pvt Ltd", w: 8 },
  { v: "Acme Academy Pvt Ltd", w: 3 },
  { v: "Acme Lending Pvt Ltd", w: 2 },
  { v: "Acme Global Pvt Ltd", w: 1 },
];

// ---- departments: share of ACTIVE headcount, relative churn weight (drives where the
// leaver tail concentrates), a seniority-weighted title ladder, and sub-departments.
// "Field Sales" is the large, high-churn frontline; Tech/Product/Compliance are stickier.
const DEPARTMENTS = [
  { name: "Field Sales", share: 34, churn: 30, subs: ["West Zone", "North Zone", "South Zone", "East Zone"],
    ladder: [{ v: "Sales Officer", w: 55 }, { v: "Area Sales Manager", w: 28 }, { v: "Senior Area Sales Manager", w: 9 }, { v: "Cluster Head", w: 6 }, { v: "Regional Sales Manager", w: 2 }] },
  { name: "Technology", share: 18, churn: 2, subs: ["Backend Engineering", "Frontend Engineering", "Platform & SRE", "QA & Automation", "Data Engineering"],
    ladder: [{ v: "Software Engineer - I", w: 30 }, { v: "Software Engineer - II", w: 25 }, { v: "Senior Software Engineer - I", w: 20 }, { v: "Senior Software Engineer - II", w: 12 }, { v: "Team Lead - I", w: 8 }, { v: "Engineering Manager", w: 5 }] },
  { name: "Operations", share: 13, churn: 6, subs: ["Merchant Onboarding", "Settlements", "Reconciliation", "Customer Support", "Risk Ops"],
    ladder: [{ v: "Executive", w: 38 }, { v: "Senior Executive", w: 28 }, { v: "Assistant Manager", w: 18 }, { v: "Manager", w: 11 }, { v: "Senior Manager", w: 5 }] },
  { name: "Acquiring Sales", share: 8, churn: 12, subs: ["Enterprise", "SME", "Channel Partners"],
    ladder: [{ v: "Sales Officer", w: 40 }, { v: "Area Sales Manager", w: 30 }, { v: "Senior Manager", w: 20 }, { v: "Regional Sales Manager", w: 10 }] },
  { name: "Product", share: 5, churn: 1, subs: ["Core Payments", "Lending Product", "Growth"],
    ladder: [{ v: "Associate Product Manager", w: 35 }, { v: "Product Manager", w: 40 }, { v: "Senior Product Manager", w: 20 }, { v: "Director of Product", w: 5 }] },
  { name: "Human Resources", share: 5, churn: 2, subs: ["HRBP", "Talent Acquisition", "HR Operations & Payroll", "Learning & Development"],
    ladder: [{ v: "HR Executive", w: 35 }, { v: "HRBP", w: 28 }, { v: "Manager", w: 22 }, { v: "Senior Manager", w: 12 }, { v: "Assistant Vice President", w: 3 }] },
  { name: "Finance", share: 4, churn: 2, subs: ["Accounts", "FP&A", "Treasury", "Audit"],
    ladder: [{ v: "Executive", w: 34 }, { v: "Senior Executive", w: 28 }, { v: "Assistant Manager", w: 20 }, { v: "Manager", w: 13 }, { v: "Senior Manager", w: 5 }] },
  { name: "Marketing", share: 4, churn: 4, subs: ["Brand", "Performance Marketing", "Content"],
    ladder: [{ v: "Executive", w: 40 }, { v: "Senior Executive", w: 25 }, { v: "Manager", w: 23 }, { v: "Senior Manager", w: 12 }] },
  { name: "Distribution", share: 3, churn: 5, subs: ["Channel", "Field Operations"],
    ladder: [{ v: "Executive", w: 45 }, { v: "Area Manager", w: 35 }, { v: "Manager", w: 20 }] },
  { name: "Compliance", share: 3, churn: 1, subs: ["Regulatory", "Risk & Security"],
    ladder: [{ v: "Executive", w: 35 }, { v: "Manager", w: 35 }, { v: "Senior Manager", w: 22 }, { v: "Assistant Vice President", w: 8 }] },
  { name: "Lending", share: 3, churn: 3, subs: ["Credit", "Collections"],
    ladder: [{ v: "Credit Analyst", w: 45 }, { v: "Manager", w: 32 }, { v: "Senior Manager", w: 18 }, { v: "Assistant Vice President", w: 5 }] },
];

// Titles that count as "leadership" for the gender-skew model.
const LEADERSHIP = /manager|head|lead|director|vice president|general manager|chief/i;

const pad = (n, w = 2) => String(n).padStart(w, "0");
const iso = (d) => d.toISOString().slice(0, 10);

// Pick a joining date from a realistic tenure curve (heavier in recent years).
function joinDate(rng, { recentBias = 0 } = {}) {
  const year = rng.weighted([
    { v: 2016, w: 1 }, { v: 2017, w: 1 }, { v: 2018, w: 2 }, { v: 2019, w: 3 }, { v: 2020, w: 5 },
    { v: 2021, w: 8 }, { v: 2022, w: 12 }, { v: 2023, w: 20 + recentBias }, { v: 2024, w: 26 + recentBias },
    { v: 2025, w: 24 + recentBias }, { v: 2026, w: 10 },
  ]);
  const month = year === 2026 ? rng.int(1, 5) : rng.int(1, 12);
  const day = rng.int(1, 28);
  return new Date(Date.UTC(year, month - 1, day));
}

// Build one employee_master row. `managers` are filled later by the build pipeline.
function makeRow(rng, n, dept, opts) {
  const isLeader = LEADERSHIP.test(opts.title);
  // Overall ~80/18/2 M/F/Other; leadership skews more male; recent frontline hires skew a touch more female.
  const fProb = isLeader ? 0.12 : opts.recent ? 0.3 : 0.2;
  const roll = rng.rnd();
  const gender = roll < fProb ? "Female" : roll < fProb + 0.02 ? "Other" : "Male";
  const first = gender === "Female" ? rng.pick(FIRST_F) : rng.pick(FIRST_M);
  const last = rng.pick(SURNAMES);
  const empNo = "AC" + pad(n, 5);
  return {
    employee_number: empNo,
    full_name: `${first} ${last}`,
    legal_entity: rng.weighted(ENTITIES),
    last_working_day: "",
    current_city: rng.pick(CITIES),
    work_phone: String(rng.pick([9, 8, 7])) + pad(rng.int(0, 999999999), 9),
    work_email: "", // filled after de-dup below
    exit_requested_on: "",
    sub_department: rng.pick(dept.subs),
    gender,
    date_joined: iso(opts.joined),
    employment_status: "Working",
    job_title: opts.title,
    l2_manager: "",
    reporting_manager: "",
    department: dept.name,
    __first: first, __last: last, // scratch for email de-dup; stripped before return
  };
}

/**
 * Generate a synthetic Acme employee_master roster for the latest month.
 * @returns {Array<Object>} rows in employee_master canonical fields (active + relieved tail).
 */
export function generateAcmeRoster({ activeTarget = 350, leaverCount = 120, asOf = "2026-05-05", seed = 7 } = {}) {
  const rng = makeRng(seed);
  const asOfDate = new Date(asOf + "T00:00:00Z");
  const rows = [];
  let n = 1;

  // --- active headcount, allocated across departments by share
  const shareTotal = DEPARTMENTS.reduce((s, d) => s + d.share, 0);
  for (const dept of DEPARTMENTS) {
    const count = Math.max(1, Math.round((dept.share / shareTotal) * activeTarget));
    for (let i = 0; i < count; i++) {
      const title = rng.weighted(dept.ladder);
      const joined = joinDate(rng, {});
      const recent = joined.getUTCFullYear() >= 2025;
      rows.push(makeRow(rng, n++, dept, { title, joined, recent }));
    }
  }

  // --- leaver tail: concentrated where churn is high (field/acquiring sales), spread
  // across the last ~18 months. Tenure skews short (frontline churn) with a few
  // long-tenured exits so regrettable-attrition analytics have something to find.
  const churnPool = DEPARTMENTS.flatMap((d) => Array(d.churn).fill(d));
  for (let i = 0; i < leaverCount; i++) {
    const dept = rng.pick(churnPool);
    const title = rng.weighted(dept.ladder);
    const lwdMonthsAgo = rng.int(0, 17);
    const lwd = new Date(asOfDate); lwd.setUTCMonth(lwd.getUTCMonth() - lwdMonthsAgo); lwd.setUTCDate(rng.int(1, 28));
    // Tenure at exit: mostly short, occasionally long.
    const tenureDays = rng.chance(0.8) ? rng.int(30, 540) : rng.int(700, 2600);
    const joined = new Date(lwd.getTime() - tenureDays * 86400000);
    const row = makeRow(rng, n++, dept, { title, joined, recent: false });
    row.employment_status = "Relieved";
    row.last_working_day = iso(lwd);
    const exitReq = new Date(lwd.getTime() - rng.int(30, 75) * 86400000);
    row.exit_requested_on = iso(exitReq);
    rows.push(row);
  }

  // --- e-mail addresses, de-duplicated (first.last, then first.last2, …) @acme.test
  const seen = new Map();
  for (const r of rows) {
    const base = `${r.__first}.${r.__last}`.toLowerCase().replace(/[^a-z.]/g, "");
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    r.work_email = (k === 1 ? base : base + k) + "@acme.test";
    delete r.__first; delete r.__last;
  }
  return rows;
}

// Convenience for the intake-pack generator / standalone inspection.
export const SYNTHETIC_ENTITIES = ENTITIES.map((e) => e.v);
export const SYNTHETIC_DEPARTMENTS = DEPARTMENTS.map((d) => d.name);
