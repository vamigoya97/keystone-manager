"use client";

import { Empty, LoadingRows, MemberShell, OperatorCard, PageTitle, SectionHeader, groupOperators, useKeystones } from "./member";

export default function OperatorsPage() {
  return <MemberShell title="Operators">{() => <Operators />}</MemberShell>;
}

/** The operators the member holds keystones from. */
function Operators() {
  const { keystones, error } = useKeystones();
  const groups = keystones ? groupOperators(keystones) : [];
  const current = groups.filter((g) => g.active.length > 0);
  const former = groups.filter((g) => g.active.length === 0);

  return (
    <section className="space-y-8 pb-[max(40px,calc(env(safe-area-inset-bottom)+24px))] pt-8">
      <PageTitle title="Your operators" body="Everyone who issued you a keystone." />

      {error ? (
        <p className="px-5 text-[15px] leading-[1.6] text-[var(--p-alert)]">{error}</p>
      ) : keystones === null ? (
        <LoadingRows count={2} />
      ) : groups.length === 0 ? (
        <Empty title="No operators yet" body="Hold your phone to an item to secure your first keystone." />
      ) : (
        <>
          <div className="flex flex-col gap-[2px]">
            {current.map((g) => (
              <OperatorCard key={g.operator.id} group={g} />
            ))}
          </div>
          {former.length > 0 && (
            <div>
              <SectionHeader title="Former" count={former.length} />
              <div className="flex flex-col gap-[2px]">
                {former.map((g) => (
                  <OperatorCard key={g.operator.id} group={g} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
