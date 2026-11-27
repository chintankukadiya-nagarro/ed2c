import {
  addedLinesMissingFromCart,
  jsonAddLines,
  linesForRebuiltCart,
} from "@ed2c/commerce";
import {
  cartQueries,
  createCartCookie,
  createCartServerHandlers,
  type CartServerHandlers,
} from "@shopify/hydrogen";
import { createContext } from "react-router";

/**
 * One cart for every brand. The cart lives at store level, so the `cart`
 * cookie that moves with a handoff opens the same bag on each site.
 */
export type CartHandlers = CartServerHandlers<typeof cartQueries.cart>;

function withSilentAddRecovery(handlers: CartHandlers): CartHandlers {
  const post: CartHandlers["post"] = Object.assign(
    async (context: Parameters<CartHandlers["post"]>[0]) => {
      const preview = context.request.clone();
      const result = await handlers.post(context);
      if (result.type !== "json") return result;
      if (!preview.headers.get("content-type")?.includes("application/json")) return result;

      let body: unknown;
      try {
        body = await preview.json();
      } catch {
        return result;
      }

      const adds = jsonAddLines(body);
      if (!adds) return result;

      const cart = (result.data as { cart?: Parameters<typeof addedLinesMissingFromCart>[1] }).cart;
      if (addedLinesMissingFromCart(adds, cart ?? null).length === 0) return result;

      const created = await context.storefrontClient.graphql(cartQueries.cartCreate, {
        variables: { input: { lines: linesForRebuiltCart(cart ?? null, adds) } },
      });
      const payload = created.data?.cartCreate;
      const rebuilt = payload?.cart;
      if (!rebuilt?.id) return result;

      const headers = new Headers(result.headers);
      headers.append("set-cookie", createCartCookie(rebuilt.id));
      return {
        ...result,
        data: {
          cart: rebuilt,
          userErrors: payload?.userErrors ?? [],
          warnings: payload?.warnings ?? [],
        },
        headers,
      };
    },
    { pathname: handlers.post.pathname, method: handlers.post.method },
  );

  return { ...handlers, post };
}

/** Cart handlers for requests without Customer Accounts (plain HTTP or a mock shop). */
export const guestCartHandlers = withSilentAddRecovery(createCartServerHandlers());

export function createSessionCartHandlers(
  ...args: Parameters<typeof createCartServerHandlers>
): CartHandlers {
  return withSilentAddRecovery(createCartServerHandlers(...args));
}

export type CartLoader = () => ReturnType<CartHandlers["get"]>;

/** Loads the cart with the handlers the middleware picked for this request. */
export const cartLoaderContext = createContext<CartLoader>();
