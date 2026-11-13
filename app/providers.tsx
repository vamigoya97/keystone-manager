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
        // Neutral and dark, like the member screens and the console. The finer palette,
        // radii and typeface are CSS variables in app/globals.css (#privy-dialog).
        appearance: {
          theme: "#0c0c0b",
          accentColor: "#f2f1ec",
          landingHeader: "Sign in",
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
