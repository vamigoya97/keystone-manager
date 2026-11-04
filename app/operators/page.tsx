import type { Metadata } from "next";
import OperatorsPage from "@/components/nfc/OperatorsPage";

export const metadata: Metadata = { title: "Your operators" };

/** The operators that issued the member's keystones. */
export default function Page() {
  return <OperatorsPage />;
}
