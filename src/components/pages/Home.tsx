"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";
import type { ViewModel } from "@/lib/viewModel";
import { Arrow } from "../ui/Basics";
import { DepthCarousel } from "../ui/DepthCarousel";
import { Lookup } from "../ui/Lookup";
import { SearchModal } from "../ui/SearchModal";

const FALLBACK_CARDS = BRAND.sampleNames.map((label) => ({ name: `${label}.${BRAND.tld}`, image: `/cards/${label}.svg`, alt: "" }));

const FEATURES: [string, string, string, string, string, string][] = [
  ["01", "Register", "Start with a name.", "Choose a canonical name, commit privately, then reveal onchain. Registration is time-limited.", "#register", "Find your name"],
  [
    "02",
    "Resolve",
    "Give it a destination.",
    "Set a chain-specific address. Integrated apps read the resolver before a payment. An unset name stays unresolved.",
    "#profile",
    "Explore a profile",
  ],
  ["03", "Own", "Keep control of it.", "Renew, transfer or update your active registration. Expired NFTs do not grant active naming rights.", "#names", "Open My Names"],
];

export function Home({ v }: { v: ViewModel }) {
  const [open, setOpen] = useState(false);
  const items = v.carouselItems && v.carouselItems.length > 1 ? v.carouselItems : FALLBACK_CARDS;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">01 / IDENTITY INFRASTRUCTURE</p>
          {BRAND.tokenAddress && (
            <button type="button" className="ca-badge" onClick={v.actions.copyCA} title="Click to copy contract address">
              CA: {BRAND.tokenAddress}
            </button>
          )}
          <h1>
            Your name.
            <br />
            Your onchain
            <br />
            <span>identity.</span>
          </h1>
          <p className="hero-description">
            A name people can read.
            <br />
            An identity your apps can resolve.
          </p>
        </div>
        <div className="hero-carousel-container">
          <div className="diagram-label mono">
            {BRAND.name} / NAME → NODE <span>EXAMPLE</span>
          </div>
          <DepthCarousel
            items={items}
            depth={240}
            spread={95}
            tilt={20}
            tiltDirection="right"
            perspective={1400}
            visibleCards={4}
            falloff={0.2}
            blur={5}
            autoplay={false}
            loop
            cardWidth={370}
            cardHeight={480}
            radius={20}
            tint="#07060a"
            duration={700}
            autoplayDelay={3200}
            showControls
            showIndicators
          />
          <p className="diagram-caption">Illustrative names. No ownership or availability claim.</p>
        </div>
        <div className="hero-search">
          <Lookup v={v} onInspect={() => setOpen(true)} />
          {v.status && (
            <button type="button" className="hero-search-trigger" onClick={() => setOpen(true)} aria-label={`View onchain search result for ${v.status.name}`}>
              <span className="status-indicator" data-available={String(v.available)} />
              <strong>{v.status.name}</strong>
              <span className="mono trigger-note">({v.available ? "Available" : "Reserved / Registered"})</span>
              <span className="text-link trigger-link">
                View details <Arrow />
              </span>
            </button>
          )}
          <a className="text-link" href="#search" style={{ display: "inline-flex", marginTop: "14px" }}>
            Explore your name <Arrow />
          </a>
        </div>
      </section>
      <SearchModal open={open} onClose={() => setOpen(false)} v={v} />
      <div className="technical-strip">
        <span>
          <b>3–32</b> ASCII characters
        </span>
        <span>
          <b>1–5</b> registration years
        </span>
        <span>
          <b>90-day</b> renewal grace
        </span>
      </div>
      <section className="feature-section">
        <div className="section-heading">
          <p className="eyebrow">{"/// THE NAMESPACE"}</p>
          <h2>
            Readable by people.
            <br />
            Verifiable onchain.
          </h2>
        </div>
        {FEATURES.map(([n, kicker, title, body, href, cta]) => (
          <article className="feature-row" key={n}>
            <div className="feature-index mono">
              [{n}] / {kicker}
            </div>
            <h3>{title}</h3>
            <div>
              <p>{body}</p>
              <a className="text-link" href={href}>
                {cta} <Arrow />
              </a>
            </div>
          </article>
        ))}
      </section>
      <section className="protocol-section">
        <div className="section-heading">
          <p className="eyebrow">{"/// REGISTRATION FLOW"}</p>
          <h2>
            A little patience.
            <br />
            A private beginning.
          </h2>
          <p>
            Your commitment hides the name until reveal.
            <br />
            It does not reserve it.
          </p>
        </div>
        <ol className="protocol-steps">
          <li>
            <span className="mono">[01] / COMMIT</span>
            <h3>Seal your choice.</h3>
            <p>Save a secret in this browser, scoped to your wallet, chain and controller. Submit the commitment.</p>
          </li>
          <li>
            <span className="mono">[02] / WAIT</span>
            <h3>Let chain time pass.</h3>
            <p>Wait at least 60 seconds of chain time after the commitment is recorded.</p>
          </li>
          <li>
            <span className="mono">[03] / REVEAL</span>
            <h3>Make it readable.</h3>
            <p>Reveal before 24 hours and your chosen deadline. The app checks price and availability again.</p>
          </li>
        </ol>
        <a className="button" href="#register">
          Start registration <Arrow />
        </a>
      </section>
      <section className="developer-cta">
        <div>
          <p className="eyebrow">{"/// FOR DEVELOPERS"}</p>
          <h2>
            Names in.
            <br />
            Addresses out.
          </h2>
          <p>
            Integrate explicit, chain-aware resolution.
            <br />
            No universal wallet support implied.
          </p>
          <a className="button secondary" href="#developers">
            Build with {BRAND.name} <Arrow />
          </a>
        </div>
        <div className="code-panel">
          <span className="mono">TYPESCRIPT / {BRAND.sdkPackage.toUpperCase()}</span>
          <pre>
            <code>{`const recipient = await ${BRAND.sdkVariable}.resolveName(
  '${BRAND.exampleName}'
);

if (!recipient) {
  throw new Error('Unresolved');
}`}</code>
          </pre>
          <p>Always recheck from chain before payment.</p>
        </div>
      </section>
    </>
  );
}
