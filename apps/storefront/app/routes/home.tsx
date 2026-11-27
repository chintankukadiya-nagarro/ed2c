import { gql } from "@shopify/hydrogen";
import { Link } from "react-router";

import {
  COLLECTION_CARD_FRAGMENT,
  CollectionCard,
  type CollectionCardData,
} from "~/components/CollectionCard";
import { HomeHero } from "~/components/HomeHero";
import { PRODUCT_CARD_FRAGMENT, ProductCard, type ProductCardData } from "~/components/ProductCard";
import {
  brandContext,
  brandNameFromMatches,
  emptyCatalogMessage,
  presentBrandCatalog,
  useBrand,
  vendorFilters,
} from "~/lib/brand";
import { selectHomeHero } from "~/lib/home-hero";
import { storefrontClientContext } from "~/lib/storefront";
import { formatPageTitle } from "~/lib/storefront-shop";

import type { Route } from "./+types/home";

const FEATURED_PRODUCT_COUNT = 8;

export const HOME_QUERY = gql(
  `
    query Home($handle: String!, $vendorFilters: [ProductFilter!]) {
      brandCollection: collection(handle: $handle) {
        ...CollectionCard
        title
        handle
        description
        image {
          url
          altText
        }
        brandProducts: products(first: 8, filters: $vendorFilters) {
          nodes {
            ...ProductCard
            featuredImage {
              url
              altText
            }
          }
        }
      }
    }
  `,
  [PRODUCT_CARD_FRAGMENT, COLLECTION_CARD_FRAGMENT],
);

export function meta({ matches }: Route.MetaArgs) {
  const name = brandNameFromMatches(matches);
  return [
    { title: formatPageTitle("Home", name) },
    {
      name: "description",
      content: `Shop ${name} products. This demonstration storefront is not an official L'Oréal website.`,
    },
  ];
}

/** Takes products from each list in turn, so the House site mixes brands. */
function interleave<T>(lists: readonly (readonly T[])[], limit: number): T[] {
  const result: T[] = [];
  for (let index = 0; result.length < limit; index++) {
    const row = lists.flatMap((list) => (index < list.length ? [list[index]!] : []));
    if (row.length === 0) break;
    result.push(...row);
  }
  return result.slice(0, limit);
}

export async function loader({ context }: Route.LoaderArgs) {
  const brand = context.get(brandContext);
  const storefrontClient = context.get(storefrontClientContext);
  const results = await Promise.all(
    brand.collectionHandles.map((handle) =>
      storefrontClient.graphql(HOME_QUERY, { variables: { handle, vendorFilters: vendorFilters(brand) } }),
    ),
  );
  const collections = results.flatMap(({ data }) => (data?.brandCollection ? [data.brandCollection] : []));

  const products = interleave(
    collections.map((collection) => collection.brandProducts.nodes),
    FEATURED_PRODUCT_COUNT,
  );
  const scoped = presentBrandCatalog(brand, products, { hasNextPage: false, endCursor: null }, products.length);

  const featuredProducts: ProductCardData[] = scoped.products;
  const featuredCollections: CollectionCardData[] = collections;

  return { featuredProducts, featuredCollections, heroCollections: collections };
}

function NewArrivals({ products }: { products: readonly ProductCardData[] }) {
  const brand = useBrand();
  const collectionsHref =
    brand.collectionHandles.length === 1 ? `/collections/${brand.collectionHandles[0]}` : "/collections";

  return (
    <section className="bg-surface w-full pt-20 pb-12" aria-labelledby="new-arrivals-heading">
      <div className="max-w-page px-margin mx-auto mb-4 flex items-center justify-between gap-4">
        <h2 id="new-arrivals-heading" className="type-heading-xl">
          New arrivals
        </h2>
        <Link
          to={collectionsHref}
          className="min-h-touch-target text-on-surface focus-visible:outline-accent inline-flex items-center gap-1 rounded-sm text-sm font-normal no-underline hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-opacity"
        >
          <span>Collections</span>
          <span
            className="inline-flex size-4 shrink-0 items-center justify-center"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
        </Link>
      </div>

      {products.length > 0 ? (
        <div className="max-w-page px-margin mx-auto contain-paint">
          <ul
            role="list"
            className="grid grid-cols-1 gap-x-1 gap-y-10 md:grid-cols-2 lg:grid-cols-4"
          >
            {products.map((product) => (
              <li key={product.handle}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="max-w-page px-margin mx-auto">
          <div className="border-border bg-surface-secondary rounded-card border p-8 text-center">
            <h3 className="type-heading-md text-on-surface">Nothing to show yet</h3>
            <p className="text-on-surface-secondary mt-2 text-sm">{emptyCatalogMessage(brand)}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function ShopByCategory({ collections }: { collections: readonly CollectionCardData[] }) {
  const brand = useBrand();
  return (
    <section className="w-full py-12" aria-labelledby="category-heading">
      <h2 id="category-heading" className="type-heading-xl max-w-page px-margin mx-auto mb-4">
        {brand.vendors.length > 1 ? "Shop by brand" : "Shop by category"}
      </h2>
      {collections.length > 0 ? (
        <ul role="list" className="max-w-page px-margin mx-auto grid grid-cols-1 md:grid-cols-3">
          {collections.map((collection) => (
            <li key={collection.handle}>
              <CollectionCard collection={collection} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="max-w-page px-margin mx-auto">
          <p className="text-on-surface-secondary text-sm">{emptyCatalogMessage(brand)}</p>
        </div>
      )}
    </section>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const brand = useBrand();
  const collectionHero = selectHomeHero(loaderData.heroCollections, brand.name);
  const hero =
    brand.vendors.length > 1
      ? { ...collectionHero, heading: brand.name, description: brand.tagline, to: "/collections" }
      : collectionHero;

  return (
    <main className="flex-1" id="main-content" tabIndex={-1}>
      <HomeHero hero={hero} />
      <NewArrivals products={loaderData.featuredProducts} />
      <ShopByCategory collections={loaderData.featuredCollections} />
    </main>
  );
}
