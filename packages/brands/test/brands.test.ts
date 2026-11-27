import { describe, expect, it } from "vitest";

import {
  BRANDS,
  brandForVendor,
  brandOrigins,
  getBrand,
  sellsVendor,
} from "../src";

describe("brand config", () => {
  it("throws on a missing BRAND_KEY", () => {
    expect(() => getBrand(undefined)).toThrow(/BRAND_KEY/);
  });

  it("maps a vendor to its single-brand site", () => {
    expect(brandForVendor("La Roche-Posay")).toBe("laroche-posay");
    expect(brandForVendor("Kérastase")).toBe("kerastase");
    expect(brandForVendor("Unknown")).toBeNull();
  });

  it("lets the House site sell every brand", () => {
    const house = BRANDS.house;
    expect(sellsVendor(house, "La Roche-Posay")).toBe(true);
    expect(sellsVendor(house, "Kérastase")).toBe(true);
    expect(sellsVendor(BRANDS.kerastase, "La Roche-Posay")).toBe(false);
  });

  it("falls back to local origins when deployed URLs are empty", () => {
    const origins = brandOrigins({});
    expect(origins.house).toBe("https://127.0.0.2:5175");
    expect(origins["laroche-posay"]).toBe("https://local.tryhydrogen.dev:5173");
    expect(origins.kerastase).toBe("https://127.0.0.1:5174");
  });

  it("reads PUBLIC_HOME_URL for the House site", () => {
    const origins = brandOrigins({ PUBLIC_HOME_URL: "https://house.example.com" });
    expect(origins.house).toBe("https://house.example.com");
  });
});
