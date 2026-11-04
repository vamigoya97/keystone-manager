"use client";

import { useState } from "react";
import { slugify, type Keystone, type KeystoneTrait } from "@/lib/keystones";
import { PASS_LIMITS, TRAIT_LIMITS } from "@/lib/passMetadata";
import type { Detail } from "./AdminApp";
import ContractSection, { ArtworkPanel } from "./ContractSection";
import { Button, Field, Notice, Panel, inputClass, useAdminApi } from "./ui";

/**
 * Everything about the keystone itself: details, artwork and its on-chain
 * contract. The details are the contract's source: deploying and writing
 * metadata commit the saved name, symbol, description, traits and artwork.
 */
export default function DetailsTab({ detail, onChange }: { detail: Detail; onChange: (next?: Partial<Detail>) => void }) {
  const { keystone } = detail;
  const api = useAdminApi();
  const [form, setForm] = useState({
    name: keystone.name,
    description: keystone.description,
    startDate: keystone.startDate ?? "",
    endDate: keystone.endDate ?? "",
    location: keystone.location ?? "",
    symbol: keystone.token.symbol,
    traits: keystone.traits ?? ([] as KeystoneTrait[]),
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The link follows the name; old links and programmed chips keep working via redirects.
  const nextSlug = form.name.trim() !== keystone.name ? slugify(form.name) : "";
  const linkHint =
    nextSlug && nextSlug !== keystone.slug ? (
      <>
        Saving moves the link to <span className="font-mono">/x/{nextSlug}</span>. Old links and chips keep working.
      </>
    ) : (
      <>
        Link: <span className="font-mono">/x/{keystone.slug}</span>
      </>
    );

  // Fixed on chain once a contract is deployed from the console.
  const symbolLocked = !!keystone.token.deployTx;
  const unsaved =
    form.name !== keystone.name ||
    form.description !== keystone.description ||
    form.symbol !== keystone.token.symbol ||
    form.startDate !== (keystone.startDate ?? "") ||
    form.endDate !== (keystone.endDate ?? "") ||
    form.location !== (keystone.location ?? "") ||
    JSON.stringify(form.traits.filter((t) => t.key || t.value)) !== JSON.stringify(keystone.traits ?? []);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (form.endDate && !form.startDate) throw new Error("Add a start date before an end date");
      const exp = await api<Keystone>(`/api/admin/keystones/${keystone.slug}`, {
        method: "PATCH",
        json: form,
      });
      onChange({ keystone: exp });
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <form onSubmit={save}>
          <Panel title="Details">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <Field label="Name" hint={linkHint}>
                  <input className={inputClass} value={form.name} maxLength={PASS_LIMITS.name} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field label="Symbol" hint={symbolLocked ? "Fixed by the deployed contract" : undefined}>
                  <input
                    className={`${inputClass} font-mono uppercase`}
                    value={form.symbol}
                    maxLength={PASS_LIMITS.symbol}
                    disabled={symbolLocked}
                    onChange={(e) => set("symbol", e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
                  />
                </Field>
              </div>
              <Field label="Description" hint={`${form.description.length}/${PASS_LIMITS.description}`}>
                <textarea
                  className={`${inputClass} min-h-[96px] resize-y`}
                  value={form.description}
                  maxLength={PASS_LIMITS.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="What holders get access to"
                />
              </Field>
              <TraitsField
                traits={form.traits}
                onChange={(t) => set("traits", t)}
                location={form.location}
                startDate={form.startDate}
                endDate={form.endDate}
                onBuiltIn={(key, value) => {
                  set(key, value);
                  // An end date needs a start date.
                  if (key === "startDate" && !value) set("endDate", "");
                }}
              />
              {error && <Notice tone="bad">{error}</Notice>}
              <div className="flex items-center justify-end gap-3 pt-1">
                {saved && !unsaved && <span className="text-[12px] text-accent">Saved</span>}
                <Button type="submit" variant="primary" busy={busy}>
                  Save details
                </Button>
              </div>
            </div>
          </Panel>
        </form>
        <ContractSection detail={detail} unsaved={unsaved} onChange={onChange} />
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <ArtworkPanel
          keystone={keystone}
          preview={{
            ...keystone,
            ...form,
            startDate: form.startDate || undefined,
            endDate: form.endDate || undefined,
            location: form.location || undefined,
            token: { ...keystone.token, symbol: form.symbol },
          }}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

type BuiltIn = "location" | "startDate" | "endDate";

const BUILT_INS: { key: BuiltIn; label: string; type: string }[] = [
  { key: "location", label: "Location", type: "Text" },
  { key: "startDate", label: "Start date", type: "Date" },
  { key: "endDate", label: "End date", type: "Date" },
];

/**
 * Traits committed as contract attributes. Location and Start / End date are optional
 * built-in rows (they also drive ordering and the Live / Upcoming labels); operator
 * traits follow, as Text or Number (numbers go on chain as numbers).
 */
function TraitsField({
  traits,
  onChange,
  location,
  startDate,
  endDate,
  onBuiltIn,
}: {
  traits: KeystoneTrait[];
  onChange: (t: KeystoneTrait[]) => void;
  location: string;
  startDate: string;
  endDate: string;
  onBuiltIn: (key: BuiltIn, value: string) => void;
}) {
  const values = { location, startDate, endDate };
  // Built-ins show when they have a value or were just added (an empty row isn't saved).
  const [shown, setShown] = useState<Set<BuiltIn>>(() => new Set(BUILT_INS.filter((b) => values[b.key]).map((b) => b.key)));
  const show = (key: BuiltIn, on: boolean) =>
    setShown((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else {
        next.delete(key);
        if (key === "startDate") next.delete("endDate");
      }
      return next;
    });
  const addable = BUILT_INS.filter((b) => !shown.has(b.key) && (b.key !== "endDate" || shown.has("startDate")));
  const update = (i: number, patch: Partial<KeystoneTrait>) => onChange(traits.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const label = `${inputClass} flex items-center text-text-secondary`;

  return (
    <div>
      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-text-secondary">Traits</span>
      <div className="space-y-2">
        {BUILT_INS.filter((b) => shown.has(b.key)).map((b) => (
          <div key={b.key} className="grid grid-cols-[1fr_1fr_104px_auto] gap-2">
            <span className={label} title="Set by the app; also used for ordering and Live / Upcoming labels">
              {b.label}
            </span>
            {b.key === "location" ? (
              <input
                className={inputClass}
                aria-label="Location"
                placeholder="Brooklyn, NY"
                value={location}
                maxLength={80}
                onChange={(e) => onBuiltIn("location", e.target.value)}
              />
            ) : (
              <input
                type="date"
                className={inputClass}
                aria-label={b.label}
                value={values[b.key]}
                min={b.key === "endDate" ? startDate || undefined : undefined}
                onChange={(e) => onBuiltIn(b.key, e.target.value)}
              />
            )}
            <span className={label}>{b.type}</span>
            <Button
              type="button"
              aria-label={`Remove ${b.label}`}
              onClick={() => {
                show(b.key, false);
                onBuiltIn(b.key, "");
              }}
            >
              ✕
            </Button>
          </div>
        ))}
        {traits.map((t, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_104px_auto] gap-2">
            <input
              className={inputClass}
              aria-label="Trait name"
              placeholder="Name, e.g. Edition"
              value={t.key}
              maxLength={TRAIT_LIMITS.key}
              onChange={(e) => update(i, { key: e.target.value })}
            />
            <input
              className={inputClass}
              aria-label="Trait value"
              placeholder={t.type === "number" ? "e.g. 250" : "Value, e.g. Founders"}
              inputMode={t.type === "number" ? "decimal" : undefined}
              value={t.value}
              maxLength={TRAIT_LIMITS.value}
              onChange={(e) => update(i, { value: e.target.value })}
            />
            <select
              className={inputClass}
              aria-label="Trait type"
              value={t.type ?? "text"}
              onChange={(e) => update(i, { type: e.target.value === "number" ? "number" : undefined })}
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
            </select>
            <Button type="button" aria-label={`Remove ${t.key || "trait"}`} onClick={() => onChange(traits.filter((_, j) => j !== i))}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" disabled={traits.length >= TRAIT_LIMITS.count} onClick={() => onChange([...traits, { key: "", value: "" }])}>
          + Add trait
        </Button>
        {addable.map((b) => (
          <Button key={b.key} type="button" onClick={() => show(b.key, true)}>
            + {b.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-text-muted">
        Committed as attributes in the contract: Location and dates first, then your traits (up to {TRAIT_LIMITS.count}). Dates also decide Upcoming,
        Live and Past.
      </p>
    </div>
  );
}
