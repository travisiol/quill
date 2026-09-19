import type { Hex } from "viem";
import { BRAND } from "./brand";
import { isBytes32, isUintString, normalizeName } from "./namespace";

// ----------------------------------------------------------------------------
// Commitment sessions — the secret lives only in this browser's storage,
// scoped to wallet, chain and controller by the storage key.

export type CommitmentSession = {
  version: 1;
  name: string;
  years: "1" | "2" | "3" | "4" | "5";
  maxPriceWei: string;
  deadline: string;
  secret: Hex;
  commitment?: Hex;
  commitHash?: Hex;
  revealHash?: Hex;
};

export function parseSession(raw: string | null): CommitmentSession | null {
  if (!raw) return null;
  const s = JSON.parse(raw);
  if (!s || typeof s !== "object") throw new Error("Invalid saved commitment");
  const a = s as Partial<CommitmentSession>;
  if (
    a.version !== 1 ||
    !isBytes32(a.secret) ||
    typeof a.years !== "string" ||
    !["1", "2", "3", "4", "5"].includes(a.years) ||
    !isUintString(a.maxPriceWei) ||
    !isUintString(a.deadline) ||
    typeof a.name !== "string" ||
    normalizeName(a.name) !== a.name
  ) {
    throw new Error("Invalid saved commitment");
  }
  for (const k of ["commitment", "commitHash", "revealHash"] as const) {
    if (Object.prototype.hasOwnProperty.call(a, k) && !isBytes32(a[k])) throw new Error("Invalid saved commitment");
  }
  return a as CommitmentSession;
}

// ----------------------------------------------------------------------------
// Tracked transactions — a hash may be repriced, cancelled or replaced by the
// wallet; only the original call's own receipt confirms the operation.

export type ReplacementReason = "repriced" | "cancelled" | "replaced" | "unknown";
export type TxStatus = "pending" | "confirmed" | "reverted" | "cancelled" | "replaced" | "unresolved";

export type TrackedTransaction = {
  version: 2;
  hash: Hex;
  originalHash: Hex | null;
  replacements: { fromHash: Hex; hash: Hex; reason: ReplacementReason }[];
  status: TxStatus;
  operation: string;
  receiptStatus?: "success" | "reverted";
};

export function newTracked(hash: Hex, operation: string): TrackedTransaction {
  return { version: 2, hash, originalHash: hash, replacements: [], status: "pending", operation };
}

function clone(t: TrackedTransaction): TrackedTransaction {
  return {
    version: 2,
    hash: t.hash,
    originalHash: t.originalHash === undefined ? t.hash : t.originalHash,
    replacements: (t.replacements ?? []).map((r) => ({ fromHash: r.fromHash, hash: r.hash, reason: r.reason })),
    status: t.status,
    operation: t.operation,
    ...(t.receiptStatus ? { receiptStatus: t.receiptStatus } : {}),
  };
}

function onlyRepriced(t: TrackedTransaction): boolean {
  return t.originalHash !== null && (t.replacements ?? []).every((r) => r.reason === "repriced");
}

export function withReplacement(t: TrackedTransaction, hash: Hex, reason: string): TrackedTransaction {
  if (!isBytes32(hash)) throw new Error("InvalidTransaction");
  const base = clone(t);
  if (hash === base.hash) return base;
  const r: ReplacementReason = ["repriced", "cancelled", "replaced"].includes(reason) ? (reason as ReplacementReason) : "unknown";
  return { ...base, hash, status: "pending", receiptStatus: undefined, replacements: [...base.replacements, { fromHash: base.hash, hash, reason: r }] };
}

export function withReceipt(t: TrackedTransaction, hash: Hex, receiptStatus: "success" | "reverted"): TrackedTransaction {
  const base = hash === t.hash ? clone(t) : withReplacement(t, hash, "unknown");
  const first = base.replacements.find((r) => r.reason !== "repriced");
  const status: TxStatus =
    base.originalHash === null || first?.reason === "unknown"
      ? "unresolved"
      : first?.reason === "cancelled"
        ? "cancelled"
        : first?.reason === "replaced"
          ? "replaced"
          : receiptStatus === "success"
            ? "confirmed"
            : "reverted";
  return { ...base, status, receiptStatus };
}

export function isOpen(t: TrackedTransaction): boolean {
  return t.status === "pending" || t.status === "unresolved";
}

export function describeTracked(t: TrackedTransaction): string {
  switch (t.status) {
    case "confirmed":
      return "Confirmed: original call receipt included. Indexer finality is separate.";
    case "reverted":
      return "Original call reverted. No successful original state change.";
    case "cancelled":
      return `Original operation cancelled; cancellation receipt ${t.receiptStatus ?? "unknown"}. The ${BRAND.name} operation is not confirmed.`;
    case "replaced":
      return `Original operation replaced by a different call; replacement receipt ${t.receiptStatus ?? "unknown"}. The ${BRAND.name} operation is not confirmed.`;
    case "unresolved":
      return "Original operation unresolved. Keep all hashes and recheck chain state; no success or failure is inferred.";
    default:
      return "Pending receipt. A replacement or timeout does not confirm the original operation.";
  }
}

export function parseTracked(storage: Storage, key: string): TrackedTransaction | null {
  const raw = storage.getItem(`${key}:transaction`);
  if (!raw) {
    const pending = storage.getItem(`${key}:pending`);
    if (pending === null) return null;
    if (!isBytes32(pending)) throw new Error("InvalidTransaction");
    return { ...newTracked(pending, "recovered"), originalHash: null, status: "unresolved" };
  }
  const s = JSON.parse(raw);
  if (
    !s ||
    !isBytes32(s.hash) ||
    !["pending", "confirmed", "reverted", "cancelled", "replaced", "unresolved"].includes(s.status) ||
    typeof s.operation !== "string" ||
    s.operation.length > 80
  ) {
    throw new Error("InvalidTransaction");
  }
  if (s.version === undefined) return { ...newTracked(s.hash, s.operation), originalHash: null, status: "unresolved" };
  if (
    s.version !== 2 ||
    !(s.originalHash === null || isBytes32(s.originalHash)) ||
    !Array.isArray(s.replacements) ||
    (s.receiptStatus !== undefined && !["success", "reverted"].includes(s.receiptStatus))
  ) {
    throw new Error("InvalidTransaction");
  }
  let last: Hex | null = s.originalHash;
  for (const r of s.replacements) {
    if (
      !r ||
      !isBytes32(r.fromHash) ||
      !isBytes32(r.hash) ||
      !["repriced", "cancelled", "replaced", "unknown"].includes(r.reason) ||
      r.fromHash === r.hash ||
      (last !== null && r.fromHash !== last)
    ) {
      throw new Error("InvalidTransaction");
    }
    last = r.hash;
  }
  if (last !== null && last !== s.hash) throw new Error("InvalidTransaction");
  if ((s.status === "confirmed" || s.status === "reverted") && !onlyRepriced(s)) throw new Error("InvalidTransaction");
  if (["cancelled", "replaced"].includes(s.status) && !s.replacements.some((r: { reason: string }) => r.reason === s.status)) {
    throw new Error("InvalidTransaction");
  }
  return clone(s);
}

/** Refuses to start a new transaction while one is open, and proves storage works. */
export function assertNoOpenTransaction(storage: Storage, key: string): void {
  const t = parseTracked(storage, key);
  if (t && isOpen(t)) throw new Error("PendingTransaction");
  storage.setItem(`${key}:storage-check`, "1");
  storage.removeItem(`${key}:storage-check`);
}

// ----------------------------------------------------------------------------
// Errors → one sentence the person can act on. Arguments are never echoed.

const PATTERNS: [RegExp, string][] = [
  [/TransactionCancelled/, `Original operation cancelled. The cancellation receipt is not confirmation of the ${BRAND.name} operation.`],
  [/TransactionReplaced|TransactionRereplaced/, `Original operation replaced by a different call. The ${BRAND.name} operation is not confirmed.`],
  [/TransactionUnresolved/, "Original operation unresolved. Preserve the visible hashes and recheck chain state."],
  [/user rejected|denied|4001/i, "Wallet rejected the request."],
  [/insufficient funds/i, "Insufficient ETH for payment and gas."],
  [/WrongNetwork|chain mismatch/i, "Wrong network. Switch to the configured deployment network."],
  [/CommitmentTooNew/, "Commitment is too new. Wait for 60 seconds of chain time."],
  [/CommitmentExpired|DeadlineExpired/, "Commitment expired. Start a new commitment."],
  [/MissingCommitment/, "No matching commitment for this wallet and these parameters."],
  [/ExistingCommitment/, "A commitment for another name is already saved in this browser. Reveal or discard it first."],
  [/Unavailable/, "This name is unavailable or reserved."],
  [/PriceExceeded/, "The chain quote exceeds your committed maximum. Start again with a new maximum."],
  [/receipt.*not found|TransactionReceiptNotFound/i, "Receipt not found yet. Keep the pending hash and retry recovery."],
  [/timeout|timed out/i, "RPC timeout. A submitted transaction may still be pending; recover its saved hash."],
  [/fetch|network|RPC|HTTP/i, "RPC connection failed. Retry reads; do not assume a submitted transaction failed."],
];

const PASSTHROUGH = [
  "ContextChanged",
  "InvalidDeployment",
  "InvalidDeploymentWiring",
  "InvalidLabel",
  "DeploymentMissing",
  "PendingTransaction",
  "AccountChanged",
  "ConnectWallet",
  "InvalidAddress",
  "RecordTooLong",
  "Unresolved",
  "TransactionReverted",
  "OnlyActiveOwner",
  "NotActive",
  "NotRenewable",
  "HorizonExceeded",
  "Underpaid",
  "Paused",
  "NothingToWithdraw",
];

export function describeError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return (
    PATTERNS.find(([re]) => re.test(message))?.[1] ??
    PASSTHROUGH.find((s) => message.includes(s)) ??
    "Request failed. Check wallet, RPC and current chain state. Sensitive transaction arguments are not shown."
  );
}
