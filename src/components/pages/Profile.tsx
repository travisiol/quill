"use client";

import type { ViewModel } from "@/lib/viewModel";
import { ActionButton, PageHeading } from "../ui/Basics";
import { Lookup } from "../ui/Lookup";
import { StatusDetails } from "../ui/StatusDetails";

function RecordValue({ name, value }: { name: string; value: string }) {
  if (!value) return <>Not set</>;
  if (name === "avatar" && (value.startsWith("http") || value.startsWith("data:image"))) {
    return (
      <div className="record-avatar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="avatar preview" />
        <a href={value} target="_blank" rel="noreferrer" className="record-link">
          {value}
        </a>
      </div>
    );
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="record-link">
        {value}
      </a>
    );
  }
  return <>{value}</>;
}

export function Profile({ v }: { v: ViewModel }) {
  return (
    <>
      <PageHeading number="06" title="A public identity.">
        Read the records. Verify the destination. Never infer it from NFT ownership.
      </PageHeading>
      <Lookup v={v} />
      <StatusDetails v={v} />
      {!v.destination && (
        <aside className="resolution-notice">
          <span className="mono">RESOLUTION / UNSET OR UNCHECKED</span>
          <h2>Check before you send.</h2>
          <p>Unresolved — not ready to receive payments</p>
          <p>No payment destination is implied by a displayed name or owner.</p>
        </aside>
      )}
      {v.status && (
        <section className="profile-records">
          <p className="eyebrow">{"/// PUBLIC RECORDS"}</p>
          <dl>
            {Object.entries(v.texts).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>
                  <RecordValue name={key} value={value} />
                </dd>
              </div>
            ))}
          </dl>
          <p>Records are public, unverified text. Links and images are provided by the name owner.</p>
          <ActionButton v={v} id="recheck" disabled={!v.configured || v.busy}>
            Recheck payment destination
          </ActionButton>
        </section>
      )}
    </>
  );
}
