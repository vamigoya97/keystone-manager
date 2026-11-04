"use client";

import { Empty, KeystoneRow, LoadingRows, MemberShell, OperatorCard, SectionHeader, groupByTime, groupOperators, useKeystones } from "./member";

const PREVIEW = 3;

/** Member home: every keystone you hold (live and upcoming first), then the operators behind them. */
export default function MemberHome() {
  return (
    <MemberShell title="Your keystones">
      {({ who }) => <Overview who={who} />}
    </MemberShell>
  );
}

function Overview({ who }: { who?: string }) {
  const { keystones, error } = useKeystones();
  const { soon, ongoing, past } = groupByTime(keystones ?? []);
  const operators = keystones ? groupOperators(keystones).filter((g) => g.active.length > 0) : [];

  return (
    <section className="rise mt-8 space-y-8" style={{ animationDelay: "80ms" }}>
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Welcome back</h1>
        {who && <p className="mt-1 text-sm text-text-secondary">{who}</p>}
      </div>

      {error ? (
        <p className="text-sm text-rose">{error}</p>
      ) : keystones === null ? (
        <LoadingRows count={3} />
      ) : keystones.length === 0 ? (
        <Empty title="No keystones yet" body="Tap your item to secure one." />
      ) : (
        <>
          {soon.length > 0 && <KeystoneList title="Upcoming & live" items={soon} />}
          {ongoing.length > 0 && <KeystoneList title={soon.length || past.length ? "Ongoing" : "Keystones"} items={ongoing} />}
          {past.length > 0 && <KeystoneList title="Past" items={past} />}

          <div>
            <SectionHeader title="Operators" count={operators.length} href={operators.length > PREVIEW ? "/operators" : undefined} />
            {operators.length === 0 ? (
              <p className="text-[13px] text-text-muted">None of your keystones are active right now.</p>
            ) : (
              <div className="space-y-3">
                {operators.slice(0, PREVIEW).map((g) => (
                  <OperatorCard key={g.operator.id} group={g} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function KeystoneList({ title, items }: { title: string; items: ReturnType<typeof groupByTime>["all"] }) {
  return (
    <div>
      <SectionHeader title={title} count={items.length} />
      <div className="space-y-3">
        {items.map((k) => (
          <KeystoneRow key={k.slug} keystone={k} showOperator />
        ))}
      </div>
    </div>
  );
}
