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
import { ChevronDownIcon, CopyIcon, ExternalLinkIcon, Loader2Icon, LogOutIcon } from "lucide-react";
import { Button as UiButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Badge, Button, ConsoleRoot, Field, Notice, TabBar, shortAddr, useAdminApi, useCopy } from "./ui";
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

/** The console at /operator: Privy sign-in and the operator check, then the console itself. */
export default function AdminApp() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const [gate, setGate] = useState<{ status?: number; message: string } | null>(null);

  if (!ready) return <Centered><Spinner /></Centered>;

  if (!authenticated) {
    return (
      <Centered>
        <div className="w-full max-w-sm text-center">
          <Logo />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Operator console</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in with an operator phone number, email or wallet.</p>
          <Button variant="primary" className="mt-8 h-12 w-full text-sm" onClick={login}>
            Sign in
          </Button>
        </div>
      </Centered>
    );
  }

  if (gate) {
    const who =
      user?.phone?.number || user?.email?.address || (user?.wallet?.address && shortAddr(user.wallet.address));
    return (
      <Centered>
        <div className="w-full max-w-sm text-center">
          <Logo />
          <h1 className="mt-6 text-xl font-semibold">
            {gate.status === 403 ? "Not an operator" : "Can't open the console"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {gate.status === 403 ? `${who ?? "This account"} isn't on the operator list.` : gate.message}
          </p>
          <Button className="mt-8" onClick={() => logout()}>
            Sign out
          </Button>
        </div>
      </Centered>
    );
  }

  return (
    <ConsoleRoot>
      <OperatorConsole onSignOut={() => logout()} onGateError={setGate} />
    </ConsoleRoot>
  );
}

/**
 * The console once signed in: operators and their keystones, then the
 * selected keystone's tabs. All data comes through useAdminApi, so the design
 * lab can run it on sample data (AdminApiOverride).
 */
export function OperatorConsole({
  onSignOut,
  onGateError,
}: {
  onSignOut: () => void;
  /** The first load failed (not an operator, or the server is unreachable). */
  onGateError?: (error: { status?: number; message: string }) => void;
}) {
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
  const loaded = useRef(false);

  const loadOverview = useCallback(async () => {
    try {
      const data = await api<{ operators: Operator[]; keystones: AdminKeystone[]; itemBatches: ItemBatch[]; wallet: Wallet }>(
        "/api/admin/overview"
      );
      loaded.current = true;
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
      if (!loaded.current) onGateError?.({ status: e.status, message: e.message });
    }
  }, [api, onGateError]);

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
    loadOverview();
  }, [loadOverview]);

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
    if (selected) {
      setDetail(null);
      loadDetail(selected);
    } else setDetail(null);
  }, [selected, loadDetail]);

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

  if (!operators) {
    return <Centered>{gateError ? <Notice tone="bad">{gateError.message}</Notice> : <Spinner />}</Centered>;
  }


  const current = operatorTokens.find((e) => e.slug === selected);

  // ── Console ───────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo small />
            <span className="text-sm font-semibold">Operator console</span>
            <Separator orientation="vertical" className="!h-5" />
            <GasWalletMenu wallet={wallet} />
          </div>
          <UiButton variant="ghost" size="sm" onClick={onSignOut}>
            <LogOutIcon />
            Sign out
          </UiButton>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {!operator ? (
          <Notice>
            No operators yet.{" "}
            <button onClick={() => setAddingOperator(true)} className="font-medium text-foreground underline underline-offset-4">
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
                    <div className="text-sm text-muted-foreground">{operator.name}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-tight">{current.name}</h1>
                      {current.phase && <PhaseBadge phase={current.phase} />}
                    </div>
                    <a
                      href={`/x/${current.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                    >
                      /x/{current.slug}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </div>
                  <TabBar tabs={TABS} value={tab} onChange={setTab} />
                </div>

                {!detail ? (
                  <div className="h-64 animate-pulse rounded-xl bg-muted" />
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New operator</DialogTitle>
            <DialogDescription>A creator, community or brand that issues keystones.</DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!idTouched) setId(slug(e.target.value));
              }}
              placeholder="GOAT community"
            />
          </Field>
          <Field label="ID" hint="Used internally; lowercase letters, numbers and dashes">
            <Input
              className="font-mono"
              value={id}
              onChange={(e) => {
                setIdTouched(true);
                setId(slug(e.target.value));
              }}
              placeholder="goat"
            />
          </Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <DialogFooter>
            <Button type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" busy={busy} disabled={!name || !id}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The operator wallet that pays every mint, as a compact button in the top bar
 * (balance, plus a warning when it's low or unreachable) that opens the details.
 */
function GasWalletMenu({ wallet }: { wallet: Wallet | null }) {
  const { copy, copied } = useCopy();
  if (!wallet) return null;
  const failed = "error" in wallet;
  const low = !failed && wallet.mintsRemaining !== null && wallet.mintsRemaining < LOW_RUNWAY;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <UiButton variant="outline" size="sm" className={cn("rounded-full", failed && "text-destructive", low && "text-amber")}>
          <span aria-hidden className={cn("size-1.5 rounded-full", failed ? "bg-destructive" : low ? "bg-amber" : "bg-emerald")} />
          {failed ? (
            "Gas wallet unavailable"
          ) : (
            <>
              <span className="font-mono tabular-nums">{Number(wallet.balanceEth).toFixed(4)} ETH</span>
              <span className="hidden text-muted-foreground sm:inline">Gas wallet</span>
              {low && <span className="font-medium">Low</span>}
            </>
          )}
          <ChevronDownIcon className="text-muted-foreground" />
        </UiButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        {failed ? (
          <Notice tone="bad">{wallet.error}</Notice>
        ) : (
          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Gas wallet on {wallet.chain}
              {low && <Badge tone="warn">Low</Badge>}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">{Number(wallet.balanceEth).toFixed(4)}</span>
              <span className="text-sm text-muted-foreground">ETH</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Pays every member mint: about{" "}
              <span className={low ? "text-amber" : "text-foreground"}>{wallet.mintsRemaining?.toLocaleString() ?? "—"} mints</span> left at
              current gas.
            </p>
            <div className="flex items-center gap-2">
              <UiButton variant="outline" size="sm" className="flex-1 font-mono" onClick={() => copy(wallet.address)} title="Copy address to fund this wallet">
                <CopyIcon />
                {copied === wallet.address ? "Copied" : shortAddr(wallet.address)}
              </UiButton>
              <UiButton variant="ghost" size="sm" asChild>
                <a href={wallet.explorerUrl} target="_blank" rel="noopener noreferrer">
                  Explorer
                  <ExternalLinkIcon />
                </a>
              </UiButton>
            </div>
            <p className="text-xs text-muted-foreground">Send {wallet.chain} ETH to this address to top it up.</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New keystone</DialogTitle>
            <DialogDescription>
              Holders tap an item to claim it and unlock its vault. For <span className="text-foreground">{operator.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="Night One"
            />
          </Field>
          <Field label="URL name" hint={<>Members&apos; link: <span className="font-mono">/x/{slug || "…"}</span></>}>
            <Input
              className="font-mono"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="night-one"
            />
          </Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" busy={busy} disabled={!name || !slug}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <ConsoleRoot className="flex items-center justify-center px-5">{children}</ConsoleRoot>;
}

function Spinner() {
  return <Loader2Icon className="size-6 animate-spin text-muted-foreground" />;
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto flex items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground",
        small ? "size-7 text-xs" : "size-12 text-lg"
      )}
    >
      M
    </div>
  );
}
