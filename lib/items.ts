import { listKeystones } from "./store";

/**
 * Item batches may only unlock their own operator's tokens. Returns an error
 * message, or null when every slug exists and belongs to the operator.
 */
export async function checkItemTokens(operatorId: string, tokens: unknown): Promise<string | null> {
  if (!Array.isArray(tokens) || tokens.length === 0) return "Pick at least one token";
  if (tokens.length > 50) return "Up to 50 tokens per item";
  const mine = new Set((await listKeystones()).filter((e) => e.operatorId === operatorId).map((e) => e.slug));
  const bad = tokens.find((t) => typeof t !== "string" || !mine.has(t));
  if (bad !== undefined) return "Items can only unlock this operator's tokens";
  if (new Set(tokens).size !== tokens.length) return "A token is listed twice";
  return null;
}

