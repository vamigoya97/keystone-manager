"use client";

import { useMemo, useState } from "react";
import type { Member } from "@/lib/keystones";
import type { Detail } from "./AdminApp";
import { Badge, Button, Notice, Panel, inputClass, shortAddr, useAdminApi, useCopy } from "./ui";

export default function MembersTab({
  detail,
  onChange,
}: {
  detail: Detail;
  onChange: (next?: Partial<Detail>) => void;
}) {
  const { keystone, members } = detail;
  const api = useAdminApi();
  const { copy, copied } = useCopy();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = members.filter((m) => !m.revoked).length;
  const explorer = detail.tokenStats?.explorerUrl.replace(/\/address\/.*$/, "");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...members]
      .sort((a, b) => b.claimedAt.localeCompare(a.claimedAt))
      .filter(
        (m) =>
          !q ||
          m.address.includes(q) ||
          m.chipId.toLowerCase().includes(q)
      );
  }, [members, query]);

  async function act(m: Member, action: "revoke" | "restore" | "release") {
    if (
      action === "release" &&
      !confirm(`Release chip ${m.chipId}? The record is deleted and the chip can be claimed by a new wallet. Their keystone isn't burned.`)
    )
      return;
    setBusy(m.address + action);
    setError(null);
    try {
      const { members } = await api<{ members: Member[] }>(
        `/api/admin/keystones/${keystone.slug}/members`,
        { method: "PATCH", json: { address: m.address, action } }
      );
      onChange({ members });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Members" value={active} />
        <Metric label="Revoked" value={members.length - active} />
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      <Panel
        title="Members"
        action={
          <input
            className={`${inputClass} h-9 w-48 py-0 sm:w-64`}
            placeholder="Search wallet or chip"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      >
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-muted">
            {members.length === 0 ? "No one has claimed yet. Members appear here after their first tap and claim." : "No matches."}
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border-subtle text-[10px] uppercase tracking-[0.14em] text-text-muted">
                  <th className="px-5 py-2 font-medium">Wallet</th>
                  <th className="px-3 py-2 font-medium">Chip</th>
                  <th className="px-3 py-2 font-medium">Claimed</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.address} className="border-b border-border-subtle last:border-0">
                    <td className="px-5 py-3">
                      <button onClick={() => copy(m.address)} className="font-mono hover:text-accent" title={m.address}>
                        {copied === m.address ? "Copied" : shortAddr(m.address)}
                      </button>
                    </td>
                    <td className="px-3 py-3 font-mono text-text-secondary">{m.chipId}</td>
                    <td className="px-3 py-3 text-text-secondary">
                      {new Date(m.claimedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      {m.txHash && explorer && (
                        <a
                          href={`${explorer}/tx/${m.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-[11px] text-text-muted hover:text-text-secondary"
                        >
                          tx ↗
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {m.revoked ? <Badge tone="bad">Revoked</Badge> : <Badge tone="good">Active</Badge>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {m.revoked ? (
                          <Button className="h-8" busy={busy === m.address + "restore"} onClick={() => act(m, "restore")}>
                            Restore
                          </Button>
                        ) : (
                          <Button variant="danger" className="h-8" busy={busy === m.address + "revoke"} onClick={() => act(m, "revoke")}>
                            Revoke
                          </Button>
                        )}
                        <Button className="h-8" busy={busy === m.address + "release"} onClick={() => act(m, "release")}>
                          Release chip
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-raised p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}
