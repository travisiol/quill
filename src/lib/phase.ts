import type { CommitmentSession, TrackedTransaction } from "./tx";

export const PAGES = ["home", "search", "register", "names", "manage", "profile", "developers"] as const;
export type Page = (typeof PAGES)[number];

export function pageFromHash(hash: string): Page {
  const p = hash.replace(/^#/, "");
  return (PAGES as readonly string[]).includes(p) ? (p as Page) : "home";
}

export type Phase = "commit" | "wait" | "reveal" | "complete" | "expired" | "attention";

export const MIN_AGE = 60n;
export const MAX_AGE = 86400n;

/** Where a saved commitment stands against chain time and its tracked transaction. */
export function registrationPhase(session: CommitmentSession | null, committedAt: bigint, now: bigint, tx: TrackedTransaction | null): Phase {
  if (!session) return "commit";
  const revealTracked = !!session.revealHash && tx?.operation === "register" && tx.originalHash === session.revealHash;
  const commitTracked = !!session.commitHash && tx?.operation === "commit" && tx.originalHash === session.commitHash;
  if (revealTracked && tx?.status === "confirmed") return "complete";
  if (now > BigInt(session.deadline) || (committedAt > 0n && now >= committedAt + MAX_AGE)) return "expired";
  if ((revealTracked || commitTracked) && tx && ["cancelled", "replaced", "unresolved", "reverted"].includes(tx.status)) return "attention";
  if (committedAt === 0n) return "commit";
  if (now < committedAt + MIN_AGE) return "wait";
  return "reveal";
}

export function walletGuidance(configured: boolean, connected: boolean, rightChain: boolean): string {
  if (!configured) return "Deployment not configured. Onchain reads and wallet actions are disabled.";
  if (!connected) return "Connect your wallet to transact. Public reads do not require a wallet.";
  if (!rightChain) return "Switch to the configured network before transacting.";
  return "Each action is simulated before your wallet is asked to confirm. Fees exclude gas.";
}
