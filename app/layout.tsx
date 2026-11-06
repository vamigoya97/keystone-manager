import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

// The member screens' typeface (one family, three weights), exposed as --font-plate.
const plateFont = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plate" });

// Lets member screens pad for the notch and home bar (env(safe-area-inset-*)).
export const viewport: Viewport = { viewportFit: "cover" };

export const metadata: Metadata = {
  title: {
    default: "Keystone Manager",
    template: "%s | Keystone Manager",
  },
  description: "Keystones: NFC-unlocked passes to private galleries, issued by operators.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={plateFont.variable}>
      <body className="min-h-screen bg-surface text-text-primary antialiased">
        <Providers>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
