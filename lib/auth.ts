import { PrivyClient, type User } from "@privy-io/server-auth";
import type { Keystone } from "./keystones";
import { getKeystone } from "./store";

/**
 * Server-side identity for API routes. Clients send their Privy access
 * token as `Authorization: Bearer <token>` (usePrivy().getAccessToken()).
 *
 * Requires PRIVY_APP_SECRET (Privy dashboard → App settings → API keys).
 */

export interface AuthedUser {
  userId: string;
  /** All wallet addresses linked to the user, lowercase. Embedded wallet first. */
  wallets: string[];
  phone?: string;
  /** Lowercase email when the user signed in with email. */
  email?: string;
}

export class AuthError extends Error {
  constructor(message: string, public status: 401 | 403 | 500 = 401) {
    super(message);
  }
}

let client: PrivyClient | null = null;
function privy(): PrivyClient {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) {
    throw new AuthError("Server auth not configured: set PRIVY_APP_SECRET", 500);
  }
  return (client ??= new PrivyClient(appId, secret));
}

// getUserById is rate-limited by Privy; cache briefly per user.
const userCache = new Map<string, { user: User; at: number }>();
const USER_TTL_MS = 60_000;

async function fetchUser(userId: string): Promise<User> {
  const hit = userCache.get(userId);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.user;
  const user = await privy().getUserById(userId);
  userCache.set(userId, { user, at: Date.now() });
  return user;
}

export async function getUser(req: Request): Promise<AuthedUser> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new AuthError("Sign in required");

  let userId: string;
  try {
    userId = (await privy().verifyAuthToken(token)).userId;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    // The reason stays in the server log (expired, wrong app, bad key); the member sees one message.
    console.warn("Privy token verification failed:", (err as Error)?.message ?? err);
    throw new AuthError("Session expired — sign in again");
  }

  const user = await fetchUser(userId);
  const wallets = user.linkedAccounts
    .filter((a): a is Extract<typeof a, { type: "wallet" }> => a.type === "wallet")
    .sort((a, b) =>
      a.walletClientType === "privy" ? -1 : b.walletClientType === "privy" ? 1 : 0
    )
    .map((a) => a.address.toLowerCase());

  return { userId, wallets, phone: user.phone?.number, email: user.email?.address?.toLowerCase() };
}

/**
 * Operators sign in by email only (the console opens Privy with email alone,
 * lib/signIn.ts), listed in env as one shared allowlist:
 *   OPERATOR_EMAILS=ops@example.com,other@example.com
 * Phone numbers and wallets never open the console: SMS sign-in is for keystone
 * holders, and a SIM swap shouldn't reach contracts or the gas wallet.
 */
export function isOperator(user: AuthedUser): boolean {
  const emails = (process.env.OPERATOR_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!user.email && emails.includes(user.email.toLowerCase());
}

export async function requireOperator(req: Request): Promise<AuthedUser> {
  const user = await getUser(req);
  if (!isOperator(user)) throw new AuthError("Operator access only", 403);
  return user;
}

/** Operator access plus the token being managed (404 when it doesn't exist). */
export async function requireKeystoneOperator(
  req: Request,
  slug: string
): Promise<{ user: AuthedUser; exp: Keystone }> {
  const user = await requireOperator(req);
  const exp = await getKeystone(slug);
  if (!exp) throw new NotFoundError();
  return { user, exp };
}

export class NotFoundError extends Error {
  constructor() {
    super("Not found");
  }
}

/** Wrap a route handler so AuthErrors become JSON responses. */
export function handleAuthError(err: unknown): Response {
  if (err instanceof NotFoundError) return Response.json({ error: "Not found" }, { status: 404 });
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Request failed";
  console.error(err);
  return Response.json({ error: message }, { status: 500 });
}

