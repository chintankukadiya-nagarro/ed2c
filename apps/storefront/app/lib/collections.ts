import { gql } from "@shopify/hydrogen";
import type { StorefrontClient } from "@shopify/hydrogen";

import { COLLECTION_CARD_FRAGMENT } from "~/components/CollectionCard";
import { vendorFilters, type Brand } from "~/lib/brand";

export const COLLECTIONS_QUERY = gql(
  `
    query BrandCollection($handle: String!, $vendorFilters: [ProductFilter!]) {
      collection(handle: $handle) {
        ...CollectionCard
      }
    }
  `,
  [COLLECTION_CARD_FRAGMENT],
);

/** The brand collections this site may show. The House site shows every brand's collection. */
export async function loadBrandCollections(brand: Brand, storefrontClient: StorefrontClient) {
  const results = await Promise.all(
    brand.collectionHandles.map((handle) =>
      storefrontClient.graphql(COLLECTIONS_QUERY, {
        variables: { handle, vendorFilters: vendorFilters(brand) },
      }),
    ),
  );
  return results.flatMap(({ data }) => (data?.collection ? [data.collection] : []));
}

export async function loadCollectionsPage({
  brand,
  storefrontClient,
  request,
}: {
  brand: Brand;
  storefrontClient: StorefrontClient;
  request: Request;
}) {
  const nodes = await loadBrandCollections(brand, storefrontClient);
  return {
    collections: { nodes, pageInfo: { hasNextPage: false, endCursor: null } },
    origin: new URL(request.url).origin,
  };
}
