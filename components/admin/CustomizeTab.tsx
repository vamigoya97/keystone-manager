"use client";

import { useMemo, useState } from "react";
import type { ArtworkPosition, ClaimStyle, Keystone, KeystoneTheme, ThemeMedia } from "@/lib/keystones";
import { CLAIM_LIMITS, claimStyle, resolveTheme, sanitizeTheme } from "@/lib/theme";
import { ClaimView, type MintPhase } from "@/components/nfc/views";
import type { Detail } from "./AdminApp";
import MediaPicker from "./MediaPicker";
import PhonePreview from "./PhonePreview";
import { Button, Field, Notice, Panel, inputClass, useAdminApi } from "./ui";

/** Claim-screen states the preview can show. */
type ClaimState = "verifying" | MintPhase;
/** The preview's states in order, shown as i–iv (the name is the tooltip). */
const CLAIM_STATES: [ClaimState, string, string][] = [
  ["verifying", "i", "Aligning"],
  ["idle", "ii", "Ready to forge"],
  ["minting", "iii", "Forging"],
  ["minted", "iv", "Forged"],
];

/** What this tab owns; the gallery banner is set in the Gallery tab. */
const own = (t: KeystoneTheme) => JSON.stringify(sanitizeTheme({ background: t.background, claim: t.claim }));

/**
 * The claim screen's look: background media and color, the keystone
 * artwork's size, position, corners and border, the description's type, and
 * the wording and colors of the alerts and hints. A live phone preview shows
 * every state; double-tap the artwork there to play the forge.
 */
export default function CustomizeTab({
  detail,
  onChange,
}: {
  detail: Detail;
  onChange: (next?: Partial<Detail>) => void;
}) {
  const { keystone } = detail;
  const api = useAdminApi();
  const [theme, setTheme] = useState<KeystoneTheme>(keystone.theme ?? {});
  const [claimState, setClaimState] = useState<ClaimState>("idle");
  const [replay, setReplay] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = own(theme) !== own(keystone.theme ?? {});
  const style = claimStyle(theme.claim);
  const copy = resolveTheme({ ...keystone, theme: {} }).claim;

  function setBackground(m: ThemeMedia | undefined) {
    setSaved(false);
    setTheme((t) => ({ ...t, background: m ? { media: m } : undefined }));
  }

  /** Change one part of the claim styling; `undefined` resets a field to the standard look. */
  function setClaim<K extends keyof ClaimStyle>(key: K, value: ClaimStyle[K] extends object | undefined ? Partial<NonNullable<ClaimStyle[K]>> | ClaimStyle[K] : ClaimStyle[K]) {
    setSaved(false);
    setTheme((t) => {
      const c: ClaimStyle = { ...t.claim };
      const prev = c[key];
      c[key] = (value && typeof value === "object" ? { ...(prev as object), ...value } : value) as ClaimStyle[K];
      return { ...t, claim: c };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // The banner comes from the saved keystone, so changes made in the Gallery tab are kept.
      const json = { theme: { ...theme, gallery: keystone.theme?.gallery } };
      const exp = await api<Keystone>(`/api/admin/keystones/${keystone.slug}`, { method: "PATCH", json });
      setTheme(exp.theme ?? {});
      onChange({ keystone: exp });
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const preview = useMemo(() => ({ ...keystone, theme, galleryCount: keystone.gallery.length }), [keystone, theme]);
  const L = CLAIM_LIMITS;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
      {/* ── Form ── */}
      <div className="min-w-0 space-y-4">
        <Panel title="Background">
          <div className="space-y-4">
            <Field label="Full-screen media" hint="Fills the claim screen and sits behind the vault (9:16 works best)">
              <MediaPicker slug={keystone.slug} media={theme.background?.media} onChange={setBackground} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorInput
                label="Color"
                hint="Behind the media, or the whole background without one"
                value={theme.claim?.backgroundColor}
                fallback="#0A0A0A"
                onChange={(v) => setClaim("backgroundColor", v)}
              />
              <Slider label="Darken media" unit="%" value={style.dim} {...L.dim} onChange={(v) => setClaim("dim", v)} />
            </div>
          </div>
        </Panel>

        <Panel title="Keystone artwork">
          <div className="grid gap-4 sm:grid-cols-2">
            <Slider label="Size" unit="%" value={style.artwork.size} {...L.size} onChange={(v) => setClaim("artwork", { size: v })} />
            <Segmented<ArtworkPosition>
              label="Position"
              value={style.artwork.position}
              options={[["top", "Top"], ["center", "Center"], ["bottom", "Bottom"]]}
              onChange={(v) => setClaim("artwork", { position: v })}
            />
            <Slider label="Corners" unit=" px" value={style.artwork.radius} {...L.radius} onChange={(v) => setClaim("artwork", { radius: v })} />
            <Toggle label="Shadow" checked={style.artwork.shadow} onChange={(v) => setClaim("artwork", { shadow: v })} />
            <Slider label="Border" unit=" px" value={style.artwork.borderWidth} {...L.borderWidth} onChange={(v) => setClaim("artwork", { borderWidth: v })} />
            <ColorInput
              label="Border color"
              value={theme.claim?.artwork?.borderColor}
              fallback={style.artwork.borderColor}
              onChange={(v) => setClaim("artwork", { borderColor: v })}
            />
          </div>
        </Panel>

        <Panel title="Description text">
          <div className="grid gap-4 sm:grid-cols-3">
            <Slider label="Size" unit=" px" value={style.text.size} {...L.textSize} onChange={(v) => setClaim("text", { size: v })} />
            <ColorInput label="Color" value={theme.claim?.text?.color} fallback="#FFFFFF" onChange={(v) => setClaim("text", { color: v })} />
            <Segmented<"left" | "center">
              label="Alignment"
              value={style.text.align}
              options={[["left", "Left"], ["center", "Center"]]}
              onChange={(v) => setClaim("text", { align: v })}
            />
          </div>
          <p className="mt-3 text-[11px] text-text-muted">The text itself is the Details description (the one the contract stores).</p>
        </Panel>

        <Panel title="Alerts & hints">
          <div className="grid gap-4 sm:grid-cols-2">
            <CopyInput label="While aligning" placeholder={copy.verifying} value={theme.claim?.alerts?.aligning} onChange={(v) => setClaim("alerts", { aligning: v })} />
            <CopyInput label="Not aligned" placeholder={copy.failed} value={theme.claim?.alerts?.failed} onChange={(v) => setClaim("alerts", { failed: v })} />
            <CopyInput label="Hint · ready to forge" placeholder={copy.doubleTapForge} value={theme.claim?.alerts?.hintForge} onChange={(v) => setClaim("alerts", { hintForge: v })} />
            <CopyInput label="Hint · signed out" placeholder={copy.doubleTapSecure} value={theme.claim?.alerts?.hintSecure} onChange={(v) => setClaim("alerts", { hintSecure: v })} />
            <ColorInput label="Alert & hint text color" value={theme.claim?.alerts?.color} fallback="#FFFFFF" onChange={(v) => setClaim("alerts", { color: v })} />
            <ColorInput label="Alert background" value={theme.claim?.alerts?.background} fallback="#000000" onChange={(v) => setClaim("alerts", { background: v })} />
          </div>
          <p className="mt-3 text-[11px] text-text-muted">Leave a message empty to use the standard wording shown in grey.</p>
        </Panel>

        {error && <Notice tone="bad">{error}</Notice>}
        <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-2xl border border-border-subtle bg-surface/90 p-3 backdrop-blur-xl">
          {theme.claim && (
            <button
              onClick={() => {
                setSaved(false);
                setTheme((t) => ({ ...t, claim: undefined }));
              }}
              className="mr-auto text-[12px] text-text-muted hover:text-text-primary"
            >
              Reset styling to standard
            </button>
          )}
          {saved && !dirty && <span className="text-[12px] text-accent">Saved — live for members</span>}
          {dirty && <span className="text-[12px] text-text-secondary">Unsaved changes</span>}
          <Button disabled={!dirty || saving} onClick={() => setTheme(keystone.theme ?? {})}>Discard</Button>
          <Button variant="primary" busy={saving} disabled={!dirty} onClick={save}>Save customization</Button>
        </div>
      </div>

      {/* ── Live preview ── */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-text-secondary">Claim screen preview</span>
          <button onClick={() => setReplay((r) => r + 1)} className="text-[12px] text-text-secondary hover:text-text-primary">↻ Replay</button>
        </div>

        <PhonePreview>
          <div key={`${claimState}-${replay}`} className="h-full overflow-y-auto">
            <ClaimView
              keystone={preview}
              status={claimState === "minted" ? "holder" : "not-holder"}
              access={claimState === "verifying" ? "verifying" : "chip"}
              phase={claimState === "verifying" ? "idle" : claimState}
              onClaim={() => {
                // Demo the gesture: double-tap the artwork → forging → forged.
                setClaimState("minting");
                setTimeout(() => setClaimState((c) => (c === "minting" ? "minted" : c)), 1500);
              }}
              contained
            />
          </div>
        </PhonePreview>

        <div className="mt-3 flex justify-center gap-1">
          {CLAIM_STATES.map(([p, numeral, name]) => (
            <StateChip key={p} active={claimState === p} title={name} onClick={() => { setClaimState(p); setReplay((r) => r + 1); }}>
              {numeral}
            </StateChip>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Form pieces ─────────────────────────────────────────────────

function Slider({ label, value, min, max, unit = "", onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <Field label={`${label} · ${value}${unit}`}>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} className="h-9 w-full accent-[#C8FF2E]" />
    </Field>
  );
}

function ColorInput({
  label,
  hint,
  value,
  fallback,
  onChange,
}: {
  label: string;
  hint?: string;
  value?: string;
  fallback: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <span className="flex h-9 items-center gap-2">
        <input
          type="color"
          value={value ?? fallback}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-12 cursor-pointer rounded-lg border border-border-default bg-transparent p-1"
        />
        <span className="font-mono text-[12px] text-text-secondary">{value ?? "Standard"}</span>
        {value && (
          <button type="button" onClick={() => onChange(undefined)} className="text-[11px] text-text-muted hover:text-text-primary">
            Reset
          </button>
        )}
      </span>
    </Field>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-text-secondary">{label}</span>
      <div className="flex h-9 gap-1 rounded-xl border border-border-subtle bg-surface-raised p-1">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 rounded-lg text-[12px] ${value === v ? "bg-surface-elevated text-text-primary" : "text-text-secondary hover:text-text-primary"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-text-secondary">{label}</span>
      <label className="flex h-9 cursor-pointer items-center gap-2.5 text-[13px] text-text-secondary">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#C8FF2E]" />
        {checked ? "On" : "Off"}
      </label>
    </div>
  );
}

function CopyInput({ label, placeholder, value, onChange }: { label: string; placeholder: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <Field label={label}>
      <input
        className={inputClass}
        placeholder={placeholder}
        value={value ?? ""}
        maxLength={CLAIM_LIMITS.alertChars}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </Field>
  );
}

function StateChip({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={`${children} · ${title}`}
      aria-pressed={active}
      className={`min-w-[36px] rounded-full px-3 py-1 font-mono text-[11px] ${active ? "bg-accent-dim text-accent" : "text-text-muted hover:text-text-secondary"}`}
    >
      {children}
    </button>
  );
}
