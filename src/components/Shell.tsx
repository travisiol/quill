"use client";

import { BRAND } from "@/lib/brand";
import { walletGuidance } from "@/lib/phase";
import { describeTracked } from "@/lib/tx";
import type { ViewModel } from "@/lib/viewModel";
import { Developers } from "./pages/Developers";
import { Home } from "./pages/Home";
import { Manage } from "./pages/Manage";
import { Names } from "./pages/Names";
import { Profile } from "./pages/Profile";
import { Register } from "./pages/Register";
import { ActionButton, Arrow, PageHeading, XIcon } from "./ui/Basics";
import { Nib } from "./ui/Logo";
import { Lookup } from "./ui/Lookup";
import { StatusDetails } from "./ui/StatusDetails";
import { Toast } from "./ui/Toast";

const APP_PAGES: [string, string][] = [
  ["search", "Search"],
  ["register", "Register"],
  ["names", "My Names"],
  ["manage", "Manage"],
  ["profile", "Profile"],
];

const X_URL = BRAND.xHandle ? `https://x.com/${BRAND.xHandle}` : "";

function SearchPage({ v }: { v: ViewModel }) {
  return (
    <>
      <PageHeading number="02" title="Find your name.">
        A readable beginning. Check canonical spelling, availability and price directly onchain.
      </PageHeading>
      <Lookup v={v} />
      <StatusDetails v={v} />
      {v.status &&
        (v.available ? (
          <a className="button" href="#register">
            Register {v.status.name} <Arrow />
          </a>
        ) : (
          <a className="text-link" href="#profile">
            View profile (reserved names may be unavailable) <Arrow />
          </a>
        ))}
    </>
  );
}

/** Header, navigation, the current page, the transaction panel and the footer. */
export function Shell({ v }: { v: ViewModel }) {
  const page = v.page;
  return (
    <>
      <Toast toast={v.toast} onClose={v.actions.closeToast} />
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <a href="#home" className="brand" aria-label={`${BRAND.name} home`}>
          <Nib className="brand-logo" />
          {BRAND.name}
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
        </a>
        <div className="desktop-links">
          <a href="#search" aria-current={APP_PAGES.some(([p]) => p === page) ? "page" : undefined}>
            / APP
          </a>
          <a href="#developers" aria-current={page === "developers" ? "page" : undefined}>
            / DEVELOPERS
          </a>
          {X_URL && (
            <a href={X_URL} target="_blank" rel="noreferrer" aria-label="X (Twitter)" style={{ display: "flex", alignItems: "center" }}>
              <XIcon />
            </a>
          )}
        </div>
        <div className="header-actions">
          <ActionButton v={v} id={v.address ? "disconnect" : "connect"} secondary>
            {v.address ? (v.primaryName ? `Disconnect ${v.primaryName} (${v.address.slice(0, 6)}…)` : `Disconnect ${v.address.slice(0, 6)}…`) : "Connect wallet"}
          </ActionButton>
          <button
            type="button"
            id="menu-toggle"
            className="menu-toggle secondary"
            aria-label={v.menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={v.menuOpen}
            aria-controls="site-navigation"
            onClick={v.actions.menu}
          >
            Menu <span aria-hidden="true">{v.menuOpen ? "−" : "+"}</span>
          </button>
        </div>
      </header>
      <nav
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) v.actions.closeMenu();
        }}
        id="site-navigation"
        className={`app-nav ${v.menuOpen ? "is-open" : ""}`}
        aria-label="Main navigation"
      >
        <a href="#home" aria-current={page === "home" ? "page" : undefined}>
          Home
        </a>
        {APP_PAGES.map(([p, label]) => (
          <a key={p} href={`#${p}`} aria-current={page === p ? "page" : undefined}>
            {label}
          </a>
        ))}
        <a href="#developers" aria-current={page === "developers" ? "page" : undefined}>
          Developers
        </a>
        <span className="network-label mono">{v.configured ? `CHAIN / ${v.networkId}` : "DEPLOYMENT / UNCONFIGURED"}</span>
        {X_URL && (
          <a href={X_URL} target="_blank" rel="noreferrer" style={{ marginTop: "auto", display: "flex", alignItems: "center" }} aria-label="X (Twitter)">
            <XIcon style={{ marginRight: "8px" }} />
          </a>
        )}
      </nav>
      <main id="main-content" tabIndex={-1} className={page === "home" ? "home-main" : "app-main"}>
        {!v.configured && (
          <aside className="environment-notice">
            <span className="notice-dot" aria-hidden="true" />
            <div>
              <strong>Configuration required</strong>
              <p>{v.deploymentError} No sample ownership is shown.</p>
            </div>
          </aside>
        )}
        {v.address && v.configured && v.chainId !== v.networkId && (
          <aside className="environment-notice">
            <div>
              <strong>Wrong network.</strong>
              <p>Connect to the configured chain to continue.</p>
            </div>
            <ActionButton v={v} id="switch">
              Switch to {v.networkName}
            </ActionButton>
          </aside>
        )}
        {page === "home" ? (
          <Home v={v} />
        ) : page === "search" ? (
          <SearchPage v={v} />
        ) : page === "register" ? (
          <Register v={v} />
        ) : page === "names" ? (
          <Names v={v} />
        ) : page === "manage" ? (
          <Manage v={v} />
        ) : page === "profile" ? (
          <Profile v={v} />
        ) : (
          <Developers v={v} />
        )}
        {page !== "home" && <p className="wallet-guidance">{walletGuidance(v.configured, !!v.address, v.chainId === v.networkId)}</p>}
        {v.transaction && (
          <article className="transaction-panel">
            <p className="eyebrow">{"/// TRANSACTION HISTORY"}</p>
            <h2>
              {v.transaction.status} · {v.transaction.operation}
            </h2>
            <p className="address">Original: {v.transaction.originalHash ?? "Unknown (legacy recovery)"}</p>
            <p className="address">Tracked: {v.transaction.hash}</p>
            {v.transaction.replacements?.map((r, i) => (
              <p className="address" key={i}>
                {r.reason}: {r.fromHash} → {r.hash}
              </p>
            ))}
            <p>{describeTracked(v.transaction)}</p>
            {v.explorer && (
              <a className="text-link" href={`${v.explorer}/tx/${v.transaction.hash}`} target="_blank" rel="noreferrer">
                Transaction receipt <Arrow />
              </a>
            )}
            <p className="muted">Receipt inclusion is distinct from indexer finality.</p>
          </article>
        )}
        <div role="status" aria-live="polite" className={`notice ${v.busy || v.message || v.pending ? "has-message" : ""}`}>
          {v.busy && (
            <div className="shimmer-loading-bar">
              <span className="shimmer-badge-dot" />
              <span>Working onchain… </span>
              <div className="shimmer-pulse-line" />
            </div>
          )}
          {v.message}
          {v.pending && (
            <>
              <p className="address">Pending transaction: {v.pending}</p>
              <ActionButton v={v} id="recover" disabled={v.busy}>
                Recover receipt
              </ActionButton>
            </>
          )}
        </div>
      </main>
      <footer className="site-footer">
        <div className="footer-top">
          <p>
            A readable layer
            <br />
            for your onchain identity.
          </p>
          <div>
            <a href="#search">
              Find a name <Arrow />
            </a>
            <a href="#developers">
              Developers <Arrow />
            </a>
            <a href="#manage">
              Manage a name <Arrow />
            </a>
            {X_URL && (
              <a href={X_URL} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                Follow on X <Arrow />
              </a>
            )}
          </div>
        </div>
        <div className="footer-wordmark" aria-hidden="true">
          <Nib className="footer-logo" />
          {BRAND.name}
          <span>↗</span>
        </div>
        <div className="footer-bottom">
          <span>{BRAND.footerLine}</span>
          <p>
            No Robinhood endorsement. No automatic ENS or wallet compatibility.
            <br />
            Independent namespace on Robinhood Chain. ETH fees shown exclude gas.
          </p>
        </div>
      </footer>
    </>
  );
}
