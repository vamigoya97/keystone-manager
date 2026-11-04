import type { AuthedUser } from "./auth";
import type { Keystone, Member } from "./keystones";
import { holdsToken } from "./chain";
import { findMember } from "./store";

export type AccessResult = { holder: boolean; revoked: boolean };

/** The user's claim record for an keystone, by Privy account or any linked wallet. */
export async function findUserMember(slug: string, user: AuthedUser): Promise<Member | undefined> {
  return (
    (await findMember(slug, { privyUserId: user.userId })) ??
    (await Promise.all(user.wallets.map((address) => findMember(slug, { address })))).find(Boolean)
  );
}

/**
 * Does this user have access to the keystone's gallery?
 *  - revoked by an operator → no, whatever they hold
 *  - demo mode (no token) → they claimed through the tap flow
 *  - otherwise → any linked wallet holds the keystone
 */
export async function checkAccess(exp: Keystone, user: AuthedUser): Promise<AccessResult> {
  const member = await findUserMember(exp.slug, user);

  if (member?.revoked) return { holder: false, revoked: true };
  if (!exp.token.address) return { holder: !!member, revoked: false };
  return { holder: await holdsToken(exp.token, user.wallets), revoked: false };
}
