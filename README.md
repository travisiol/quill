# QUILL — your name, in ink.

An independent name service on Robinhood Chain. Readable `.quill` names,
commit–reveal registration, explicit chain-aware resolution. Nothing is
inferred from NFT ownership: a name resolves only while its registration is
active and its owner set an address for it.

- **Site**: Next.js 16 (hash-routed single page: `#search`, `#register`,
  `#names`, `#manage`, `#profile`, `#developers`), wagmi 3 + viem, no UI kit.
- **Contracts** (`contracts/`, Hardhat + OpenZeppelin 5, four UUPS proxies):
  - `QuillRegistryRegistrar` — the namespace as time-limited ERC-721
    registrations (`tokenId == uint256(node)`), 90-day grace, record epochs
    bumped on every registration and transfer, reserved labels, `tokenURI`
    with the avatar record.
  - `QuillController` — commit (≥ 60 s, ≤ 24 h) → reveal, prices per label
    length (3 / 4 / 5+ chars, per year, 1–5 years), refund credit for
    overpayment, revenue swept to the treasury, price and treasury changes
    behind a 2-day delay, pause.
  - `QuillResolver` — one address + free-text records per name, scoped by
    record epoch, only the active owner writes, reads answer only while active.
  - `QuillReverseRegistrar` — one primary name per wallet, valid only while
    the wallet owns the active name **and** the name resolves back to it.

## Run it locally

```bash
npm install
npm install --prefix contracts
npm run chain     # in-process Hardhat network on :8697, deploys + seeds, writes public/deployment.json
npm run dev       # http://localhost:3697
```

`npm run chain` seeds `ada.quill`, `hal.quill`, `ines.quill` (with avatar,
description and url records, each set as its owner's primary name) and
`blank.quill` (no records). `SEED=none npm run chain` gives an empty namespace.

To transact without a wallet extension, arm the dev stub from the console and
reload — it sends `eth_sendTransaction` to the local node, which signs for its
unlocked accounts:

```js
localStorage.setItem("quill:dev-wallet", JSON.stringify({ rpc: "http://127.0.0.1:8697", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }))
```

Skip the 60-second wait on the local chain with
`evm_increaseTime` + `evm_mine` against `:8697`.

## Tests and checks

```bash
npm test --prefix contracts   # 20 Hardhat tests: wiring, labels, pricing, commit–reveal, refunds, re-entrancy, resolver epochs, reverse, lifecycle, tokenURI
npm run lint                  # eslint (Next 16 / React Compiler rules)
npm run typecheck
npm run build
node scripts/capture.mjs      # headless Chrome captures → docs/captures/
```

## Deploy the contracts

```bash
cd contracts
cp .env.example .env          # DEPLOYER_PRIVATE_KEY, optional ADMIN / TREASURY / PRICES
npm run deploy:robinhood      # chain 4663; deploy:testnet for 46630
```

The script deploys the four implementations and proxies, bootstraps the
registry (controller + reserved labels), wires the resolver into `tokenURI`,
then writes `contracts/deployments/<network>.json` and
`public/deployment.json` — the manifest the site loads at startup. Without a
manifest the site renders in its "Configuration required" state with actions
disabled. The manifest is git-ignored: commit it on purpose when you deploy.

Changing the namespace suffix means changing `Names.TLD` in
`contracts/contracts/Names.sol` **and** `BRAND.tld` in `src/lib/brand.ts`: the
root node is derived from it on both sides and the site refuses a manifest
whose `rootNode` does not match.

## Site configuration

`src/lib/brand.ts` holds every brand string: wordmark, suffix, sample names,
SDK naming in the code snippets, the X handle (empty → links hidden) and the
token contract address shown as a copyable badge in the hero (empty → hidden).

- `/api/rpc` — same-origin JSON-RPC relay for public chains (the browser talks
  to a local node directly). Upstream: `QUILL_RPC_UPSTREAM`, else the
  manifest's `rpcUrl`, else the public Robinhood Chain RPC.
- `/api/upload` — avatar upload: Vercel Blob when `BLOB_READ_WRITE_TOKEN` is
  set, else `public/uploads` (needs a writable disk). The URL tab always works.
- `/api/log` — mirrors app events to the server console.

## Not done on purpose

- Nothing is deployed on Robinhood Chain; the flows above were played on the
  local chain with the stub wallet (commit → wait → reveal → address → primary
  name → My Names → profile).
- The X handle and the token address are empty in `brand.ts`.
- Uploads on Vercel need Blob; the disk fallback is for local use.
