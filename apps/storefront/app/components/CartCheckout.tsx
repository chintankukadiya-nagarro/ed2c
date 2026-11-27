import { ShopPayButton } from "@shopify/hydrogen/react";

const buttonClass =
  "rounded-button button-primary focus-visible:outline-accent inline-flex h-11 w-full items-center justify-center gap-2 px-4 text-sm font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97]";

/** One Shopify checkout for the whole bag, whichever brands it holds. */
export function CartCheckout({ checkoutUrl }: { checkoutUrl?: string | null }) {
  if (!checkoutUrl) return null;

  return (
    <div className="grid gap-3">
      <ShopPayButton width="100%" borderRadius="8px" />
      <a href={checkoutUrl} className={buttonClass} data-testid="checkout">
        Checkout
      </a>
    </div>
  );
}
