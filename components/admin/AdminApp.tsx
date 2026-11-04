"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  slugify,
  type Keystone,
  type ItemBatch,
  type Member,
  type Operator,
} from "@/lib/keystones";
import type { PassContent, PassMetadata } from "@/lib/passMetadata";
import { Badge, Button, Field, Notice, inputClass, shortAddr, useAdminApi, useCopy } from "./ui";
import GalleryTab from "./GalleryTab";
import MembersTab from "./MembersTab";
import DetailsTab from "./DetailsTab";
import CustomizeTab from "./CustomizeTab";
import ItemsTab from "./ItemsTab";
import OperatorPanel, { PhaseBadge, newestFirst, type AdminKeystone } from "./OperatorPanel";

type Wallet =
  | {
      address: string;
      chain: string;
      balanceEth: string;
      costPerMintEth: string;
      mintsRemaining: number | null;
      explorerUrl: string;
    }
  | { error: string };

export type Detail = {
  keystone: Keystone;
  tokenStats: {
    name: string | null;
    totalSupply: string | null;
    explorerUrl: string;
    onchain: (PassMetadata & {
      frozen: boolean;
      /** null when the contract predates the transfer lock. */
      transferable: boolean | null;
      transferRuleFrozen: boolean | null;
    }) | null;
  } | null;
  members: Member[];
  /** What this keystone would commit on chain now, from its saved Details (or why it can't). */
  pass: PassContent | { error: string };
};

const TABS = ["Details", "Customize", "Gallery", "Items", "Members"] as const;
type Tab = (typeof TABS)[number];

const LOW_RUNWAY = 50;
const OPERATOR_KEY = "operator.selected";

export default function AdminApp() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const api = useAdminApi();

  const [operators, setOperators] = useState<Operator[] | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [keystones, setKeystones] = useState<AdminKeystone[]>([]);
  const [itemBatches, setItemBatches] = useState<ItemBatch[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [gateError, setGateError] = useState<{ status?: number; message: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>("Details");
  const [creating, setCreating] = useState(false);
  const [addingOperator, setAddingOperator] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const data = await api<{ operators: Operator[]; keystones: AdminKeystone[]; itemBatches: ItemBatch[]; wallet: Wallet }>(
        "/api/admin/overview"
      );
      setOperators(data.operators);
      setKeystones(data.keystones);
      setItemBatches(data.itemBatches ?? []);
      setWallet(data.wallet);
      setGateError(null);
      setOperatorId((current) => {
        if (current && data.operators.some((o) => o.id === current)) return current;
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(OPERATOR_KEY);
        } catch {}
        return data.operators.find((o) => o.id === saved)?.id ?? data.operators[0]?.id ?? null;
      });
    } catch (e: any) {
      setGateError({ status: e.status, message: e.message });
    }
  }, [api]);

  const loadDetail = useCallback(
    async (slug: string) => {
      try {
        setDetail(await api<Detail>(`/api/admin/keystones/${slug}`));
      } catch (e: any) {
        setGateError({ status: e.status, message: e.message });
      }
    },
    [api]
  );

  useEffect(() => {
    if (ready && authenticated) loadOverview();
  }, [ready, authenticated, loadOverview]);

  const operator = operators?.find((o) => o.id === operatorId) ?? null;
  const operatorTokens = useMemo(() => newestFirst(keystones.filter((e) => e.operatorId === operatorId)), [keystones, operatorId]);

  // Keep the selected keystone inside the current operator.
  useEffect(() => {
    if (!operatorId) return;
    try {
      localStorage.setItem(OPERATOR_KEY, operatorId);
    } catch {}
    setSelected((s) => (s && operatorTokens.some((e) => e.slug === s) ? s : operatorTokens[0]?.slug ?? null));
  }, [operatorId, operatorTokens]);

  useEffect(() => {
    if (selected && authenticated) {
      setDetail(null);
      loadDetail(selected);
    } else setDetail(null);
  }, [selected, authenticated, loadDetail]);

  /** Children call this after any mutation so lists + counts stay fresh. */
  const onChange = useCallback(
    (next?: Partial<Detail>) => {
      if (next) setDetail((d) => (d ? { ...d, ...next } : d));
      // A rename moves the keystone to a new slug: follow it (the selection effect reloads it).
      const slug = next?.keystone?.slug;
      if (slug && slug !== selected) setSelected(slug);
      else if (selected) loadDetail(selected);
      loadOverview();
    },
    [selected, loadDetail, loadOverview]
  );

  // ── Gates ─────────────────────────────────────────────────────
  if (!ready) return <Centered><Spinner /></Centered>;

  if (!authenticated) {
    return (
      <Centered>
        <div className="w-full max-w-sm text-center">
          <Logo />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Operator console</h1>
          <p className="mt-2 text-sm text-text-secondary">Sign in with an operator phone number, email or wallet.</p>
          <Button variant="primary" className="mt-8 h-12 w-full text-[14px]" onClick={login}>
            Sign in
          </Button>
        </div>
      </Centered>
    );
  }

  if (gateError && !operators) {
    const who =
      user?.phone?.number || user?.email?.address || (user?.wallet?.address && shortAddr(user.wallet.address));
    return (
      <Centered>
        <div className="w-full max-w-sm text-center">
          <Logo />
          <h1 className="mt-6 text-xl font-semibold">
            {gateError.status === 403 ? "Not an operator" : "Can't open the console"}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {gateError.status === 403 ? `${who ?? "This account"} isn't on the operator list.` : gateError.message}
          </p>
          <Button className="mt-8" onClick={() => logout()}>
            Sign out
          </Button>
        </div>
      </Centered>
    );
  }

  if (!operators) return <Centered><Spinner /></Centered>;

  const current = operatorTokens.find((e) => e.slug === selected);

  // ── Console ───────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-surface">
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo small />
            <span className="text-[12px] uppercase tracking-[0.25em] text-text-secondary">Operator console</span>
            <GasWalletMenu wallet={wallet} />
          </div>
          <button
            onClick={() => logout()}
            className="rounded-lg px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-raised hover:text-text-primary"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {!operator ? (
          <Notice>
            No operators yet.{" "}
            <button onClick={() => setAddingOperator(true)} className="text-accent hover:underline">
              Add one
            </button>{" "}
            to start issuing keystones.
          </Notice>
        ) : (
          <>
            <OperatorPanel
              operators={operators}
              operator={operator}
              keystones={operatorTokens}
              allKeystones={keystones}
              selected={selected}
              onOperator={setOperatorId}
              onAddOperator={() => setAddingOperator(true)}
              onSelect={(slug) => setSelected(slug)}
              onCreate={() => setCreating(true)}
            />

            {current && (
              <div>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{operator.name}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-tight">{current.name}</h1>
                      {current.phase && <PhaseBadge phase={current.phase} />}
                    </div>
                    <a
                      href={`/x/${current.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-text-muted hover:text-text-secondary"
                    >
                      /x/{current.slug} ↗
                    </a>
                  </div>
                  <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border-subtle bg-surface-raised p-1">
                    {TABS.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`shrink-0 rounded-lg px-3.5 py-1.5 text-[12px] transition-colors ${
                          tab === t ? "bg-surface-elevated text-text-primary" : "text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </nav>
                </div>

                {!detail ? (
                  <div className="h-64 animate-pulse rounded-2xl bg-surface-raised" />
                ) : tab === "Gallery" ? (
                  <GalleryTab detail={detail} onChange={onChange} />
                ) : tab === "Items" ? (
                  <ItemsTab
                    key={current.slug}
                    detail={detail}
                    operator={operator}
                    keystones={operatorTokens}
                    batches={itemBatches.filter((b) => b.operatorId === operator.id)}
                    onChange={onChange}
                    onItemsChange={loadOverview}
                  />
                ) : tab === "Members" ? (
                  <MembersTab detail={detail} onChange={onChange} />
                ) : tab === "Details" ? (
                  <DetailsTab key={current.slug} detail={detail} onChange={onChange} />
                ) : (
                  <CustomizeTab key={current.slug} detail={detail} onChange={onChange} />
                )}
              </div>
            )}
          </>
        )}
      </main>

      {creating && operator && (
        <NewKeystone
          operator={operator}
          onClose={() => setCreating(false)}
          onCreated={(slug) => {
            setCreating(false);
            loadOverview().then(() => {
              setSelected(slug);
              setTab("Details");
            });
          }}
        />
      )}

      {addingOperator && (
        <NewOperator
          onClose={() => setAddingOperator(false)}
          onCreated={(id) => {
            setAddingOperator(false);
            loadOverview().then(() => setOperatorId(id));
          }}
        />
      )}
    </div>
  );
}

function NewOperator({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const api = useAdminApi();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/operators", { method: "POST", json: { id, name } });
      onCreated(id);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl border border-border-default bg-[#111] p-6">
        <div>
          <h2 className="text-lg font-semibold">New operator</h2>
          <p className="mt-1 text-[12px] text-text-secondary">A creator, community or brand that issues keystones.</p>
        </div>
        <Field label="Name">
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!idTouched) setId(slug(e.target.value));
            }}
            placeholder="GOAT community"
          />
        </Field>
        <Field label="ID" hint="Used internally; lowercase letters, numbers and dashes">
          <input
            className={`${inputClass} font-mono`}
            value={id}
            onChange={(e) => {
              setIdTouched(true);
              setId(slug(e.target.value));
            }}
            placeholder="goat"
          />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name || !id}>Create</Button>
        </div>
      </form>
    </div>
  );
}

/**
 * The operator wallet that pays every mint, as a compact button in the top bar
 * (balance, plus a warning when it's low or unreachable) that opens the details.
 */
function GasWalletMenu({ wallet }: { wallet: Wallet | null }) {
  const { copy, copied } = useCopy();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

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

  if (!wallet) return null;
  const failed = "error" in wallet;
  const low = !failed && wallet.mintsRemaining !== null && wallet.mintsRemaining < LOW_RUNWAY;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex h-8 items-center gap-2 rounded-full border px-3 text-[12px] transition-colors ${
          failed ? "border-rose/40 text-rose" : low ? "border-amber/40 text-amber" : "border-border-default text-text-secondary hover:text-text-primary"
        }`}
      >
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${failed ? "bg-rose" : low ? "bg-amber" : "bg-accent"}`} />
        {failed ? "Gas wallet unavailable" : (
          <>
            <span className="font-mono tabular-nums">{Number(wallet.balanceEth).toFixed(4)} ETH</span>
            <span className="hidden text-text-muted sm:inline">· Gas wallet</span>
            {low && <span className="font-medium">· Low</span>}
          </>
        )}
        <span aria-hidden className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div role="dialog" aria-label="Gas wallet" className="absolute left-0 top-full z-40 mt-2 w-[320px] rounded-2xl border border-border-default bg-[#141414] p-4 shadow-2xl">
          {failed ? (
            <Notice tone="bad">{wallet.error}</Notice>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-text-secondary">
                Gas wallet · {wallet.chain}
                {low && <Badge tone="warn">Low</Badge>}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{Number(wallet.balanceEth).toFixed(4)}</span>
                <span className="text-[12px] text-text-secondary">ETH</span>
              </div>
              <p className="mt-1 text-[12px] text-text-muted">
                Pays every member mint. ≈{" "}
                <span className={low ? "text-amber" : "text-text-secondary"}>{wallet.mintsRemaining?.toLocaleString() ?? "—"} mints</span> left at
                current gas.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => copy(wallet.address)}
                  className="flex-1 rounded-xl border border-border-default px-3 py-2 font-mono text-[12px] hover:bg-surface-elevated"
                  title="Copy address to fund this wallet"
                >
                  {copied === wallet.address ? "Copied" : `Copy ${shortAddr(wallet.address)}`}
                </button>
                <a
                  href={wallet.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl px-3 py-2 text-[12px] text-text-secondary hover:bg-surface-elevated hover:text-text-primary hover:no-underline"
                >
                  Explorer ↗
                </a>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">Send {wallet.chain} ETH to this address to top it up.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NewKeystone({
  operator,
  onClose,
  onCreated,
}: {
  operator: Operator;
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const api = useAdminApi();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/keystones", {
        method: "POST",
        json: { operatorId: operator.id, name, slug },
      });
      onCreated(slug);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-2xl border border-border-default bg-[#111] p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">New keystone</h2>
          <p className="mt-1 text-[12px] text-text-secondary">
            Holders tap an item to claim it and unlock its gallery. For <span className="text-text-primary">{operator.name}</span>.
          </p>
        </div>
        <Field label="Name">
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            placeholder="Night One"
          />
        </Field>
        <Field label="URL name" hint={<>Members&apos; link: <span className="font-mono">/x/{slug || "…"}</span></>}>
          <input
            className={`${inputClass} font-mono`}
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="night-one"
          />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name || !slug}>
            Create
          </Button>
        </div>
      </form>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-surface px-5">{children}</div>;
}

function Spinner() {
  return <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />;
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`mx-auto flex items-center justify-center rounded-xl bg-accent font-bold text-surface ${
        small ? "h-7 w-7 text-[12px]" : "h-12 w-12 text-lg"
      }`}
    >
      M
    </div>
  );
}
