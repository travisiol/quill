import { concat, keccak256, stringToHex, type Address, type Hex } from "viem";
import { BRAND, SUFFIX } from "./brand";

export const MAX_UINT256 = (1n << 256n) - 1n;
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/** Decimal integer string that fits a uint256. */
export function isUintString(v: unknown): v is string {
  return typeof v === "string" && /^(0|[1-9][0-9]*)$/.test(v) && v.length <= 78 && BigInt(v) <= MAX_UINT256;
}

export function isBytes32(v: unknown): v is Hex {
  return typeof v === "string" && v.length === 66 && /^0x[0-9a-fA-F]{64}$/.test(v);
}

export function isAddress(v: unknown): v is Address {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
}

export const LABEL_RULE = "Use 3–32 ASCII letters, numbers or hyphens. No leading or trailing hyphen.";

/**
 * Canonical spelling: lowercase, the suffix implied or present once, and the
 * label within the on-chain rules. Throws InvalidLabel otherwise.
 */
export function normalizeName(input: string): string {
  const lowered = input.replace(/[A-Z]/g, (c) => c.toLowerCase()).trim();
  const label = lowered.endsWith(SUFFIX) ? lowered.slice(0, -SUFFIX.length) : lowered;
  if (
    label.length < 3 ||
    label.length > 32 ||
    /[^a-z0-9-]/.test(label) ||
    !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(label) ||
    label.startsWith("xn--")
  ) {
    throw new Error("InvalidLabel: use 3–32 ASCII letters, digits or interior hyphens");
  }
  return `${label}${SUFFIX}`;
}

export function labelOf(canonical: string): string {
  return canonical.slice(0, -SUFFIX.length);
}

export function canonicalOrError(input: string): { canonical: string | null; error: string | null } {
  try {
    return { canonical: normalizeName(input), error: null };
  } catch {
    return { canonical: null, error: LABEL_RULE };
  }
}

/** keccak256(bytes32(0) ‖ keccak256(tld)) — the same derivation as Names.sol. */
export const ROOT_NODE: Hex = keccak256(concat([`0x${"00".repeat(32)}`, keccak256(stringToHex(BRAND.tld))]));

export function namehash(name: string): Hex {
  return keccak256(concat([ROOT_NODE, keccak256(stringToHex(labelOf(normalizeName(name))))]));
}

/** The localStorage key that scopes a commitment to wallet, chain and controller. */
export function commitKey(chainId: number, controller: string, wallet: string): string {
  return `${BRAND.storagePrefix}:commit:v1:${chainId}:${controller.toLowerCase()}:${wallet.toLowerCase()}`;
}

export function randomSecret(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function formatEth(wei: bigint): string {
  const frac = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return `${wei / 10n ** 18n}${frac ? "." + frac : ""}`;
}

export function formatTimestamp(ts: bigint | number): string {
  const d = new Date(Number(ts) * 1e3);
  return Number.isFinite(d.getTime()) ? d.toISOString().replace("T", " ").replace(".000Z", " UTC") : "Outside display range";
}

export function shortHex(h: string, head = 6, tail = 4): string {
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}
