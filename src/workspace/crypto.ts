// Optional passphrase encryption for workspace files (WebCrypto AES-256-GCM).
//
// Envelope layout (binary, concatenated):
//   header : 8 bytes  — "HRAENC" (6) + version (1) + reserved (1)
//   salt   : 16 bytes — PBKDF2 salt
//   iv     : 12 bytes — AES-GCM nonce
//   cipher : AES-256-GCM(ciphertext+tag) over the gzipped workspace bytes
//
// This wraps the existing gzip(JSON) output, so saveWorkspace/loadWorkspace are
// unchanged. crypto.subtle requires a secure context (https, localhost, or a
// file:// page) — all of which apply to how this app is opened. AES-GCM's auth
// tag makes a wrong passphrase fail to decrypt rather than returning garbage.
//
// Crypto agility: the PBKDF2 iteration count is tied to the envelope VERSION
// byte, so it can be raised over time without breaking older files. v2 (current)
// uses 600k iterations per current OWASP guidance; v1 files (210k) still decrypt.

const MAGIC_PREFIX = new Uint8Array([0x48, 0x52, 0x41, 0x45, 0x4e, 0x43]); // "HRAENC"
const HEADER_LEN = 8; // MAGIC_PREFIX(6) + version(1) + reserved(1)
const VERSION_OFFSET = 6;
const SALT_LEN = 16;
const IV_LEN = 12;

// PBKDF2-HMAC-SHA256 iterations per envelope version. New files use the current
// version; older versions stay decryptable for backward compatibility.
const ITERS_BY_VERSION: Record<number, number> = { 1: 210_000, 2: 600_000 };
const CURRENT_VERSION = 2;

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("Encryption is unavailable in this environment (needs a secure context).");
  return c;
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  getCrypto().getRandomValues(b);
  return b;
}

// WebCrypto's lib types require ArrayBuffer-backed views; our Uint8Arrays are
// fine at runtime (never SharedArrayBuffer), so adapt the type without copying.
const buf = (u: Uint8Array): BufferSource => u as BufferSource;

// True if the bytes carry our encryption envelope (matched on the fixed prefix,
// so any supported version is recognised).
export function isEncryptedWorkspace(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_LEN) return false;
  for (let i = 0; i < MAGIC_PREFIX.length; i++) if (bytes[i] !== MAGIC_PREFIX[i]) return false;
  return true;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const subtle = getCrypto().subtle;
  const baseKey = await subtle.importKey("raw", buf(new TextEncoder().encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt: buf(salt), iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptWorkspace(plain: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (!passphrase) throw new Error("A passphrase is required to encrypt.");
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = await deriveKey(passphrase, salt, ITERS_BY_VERSION[CURRENT_VERSION]);
  const cipher = new Uint8Array(await getCrypto().subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(plain)));
  const out = new Uint8Array(HEADER_LEN + SALT_LEN + IV_LEN + cipher.length);
  out.set(MAGIC_PREFIX, 0);
  out[VERSION_OFFSET] = CURRENT_VERSION;
  out[VERSION_OFFSET + 1] = 0; // reserved
  out.set(salt, HEADER_LEN);
  out.set(iv, HEADER_LEN + SALT_LEN);
  out.set(cipher, HEADER_LEN + SALT_LEN + IV_LEN);
  return out;
}

export async function decryptWorkspace(data: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (!isEncryptedWorkspace(data)) throw new Error("This file is not an encrypted workspace.");
  const iterations = ITERS_BY_VERSION[data[VERSION_OFFSET]];
  if (!iterations) throw new Error(`Unsupported encrypted-workspace version (${data[VERSION_OFFSET]}). Update the app to open this file.`);
  const salt = data.slice(HEADER_LEN, HEADER_LEN + SALT_LEN);
  const iv = data.slice(HEADER_LEN + SALT_LEN, HEADER_LEN + SALT_LEN + IV_LEN);
  const cipher = data.slice(HEADER_LEN + SALT_LEN + IV_LEN);
  const key = await deriveKey(passphrase, salt, iterations);
  try {
    return new Uint8Array(await getCrypto().subtle.decrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(cipher)));
  } catch {
    throw new Error("Wrong passphrase, or the file is corrupted.");
  }
}
