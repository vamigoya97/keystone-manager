import type { LoginModalOptions } from "@privy-io/react-auth";

/**
 * Who signs in how. The Privy app allows both methods (app/providers.tsx); each
 * entry point opens the modal with only its audience's method.
 *  - Keystone holders (claim, gallery, home, items): a text-message code.
 *  - Operators (/operator): an email code. Only OPERATOR_EMAILS open the console (lib/auth.ts).
 */
export const MEMBER_LOGIN: LoginModalOptions = { loginMethods: ["sms"] };
export const OPERATOR_LOGIN: LoginModalOptions = { loginMethods: ["email"] };

export type SignInAudience = "member" | "operator";

/**
 * Open Privy for one audience. The audience is set on <html> first, so the modal
 * takes that audience's look (app/globals.css): light Plate paper for holders,
 * the dark console for operators.
 */
export function signIn(login: (options?: LoginModalOptions) => void, audience: SignInAudience) {
  document.documentElement.dataset.signin = audience;
  login(audience === "member" ? MEMBER_LOGIN : OPERATOR_LOGIN);
}
