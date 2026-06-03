// Generate a complete, coherent synthetic dataset across all domains so the
// tool can be exercised end-to-end before real data arrives. One employee
// roster; every other domain (TA, PMS, Payroll, L&D, Admin) is keyed to the
// same employee_numbers/departments so joins + cross-functional risk light up.
//
// 100% synthetic (no real PII). Deterministic via a seeded PRNG. Output: .xlsx
// per domain in ./sample-data, filenames carrying the period for auto-detect.
//
//   node scripts/generate-sample-data.mjs   (or: npm run sample-data)

import * as XLSX from "xlsx";
import * as fs from "node:fs";
import path from "node:path";

XLSX.set_fs(fs);

// ---- seeded PRNG (stable output across runs) ------------------------------
let seed = 987654321;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const isoRand = (y1, y2) => iso(int(y1, y2), int(1, 12), int(1, 28));

const FIRST = ["Aarav","Vivaan","Aditya","Vihaan","Arjun","Sai","Reyansh","Krishna","Ishaan","Rohan","Ananya","Diya","Aadhya","Saanvi","Pari","Anika","Navya","Myra","Sara","Aarohi","Rahul","Priya","Neha","Karan","Sneha","Vikram","Pooja","Amit","Divya","Rohit","Megha","Suresh","Kavya","Manish","Ritu","Deepak","Nisha","Sanjay","Anjali","Farhan","Zoya","Imran","Tara","Kabir","Meera","Dev","Ira","Yash","Riya","Nikhil"];
const LAST = ["Sharma","Verma","Patel","Reddy","Nair","Iyer","Rao","Mehta","Shah","Gupta","Singh","Kumar","Das","Bose","Chopra","Malhotra","Joshi","Pillai","Menon","Desai","Kulkarni","Bhat","Naidu","Khan","Sheikh","Dsouza","Lopes","Fernandes","Banerjee","Mukherjee"];

const ENTITIES = ["Acme Payments Pvt Ltd", "Acme Academy Pvt Ltd"];
const CITIES = ["Mumbai", "Pune", "Bengaluru", "Delhi", "Hyderabad", "Remote"];

const DEPTS = [
  { name: "Technology", count: 34, subs: ["Backend", "Frontend", "DevOps", "QA", "Data"], titles: ["SDE", "SDE II", "Senior SDE", "Tech Lead", "Engineering Manager"] },
  { name: "Sales", count: 30, subs: ["Enterprise", "SMB", "Inside Sales"], titles: ["Sales Executive", "Account Manager", "Regional Manager", "VP Sales"] },
  { name: "Operations", count: 24, subs: ["Merchant Ops", "Settlement", "Risk"], titles: ["Ops Analyst", "Ops Executive", "Ops Manager"] },
  { name: "Customer Support", count: 18, subs: ["L1 Support", "L2 Support"], titles: ["Support Associate", "Support Lead"] },
  { name: "Finance", count: 12, subs: ["Accounts", "FP&A"], titles: ["Accountant", "Finance Analyst", "Finance Manager"] },
  { name: "Human Resources", count: 10, subs: ["HR Operations & Payroll", "Talent Acquisition", "Academy"], titles: ["HR Executive", "HRBP", "Recruiter", "HR Manager"] },
  { name: "Product", count: 12, subs: ["Core Product", "Growth"], titles: ["Associate PM", "Product Manager", "Senior PM"] },
  { name: "Marketing", count: 10, subs: ["Digital", "Brand"], titles: ["Marketing Executive", "Marketing Manager"] },
];
const AVG_GROSS = { Technology: 165000, Sales: 120000, Operations: 85000, "Customer Support": 55000, Finance: 110000, "Human Resources": 95000, Product: 175000, Marketing: 90000 };
// Departments we deliberately stress so cross-functional risk has a hotspot.
const WEAK_REVIEW = new Set(["Sales", "Customer Support"]);
const WEAK_TRAINING = new Set(["Sales", "Operations"]);

const L2_HEAD = "A. Mehta (CHRO)";

// ---- roster ---------------------------------------------------------------
const employees = [];
let n = 0;
for (const dept of DEPTS) {
  const head = `${pick(FIRST)} ${pick(LAST)}`;
  for (let i = 0; i < dept.count; i++) {
    n += 1;
    const first = pick(FIRST);
    const last = pick(LAST);
    const num = "AP" + pad(n).padStart(4, "0");
    const working = chance(0.88);
    const joinY = int(2017, 2024);
    const relievedLwd = working ? "" : iso(2025, int(6, 12), int(1, 28));
    employees.push({
      num,
      fullName: `${first} ${last}`,
      entity: chance(0.85) ? ENTITIES[0] : ENTITIES[1],
      lwd: relievedLwd,
      city: pick(CITIES),
      phone: "90" + String(10000000 + n).slice(-8),
      email: `${first}.${last}${n}@airpay.test`.toLowerCase(),
      exitReq: working ? "" : iso(2025, int(5, 11), int(1, 28)),
      subDept: pick(dept.subs),
      gender: chance(0.6) ? "Male" : chance(0.95) ? "Female" : "Other",
      doj: iso(joinY, int(1, 12), int(1, 28)),
      status: working ? "Working" : "Relieved",
      title: pick(dept.titles),
      l2: L2_HEAD,
      mgr: head,
      dept: dept.name,
    });
  }
}
const active = employees.filter((e) => e.status === "Working");

const outDir = path.resolve("sample-data");
fs.mkdirSync(outDir, { recursive: true });
const written = [];
function write(filename, headers, rows) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, path.join(outDir, filename));
  written.push(`${filename}  (${rows.length} rows)`);
}

// ---- 1. employee master (two months so Movement & Forecast demonstrate) ---
const EMP_HEADERS = ["Employee Number", "Full Name", "Legal Entity", "Last Working Day", "Current City", "Work Phone", "Work Email", "Exit Requested On", "Sub Department", "Gender", "Date Joined", "Employment Status", "Job Title", "L2 Manager", "Reporting Manager", "Department"];
const empRow = (e) => [e.num, e.fullName, e.entity, e.lwd, e.city, e.phone, e.email, e.exitReq, e.subDept, e.gender, e.doj, e.status, e.title, e.l2, e.mgr, e.dept];
// 8 recent active hires count as "joined in May"; 10 of the relieved "left in May".
const joinedMayList = active.slice(0, 8);
for (const e of joinedMayList) e.doj = "2026-05-02";
const joinedMay = new Set(joinedMayList.map((e) => e.num));
const leftMayList = employees.filter((e) => e.status === "Relieved").slice(0, 10);
for (const e of leftMayList) e.lwd = "2026-05-" + pad(int(2, 27));
const leftMay = new Set(leftMayList.map((e) => e.num));
// April snapshot = May minus the May-joiners, with the May-leavers shown still Working.
const april = employees.filter((e) => !joinedMay.has(e.num)).map((e) => (leftMay.has(e.num) ? { ...e, status: "Working", lwd: "" } : e));
write("Employee report as on 2026-04-05.xlsx", EMP_HEADERS, april.map(empRow));
write("Employee report as on 2026-05-05.xlsx", EMP_HEADERS, employees.map(empRow));

// ---- 2. talent acquisition (requisitions) ---------------------------------
const SOURCES = ["Referral", "Agency", "Portal", "Internal", "Direct"];
const taRows = [];
for (let i = 1; i <= 26; i++) {
  const dept = pick(DEPTS);
  const status = pick(["Open", "Open", "On-hold", "Filled", "Filled", "Cancelled"]);
  const apps = int(40, 220);
  const shortlisted = Math.round(apps * (0.15 + rnd() * 0.15));
  const interviewed = Math.round(shortlisted * (0.4 + rnd() * 0.3));
  const offers = Math.max(1, Math.round(interviewed * (0.2 + rnd() * 0.2)));
  const accepted = Math.round(offers * (0.55 + rnd() * 0.35));
  const joined = status === "Filled" ? accepted : Math.max(0, accepted - int(0, 1));
  // a few deliberately aged open reqs
  const openMonth = i <= 4 ? int(8, 11) : int(12, 12);
  const openY = openMonth >= 8 && openMonth <= 11 ? 2025 : 2025;
  taRows.push([
    `REQ-2026-${pad(i)}`, dept.name, pick(dept.subs), pick(dept.titles), `L${int(2, 6)}`, pick(CITIES),
    `${pick(FIRST)} ${pick(LAST)}`, pick(["FT", "FT", "FT", "Contract", "Intern"]), status,
    iso(openY, openMonth, int(1, 28)), iso(2026, int(5, 8), int(1, 28)),
    apps, shortlisted, interviewed, offers, accepted, joined, pick(SOURCES), `${pick(FIRST)} ${pick(LAST)}`, int(20000, 120000),
  ]);
}
write(
  "TA_requisitions_2026-05.xlsx",
  ["Requisition ID","Department","Sub Department","Job Title","Level / Grade","Location","Hiring Manager","Employment Type","Status","Open Date","Target Join Date","Applications","Shortlisted","Interviewed","Offers Made","Offers Accepted","Joined","Primary Source","Recruiter","Cost (INR)"],
  taRows,
);

// ---- 3. performance (PMS), cycle FY26-H1 ----------------------------------
const POT = ["High", "Medium", "Medium", "Low"];
const pmsRows = active.map((e) => {
  const reviewP = WEAK_REVIEW.has(e.dept) ? 0.55 : 0.9;
  const mgrDone = chance(reviewP);
  const rating = pick([2, 3, 3, 3, 4, 4, 4, 5]);
  const onPip = chance(0.05);
  return [
    e.num, "FY26-H1", "Y", iso(2025, 4, int(1, 20)), chance(0.92) ? "Y" : "N", mgrDone ? "Y" : "N",
    mgrDone ? rating : "", "1-5", mgrDone && chance(0.9) ? "Y" : "N", pick(POT),
    rating >= 4 && chance(0.3) ? "Y" : "N", onPip ? "Y" : "N",
    onPip ? iso(2026, int(1, 3), int(1, 28)) : "", onPip ? pick(["Open", "Open", "Successful", "Exited"]) : "",
  ];
});
write(
  "PMS_cycle_FY26-H1.xlsx",
  ["Employee Number","Review Cycle","Goals Set","Goal Set Date","Self Review Done","Manager Review Done","Final Rating","Rating Scale","Calibrated","Potential Rating","Promotion Recommended","On PIP","PIP Start Date","PIP Outcome"],
  pmsRows,
);

// ---- 4. payroll (aggregate + statutory), May 2026 -------------------------
const payAgg = [];
for (const dept of DEPTS) {
  const heads = active.filter((e) => e.dept === dept.name).length;
  const avg = AVG_GROSS[dept.name];
  const gross = heads * avg;
  payAgg.push([
    "2026-05", dept.name, ENTITIES[0], heads, gross, Math.round(gross * 0.1),
    dept.name === "Customer Support" ? Math.round(gross * 0.04) : 0,
    pick([0, 0, 0, 1, 2]), pick([0, 0, 1]),
  ]);
}
write(
  "Payroll_aggregate_2026-05.xlsx",
  ["Pay Month","Department","Legal Entity","Headcount Paid","Total Gross (INR)","Total Variable (INR)","Total Overtime (INR)","Payroll Error Count","Off-cycle Count"],
  payAgg,
);
write(
  "Payroll_statutory_2026-05.xlsx",
  ["Pay Month","Statutory Type","Due Date","Paid Date","Amount (INR)","Status"],
  [
    ["2026-05", "PF", "2026-06-15", "2026-06-12", 1850000, "Paid"],
    ["2026-05", "ESI", "2026-06-15", "2026-06-14", 320000, "Paid"],
    ["2026-05", "PT", "2026-06-10", "2026-06-09", 95000, "Paid"],
    ["2026-05", "TDS", "2026-06-07", "2026-06-18", 2750000, "Late"],
    ["2026-05", "LWF", "2026-06-30", "", 18000, "Pending"],
  ],
);

// ---- 5. L&D (programs + enrollments), May 2026 ----------------------------
const programs = [
  { id: "LDP-001", name: "POSH & Code of Conduct", cat: "Compliance", cost: 120000, plan: 150 },
  { id: "LDP-002", name: "Information Security Essentials", cat: "Mandatory", cost: 90000, plan: 150 },
  { id: "LDP-003", name: "PCI-DSS Awareness", cat: "Compliance", cost: 110000, plan: 120 },
  { id: "LDP-004", name: "Manager Essentials", cat: "Leadership", cost: 260000, plan: 30 },
  { id: "LDP-005", name: "Advanced React", cat: "Functional", cost: 180000, plan: 25 },
  { id: "LDP-006", name: "Consultative Selling", cat: "Functional", cost: 150000, plan: 30 },
  { id: "LDP-007", name: "New Hire Onboarding", cat: "Onboarding", cost: 80000, plan: 40 },
  { id: "LDP-008", name: "Data Privacy (DPDP Act)", cat: "Compliance", cost: 100000, plan: 150 },
  { id: "LDP-009", name: "Excel for Finance", cat: "Functional", cost: 60000, plan: 20 },
  { id: "LDP-010", name: "Leadership Bootcamp", cat: "Leadership", cost: 320000, plan: 15 },
];
const MODES = ["Classroom", "Virtual", "Self-paced"];
write(
  "LD_programs_2026-05.xlsx",
  ["Program ID","Program Name","Category","Mode","Start Date","End Date","Trainer / Vendor","Total Cost (INR)","Planned Participants"],
  programs.map((p) => [p.id, p.name, p.cat, pick(MODES), iso(2026, int(3, 5), int(1, 20)), iso(2026, int(5, 6), int(1, 28)), pick(["Internal L&D", "UpGrad", "Coursera", "LinkedIn Learning"]), p.cost, p.plan]),
);
const ldRows = [];
for (const e of active) {
  const enrollP = WEAK_TRAINING.has(e.dept) ? 0.4 : 0.8;
  if (!chance(enrollP)) continue;
  const count = int(1, 3);
  const chosen = new Set();
  for (let k = 0; k < count; k++) chosen.add(pick(programs).id);
  for (const pid of chosen) {
    const prog = programs.find((p) => p.id === pid);
    const compliance = prog.cat === "Mandatory" || prog.cat === "Compliance";
    const completeP = compliance ? 0.85 : 0.7;
    const status = chance(completeP) ? "Completed" : pick(["Enrolled", "In-progress", "Dropped"]);
    const done = status === "Completed";
    ldRows.push([
      e.num, pid, iso(2026, int(3, 5), int(1, 25)), status, done ? iso(2026, int(4, 5), int(1, 28)) : "",
      int(2, 16), done ? int(55, 98) : "", done ? (3 + Math.round(rnd() * 20) / 10) : "",
    ]);
  }
}
write(
  "LD_enrollments_2026-05.xlsx",
  ["Employee Number","Program ID","Enrolled Date","Status","Completion Date","Duration Hours","Assessment Score","Feedback Score (1-5)"],
  ldRows,
);

// ---- 6. HR Admin (assets + contracts + lifecycle) -------------------------
const ASSET_TYPES = ["Laptop", "Phone", "Access Card", "SIM", "Other"];
const assetRows = [];
let aid = 1000;
for (const e of active) {
  if (!chance(0.95)) continue;
  aid += 1;
  assetRows.push([`AST-${aid}`, "Laptop", e.num, e.doj, "", "Allocated", int(45000, 110000)]);
  if (chance(0.5)) {
    aid += 1;
    assetRows.push([`AST-${aid}`, pick(["Phone", "Access Card", "SIM"]), e.num, e.doj, "", "Allocated", int(2000, 60000)]);
  }
}
// a few lost / in-stock
for (let i = 0; i < 3; i++) { aid += 1; assetRows.push([`AST-${aid}`, pick(ASSET_TYPES), "", "", "", "Lost", int(20000, 90000)]); }
for (let i = 0; i < 8; i++) { aid += 1; assetRows.push([`AST-${aid}`, pick(ASSET_TYPES), "", "", "", "In-stock", int(20000, 90000)]); }
write(
  "Admin_assets_2026-05-05.xlsx",
  ["Asset ID","Asset Type","Assigned Employee Number","Assign Date","Return Date","Status","Value (INR)"],
  assetRows,
);
const CONTRACT_CATS = ["Facilities", "IT", "Insurance", "License", "Other"];
const contractRows = [];
const expiries = ["2026-04-20", "2026-03-15", "2026-05-20", "2026-05-28", "2026-06-10", "2026-06-25", "2026-07-15", "2026-08-01"];
for (let i = 1; i <= 16; i++) {
  const exp = i <= expiries.length ? expiries[i - 1] : iso(2026, int(9, 12), int(1, 28));
  contractRows.push([
    `CON-${pad(i)}`, `${pick(["Acme", "Zenith", "Pinnacle", "Vertex", "Summit"])} ${pick(["Facilities", "Tech", "Insurance", "Services"])} Pvt Ltd`,
    pick(CONTRACT_CATS), iso(int(2023, 2025), int(1, 12), int(1, 28)), exp, int(200000, 1500000),
    pick(["Auto", "In-progress", "Pending", "Pending"]), "Admin Team",
  ]);
}
write(
  "Admin_contracts_2026-05-05.xlsx",
  ["Contract ID","Vendor Name","Category","Start Date","Expiry Date","Annual Cost (INR)","Renewal Status","Owner"],
  contractRows,
);
const lifeRows = [];
const recentJoiners = active.slice(0, 12);
for (const e of recentJoiners) lifeRows.push([e.num, "Onboarding", iso(2026, int(4, 5), int(1, 28)), chance(0.8) ? "Y" : "N", chance(0.7) ? "" : "ID card; email setup", ""]);
const leavers = employees.filter((e) => e.status === "Relieved").slice(0, 10);
for (const e of leavers) lifeRows.push([e.num, "Offboarding", e.lwd || iso(2026, 4, int(1, 28)), chance(0.7) ? "Y" : "N", chance(0.6) ? "" : "FnF pending", chance(0.6) ? "Y" : "N"]);
write(
  "Admin_lifecycle_2026-05.xlsx",
  ["Employee Number","Type","Start Date","Checklist Complete","Pending Items","Asset Recovered"],
  lifeRows,
);

console.log(`Generated ${written.length} workbooks in ${outDir}:`);
for (const w of written) console.log("  - " + w);
console.log(`\nRoster: ${employees.length} employees (${active.length} active) across ${DEPTS.length} departments.`);
