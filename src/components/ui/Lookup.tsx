"use client";

import { BRAND } from "@/lib/brand";
import { logInteraction } from "@/lib/log";
import { canonicalOrError } from "@/lib/namespace";
import type { ViewModel } from "@/lib/viewModel";
import { Arrow } from "./Basics";

/** Name + years + "Check onchain": the same form on every app page. */
export function Lookup({ v, onInspect }: { v: ViewModel; onInspect?: () => void }) {
  const r = v.input ? canonicalOrError(v.input) : { canonical: null, error: null };
  return (
    <form
      className="lookup"
      data-form="lookup"
      onSubmit={(e) => {
        e.preventDefault();
        logInteraction(`Form submitted: lookup, name: ${v.input}`);
        if (!v.busy && v.configured && r.canonical) {
          v.actions.inspect();
          onInspect?.();
        }
      }}
    >
      <div className="lookup-fields">
        <div className="name-field">
          <label htmlFor="name-input">Name</label>
          <input
            id="name-input"
            name="name"
            value={v.input}
            onChange={(e) => v.fields.input(e.target.value)}
            placeholder={`yourname.${BRAND.tld}`}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            aria-invalid={!!r.error}
            aria-describedby="name-preview"
          />
        </div>
        <div className="years-field">
          <label htmlFor="years-input">Years</label>
          <select id="years-input" value={v.years} onChange={(e) => v.fields.years(e.target.value)}>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={v.busy || !v.configured || !r.canonical || !!r.error}>
          Check onchain <Arrow />
        </button>
      </div>
      <p id="name-preview" className={r.error ? "field-note invalid" : "field-note"} data-canonical>
        {r.error ??
          (r.canonical ? (
            <>
              Canonical onchain <strong>{r.canonical}</strong>
              <span> · Spelling only — check availability onchain</span>
            </>
          ) : (
            <span>Spelling only — check availability onchain</span>
          ))}
      </p>
    </form>
  );
}
