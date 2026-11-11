/**
 * The same checks against both stores, so they behave alike.
 *
 *   npm run test:store                                   JSON store only
 *   TEST_DATABASE_URL=postgres://… npm run test:store    plus Postgres
 *
 * The Postgres run WIPES the database at TEST_DATABASE_URL (it drops and
 * recreates the public schema). Point it at a throwaway test database only.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { ItemBatch, Keystone, Member } from "../lib/keystones";
import { ClaimBusyError, ReplayError, type Store } from "../lib/stores/types";

const tmp = await mkdtemp(path.join(tmpdir(), "keystone-store-"));
process.env.STORE_FILE = path.join(tmp, "store.json");

const keystone = (slug: string, name = slug, operatorId = "t-op"): Keystone => ({
  slug,
  name,
  description: "",
  operatorId,
  palette: ["#000000", "#FFFFFF"],
  token: { standard: "erc721", minBalance: "1", symbol: "T" } as Keystone["token"],
  gallery: [],
});

const member = (slug: string, n: number, extra: Partial<Member> = {}): Member => ({
  slug,
  address: `0x${String(n).padStart(40, "0")}`,
  privyUserId: `did:privy:${n}`,
  chipId: `chip-${n}`,
  claimedAt: "2026-11-04T00:23:29.760Z",
  ...extra,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function suite(name: string, getStore: () => Promise<Store>, cleanup: () => Promise<void>) {
  describe(name, () => {
    let s: Store;
    before(async () => {
      s = await getStore();
      await s.createOperator({ id: "t-op", name: "Test operator", createdAt: "2026-11-01T10:00:00.000Z" });
      await s.createOperator({ id: "t-op2", name: "Second operator", createdAt: "2026-11-02T10:00:00.000Z" });
    });
    after(cleanup);

    test("operators: create, list in order, get, reject duplicates", async () => {
      const ids = (await s.listOperators()).map((o) => o.id);
      assert.ok(ids.indexOf("t-op") < ids.indexOf("t-op2"));
      assert.deepEqual(await s.getOperator("t-op"), { id: "t-op", name: "Test operator", createdAt: "2026-11-01T10:00:00.000Z" });
      assert.equal(await s.getOperator("nope"), undefined);
      await assert.rejects(s.createOperator({ id: "t-op", name: "x", createdAt: "2026-11-01T10:00:00.000Z" }), /already exists/);
    });

    test("keystones: create, get, list in order, reject duplicate slugs", async () => {
      await s.createKeystone(keystone("t-alpha"));
      await s.createKeystone(keystone("t-beta"));
      const got = await s.getKeystone("t-alpha");
      assert.deepEqual(got, keystone("t-alpha"));
      const slugs = (await s.listKeystones()).map((k) => k.slug);
      assert.ok(slugs.indexOf("t-alpha") < slugs.indexOf("t-beta"));
      await assert.rejects(s.createKeystone(keystone("t-alpha")), /already exists/);
      assert.equal(await s.getKeystone("t-missing"), undefined);
      assert.equal(await s.canonicalSlug("t-missing"), "t-missing");
    });

    test("updateKeystone: changes stick, nested data round-trips, unknown slug throws", async () => {
      const updated = await s.updateKeystone("t-alpha", (e) => {
        e.description = "Updated";
        e.theme = { claim: { alerts: { secure: "Claim it" } } };
        e.gallery.push({ src: "https://example.com/a.jpg", alt: "A", width: 4, height: 5 });
      });
      assert.equal(updated.description, "Updated");
      const back = await s.getKeystone("t-alpha");
      assert.equal(back?.description, "Updated");
      assert.equal(back?.theme?.claim?.alerts?.secure, "Claim it");
      assert.equal(back?.gallery.length, 1);
      await assert.rejects(s.updateKeystone("t-missing", () => {}), /not found/);
    });

    test("updateKeystone: 20 edits at once all land (no lost updates)", async () => {
      await s.createKeystone(keystone("t-busy"));
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          s.updateKeystone("t-busy", (e) => {
            e.gallery.push({ src: `https://example.com/${i}.jpg`, alt: String(i), width: 1, height: 1 });
          })
        )
      );
      assert.equal((await s.getKeystone("t-busy"))?.gallery.length, 20);
    });

    test("members: insert, merge keeps saved fields, find by wallet/chip/user, revoke, remove", async () => {
      await s.upsertMember(member("t-alpha", 1));
      await s.upsertMember({ ...member("t-alpha", 1), txHash: "0xabc" });
      // Leaving txHash out keeps it, like the file store's { ...old, ...new }.
      await s.upsertMember(member("t-alpha", 1, { claimedAt: "2026-11-05T00:00:00.000Z" }));
      const m = await s.findMember("t-alpha", { address: member("t-alpha", 1).address.toUpperCase().replace("0X", "0x") });
      assert.equal(m?.txHash, "0xabc");
      assert.equal(m?.claimedAt, "2026-11-05T00:00:00.000Z");
      assert.equal((await s.findMember("t-alpha", { chipId: "chip-1" }))?.privyUserId, "did:privy:1");
      assert.equal((await s.findMember("t-alpha", { privyUserId: "did:privy:1" }))?.chipId, "chip-1");
      assert.equal(await s.findMember("t-beta", { chipId: "chip-1" }), undefined);
      assert.equal(await s.findMember("t-alpha", {}), undefined);

      await s.setMemberRevoked("t-alpha", member("t-alpha", 1).address, true);
      assert.equal((await s.listMembers("t-alpha"))[0].revoked, true);
      await s.setMemberRevoked("t-alpha", member("t-alpha", 1).address, false);
      assert.ok(!(await s.listMembers("t-alpha"))[0].revoked);
      await assert.rejects(s.setMemberRevoked("t-alpha", "0xnobody", true), /not found/);

      await s.upsertMember(member("t-alpha", 2));
      assert.deepEqual((await s.listMembers("t-alpha")).map((x) => x.chipId), ["chip-1", "chip-2"]);
      await s.removeMember("t-alpha", member("t-alpha", 2).address);
      assert.deepEqual((await s.listMembers("t-alpha")).map((x) => x.chipId), ["chip-1"]);
    });

    test("item batches: create, list by operator, get, update, reject duplicates", async () => {
      const batch: ItemBatch = { id: "t-batch", operatorId: "t-op", name: "Wristbands", tokens: ["t-alpha", "t-beta"], chipSecurity: "static", createdAt: "2026-11-03T00:00:00.000Z" };
      await s.createItemBatch(batch);
      await assert.rejects(s.createItemBatch(batch), /already exists/);
      assert.deepEqual(await s.getItemBatch("t-batch"), batch);
      assert.deepEqual((await s.listItemBatches("t-op")).map((b) => b.id), ["t-batch"]);
      assert.deepEqual(await s.listItemBatches("t-op2"), []);
      const updated = await s.updateItemBatch("t-batch", (b) => {
        b.name = "Pins";
        b.chipSecurity = "ntag424";
      });
      assert.equal(updated.name, "Pins");
      assert.equal((await s.getItemBatch("t-batch"))?.chipSecurity, "ntag424");
      await assert.rejects(s.updateItemBatch("t-nope", () => {}), /not found/);
    });

    test("rename: new slug, old slug still resolves, chip scope kept, members and batches follow, collisions get -2", async () => {
      await s.updateKeystone("t-alpha", (e) => (e.name = "T Gamma"));
      const renamed = await s.renameKeystone("t-alpha");
      assert.equal(renamed.slug, "t-gamma");
      assert.deepEqual(renamed.previousSlugs, ["t-alpha"]);
      assert.equal(renamed.chipScope, "t-alpha");
      assert.equal((await s.getKeystone("t-alpha"))?.slug, "t-gamma");
      assert.equal(await s.canonicalSlug("t-alpha"), "t-gamma");
      assert.deepEqual((await s.listMembers("t-gamma")).map((m) => m.chipId), ["chip-1"]);
      assert.equal((await s.findMember("t-gamma", { chipId: "chip-1" }))?.slug, "t-gamma");
      assert.deepEqual((await s.getItemBatch("t-batch"))?.tokens, ["t-gamma", "t-beta"]);

      // t-beta wants "t-gamma" too: taken, so it becomes t-gamma-2. Old links and chip scopes count as taken.
      await s.updateKeystone("t-beta", (e) => (e.name = "T Gamma"));
      assert.equal((await s.renameKeystone("t-beta")).slug, "t-gamma-2");
      await s.updateKeystone("t-gamma-2", (e) => (e.name = "T Alpha"));
      assert.equal((await s.renameKeystone("t-gamma-2")).slug, "t-alpha-2");
      // Unchanged name: nothing happens.
      assert.equal((await s.renameKeystone("t-gamma")).slug, "t-gamma");
      await assert.rejects(s.createKeystone(keystone("t-alpha")), /already exists/);
    });

    test("chip counters: higher passes, same or lower is a replay, 10 taps at once let exactly one through", async () => {
      await s.recordChipCounter("t-scope", "UID1", 5);
      await s.recordChipCounter("t-scope", "UID1", 6);
      await assert.rejects(s.recordChipCounter("t-scope", "UID1", 6), ReplayError);
      await assert.rejects(s.recordChipCounter("t-scope", "UID1", 3), ReplayError);
      await s.recordChipCounter("t-scope", "UID2", 1);

      const results = await Promise.allSettled(Array.from({ length: 10 }, () => s.recordChipCounter("t-scope", "UID3", 9)));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.ok(results.every((r) => r.status === "fulfilled" || r.reason instanceof ReplayError));
    });

    test("claim locks: same item twice at once → one is busy; released after; other items unaffected", async () => {
      let inside = 0;
      const claim = (keys: string[]) =>
        s.withClaimLock(keys, async () => {
          inside++;
          await sleep(150);
          return "minted";
        });
      const [a, b, c] = await Promise.allSettled([
        claim(["chip:t:1", "wallet:t:0xa"]),
        claim(["chip:t:1", "wallet:t:0xb"]),
        claim(["chip:t:2", "wallet:t:0xc"]),
      ]);
      // Either of the two claims on item 1 may win, but exactly one does, and the other is told it's busy.
      const sameItem = [a, b];
      assert.equal(sameItem.filter((r) => r.status === "fulfilled").length, 1);
      assert.ok(sameItem.some((r) => r.status === "rejected" && r.reason instanceof ClaimBusyError));
      assert.equal(c.status, "fulfilled");
      assert.equal(inside, 2);
      // Released: the same item can be claimed again, and a failing claim releases too.
      assert.equal(await claim(["chip:t:1"]), "minted");
      await assert.rejects(s.withClaimLock(["chip:t:9"], async () => { throw new Error("mint failed"); }), /mint failed/);
      assert.equal(await claim(["chip:t:9"]), "minted");
    });

    test("double claim of one chip by two people: only one becomes the member", async () => {
      await s.createKeystone(keystone("t-race"));
      const attempt = (n: number) =>
        s.withClaimLock([`chip:t-race:shared`, `wallet:t-race:${n}`], async () => {
          const owner = await s.findMember("t-race", { chipId: "shared" });
          if (owner) return "taken";
          await sleep(100); // the mint
          await s.upsertMember(member("t-race", n, { chipId: "shared" }));
          return "minted";
        });
      const results = await Promise.allSettled([attempt(1), attempt(2), attempt(3)]);
      assert.equal(results.filter((r) => r.status === "fulfilled" && r.value === "minted").length, 1);
      assert.equal((await s.listMembers("t-race")).length, 1);
    });
  });
}

suite(
  "JSON store",
  async () => (await import("../lib/stores/json")).jsonStore,
  () => rm(tmp, { recursive: true, force: true })
);

const pgUrl = process.env.TEST_DATABASE_URL;
if (pgUrl) {
  suite(
    "Postgres store",
    async () => {
      process.env.DATABASE_URL = pgUrl;
      const { getDb } = await import("../lib/db/client");
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      const { sql } = await import("drizzle-orm");
      const db = getDb();
      await db.execute(sql`drop schema if exists public cascade`);
      await db.execute(sql`drop schema if exists drizzle cascade`);
      await db.execute(sql`create schema public`);
      await migrate(db, { migrationsFolder: "./drizzle" });
      return (await import("../lib/stores/postgres")).postgresStore;
    },
    async () => (await import("../lib/db/client")).closeDb()
  );

  test("Postgres: an expired claim lock is taken over", async () => {
    const { getDb } = await import("../lib/db/client");
    const { claimLocks } = await import("../lib/db/schema");
    const { postgresStore } = await import("../lib/stores/postgres");
    await getDb().insert(claimLocks).values({ key: "chip:t:stale", holder: "crashed-request", expiresAt: new Date(Date.now() - 1000) });
    assert.equal(await postgresStore.withClaimLock(["chip:t:stale"], async () => "ok"), "ok");
  });
}
