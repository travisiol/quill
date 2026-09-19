"use client";

import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { logInteraction } from "@/lib/log";
import type { ActionId, ViewModel } from "@/lib/viewModel";

export function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export function ActionButton({
  v,
  id,
  children,
  disabled = false,
  secondary = false,
}: {
  v: ViewModel;
  id: ActionId;
  children: ReactNode;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      data-action={id}
      className={`${secondary ? "secondary" : ""}${v.busy ? " is-busy" : ""}`.trim()}
      disabled={disabled}
      onClick={() => {
        logInteraction(`Action clicked: ${id}`);
        v.actions[id]();
      }}
    >
      {children}
      <Arrow />
    </button>
  );
}

export function PageHeading({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <div className="page-heading">
      <p className="eyebrow">
        {number} / {BRAND.fullName.toUpperCase()}
      </p>
      <h1>{title}</h1>
      <p className="lede">{children}</p>
    </div>
  );
}

export function XIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: "middle", ...style }} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
