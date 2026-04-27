import { hash, verify } from "@node-rs/argon2";
import { randomBytes, timingSafeEqual } from "node:crypto";

// Algorithm.Argon2id === 2. We use the numeric literal directly so we don't
// pull in the const enum (forbidden by `isolatedModules`).
const ARGON2_OPTIONS = {
  algorithm: 2 as const,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (plain.length > 1024) {
    throw new Error("Password too long");
  }
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  if (!hashed) return false;
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

export function generateSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
