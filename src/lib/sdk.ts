import type { Address, PublicClient } from "viem";
import { controllerAbi, registryAbi, resolverAbi, reverseAbi } from "./abi";
import type { Deployment } from "./deployment";
import { ZERO_ADDRESS, labelOf, namehash, normalizeName } from "./namespace";

export type NameState = "available" | "active" | "grace";

export type NameStatus = {
  name: string;
  node: `0x${string}`;
  state: NameState;
  expiresAt: bigint;
  epoch: bigint;
  owner: Address;
  blockNumber: bigint;
};

const STATES: NameState[] = ["available", "active", "grace"];

/**
 * Read-side SDK: every read is pinned to one block after the deployment's
 * wiring has been re-verified against chain (registry ↔ controller ↔
 * resolver ↔ reverse). Nothing here needs a wallet.
 */
export function createQuill(client: PublicClient, d: Deployment) {
  async function assertChain(): Promise<bigint> {
    if ((await client.getChainId()) !== d.chainId) throw new Error("WrongNetwork");
    return client.getBlockNumber({ cacheTime: 0 });
  }

  /** Re-checks the wiring and returns the block the caller should pin to. */
  async function validate(): Promise<bigint> {
    const blockNumber = await assertChain();
    const wiring = await Promise.all([
      client.readContract({ address: d.registry, abi: registryAbi, functionName: "rootNode", blockNumber }),
      client.readContract({ address: d.registry, abi: registryAbi, functionName: "controller", blockNumber }),
      client.readContract({ address: d.controller, abi: controllerAbi, functionName: "registry", blockNumber }),
      client.readContract({ address: d.resolver, abi: resolverAbi, functionName: "registry", blockNumber }),
      client.readContract({ address: d.reverse, abi: reverseAbi, functionName: "registry", blockNumber }),
      client.readContract({ address: d.reverse, abi: reverseAbi, functionName: "resolver", blockNumber }),
    ]);
    const expected = [d.rootNode, d.controller, d.registry, d.registry, d.registry, d.resolver];
    if (wiring.some((v, i) => String(v).toLowerCase() !== expected[i].toLowerCase())) throw new Error("InvalidDeploymentWiring");
    return blockNumber;
  }

  async function getNameStatus(name: string): Promise<NameStatus> {
    const canonical = normalizeName(name);
    const node = namehash(canonical);
    const blockNumber = await validate();
    const [state, expiresAt, epoch, owner] = await Promise.all([
      client.readContract({ address: d.registry, abi: registryAbi, functionName: "nameState", args: [node], blockNumber }),
      client.readContract({ address: d.registry, abi: registryAbi, functionName: "expiresAt", args: [node], blockNumber }),
      client.readContract({ address: d.registry, abi: registryAbi, functionName: "recordEpoch", args: [node], blockNumber }),
      client.readContract({ address: d.registry, abi: registryAbi, functionName: "activeOwner", args: [node], blockNumber }),
    ]);
    return { name: canonical, node, state: STATES[Number(state)] ?? "available", expiresAt, epoch, owner, blockNumber };
  }

  async function resolveName(name: string): Promise<Address | null> {
    const blockNumber = await validate();
    const addr = await client.readContract({ address: d.resolver, abi: resolverAbi, functionName: "addr", args: [namehash(name)], blockNumber });
    return addr === ZERO_ADDRESS ? null : addr;
  }

  /** The wallet's primary name, only if that name resolves back to the wallet. */
  async function getPrimaryName(wallet: Address): Promise<string | null> {
    const blockNumber = await validate();
    const name = await client.readContract({ address: d.reverse, abi: reverseAbi, functionName: "primaryNameOf", args: [wallet], blockNumber });
    if (!name) return null;
    const back = await client.readContract({ address: d.resolver, abi: resolverAbi, functionName: "addr", args: [namehash(name)], blockNumber });
    return back.toLowerCase() === wallet.toLowerCase() ? name : null;
  }

  async function quoteRegistration(name: string, years: bigint): Promise<bigint> {
    const blockNumber = await validate();
    return client.readContract({ address: d.controller, abi: controllerAbi, functionName: "quote", args: [labelOf(normalizeName(name)), years], blockNumber });
  }

  async function available(name: string): Promise<boolean> {
    const blockNumber = await validate();
    return client.readContract({ address: d.controller, abi: controllerAbi, functionName: "available", args: [labelOf(normalizeName(name))], blockNumber });
  }

  async function texts(node: `0x${string}`, keys: readonly string[], blockNumber: bigint): Promise<Record<string, string>> {
    const entries = await Promise.all(
      keys.map(async (key) => [key, await client.readContract({ address: d.resolver, abi: resolverAbi, functionName: "text", args: [node, key], blockNumber })] as const),
    );
    return Object.fromEntries(entries);
  }

  return { validate, getNameStatus, resolveName, getPrimaryName, quoteRegistration, available, texts };
}

export type Quill = ReturnType<typeof createQuill>;
