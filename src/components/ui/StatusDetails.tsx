"use client";

import { formatEth, formatTimestamp } from "@/lib/namespace";
import type { ViewModel } from "@/lib/viewModel";
import { Arrow } from "./Basics";

function Fact({ wide = false, dd, dt }: { wide?: boolean; dd?: React.CSSProperties; dt?: React.CSSProperties }) {
  return (
    <div className={wide ? "wide" : undefined}>
      <dt>
        <div className="shimmer-line shimmer-dt" style={dt} />
      </dt>
      <dd>
        <div className="shimmer-line shimmer-dd" style={dd} />
      </dd>
    </div>
  );
}

export function StatusSkeleton() {
  return (
    <article className="details shimmer-container" aria-busy="true" aria-label="Loading registration status">
      <div className="detail-title">
        <div>
          <div className="shimmer-line shimmer-eyebrow" />
          <div className="shimmer-line shimmer-title" />
        </div>
        <div className="shimmer-badge" />
      </div>
      <dl className="facts">
        <Fact />
        <Fact />
        <Fact />
        <Fact />
        <Fact wide dd={{ width: "280px" }} />
        <Fact wide dd={{ width: "320px" }} />
      </dl>
      <p className="muted">Reading onchain status, quote and destination from RPC…</p>
    </article>
  );
}

export function NamesSkeleton() {
  return (
    <div className="shimmer-container" aria-busy="true" aria-label="Loading your names" style={{ width: "100%", marginTop: "16px" }}>
      {[1, 2, 3].map((i) => (
        <div className="shimmer-name-row" key={i}>
          <div className="shimmer-name-col">
            <div className="shimmer-line shimmer-row-title" />
            <div className="shimmer-line shimmer-row-sub" />
          </div>
          <div className="shimmer-badge" style={{ width: "60px" }} />
          <div className="shimmer-line shimmer-row-btn" />
        </div>
      ))}
    </div>
  );
}

export function ReadPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="read-placeholder">
      <span className="crosshair" aria-hidden="true">
        +
      </span>
      <p>
        {title}
        <br />
        <span>{note}</span>
      </p>
    </div>
  );
}

/** The pinned-block snapshot of a name: state, expiry, quote, epoch, destination. */
export function StatusDetails({ v }: { v: ViewModel }) {
  if (v.busy && !v.status) return <StatusSkeleton />;
  if (!v.status) {
    return <ReadPlaceholder title="Start with an onchain check." note="Status, price and destination appear here after a successful read." />;
  }
  const s = v.status;
  return (
    <article className="details">
      <div className="detail-title">
        <div>
          <p className="eyebrow">STATUS SNAPSHOT / BLOCK {String(s.blockNumber)}</p>
          <h2>{s.name}</h2>
        </div>
        <span className="status-tag">{s.state ?? "Unknown"}</span>
      </div>
      <dl className="facts">
        <div>
          <dt>Registration expiry</dt>
          <dd>{s.expiresAt === 0n ? "Never registered" : formatTimestamp(s.expiresAt)}</dd>
        </div>
        <div>
          <dt>Current quote · {v.years} year(s)</dt>
          <dd>{v.price === null ? "Not read" : formatEth(v.price) + " ETH + gas"}</dd>
        </div>
        <div>
          <dt>Record epoch</dt>
          <dd>{String(s.epoch)}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>Chain {v.networkId}</dd>
        </div>
        <div className="wide">
          <dt>Destination</dt>
          <dd className="address">{v.destination ?? "Unresolved — not ready to receive payments"}</dd>
        </div>
        <div className="wide">
          <dt>Registry</dt>
          <dd className="address">{v.registry}</dd>
        </div>
      </dl>
      <p className="muted">Status is pinned to this block; quote and destination are separate chain reads. Recheck before use.</p>
      {v.explorer && (
        <a className="text-link" href={`${v.explorer}/token/${v.registry}/instance/${BigInt(s.node)}`} target="_blank" rel="noreferrer">
          View NFT on explorer <Arrow />
        </a>
      )}
    </article>
  );
}
