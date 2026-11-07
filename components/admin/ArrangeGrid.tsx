"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { KIND_LABEL, canBeWide, formatDuration } from "@/lib/gallery";
import { galleryKind, type GalleryItem } from "@/lib/keystones";
import { PLATE, PlateTile, plateAspect, rowFlex, vaultRows } from "@/components/nfc/plate";

/**
 * Arranging the vault in the Gallery tab. The grid shows the vault's rows
 * exactly as members see them, and every change edits those rows directly,
 * then saves them (order, full-width items and which items share a row):
 *
 * - drop on the left or right half of a tile → the item joins that tile's
 *   row, beside it, at half width (rows hold up to three)
 * - drop on a bar between rows (they open while dragging a landscape photo or
 *   clip, or an audio note), or on the top or bottom half of a full-width
 *   tile → the item gets a full-width row there
 * - ← → move an item one place; Full width / Half width switches it
 *
 * An item left alone in a row by a change joins the row beside it when
 * there's room.
 */

const MAX_PER_ROW = 3;
const keyOf = (g: GalleryItem) => g.key ?? g.src;

type Row = { wide: boolean; items: GalleryItem[] };

/** Where a dragged item would land. */
type Drop = { kind: "side"; key: string; after: boolean } | { kind: "row"; before: string | null };

function toRows(items: GalleryItem[]): Row[] {
  return vaultRows(items).map((r) => (r.wide ? { wide: true, items: [items[r.index]] } : { wide: false, items: r.indices.map((i) => items[i]) }));
}

/** The gallery for a set of rows, with each item's width and row recorded. */
export function fromRows(rows: Row[]): GalleryItem[] {
  return rows.flatMap((row) =>
    row.items.map((g, k) => {
      const out: GalleryItem = { ...g, sameRow: !row.wide && k > 0 };
      if (row.wide) out.wide = true;
      else delete out.wide;
      return out;
    }),
  );
}

/** A lone half-width row joins the row before it, or after it, when there's room. */
function settle(rows: Row[], r: number) {
  const row = rows[r];
  if (!row || row.wide || row.items.length !== 1) return;
  const prev = rows[r - 1];
  const next = rows[r + 1];
  if (prev && !prev.wide && prev.items.length < MAX_PER_ROW) {
    prev.items.push(...row.items);
    rows.splice(r, 1);
  } else if (next && !next.wide && next.items.length < MAX_PER_ROW) {
    next.items.unshift(...row.items);
    rows.splice(r, 1);
  }
}

function locate(rows: Row[], key: string) {
  for (let r = 0; r < rows.length; r++) {
    const k = rows[r].items.findIndex((g) => keyOf(g) === key);
    if (k >= 0) return { r, k };
  }
  return null;
}

/** Take an item out of the rows (copies them); the row it leaves settles. */
function take(items: GalleryItem[], key: string) {
  const rows = toRows(items).map((r) => ({ ...r, items: [...r.items] }));
  const at = locate(rows, key);
  if (!at) return null;
  const [item] = rows[at.r].items.splice(at.k, 1);
  if (rows[at.r].items.length === 0) rows.splice(at.r, 1);
  else settle(rows, at.r);
  return { rows, item };
}

/** Put `key` beside `target` in the target's row, at half width. Null when the row is full. */
export function placeBeside(items: GalleryItem[], key: string, target: string, after: boolean): GalleryItem[] | null {
  if (key === target) return null;
  const t = take(items, key);
  if (!t) return null;
  const at = locate(t.rows, target);
  if (!at || t.rows[at.r].wide || t.rows[at.r].items.length >= MAX_PER_ROW) return null;
  t.rows[at.r].items.splice(at.k + (after ? 1 : 0), 0, t.item);
  return fromRows(t.rows);
}

/** Give `key` a full-width row of its own before the row starting with `before` (or at the end). */
export function placeOwnRow(items: GalleryItem[], key: string, before: string | null): GalleryItem[] | null {
  // Dropped just above its own row: anchor on the item after it instead.
  if (before === key) {
    const i = items.findIndex((g) => keyOf(g) === key);
    before = items[i + 1] ? keyOf(items[i + 1]) : null;
  }
  const t = take(items, key);
  if (!t || !canBeWide(t.item)) return null;
  const r = before === null ? t.rows.length : (locate(t.rows, before)?.r ?? t.rows.length);
  t.rows.splice(r, 0, { wide: true, items: [t.item] });
  return fromRows(t.rows);
}

/** Switch an item between full width (its own row, where it is) and half width (joining a neighbouring row). */
export function toggleWide(items: GalleryItem[], key: string): GalleryItem[] | null {
  const rows = toRows(items).map((r) => ({ ...r, items: [...r.items] }));
  const at = locate(rows, key);
  if (!at) return null;
  const row = rows[at.r];
  if (row.wide) {
    row.wide = false;
    settle(rows, at.r);
  } else {
    if (!canBeWide(row.items[at.k])) return null;
    const [item] = row.items.splice(at.k, 1);
    // Above its row when it led it, below otherwise.
    const r = at.k === 0 ? at.r : at.r + 1;
    rows.splice(r, 0, { wide: true, items: [item] });
    const left = at.k === 0 ? at.r + 1 : at.r;
    if (rows[left].items.length === 0) rows.splice(left, 1);
    else settle(rows, left);
  }
  return fromRows(rows);
}

/** Move an item one place earlier (-1) or later (+1), keeping its width. */
export function step(items: GalleryItem[], key: string, dir: -1 | 1): GalleryItem[] | null {
  const rows = toRows(items).map((r) => ({ ...r, items: [...r.items] }));
  const at = locate(rows, key);
  if (!at) return null;
  const row = rows[at.r];
  const k2 = at.k + dir;
  // Within its row: swap with the neighbour.
  if (!row.wide && k2 >= 0 && k2 < row.items.length) {
    [row.items[at.k], row.items[k2]] = [row.items[k2], row.items[at.k]];
    return fromRows(rows);
  }
  const r2 = at.r + dir;
  const other = rows[r2];
  if (!other) return null;
  if (row.wide || other.wide) {
    // A full-width row on either side: the rows trade places.
    [rows[at.r], rows[r2]] = [rows[r2], rows[at.r]];
    return fromRows(rows);
  }
  if (other.items.length < MAX_PER_ROW && row.items.length !== 2) {
    // Into the neighbouring row, on the near side (unless that would leave its partner alone).
    const [item] = row.items.splice(at.k, 1);
    if (dir < 0) other.items.push(item);
    else other.items.unshift(item);
    if (row.items.length === 0) rows.splice(at.r, 1);
    else settle(rows, at.r);
    return fromRows(rows);
  }
  // The neighbouring row is full, or moving would strand a partner: trade places with its nearest item.
  const k3 = dir < 0 ? other.items.length - 1 : 0;
  [row.items[at.k], other.items[k3]] = [other.items[k3], row.items[at.k]];
  return fromRows(rows);
}

export default function ArrangeGrid({
  items,
  onArrange,
  controls,
}: {
  items: GalleryItem[];
  onArrange: (next: GalleryItem[]) => void;
  /** Each tile's hover buttons. */
  controls?: (i: number) => ReactNode;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const rows = vaultRows(items);
  const dragged = dragKey ? items.find((g) => keyOf(g) === dragKey) : undefined;

  function end() {
    setDragKey(null);
    setDrop(null);
  }

  function commit(target: Drop) {
    if (!dragKey) return;
    const next =
      target.kind === "side" ? placeBeside(items, dragKey, target.key, target.after) : placeOwnRow(items, dragKey, target.before);
    if (next) onArrange(next);
  }

  /** Room for one more in this row (not counting the dragged item if it's already there). */
  const roomIn = (indices: number[]) => indices.filter((i) => keyOf(items[i]) !== dragKey).length < MAX_PER_ROW;

  /** A full-width drop bar before a row (or at the end), shown while dragging an item that can be full width. */
  function bar(before: string | null) {
    if (!dragged || !canBeWide(dragged)) return null;
    const active = drop?.kind === "row" && drop.before === before;
    return (
      <div
        key={`bar-${before ?? "end"}`}
        data-drop-row={before ?? "end"}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!active) setDrop({ kind: "row", before });
        }}
        onDrop={(e) => {
          e.preventDefault();
          commit({ kind: "row", before });
          end();
        }}
        className={`flex items-center justify-center rounded-md border border-dashed text-xs font-medium ${
          active ? "h-10 border-ring bg-secondary text-foreground" : "h-4 border-input text-transparent"
        }`}
      >
        Full width here
      </div>
    );
  }

  function tile(i: number, rowIndices: number[] | null, nextRowKey: string | null, sizing?: CSSProperties) {
    const item = items[i];
    const key = keyOf(item);
    const kind = galleryKind(item);
    const fits = rowIndices ? roomIn(rowIndices) : false;
    return (
      <figure
        key={key}
        data-index={i}
        title={`${item.alt}: drag beside another item, or between rows`}
        draggable
        onDragStart={(e) => {
          setDragKey(key);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", key);
        }}
        onDragOver={(e) => {
          if (!dragKey || dragKey === key) return;
          const box = e.currentTarget.getBoundingClientRect();
          let next: Drop | null;
          if (item.wide) {
            // Top or bottom half of a full-width tile: a full-width row above or below it.
            next = dragged && canBeWide(dragged) ? { kind: "row", before: e.clientY - box.top < box.height / 2 ? key : nextRowKey } : null;
          } else {
            next = fits ? { kind: "side", key, after: e.clientX - box.left > box.width / 2 } : null;
          }
          if (!next) {
            if (drop) setDrop(null);
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (JSON.stringify(next) !== JSON.stringify(drop)) setDrop(next);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (drop) commit(drop);
          end();
        }}
        onDragEnd={end}
        className={`group relative min-w-0 cursor-grab overflow-hidden bg-card active:cursor-grabbing ${dragKey === key ? "opacity-40" : ""}`}
        style={sizing ?? { aspectRatio: plateAspect(item) }}
      >
        {/* Where the dragged item will land. */}
        {drop?.kind === "side" && drop.key === key && (
          <span aria-hidden className={`absolute inset-y-0 z-20 w-1 bg-primary ${drop.after ? "right-0" : "left-0"}`} />
        )}
        {drop?.kind === "row" && item.wide && (drop.before === key || drop.before === nextRowKey) && (
          <span aria-hidden className={`absolute inset-x-0 z-20 h-1 bg-primary ${drop.before === key ? "top-0" : "bottom-0"}`} />
        )}
        <PlateTile item={item} />
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white/80 group-hover:opacity-0">
          {KIND_LABEL[kind]}
          {item.duration ? ` · ${formatDuration(item.duration)}` : ""}
          {item.wide ? "· Full width" : ""}
        </span>
        {controls && !dragKey && (
          <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-1 bg-black/55 p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {controls(i)}
          </div>
        )}
      </figure>
    );
  }

  const firstKey = (r: (typeof rows)[number]) => keyOf(items[r.wide ? r.index : r.indices[0]]);

  return (
    <div
      className="flex flex-col gap-[2px] text-[var(--p-ink)]"
      style={PLATE}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
      }}
    >
      {rows.flatMap((row, r) => {
        const key = firstKey(row);
        const nextKey = rows[r + 1] ? firstKey(rows[r + 1]) : null;
        return [
          bar(key),
          row.wide ? (
            tile(row.index, null, nextKey)
          ) : (
            <div key={key} className={`flex gap-[2px] ${row.indices.length === 1 ? "w-1/2" : ""}`}>
              {row.indices.map((i) => tile(i, row.indices, nextKey, rowFlex(items[i])))}
            </div>
          ),
        ];
      })}
      {bar(null)}
    </div>
  );
}
