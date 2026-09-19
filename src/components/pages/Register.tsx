"use client";

import { formatEth, formatTimestamp } from "@/lib/namespace";
import { MAX_AGE, MIN_AGE, registrationPhase } from "@/lib/phase";
import type { ViewModel } from "@/lib/viewModel";
import { ActionButton, Arrow, PageHeading } from "../ui/Basics";
import { Lookup } from "../ui/Lookup";
import { StatusDetails } from "../ui/StatusDetails";

const STEPS = ["Commit", "Wait", "Reveal", "Set address"];

export function Register({ v }: { v: ViewModel }) {
  const phase = registrationPhase(v.session, v.committedAt, v.now, v.transaction);
  const stepIndex = phase === "commit" ? 0 : phase === "wait" ? 1 : phase === "reveal" ? 2 : phase === "complete" ? 3 : -1;
  const s = v.session;
  const waitText = !s
    ? ""
    : phase === "expired"
      ? "Commitment expired."
      : phase === "attention"
        ? "Registration transaction needs attention. Review its receipt below."
        : v.committedAt === 0n
          ? "Commit receipt not yet observed or commitment consumed."
          : v.now < v.committedAt + MIN_AGE
            ? `Waiting: ${v.committedAt + MIN_AGE - v.now} chain seconds`
            : v.now >= v.committedAt + MAX_AGE || v.now > BigInt(s.deadline)
              ? "Commitment expired."
              : "Ready to reveal. A commitment does not reserve the name.";
  const revealDisabled =
    !s ||
    !v.ready ||
    v.busy ||
    !!v.pending ||
    v.committedAt === 0n ||
    v.now < v.committedAt + MIN_AGE ||
    v.now >= v.committedAt + MAX_AGE ||
    v.now > BigInt(s.deadline);

  return (
    <>
      <PageHeading number="03" title="Make it yours.">
        Commit. Wait. Reveal. Every transaction stays in your control.
      </PageHeading>
      <Lookup v={v} />
      <div className="two-column">
        <div>
          <StatusDetails v={v} />
        </div>
        <section className="registration-panel" aria-label="Registration progress">
          <p className="eyebrow">YOUR REGISTRATION</p>
          <ol className="stepper">
            {STEPS.map((label, i) => (
              <li key={label} className={i === stepIndex ? "current" : i < stepIndex ? "done" : ""} aria-current={i === stepIndex ? "step" : undefined}>
                <span className="step-number">0{i + 1}</span>
                <span>{label}</span>
                <small>{i === stepIndex ? "Current" : i < stepIndex ? "Passed" : ""}</small>
              </li>
            ))}
          </ol>
          <p className="field-note">
            {phase === "attention"
              ? "Transaction needs attention. Review the receipt history below before continuing."
              : phase === "expired"
                ? "Commitment expired. Start a new commitment after resolving any pending transaction."
                : phase === "complete"
                  ? "Registration receipt confirmed. Set a destination in Manage."
                  : "A commitment does not reserve the name."}
          </p>
          {s ? (
            <div className="session-panel">
              <h2>{s.name}</h2>
              <p>
                {s.years} year(s) · maximum {formatEth(BigInt(s.maxPriceWei))} ETH
              </p>
              <p>Deadline {formatTimestamp(BigInt(s.deadline))}</p>
              <p className="wait-state">{waitText}</p>
              {s.commitHash && <p className="address">Commit transaction: {s.commitHash}</p>}
              {s.revealHash && <p className="address">Reveal transaction: {s.revealHash}</p>}
              <p className="muted">Keep this browser’s local storage until reveal completes. The secret stays scoped to your wallet, chain and controller.</p>
              <div className="button-stack">
                <ActionButton v={v} id="reveal" disabled={revealDisabled}>
                  Reveal and pay current quote
                </ActionButton>
                <ActionButton v={v} id="discard" secondary disabled={v.busy || !!v.pending}>
                  Discard local commitment
                </ActionButton>
                <a className="text-link" href="#manage">
                  Set your address in Manage Name <Arrow />
                </a>
              </div>
            </div>
          ) : (
            <ActionButton v={v} id="prepare" disabled={!v.ready || v.busy || !v.status || !v.available}>
              Commit {v.status?.name ?? "name"}
            </ActionButton>
          )}
        </section>
      </div>
    </>
  );
}
