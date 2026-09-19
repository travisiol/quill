import type { Address } from "viem";
import type { Page } from "./phase";
import type { NameStatus } from "./sdk";
import type { CommitmentSession, TrackedTransaction } from "./tx";
import type { ProfileKey } from "./abi";

export type ActionId =
  | "copyCA"
  | "inspect"
  | "prepare"
  | "reveal"
  | "renew"
  | "myNames"
  | "recover"
  | "connect"
  | "disconnect"
  | "switch"
  | "menu"
  | "closeMenu"
  | "closeToast"
  | "discard"
  | "saveAddress"
  | "saveRecord"
  | "setPrimary"
  | "clearPrimary"
  | "transfer"
  | "refund"
  | "recheck";

export type Toast = { id: number; message: string; type: "success" | "error" | "info" };

export type OwnedName = { name: string; state: string; expiry: bigint; primary: boolean };

export type CarouselItem = { name: string; image: string; alt?: string };

/** Everything the pages render from, and every action they can trigger. */
export type ViewModel = {
  page: Page;
  menuOpen: boolean;
  configured: boolean;
  deploymentError: string;
  address: Address | undefined;
  chainId: number | undefined;
  networkId: number | undefined;
  networkName: string;
  registry: Address | undefined;
  explorer: string | undefined;
  manifest: string;
  input: string;
  years: string;
  busy: boolean;
  ready: boolean;
  available: boolean;
  price: bigint | null;
  destination: Address | null;
  status: NameStatus | null;
  session: CommitmentSession | null;
  now: bigint;
  committedAt: bigint;
  transaction: TrackedTransaction | null;
  pending: `0x${string}` | null;
  message: string;
  namesRead: string;
  owned: OwnedName[];
  texts: Record<string, string>;
  recordAddress: string;
  recipient: string;
  recordKey: ProfileKey;
  recordValue: string;
  actions: Record<ActionId, () => void>;
  fields: {
    input: (v: string) => void;
    years: (v: string) => void;
    recordAddress: (v: string) => void;
    recipient: (v: string) => void;
    recordKey: (v: ProfileKey) => void;
    recordValue: (v: string) => void;
  };
  selectName: (name: string) => void;
  primaryName: string | null;
  toast: Toast | null;
  carouselItems: CarouselItem[] | undefined;
};
