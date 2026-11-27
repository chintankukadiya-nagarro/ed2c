import { BRANDS, getBrand, sellsVendor, type Brand, type BrandKey, type BrandOrigins } from "@ed2c/brands";
import { createContext, useRouteLoaderData } from "react-router";

export type { Brand, BrandKey };

/**
 * The brand this deployment serves. It comes from `BRAND_KEY` in the server
 * environment, never from request input.
 */
export const brandContext = createContext<Brand>();

export function brandFromEnv(env: { BRAND_KEY?: string }): Brand {
  return getBrand(env.BRAND_KEY);
}

export type BrandClientData = {
  brand: Brand;
  origins: BrandOrigins;
};

/** The current brand in components. Root loader data carries it to the client. */
export function useBrand(): Brand {
  return useBrandData().brand;
}

export function useBrandData(): BrandClientData {
  const data = useRouteLoaderData("root") as BrandClientData | undefined;
  if (!data?.brand) throw new Error("useBrand() needs the root loader to return the brand.");
  return { brand: data.brand, origins: data.origins };
}

/** Main navigation: one "Shop" link on a brand site, one link per brand on the House site. */
export function shopLinks(brand: Brand): { to: string; label: string }[] {
  if (brand.collectionHandles.length === 1) {
    return [{ to: `/collections/${brand.collectionHandles[0]}`, label: "Shop" }];
  }
  return brand.collectionHandles.map((handle) => ({
    to: `/collections/${handle}`,
    label: Object.values(BRANDS).find((other) => other.collectionHandles.length === 1 && other.collectionHandles[0] === handle)?.name ?? handle,
  }));
}

/** The brand name for `meta` functions, read from the root route match. */
export function brandNameFromMatches(matches: readonly unknown[]): string {
  const root = matches[0] as { loaderData?: { brand?: Brand } } | undefined;
  return root?.loaderData?.brand?.name ?? "L'Oréal";
}

export function isAllowedCollectionHandle(brand: Brand, handle: string | undefined): handle is string {
  return handle != null && brand.collectionHandles.includes(handle);
}

export function emptyCatalogMessage(brand: Brand): string {
  return `No published ${brand.name} products are available on this storefront yet.`;
}

/** Shopper-facing search text with Storefront search operators removed. */
export function literalSearchTerm(input: string): string {
  return input
    .replace(/["']/g, " ")
    .replace(/\b(?:AND|OR|NOT)\b/gi, " ")
    .replace(/[\w.]+\s*:/g, " ")
    .replace(/[()*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type VendorScopedFilter = { productVendor?: string | null };

/**
 * Pins a filter list to the brand's vendors. The Storefront API ORs filters of
 * the same type, so the House site can list several vendors. A shopper's vendor
 * facet is kept only when it names one of those vendors.
 */
export function withBrandVendorFilter<T extends VendorScopedFilter>(brand: Brand, filters: readonly T[]): T[] {
  const others = filters.filter((filter) => filter.productVendor == null);
  const chosen = filters.flatMap((filter) =>
    filter.productVendor != null && brand.vendors.includes(filter.productVendor) ? [filter.productVendor] : [],
  );
  const vendors = chosen.length > 0 ? chosen : brand.vendors;
  return [...others, ...vendors.map((vendor) => ({ productVendor: vendor }) as T)];
}

/** Brand sites sell one vendor, so the vendor facet only shows on the House site. */
export function presentFacets<T extends { id?: string | null; label?: string | null }>(
  brand: Brand,
  filters: readonly T[],
): T[] {
  if (brand.vendors.length > 1) return [...filters];
  return filters.filter((filter) => {
    const id = filter.id?.toLowerCase() ?? "";
    const label = filter.label?.toLowerCase() ?? "";
    return !id.includes("vendor") && label !== "vendor";
  });
}

type BrandProduct = { vendor?: string | null };
type BrandPageInfo = { hasNextPage: boolean; endCursor: string | null };

/**
 * Keeps a server-filtered page only when every product belongs to the brand.
 * A single mismatch means the query was not actually brand-scoped, so the
 * page is discarded instead of trimmed into a fake complete result.
 */
export function presentBrandCatalog<T extends BrandProduct>(
  brand: Brand,
  products: readonly T[],
  pageInfo: BrandPageInfo,
  totalCount: number,
): { products: T[]; pageInfo: BrandPageInfo; totalCount: number } {
  if (products.some((product) => !sellsVendor(brand, product.vendor))) {
    return { products: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0 };
  }
  return { products: [...products], pageInfo, totalCount };
}

/** Product filters for the brand's vendors, for queries that take `[ProductFilter!]`. */
export function vendorFilters(brand: Brand): { productVendor: string }[] {
  return brand.vendors.map((vendor) => ({ productVendor: vendor }));
}
