"use client";

import { useMemo, useState } from "react";
import type { Member } from "@/lib/keystones";
import type { Detail } from "./AdminApp";
import { ExternalLinkIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge, Button, Notice, Panel, shortAddr, useAdminApi, useCopy } from "./ui";
import { Input } from "@/components/ui/input";

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
          <Input
            className="w-48 sm:w-64"
            placeholder="Search wallet or chip"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      >
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {members.length === 0 ? "No one has claimed yet. Members appear here after their first tap and claim." : "No matches."}
          </p>
        ) : (
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Wallet</TableHead>
                <TableHead>Chip</TableHead>
                <TableHead>Claimed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.address}>
                  <TableCell>
                    <button onClick={() => copy(m.address)} className="font-mono hover:underline" title={m.address}>
                      {copied === m.address ? "Copied" : shortAddr(m.address)}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">{m.chipId}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(m.claimedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    {m.txHash && explorer && (
                      <a
                        href={`${explorer}/tx/${m.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-0.5 text-xs hover:text-foreground"
                      >
                        tx
                        <ExternalLinkIcon className="size-3" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell>{m.revoked ? <Badge tone="bad">Revoked</Badge> : <Badge tone="good">Active</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {m.revoked ? (
                        <Button busy={busy === m.address + "restore"} onClick={() => act(m, "restore")}>
                          Restore
                        </Button>
                      ) : (
                        <Button variant="danger" busy={busy === m.address + "revoke"} onClick={() => act(m, "revoke")}>
                          Revoke
                        </Button>
                      )}
                      <Button busy={busy === m.address + "release"} onClick={() => act(m, "release")}>
                        Release chip
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="gap-1 px-6 py-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </Card>
  );
}
