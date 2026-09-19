import { useSyncExternalStore } from "react";
import { parseSession, parseTracked, type CommitmentSession, type TrackedTransaction } from "./tx";

/**
 * A tiny external store over localStorage, keyed by the commitment key
 * (wallet + chain + controller). Reads are cached per key so
 * useSyncExternalStore gets a stable snapshot; every write goes through
 * here and notifies subscribers. Unreadable entries surface as `error`
 * instead of throwing during render.
 */
export type Snapshot = {
  session: CommitmentSession | null;
  transaction: TrackedTransaction | null;
  error: string | null;
};

const EMPTY: Snapshot = { session: null, transaction: null, error: null };
const cache = new Map<string, Snapshot>();
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(key: string): Snapshot {
  const ls = storage();
  if (!key || !ls) return EMPTY;
  try {
    return { session: parseSession(ls.getItem(key)), transaction: parseTracked(ls, key), error: null };
  } catch {
    return {
      session: null,
      transaction: null,
      error: "Saved recovery data is unreadable or storage unavailable. No transaction has been sent by this action.",
    };
  }
}

function refresh(key: string): void {
  cache.set(key, read(key));
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(key: string): Snapshot {
  if (!key) return EMPTY;
  let s = cache.get(key);
  if (!s) {
    s = read(key);
    cache.set(key, s);
  }
  return s;
}

export function useCommitStore(key: string): Snapshot {
  return useSyncExternalStore(subscribe, () => getSnapshot(key), () => EMPTY);
}

export function saveSession(key: string, session: CommitmentSession): void {
  storage()?.setItem(key, JSON.stringify(session));
  refresh(key);
}

export function discardSession(key: string): void {
  storage()?.removeItem(key);
  refresh(key);
}

/** Persists the tracked record; false when storage failed (the caller warns). */
export function saveTracked(key: string, t: TrackedTransaction): boolean {
  try {
    const ls = storage();
    if (!ls) return false;
    ls.setItem(`${key}:transaction`, JSON.stringify(t));
    ls.removeItem(`${key}:pending`);
    return true;
  } catch {
    return false;
  } finally {
    refresh(key);
  }
}
