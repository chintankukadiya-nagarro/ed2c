import path from "node:path";
import { fileURLToPath } from "node:url";

import { BRANDS, isBrandKey } from "@ed2c/brands";
import { reactRouter } from "@react-router/dev/vite";
import { localHttps } from "@shopify/hydrogen/vite";
import { oxygen } from "@shopify/mini-oxygen/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");

export default defineConfig(({ command, mode }) => {
  const oxygenPlugins = oxygen();
  const oxygenPlugin = oxygenPlugins.find((plugin) => plugin.name === "oxygen:main");
  if (!oxygenPlugin?.api) throw new Error("MiniOxygen plugin API is unavailable.");

  // MiniOxygen infers the compatibility date 2026-10-01 from Hydrogen 2026.10.x, but its
  // runtime doesn't support that date yet. Remove this override once it does.
  oxygenPlugin.api.registerPluginOptions({ compatibilityDate: "2026-04-01" });

  // `vite dev --mode <brand>` loads `.env.<brand>` and serves that brand on its own host.
  const brand = isBrandKey(mode) ? BRANDS[mode] : null;
  if (command === "serve" && !brand) {
    throw new Error("Start the dev server with --mode house, --mode laroche-posay, or --mode kerastase.");
  }
  const origin = brand ? new URL(brand.localOrigin) : null;

  return {
    plugins: [
      localHttps({
        enabled: command === "serve" && origin !== null,
        host: origin?.hostname,
        port: origin ? Number(origin.port) : undefined,
      }),
      tailwindcss(),
      ...oxygenPlugins,
      reactRouter(),
    ],
    resolve: {
      tsconfigPaths: true,
      alias: {
        "~": path.resolve(appDir, "app"),
        "@ed2c/brands": path.resolve(repoRoot, "packages/brands/src/index.ts"),
        "@ed2c/commerce": path.resolve(repoRoot, "packages/commerce/src/index.ts"),
      },
    },
    cacheDir: path.resolve(appDir, `node_modules/.vite/${mode}`),
    build: {
      // Allow a strict Content-Security-Policy without inlining assets as base64.
      assetsInlineLimit: 0,
    },
    ssr: {
      noExternal: [/^@ed2c\//],
      optimizeDeps: {
        include: [
          "react",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "react-dom",
          "react-dom/server",
          "react-router > set-cookie-parser",
          "react-router > cookie",
          "react-router",
        ],
      },
    },
    server: {
      allowedHosts: [".tryhydrogen.dev", "127.0.0.1", "127.0.0.2"],
      fs: { allow: [repoRoot] },
    },
  };
});
