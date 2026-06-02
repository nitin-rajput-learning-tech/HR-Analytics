// Optional passphrase encryption for workspace files (WebCrypto AES-256-GCM).
//
// Envelope layout (binary, concatenated):
//   magic  : 8 bytes  — "HRAENC" + format tag + version
//   salt   : 16 bytes — PBKDF2 salt
//   iv     : 12 bytes — AES-GCM nonce
//   cipher : AES-256-GCM(ciphertext+tag) over the gzipped workspace bytes
//
// This wraps the existing gzip(JSON) output, so saveWorkspace/loadWorkspace are
// unchanged. crypto.subtle requires a secure context (https, localhost, or a
// file:// page) — all of which apply to how this app is opened. A high PBKDF2
// iteration count stretches the passphrase; AES-GCM's auth tag makes a wrong
// passphrase fail to decrypt rather than returning garbage.

const MAGIC = new Uint8Array([0x48, 0x52, 0x41, 0x45, 0x4e, 0x43, 0x01, 0x00]); // "HRAENC" \x01 \x00
const SALT_LEN = 16;
const IV_LEN = 12;
const PBKDF2_ITERS = 210_000;

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

// True if the bytes carry our encryption envelope (so load can branch).
export function isEncryptedWorkspace(bytes: Uint8Array): boolean {
  if (bytes.length < MAGIC.length) return false;
  for (let i = 0; i < MAGIC.length; i++) if (bytes[i] !== MAGIC[i]) return false;
  return true;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getCrypto().subtle;
  const baseKey = await subtle.importKey("raw", buf(new TextEncoder().encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt: buf(salt), iterations: PBKDF2_ITERS, hash: "SHA-256" },
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
  const key = await deriveKey(passphrase, salt);
  const cipher = new Uint8Array(await getCrypto().subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(plain)));
  const out = new Uint8Array(MAGIC.length + SALT_LEN + IV_LEN + cipher.length);
  out.set(MAGIC, 0);
  out.set(salt, MAGIC.length);
  out.set(iv, MAGIC.length + SALT_LEN);
  out.set(cipher, MAGIC.length + SALT_LEN + IV_LEN);
  return out;
}

export async function decryptWorkspace(data: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (!isEncryptedWorkspace(data)) throw new Error("This file is not an encrypted workspace.");
  const salt = data.slice(MAGIC.length, MAGIC.length + SALT_LEN);
  const iv = data.slice(MAGIC.length + SALT_LEN, MAGIC.length + SALT_LEN + IV_LEN);
  const cipher = data.slice(MAGIC.length + SALT_LEN + IV_LEN);
  const key = await deriveKey(passphrase, salt);
  try {
    return new Uint8Array(await getCrypto().subtle.decrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(cipher)));
  } catch {
    throw new Error("Wrong passphrase, or the file is corrupted.");
  }
}
