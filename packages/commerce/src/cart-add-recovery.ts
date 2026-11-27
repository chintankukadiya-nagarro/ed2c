export type CartAddLine = {
  merchandiseId: string;
  quantity: number;
};

export type CartLineNode = {
  quantity: number;
  merchandise?: { id?: string | null } | null;
};

export type CartSnapshot = {
  lines?: { nodes?: CartLineNode[] | null } | null;
} | null;

export function jsonAddLines(body: unknown): CartAddLine[] | null {
  if (!body || typeof body !== "object" || !("lines" in body)) return null;
  const lines = (body as { lines: unknown }).lines;
  if (!Array.isArray(lines)) return null;

  const adds: CartAddLine[] = [];
  for (const raw of lines) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as { id?: unknown; merchandiseId?: unknown; quantity?: unknown };
    if (typeof line.id === "string" && line.id !== "") continue;
    if (typeof line.merchandiseId !== "string" || line.merchandiseId === "") continue;
    if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1) continue;
    adds.push({ merchandiseId: line.merchandiseId, quantity: line.quantity });
  }
  return adds.length > 0 ? adds : null;
}

export function addedLinesMissingFromCart(adds: CartAddLine[], cart: CartSnapshot): CartAddLine[] {
  const present = new Set(
    (cart?.lines?.nodes ?? []).map((node) => node.merchandise?.id).filter((id): id is string => Boolean(id)),
  );
  return adds.filter((line) => !present.has(line.merchandiseId));
}

export function linesForRebuiltCart(cart: CartSnapshot, adds: CartAddLine[]): CartAddLine[] {
  const existing = (cart?.lines?.nodes ?? [])
    .filter((node) => Boolean(node.merchandise?.id))
    .map((node) => ({ merchandiseId: node.merchandise!.id as string, quantity: node.quantity }));
  return [...existing, ...adds];
}
