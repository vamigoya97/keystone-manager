"use client";

import { useState } from "react";
import type { ChipSecurity, ItemBatch, Keystone, Operator } from "@/lib/keystones";
import type { Detail } from "./AdminApp";
import ItemsPanel from "./ItemsPanel";
import { cn } from "@/lib/utils";
import { Badge, Button, Field, Notice, Panel, useAdminApi, useCopy } from "./ui";
import { Input } from "@/components/ui/input";

/**
 * The physical items that open this keystone: the chip type, links or NTAG 424
 * programming for items that unlock just this keystone, and the operator's item
 * batches that unlock it together with other keystones.
 */
export default function ItemsTab({
  detail,
  operator,
  keystones,
  batches,
  onChange,
  onItemsChange,
}: {
  detail: Detail;
  operator: Operator;
  /** All of the operator's keystones, for batches that unlock several. */
  keystones: Keystone[];
  /** The operator's item batches. */
  batches: ItemBatch[];
  onChange: (next?: Partial<Detail>) => void;
  onItemsChange: () => void;
}) {
  const { keystone } = detail;
  return (
    <div className="space-y-4">
      <ChipSecurityPanel keystone={keystone} onChange={onChange} />
      {(keystone.chipSecurity ?? "static") === "ntag424" ? (
        <Ntag424Sheet slug={keystone.slug} />
      ) : (
        <ChipLinks slug={keystone.slug} />
      )}
      <ItemsPanel
        operator={operator}
        keystone={keystone}
        tokens={keystones}
        batches={batches.filter((b) => b.tokens.includes(keystone.slug))}
        onChange={onItemsChange}
      />
    </div>
  );
}

/** Generate signed URLs to write onto NFC chips. */
function ChipLinks({ slug }: { slug: string }) {
  const api = useAdminApi();
  const { copy, copied } = useCopy();
  const [prefix, setPrefix] = useState(slug.slice(0, 3).toUpperCase() + "-");
  const [start, setStart] = useState(1);
  const [count, setCount] = useState(10);
  const [baseUrl, setBaseUrl] = useState(typeof window !== "undefined" ? window.location.origin : "");
  const [chips, setChips] = useState<{ chipId: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ chips: { chipId: string; url: string }[] }>(
        `/api/admin/keystones/${slug}/chips`,
        { method: "POST", json: { prefix, start, count, baseUrl } }
      );
      setChips(data.chips);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    const csv = "chip_id,url\n" + chips.map((c) => `${c.chipId},${c.url}`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${slug}-chips-${chips[0].chipId}-${chips[chips.length - 1].chipId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Panel title="Chip links">
      <p className="mb-4 text-sm text-muted-foreground">
        Generate the signed URL to write onto each item&apos;s NFC chip. Each chip can be claimed
        by one wallet.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_100px_100px_2fr_auto] sm:items-end">
        <Field label="ID prefix">
          <Input className="font-mono" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </Field>
        <Field label="Start #">
          <Input type="number" min={0}  value={start} onChange={(e) => setStart(+e.target.value)} />
        </Field>
        <Field label="Count">
          <Input type="number" min={1} max={1000}  value={count} onChange={(e) => setCount(+e.target.value)} />
        </Field>
        <Field label="Public site URL">
          <Input className="font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://yourdomain.com" />
        </Field>
        <Button variant="primary" busy={busy} onClick={generate}>
          Generate
        </Button>
      </div>

      {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}

      {chips.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{chips.length} links</span>
            <div className="flex gap-2">
              <Button className="h-8" onClick={() => copy(chips.map((c) => c.url).join("\n"))}>
                {copied?.includes("\n") || (chips.length === 1 && copied) ? "Copied" : "Copy all"}
              </Button>
              <Button className="h-8" onClick={downloadCsv}>
                Download CSV
              </Button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border bg-background">
            {chips.map((c) => (
              <button
                key={c.chipId}
                onClick={() => copy(c.url)}
                className="flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-card"
              >
                <span className="w-24 shrink-0 font-mono text-sm text-foreground">{c.chipId}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {copied === c.url ? "Copied" : c.url}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Choose which chip type opens a claim session for this keystone. */
function ChipSecurityPanel({
  keystone,
  onChange,
}: {
  keystone: Keystone;
  onChange: (next?: Partial<Detail>) => void;
}) {
  const api = useAdminApi();
  const current: ChipSecurity = keystone.chipSecurity ?? "static";
  const [busy, setBusy] = useState<ChipSecurity | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(mode: ChipSecurity) {
    if (mode === current) return;
    const warning =
      mode === "ntag424"
        ? "Switch to NTAG 424 DNA? Static chip links for this keystone will stop working."
        : "Switch to static links? Static links can be copied; secure chips will stop working until you switch back.";
    if (!confirm(warning)) return;
    setBusy(mode);
    setError(null);
    try {
      const exp = await api<Keystone>(`/api/admin/keystones/${keystone.slug}`, {
        method: "PATCH",
        json: { chipSecurity: mode },
      });
      onChange({ keystone: exp });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const options: { mode: ChipSecurity; title: string; body: string }[] = [
    {
      mode: "static",
      title: "Static links",
      body: "NTAG 213/215. Cheap, write with any phone. A copied link can be reused until the chip is claimed.",
    },
    {
      mode: "ntag424",
      title: "Secure · NTAG 424 DNA",
      body: "The chip signs every tap. Copied or replayed links are rejected — only a real tap works.",
    },
  ];

  return (
    <Panel title="Chip type">
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.mode}
            onClick={() => choose(o.mode)}
            disabled={busy !== null}
            className={cn("rounded-xl border p-4 text-left transition-colors", current === o.mode ? "border-ring bg-secondary" : "hover:bg-secondary/50")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm font-semibold ${current === o.mode ? "text-foreground" : ""}`}>{o.title}</span>
              {current === o.mode ? <Badge tone="good">Active</Badge> : busy === o.mode ? <Badge>Saving…</Badge> : null}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{o.body}</p>
          </button>
        ))}
      </div>
      {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}
    </Panel>
  );
}

type Sheet = {
  urlTemplate: string;
  keys: { key0AppMaster: string; key1SdmMetaRead: string; key2SdmFileRead: string };
  sdm: {
    file: string;
    options: string;
    metaReadKey: string;
    fileReadKey: string;
    piccDataOffset: { decimal: number; hex: string };
    macInputOffset: { decimal: number; hex: string };
    macOffset: { decimal: number; hex: string };
    note: string;
  };
};

/** Programming sheet for NTAG 424 DNA chips (URL template, keys, SDM offsets). */
function Ntag424Sheet({ slug }: { slug: string }) {
  const api = useAdminApi();
  const { copy, copied } = useCopy();
  const [baseUrl, setBaseUrl] = useState(typeof window !== "undefined" ? window.location.origin : "");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setSheet(
        await api<Sheet>(`/api/admin/keystones/${slug}/chips/ntag424?baseUrl=${encodeURIComponent(baseUrl)}`)
      );
    } catch (e: any) {
      setError(e.message);
      setSheet(null);
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!sheet) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ keystone: slug, ...sheet }, null, 2)], { type: "application/json" }));
    a.download = `${slug}-ntag424-programming.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const row = (label: string, value: string, mono = true) => (
    <div className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <button
        onClick={() => copy(value)}
        className={`min-w-0 break-all text-right text-sm hover:text-foreground ${mono ? "font-mono" : ""}`}
        title="Copy"
      >
        {copied === value ? "Copied" : value}
      </button>
    </div>
  );

  return (
    <Panel title="Program NTAG 424 DNA chips">
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Every chip for this keystone is programmed identically: the same URL template, keys and settings.
        Send the sheet to your chip supplier, or program chips yourself with NXP TagXplorer and a USB reader.
        Each chip&apos;s UID becomes its ID in the members list.
      </p>

      {/* The hint sits under the whole row so the button lines up with the URL box, not the hint. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <Field label="Public site URL">
            <Input className="font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://yourdomain.com" />
          </Field>
        </div>
        <Button variant="primary" busy={busy} onClick={load} className="h-9">
          {sheet ? "Refresh sheet" : "Show programming sheet"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Must be https:// — this is what the chip opens</p>

      {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}

      {sheet && (
        <div className="mt-5 space-y-4">
          <Notice tone="warn">
            These keys let anyone program chips that unlock this keystone. Share them only with your chip
            supplier, and never post them publicly.
          </Notice>

          <div>
            <div className="mb-1 text-xs text-muted-foreground">NDEF URL (URI record)</div>
            {row("Template", sheet.urlTemplate)}
          </div>

          <div>
            <div className="mb-1 text-xs text-muted-foreground">AES-128 keys</div>
            {row("Key 0 · app master", sheet.keys.key0AppMaster)}
            {row("Key 1 · SDM meta read", sheet.keys.key1SdmMetaRead)}
            {row("Key 2 · SDM file read", sheet.keys.key2SdmFileRead)}
          </div>

          <div>
            <div className="mb-1 text-xs text-muted-foreground">SDM file settings</div>
            {row("File", sheet.sdm.file, false)}
            {row("Mirroring", sheet.sdm.options, false)}
            {row("Meta read key", sheet.sdm.metaReadKey, false)}
            {row("File read key", sheet.sdm.fileReadKey, false)}
            {row("PICCDataOffset", `${sheet.sdm.piccDataOffset.hex} (${sheet.sdm.piccDataOffset.decimal})`)}
            {row("SDMMACInputOffset", `${sheet.sdm.macInputOffset.hex} (${sheet.sdm.macInputOffset.decimal})`)}
            {row("SDMMACOffset", `${sheet.sdm.macOffset.hex} (${sheet.sdm.macOffset.decimal})`)}
            <p className="mt-2 text-xs text-muted-foreground">{sheet.sdm.note} Read access to the NDEF file stays free (Eh) so phones can open the link.</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={download}>Download sheet (JSON)</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
