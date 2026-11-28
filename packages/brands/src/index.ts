export const BRAND_KEYS = ["house", "laroche-posay", "kerastase"] as const;

export type BrandKey = (typeof BRAND_KEYS)[number];

export type Brand = {
  key: BrandKey;
  name: string;
  /** Exact Storefront API vendor values this site sells. The House site sells every brand. */
  vendors: readonly string[];
  /** Brand collection handles this site may browse. */
  collectionHandles: readonly string[];
  tagline: string;
  announcement: string;
  /** Env variable holding the deployed origin, for example https://lrp.example.com. */
  originEnv: "PUBLIC_HOME_URL" | "PUBLIC_LA_ROCHE_POSAY_URL" | "PUBLIC_KERASTASE_URL";
  /** Local dev origin. Each site needs its own host, because cookies ignore the port. */
  localOrigin: string;
};

const LA_ROCHE_POSAY = "La Roche-Posay";
const KERASTASE = "Kérastase";

export const BRANDS: Record<BrandKey, Brand> = {
  house: {
    key: "house",
    name: "The House",
    vendors: [LA_ROCHE_POSAY, KERASTASE],
    collectionHandles: ["la-roche-posay", "kerastase"],
    tagline: "Every L'Oréal brand, one bag and one checkout.",
    announcement: "One bag across every brand. Free delivery over Rs. 999.",
    originEnv: "PUBLIC_HOME_URL",
    localOrigin: "https://127.0.0.2:5175",
  },
  "laroche-posay": {
    key: "laroche-posay",
    name: LA_ROCHE_POSAY,
    vendors: [LA_ROCHE_POSAY],
    collectionHandles: ["la-roche-posay"],
    tagline: "Dermatologist-developed skincare for sensitive skin.",
    announcement: "2 complimentary samples with every La Roche-Posay order.",
    originEnv: "PUBLIC_LA_ROCHE_POSAY_URL",
    localOrigin: "https://local.tryhydrogen.dev:5173",
  },
  kerastase: {
    key: "kerastase",
    name: KERASTASE,
    vendors: [KERASTASE],
    collectionHandles: ["kerastase"],
    tagline: "Professional haircare, from the salon to your home.",
    announcement: "Complimentary hair diagnosis with every Kérastase order.",
    originEnv: "PUBLIC_KERASTASE_URL",
    localOrigin: "https://127.0.0.1:5174",
  },
};

export function isBrandKey(value: unknown): value is BrandKey {
  return typeof value === "string" && (BRAND_KEYS as readonly string[]).includes(value);
}

export function getBrand(key: string | undefined): Brand {
  if (!isBrandKey(key)) {
    throw new Error(`BRAND_KEY must be one of ${BRAND_KEYS.join(", ")}. Received: ${key ?? "(unset)"}`);
  }
  return BRANDS[key];
}

export type BrandOrigins = Record<BrandKey, string>;

type OriginEnv = Partial<Record<Brand["originEnv"], string>>;

/** Origins of every site. Deployed origins come from env; local ones are the fallback. */
export function brandOrigins(env: OriginEnv = {}): BrandOrigins {
  const origins = {} as BrandOrigins;
  for (const key of BRAND_KEYS) {
    const brand = BRANDS[key];
    origins[key] = parseOrigin(env[brand.originEnv]) ?? brand.localOrigin;
  }
  return origins;
}

/** True for MiniOxygen / loopback hosts used only in local demo. */
export function isLocalDemoOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "local.tryhydrogen.dev" ||
      hostname.startsWith("127.")
    );
  } catch {
    return true;
  }
}

/** Env var to set when a brand origin is still the local fallback. */
export function undeployedOriginEnv(env: OriginEnv, key: BrandKey): Brand["originEnv"] | null {
  return isLocalDemoOrigin(brandOrigins(env)[key]) ? BRANDS[key].originEnv : null;
}

/** The brand that owns an origin, or null for an origin outside the platform. */
export function brandForOrigin(origin: string, origins: BrandOrigins): BrandKey | null {
  return BRAND_KEYS.find((key) => origins[key] === origin) ?? null;
}

function parseOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** The single-brand site that sells a vendor, or null when only the House site does. */
export function brandForVendor(vendor: string | null | undefined): BrandKey | null {
  return BRAND_KEYS.find((key) => BRANDS[key].vendors.length === 1 && BRANDS[key].vendors[0] === vendor) ?? null;
}

/** True when the product vendor belongs to this site. */
export function sellsVendor(brand: Brand, vendor: string | null | undefined): boolean {
  return typeof vendor === "string" && brand.vendors.includes(vendor);
}
