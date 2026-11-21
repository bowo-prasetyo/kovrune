// Backups protected by a password (harness 0.104.0). A backup holds the text of every document, which for a
// researcher may be interview transcripts covered by an ethics protocol or data-protection law; written as plain
// JSON, anyone who finds the file can read them (docs/social-sciences-audit.md, S9). With a password, the backup's
// JSON is encrypted in the browser with WebCrypto, AES-GCM with a 256-bit key derived from the password by PBKDF2
// (SHA-256, PBKDF2_ITERATIONS, a random salt), and written in an envelope that says how. Nothing leaves the device.
// Without the password the file can't be read, by Kovrune or anyone: there is no way to recover it.

export const ENCRYPTED_FORMAT = "kovrune-backup-encrypted";
export const ENCRYPTED_VERSION = 1;
/** OWASP's 2023 recommendation for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;

interface Envelope {
  format: typeof ENCRYPTED_FORMAT;
  version: number;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  data: string;
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function keyFrom(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** A backup's JSON encrypted with a password, as the text of an encrypted backup file. */
export async function encryptBackup(json: string, password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, iterations);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(json)));
  const envelope: Envelope = {
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTED_VERSION,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: toBase64(salt) },
    cipher: { name: "AES-GCM", iv: toBase64(iv) },
    data: toBase64(data),
  };
  return JSON.stringify(envelope);
}

/** Whether a backup file's text is an encrypted backup. */
export function isEncryptedBackup(text: string): boolean {
  try {
    return (JSON.parse(text) as { format?: unknown })?.format === ENCRYPTED_FORMAT;
  } catch {
    return false;
  }
}

/** An encrypted backup's JSON, or an error saying the password is wrong or the file damaged. */
export async function decryptBackup(text: string, password: string): Promise<string> {
  const envelope = JSON.parse(text) as Partial<Envelope>;
  if (envelope.format !== ENCRYPTED_FORMAT || envelope.version !== ENCRYPTED_VERSION || !envelope.kdf || !envelope.cipher || typeof envelope.data !== "string") {
    throw new Error("This encrypted backup was made by a newer version of Kovrune, or is damaged.");
  }
  const iterations = Number(envelope.kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000) throw new Error("This encrypted backup is damaged.");
  const key = await keyFrom(password, fromBase64(envelope.kdf.salt), iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.cipher.iv) }, key, fromBase64(envelope.data));
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("Wrong password, or the backup file is damaged.");
  }
}
