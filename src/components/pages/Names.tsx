"use client";

import { formatTimestamp } from "@/lib/namespace";
import type { ViewModel } from "@/lib/viewModel";
import { ActionButton, Arrow, PageHeading } from "../ui/Basics";
import { NamesSkeleton } from "../ui/StatusDetails";

export function Names({ v }: { v: ViewModel }) {
  const loading = v.namesRead.startsWith("Loading");
  return (
    <>
      <PageHeading number="04" title="My Names">
        Your registrations, with status read directly from chain.
      </PageHeading>
      <div className="section-toolbar">
        <p>Includes expired NFTs. Holding an expired NFT does not grant active rights.</p>
        <ActionButton v={v} id="myNames" disabled={!v.address || v.busy || !v.configured}>
          Read my names from RPC
        </ActionButton>
      </div>
      <p className="read-state" role="status">
        {v.namesRead}
      </p>
      {v.owned.length ? (
        v.owned.map((n) => (
          <article className="name-row" key={n.name}>
            <div>
              <h2>{n.name}</h2>
              <p>
                {n.state ?? "Unknown"} · expires {formatTimestamp(n.expiry)}
              </p>
            </div>
            {n.primary && <span className="status-tag">Primary</span>}
            <a className="button secondary" href="#manage" data-name={n.name} onClick={() => v.selectName(n.name)}>
              Renew or manage →
            </a>
          </article>
        ))
      ) : (
        <div className="empty-state">
          <span className="mono">[ — ]</span>
          <h2>
            {loading
              ? "Reading registrations…"
              : v.namesRead.startsWith("Read failed")
                ? "The scan could not finish."
                : v.namesRead.startsWith("Incomplete")
                  ? "This list is incomplete."
                  : v.namesRead === "Not loaded"
                    ? "Your names begin here."
                    : "No names in this scan."}
          </h2>
          <p>{loading ? "Scanning registrations from RPC onchain…" : "No names shown. Read from chain to refresh, or search for a name to register."}</p>
          {loading ? (
            <NamesSkeleton />
          ) : (
            <a className="text-link" href="#search">
              Search for a name <Arrow />
            </a>
          )}
        </div>
      )}
    </>
  );
}
