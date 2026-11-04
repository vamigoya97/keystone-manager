"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import type { Keystone } from "@/lib/keystones";
import { passTokenJson, type PassContent, type PassMetadata } from "@/lib/passMetadata";
import { contractLinks } from "@/lib/links";
import { MEDIA_MAX_BYTES, VIDEO_MAX_SECONDS } from "@/lib/theme";
import { useAuthedFetch } from "@/lib/useAccess";
import TokenCard from "@/components/nfc/TokenCard";
import type { Detail } from "./AdminApp";
import { uploadImages } from "./GalleryTab";
import { Badge, Button, Notice, Panel, shortAddr, useAdminApi, useCopy } from "./ui";

type Estimate = { gas: string; costEth: string; affordable: boolean };
type TxResult = { hash: string; explorerUrl: string };

/** ipfs://<cid> → gateway URL for previews. */
function ipfsToHttp(uri: string): string {
  if (!uri.startsWith("ipfs://")) return uri;
  const gw = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "ipfs.io";
  return `https://${gw}/ipfs/${uri.slice(7)}`;
}

/**
 * Keystone artwork with a live card preview. `preview` overlays unsaved
 * details (name, colors, dates) from the Details form.
 */
const ARTWORK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "video/mp4", "video/webm"];

/** Upload keystone artwork: an image, or a looping video plus its first frame as the still image. */
async function uploadArtwork(authedFetch: ReturnType<typeof useAuthedFetch>, slug: string, file: File): Promise<Keystone> {
  if (!ARTWORK_TYPES.includes(file.type)) throw new Error("Use PNG, JPG, WebP, GIF, AVIF, MP4 or WebM");
  if (!file.type.startsWith("video/")) return uploadImages(authedFetch, slug, [file], "token");
  if (file.size > MEDIA_MAX_BYTES) throw new Error(`Keep looping artwork under ${MEDIA_MAX_BYTES / 1024 / 1024} MB`);
  const { still, width, height, duration } = await firstFrame(file);
  if (duration > VIDEO_MAX_SECONDS + 0.5) throw new Error(`Keep looping artwork to ${VIDEO_MAX_SECONDS} seconds or less (this one is ${Math.round(duration)} s)`);
  return uploadImages(authedFetch, slug, [file, still], "token", [{ width, height, duration }, { width, height }]);
}

/** The video's first frame as a JPEG, plus its size and length. */
async function firstFrame(file: File): Promise<{ still: File; width: number; height: number; duration: number }> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      v.onloadeddata = () => resolve();
      v.onerror = () => reject(new Error("This video can't be read in the browser; try an MP4 (H.264)"));
    });
    v.currentTime = Math.min(0.1, (v.duration || 0) / 2);
    await new Promise<void>((resolve) => (v.onseeked = () => resolve()));
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    if (!blob) throw new Error("Couldn't capture a still frame from this video");
    const still = new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-still.jpg`, { type: "image/jpeg" });
    return { still, width: v.videoWidth, height: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ArtworkPanel({
  keystone,
  preview,
  onChange,
}: {
  keystone: Keystone;
  preview: Keystone;
  onChange: (next?: Partial<Detail>) => void;
}) {
  const api = useAdminApi();
  const authedFetch = useAuthedFetch();
  const art = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="Keystone artwork">
      <TokenCard keystone={preview} />
      <input
        ref={art}
        type="file"
        accept={ARTWORK_TYPES.join(",")}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) run("art", async () => onChange({ keystone: await uploadArtwork(authedFetch, keystone.slug, f) }));
        }}
      />
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" busy={busy === "art"} onClick={() => art.current?.click()}>
          {keystone.tokenImage ? "Replace artwork" : "Upload image or video"}
        </Button>
        {keystone.tokenImage && (
          <Button
            busy={busy === "placeholder"}
            onClick={() =>
              run("placeholder", async () =>
                onChange({
                  keystone: await api<Keystone>(`/api/admin/keystones/${keystone.slug}`, { method: "PATCH", json: { tokenImage: null } }),
                })
              )
            }
          >
            Use placeholder
          </Button>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <p className="mt-2 text-[11px] text-text-muted">
        An image, or a looping MP4/WebM up to {VIDEO_MAX_SECONDS} s. Pinned publicly to IPFS; its content address
        (ipfs://…) is what gets committed on chain. A video is committed as animation_url, with its first frame as the image.
      </p>
    </Panel>
  );
}

/** Where to look the contract up: BaseScan (contract, token tracker, deployment, first keystone) and, on Base mainnet, OpenSea. */
function ContractLinks({ address, deployTx, minted }: { address: string; deployTx?: string; minted: number }) {
  const l = contractLinks(address);
  const link = "inline-flex items-center gap-1 rounded-lg border border-border-subtle px-2.5 py-1.5 text-text-secondary hover:border-border-default hover:text-text-primary hover:no-underline";
  const scan: [string, string][] = [
    ["Contract", l.scanContract],
    ["Token tracker", l.scanToken],
    ...(deployTx ? ([["Deployment tx", l.scanTx(deployTx)]] as [string, string][]) : []),
    ...(minted > 0 ? ([["Keystone #1", l.scanNft(1)]] as [string, string][]) : []),
  ];
  const opensea: [string, string][] = l.opensea
    ? [["Collection", l.opensea.collection], ...(minted > 0 ? ([["Keystone #1", l.opensea.token(1)]] as [string, string][]) : [])]
    : [];
  const row = (name: string, links: [string, string][]) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-36 shrink-0 text-[11px] uppercase tracking-[0.14em] text-text-muted">{name}</span>
      {links.map(([label, href]) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={link}>
          {label} ↗
        </a>
      ))}
    </div>
  );
  return (
    <div className="mt-4 space-y-2 border-t border-border-subtle pt-4 text-[12px]">
      {row(l.scanName, scan)}
      {l.opensea ? (
        <>
          {row("OpenSea", opensea)}
          {minted === 0 && <p className="text-[11px] text-text-muted">OpenSea lists the collection once the first keystone is forged.</p>}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-36 shrink-0 text-[11px] uppercase tracking-[0.14em] text-text-muted">OpenSea</span>
          <span className="text-[11px] text-text-muted">
            OpenSea doesn&apos;t list testnets. The link appears here when keystones are deployed on Base mainnet.
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The keystone's on-chain contract. Before a deploy: create one from the saved
 * Details. After: its status, on-chain metadata (write / lock) and transfer
 * rule, plus the option to deploy a replacement.
 */
export default function ContractSection({
  detail,
  unsaved,
  onChange,
}: {
  detail: Detail;
  /** The Details form has unsaved edits; the contract only ever uses saved details. */
  unsaved: boolean;
  onChange: (next?: Partial<Detail>) => void;
}) {
  const { keystone, tokenStats } = detail;
  const { token } = keystone;
  const { copy, copied } = useCopy();
  const [lastTx, setLastTx] = useState<TxResult | null>(null);
  const onchain = tokenStats?.onchain ?? null;
  const done = (tx: TxResult) => {
    setLastTx(tx);
    onChange();
  };

  return (
    <div className="space-y-4">
      {lastTx && (
        <Notice>
          Transaction confirmed.{" "}
          <a href={lastTx.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-accent">
            View on explorer ↗
          </a>
        </Notice>
      )}
      {token.address && (
        <Panel
          title="Contract"
          action={
            <div className="flex gap-1.5">
              {onchain?.transferable === false && <Badge>Non-transferable</Badge>}
              {onchain && (onchain.frozen ? <Badge>Metadata locked</Badge> : <Badge tone="warn">Metadata editable</Badge>)}
              <Badge tone="good">Live</Badge>
            </div>
          }
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
            <Stat label="Address">
              <button onClick={() => copy(token.address!)} className="font-mono hover:text-accent">
                {copied === token.address ? "Copied" : shortAddr(token.address)}
              </button>
            </Stat>
            <Stat label="Standard">{token.standard === "erc721" ? "ERC-721" : "ERC-20"}</Stat>
            <Stat label="Symbol">${token.symbol}</Stat>
            <Stat label="Minted">{tokenStats?.totalSupply ?? "—"}</Stat>
          </dl>
          {onchain && onchain.transferable !== null && (
            <TransferControl slug={keystone.slug} transferable={onchain.transferable} locked={!!onchain.transferRuleFrozen} onDone={done} />
          )}
          {onchain && (
            <OnchainMetadata
              keystone={keystone}
              pass={detail.pass}
              onchainName={tokenStats?.name ?? null}
              onchain={onchain}
              unsaved={unsaved}
              onDone={done}
            />
          )}
          {!tokenStats && <p className="mt-4 text-[12px] text-text-muted">Couldn&apos;t reach the network to read the contract.</p>}
          <ContractLinks address={token.address} deployTx={token.deployTx} minted={Number(tokenStats?.totalSupply ?? 0)} />
        </Panel>
      )}
      <CreatePass
        keystone={keystone}
        pass={detail.pass}
        unsaved={unsaved}
        replacing={!!keystone.token.address}
        onDeployed={(exp, tx) => {
          setLastTx(tx);
          onChange({ keystone: exp });
        }}
      />
    </div>
  );
}

/** Form to deploy a KeystonePass with image + text committed on chain. */
function CreatePass({
  keystone,
  pass,
  unsaved,
  replacing,
  onDeployed,
}: {
  keystone: Keystone;
  /** What the contract will commit, built server-side from the saved Details. */
  pass: Detail["pass"];
  unsaved: boolean;
  replacing: boolean;
  onDeployed: (exp: Keystone, tx: TxResult) => void;
}) {
  const api = useAdminApi();
  const [open, setOpen] = useState(!replacing);
  // Text and artwork come from the saved Details; only the contract rules are chosen here.
  const [f, setF] = useState({ freeze: false, transferable: false });
  const name = "error" in pass ? keystone.name : pass.name;
  const symbol = "error" in pass ? keystone.token.symbol : pass.symbol;
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `/api/admin/keystones/${keystone.slug}/deploy`;

  // Re-estimate gas (debounced) whenever the on-chain payload changes.
  const payload = JSON.stringify(pass);
  useEffect(() => {
    if (!open) return;
    setEstimating(true);
    const t = setTimeout(() => {
      api<{ estimate: Estimate }>(url, { method: "POST", json: { ...f, estimateOnly: true } })
        .then((d) => {
          setEstimate(d.estimate);
          setError(null);
        })
        .catch((e) => {
          setEstimate(null);
          setError(e.message);
        })
        .finally(() => setEstimating(false));
    }, 700);
    return () => clearTimeout(t);
  }, [open, f, payload, url, api]);

  async function deploy() {
    const lines = [
      `Deploy "${name}" ($${symbol}) on chain?`,
      estimate ? `Estimated cost: ~${Number(estimate.costEth).toFixed(6)} ETH from the operator wallet.` : "",
      f.freeze ? "Metadata will be LOCKED forever and can never be edited." : "",
      f.transferable
        ? "Keystones will be TRANSFERABLE: holders can sell, gift or move them."
        : "Keystones will be NON-TRANSFERABLE: they stay in the wallet they're minted to.",
      replacing ? "This replaces the current contract — holders of the old token lose access." : "",
    ].filter(Boolean);
    if (!confirm(lines.join("\n\n"))) return;

    setDeploying(true);
    setError(null);
    try {
      const d = await api<{ keystone: Keystone } & TxResult>(url, { method: "POST", json: f });
      onDeployed(d.keystone, { hash: d.hash, explorerUrl: d.explorerUrl });
      setOpen(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeploying(false);
    }
  }

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <Panel
      title={replacing ? "Deploy a new keystone contract" : "Create keystone contract"}
      action={!open && <Button onClick={() => setOpen(true)}>{replacing ? "New contract" : "Create"}</Button>}
    >
      <p className="text-[13px] leading-relaxed text-text-secondary">
        Deploys a <span className="text-text-primary">KeystonePass</span> (ERC-721) owned by the operator
        wallet: members claim for free and only the operator can mint. The saved details and artwork are{" "}
        <span className="text-text-primary">stored in the contract itself</span>, so wallets and marketplaces read
        the keystone straight from the chain. To change the text, edit Details above.
      </p>

      {open && (
        <div className="mt-5 space-y-4">
          {"error" in pass ? (
            <Notice tone="bad">{pass.error}</Notice>
          ) : (
            <TokenUriPreview title={`tokenURI(1) · $${symbol}`} json={passTokenJson(pass, 1)} />
          )}
          {unsaved && <Notice tone="warn">Details has unsaved changes. Save them first; the contract uses the saved details.</Notice>}

          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-text-secondary">
            <input
              type="checkbox"
              checked={!f.transferable}
              onChange={(e) => set("transferable", !e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#C8FF2E]"
            />
            <span>
              Non-transferable keystones
              <span className="block text-[11px] text-text-muted">
                On by default: keystones stay in the wallet they&apos;re minted to — no selling, gifting or moving.
                Enforced by the contract. Untick to allow transfers; you can change this later unless you lock it.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-text-secondary">
            <input
              type="checkbox"
              checked={f.freeze}
              onChange={(e) => set("freeze", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#C8FF2E]"
            />
            <span>
              Lock metadata at deploy
              <span className="block text-[11px] text-text-muted">
                Name, artwork and text can never be changed. Leave off to edit later (you can still lock it any time).
              </span>
            </span>
          </label>

          {error && <Notice tone="bad">{error}</Notice>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <span className="text-[12px] text-text-secondary">
              {estimating ? (
                "Estimating cost…"
              ) : estimate ? (
                <>
                  ≈ <span className="text-text-primary">{Number(estimate.costEth).toFixed(6)} ETH</span> paid by the
                  operator wallet ({Number(estimate.gas).toLocaleString()} gas)
                  {!estimate.affordable && <span className="text-amber"> · wallet balance too low</span>}
                </>
              ) : null}
            </span>
            <div className="flex gap-2">
              {replacing && <Button onClick={() => setOpen(false)}>Cancel</Button>}
              <Button
                variant="primary"
                busy={deploying}
                disabled={unsaved || "error" in pass || estimate?.affordable === false}
                onClick={deploy}
              >
                {deploying ? "Deploying…" : "Deploy contract"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** The tokenURI JSON a holder's wallet or marketplace reads, with the artwork beside it. */
function TokenUriPreview({ title, json }: { title: string; json: Record<string, unknown> }) {
  const image = typeof json.image === "string" ? json.image : "";
  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-surface">
      <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2">
        {image ? (
          <img src={ipfsToHttp(image)} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="h-8 w-8 shrink-0 rounded-md bg-surface-elevated" />
        )}
        <span className="font-mono text-[11px] text-text-secondary">{title}</span>
        {!image && <span className="ml-auto text-[11px] text-amber">No artwork yet</span>}
      </div>
      <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-[11px] leading-relaxed text-text-secondary [overflow-wrap:anywhere]">
        {JSON.stringify(json, null, 2)}
      </pre>
    </div>
  );
}

const FIELD_LABELS: Record<keyof PassMetadata, string> = {
  description: "description",
  image: "artwork",
  inscription: "inscription",
  externalUrl: "external link",
  animationUrl: "animation",
  backgroundColor: "background color",
  attributes: "attributes",
};

/**
 * What the contract has committed on chain. While unlocked, writes the
 * metadata built from the saved Details when it differs from the chain.
 */
function OnchainMetadata({
  keystone,
  pass,
  onchainName,
  onchain,
  unsaved,
  onDone,
}: {
  keystone: Keystone;
  pass: Detail["pass"];
  onchainName: string | null;
  onchain: PassMetadata & { frozen: boolean; transferable: boolean | null };
  unsaved: boolean;
  onDone: (tx: TxResult) => void;
}) {
  const api = useAdminApi();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/admin/keystones/${keystone.slug}/metadata`;

  const changed =
    "error" in pass
      ? []
      : (Object.keys(FIELD_LABELS) as (keyof PassMetadata)[])
          // An empty new image keeps the one on chain.
          .filter((k) => !(k === "image" && !pass.metadata.image) && pass.metadata[k] !== onchain[k])
          .map((k) => FIELD_LABELS[k]);
  const nameDiffers = !!onchainName && onchainName !== keystone.name;
  const committed: PassContent = { name: onchainName ?? keystone.name, symbol: keystone.token.symbol, metadata: onchain };

  async function send(action: "update" | "freeze") {
    if (action === "freeze" && !confirm("Lock the on-chain metadata forever? This can't be undone.")) return;
    setBusy(action);
    setError(null);
    try {
      onDone(await api<TxResult>(url, { method: "POST", json: { action } }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.14em] text-text-secondary">Committed on chain</span>
        {!onchain.frozen && (
          <Button className="h-8" busy={busy === "freeze"} onClick={() => send("freeze")}>
            Lock forever
          </Button>
        )}
      </div>
      <TokenUriPreview title="tokenURI(1)" json={passTokenJson(committed, 1)} />
      {"error" in pass && <Notice tone="bad">{pass.error}</Notice>}
      {!onchain.frozen && changed.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-dim px-3 py-2.5">
          <span className="text-[12px] text-text-secondary">
            Details differ from the chain: <span className="text-text-primary">{changed.join(", ")}</span>.
            {unsaved && " Save Details first."}
          </span>
          <Button className="h-8" variant="primary" busy={busy === "update"} disabled={unsaved} onClick={() => send("update")}>
            Write details to chain
          </Button>
        </div>
      )}
      {onchain.frozen && changed.length > 0 && (
        <p className="text-[12px] text-text-muted">Metadata is locked, so Details changes ({changed.join(", ")}) stay off chain.</p>
      )}
      {nameDiffers && (
        <p className="text-[12px] text-text-muted">
          The contract name stays &ldquo;{onchainName}&rdquo;: names and symbols are fixed at deploy. The new name shows everywhere in the app.
        </p>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}

/** Allow/block wallet-to-wallet transfers on the keystone contract, or lock the rule. */
function TransferControl({
  slug,
  transferable,
  locked,
  onDone,
}: {
  slug: string;
  transferable: boolean;
  locked: boolean;
  onDone: (tx: TxResult) => void;
}) {
  const api = useAdminApi();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/admin/keystones/${slug}/transfers`;

  async function send(json: object, confirmText: string, label: string) {
    if (!confirm(confirmText)) return;
    setBusy(label);
    setError(null);
    try {
      onDone(await api<TxResult>(url, { method: "POST", json }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-border-subtle bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-text-secondary">Transfers</span>
            {transferable ? <Badge tone="good">Allowed</Badge> : <Badge>Blocked</Badge>}
            {locked && <Badge>Locked forever</Badge>}
          </div>
          <p className="mt-1.5 text-[12px] text-text-muted">
            {transferable
              ? "Holders can sell, gift or move their keystone to another wallet."
              : "Keystones stay in the wallet they were minted to. You can still revoke by burning."}
          </p>
        </div>
        {!locked && (
          <div className="flex gap-2">
            <Button
              className="h-8"
              busy={busy === "set"}
              onClick={() =>
                send(
                  { action: "set", transferable: !transferable },
                  transferable
                    ? "Block transfers? Every existing and future keystone becomes non-transferable."
                    : "Allow transfers? Holders will be able to sell or move their keystones.",
                  "set"
                )
              }
            >
              {transferable ? "Make non-transferable" : "Allow transfers"}
            </Button>
            <Button
              className="h-8"
              busy={busy === "freeze"}
              onClick={() =>
                send(
                  { action: "freeze" },
                  `Lock this rule forever? Transfers will be permanently ${transferable ? "allowed" : "blocked"}.`,
                  "freeze"
                )
              }
            >
              Lock rule
            </Button>
          </div>
        )}
      </div>
      {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
