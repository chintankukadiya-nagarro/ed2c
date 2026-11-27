import { createContext } from "react-router";

export type Env = {
  /** Which site this deployment serves: house, laroche-posay, or kerastase. */
  BRAND_KEY?: string;
  MOCK_SHOP?: string;
  PRIVATE_STOREFRONT_API_TOKEN?: string;
  PUBLIC_CHECKOUT_DOMAIN?: string;
  PUBLIC_STORE_DOMAIN?: string;
  PUBLIC_STOREFRONT_ID?: string;
  /** House Storefront API identity — carts are scoped to this, not to each brand. */
  SHARED_CART_STOREFRONT_ID?: string;
  SHARED_CART_PRIVATE_STOREFRONT_API_TOKEN?: string;
  PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID?: string;
  SESSION_SECRET?: string;
  SHOP_ID?: string;
  /** Shared by all three sites. Signs the links that move a shopper between them. */
  HANDOFF_SECRET?: string;
  PUBLIC_HOUSE_URL?: string;
  PUBLIC_LA_ROCHE_POSAY_URL?: string;
  PUBLIC_KERASTASE_URL?: string;
};

export const envContext = createContext<Env>();
