import { BRAND_KEYS, BRANDS, brandOrigins } from "@ed2c/brands";
import { handleShopifyRedirects, handleShopifyRoutes } from "@shopify/hydrogen";
import { ShopifyScripts } from "@shopify/hydrogen/react";
import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigate,
  useRouteLoaderData,
} from "react-router";

import { CartAnalyticsTracker, PageViewedTracker } from "~/components/AnalyticsTrackers";
import { BrandBar, type BrandBarLink } from "~/components/BrandBar";
import { AnnouncementBar } from "~/components/AnnouncementBar";
import { CartFocusRefresh } from "~/components/CartFocusRefresh";
import { CartDrawer } from "~/components/CartDrawer";
import { Footer } from "~/components/Footer";
import { Header } from "~/components/Header";
import { SearchDrawer } from "~/components/SearchDrawer";
import { StandardActionsBoot } from "~/components/StandardActionsBoot";
import { brandContext, brandFromEnv, type Brand } from "~/lib/brand";
import { CartProvider } from "~/lib/cart";
import { cartLoaderContext, guestCartHandlers } from "~/lib/cart-handlers";
import { createRequestCustomerAccount, customerAccountContext } from "~/lib/customer-account";
import { envContext } from "~/lib/env";
import { sharedCartIdentity } from "~/lib/shared-cart";
import { endSilentSignIn, handlePlatformRoute } from "~/lib/platform-routes";
import { createPredictiveSearchHandlers } from "~/lib/predictive-search-handlers";
import { loadRootLayout } from "~/lib/root-layout";
import { routeTemplates } from "~/lib/route-templates";
import { createEphemeralSessionManager } from "~/lib/session";
import { analyticsConsent, resolveShopIdentity, storefrontConfig } from "~/lib/shop";
import {
  createCartStorefrontClient,
  createRequestStorefrontClient,
  storefrontClientContext,
  storefrontRequestContext,
} from "~/lib/storefront";

import type { Route } from "./+types/root";

import appStylesHref from "./app.css?url";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: appStylesHref },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

export const middleware: Route.MiddlewareFunction[] = [
  async ({ context, request }, next) => {
    const env = context.get(envContext);
    const brand = brandFromEnv(env);
    const storefrontClient = createRequestStorefrontClient(request, env, context.cache, context.waitUntil);
    const cartClient = createCartStorefrontClient(request, env, context.cache, context.waitUntil);
    const requestContext = storefrontClient.requestContext;
    const customerAccount = await createRequestCustomerAccount(request, env, requestContext);
    const sessionManager =
      customerAccount?.customerAccount.sessionManager ?? createEphemeralSessionManager(request);

    const platformRoute = await handlePlatformRoute({
      request,
      env,
      brand,
      origins: brandOrigins(env),
      sessionManager,
      requestContext,
      customerSession: customerAccount?.customerAccount.session ?? null,
    });
    if (platformRoute) return platformRoute;

    const cartHandlers = customerAccount?.cartHandlers ?? guestCartHandlers;
    const shopifyRoute = await handleShopifyRoutes({
      request,
      requestContext: cartClient.requestContext,
      sessionManager,
      storefrontClient: cartClient,
      routeTemplates,
      handlers: customerAccount
        ? [cartHandlers, createPredictiveSearchHandlers(brand), customerAccount.accountHandlers]
        : [cartHandlers, createPredictiveSearchHandlers(brand)],
    });

    if (shopifyRoute) {
      if (new URL(request.url).pathname === "/account/authorize") endSilentSignIn(request, shopifyRoute);
      return shopifyRoute;
    }

    context.set(brandContext, brand);
    context.set(
      cartLoaderContext,
      customerAccount
        ? () =>
            customerAccount.cartHandlers.get({
              request,
              storefrontClient: cartClient,
              sessionManager,
              requestContext: cartClient.requestContext,
            })
        : () => guestCartHandlers.get({ request, storefrontClient: cartClient }),
    );
    context.set(storefrontClientContext, storefrontClient);
    context.set(storefrontRequestContext, requestContext);
    context.set(customerAccountContext, customerAccount?.customerAccount ?? null);

    const response = await next();
    const sessionHeaders = new Headers((await sessionManager.commit?.()) ?? undefined);
    for (const [name, value] of sessionHeaders) response.headers.append(name, value);
    if (response.status === 404) {
      const redirect = await handleShopifyRedirects({ request, storefrontClient, routeTemplates });
      if (redirect) return redirect;
    }

    requestContext.applyResponseHeaders(response.headers);
    return response;
  },
];

export async function loader({ context }: Route.LoaderArgs) {
  const env = context.get(envContext);
  const brand = context.get(brandContext);
  const storefrontClient = context.get(storefrontClientContext);
  const customerAccount = context.get(customerAccountContext);

  const [cart, layout, signedIn] = await Promise.all([
    context.get(cartLoaderContext)(),
    loadRootLayout(storefrontClient),
    customerAccount
      ? customerAccount.session.isLoggedIn(customerAccount.sessionManager, customerAccount.requestContext)
      : false,
  ]);

  return {
    brand,
    origins: brandOrigins(env),
    sharedCart: sharedCartIdentity(env) !== null,
    signedIn,
    cartData: cart.data,
    shopInfo: layout.shopInfo,
    shopIdentity: resolveShopIdentity(env, layout.shopId || env.SHOP_ID || ""),
    currency: layout.currency,
  };
}

/** Brand switches land on the other site's home page, or its bag when the shopper is in the bag. */
function brandBarLinks(brand: Brand, pathname: string): BrandBarLink[] {
  const to = pathname === "/cart" ? "/cart" : "/";
  return BRAND_KEYS.map((key) => ({
    key,
    name: BRANDS[key].name,
    href: key === brand.key ? "/" : `/go/${key}?to=${encodeURIComponent(to)}`,
    active: key === brand.key,
  }));
}

function SiteBrandBar({ brand }: { brand: Brand }) {
  const { pathname } = useLocation();
  return <BrandBar links={brandBarLinks(brand, pathname)} message={brand.announcement} />;
}

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  // Absent when the root loader failed (error page only).
  const rootData = useRouteLoaderData<typeof loader>("root");

  return (
    <html lang="en" data-brand={rootData?.brand.key} data-cart-scope={rootData?.sharedCart ? "shared" : "brand"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {rootData ? (
          <StandardActionsBoot />
        ) : null}
        {rootData ? (
          <ShopifyScripts
            i18n={{ ...storefrontConfig.i18n, currency: rootData.currency }}
            shop={rootData.shopIdentity.scriptShop}
            analytics={{ channel: rootData.shopIdentity.analyticsShop.channel }}
            shopifyAnalytics={rootData.shopIdentity.shopifyAnalytics}
            consent={analyticsConsent}
            navigate={navigate}
            routes={routeTemplates}
          />
        ) : null}
        <Meta />
        <Links />
      </head>
      <body className="bg-surface text-on-surface font-body flex min-h-svh flex-col antialiased">
        <a
          href="#main-content"
          className="focus-visible:bg-interactive focus-visible:text-interactive-text sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded focus-visible:px-4 focus-visible:py-2"
        >
          Skip to content
        </a>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <CartProvider initialData={loaderData.cartData}>
      <CartFocusRefresh />
      <PageViewedTracker />
      <CartAnalyticsTracker />
      <div className="sticky top-0 z-40">
        <SiteBrandBar brand={loaderData.brand} />
        <AnnouncementBar />
        <Header />
      </div>
      <Outlet />
      <Footer shopInfo={loaderData.shopInfo} />
      <CartDrawer />
      <SearchDrawer />
    </CartProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details = error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  const rootData = useRouteLoaderData<typeof loader>("root");

  return (
    <>
      {rootData ? (
        <div className="sticky top-0 z-40">
          <SiteBrandBar brand={rootData.brand} />
        </div>
      ) : null}
      <main id="main-content" tabIndex={-1} className="max-w-page px-margin mx-auto w-full flex-1 py-12">
        <h1 className="type-display text-on-surface">{message}</h1>
        <p className="text-on-surface-secondary mt-4">{details}</p>
        {stack ? (
          <pre className="border-border mt-6 w-full overflow-x-auto rounded border p-4 text-sm">
            <code>{stack}</code>
          </pre>
        ) : null}
      </main>
    </>
  );
}
