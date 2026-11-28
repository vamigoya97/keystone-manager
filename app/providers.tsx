"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { base, baseSepolia } from "viem/chains";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        // Both methods are allowed for the app; each sign-in button opens the modal with
        // only its audience's method (lib/signIn.ts): SMS for holders, email for operators.
        loginMethods: ["sms", "email"],
        // Glass sheet (canvas option A): frosted dark over the page, one white action.
        // The finer palette, radii and typeface are Privy's CSS variables in
        // app/globals.css (#privy-dialog).
        appearance: {
          theme: "#141414",
          accentColor: "#FFFFFF",
          // PNG at 2:1, as Privy asks; the keystone mark from the claim screen.
          logo: "/keystone-signin.png",
          landingHeader: "Welcome to your keystones",
          loginMessage: "No password. We send you a one-time code.",
          showWalletLoginFirst: false,
          walletList: [],
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
        defaultChain:
          process.env.NEXT_PUBLIC_GATE_CHAIN_ID === "84532"
            ? baseSepolia
            : base,
        supportedChains: [base, baseSepolia],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
