"use client";

import { useEffect, useRef } from "react";
import type { ViewModel } from "@/lib/viewModel";
import { Arrow } from "./Basics";
import { ReadPlaceholder, StatusDetails, StatusSkeleton } from "./StatusDetails";

/** The hero's result dialog: the same status card, framed, with a next step. */
export function SearchModal({ open, onClose, v }: { open: boolean; onClose: () => void; v: ViewModel }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="search-modal"
      aria-labelledby="search-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="search-modal-header">
        <p id="search-modal-title" className="eyebrow">
          {"/// ONCHAIN SEARCH RESULT"}
        </p>
        <button type="button" className="search-modal-close" onClick={onClose} aria-label="Close dialog">
          ✕
        </button>
      </div>
      <div className="search-modal-body">
        {v.busy && !v.status ? (
          <StatusSkeleton />
        ) : v.status ? (
          <StatusDetails v={v} />
        ) : (
          <ReadPlaceholder title="No status loaded yet." note="Enter a canonical name to verify onchain availability and price." />
        )}
      </div>
      <div className="search-modal-footer">
        {v.status &&
          (v.available ? (
            <a className="button" href="#register" onClick={onClose}>
              Register {v.status.name} <Arrow />
            </a>
          ) : (
            <a className="button secondary" href="#profile" onClick={onClose}>
              View profile <Arrow />
            </a>
          ))}
        <button type="button" className="button secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
