// Minimal vitest-compatible API (describe / it / expect) so the existing specs
// run under a plain Node process. The test runner (scripts/test.mjs) bundles
// each *.test.ts with esbuild-wasm and aliases "vitest" to this module, so no
// native esbuild binary is ever invoked — the suite runs on locked-down
// machines where the Go esbuild executable is blocked.

const tests = [];
const suiteStack = [];

export function describe(name, fn) {
  suiteStack.push(name);
  try {
    fn();
  } finally {
    suiteStack.pop();
  }
}

export function it(name, fn) {
  tests.push({ suite: suiteStack.join(" > "), name, fn });
}
export const test = it;

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

function fmt(v) {
  try {
    const s = JSON.stringify(v);
    if (s === undefined) return String(v);
    return s.length > 100 ? s.slice(0, 100) + "…" : s;
  } catch {
    return String(v);
  }
}

function makeExpect(received, negated) {
  const assert = (pass, msg) => {
    if (negated ? pass : !pass) throw new Error((negated ? "[not] " : "") + msg);
  };
  const api = {
    toBe: (e) => assert(Object.is(received, e), `expected ${fmt(received)} to be ${fmt(e)}`),
    toEqual: (e) => assert(deepEqual(received, e), `expected ${fmt(received)} to equal ${fmt(e)}`),
    toContain: (e) =>
      assert(
        (typeof received === "string" || Array.isArray(received)) && received.includes(e),
        `expected ${fmt(received)} to contain ${fmt(e)}`,
      ),
    toHaveLength: (e) => assert(received != null && received.length === e, `expected length ${received?.length} to be ${e}`),
    toBeGreaterThan: (e) => assert(received > e, `expected ${received} > ${e}`),
    toBeGreaterThanOrEqual: (e) => assert(received >= e, `expected ${received} >= ${e}`),
    toBeLessThan: (e) => assert(received < e, `expected ${received} < ${e}`),
    toBeLessThanOrEqual: (e) => assert(received <= e, `expected ${received} <= ${e}`),
    toBeNull: () => assert(received === null, `expected ${fmt(received)} to be null`),
    toBeUndefined: () => assert(received === undefined, `expected ${fmt(received)} to be undefined`),
    toBeDefined: () => assert(received !== undefined, `expected value to be defined`),
    toBeTruthy: () => assert(!!received, `expected ${fmt(received)} to be truthy`),
    toBeFalsy: () => assert(!received, `expected ${fmt(received)} to be falsy`),
    toBeCloseTo: (e, precision = 2) =>
      assert(Math.abs(received - e) < Math.pow(10, -precision) / 2, `expected ${received} to be close to ${e}`),
    toMatch: (re) =>
      assert(
        re instanceof RegExp ? re.test(received) : String(received).includes(re),
        `expected ${fmt(received)} to match ${re}`,
      ),
  };
  Object.defineProperty(api, "not", { get: () => makeExpect(received, !negated) });
  return api;
}

export function expect(received) {
  return makeExpect(received, false);
}

export async function __run() {
  let passed = 0;
  const failures = [];
  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
    } catch (e) {
      failures.push({ label: (t.suite ? t.suite + " > " : "") + t.name, message: e?.message ?? String(e) });
    }
  }
  return { passed, failed: failures.length, total: tests.length, failures };
}
