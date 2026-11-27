// Builds apps/storefront/.env.<brand> from each old demo app's .env.
// Copies store and storefront values only; makes new session secrets and one shared handoff secret.
// Prints key names, never values. Existing files are left alone unless --force is passed.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const legacy = path.resolve(root, "..");
const force = process.argv.includes("--force");

const SOURCES = {
  house: "nagarro-salon-home",
  "laroche-posay": "laroche-posay",
  kerastase: "kerastase",
};

const COPIED = [
  "PUBLIC_STORE_DOMAIN",
  "PUBLIC_CHECKOUT_DOMAIN",
  "PUBLIC_STOREFRONT_ID",
  "PUBLIC_STOREFRONT_API_TOKEN",
  "PRIVATE_STOREFRONT_API_TOKEN",
  "PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID",
  "PUBLIC_CUSTOMER_ACCOUNT_API_URL",
  "SHOP_ID",
];

function parse(file) {
  const values = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

const secret = () => randomBytes(32).toString("base64url");
const handoffSecret = secret();

for (const [brand, folder] of Object.entries(SOURCES)) {
  const target = path.join(root, "apps", "storefront", `.env.${brand}`);
  if (existsSync(target) && !force) {
    console.log(`${path.basename(target)}: exists, skipped`);
    continue;
  }
  const source = parse(path.join(legacy, folder, ".env"));
  const lines = [`BRAND_KEY=${brand}`];
  const missing = [];
  for (const key of COPIED) {
    if (source[key]) lines.push(`${key}=${source[key]}`);
    else missing.push(key);
  }
  lines.push(`SESSION_SECRET=${secret()}`, `HANDOFF_SECRET=${handoffSecret}`);
  writeFileSync(target, `${lines.join("\n")}\n`, { mode: 0o600 });
  console.log(`${path.basename(target)}: written${missing.length ? `, missing ${missing.join(", ")}` : ""}`);
}
