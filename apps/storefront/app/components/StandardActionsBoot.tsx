import { useEffect } from "react";

const SRC = "https://cdn.shopify.com/storefront/standard-actions.js";
const ID = "shopify-standard-actions";

declare global {
  interface Window {
    Shopify?: { actions?: { updateCart?: unknown } };
  }
}

function actionsReady() {
  return Boolean(window.Shopify?.actions?.updateCart);
}

function injectNativeScript() {
  if (actionsReady()) return;
  const existing = document.getElementById(ID) as HTMLScriptElement | null;
  if (existing?.dataset.ed2c === "1") return;
  existing?.remove();
  document.querySelectorAll(`script[src="${SRC}"]`).forEach((node) => node.remove());
  const script = document.createElement("script");
  script.id = ID;
  script.type = "module";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = SRC;
  script.dataset.ed2c = "1";
  document.head.appendChild(script);
}

/**
 * React 19 can leave Hydrogen's Standard Actions tag in the DOM without running
 * it. Cart forms then fail with "Standard Actions not available". This loads
 * the script as a real browser module so `window.Shopify.actions` exists.
 */
export function StandardActionsBoot() {
  useEffect(() => {
    injectNativeScript();
    if (actionsReady()) return;

    const id = window.setInterval(() => {
      if (actionsReady()) {
        window.clearInterval(id);
        return;
      }
      injectNativeScript();
    }, 200);
    const timeout = window.setTimeout(() => window.clearInterval(id), 8000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <script
      id={`${ID}-boot`}
      type="module"
      async
      crossOrigin="anonymous"
      src={SRC}
      onLoad={() => {}}
    />
  );
}
