import type { CartDataFromHandlers } from "@shopify/hydrogen";
import { createCartComponents } from "@shopify/hydrogen/react";

import type { CartHandlers } from "~/lib/cart-handlers";

export type CartData = CartDataFromHandlers<CartHandlers>;

export const { CartProvider, useCart, useCartActions, useCartForm } = createCartComponents<CartHandlers>();
