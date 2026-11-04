"use client";

import Link from "next/link";
import { Empty, KeystoneRow, LoadingRows, MemberShell, SectionHeader, groupOperators, useKeystones } from "./member";

export default function OperatorPage({ operatorId }: { operatorId: string }) {
  return <MemberShell title="Operator">{() => <OperatorKeystones operatorId={operatorId} />}</MemberShell>;
}

/** Every keystone the member holds from one operator: live and upcoming, ongoing, then past. */
function OperatorKeystones({ operatorId }: { operatorId: string }) {
  const { keystones, error } = useKeystones();
  const group = keystones ? groupOperators(keystones).find((g) => g.operator.id === operatorId) : undefined;
  const sections = group
    ? ([
        ["Upcoming & live", group.time.soon],
        ["Ongoing", group.time.ongoing],
        ["Past", group.time.past],
      ] as const)
    : [];

  return (
    <section className="rise mt-8 space-y-8" style={{ animationDelay: "80ms" }}>
      <Link href="/operators" className="text-[11px] uppercase tracking-[0.3em] text-text-secondary hover:text-text-primary hover:no-underline">
        ← Operators
      </Link>

      {error ? (
        <p className="text-sm text-rose">{error}</p>
      ) : keystones === null ? (
        <LoadingRows count={3} />
      ) : !group ? (
        <Empty title="No keystones here yet" body="Tap one of this operator's items to secure a keystone." />
      ) : (
        <>
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{group.operator.name}</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {group.active.length} keystone{group.active.length === 1 ? "" : "s"} you hold
            </p>
          </div>

          {sections.map(
            ([title, items]) =>
              items.length > 0 && (
                <div key={title}>
                  <SectionHeader title={title} count={items.length} />
                  <div className="space-y-3">
                    {items.map((k) => (
                      <KeystoneRow key={k.slug} keystone={k} />
                    ))}
                  </div>
                </div>
              )
          )}
        </>
      )}
    </section>
  );
}
