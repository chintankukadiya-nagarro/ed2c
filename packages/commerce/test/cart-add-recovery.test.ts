import { describe, expect, it } from "vitest";

import {
  addedLinesMissingFromCart,
  jsonAddLines,
  linesForRebuiltCart,
} from "../src/cart-add-recovery";

const MASK = "gid://shopify/ProductVariant/68391371276608";
const LRP = "gid://shopify/ProductVariant/68392807366976";

describe("jsonAddLines", () => {
  it("reads merchandise-only lines as adds", () => {
    expect(jsonAddLines({ lines: [{ merchandiseId: MASK, quantity: 1 }] })).toEqual([
      { merchandiseId: MASK, quantity: 1 },
    ]);
  });

  it("ignores updates that already have a line id", () => {
    expect(jsonAddLines({ lines: [{ id: "gid://shopify/CartLine/1", merchandiseId: MASK, quantity: 2 }] })).toBeNull();
  });
});

describe("addedLinesMissingFromCart", () => {
  it("returns the add when Shopify leaves the cart unchanged", () => {
    const cart = {
      lines: { nodes: [{ quantity: 2, merchandise: { id: LRP } }] },
    };
    expect(addedLinesMissingFromCart([{ merchandiseId: MASK, quantity: 1 }], cart)).toEqual([
      { merchandiseId: MASK, quantity: 1 },
    ]);
  });

  it("returns nothing when the add is already in the cart", () => {
    const cart = {
      lines: { nodes: [{ quantity: 1, merchandise: { id: MASK } }] },
    };
    expect(addedLinesMissingFromCart([{ merchandiseId: MASK, quantity: 1 }], cart)).toEqual([]);
  });
});

describe("linesForRebuiltCart", () => {
  it("keeps existing lines and appends the dropped add", () => {
    const cart = {
      lines: { nodes: [{ quantity: 2, merchandise: { id: LRP } }] },
    };
    expect(linesForRebuiltCart(cart, [{ merchandiseId: MASK, quantity: 1 }])).toEqual([
      { merchandiseId: LRP, quantity: 2 },
      { merchandiseId: MASK, quantity: 1 },
    ]);
  });
});
