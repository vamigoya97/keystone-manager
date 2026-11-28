import type { Metadata } from "next";
import OperatorPage from "@/components/nfc/OperatorPage";
import { notFound } from "next/navigation";
import { getOperator } from "@/lib/store";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const op = await getOperator((await params).id);
  return { title: op ? op.name : "Operator" };
}

/** A member's keystones from one operator. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getOperator(id))) notFound();
  return <OperatorPage operatorId={id} />;
}
