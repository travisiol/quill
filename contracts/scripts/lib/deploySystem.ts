import { ethers } from "hardhat";
import type { Signer } from "ethers";

/** Yearly prices by label length: 3 chars, 4 chars, 5+ chars. */
export const DEFAULT_PRICES: [bigint, bigint, bigint] = [
  ethers.parseEther("0.01"),
  ethers.parseEther("0.002"),
  ethers.parseEther("0.0005"),
];

/** Labels no one can register; the registry keeps them out of `available`. */
export const RESERVED_LABELS = [
  "quill",
  "quillname",
  "quillnames",
  "admin",
  "root",
  "registrar",
  "resolver",
  "controller",
  "treasury",
  "support",
  "robinhood",
  "hood",
];

export type Deployed = {
  registry: string;
  controller: string;
  resolver: string;
  reverse: string;
  implementations: { registry: string; controller: string; resolver: string; reverse: string };
  rootNode: string;
  deploymentBlock: number;
  txHashes: string[];
};

/**
 * Deploys the four implementations behind ERC-1967 proxies, wires them and
 * closes the registry bootstrap. `deployer` pays and becomes the
 * bootstrapper; `admin` owns the proxies (Ownable2Step).
 */
export async function deploySystem(
  deployer: Signer,
  opts: { admin?: string; treasury?: string; prices?: [bigint, bigint, bigint]; reserved?: string[] } = {},
): Promise<Deployed> {
  const deployerAddr = await deployer.getAddress();
  const admin = opts.admin ?? deployerAddr;
  const treasury = opts.treasury ?? deployerAddr;
  const prices = opts.prices ?? DEFAULT_PRICES;
  const reserved = opts.reserved ?? RESERVED_LABELS;
  const txHashes: string[] = [];

  const Proxy = await ethers.getContractFactory("QuillProxy", deployer);
  const deployImpl = async (name: string) => {
    const f = await ethers.getContractFactory(name, deployer);
    const c = await f.deploy();
    await c.waitForDeployment();
    const tx = c.deploymentTransaction();
    if (tx) txHashes.push(tx.hash);
    return c;
  };
  const deployProxy = async (impl: string, data: string) => {
    const p = await Proxy.deploy(impl, data);
    await p.waitForDeployment();
    const tx = p.deploymentTransaction();
    if (tx) txHashes.push(tx.hash);
    return await p.getAddress();
  };

  const startBlock = await ethers.provider.getBlockNumber();

  const registryImpl = await deployImpl("QuillRegistryRegistrar");
  const registryAddr = await deployProxy(
    await registryImpl.getAddress(),
    registryImpl.interface.encodeFunctionData("initialize", [admin]),
  );

  const controllerImpl = await deployImpl("QuillController");
  const controllerAddr = await deployProxy(
    await controllerImpl.getAddress(),
    controllerImpl.interface.encodeFunctionData("initialize", [registryAddr, admin, treasury, prices]),
  );

  const resolverImpl = await deployImpl("QuillResolver");
  const resolverAddr = await deployProxy(
    await resolverImpl.getAddress(),
    resolverImpl.interface.encodeFunctionData("initialize", [registryAddr, admin]),
  );

  const reverseImpl = await deployImpl("QuillReverseRegistrar");
  const reverseAddr = await deployProxy(
    await reverseImpl.getAddress(),
    reverseImpl.interface.encodeFunctionData("initialize", [registryAddr, resolverAddr, admin]),
  );

  const registry = await ethers.getContractAt("QuillRegistryRegistrar", registryAddr, deployer);
  const boot = await registry.bootstrap(controllerAddr, reserved);
  txHashes.push(boot.hash);
  await boot.wait();

  // The avatar shown by tokenURI comes from the resolver; only the admin can wire it.
  if (admin.toLowerCase() === deployerAddr.toLowerCase()) {
    const tx = await registry.setResolver(resolverAddr);
    txHashes.push(tx.hash);
    await tx.wait();
  }

  return {
    registry: registryAddr,
    controller: controllerAddr,
    resolver: resolverAddr,
    reverse: reverseAddr,
    implementations: {
      registry: await registryImpl.getAddress(),
      controller: await controllerImpl.getAddress(),
      resolver: await resolverImpl.getAddress(),
      reverse: await reverseImpl.getAddress(),
    },
    rootNode: await registry.rootNode(),
    deploymentBlock: startBlock + 1,
    txHashes,
  };
}

/** The public manifest the site loads from /deployment.json. */
export function manifestFor(
  d: Deployed,
  extra: { chainId: number; rpcUrl: string; environment: string; explorer?: string; sourceCommit?: string },
) {
  return {
    environment: extra.environment,
    proxyPattern: "ERC1967_UUPS",
    status: "DEPLOYED_ONCHAIN",
    chainId: extra.chainId,
    rpcUrl: extra.rpcUrl,
    registry: d.registry,
    controller: d.controller,
    resolver: d.resolver,
    reverse: d.reverse,
    implementations: d.implementations,
    rootNode: d.rootNode,
    deploymentBlock: String(d.deploymentBlock),
    sourceCommit: extra.sourceCommit ?? "local",
    ...(extra.explorer ? { explorer: extra.explorer } : {}),
  };
}
