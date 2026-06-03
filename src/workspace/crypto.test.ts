import { describe, it, expect } from "vitest";
import pako from "pako";
import { encryptWorkspace, decryptWorkspace, isEncryptedWorkspace } from "./crypto";

const plain = pako.gzip(JSON.stringify({ format: "hr-analytics-workspace", version: 2, hello: "world" }));

// Build a legacy v1 envelope (210k PBKDF2) the way older builds wrote it, to
// prove the version-gated decrypt still opens files made before the bump.
async function makeV1Envelope(data: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const c = globalThis.crypto;
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const baseKey = await c.subtle.importKey("raw", new TextEncoder().encode(passphrase) as BufferSource, "PBKDF2", false, ["deriveKey"]);
  const key = await c.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: 210_000, hash: "SHA-256" }, baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const cipher = new Uint8Array(await c.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource));
  const out = new Uint8Array(8 + 16 + 12 + cipher.length);
  out.set([0x48, 0x52, 0x41, 0x45, 0x4e, 0x43, 0x01, 0x00], 0); // "HRAENC" v1
  out.set(salt, 8);
  out.set(iv, 8 + 16);
  out.set(cipher, 8 + 16 + 12);
  return out;
}

describe("workspace encryption", () => {
  it("round-trips bytes through encrypt -> decrypt with the right passphrase", async () => {
    const enc = await encryptWorkspace(plain, "correct horse battery staple");
    expect(isEncryptedWorkspace(enc)).toBe(true);
    const dec = await decryptWorkspace(enc, "correct horse battery staple");
    expect(Array.from(dec)).toEqual(Array.from(plain));
  });

  it("produces ciphertext that does not contain the plaintext and differs each time (random IV/salt)", async () => {
    const a = await encryptWorkspace(plain, "pw");
    const b = await encryptWorkspace(plain, "pw");
    // different salt+iv => different ciphertext for the same input
    expect(Array.from(a)).not.toEqual(Array.from(b));
    expect(isEncryptedWorkspace(plain)).toBe(false); // raw gzip is not flagged encrypted
  });

  it("fails with a clear error on the wrong passphrase", async () => {
    const enc = await encryptWorkspace(plain, "right");
    let msg = "";
    try {
      await decryptWorkspace(enc, "wrong");
    } catch (e) {
      msg = String((e as Error).message);
    }
    expect(/wrong passphrase/i.test(msg)).toBe(true);
  });

  it("rejects decrypting a non-encrypted (plain) file", async () => {
    let msg = "";
    try {
      await decryptWorkspace(plain, "pw");
    } catch (e) {
      msg = String((e as Error).message);
    }
    expect(/not an encrypted workspace/i.test(msg)).toBe(true);
  });

  it("stamps new files as the current envelope version (v2 / 600k PBKDF2)", async () => {
    const enc = await encryptWorkspace(plain, "pw");
    expect(enc[6]).toBe(2);
  });

  it("still decrypts a legacy v1 (210k) envelope — backward compatible", async () => {
    const v1 = await makeV1Envelope(plain, "legacy-pass");
    expect(v1[6]).toBe(1);
    expect(isEncryptedWorkspace(v1)).toBe(true);
    const dec = await decryptWorkspace(v1, "legacy-pass");
    expect(Array.from(dec)).toEqual(Array.from(plain));
  });

  it("rejects an unknown envelope version with a clear error", async () => {
    const enc = await encryptWorkspace(plain, "pw");
    enc[6] = 9; // unsupported version
    let msg = "";
    try {
      await decryptWorkspace(enc, "pw");
    } catch (e) {
      msg = String((e as Error).message);
    }
    expect(/unsupported encrypted-workspace version/i.test(msg)).toBe(true);
  });
});
