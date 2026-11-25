"use client";

import { useState } from "react";
import type { Operator, ThemeMedia } from "@/lib/keystones";
import { Button, useAdminApi } from "./ui";
import MediaPicker from "./MediaPicker";

/** Operator-wide artwork, independent of the theme on any single keystone. */
export default function OperatorAppearance({ operator, onSaved }: { operator: Operator; onSaved: (op: Operator) => void }) {
  const api = useAdminApi();
  const [icon, setIcon] = useState(operator.appearance?.icon);
  const [background, setBackground] = useState(operator.appearance?.background);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true); setMessage("");
    try {
      const updated = await api<Operator>(`/api/admin/operators/${encodeURIComponent(operator.id)}`, { method: "PATCH", json: { appearance: { icon: icon ?? null, background: background ?? null } } });
      onSaved(updated); setMessage("Appearance saved.");
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not save appearance"); }
    finally { setBusy(false); }
  }
  const change = (set: (m: ThemeMedia | undefined) => void) => (m: ThemeMedia | undefined) => { set(m); setMessage(""); };
  return (
    <details className="mt-4 border-t pt-4">
      <summary className="cursor-pointer text-sm font-medium">Operator appearance</summary>
      <div className="mt-4 space-y-5">
        <div><h3 className="mb-2 text-sm font-medium">Round icon</h3><MediaPicker endpoint={`/api/admin/operators/${operator.id}/media`} slot="icon" imageOnly media={icon} onChange={change(setIcon)} /></div>
        <div><h3 className="mb-2 text-sm font-medium">My Keystones background</h3><MediaPicker endpoint={`/api/admin/operators/${operator.id}/media`} slot="background" media={background} onChange={change(setBackground)} /><p className="mt-2 text-xs text-muted-foreground">For this operator’s member list. Use a static image, animated GIF or short looping video.</p></div>
        <div className="flex items-center gap-3"><Button busy={busy} onClick={save}>Save appearance</Button><span role="status" className="text-sm text-muted-foreground">{message}</span></div>
      </div>
    </details>
  );
}
