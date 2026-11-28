import { describe, expect, it } from "vitest";

import {
  HANDOFF_TTL_SECONDS,
  createHandoffToken,
  createLogoutHop,
  handoffUrl,
  logoutRoute,
  readHandoffToken,
  safeReturnPath,
  verifyHandoffToken,
  verifyLogoutHop,
} from "../src";

const SECRET = "test-secret-that-is-long-enough-0123456789";
const CART = "gid://shopify/Cart/hWN1abc?key=def123";

function nonceStore() {
  const seen = new Set<string>();
  return async (nonce: string) => {
    if (seen.has(nonce)) return true;
    seen.add(nonce);
    return false;
  };
}

async function issue(now = Date.now()) {
  return createHandoffToken(
    { iss: "laroche-posay", aud: "kerastase", cart: CART, signedIn: true, to: "/products/elsève?x=1" },
    SECRET,
    now,
  );
}

describe("handoff token", () => {
  it("accepts a fresh token once", async () => {
    const consumeNonce = nonceStore();
    const result = await verifyHandoffToken(await issue(), { secret: SECRET, audience: "kerastase", consumeNonce });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.cart).toBe(CART);
    expect(result.claims.signedIn).toBe(true);
    expect(result.claims.iss).toBe("laroche-posay");
    expect(result.claims.to).toBe("/products/els%C3%A8ve?x=1");
  });

  it("rejects a reused token", async () => {
    const consumeNonce = nonceStore();
    const token = await issue();
    await verifyHandoffToken(token, { secret: SECRET, audience: "kerastase", consumeNonce });
    const again = await verifyHandoffToken(token, { secret: SECRET, audience: "kerastase", consumeNonce });
    expect(again).toEqual({ ok: false, reason: "replayed" });
  });

  it("rejects an expired token", async () => {
    const issuedAt = Date.now() - (HANDOFF_TTL_SECONDS + 1) * 1000;
    const result = await verifyHandoffToken(await issue(issuedAt), {
      secret: SECRET,
      audience: "kerastase",
      consumeNonce: nonceStore(),
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a tampered payload", async () => {
    const [body, signature] = (await issue()).split(".");
    const claims = JSON.parse(atob(body!.replace(/-/g, "+").replace(/_/g, "/")));
    claims.cart = "gid://shopify/Cart/someone-else";
    const forged = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const result = await verifyHandoffToken(`${forged}.${signature}`, {
      secret: SECRET,
      audience: "kerastase",
      consumeNonce: nonceStore(),
    });
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a token signed with another secret", async () => {
    const token = await createHandoffToken(
      { iss: "house", aud: "kerastase", cart: null, signedIn: false, to: "/" },
      "another-secret-that-is-long-enough-987654",
    );
    const result = await verifyHandoffToken(token, { secret: SECRET, audience: "kerastase", consumeNonce: nonceStore() });
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a token addressed to another site", async () => {
    const result = await verifyHandoffToken(await issue(), { secret: SECRET, audience: "house", consumeNonce: nonceStore() });
    expect(result).toEqual({ ok: false, reason: "wrong_audience" });
  });

  it("rejects garbage", async () => {
    for (const token of ["", "abc", "a.b.c", "!!.??"]) {
      const result = await verifyHandoffToken(token, { secret: SECRET, audience: "house", consumeNonce: nonceStore() });
      expect(result.ok).toBe(false);
    }
  });

  it("never carries an off-site redirect", async () => {
    const token = await createHandoffToken(
      { iss: "house", aud: "kerastase", cart: null, signedIn: false, to: "https://evil.example/" },
      SECRET,
    );
    const result = await verifyHandoffToken(token, { secret: SECRET, audience: "kerastase", consumeNonce: nonceStore() });
    expect(result.ok && result.claims.to).toBe("/");
  });
});

describe("handoff URL", () => {
  it("puts the token in the path so Oxygen login cannot drop ?t=", async () => {
    const token = await createHandoffToken(
      { iss: "laroche-posay", aud: "kerastase", cart: CART, signedIn: false, to: "/cart" },
      SECRET,
    );
    const url = handoffUrl("https://kerastase.example.com", token);
    expect(url.startsWith("https://kerastase.example.com/handoff/")).toBe(true);
    expect(url).not.toContain("?t=");
    expect(readHandoffToken(new URL(url))).toBe(token);
  });

  it("still reads a query-string token from older links", () => {
    expect(readHandoffToken(new URL("https://house.example.com/handoff?t=abc.def"))).toBe("abc.def");
  });
});

describe("safeReturnPath", () => {
  it.each([
    ["/cart", "/cart"],
    ["/collections/kerastase?sort=price", "/collections/kerastase?sort=price"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["https://evil.example/", "/"],
    ["javascript:alert(1)", "/"],
    ["/ok\nSet-Cookie:x", "/"],
    [null, "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });
});

describe("sign-out chain", () => {
  it("visits every other site, then returns to the start", () => {
    expect(logoutRoute("kerastase")).toEqual(["house", "laroche-posay", "kerastase"]);
  });

  it("passes each hop to the next site only", async () => {
    const hop = await createLogoutHop("kerastase", logoutRoute("kerastase"), SECRET);
    expect(hop.aud).toBe("house");
    expect(await verifyLogoutHop(hop.token, { secret: SECRET, audience: "laroche-posay" })).toBeNull();
    const claims = await verifyLogoutHop(hop.token, { secret: SECRET, audience: "house" });
    expect(claims?.remaining).toEqual(["laroche-posay", "kerastase"]);
  });

  it("rejects an expired hop", async () => {
    const hop = await createLogoutHop("house", ["kerastase"], SECRET, Date.now() - 120_000);
    expect(await verifyLogoutHop(hop.token, { secret: SECRET, audience: "kerastase" })).toBeNull();
  });
});
