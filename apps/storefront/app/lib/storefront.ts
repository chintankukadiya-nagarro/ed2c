import {
  type CacheInstance,
  createShopifyRequestContext,
  createStorefrontClient,
  type PublicStorefrontClient,
  type RequestScopedPrivateStorefrontClient,
  type ShopifyRequestContext,
} from "@shopify/hydrogen";
import { createContext } from "react-router";

import type { Env } from "~/lib/env";
import { sharedCartIdentity } from "~/lib/shared-cart";
import {
  getBuyerIp,
  getMockShopDomain,
  getPrivateStorefrontToken,
  getStoreDomain,
  storefrontConfig,
  shouldUseMockShop,
} from "~/lib/shop";

// Real store: private token + trusted buyer IP. mock.shop: tokenless public
// access (it is auth-free and rejects any private token, even a placeholder).
export type RequestStorefrontClient = RequestScopedPrivateStorefrontClient | PublicStorefrontClient;

export function createRequestStorefrontClient(
  request: Request,
  env: Env,
  cache: CacheInstance,
  waitUntil: ExecutionContext["waitUntil"],
): RequestStorefrontClient {
  const { i18n } = storefrontConfig;

  if (shouldUseMockShop(env)) {
    return createStorefrontClient({
      type: "public",
      requestContext: createShopifyRequestContext({ request, i18n }),
      config: {
        storeDomain: getMockShopDomain(env),
        cache,
        waitUntil,
      },
    });
  }

  return createStorefrontClient({
    type: "private",
    requestContext: createShopifyRequestContext({
      request,
      i18n,
      buyerIp: getBuyerIp(request.headers),
    }),
    config: {
      storeDomain: getStoreDomain(env),
      privateStorefrontToken: getPrivateStorefrontToken(env),
      storefrontId: env.PUBLIC_STOREFRONT_ID,
      cache,
      waitUntil,
    },
  });
}

/** Cart IDs are scoped to a Storefront API identity. All three sites share House. */
export function createCartStorefrontClient(
  request: Request,
  env: Env,
  cache: CacheInstance,
  waitUntil: ExecutionContext["waitUntil"],
): RequestStorefrontClient {
  const shared = sharedCartIdentity(env);
  if (!shared || shouldUseMockShop(env)) {
    return createRequestStorefrontClient(request, env, cache, waitUntil);
  }

  const { i18n } = storefrontConfig;
  return createStorefrontClient({
    type: "private",
    requestContext: createShopifyRequestContext({
      request,
      i18n,
      buyerIp: getBuyerIp(request.headers),
    }),
    config: {
      storeDomain: getStoreDomain(env),
      privateStorefrontToken: shared.token,
      storefrontId: shared.storefrontId,
      cache,
      waitUntil,
    },
  });
}

export const storefrontClientContext = createContext<RequestStorefrontClient>();
export const storefrontRequestContext = createContext<ShopifyRequestContext>();
