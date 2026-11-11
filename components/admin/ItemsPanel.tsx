"use client";

import { useState } from "react";
import { formatDates, type ChipSecurity, type Keystone, type ItemBatch, type Operator } from "@/lib/keystones";
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, PlusIcon, XIcon } from "lucide-react";
import { Button as UiButton } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge, Button, Field, Notice, Panel, useAdminApi, useCopy } from "./ui";
import { Input } from "@/components/ui/input";

/**
 * Item batches that unlock this keystone. A batch of items unlocks several of
 * the operator's keystones in one tap; each item gets its own unique chip link.
 */
export default function ItemsPanel({
  operator,
  keystone,
  tokens,
  batches,
  onChange,
}: {
  operator: Operator;
  /** The keystone being managed: new batches start with it. */
  keystone: Keystone;
  tokens: Keystone[];
  batches: ItemBatch[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<ItemBatch | "new" | null>(null);
  const bySlug = new Map(tokens.map((t) => [t.slug, t]));

  return (
    <Panel
      title={
        <span>
          Multi-keystone items <span className="font-normal text-muted-foreground">· {batches.length}</span>
        </span>
      }
      action={
        editing === null && (
          <Button className="h-8" disabled={tokens.length === 0} onClick={() => setEditing("new")}>
            <PlusIcon />
            New item batch
          </Button>
        )
      }
    >
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">
        Wristbands, pins or tickets whose chip unlocks {keystone.name} together with other {operator.name} keystones in
        one tap. Add keystones later and items already handed out unlock them too.
      </p>

      {editing !== null ? (
        <BatchEditor
          operator={operator}
          tokens={tokens}
          batch={editing === "new" ? null : editing}
          initial={[keystone.slug]}
          onDone={() => {
            setEditing(null);
            onChange();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : batches.length === 0 ? (
        <p className="rounded-xl border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
          No multi-keystone items include {keystone.name} yet.
        </p>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <button
              key={b.id}
              onClick={() => setEditing(b)}
              className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left hover:border-input hover:bg-secondary"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{b.name}</span>
                  <Badge>{b.chipSecurity === "ntag424" ? "NTAG 424" : "Static"}</Badge>
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {b.tokens.map((slug, i) => (
                    <span key={slug} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                      {i === 0 && "★ "}
                      {bySlug.get(slug)?.name ?? slug}
                    </span>
                  ))}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">Edit<ChevronRightIcon className="size-4" /></span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

function BatchEditor({
  operator,
  tokens,
  batch,
  initial,
  onDone,
  onCancel,
}: {
  operator: Operator;
  tokens: Keystone[];
  batch: ItemBatch | null;
  /** Keystones a new batch starts with. */
  initial: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const api = useAdminApi();
  const [name, setName] = useState(batch?.name ?? "");
  const [id, setId] = useState(batch?.id ?? "");
  const [idTouched, setIdTouched] = useState(!!batch);
  const [selected, setSelected] = useState<string[]>(batch?.tokens ?? initial);
  const [chip, setChip] = useState<ChipSecurity>(batch?.chipSecurity ?? "static");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const bySlug = new Map(tokens.map((t) => [t.slug, t]));

  const toggle = (slug: string) =>
    setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
  const move = (i: number, d: number) =>
    setSelected((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (batch) {
        await api(`/api/admin/items/${batch.id}`, { method: "PATCH", json: { name, tokens: selected, chipSecurity: chip } });
      } else {
        await api("/api/admin/items", { method: "POST", json: { operatorId: operator.id, id, name, tokens: selected, chipSecurity: chip } });
      }
      onDone();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Field label="Batch name">
            <Input
              autoFocus

              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!idTouched) setId(slugify(e.target.value));
              }}
              placeholder="Sahar Camp 2026 wristbands"
            />
          </Field>
          <Field label="ID" hint={<>Links open <span className="font-mono">/t/{id || "…"}</span></>}>
            <Input
              className="font-mono"
              value={id}
              disabled={!!batch}
              onChange={(e) => {
                setIdTouched(true);
                setId(slugify(e.target.value));
              }}
              placeholder="sahar-2026-bands"
            />
          </Field>
        </div>

        <Field label="Unlocks" hint={`Only ${operator.name}'s keystones. ★ The first is where a tap lands; the rest are listed in its gallery.`}>
          <div className="space-y-1.5">
            {selected.map((slug, i) => (
              <div key={slug} className="flex items-center gap-2 rounded-lg border bg-secondary/50 px-3 py-1.5">
                <span className="w-4 text-sm text-foreground">{i === 0 ? "★" : i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{bySlug.get(slug)?.name ?? slug}</span>
                {bySlug.get(slug) && formatDates(bySlug.get(slug)!) && <Badge>{formatDates(bySlug.get(slug)!)}</Badge>}
                <UiButton type="button" variant="ghost" size="icon" className="size-7" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ChevronUpIcon />
                </UiButton>
                <UiButton type="button" variant="ghost" size="icon" className="size-7" aria-label="Move down" disabled={i === selected.length - 1} onClick={() => move(i, 1)}>
                  <ChevronDownIcon />
                </UiButton>
                <UiButton type="button" variant="ghost" size="icon" className="size-7 hover:text-destructive" aria-label="Remove" onClick={() => toggle(slug)}>
                  <XIcon />
                </UiButton>
              </div>
            ))}
            {tokens
              .filter((t) => !selected.includes(t.slug))
              .map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => toggle(t.slug)}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                >
                  <PlusIcon className="size-4" />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {formatDates(t) && <Badge>{formatDates(t)}</Badge>}
                </button>
              ))}
          </div>
        </Field>

        <Field label="Chip type">
          <ToggleGroup type="single" variant="outline" value={chip} onValueChange={(v) => v && setChip(v as ChipSecurity)} className="w-full">
            <ToggleGroupItem value="static" className="flex-1">
              Static links (NTAG 213/215)
            </ToggleGroupItem>
            <ToggleGroupItem value="ntag424" className="flex-1">
              Secure: NTAG 424 DNA
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onCancel}>{batch ? "Close" : "Cancel"}</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name || !id || selected.length === 0}>
            {batch ? "Save batch" : "Create batch"}
          </Button>
        </div>
      </form>

      {batch && (batch.chipSecurity === "ntag424" ? <ItemNtagSheet batchId={batch.id} /> : <ItemLinks batchId={batch.id} />)}
      {batch && chip !== batch.chipSecurity && <Notice tone="warn">Save to switch chip type before generating links.</Notice>}
    </div>
  );
}

/** One unique signed link per item, for static chips. */
function ItemLinks({ batchId }: { batchId: string }) {
  const api = useAdminApi();
  const { copy, copied } = useCopy();
  const [prefix, setPrefix] = useState(batchId.slice(0, 3).toUpperCase() + "-");
  const [start, setStart] = useState(1);
  const [count, setCount] = useState(10);
  const [baseUrl, setBaseUrl] = useState(typeof window !== "undefined" ? window.location.origin : "");
  const [items, setItems] = useState<{ chipId: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setItems((await api<{ items: { chipId: string; url: string }[] }>(`/api/admin/items/${batchId}/links`, { method: "POST", json: { prefix, start, count, baseUrl } })).items);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["item_id,url\n" + items.map((i) => `${i.chipId},${i.url}`).join("\n")], { type: "text/csv" }));
    a.download = `${batchId}-items-${items[0].chipId}-${items[items.length - 1].chipId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-3 text-xs text-muted-foreground">Item links</div>
      <div className="grid gap-3 sm:grid-cols-[1fr_90px_90px_2fr_auto] sm:items-end">
        <Field label="ID prefix"><Input className="font-mono" value={prefix} onChange={(e) => setPrefix(e.target.value)} /></Field>
        <Field label="Start #"><Input type="number" min={0}  value={start} onChange={(e) => setStart(+e.target.value)} /></Field>
        <Field label="Count"><Input type="number" min={1} max={1000}  value={count} onChange={(e) => setCount(+e.target.value)} /></Field>
        <Field label="Public site URL"><Input className="font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Field>
        <Button variant="primary" busy={busy} onClick={generate}>Generate</Button>
      </div>
      {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}
      {items.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{items.length} item links</span>
            <div className="flex gap-2">
              <Button className="h-8" onClick={() => copy(items.map((i) => i.url).join("\n"))}>Copy all</Button>
              <Button className="h-8" onClick={downloadCsv}>Download CSV</Button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-xl border">
            {items.map((i) => (
              <button key={i.chipId} onClick={() => copy(i.url)} className="flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-card">
                <span className="w-24 shrink-0 font-mono text-sm text-foreground">{i.chipId}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{copied === i.url ? "Copied" : i.url}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type Sheet = {
  urlTemplate: string;
  keys: { key0AppMaster: string; key1SdmMetaRead: string; key2SdmFileRead: string };
  sdm: Record<string, unknown> & {
    piccDataOffset: { decimal: number; hex: string };
    macInputOffset: { decimal: number; hex: string };
    macOffset: { decimal: number; hex: string };
  };
};

/** NTAG 424 DNA programming sheet for a batch: every chip programmed the same, each UID unique. */
function ItemNtagSheet({ batchId }: { batchId: string }) {
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
      setSheet(await api<Sheet>(`/api/admin/items/${batchId}/ntag424?baseUrl=${encodeURIComponent(baseUrl)}`));
    } catch (e: any) {
      setError(e.message);
      setSheet(null);
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, value: string) => (
    <div className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <button onClick={() => copy(value)} className="min-w-0 break-all text-right font-mono text-sm hover:text-foreground">
        {copied === value ? "Copied" : value}
      </button>
    </div>
  );

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-3 text-xs text-muted-foreground">Program NTAG 424 DNA items</div>
      {/* The hint sits under the whole row so the button lines up with the URL box, not the hint. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Field label="Public site URL">
            <Input className="font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </Field>
        </div>
        <Button variant="primary" busy={busy} onClick={load} className="h-9">{sheet ? "Refresh sheet" : "Show programming sheet"}</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Must be https://</p>
      {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}
      {sheet && (
        <div className="mt-4 space-y-3">
          <Notice tone="warn">These keys let anyone program items for this batch. Share them only with your chip supplier.</Notice>
          <div>
            {row("URL template", sheet.urlTemplate)}
            {row("Key 0 · app master", sheet.keys.key0AppMaster)}
            {row("Key 1 · SDM meta read", sheet.keys.key1SdmMetaRead)}
            {row("Key 2 · SDM file read", sheet.keys.key2SdmFileRead)}
            {row("PICCDataOffset", `${sheet.sdm.piccDataOffset.hex} (${sheet.sdm.piccDataOffset.decimal})`)}
            {row("SDMMACInputOffset", `${sheet.sdm.macInputOffset.hex} (${sheet.sdm.macInputOffset.decimal})`)}
            {row("SDMMACOffset", `${sheet.sdm.macOffset.hex} (${sheet.sdm.macOffset.decimal})`)}
          </div>
        </div>
      )}
    </div>
  );
}
