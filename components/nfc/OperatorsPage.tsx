"use client";

import { Empty, LoadingRows, MemberShell, OperatorCard, groupOperators, useKeystones } from "./member";

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
    <section className="rise mt-8 space-y-6" style={{ animationDelay: "80ms" }}>
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Your operators</h1>
        <p className="mt-1 text-sm text-text-secondary">Everyone who issued you a keystone.</p>
      </div>

      {error ? (
        <p className="text-sm text-rose">{error}</p>
      ) : keystones === null ? (
        <LoadingRows count={2} />
      ) : groups.length === 0 ? (
        <Empty title="No operators yet" body="Tap an item to secure your first keystone." />
      ) : (
        <>
          <div className="space-y-3">
            {current.map((g) => (
              <OperatorCard key={g.operator.id} group={g} />
            ))}
          </div>
          {former.length > 0 && (
            <div>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-text-secondary">Former</h2>
              <div className="space-y-3">
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
