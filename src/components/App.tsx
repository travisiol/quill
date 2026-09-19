"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { WagmiProvider } from "wagmi";
import { chainFor, publicClientFor, wagmiConfigFor } from "@/lib/chain";
import { loadDeployment, UNCONFIGURED_MESSAGE, type Deployment } from "@/lib/deployment";
import { Controller } from "./Controller";

type Boot = { deployment: Deployment | null; error: string } | null;

/**
 * Boots the app: loads /deployment.json once, builds the chain, the wagmi
 * config and the read client from it, then hands over to the controller.
 */
export default function App() {
  const [boot, setBoot] = useState<Boot>(null);
  useEffect(() => {
    let cancelled = false;
    loadDeployment().then((r) => {
      if (!cancelled) setBoot(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const deployment = boot?.deployment ?? null;
  const chain = useMemo(() => chainFor(deployment), [deployment]);
  const config = useMemo(() => wagmiConfigFor(chain, deployment), [chain, deployment]);
  const publicClient = useMemo(() => publicClientFor(chain, deployment), [chain, deployment]);
  const [queryClient] = useState(() => new QueryClient());

  if (!boot) return <div className="boot">READING DEPLOYMENT MANIFEST</div>;

  return (
    <WagmiProvider config={config} key={chain.id + (deployment?.registry ?? "")}>
      <QueryClientProvider client={queryClient}>
        <Controller deployment={deployment} chain={chain} deploymentError={boot.error || (deployment ? "" : UNCONFIGURED_MESSAGE)} publicClient={publicClient} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
