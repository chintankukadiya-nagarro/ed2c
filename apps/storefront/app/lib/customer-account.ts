import { type ShopifyRequestContext } from "@shopify/hydrogen";
import {
  createCustomerAccountClient,
  createCustomerAccountServerHandlers,
  createCustomerSession,
  type CustomerAccountClient,
  type CustomerSession,
  type WritableCustomerSessionManager,
} from "@shopify/hydrogen/customer-account";
import { createContext } from "react-router";

import type { Env } from "~/lib/env";
import { createSessionCartHandlers } from "~/lib/cart-handlers";
import { createRequestSessionManager } from "~/lib/session";
import { shouldUseMockShop } from "~/lib/shop";

export type CustomerAccount = {
  client: CustomerAccountClient;
  session: CustomerSession;
  sessionManager: WritableCustomerSessionManager;
  requestContext: ShopifyRequestContext;
};

// `null` when Customer Accounts are unavailable (see `createRequestCustomerAccount`).
export const customerAccountContext = createContext<CustomerAccount | null>(null);

function createHandlers(shopId: string, customerAccountApiClientId: string) {
  const session = createCustomerSession({ shopId, customerAccountApiClientId });
  const cartHandlers = createSessionCartHandlers({ customerSession: session });
  const accountHandlers = createCustomerAccountServerHandlers({
    customerSession: session,
    defaultPostLoginRedirectPathname: "/account",
  });
  return { session, cartHandlers, accountHandlers };
}

// Reused across requests so concurrent token refreshes for the same customer
// share one request to Shopify.
let cached: ({ key: string } & ReturnType<typeof createHandlers>) | undefined;

/**
 * Customer Accounts need a real store, `SHOP_ID`, `PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID`,
 * `SESSION_SECRET`, and HTTPS (the OAuth callback must be an HTTPS origin).
 * Each brand site has its own client ID, so each signs in on its own origin.
 */
export async function createRequestCustomerAccount(
  request: Request,
  env: Env,
  requestContext: ShopifyRequestContext,
) {
  const {
    SHOP_ID: shopId,
    PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: customerAccountApiClientId,
    SESSION_SECRET: sessionSecret,
  } = env;
  if (shouldUseMockShop(env) || !shopId || !customerAccountApiClientId || !sessionSecret) return;
  if (new URL(request.url).protocol !== "https:") return;

  const key = `${shopId}:${customerAccountApiClientId}`;
  if (cached?.key !== key) cached = { key, ...createHandlers(shopId, customerAccountApiClientId) };

  return {
    cartHandlers: cached.cartHandlers,
    accountHandlers: cached.accountHandlers,
    customerAccount: {
      client: createCustomerAccountClient({ shopId, requestContext }),
      session: cached.session,
      sessionManager: await createRequestSessionManager(request, sessionSecret),
      requestContext,
    } satisfies CustomerAccount,
  };
}
