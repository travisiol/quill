import { createPublicClient, defineChain, http, type Chain, type PublicClient } from "viem";
import { createConfig, type Config } from "wagmi";
import { injected } from "wagmi/connectors";
import { browserRpcUrl, type Deployment } from "./deployment";

export function chainFor(d: Deployment | null): Chain {
  const id = d?.chainId ?? 31337;
  return defineChain({
    id,
    name: id === 46630 ? "Robinhood Chain Testnet" : id === 4663 ? "Robinhood Chain" : "Local Hardhat",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [d?.rpcUrl ?? "http://127.0.0.1:8697"] } },
    ...(d?.explorer ? { blockExplorers: { default: { name: "Blockscout", url: d.explorer } } } : {}),
    ...(id === 4663 ? { contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } } : {}),
  });
}

/** Reads go through the same-origin relay for public chains; local nodes are hit directly. */
export function transportUrl(d: Deployment | null): string {
  return d ? browserRpcUrl(d) : "http://127.0.0.1:8697";
}

export function publicClientFor(chain: Chain, d: Deployment | null): PublicClient {
  return createPublicClient({ chain, transport: http(transportUrl(d), { batch: { wait: 16 } }) });
}

export function wagmiConfigFor(chain: Chain, d: Deployment | null): Config {
  return createConfig({
    chains: [chain],
    connectors: [injected()],
    transports: { [chain.id]: http(transportUrl(d)) },
    multiInjectedProviderDiscovery: true,
    ssr: false,
  });
}
