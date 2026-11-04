import type { Metadata } from "next";
import OperatorPage from "@/components/nfc/OperatorPage";
import { getOperator } from "@/lib/store";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const op = await getOperator((await params).id);
  return { title: op ? op.name : "Operator" };
}

/** A member's keystones from one operator. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <OperatorPage operatorId={(await params).id} />;
}
