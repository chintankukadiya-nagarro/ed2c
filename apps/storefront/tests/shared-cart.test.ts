import { describe, expect, it } from "vitest";

import { sharedCartIdentity } from "~/lib/shared-cart";

describe("sharedCartIdentity", () => {
  it("uses House storefront 1000186105 when only the shared token is set", () => {
    expect(
      sharedCartIdentity({
        SHARED_CART_PRIVATE_STOREFRONT_API_TOKEN: "shared-private-token-for-tests",
      }),
    ).toEqual({
      storefrontId: "1000186105",
      token: "shared-private-token-for-tests",
    });
  });

  it("is inactive without a shared token so a brand cart cannot be mistaken for the bag", () => {
    expect(sharedCartIdentity({ SHARED_CART_STOREFRONT_ID: "1000186105" })).toBeNull();
  });
});
