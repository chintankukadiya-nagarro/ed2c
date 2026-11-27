import { useEffect } from "react";

import { publishCartViewed } from "~/components/AnalyticsTrackers";
import { CartCheckout } from "~/components/CartCheckout";
import { GroupedCartLines } from "~/components/CartDrawer";
import { useCart } from "~/lib/cart";
import { formatPrice } from "~/lib/money";
import { formatPageTitle, getShopNameFromRootMatch } from "~/lib/storefront-shop";

import type { Route } from "./+types/cart";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: formatPageTitle("Cart", getShopNameFromRootMatch(matches[0])) }];
}

export default function CartRoute() {
  const cart = useCart((state) => state.data);
  const loading = useCart((state) => state.loading);
  const lines = cart?.lines.nodes ?? [];

  useEffect(() => {
    publishCartViewed(cart);
  }, [cart]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="max-w-page px-margin mx-auto w-full flex-1 py-12"
    >
      <h1 id="cart-page-title" tabIndex={-1} className="type-display text-on-surface mb-2">
        Your bag
      </h1>
      <p className="text-on-surface-secondary mb-8 text-sm">
        One bag across every L&apos;Oréal brand site, paid in a single checkout.
      </p>
      {loading ? <p className="text-on-surface-secondary">Loading cart…</p> : null}
      {!loading && lines.length === 0 ? (
        <div>
          <p className="text-on-surface font-medium">Your bag is empty.</p>
          <p className="text-on-surface-secondary mt-2 text-sm">
            Looks like you haven&apos;t added anything yet.
          </p>
        </div>
      ) : null}
      {lines.length > 0 ? (
        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          <GroupedCartLines lines={lines} emptyCartFocusId="cart-page-title" />
          <aside className="border-border h-fit rounded border p-4" aria-label="Cart summary">
            <div className="flex items-center justify-between">
              <span className="text-on-surface text-sm font-medium">Estimated total</span>
              <span className="text-on-surface text-base font-medium">
                {formatPrice(cart.cost.totalAmount)}
              </span>
            </div>
            <p className="text-on-surface-secondary mt-3 text-xs">
              Taxes and shipping calculated at checkout
            </p>
            <div className="mt-4">
              <CartCheckout checkoutUrl={cart.checkoutUrl} />
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
