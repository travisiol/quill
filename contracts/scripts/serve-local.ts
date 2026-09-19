import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import { deploySystem, manifestFor } from "./lib/deploySystem";
import type { QuillController } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Rehearsal network for the site: an in-process Hardhat network served
 * over JSON-RPC (with CORS) on PORT, the four QUILL proxies deployed and
 * bootstrapped, Multicall3's real bytecode copied in so wagmi's batched
 * reads work, a few names seeded, and ../public/deployment.json written so
 * `next dev` picks the deployment up on the next reload.
 *
 *   npm run serve:local                    # port 8697, seeded
 *   SEED=none npm run serve:local          # empty namespace
 *   PORT=8700 SITE=http://localhost:3697 npm run serve:local
 *
 * Test wallet: hardhat account #1 (alice) is unlocked, so the browser stub
 * (public/dev-wallet.js) can send from it without a key.
 */
const PORT = Number(process.env.PORT ?? 8697);
const SITE = process.env.SITE ?? "http://localhost:3697";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const ROBINHOOD_RPC = "https://rpc.mainnet.chain.robinhood.com";
const MULTICALL_CACHE = path.resolve(__dirname, "lib/multicall3.json");
const MANIFEST = path.resolve(__dirname, "../../public/deployment.json");

function serve() {
  const server = http.createServer((req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end("bad json");
        return;
      }
      const handle = async (call: { id?: unknown; method: string; params?: unknown[] }) => {
        try {
          const result = await network.provider.request({ method: call.method, params: call.params ?? [] });
          return { jsonrpc: "2.0", id: call.id ?? null, result };
        } catch (e) {
          const err = e as { code?: number; message?: string; data?: unknown };
          return {
            jsonrpc: "2.0",
            id: call.id ?? null,
            error: { code: typeof err.code === "number" ? err.code : -32000, message: err.message ?? "error", data: err.data },
          };
        }
      };
      const out = Array.isArray(payload) ? await Promise.all(payload.map(handle)) : await handle(payload as { method: string });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  server.listen(PORT, () => console.log(`serving JSON-RPC on http://127.0.0.1:${PORT} — Ctrl+C to stop`));
}

async function installMulticall3() {
  let code: string | null = null;
  if (fs.existsSync(MULTICALL_CACHE)) {
    code = (JSON.parse(fs.readFileSync(MULTICALL_CACHE, "utf8")) as { code: string }).code;
  } else {
    try {
      const res = await fetch(ROBINHOOD_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [MULTICALL3, "latest"] }),
      });
      const j = (await res.json()) as { result?: string };
      if (j.result && j.result !== "0x") {
        code = j.result;
        fs.writeFileSync(MULTICALL_CACHE, JSON.stringify({ address: MULTICALL3, source: ROBINHOOD_RPC, code }, null, 2) + "\n");
      }
    } catch {
      /* offline: batched reads will be unavailable */
    }
  }
  if (code) {
    await network.provider.send("hardhat_setCode", [MULTICALL3, code]);
    console.log("multicall3 bytecode installed");
  } else {
    console.log("warning: no multicall3 bytecode (offline?) — wagmi batching will fail");
  }
}

async function registerFor(controller: QuillController, who: HardhatEthersSigner, label: string, years: bigint) {
  const price: bigint = await controller.quote(label, years);
  const block = await ethers.provider.getBlock("latest");
  const deadline = BigInt(block!.timestamp) + 86400n;
  const secret = ethers.hexlify(ethers.randomBytes(32));
  const c = await controller.makeCommitment(label, who.address, years, price, deadline, secret);
  await (await controller.connect(who).commit(c)).wait();
  await network.provider.send("evm_increaseTime", [61]);
  await network.provider.send("evm_mine", []);
  await (await controller.connect(who).register(label, years, price, deadline, secret, { value: price })).wait();
  return price;
}

async function main() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();
  await network.provider.send("evm_mine", []);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  await installMulticall3();

  const d = await deploySystem(deployer);
  const manifest = manifestFor(d, { chainId, rpcUrl: `http://127.0.0.1:${PORT}`, environment: "local" });
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`chainId ${chainId} — registry ${d.registry}\n  controller ${d.controller}\n  resolver ${d.resolver}\n  reverse ${d.reverse}`);
  console.log(`manifest written to ${MANIFEST}`);

  if (process.env.SEED !== "none") {
    const controller = await ethers.getContractAt("QuillController", d.controller);
    const resolver = await ethers.getContractAt("QuillResolver", d.resolver);
    const reverse = await ethers.getContractAt("QuillReverseRegistrar", d.reverse);
    const registry = await ethers.getContractAt("QuillRegistryRegistrar", d.registry);
    const node = (label: string) => ethers.keccak256(ethers.concat([d.rootNode, ethers.keccak256(ethers.toUtf8Bytes(label))]));

    // Three illustrative registrations with avatars, so the home carousel
    // has cards and a profile has records. alice's name is her primary.
    const seeds: Array<[typeof alice, string, bigint, string]> = [
      [alice, "ada", 2n, "Writes contracts by hand."],
      [bob, "hal", 1n, "Reads before it sends."],
      [carol, "ines", 3n, "Keeps the ledger."],
    ];
    for (const [who, label, years, description] of seeds) {
      await registerFor(controller, who, label, years);
      const n = node(label);
      await (await resolver.connect(who).setAddr(n, who.address)).wait();
      await (await resolver.connect(who).setText(n, "avatar", `${SITE}/cards/${label}.svg`)).wait();
      await (await resolver.connect(who).setText(n, "description", description)).wait();
      await (await resolver.connect(who).setText(n, "url", `${SITE}/#profile`)).wait();
      await (await reverse.connect(who).setPrimaryName(n)).wait();
      console.log(`  seeded ${label}.quill → ${who.address} (${years}y)`);
    }
    // one name without any record, to show the "unresolved" state
    await registerFor(controller, bob, "blank", 1n);
    console.log(`  seeded blank.quill → ${bob.address} (no records)`);
    console.log(`  ${await registry.balanceOf(bob.address)} names held by bob`);
  }

  console.log(`test wallet (unlocked): alice ${alice.address}, bob ${bob.address}, carol ${carol.address}`);
  console.log(`site: ${SITE} — set localStorage["quill:dev-wallet"] = {"rpc":"http://127.0.0.1:${PORT}","address":"${alice.address}"} to use the stub wallet`);
  serve();
  await new Promise(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
