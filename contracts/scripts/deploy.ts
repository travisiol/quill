import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { ethers, network } from "hardhat";
import { deploySystem, manifestFor, DEFAULT_PRICES } from "./lib/deploySystem";

/**
 * Deploys QUILL to a real network and writes the public manifest.
 *
 *   DEPLOYER_PRIVATE_KEY=0x… npm run deploy:robinhood
 *
 * Optional: ADMIN (proxy owner, defaults to the deployer), TREASURY
 * (defaults to the deployer), PRICES="0.01,0.002,0.0005" in ETH per year for
 * 3 / 4 / 5+ character labels.
 *
 * Writes contracts/deployments/<network>.json (full record) and
 * ../public/deployment.json (what the site loads). If ADMIN is not the
 * deployer, the admin must call registry.setResolver(resolver) afterwards
 * so tokenURI can show avatars.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is not set");
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const admin = process.env.ADMIN?.trim() || deployer.address;
  const treasury = process.env.TREASURY?.trim() || deployer.address;
  const prices = process.env.PRICES
    ? (process.env.PRICES.split(",").map((p) => ethers.parseEther(p.trim())) as [bigint, bigint, bigint])
    : DEFAULT_PRICES;
  if (prices.length !== 3) throw new Error("PRICES needs three values");

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`network ${network.name} (chain ${chainId}) deployer ${deployer.address} balance ${ethers.formatEther(balance)} ETH`);
  console.log(`admin ${admin} treasury ${treasury} prices ${prices.map((p) => ethers.formatEther(p)).join(" / ")} ETH per year`);

  const d = await deploySystem(deployer, { admin, treasury, prices });
  let sourceCommit = "unknown";
  try {
    sourceCommit = execSync("git rev-parse HEAD", { cwd: path.resolve(__dirname, "../..") }).toString().trim();
  } catch {
    /* not a git checkout */
  }
  const rpcUrl = (network.config as { url?: string }).url ?? "";
  const explorer = chainId === 4663 ? "https://robinhoodchain.blockscout.com" : undefined;
  const manifest = manifestFor(d, {
    chainId,
    rpcUrl,
    environment: chainId === 4663 ? "mainnet" : chainId === 46630 ? "testnet" : "local",
    explorer,
    sourceCommit,
  });

  const outDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const record = { ...manifest, deployer: deployer.address, admin, treasury, prices: prices.map(String), txHashes: d.txHashes, deployedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, `${network.name}.json`), JSON.stringify(record, null, 2) + "\n");
  const publicManifest = path.resolve(__dirname, "../../public/deployment.json");
  fs.writeFileSync(publicManifest, JSON.stringify(manifest, null, 2) + "\n");

  console.log(JSON.stringify(manifest, null, 2));
  console.log(`written: ${path.join(outDir, `${network.name}.json`)} and ${publicManifest}`);
  if (admin.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`NOTE: admin ${admin} must call registry.setResolver(${d.resolver}) and accept ownership is not needed (set at initialize).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
