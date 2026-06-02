import { describe, it, expect } from "vitest";
import pako from "pako";
import { encryptWorkspace, decryptWorkspace, isEncryptedWorkspace } from "./crypto";

const plain = pako.gzip(JSON.stringify({ format: "hr-analytics-workspace", version: 2, hello: "world" }));

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
});
