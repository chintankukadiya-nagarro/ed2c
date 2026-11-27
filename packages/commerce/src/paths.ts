const MAX_PATH_LENGTH = 2048;

/**
 * A same-origin path that is safe to redirect to. Anything that could leave
 * the site (absolute URLs, `//host`, backslashes, control characters) becomes `/`.
 */
export function safeReturnPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || value.length > MAX_PATH_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://placeholder.invalid");
    if (url.origin !== "https://placeholder.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
