import type { Metadata } from "next";
import MemberHome from "@/components/nfc/MemberHome";

export const metadata: Metadata = { title: "Your keystones" };

/** Member home: how to get a pass, and the passes you already hold. Operators use /operator. */
export default function Home() {
  return <MemberHome />;
}
