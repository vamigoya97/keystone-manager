import assert from "node:assert/strict";
import { test } from "node:test";
import { groupOperators } from "../lib/memberKeystones";
import { sanitizeMedia } from "../lib/theme";
import type { MemberKeystone } from "../components/nfc/member";

const pass = (slug: string, operatorId: string | null, status: MemberKeystone["status"]): MemberKeystone => ({ slug, name: slug, operator: operatorId ? { id: operatorId, name: operatorId } : null, status, startDate: null, endDate: null, dateLabel: null, phase: null, location: null, palette: ["#000000", "#ffffff"], symbol: "K", claimedAt: null, photos: 0 });
test("operator navigation uses current holdings and keeps each issuer's keystones separate", () => {
  const groups = groupOperators([pass("a", "one", "active"), pass("b", "one", "received"), pass("c", "two", "unknown"), pass("d", "two", "revoked"), pass("e", "former", "not-held"), pass("orphan", null, "active")]);
  const current = groups.filter((g) => g.active.length);
  assert.deepEqual(current.map((g) => g.operator.id), ["one", "two"]);
  assert.deepEqual(current[0].active.map((k) => k.slug), ["a", "b"]);
  assert.deepEqual(current[1].time.all.map((k) => k.slug), ["c"]);
  assert.ok(!current.flatMap((g) => g.active).some((k) => k.slug === "d"));
});
test("operator media allows images and video but rejects unsafe URLs and malformed values", () => {
  assert.equal(sanitizeMedia({ src: "https://example.com/loop.mp4", kind: "video" })?.kind, "video");
  assert.equal(sanitizeMedia({ src: "ipfs://example", kind: "image" })?.kind, "image");
  for (const src of ["javascript:alert(1)", "data:image/png;base64,hi", "http://example.com/a.png", 'https://example.com/"x']) assert.equal(sanitizeMedia({ src, kind: "image" }), undefined);
  assert.equal(sanitizeMedia({ src: "https://example.com/a.png", kind: "audio" }), undefined);
});
