"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, LayoutGridIcon, ListIcon, PlusIcon } from "lucide-react";
import { formatDates, type Keystone, type KeystonePhase, type Operator } from "@/lib/keystones";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge, Panel } from "./ui";

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
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={view}
            onValueChange={(v) => v && pickView(v as View)}
            aria-label="Show keystones as"
          >
            <ToggleGroupItem value="list" aria-label="List">
              <ListIcon />
              List
            </ToggleGroupItem>
            <ToggleGroupItem value="icons" aria-label="Icons">
              <LayoutGridIcon />
              Icons
            </ToggleGroupItem>
          </ToggleGroup>
          <UiButton size="sm" onClick={onCreate}>
            <PlusIcon />
            New keystone
          </UiButton>
        </div>
      </div>

      <div className="mt-5">
        {keystones.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
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
  const current = operators.find((o) => o.id === value);
  const count = (id: string) => keystones.filter((k) => k.operatorId === id).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <UiButton variant="outline" className="h-auto min-w-[240px] justify-start gap-3 px-3 py-2 text-left" aria-label="Operator">
          {current && <Avatar operator={current} keystones={keystones} />}
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-normal text-muted-foreground">Operator</span>
            <span className="block truncate text-sm font-semibold">{current?.name ?? "Choose an operator"}</span>
          </span>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </UiButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Operators</DropdownMenuLabel>
        <div className="max-h-80 overflow-y-auto">
          {operators.map((o) => {
            const n = count(o.id);
            return (
              <DropdownMenuItem key={o.id} onSelect={() => onChange(o.id)} className="gap-3">
                <Avatar operator={o} keystones={keystones} small />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{o.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {n} keystone{n === 1 ? "" : "s"}
                  </span>
                </span>
                {o.id === value && <CheckIcon />}
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAdd}>
          <PlusIcon />
          New operator
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({ operator, keystones, small = false }: { operator: Operator; keystones: AdminKeystone[]; small?: boolean }) {
  const swatch = keystones.find((k) => k.operatorId === operator.id)?.palette ?? ["#3a3a3a", "#1f1f1f"];
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center font-semibold text-white", small ? "size-8 rounded-md text-xs" : "size-9 rounded-md text-sm")}
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
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
              e.slug === selected ? "border-ring bg-secondary" : "hover:bg-secondary/50"
            )}
          >
            <Thumb keystone={e} className="size-8 rounded-md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{e.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
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
            className={cn(
              "group rounded-lg border p-2 text-left transition-colors",
              e.slug === selected ? "border-ring bg-secondary" : "hover:bg-secondary/50"
            )}
          >
            <span className="relative block">
              <Thumb keystone={e} className="aspect-[4/5] w-full rounded-md" />
              {e.phase && e.phase !== "past" && (
                <span className="absolute left-1.5 top-1.5">
                  <PhaseBadge phase={e.phase} />
                </span>
              )}
            </span>
            <span className="mt-2 block truncate text-sm font-medium">{e.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
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
