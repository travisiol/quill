"use client";

import type { Toast as ToastData } from "@/lib/viewModel";

export function Toast({ toast, onClose }: { toast: ToastData | null; onClose?: () => void }) {
  if (!toast) return null;
  return (
    <aside className={`toast-notification toast-${toast.type}`} role="status" aria-live="polite">
      <div className="toast-body">
        <strong className="toast-title">{toast.type === "success" ? "SUCCESS" : toast.type === "error" ? "ATTENTION" : "NOTIFICATION"}</strong>
        <p className="toast-text">{toast.message}</p>
      </div>
      {onClose && (
        <button type="button" className="toast-close" onClick={onClose} aria-label="Close notification">
          ✕
        </button>
      )}
    </aside>
  );
}
