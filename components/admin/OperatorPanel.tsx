"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { formatDates, type Keystone, type KeystonePhase, type Operator } from "@/lib/keystones";
import { Badge, Button, Panel } from "./ui";

export type AdminKeystone = Keystone & { memberCount: number; phase: KeystonePhase | null };
type View = "list" | "icons";

const VIEW_KEY = "operator.view";

export function PhaseBadge({ phase }: { phase: KeystonePhase }) {
  return phase === "live" ? <Badge tone="good">Live</Badge> : phase === "upcoming" ? <Badge tone="warn">Upcoming</Badge> : <Badge>Past</Badge>;
}

/**
 * One operator at a time: a dropdown picks the operator, and its keystones show
 * below as a list or as artwork icons, newest first.
 */
export default function OperatorPanel({
  operators,
  operator,
  keystones,
  allKeystones,
  selected,
  onOperator,
  onAddOperator,
  onSelect,
  onCreate,
}: {
  operators: Operator[];
  operator: Operator;
  /** The selected operator's keystones. */
  keystones: AdminKeystone[];
  /** Everyone's, for counts and avatar colors in the dropdown. */
  allKeystones: AdminKeystone[];
  selected: string | null;
  onOperator: (id: string) => void;
  onAddOperator: () => void;
  onSelect: (slug: string) => void;
  onCreate: () => void;
}) {
  const [view, setView] = useState<View>("list");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "icons") setView("icons");
    } catch {}
  }, []);
  function pickView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }

  const sorted = newestFirst(keystones);

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3">
        <OperatorPicker operators={operators} value={operator.id} keystones={allKeystones} onChange={onOperator} onAdd={onAddOperator} />
        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label="Show keystones as" className="flex gap-1 rounded-xl border border-border-subtle bg-surface p-1">
            {(["list", "icons"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => pickView(v)}
                aria-pressed={view === v}
                className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] ${view === v ? "bg-surface-elevated text-text-primary" : "text-text-secondary hover:text-text-primary"}`}
              >
                {v === "list" ? <ListIcon /> : <GridIcon />}
                {v === "list" ? "List" : "Icons"}
              </button>
            ))}
          </div>
          <Button className="h-9" onClick={onCreate}>+ New keystone</Button>
        </div>
      </div>

      <div className="mt-5">
        {keystones.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-default px-4 py-6 text-center text-[13px] text-text-muted">
            {operator.name} hasn&apos;t issued a keystone yet.
          </p>
        ) : view === "list" ? (
          <ListView items={sorted} selected={selected} onSelect={onSelect} />
        ) : (
          <IconView items={sorted} selected={selected} onSelect={onSelect} />
        )}
      </div>
    </Panel>
  );
}

/** Dropdown of operators: the current one on the button, the rest (and "New operator") in the menu. */
function OperatorPicker({
  operators,
  value,
  keystones,
  onChange,
  onAdd,
}: {
  operators: Operator[];
  value: string;
  keystones: AdminKeystone[];
  onChange: (id: string) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = operators.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = (id: string) => keystones.filter((k) => k.operatorId === id).length;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Operator"
        className="flex min-w-[240px] items-center gap-3 rounded-2xl border border-border-default bg-surface px-3 py-2 text-left hover:border-accent/40"
      >
        {current && <Avatar operator={current} keystones={keystones} />}
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-text-muted">Operator</span>
          <span className="block truncate text-[15px] font-semibold">{current?.name ?? "Choose an operator"}</span>
        </span>
        <span aria-hidden className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-[300px] overflow-hidden rounded-2xl border border-border-default bg-[#141414] p-1.5 shadow-2xl">
          <ul role="listbox" aria-label="Operators" className="max-h-[320px] overflow-y-auto">
            {operators.map((o) => {
              const n = count(o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.id === value}
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left ${o.id === value ? "bg-accent-dim" : "hover:bg-surface-elevated"}`}
                  >
                    <Avatar operator={o} keystones={keystones} small />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{o.name}</span>
                      <span className="block text-[11px] text-text-muted">
                        {n} keystone{n === 1 ? "" : "s"}
                      </span>
                    </span>
                    {o.id === value && <span className="text-[12px] text-accent">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAdd();
            }}
            className="mt-1 w-full rounded-xl border-t border-border-subtle px-2.5 py-2.5 text-left text-[12px] text-text-secondary hover:bg-surface-elevated hover:text-accent"
          >
            + New operator
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({ operator, keystones, small = false }: { operator: Operator; keystones: AdminKeystone[]; small?: boolean }) {
  const swatch = keystones.find((k) => k.operatorId === operator.id)?.palette ?? ["#3a3a3a", "#1f1f1f"];
  return (
    <span
      className={`flex shrink-0 items-center justify-center font-bold text-white ${small ? "h-8 w-8 rounded-lg text-[13px]" : "h-10 w-10 rounded-xl text-[15px]"}`}
      style={{ background: `linear-gradient(135deg, ${swatch[0]}, ${swatch[1]})` }}
    >
      {operator.name.replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase() || "•"}
    </span>
  );
}

/**
 * Newest first. Keystones created before creation dates were recorded have none;
 * they come after dated ones, latest-added first (the store keeps creation order).
 */
export function newestFirst<K extends Pick<Keystone, "createdAt">>(keystones: K[]): K[] {
  return keystones
    .map((k, i) => ({ k, i }))
    .sort((a, b) => (b.k.createdAt ?? "").localeCompare(a.k.createdAt ?? "") || b.i - a.i)
    .map(({ k }) => k);
}

const created = (k: AdminKeystone) =>
  k.createdAt ? `Created ${new Date(k.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : null;

function ListView({ items, selected, onSelect }: { items: AdminKeystone[]; selected: string | null; onSelect: (slug: string) => void }) {
  return (
    <div>
      <div className="flex flex-col gap-1.5">
        {items.map((e) => (
          <button
            key={e.slug}
            onClick={() => onSelect(e.slug)}
            aria-current={e.slug === selected ? "true" : undefined}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
              e.slug === selected ? "border-accent/50 bg-accent-dim" : "border-border-subtle hover:border-border-default hover:bg-surface-elevated"
            }`}
          >
            <Thumb keystone={e} className="h-8 w-8 rounded-lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{e.name}</span>
              <span className="block truncate text-[11px] text-text-muted">
                {[formatDates(e), e.location, `${e.memberCount} members`, created(e)].filter(Boolean).join(" · ")}
              </span>
            </span>
            {e.phase && <PhaseBadge phase={e.phase} />}
            {!e.token.address && <Badge tone="warn">No contract</Badge>}
          </button>
        ))}
      </div>
    </div>
  );
}

function IconView({ items, selected, onSelect }: { items: AdminKeystone[]; selected: string | null; onSelect: (slug: string) => void }) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((e) => (
          <button
            key={e.slug}
            onClick={() => onSelect(e.slug)}
            aria-current={e.slug === selected ? "true" : undefined}
            title={[e.name, formatDates(e), e.location, created(e)].filter(Boolean).join(" · ")}
            className={`group rounded-2xl border p-2 text-left transition-colors ${
              e.slug === selected ? "border-accent/50 bg-accent-dim" : "border-border-subtle hover:border-border-default hover:bg-surface-elevated"
            }`}
          >
            <span className="relative block">
              <Thumb keystone={e} className="aspect-[4/5] w-full rounded-xl" />
              {e.phase && e.phase !== "past" && (
                <span className="absolute left-1.5 top-1.5">
                  <PhaseBadge phase={e.phase} />
                </span>
              )}
            </span>
            <span className="mt-2 block truncate text-[12px] font-medium">{e.name}</span>
            <span className="block truncate text-[10px] text-text-muted">
              {e.token.address ? `${e.memberCount} members` : "No contract"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The keystone's artwork still (or its colors when there's no artwork yet). */
function Thumb({ keystone, className }: { keystone: AdminKeystone; className: string }) {
  return (
    <span
      className={`block shrink-0 overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${keystone.palette[0]}, ${keystone.palette[1]})` }}
    >
      {keystone.tokenImage && <img src={keystone.tokenImage} alt="" loading="lazy" className="h-full w-full object-cover" />}
    </span>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}
