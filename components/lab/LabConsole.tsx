"use client";

import { useCallback, useState } from "react";
import { OperatorConsole, type Detail } from "@/components/admin/AdminApp";
import { AdminApiOverride, ConsoleRoot, type AdminApi } from "@/components/admin/ui";

export type LabConsoleData = {
  overview: Record<string, unknown> & { keystones: { slug: string }[] };
  details: Record<string, Detail>;
};

/**
 * The real operator console, answered from a snapshot instead of the server:
 * reads come from `data`, and anything that would save is refused with a
 * notice, so nothing here can change real keystones.
 */
export default function LabConsole({ data }: { data: LabConsoleData }) {
  const [refused, setRefused] = useState<string | null>(null);

  const api = useCallback<AdminApi>(
    async <T,>(path: string, init: RequestInit & { json?: unknown } = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      if (method === "GET") {
        if (path === "/api/admin/overview") return structuredClone(data.overview) as T;
        const slug = path.match(/^\/api\/admin\/keystones\/([^/?]+)$/)?.[1];
        if (slug && data.details[slug]) return structuredClone(data.details[slug]) as T;
      }
      // The deploy form's gas estimate is a read: answer it with a sample.
      if (method === "POST" && /\/deploy$/.test(path) && (init.json as { estimateOnly?: boolean } | undefined)?.estimateOnly) {
        return { estimate: { gas: "1850000", costEth: "0.0000096", affordable: true } } as T;
      }
      const message = "Saving is off in the design lab. Nothing was changed.";
      setRefused(`${method} ${path}`);
      throw Object.assign(new Error(message), { status: 405 });
    },
    [data]
  );

  return (
    <AdminApiOverride.Provider value={api}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber/30 bg-amber-dim px-4 py-2 text-[12px] text-amber sm:px-6">
        <span>
          Design lab: the operator console on this machine&apos;s data, no sign-in. Saving is off.
          {refused && <span className="ml-2 font-mono text-[11px] opacity-80">Refused: {refused}</span>}
        </span>
        <a href="/lab" className="text-amber underline-offset-4 hover:underline">
          Member screens
        </a>
      </div>
      <ConsoleRoot>
        <OperatorConsole onSignOut={() => {}} />
      </ConsoleRoot>
    </AdminApiOverride.Provider>
  );
}
