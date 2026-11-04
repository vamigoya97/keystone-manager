"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { base, baseSepolia } from "viem/chains";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        // Phone/SMS and wallet. Email can be switched on for testing
        // (e.g. signing in as a non-operator) with NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=true.
        loginMethods:
          process.env.NEXT_PUBLIC_ENABLE_EMAIL_LOGIN === "true"
            ? ["sms", "email", "wallet"]
            : ["sms", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#C8FF2E",
          showWalletLoginFirst: false,
          logo: undefined,
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