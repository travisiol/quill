"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Abi, Address, Chain, Hex, PublicClient, WalletClient } from "viem";
import { useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";
import { controllerAbi, registryAbi, resolverAbi, reverseAbi, PROFILE_KEYS, type ProfileKey } from "@/lib/abi";
import { BRAND, SUFFIX } from "@/lib/brand";
import type { Deployment } from "@/lib/deployment";
import { log } from "@/lib/log";
import { commitKey as makeCommitKey, isAddress, labelOf, namehash, normalizeName, randomSecret, ZERO_ADDRESS } from "@/lib/namespace";
import { pageFromHash, type Page } from "@/lib/phase";
import { createQuill, type NameStatus } from "@/lib/sdk";
import { discardSession, saveSession, saveTracked, useCommitStore } from "@/lib/store";
import {
  assertNoOpenTransaction,
  describeError,
  describeTracked,
  isOpen,
  newTracked,
  parseTracked,
  withReceipt,
  withReplacement,
  type CommitmentSession,
  type TrackedTransaction,
} from "@/lib/tx";
import type { CarouselItem, OwnedName, Toast, ViewModel } from "@/lib/viewModel";
import { Shell } from "./Shell";

const LOG_CHUNK = 100_000n;
let toastSeq = 0;

type Props = { deployment: Deployment | null; chain: Chain; deploymentError: string; publicClient: PublicClient };

function readPage(): Page {
  return pageFromHash(typeof location !== "undefined" ? location.hash : "");
}

function initialInput(): string {
  if (typeof location === "undefined") return "";
  return new URLSearchParams(location.search).get("name") ?? "";
}

function looksLikeError(text: string): boolean {
  const t = text.toLowerCase();
  return ["failed", "reject", "error", "invalid", "unavailable", "revert"].some((w) => t.includes(w));
}

/**
 * The app's state machine: one context (wallet, chain, name, years) at a
 * time; every async result is applied only if that context is still
 * current; every transaction is simulated, sent, tracked through
 * replacements and confirmed by its own receipt.
 */
export function Controller({ deployment, chain, deploymentError, publicClient }: Props) {
  const { address, chainId } = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connectAsync } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const quill = useMemo(() => (deployment ? createQuill(publicClient, deployment) : null), [publicClient, deployment]);

  const [page, setPage] = useState<Page>(readPage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [input, setInput] = useState<string>(initialInput);
  const [years, setYears] = useState("1");
  const [primaryName, setPrimaryName] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [status, setStatus] = useState<NameStatus | null>(null);
  const [price, setPrice] = useState<bigint | null>(null);
  const [available, setAvailable] = useState(false);
  const [destination, setDestination] = useState<Address | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [owned, setOwned] = useState<OwnedName[]>([]);
  const [carouselItems, setCarouselItems] = useState<CarouselItem[] | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [namesRead, setNamesRead] = useState("Not loaded");
  const [recordAddress, setRecordAddress] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recordKey, setRecordKey] = useState<ProfileKey>("description");
  const [recordValue, setRecordValue] = useState("");
  const [now, setNow] = useState(0n);
  const [committedAt, setCommittedAt] = useState(0n);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(new Set<string>());
  const menuWasOpen = useRef(false);

  const commitKey = deployment && address ? makeCommitKey(deployment.chainId, deployment.controller, address) : "";
  const store = useCommitStore(commitKey);
  const session = store.session;
  const transaction = store.transaction;
  const pending: Hex | null = transaction && isOpen(transaction) ? transaction.hash : null;
  const ready = !!(deployment && address && walletClient && chainId === deployment.chainId);

  // The context every async result is checked against.
  const contextKey = JSON.stringify([commitKey, chainId ?? null, input, years]);
  const contextRef = useRef(contextKey);
  const keyRef = useRef(commitKey);
  useEffect(() => {
    contextRef.current = contextKey;
    keyRef.current = commitKey;
  });
  const isCurrent = useCallback((ctx: string) => contextRef.current === ctx, []);
  const assertCurrent = useCallback(
    (ctx: string) => {
      if (!isCurrent(ctx)) throw new Error("ContextChanged");
    },
    [isCurrent],
  );

  // A changed name, duration, wallet or chain discards the previous snapshot.
  const [seenContext, setSeenContext] = useState(contextKey);
  if (seenContext !== contextKey) {
    setSeenContext(contextKey);
    setStatus(null);
    setPrice(null);
    setDestination(null);
    setAvailable(false);
    setTexts({});
    setBusy(false);
  }
  // A changed wallet or chain also drops everything scoped to the old one.
  const walletKey = `${commitKey}|${chainId ?? ""}`;
  const [seenWallet, setSeenWallet] = useState(walletKey);
  if (seenWallet !== walletKey) {
    setSeenWallet(walletKey);
    setCommittedAt(0n);
    setMessage(store.error ?? "");
    setOwned([]);
    setNamesRead("Not loaded");
  }

  const showToast = useCallback((text: string, type: Toast["type"] = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: ++toastSeq, message: text, type });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  const closeToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  /** The status line under the page, mirrored as a toast. */
  const notify = useCallback(
    (text: string) => {
      setMessage(text);
      if (text) showToast(text, looksLikeError(text) ? "error" : "info");
    },
    [showToast],
  );

  // ---------------------------------------------------------------- effects

  useEffect(() => {
    const onHash = () => {
      if (location.hash !== "#main-content") {
        setPage(readPage());
        setMenuOpen(false);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (menuWasOpen.current && !menuOpen) document.getElementById("menu-toggle")?.focus();
    menuWasOpen.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Primary name of the connected wallet.
  useEffect(() => {
    if (!deployment || !address) return;
    let cancelled = false;
    publicClient
      .readContract({ address: deployment.reverse, abi: reverseAbi, functionName: "primaryNameOf", args: [address] })
      .then((name) => {
        if (!cancelled) setPrimaryName(name && name.length > 0 ? name : null);
      })
      .catch(() => {
        if (!cancelled) setPrimaryName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicClient, deployment, address, chainId]);

  // Chain clock and the commitment's recorded time, every five seconds.
  const commitment = session?.commitment;
  useEffect(() => {
    if (!deployment) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const block = await publicClient.getBlock();
        if (cancelled) return;
        setNow(block.timestamp);
        if (commitment && address) {
          const at = await publicClient.readContract({ address: deployment.controller, abi: controllerAbi, functionName: "commitments", args: [address, commitment] });
          if (!cancelled) setCommittedAt(at);
        }
      } catch {
        if (!cancelled) setMessage("RPC connection failed. Existing transactions may still be pending.");
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [publicClient, deployment, commitment, address]);

  // Names with an avatar record become the home carousel.
  useEffect(() => {
    if (!deployment) return;
    let live = true;
    (async () => {
      try {
        const latest = await publicClient.getBlockNumber();
        const from = BigInt(deployment.deploymentBlock);
        const registered = await publicClient.getLogs({
          address: deployment.registry,
          event: registryAbi.find((e) => e.type === "event" && e.name === "NameRegistered")!,
          fromBlock: from,
          toBlock: latest,
        });
        const changed = await publicClient.getLogs({
          address: deployment.resolver,
          event: resolverAbi.find((e) => e.type === "event" && e.name === "TextChanged")!,
          fromBlock: from,
          toBlock: latest,
        });
        if (!live) return;
        const labels = new Map<string, string>();
        for (const l of registered) {
          const a = l.args as { node?: Hex; label?: string };
          if (a.node && a.label) labels.set(a.node, a.label);
        }
        const items: CarouselItem[] = [];
        const seen = new Set<string>();
        for (let i = changed.length - 1; i >= 0; i--) {
          const a = changed[i].args as { node?: Hex; key?: string; value?: string };
          if (a.key === "avatar" && a.value && a.node && !seen.has(a.node)) {
            seen.add(a.node);
            const label = labels.get(a.node);
            if (label) items.push({ name: `${label}${SUFFIX}`, image: a.value });
          }
        }
        if (live && items.length > 0) setCarouselItems(items);
      } catch (e) {
        console.error(`[${BRAND.name}] Failed to fetch carousel items`, e);
      }
    })();
    return () => {
      live = false;
    };
  }, [publicClient, deployment]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // ---------------------------------------------------------------- helpers

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    const ctx = contextKey;
    try {
      assertCurrent(ctx);
      await fn();
    } catch (e) {
      if (isCurrent(ctx)) notify(describeError(e));
    } finally {
      if (isCurrent(ctx)) setBusy(false);
    }
  };

  async function inspect() {
    log("Inspecting canonical name:", input);
    assertCurrent(contextKey);
    if (!quill || !deployment) throw new Error("DeploymentMissing");
    const name = normalizeName(input);
    const [st, quote, avail, dest] = await Promise.all([quill.getNameStatus(name), quill.quoteRegistration(name, BigInt(years)), quill.available(name), quill.resolveName(name)]);
    const records = await quill.texts(st.node, PROFILE_KEYS, st.blockNumber);
    log("Inspect results:", { status: st, price: quote, available: avail, destination: dest, texts: records });
    if (isCurrent(contextKey)) {
      setStatus(st);
      setPrice(quote);
      setAvailable(avail);
      setDestination(dest);
      setTexts(records);
      notify("Read directly from chain. Quote excludes gas.");
    }
  }

  function persist(key: string, t: TrackedTransaction): boolean {
    const ok = saveTracked(key, t);
    if (!ok && keyRef.current === key) {
      notify("Transaction submitted, but browser storage failed. Copy the visible transaction hash before leaving this page.");
    }
    return ok;
  }

  async function send(contract: Address, abi: Abi, functionName: string, args: readonly unknown[], value = 0n, onHash?: (hash: Hex) => void) {
    log(`Sending transaction: ${functionName}`, { contract, args, amount: value });
    assertCurrent(contextKey);
    if (!ready || !walletClient || !address || !deployment || !quill) throw new Error("WrongNetwork");
    const key = commitKey;
    if (inFlight.current.has(key)) throw new Error("PendingTransaction");
    inFlight.current.add(key);
    try {
      assertNoOpenTransaction(localStorage, key);
      await quill.validate();
      const call = { address: contract, abi, functionName, args, account: address, value } as unknown as Parameters<PublicClient["simulateContract"]>[0];
      await publicClient.simulateContract(call);
      const [cid, addrs] = await Promise.all([walletClient.getChainId(), walletClient.getAddresses()]);
      assertCurrent(contextKey);
      if (cid !== deployment.chainId || addrs[0]?.toLowerCase() !== address.toLowerCase()) throw new Error("WrongNetwork");
      const write = { address: contract, abi, functionName, args, account: address, chain, value } as unknown as Parameters<WalletClient["writeContract"]>[0];
      const hash = await walletClient.writeContract(write);
      log(`Transaction broadcasted: ${hash}`);
      let tracked = newTracked(hash, functionName);
      let stored = persist(key, tracked);
      try {
        onHash?.(hash);
      } catch {
        stored = false;
      }
      if (keyRef.current === key) {
        notify(stored ? "Pending: awaiting receipt inclusion. A timeout does not mean failure." : "Broadcast succeeded; recovery storage failed. Copy the visible hash before leaving.");
      }
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 60_000,
        onReplaced: (r) => {
          log("Transaction replaced:", r);
          tracked = withReplacement(tracked, r.transaction.hash, r.reason);
          const ok = persist(key, tracked);
          if (keyRef.current === key) notify(`${describeTracked(tracked)}${ok ? "" : " Copy the visible hashes; storage failed."}`);
        },
      });
      log("Transaction confirmed:", receipt);
      tracked = withReceipt(tracked, receipt.transactionHash, receipt.status);
      const ok = persist(key, tracked);
      if (keyRef.current === key) notify(`${describeTracked(tracked)}${ok ? "" : " Storage failed: copy the visible hashes."}`);
      if (tracked.status !== "confirmed") {
        throw new Error(
          tracked.status === "reverted"
            ? "TransactionReverted"
            : tracked.status === "cancelled"
              ? "TransactionCancelled"
              : tracked.status === "replaced"
                ? "TransactionRereplaced"
                : "TransactionUnresolved",
        );
      }
      return receipt;
    } finally {
      inFlight.current.delete(key);
    }
  }

  async function recover() {
    if (!pending) return;
    assertCurrent(contextKey);
    const key = commitKey;
    if (!deployment || (await publicClient.getChainId()) !== deployment.chainId) throw new Error("WrongNetwork");
    let t = transaction ?? parseTracked(localStorage, key);
    if (!t) throw new Error("TransactionUnresolved");
    log("Recovering transaction:", t.hash);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: t.hash,
      timeout: 15_000,
      onReplaced: (r) => {
        t = withReplacement(t!, r.transaction.hash, r.reason);
        persist(key, t);
      },
    });
    t = withReceipt(t, receipt.transactionHash, receipt.status);
    const ok = persist(key, t);
    if (keyRef.current === key) notify(`${describeTracked(t)}${ok ? "" : " Save the visible hashes; storage failed."}`);
  }

  async function prepare() {
    log("Prepare commitment for:", input, "years:", years);
    if (!deployment || !quill || !address || !ready) throw new Error("WrongNetwork");
    if (session && session.name !== normalizeName(input)) throw new Error("ExistingCommitment");
    const key = commitKey;
    const name = normalizeName(input);
    const quote = await quill.quoteRegistration(name, BigInt(years));
    if (!(await quill.available(name))) throw new Error("Unavailable");
    const ts = (await publicClient.getBlock()).timestamp;
    const next: CommitmentSession = {
      version: 1,
      name,
      years: years as CommitmentSession["years"],
      maxPriceWei: String(quote),
      deadline: String(ts + 86400n),
      secret: randomSecret(),
    };
    next.commitment = await publicClient.readContract({
      address: deployment.controller,
      abi: controllerAbi,
      functionName: "makeCommitment",
      args: [labelOf(name), address, BigInt(years), quote, BigInt(next.deadline), next.secret],
    });
    log("Generated commitment session:", next);
    assertCurrent(contextKey);
    saveSession(key, next);
    await send(deployment.controller, controllerAbi, "commit", [next.commitment], 0n, (hash) => {
      next.commitHash = hash;
      saveSession(key, { ...next });
    });
  }

  async function reveal() {
    log("Reveal registration for:", session?.name);
    if (!session || !deployment || !quill || !address) throw new Error("MissingCommitment");
    const key = commitKey;
    const s = session;
    const quote = await quill.quoteRegistration(s.name, BigInt(s.years));
    if (quote > BigInt(s.maxPriceWei)) throw new Error("PriceExceeded");
    if (!(await quill.available(s.name))) throw new Error("Unavailable");
    await send(deployment.controller, controllerAbi, "register", [labelOf(s.name), BigInt(s.years), BigInt(s.maxPriceWei), BigInt(s.deadline), s.secret], quote, (hash) => {
      saveSession(key, { ...s, revealHash: hash });
    });
  }

  async function renew() {
    if (!deployment || !quill) throw new Error("DeploymentMissing");
    const name = normalizeName(input);
    const quote = await quill.quoteRegistration(name, BigInt(years));
    await send(deployment.controller, controllerAbi, "renew", [labelOf(name), BigInt(years), quote], quote);
    await inspect();
  }

  async function myNames() {
    log("Loading my names for address:", address);
    assertCurrent(contextKey);
    if (!deployment || !quill || !address) throw new Error("ConnectWallet");
    setOwned([]);
    setNamesRead("Loading; prior list is no longer current");
    try {
      const labels = new Set<string>();
      const latest = await quill.validate();
      const event = registryAbi.find((e) => e.type === "event" && e.name === "NameRegistered")!;
      for (let from = BigInt(deployment.deploymentBlock); from <= latest; from += LOG_CHUNK) {
        const to = from + LOG_CHUNK - 1n > latest ? latest : from + LOG_CHUNK - 1n;
        const logs = await publicClient.getLogs({ address: deployment.registry, event, fromBlock: from, toBlock: to });
        for (const l of logs) {
          const a = l.args as { label?: string };
          if (a.label) labels.add(a.label);
        }
        if (!isCurrent(contextKey)) return;
      }
      const mine: OwnedName[] = [];
      for (const label of labels) {
        const node = namehash(label);
        let owner: Address;
        let st: NameStatus;
        try {
          st = await quill.getNameStatus(label);
          owner = await publicClient.readContract({ address: deployment.registry, abi: registryAbi, functionName: "ownerOf", args: [BigInt(node)], blockNumber: st.blockNumber });
        } catch {
          if (isCurrent(contextKey)) setNamesRead("Incomplete: an ownership read failed. Retry the scan.");
          continue;
        }
        if (owner.toLowerCase() === address.toLowerCase()) {
          const primary = await publicClient.readContract({ address: deployment.reverse, abi: reverseAbi, functionName: "primaryNameOf", args: [address], blockNumber: st.blockNumber });
          mine.push({ name: `${label}${SUFFIX}`, state: st.state, expiry: st.expiresAt, primary: primary === `${label}${SUFFIX}` });
        }
      }
      log("Loaded names:", mine);
      if (isCurrent(contextKey)) {
        setOwned(mine);
        setNamesRead((prev) => (prev.startsWith("Incomplete") ? prev : `Registration log scan through block ${latest}; each status was read onchain. Refresh to update.`));
      }
    } catch (e) {
      if (isCurrent(contextKey)) {
        setOwned([]);
        setNamesRead("Read failed; list is not current. Retry the RPC scan.");
      }
      throw e;
    }
  }

  function assertAddress(v: string): Address {
    if (!isAddress(v) || v.toLowerCase() === ZERO_ADDRESS) throw new Error("InvalidAddress");
    return v;
  }

  // ---------------------------------------------------------------- actions

  const actions: ViewModel["actions"] = {
    copyCA: () => {
      if (!BRAND.tokenAddress) return;
      navigator.clipboard.writeText(BRAND.tokenAddress);
      showToast("Contract address copied to clipboard!", "success");
    },
    inspect: () => void run(inspect),
    prepare: () =>
      void run(async () => {
        log("[Action] prepare initiated");
        await prepare();
        showToast("Commitment submitted! Waiting for chain time.", "info");
      }),
    reveal: () =>
      void run(async () => {
        log("[Action] reveal initiated");
        await reveal();
        showToast("Registration complete and confirmed!", "success");
      }),
    renew: () =>
      void run(async () => {
        log("[Action] renew initiated for years:", years);
        await renew();
        showToast(`Renewal submitted for ${years} year(s)!`, "success");
      }),
    myNames: () => void run(myNames),
    recover: () =>
      void run(async () => {
        log("[Action] recover initiated");
        await recover();
      }),
    connect: () => {
      log("[Action] connect initiated");
      const connector = connectors[0];
      if (!connector) {
        notify("No wallet found. Install a browser wallet, then retry.");
        return;
      }
      connectAsync({ connector }).catch(() => notify("Wallet connection rejected or unavailable."));
    },
    disconnect: () => {
      log("[Action] disconnect initiated");
      disconnect();
      setPrimaryName(null);
      showToast("Wallet disconnected", "info");
    },
    switch: () => {
      log("[Action] switch chain initiated");
      if (deployment) switchChainAsync({ chainId: deployment.chainId }).catch(() => notify("Network switch rejected or unavailable."));
    },
    menu: () => {
      log("[Action] menu toggled");
      setMenuOpen((o) => !o);
    },
    closeMenu: () => setMenuOpen(false),
    closeToast,
    discard: () => {
      log("[Action] discard commitment initiated");
      discardSession(commitKey);
      setCommittedAt(0n);
      notify("Local commitment discarded. Start a new commit; previous gas is not refundable.");
      showToast("Commitment discarded", "info");
    },
    saveAddress: () =>
      void run(async () => {
        log("[Action] saveAddress initiated:", recordAddress);
        if (!deployment) throw new Error("DeploymentMissing");
        await send(deployment.resolver, resolverAbi, "setAddr", [namehash(input), assertAddress(recordAddress)]);
        await inspect();
        showToast(`Destination address updated to ${recordAddress}`, "success");
      }),
    saveRecord: () =>
      void run(async () => {
        log("[Action] saveRecord initiated:", recordKey, recordValue);
        if (!deployment) throw new Error("DeploymentMissing");
        if (new TextEncoder().encode(recordValue).length > 512) throw new Error("RecordTooLong");
        await send(deployment.resolver, resolverAbi, "setText", [namehash(input), recordKey, recordValue]);
        await inspect();
        showToast(`Profile record "${recordKey}" saved successfully!`, "success");
      }),
    setPrimary: () =>
      void run(async () => {
        log("[Action] setPrimary initiated:", input);
        if (!deployment) throw new Error("DeploymentMissing");
        await send(deployment.reverse, reverseAbi, "setPrimaryName", [namehash(input)]);
        const name = normalizeName(input);
        setPrimaryName(name);
        showToast(`Primary name set to ${name}`, "success");
      }),
    clearPrimary: () =>
      void run(async () => {
        log("[Action] clearPrimary initiated");
        if (!deployment) throw new Error("DeploymentMissing");
        await send(deployment.reverse, reverseAbi, "clearPrimaryName", []);
        setPrimaryName(null);
        showToast("Primary name cleared", "info");
      }),
    transfer: () =>
      void run(async () => {
        log("[Action] transfer initiated:", recipient);
        if (!deployment || !address) throw new Error("ConnectWallet");
        await send(deployment.registry, registryAbi, "safeTransferFrom", [address, assertAddress(recipient), BigInt(namehash(input))]);
        await inspect();
        showToast(`Name transferred to ${recipient}`, "success");
      }),
    refund: () =>
      void run(async () => {
        log("[Action] refund initiated");
        if (!deployment || !address) throw new Error("ConnectWallet");
        await send(deployment.controller, controllerAbi, "withdrawRefund", [address]);
        showToast("Refund credit withdrawn to your wallet", "success");
      }),
    recheck: () =>
      void run(async () => {
        log("[Action] recheck initiated:", input);
        if (!quill || !deployment) throw new Error("DeploymentMissing");
        const target = await quill.resolveName(input);
        if (!target) throw new Error("Unresolved");
        setDestination(target);
        log("Recheck result target:", target);
        notify(`Fresh chain resolution: ${normalizeName(input)} · chain ${deployment.chainId} · ${target}. Recheck again in the payment app immediately before confirming.`);
        showToast(`Resolved: ${target}`, "info");
      }),
  };

  const vm: ViewModel = {
    page,
    menuOpen,
    configured: !!deployment,
    deploymentError,
    address,
    chainId,
    networkId: deployment?.chainId,
    networkName: chain.name,
    registry: deployment?.registry,
    explorer: deployment?.explorer,
    manifest: deployment ? JSON.stringify(deployment, null, 2) : "No deployment manifest yet.",
    input,
    years,
    busy,
    ready,
    available,
    price,
    destination,
    status,
    session,
    now,
    committedAt,
    transaction,
    pending,
    message,
    namesRead,
    owned,
    texts,
    recordAddress,
    recipient,
    recordKey,
    recordValue,
    actions,
    fields: { input: setInput, years: setYears, recordAddress: setRecordAddress, recipient: setRecipient, recordKey: setRecordKey, recordValue: setRecordValue },
    selectName: setInput,
    primaryName,
    toast,
    carouselItems,
  };

  return <Shell v={vm} />;
}

