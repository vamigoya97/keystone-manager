import type { Metadata } from "next";
import AdminApp from "@/components/admin/AdminApp";

export const metadata: Metadata = { title: "Manager", robots: { index: false } };

/** Operator console: galleries, token setup, members. Gated server-side by /api/admin/*. */
export default function AdminPage() {
  return <AdminApp />;
}
