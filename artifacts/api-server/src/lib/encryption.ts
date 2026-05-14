import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// AES-256-GCM with per-secret nonce. Ciphertext, nonce, and authTag are
// stored separately as base64 in `project_secrets`. Plaintext is never
// stored, logged, or returned by any API.
//
// TODO(secrets-mgr): swap this for AWS Secrets Manager (Phase 11+). The
// migration plan is to keep this helper as a thin facade and replace its
// internals with KMS-encrypted DEKs while preserving the (encryptedValue,
// nonce, authTag) row shape so existing rows can be migrated lazily on
// next-rotate.

const ALG = "aes-256-gcm" as const;
const KEY_LEN = 32;
const NONCE_LEN = 12;

let cachedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY ?? "";
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ENCRYPTION_KEY env var is required in production. Refusing to start the secrets path with a derived dev key.",
      );
    }
    // Dev fallback: derive a stable 32-byte key from a known dev seed so
    // local restarts can decrypt the rows they wrote earlier in the same
    // workspace. Logged loudly so nobody mistakes it for a prod posture.
    // eslint-disable-next-line no-console
    console.warn(
      "[encryption] ENCRYPTION_KEY not set — falling back to derived dev key. Do NOT use this in production.",
    );
    cachedKey = createHash("sha256").update("machinedog-dev-fallback-key").digest();
    return cachedKey;
  }
  // Accept either a hex/base64 string of 32 bytes or any string we hash
  // down to 32 bytes. Hashing keeps the API forgiving while always yielding
  // an AES-256 key.
  const buf = Buffer.from(raw, "utf8");
  cachedKey = createHash("sha256").update(buf).digest();
  if (cachedKey.length !== KEY_LEN) {
    throw new Error(`Derived encryption key must be ${KEY_LEN} bytes`);
  }
  return cachedKey;
}

export interface EncryptedPayload {
  encryptedValue: string; // base64 ciphertext
  nonce: string; // base64
  authTag: string; // base64
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = resolveKey();
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALG, key, nonce);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedValue: enc.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = resolveKey();
  const nonce = Buffer.from(payload.nonce, "base64");
  const enc = Buffer.from(payload.encryptedValue, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const decipher = createDecipheriv(ALG, key, nonce);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

/**
 * Builds a masked preview of the value that's safe to display in lists.
 * For values >= 8 chars: dots + last 4. Shorter values: all dots.
 */
export function maskedPreview(plaintext: string): string {
  if (plaintext.length >= 8) {
    return `••••${plaintext.slice(-4)}`;
  }
  return "••••••••";
}
