/** House Hydrogen storefront. Carts are scoped to this identity on every brand site. */
export const HOUSE_STOREFRONT_ID = "1000186105";

function strip(value: string | undefined): string {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

export function sharedCartIdentity(env: {
  SHARED_CART_STOREFRONT_ID?: string;
  SHARED_CART_PRIVATE_STOREFRONT_API_TOKEN?: string;
}): { storefrontId: string; token: string } | null {
  const token = strip(env.SHARED_CART_PRIVATE_STOREFRONT_API_TOKEN);
  if (!token) return null;
  return { storefrontId: strip(env.SHARED_CART_STOREFRONT_ID) || HOUSE_STOREFRONT_ID, token };
}
