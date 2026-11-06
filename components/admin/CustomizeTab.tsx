"use client";

import { useMemo, useState } from "react";
import type { ClaimStyle, Keystone, KeystoneTheme, ThemeMedia } from "@/lib/keystones";
import { CLAIM_LIMITS, claimStyle, resolveTheme, sanitizeTheme } from "@/lib/theme";
import type { AccessStatus } from "@/lib/useAccess";
import { PlateClaim, type ClaimAccess, type MintPhase } from "@/components/nfc/plate";
import type { Detail } from "./AdminApp";
import MediaPicker from "./MediaPicker";
import PhonePreview from "./PhonePreview";
import { Button, Field, Notice, Panel, inputClass, useAdminApi } from "./ui";

/** The claim screen's states as the preview shows them, numbered i–iv (the name is the tooltip). */
type PreviewState = { id: string; numeral: string; name: string; status: AccessStatus; access: ClaimAccess; phase: MintPhase };
const PREVIEW_STATES: PreviewState[] = [
  { id: "aligning", numeral: "i", name: "Aligning", status: "signed-out", access: "verifying", phase: "idle" },
  { id: "aligned", numeral: "ii", name: "Aligned: slide to secure", status: "signed-out", access: "chip", phase: "idle" },
  { id: "securing", numeral: "iii", name: "Securing (sign-in and forging)", status: "not-holder", access: "chip", phase: "minting" },
  { id: "holder", numeral: "iv", name: "Holder returns: slide to enter", status: "holder", access: null, phase: "idle" },
];

/** What this tab owns; the gallery banner is set in the Gallery tab. */
const own = (t: KeystoneTheme) => JSON.stringify(sanitizeTheme({ background: t.background, claim: t.claim }));

/**
 * The member screens' background and wording: media and color behind the
 * artwork (and under the vault's description), how dark the media gets, the
 * text color, and the aligning and not-aligned messages. A live phone preview
 * shows each claim state; slide the button there to play securing.
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
  const [previewId, setPreviewId] = useState("aligned");
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = own(theme) !== own(keystone.theme ?? {});
  const style = claimStyle(theme.claim);
  const copy = resolveTheme({ ...keystone, theme: {} }).claim;
  const state = PREVIEW_STATES.find((s) => s.id === previewId) ?? PREVIEW_STATES[1];

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

  const preview = useMemo(() => ({ ...keystone, theme }), [keystone, theme]);
  const L = CLAIM_LIMITS;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
      {/* ── Form ── */}
      <div className="min-w-0 space-y-4">
        <Panel title="Background">
          <div className="space-y-4">
            <Field label="Media" hint="Fills the claim screen behind the artwork and sits under the vault's description (9:16 works best)">
              <MediaPicker slug={keystone.slug} media={theme.background?.media} onChange={setBackground} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorInput
                label="Color"
                hint="The background without media; standard is light grey"
                value={theme.claim?.backgroundColor}
                fallback="#E5E5E2"
                onChange={(v) => setClaim("backgroundColor", v)}
              />
              <Slider label="Darken media" unit="%" value={style.dim} {...L.dim} onChange={(v) => setClaim("dim", v)} />
              <ColorInput
                label="Text color"
                hint="Vault description, attributes and the slide button; standard follows the background"
                value={theme.claim?.text?.color}
                fallback="#161616"
                onChange={(v) => setClaim("text", { color: v })}
              />
            </div>
            <p className="text-[11px] text-text-muted">Media is always darkened at least 45% so text over it stays readable.</p>
          </div>
        </Panel>

        <Panel title="Wording">
          <div className="grid gap-4 sm:grid-cols-2">
            <CopyInput label="While aligning" placeholder={copy.verifying} value={theme.claim?.alerts?.aligning} onChange={(v) => setClaim("alerts", { aligning: v })} />
            <CopyInput label="Not aligned" placeholder={copy.failed} value={theme.claim?.alerts?.failed} onChange={(v) => setClaim("alerts", { failed: v })} />
          </div>
          <p className="mt-3 text-[11px] text-text-muted">
            "While aligning" shows on the greyed-out slide button. "Not aligned" is read out and shown on the corner icon. Leave a message empty to use the standard wording shown in grey.
          </p>
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
              Reset to standard
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
          <div key={`${previewId}-${replay}`} className="h-full overflow-y-auto">
            <PlateClaim
              keystone={preview}
              status={state.status}
              access={state.access}
              phase={playing ? "minting" : state.phase}
              onClaim={() => {
                // Demo the slide: securing, then back to where it started.
                setPlaying(true);
                setTimeout(() => setPlaying(false), 1800);
              }}
              onEnter={() => {}}
              contained
            />
          </div>
        </PhonePreview>

        <div className="mt-3 flex justify-center gap-1">
          {PREVIEW_STATES.map((p) => (
            <StateChip
              key={p.id}
              active={previewId === p.id}
              title={p.name}
              onClick={() => {
                setPreviewId(p.id);
                setPlaying(false);
                setReplay((r) => r + 1);
              }}
            >
              {p.numeral}
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
