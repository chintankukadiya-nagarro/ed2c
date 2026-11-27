import { BRAND_KEYS, isBrandKey, type BrandKey } from "@ed2c/brands";

import { randomNonce, readSignedToken, signToken } from "./token";

/** Seconds each hop of the sign-out chain may take. */
export const LOGOUT_HOP_TTL_SECONDS = 60;

/**
 * Sign-out everywhere visits each site in turn. Each site clears its own
 * session, then the chain returns to the site that started it, which ends the
 * Shopify session last so its own ID token is still available.
 */
export type LogoutClaims = {
  kind: "logout";
  /** Site that started the sign-out and finishes it. */
  origin: BrandKey;
  /** Sites still to visit, in order. */
  remaining: BrandKey[];
  /** Site this hop is addressed to. */
  aud: BrandKey;
  exp: number;
  nonce: string;
};

export function logoutRoute(start: BrandKey): BrandKey[] {
  return [...BRAND_KEYS.filter((key) => key !== start), start];
}

export async function createLogoutHop(
  origin: BrandKey,
  route: BrandKey[],
  secret: string,
  now: number = Date.now(),
): Promise<{ aud: BrandKey; token: string }> {
  const [aud, ...remaining] = route;
  if (!aud) throw new Error("The sign-out route is empty.");
  const claims: LogoutClaims = {
    kind: "logout",
    origin,
    remaining,
    aud,
    exp: Math.floor(now / 1000) + LOGOUT_HOP_TTL_SECONDS,
    nonce: randomNonce(),
  };
  return { aud, token: await signToken(claims, secret) };
}

export async function verifyLogoutHop(
  token: string,
  options: { secret: string; audience: BrandKey; now?: number },
): Promise<LogoutClaims | null> {
  if (!token || token.length > 4096) return null;
  const payload = await readSignedToken(token, options.secret);
  if (typeof payload !== "object" || payload === null) return null;
  const claims = payload as Record<string, unknown>;
  if (claims.kind !== "logout" || !isBrandKey(claims.origin) || !isBrandKey(claims.aud)) return null;
  if (!Array.isArray(claims.remaining) || !claims.remaining.every(isBrandKey)) return null;
  if (typeof claims.exp !== "number" || typeof claims.nonce !== "string") return null;
  if (claims.aud !== options.audience) return null;
  if (claims.exp <= Math.floor((options.now ?? Date.now()) / 1000)) return null;
  return claims as LogoutClaims;
}
