import type { Address, Hex } from "viem";
import { ROOT_NODE, isAddress, isBytes32, isUintString } from "./namespace";

export const SUPPORTED_CHAINS = [31337, 46630, 4663] as const;

export type Deployment = {
  environment?: string;
  proxyPattern?: string;
  status?: string;
  chainId: number;
  rpcUrl: string;
  registry: Address;
  controller: Address;
  resolver: Address;
  reverse: Address;
  implementations?: Record<string, string>;
  rootNode: Hex;
  deploymentBlock: string;
  sourceCommit: string;
  explorer?: string;
};

export const UNCONFIGURED_MESSAGE =
  "Deployment not configured. Run the local chain (npm run chain) or deploy, then keep the generated public manifest at public/deployment.json.";
export const INVALID_MESSAGE =
  "Deployment manifest invalid or unavailable. Check chain, namespace, addresses and public manifest format. Actions are disabled.";

/** Rejects anything the SDK would not trust: wrong chain, wrong root node, zero or duplicate addresses, odd RPC. */
export function validateDeployment(raw: unknown): asserts raw is Deployment {
  if (!raw || typeof raw !== "object") throw new Error("InvalidDeployment");
  const d = raw as Partial<Deployment>;
  if (
    !(SUPPORTED_CHAINS as readonly number[]).includes(Number(d.chainId)) ||
    d.rootNode !== ROOT_NODE ||
    !isUintString(d.deploymentBlock) ||
    typeof d.sourceCommit !== "string" ||
    !d.sourceCommit
  ) {
    throw new Error("InvalidDeployment");
  }
  const addrs = [d.registry, d.controller, d.resolver, d.reverse];
  if (addrs.some((a) => !isAddress(a) || /^0x0{40}$/.test(a)) || new Set(addrs.map((a) => String(a).toLowerCase())).size !== 4) {
    throw new Error("InvalidDeployment");
  }
  const rpc = new URL(String(d.rpcUrl));
  if (!["http:", "https:"].includes(rpc.protocol) || rpc.username || rpc.password) throw new Error("InvalidDeployment");
  if (d.explorer && new URL(d.explorer).protocol !== "https:") throw new Error("InvalidDeployment");
  if (!isBytes32(d.rootNode)) throw new Error("InvalidDeployment");
}

export type DeploymentLoad = { deployment: Deployment | null; error: string };

export async function loadDeployment(): Promise<DeploymentLoad> {
  try {
    const res = await fetch("/deployment.json", { cache: "no-store" });
    if (!res.ok) return { deployment: null, error: UNCONFIGURED_MESSAGE };
    const json = await res.json();
    validateDeployment(json);
    return { deployment: json, error: "" };
  } catch {
    return { deployment: null, error: INVALID_MESSAGE };
  }
}

/** Local chains are reached directly; everything else through the same-origin relay. */
export function browserRpcUrl(d: Deployment): string {
  return d.chainId === 31337 ? d.rpcUrl : "/api/rpc";
}
