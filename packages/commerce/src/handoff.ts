import { BRAND_KEYS, isBrandKey, type BrandKey } from "@ed2c/brands";

import { safeReturnPath } from "./paths";
import { randomNonce, readSignedToken, signToken } from "./token";

/** Seconds a handoff link stays valid. It is used by a redirect, so it only needs a moment. */
export const HANDOFF_TTL_SECONDS = 60;

/**
 * Moves a shopper from one brand site to another. The token carries the shared
 * cart and whether the shopper was signed in, so the target site can restore
 * the bag and try a silent sign-in.
 */
export type HandoffClaims = {
  kind: "handoff";
  /** Site that issued the token. */
  iss: BrandKey;
  /** Site that may accept the token. */
  aud: BrandKey;
  /** Cart ID, or null when the shopper has no bag yet. */
  cart: string | null;
  /** True when the shopper was signed in on the issuing site. */
  signedIn: boolean;
  /** Same-origin path to open on the target site. */
  to: string;
  /** Expiry, Unix seconds. */
  exp: number;
  nonce: string;
};

export type HandoffInput = Pick<HandoffClaims, "iss" | "aud" | "cart" | "signedIn" | "to">;

export async function createHandoffToken(
  input: HandoffInput,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const claims: HandoffClaims = {
    kind: "handoff",
    ...input,
    to: safeReturnPath(input.to),
    exp: Math.floor(now / 1000) + HANDOFF_TTL_SECONDS,
    nonce: randomNonce(),
  };
  return signToken(claims, secret);
}

export type HandoffFailure = "malformed" | "bad_signature" | "wrong_audience" | "expired" | "replayed";

export type HandoffResult = { ok: true; claims: HandoffClaims } | { ok: false; reason: HandoffFailure };

export type VerifyHandoffOptions = {
  secret: string;
  audience: BrandKey;
  /**
   * Records the nonce and returns true when it was already used. Back it with
   * storage that every server instance shares.
   */
  consumeNonce: (nonce: string, ttlSeconds: number) => Promise<boolean>;
  now?: number;
};

export async function verifyHandoffToken(token: string, options: VerifyHandoffOptions): Promise<HandoffResult> {
  if (!token || token.length > 4096) return { ok: false, reason: "malformed" };

  const payload = await readSignedToken(token, options.secret);
  if (payload === null) {
    return { ok: false, reason: token.includes(".") ? "bad_signature" : "malformed" };
  }
  const claims = parseClaims(payload);
  if (!claims) return { ok: false, reason: "malformed" };
  if (claims.aud !== options.audience) return { ok: false, reason: "wrong_audience" };

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (claims.exp <= nowSeconds) return { ok: false, reason: "expired" };

  const replayed = await options.consumeNonce(claims.nonce, Math.max(1, claims.exp - nowSeconds));
  if (replayed) return { ok: false, reason: "replayed" };

  return { ok: true, claims: { ...claims, to: safeReturnPath(claims.to) } };
}

function parseClaims(value: unknown): HandoffClaims | null {
  if (typeof value !== "object" || value === null) return null;
  const claims = value as Record<string, unknown>;
  if (claims.kind !== "handoff") return null;
  if (!isBrandKey(claims.iss) || !isBrandKey(claims.aud)) return null;
  if (claims.cart !== null && !isCartId(claims.cart)) return null;
  if (typeof claims.signedIn !== "boolean") return null;
  if (typeof claims.to !== "string") return null;
  if (typeof claims.exp !== "number" || !Number.isInteger(claims.exp)) return null;
  if (typeof claims.nonce !== "string" || claims.nonce.length < 16) return null;
  return claims as HandoffClaims;
}

function isCartId(value: unknown): value is string {
  return typeof value === "string" && /^gid:\/\/shopify\/Cart\/[A-Za-z0-9_?=&.-]{1,512}$/.test(value);
}

/** Sites a shopper can switch to from `current`, in display order. */
export function otherBrands(current: BrandKey): BrandKey[] {
  return BRAND_KEYS.filter((key) => key !== current);
}
