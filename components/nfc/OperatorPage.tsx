"use client";

import Link from "next/link";
import { Empty, KeystoneRow, LoadingRows, MemberShell, PageTitle, SectionHeader, groupOperators, useKeystones } from "./member";

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
    <section className="space-y-8 pb-[max(40px,calc(env(safe-area-inset-bottom)+24px))] pt-6">
      <Link href="/operators" className="block px-5 text-[13px] text-[var(--p-slate)] underline-offset-4 hover:text-[var(--p-ink)] hover:underline">
        ← Operators
      </Link>

      {error ? (
        <p className="px-5 text-[15px] leading-[1.6] text-[var(--p-alert)]">{error}</p>
      ) : keystones === null ? (
        <LoadingRows count={3} />
      ) : !group ? (
        <Empty title="No keystones here yet" body="Hold your phone to one of this operator's items to secure a keystone." />
      ) : (
        <>
          <PageTitle
            title={group.operator.name}
            body={`${group.active.length} keystone${group.active.length === 1 ? "" : "s"} you hold`}
          />

          {sections.map(
            ([title, items]) =>
              items.length > 0 && (
                <div key={title}>
                  <SectionHeader title={title} count={items.length} />
                  <div className="flex flex-col gap-[2px]">
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
