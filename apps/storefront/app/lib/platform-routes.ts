import {
  BRANDS,
  isBrandKey,
  isLocalDemoOrigin,
  undeployedOriginEnv,
  type Brand,
  type BrandKey,
  type BrandOrigins,
} from "@ed2c/brands";
import {
  createHandoffToken,
  createLogoutHop,
  handoffUrl,
  logoutRoute,
  readHandoffToken,
  safeReturnPath,
  verifyHandoffToken,
  verifyLogoutHop,
} from "@ed2c/commerce";
import { createCartCookie, type ShopifyRequestContext } from "@shopify/hydrogen";
import type { CustomerSession, WritableCustomerSessionManager } from "@shopify/hydrogen/customer-account";

import type { Env } from "~/lib/env";
import { sharedCartIdentity } from "~/lib/shared-cart";

const SILENT_COOKIE = "ed2c_silent";
const SILENT_MAX_AGE_SECONDS = 300;
const CUSTOMER_SESSION_KEY = "customerAccount";

type PlatformContext = {
  request: Request;
  env: Env;
  brand: Brand;
  origins: BrandOrigins;
  sessionManager: WritableCustomerSessionManager;
  requestContext: ShopifyRequestContext;
  /** Null when Customer Accounts are off (plain HTTP or a mock shop). */
  customerSession: CustomerSession | null;
};

/**
 * Routes that make three sites feel like one: brand switching with the bag,
 * silent sign-in on arrival, and sign-out on every site. Returns null for any
 * other request.
 */
export async function handlePlatformRoute(context: PlatformContext): Promise<Response | null> {
  const url = new URL(context.request.url);
  const method = context.request.method;
  const go = /^\/go\/([a-z-]+)$/.exec(url.pathname);

  if (go && method === "GET") return switchBrand(context, go[1]!, url);
  if (method === "GET" && url.pathname === "/__ed2c/status") return status(context, url);
  if (method === "GET" && /^\/handoff(?:\/[^/]+)?$/.test(url.pathname)) return acceptHandoff(context, url);
  if (url.pathname === "/account/silent" && method === "GET") return silentSignIn(context, url);
  if (url.pathname === "/account/authorize" && method === "GET") return silentCallbackFallback(context, url);
  if (url.pathname === "/account/logout-everywhere" && method === "POST") return startLogout(context, url);
  if (url.pathname === "/logout/hop" && method === "GET") return logoutHop(context, url);
  return null;
}

/** Appends the cookie that ends a silent sign-in attempt to a finished authorize response. */
export function endSilentSignIn(request: Request, response: Response): void {
  if (readCookie(request, SILENT_COOKIE) !== null) response.headers.append("set-cookie", silentCookie("", 0));
}

async function switchBrand(context: PlatformContext, target: string, url: URL) {
  const { brand, origins, env } = context;
  if (!isBrandKey(target)) return new Response("Not Found", { status: 404 });
  const to = safeReturnPath(url.searchParams.get("to"));
  if (target === brand.key) return redirect(to);

  const missing = undeployedOriginEnv(env, target);
  if (missing && !isLocalDemoOrigin(url.origin)) {
    return new Response(
      `${BRANDS[target].name} still points at a local URL. Set ${missing} to that brand’s live https://….o2.myshopify.dev origin on all three Hydrogen storefronts, then Redeploy.`,
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const secret = requireSecret(env);
  const token = await createHandoffToken(
    {
      iss: brand.key,
      aud: target,
      cart: readCartId(context.request),
      signedIn: await isSignedIn(context),
      to,
    },
    secret,
  );
  return redirect(handoffUrl(origins[target], token));
}

function status(context: PlatformContext, url: URL): Response {
  const { env, brand, origins } = context;
  const keys: BrandKey[] = ["house", "laroche-posay", "kerastase"];
  return Response.json(
    {
      brand: brand.key,
      origin: url.origin,
      sharedCart: sharedCartIdentity(env) !== null,
      handoffSecret: Boolean(env.HANDOFF_SECRET?.trim()),
      origins,
      localOriginFallback: Object.fromEntries(keys.map((key) => [key, Boolean(undeployedOriginEnv(env, key))])),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

async function acceptHandoff(context: PlatformContext, url: URL) {
  const result = await verifyHandoffToken(readHandoffToken(url), {
    secret: requireSecret(context.env),
    audience: context.brand.key,
    consumeNonce,
  });
  if (!result.ok) {
    console.warn(`Handoff rejected: ${result.reason}`);
    return redirect("/");
  }

  const { claims } = result;
  const headers = new Headers();
  if (claims.cart) headers.append("set-cookie", createCartCookie(claims.cart));

  if (claims.signedIn && context.customerSession && !(await isSignedIn(context))) {
    return redirect(`/account/silent?return_to=${encodeURIComponent(claims.to)}`, headers);
  }
  return redirect(claims.to, headers);
}

/**
 * Asks Shopify to sign the shopper in without showing a login page. Shopify
 * answers at once: with a code when its session is live, or `login_required`
 * otherwise, in which case the shopper carries on as a guest.
 */
async function silentSignIn(context: PlatformContext, url: URL) {
  const returnTo = safeReturnPath(url.searchParams.get("return_to"));
  const { customerSession, sessionManager, requestContext } = context;
  if (!customerSession || (await isSignedIn(context))) return redirect(returnTo);
  // One attempt at a time, so a failing sign-in can never loop.
  if (readCookie(context.request, SILENT_COOKIE) !== null) return redirect(returnTo);

  const loginUrl = new URL(
    await customerSession.prepareLoginUrl(sessionManager, requestContext, {
      origin: url.origin,
      returnTo,
    }),
  );
  loginUrl.searchParams.set("prompt", "none");

  const headers = await sessionHeaders(sessionManager);
  headers.append("set-cookie", silentCookie(returnTo, SILENT_MAX_AGE_SECONDS));
  return redirect(loginUrl.toString(), headers);
}

function silentCallbackFallback(context: PlatformContext, url: URL) {
  const pending = readCookie(context.request, SILENT_COOKIE);
  if (pending === null || !url.searchParams.has("error")) return null;
  const headers = new Headers({ "set-cookie": silentCookie("", 0) });
  return redirect(safeReturnPath(pending), headers);
}

async function startLogout(context: PlatformContext, url: URL) {
  const requestOrigin = context.request.headers.get("origin");
  if (requestOrigin !== null && requestOrigin !== url.origin) return new Response("Forbidden", { status: 403 });

  const hop = await createLogoutHop(context.brand.key, logoutRoute(context.brand.key), requireSecret(context.env));
  return redirect(`${context.origins[hop.aud]}/logout/hop?t=${encodeURIComponent(hop.token)}`);
}

async function logoutHop(context: PlatformContext, url: URL) {
  const claims = await verifyLogoutHop(url.searchParams.get("t") ?? "", {
    secret: requireSecret(context.env),
    audience: context.brand.key,
  });
  if (!claims) return redirect("/");

  if (claims.remaining.length === 0) return finishLogoutPage();

  await context.sessionManager.removeSessionItem(CUSTOMER_SESSION_KEY);
  const headers = await sessionHeaders(context.sessionManager);
  const next = await createLogoutHop(claims.origin, claims.remaining, requireSecret(context.env));
  return redirect(`${context.origins[next.aud]}/logout/hop?t=${encodeURIComponent(next.token)}`, headers);
}

/**
 * Last stop of the chain, on the site that started it. Posting to
 * `/account/logout` ends the Shopify session with this site's ID token and
 * detaches the customer from the bag.
 */
function finishLogoutPage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Signing out</title></head>
<body><form method="post" action="/account/logout"><p>Signing you out of every site…</p><button type="submit">Continue</button></form>
<script>document.forms[0].submit()</script></body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

async function isSignedIn(context: PlatformContext): Promise<boolean> {
  if (!context.customerSession) return false;
  return context.customerSession.isLoggedIn(context.sessionManager, context.requestContext);
}

/**
 * Records a handoff nonce in the Oxygen cache. The cache is per data centre and
 * not atomic, which is enough for 60-second redirect tokens in this demo.
 */
async function consumeNonce(nonce: string, ttlSeconds: number): Promise<boolean> {
  try {
    const cache = await caches.open("ed2c-handoff");
    const key = new Request(`https://handoff.invalid/${encodeURIComponent(nonce)}`);
    if (await cache.match(key)) return true;
    await cache.put(key, new Response("1", { headers: { "cache-control": `public, max-age=${ttlSeconds}` } }));
    return false;
  } catch {
    return false;
  }
}

function requireSecret(env: Env): string {
  if (!env.HANDOFF_SECRET) throw new Error("HANDOFF_SECRET is required to move shoppers between brand sites.");
  return env.HANDOFF_SECRET;
}

function readCartId(request: Request): string | null {
  const token = readCookie(request, "cart");
  if (!token) return null;
  return token.startsWith("gid://shopify/Cart/") ? token : `gid://shopify/Cart/${token}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function silentCookie(value: string, maxAge: number): string {
  return `${SILENT_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

async function sessionHeaders(sessionManager: WritableCustomerSessionManager): Promise<Headers> {
  return new Headers((await sessionManager.commit?.()) ?? undefined);
}

function redirect(location: string, headers: Headers = new Headers()): Response {
  headers.set("location", location);
  headers.set("cache-control", "no-store");
  headers.set("referrer-policy", "no-referrer");
  return new Response(null, { status: 303, headers });
}
