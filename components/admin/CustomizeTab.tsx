"use client";

import { useMemo, useState } from "react";
import type { ClaimStyle, Keystone, KeystoneTheme, ThemeMedia } from "@/lib/keystones";
import { CLAIM_LIMITS, claimStyle, resolveTheme, sanitizeTheme } from "@/lib/theme";
import type { AccessStatus } from "@/lib/useAccess";
import { PlateClaim, type ClaimAccess, type MintPhase } from "@/components/nfc/plate";
import type { Detail } from "./AdminApp";
import MediaPicker from "./MediaPicker";
import PhonePreview from "./PhonePreview";
import { RotateCcwIcon } from "lucide-react";
import { Button as UiButton } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button, Field, Notice, Panel, useAdminApi } from "./ui";
import { Input } from "@/components/ui/input";

/**
 * The claim screen's states as the preview shows them (the name is the
 * tooltip). i–iv are the four steps of a claim, numbered like their wording
 * fields: tap the keystone, slide to secure, log in, and the vault opens with
 * no second slide. v is a holder coming back.
 */
type PreviewState = { id: string; numeral: string; name: string; status: AccessStatus; access: ClaimAccess; phase: MintPhase; securing?: boolean };
const PREVIEW_STATES: PreviewState[] = [
  { id: "tap", numeral: "i", name: "Keystone tapped: aligning", status: "signed-out", access: "verifying", phase: "idle" },
  { id: "slide", numeral: "ii", name: "Aligned: slide to secure", status: "signed-out", access: "chip", phase: "idle" },
  { id: "login", numeral: "iii", name: "Log in (only when signed out)", status: "signed-out", access: "chip", phase: "idle", securing: true },
  { id: "vault", numeral: "iv", name: "Forging, then the vault opens on its own", status: "not-holder", access: "chip", phase: "minting" },
  { id: "holder", numeral: "v", name: "Holder returns: slide to enter", status: "holder", access: null, phase: "idle" },
];

/** The four claim steps' slide-button wording, in order; each previews its step. */
const STEP_COPY = [
  { key: "aligning", label: "i · Tap keystone", preview: "tap", standard: "verifying", max: CLAIM_LIMITS.alertChars },
  { key: "secure", label: "ii · Slide to secure", preview: "slide", standard: "claimButton", max: CLAIM_LIMITS.labelChars },
  { key: "login", label: "iii · Log in", preview: "login", standard: "login", max: CLAIM_LIMITS.labelChars },
  { key: "vault", label: "iv · Open the vault", preview: "vault", standard: "vault", max: CLAIM_LIMITS.labelChars },
] as const;

/** What this tab owns; the gallery banner is set in the Gallery tab. */
const own = (t: KeystoneTheme) => JSON.stringify(sanitizeTheme({ background: t.background, claim: t.claim }));

/**
 * The member screens' background and wording: media and color behind the
 * artwork (and under the vault's description), how dark the media gets, the
 * text color, and the wording of the four claim steps and the not-aligned
 * message. A live phone preview shows each claim step; slide the button
 * there to play log in and opening the vault.
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
  const [previewId, setPreviewId] = useState("slide");
  /** The slide demo: log in, then forging into the vault, then back to the chosen step. */
  const [playing, setPlaying] = useState<"login" | "minting" | "minted" | null>(null);
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

  function showState(id: string) {
    setPreviewId(id);
    setPlaying(null);
    setReplay((r) => r + 1);
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
              <RangeField label="Darken media" unit="%" value={style.dim} {...L.dim} onChange={(v) => setClaim("dim", v)} />
              <ColorInput
                label="Text color"
                hint="Vault description, attributes and the slide button; standard follows the background"
                value={theme.claim?.text?.color}
                fallback="#161616"
                onChange={(v) => setClaim("text", { color: v })}
              />
            </div>
            <p className="text-xs text-muted-foreground">Media is always darkened at least 45% so text over it stays readable.</p>
          </div>
        </Panel>

        <Panel title="Wording">
          <div className="grid gap-4 sm:grid-cols-2">
            {STEP_COPY.map((s) => (
              <CopyInput
                key={s.key}
                label={s.label}
                placeholder={copy[s.standard]}
                max={s.max}
                value={theme.claim?.alerts?.[s.key]}
                onChange={(v) => setClaim("alerts", { [s.key]: v })}
                onFocus={() => showState(s.preview)}
              />
            ))}
            <CopyInput label="Not aligned" placeholder={copy.failed} value={theme.claim?.alerts?.failed} onChange={(v) => setClaim("alerts", { failed: v })} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The slide button's wording through a claim: i the keystone is tapped, ii one slide secures it, iii log in (skipped when already signed in), iv
            the vault opens on its own, with no second slide. Select a field to preview its step. "Not aligned" is read out and shown on the corner icon. Leave
            a field empty to use the standard wording shown in grey.
          </p>
        </Panel>

        {error && <Notice tone="bad">{error}</Notice>}
        <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl border bg-background/90 p-3 shadow-sm backdrop-blur">
          {theme.claim && (
            <UiButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setSaved(false);
                setTheme((t) => ({ ...t, claim: undefined }));
              }}
              className="mr-auto text-muted-foreground"
            >
              Reset to standard
            </UiButton>
          )}
          {saved && !dirty && <span className="text-sm text-emerald">Saved, live for members</span>}
          {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
          <Button disabled={!dirty || saving} onClick={() => setTheme(keystone.theme ?? {})}>Discard</Button>
          <Button variant="primary" busy={saving} disabled={!dirty} onClick={save}>Save customization</Button>
        </div>
      </div>

      {/* ── Live preview ── */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Claim screen preview</span>
          <UiButton variant="ghost" size="sm" onClick={() => setReplay((r) => r + 1)}>
            <RotateCcwIcon />
            Replay
          </UiButton>
        </div>

        <PhonePreview>
          <div key={`${previewId}-${replay}`} className="h-full overflow-y-auto">
            <PlateClaim
              keystone={preview}
              status={state.status}
              access={state.access}
              phase={playing && playing !== "login" ? playing : state.phase}
              securing={playing ? playing === "login" : state.securing}
              onClaim={() => {
                // Demo the slide: log in, forging, the vault opening, then back to where it started.
                const next = (p: typeof playing) => (q: typeof playing) => (q ? p : q);
                setPlaying("login");
                setTimeout(() => setPlaying(next("minting")), 1400);
                setTimeout(() => setPlaying(next("minted")), 3000);
                setTimeout(() => setPlaying(null), 3800);
              }}
              onEnter={() => {}}
              contained
            />
          </div>
        </PhonePreview>

        <div className="mt-3 flex justify-center">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={previewId}
            onValueChange={(v) => v && showState(v)}
            aria-label="Claim screen state"
          >
            {PREVIEW_STATES.map((p) => (
              <ToggleGroupItem key={p.id} value={p.id} title={p.name} aria-label={`${p.numeral}: ${p.name}`} className="min-w-10 font-mono">
                {p.numeral}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
    </div>
  );
}

// ── Form pieces ─────────────────────────────────────────────────

function RangeField({ label, value, min, max, unit = "", onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="leading-none font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value}
          {unit}
        </span>
      </div>
      <Slider className="py-3" min={min} max={max} value={[value]} onValueChange={([v]) => onChange(v)} aria-label={label} />
    </div>
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
          className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1 shadow-xs dark:bg-input/30"
        />
        <span className="font-mono text-sm text-muted-foreground">{value ?? "Standard"}</span>
        {value && (
          <UiButton type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Reset
          </UiButton>
        )}
      </span>
    </Field>
  );
}

function CopyInput({
  label,
  placeholder,
  value,
  max = CLAIM_LIMITS.alertChars,
  onChange,
  onFocus,
}: {
  label: string;
  placeholder: string;
  value?: string;
  max?: number;
  onChange: (v: string | undefined) => void;
  onFocus?: () => void;
}) {
  return (
    <Field label={label}>
      <Input
        placeholder={placeholder}
        value={value ?? ""}
        maxLength={max}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </Field>
  );
}
