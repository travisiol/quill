import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deploySystem, DEFAULT_PRICES } from "../scripts/lib/deploySystem";

const YEAR = 365n * 86400n;
const GRACE = 90n * 86400n;

const rootNode = ethers.keccak256(ethers.concat([ethers.ZeroHash, ethers.keccak256(ethers.toUtf8Bytes("quill"))]));
const nodeOf = (label: string) => ethers.keccak256(ethers.concat([rootNode, ethers.keccak256(ethers.toUtf8Bytes(label))]));

async function fixture() {
  const [deployer, alice, bob, carol, treasury] = await ethers.getSigners();
  const d = await deploySystem(deployer, { treasury: treasury.address });
  const registry = await ethers.getContractAt("QuillRegistryRegistrar", d.registry);
  const controller = await ethers.getContractAt("QuillController", d.controller);
  const resolver = await ethers.getContractAt("QuillResolver", d.resolver);
  const reverse = await ethers.getContractAt("QuillReverseRegistrar", d.reverse);
  return { d, deployer, alice, bob, carol, treasury, registry, controller, resolver, reverse };
}

type Fx = Awaited<ReturnType<typeof fixture>>;

/** Commit, wait MIN_AGE, reveal — the way the site does it. */
async function registerName(fx: Fx, who: (typeof fx)["alice"], label: string, years = 1n, overpay = 0n) {
  const price = await fx.controller.quote(label, years);
  const now = BigInt(await time.latest());
  const deadline = now + 86400n;
  const secret = ethers.hexlify(ethers.randomBytes(32));
  const commitment = await fx.controller.makeCommitment(label, who.address, years, price, deadline, secret);
  await fx.controller.connect(who).commit(commitment);
  await time.increase(60);
  const tx = await fx.controller.connect(who).register(label, years, price, deadline, secret, { value: price + overpay });
  await tx.wait();
  return { price, deadline, secret, commitment, node: nodeOf(label) };
}

describe("QUILL name service", () => {
  describe("wiring", () => {
    it("deploys four proxies wired to each other with the expected root node", async () => {
      const fx = await fixture();
      expect(await fx.registry.rootNode()).to.equal(rootNode);
      expect(await fx.registry.controller()).to.equal(fx.d.controller);
      expect(await fx.controller.registry()).to.equal(fx.d.registry);
      expect(await fx.resolver.registry()).to.equal(fx.d.registry);
      expect(await fx.reverse.registry()).to.equal(fx.d.registry);
      expect(await fx.reverse.resolver()).to.equal(fx.d.resolver);
      expect(await fx.registry.name()).to.equal("Quill Name Service");
      expect(await fx.registry.symbol()).to.equal("QUILL");
      expect(await fx.controller.MIN_AGE()).to.equal(60n);
      expect(await fx.controller.MAX_AGE()).to.equal(86400n);
      expect(await fx.controller.ADMIN_DELAY()).to.equal(172800n);
    });

    it("closes the bootstrap after one call and reserves labels", async () => {
      const fx = await fixture();
      await expect(fx.registry.bootstrap(fx.d.controller, [])).to.be.revertedWithCustomError(fx.registry, "BootstrapClosedAlready");
      expect(await fx.registry.reserved(nodeOf("quill"))).to.equal(true);
      expect(await fx.registry.reserved(nodeOf("admin"))).to.equal(true);
      expect(await fx.controller.available("admin")).to.equal(false);
      expect(await fx.controller.available("quill")).to.equal(false);
      expect(await fx.controller.valid("admin")).to.equal(true);
    });

    it("only the owner can upgrade a proxy", async () => {
      const fx = await fixture();
      const impl = await (await ethers.getContractFactory("QuillResolver")).deploy();
      await impl.waitForDeployment();
      await expect(fx.resolver.connect(fx.alice).upgradeToAndCall(await impl.getAddress(), "0x")).to.be.revertedWithCustomError(
        fx.resolver,
        "OwnableUnauthorizedAccount",
      );
      await expect(fx.resolver.connect(fx.deployer).upgradeToAndCall(await impl.getAddress(), "0x")).to.emit(fx.resolver, "Upgraded");
    });
  });

  describe("labels and pricing", () => {
    it("validates labels: 3–32 lowercase ascii, digits, interior hyphens", async () => {
      const fx = await fixture();
      for (const ok of ["abc", "a-b", "vlad", "x".repeat(32), "123", "ab-cd-ef"]) expect(await fx.controller.valid(ok), ok).to.equal(true);
      for (const bad of ["ab", "-ab", "ab-", "xn--ab", "Vlad", "a b", "x".repeat(33), "", "é-a", "a_b"]) expect(await fx.controller.valid(bad), bad).to.equal(false);
    });

    it("quotes by length tier times years and rejects out-of-range years", async () => {
      const fx = await fixture();
      expect(await fx.controller.quote("abc", 1n)).to.equal(DEFAULT_PRICES[0]);
      expect(await fx.controller.quote("abcd", 1n)).to.equal(DEFAULT_PRICES[1]);
      expect(await fx.controller.quote("abcde", 1n)).to.equal(DEFAULT_PRICES[2]);
      expect(await fx.controller.quote("abcdefghij", 3n)).to.equal(DEFAULT_PRICES[2] * 3n);
      expect(await fx.controller.quote("abc", 5n)).to.equal(DEFAULT_PRICES[0] * 5n);
      await expect(fx.controller.quote("abc", 0n)).to.be.revertedWithCustomError(fx.controller, "InvalidYears");
      await expect(fx.controller.quote("abc", 6n)).to.be.revertedWithCustomError(fx.controller, "InvalidYears");
      await expect(fx.controller.quote("ab", 1n)).to.be.revertedWithCustomError(fx.controller, "InvalidLabel");
    });
  });

  describe("commit–reveal registration", () => {
    it("registers after 60s of chain time, mints the NFT and credits the overpayment", async () => {
      const fx = await fixture();
      const before = BigInt(await time.latest());
      const { price, node } = await registerName(fx, fx.alice, "alice", 2n, ethers.parseEther("0.001"));
      expect(await fx.registry.ownerOf(BigInt(node))).to.equal(fx.alice.address);
      expect(await fx.registry.activeOwner(node)).to.equal(fx.alice.address);
      expect(await fx.registry.nameState(node)).to.equal(1);
      expect(await fx.registry.labelOf(node)).to.equal("alice");
      expect(await fx.registry.recordEpoch(node)).to.equal(1n);
      const exp = await fx.registry.expiresAt(node);
      expect(exp).to.be.greaterThan(before + 2n * YEAR);
      expect(await fx.controller.refundCredit(fx.alice.address)).to.equal(ethers.parseEther("0.001"));
      expect(await fx.controller.totalRefundLiabilities()).to.equal(ethers.parseEther("0.001"));
      expect(await ethers.provider.getBalance(fx.d.controller)).to.equal(price + ethers.parseEther("0.001"));
      expect(await fx.controller.available("alice")).to.equal(false);
    });

    it("refuses a reveal that is too new, expired, past its deadline or without a commitment", async () => {
      const fx = await fixture();
      const label = "bobby";
      const years = 1n;
      const price = await fx.controller.quote(label, years);
      const now = BigInt(await time.latest());
      const deadline = now + 3600n;
      const secret = ethers.hexlify(ethers.randomBytes(32));
      const c = await fx.controller.makeCommitment(label, fx.bob.address, years, price, deadline, secret);

      await expect(fx.controller.connect(fx.bob).register(label, years, price, deadline, secret, { value: price })).to.be.revertedWithCustomError(
        fx.controller,
        "MissingCommitment",
      );
      await fx.controller.connect(fx.bob).commit(c);
      await expect(fx.controller.connect(fx.bob).commit(c)).to.be.revertedWithCustomError(fx.controller, "ExistingCommitment");
      await expect(fx.controller.connect(fx.bob).register(label, years, price, deadline, secret, { value: price })).to.be.revertedWithCustomError(
        fx.controller,
        "CommitmentTooNew",
      );
      // someone else cannot reveal with the same parameters
      await time.increase(61);
      await expect(fx.controller.connect(fx.alice).register(label, years, price, deadline, secret, { value: price })).to.be.revertedWithCustomError(
        fx.controller,
        "MissingCommitment",
      );
      // past the chosen deadline
      await time.increase(3600);
      await expect(fx.controller.connect(fx.bob).register(label, years, price, deadline, secret, { value: price })).to.be.revertedWithCustomError(
        fx.controller,
        "DeadlineExpired",
      );
      // a fresh commitment that ages past MAX_AGE
      const deadline2 = BigInt(await time.latest()) + 200000n;
      const c2 = await fx.controller.makeCommitment(label, fx.bob.address, years, price, deadline2, secret);
      await fx.controller.connect(fx.bob).commit(c2);
      await time.increase(86401);
      await expect(fx.controller.connect(fx.bob).register(label, years, price, deadline2, secret, { value: price })).to.be.revertedWithCustomError(
        fx.controller,
        "CommitmentExpired",
      );
      // and an expired commitment can be re-committed
      await expect(fx.controller.connect(fx.bob).commit(c2)).to.emit(fx.controller, "Committed");
    });

    it("refuses underpayment, a quote above the committed maximum, and a taken name", async () => {
      const fx = await fixture();
      await registerName(fx, fx.alice, "taken");
      const price = await fx.controller.quote("taken", 1n);
      const deadline = BigInt(await time.latest()) + 86400n;
      const secret = ethers.hexlify(ethers.randomBytes(32));
      const c = await fx.controller.makeCommitment("taken", fx.bob.address, 1n, price, deadline, secret);
      await fx.controller.connect(fx.bob).commit(c);
      await time.increase(60);
      await expect(fx.controller.connect(fx.bob).register("taken", 1n, price, deadline, secret, { value: price })).to.be.revertedWithCustomError(
        fx.controller,
        "Unavailable",
      );

      const secret2 = ethers.hexlify(ethers.randomBytes(32));
      const c2 = await fx.controller.makeCommitment("fresh", fx.bob.address, 1n, price, deadline, secret2);
      await fx.controller.connect(fx.bob).commit(c2);
      await time.increase(60);
      await expect(fx.controller.connect(fx.bob).register("fresh", 1n, price, deadline, secret2, { value: price - 1n })).to.be.revertedWithCustomError(
        fx.controller,
        "Underpaid",
      );

      // a price rise scheduled and executed between commit and reveal
      const maxPrice = await fx.controller.quote("later", 1n);
      const secret3 = ethers.hexlify(ethers.randomBytes(32));
      const c3 = await fx.controller.makeCommitment("later", fx.bob.address, 1n, maxPrice, deadline + 500000n, secret3);
      await fx.controller.connect(fx.bob).commit(c3);
      await fx.controller.connect(fx.deployer).schedulePrices([DEFAULT_PRICES[0], DEFAULT_PRICES[1], DEFAULT_PRICES[2] * 2n]);
      await expect(fx.controller.executePrices()).to.be.revertedWithCustomError(fx.controller, "DelayNotElapsed");
      await time.increase(172800);
      await fx.controller.executePrices();
      expect(await fx.controller.quote("later", 1n)).to.equal(DEFAULT_PRICES[2] * 2n);
      // the commitment is now older than MAX_AGE too, so re-commit and retry with the old maximum
      const c4 = await fx.controller.makeCommitment("later", fx.bob.address, 1n, maxPrice, deadline + 500000n, secret3);
      await fx.controller.connect(fx.bob).commit(c4);
      await time.increase(60);
      await expect(
        fx.controller.connect(fx.bob).register("later", 1n, maxPrice, deadline + 500000n, secret3, { value: maxPrice * 2n }),
      ).to.be.revertedWithCustomError(fx.controller, "PriceExceeded");
    });

    it("pauses registrations and renewals, not reads or refunds", async () => {
      const fx = await fixture();
      await registerName(fx, fx.alice, "paused", 1n, 5n);
      await fx.controller.connect(fx.deployer).setPaused(true);
      const price = await fx.controller.quote("other", 1n);
      await expect(fx.controller.connect(fx.alice).renew("paused", 1n, price * 100n, { value: price * 100n })).to.be.revertedWithCustomError(
        fx.controller,
        "Paused",
      );
      expect(await fx.controller.available("other")).to.equal(true);
      await expect(fx.controller.connect(fx.alice).withdrawRefund(fx.alice.address)).to.emit(fx.controller, "RefundWithdrawn");
    });
  });

  describe("refunds and revenue", () => {
    it("pays refund credit to a recipient and sweeps the rest to the treasury", async () => {
      const fx = await fixture();
      const overpay = ethers.parseEther("0.003");
      const { price } = await registerName(fx, fx.alice, "money", 1n, overpay);
      const carolBefore = await ethers.provider.getBalance(fx.carol.address);
      await fx.controller.connect(fx.alice).withdrawRefund(fx.carol.address);
      expect((await ethers.provider.getBalance(fx.carol.address)) - carolBefore).to.equal(overpay);
      expect(await fx.controller.refundCredit(fx.alice.address)).to.equal(0n);
      await expect(fx.controller.connect(fx.alice).withdrawRefund(fx.alice.address)).to.be.revertedWithCustomError(fx.controller, "NothingToWithdraw");
      const treasuryBefore = await ethers.provider.getBalance(fx.treasury.address);
      await expect(fx.controller.connect(fx.bob).withdrawRevenue()).to.emit(fx.controller, "RevenueWithdrawn").withArgs(fx.treasury.address, price);
      expect((await ethers.provider.getBalance(fx.treasury.address)) - treasuryBefore).to.equal(price);
      expect(await ethers.provider.getBalance(fx.d.controller)).to.equal(0n);
    });

    it("never lets revenue touch outstanding refund credit", async () => {
      const fx = await fixture();
      const overpay = ethers.parseEther("0.01");
      const { price } = await registerName(fx, fx.alice, "credit", 1n, overpay);
      await fx.controller.withdrawRevenue();
      expect(await ethers.provider.getBalance(fx.d.controller)).to.equal(overpay);
      await expect(fx.controller.withdrawRevenue()).to.be.revertedWithCustomError(fx.controller, "NothingToWithdraw");
      expect(price).to.be.greaterThan(0n);
    });

    it("blocks re-entrancy on withdrawRefund", async () => {
      const fx = await fixture();
      const adv = await (await ethers.getContractFactory("AdversarialReceiver")).deploy(fx.d.controller);
      await adv.waitForDeployment();
      const advAddr = await adv.getAddress();
      const label = "attacker";
      const price = await fx.controller.quote(label, 1n);
      const deadline = BigInt(await time.latest()) + 86400n;
      const secret = ethers.hexlify(ethers.randomBytes(32));
      const c = await fx.controller.makeCommitment(label, advAddr, 1n, price, deadline, secret);
      await adv.commit(c);
      await time.increase(60);
      await adv.register(label, 1n, price, deadline, secret, { value: price * 3n });
      expect(await fx.registry.ownerOf(BigInt(nodeOf(label)))).to.equal(advAddr);
      expect(await fx.controller.refundCredit(advAddr)).to.equal(price * 2n);
      await adv.withdraw();
      expect(await adv.reentered()).to.equal(1n);
      expect(await adv.reentryReverted()).to.equal(true);
      expect(await ethers.provider.getBalance(advAddr)).to.equal(price * 2n);
      expect(await fx.controller.totalRefundLiabilities()).to.equal(0n);
    });

    it("changes the treasury only after the admin delay", async () => {
      const fx = await fixture();
      await expect(fx.controller.connect(fx.alice).scheduleTreasury(fx.alice.address)).to.be.revertedWithCustomError(fx.controller, "OwnableUnauthorizedAccount");
      await fx.controller.connect(fx.deployer).scheduleTreasury(fx.carol.address);
      await expect(fx.controller.executeTreasury()).to.be.revertedWithCustomError(fx.controller, "DelayNotElapsed");
      await time.increase(172800);
      await fx.controller.executeTreasury();
      expect(await fx.controller.treasury()).to.equal(fx.carol.address);
    });
  });

  describe("resolver", () => {
    it("lets only the active owner write, and reads only the current epoch", async () => {
      const fx = await fixture();
      const { node } = await registerName(fx, fx.alice, "alice");
      await expect(fx.resolver.connect(fx.bob).setAddr(node, fx.bob.address)).to.be.revertedWithCustomError(fx.resolver, "OnlyActiveOwner");
      await expect(fx.resolver.connect(fx.alice).setAddr(node, fx.alice.address)).to.emit(fx.resolver, "AddrChanged").withArgs(node, 1n, fx.alice.address);
      expect(await fx.resolver.addr(node)).to.equal(fx.alice.address);
      await fx.resolver.connect(fx.alice).setText(node, "url", "https://example.org");
      expect(await fx.resolver.text(node, "url")).to.equal("https://example.org");
      await expect(fx.resolver.connect(fx.alice).setText(node, "description", "x".repeat(513))).to.be.revertedWithCustomError(fx.resolver, "RecordTooLong");

      // a transfer (even to self) opens a new epoch: records stop resolving
      await fx.registry.connect(fx.alice).transferFrom(fx.alice.address, fx.alice.address, BigInt(node));
      expect(await fx.registry.recordEpoch(node)).to.equal(2n);
      expect(await fx.resolver.addr(node)).to.equal(ethers.ZeroAddress);
      expect(await fx.resolver.text(node, "url")).to.equal("");
      expect(await fx.registry.ownerOf(BigInt(node))).to.equal(fx.alice.address);
    });

    it("answers unresolved for expired names, and the records come back after a grace renewal", async () => {
      const fx = await fixture();
      const { node } = await registerName(fx, fx.alice, "expiring");
      await fx.resolver.connect(fx.alice).setAddr(node, fx.alice.address);
      await time.increase(YEAR + 1n);
      expect(await fx.registry.nameState(node)).to.equal(2);
      expect(await fx.registry.activeOwner(node)).to.equal(ethers.ZeroAddress);
      expect(await fx.resolver.addr(node)).to.equal(ethers.ZeroAddress);
      await expect(fx.resolver.connect(fx.alice).setAddr(node, fx.alice.address)).to.be.revertedWithCustomError(fx.resolver, "OnlyActiveOwner");
      // anyone may pay the renewal
      const price = await fx.controller.quote("expiring", 1n);
      await fx.controller.connect(fx.bob).renew("expiring", 1n, price, { value: price });
      expect(await fx.registry.nameState(node)).to.equal(1);
      expect(await fx.registry.ownerOf(BigInt(node))).to.equal(fx.alice.address);
      expect(await fx.resolver.addr(node)).to.equal(fx.alice.address);
    });
  });

  describe("reverse registrar", () => {
    it("requires ownership and a matching address record, and forgets on transfer", async () => {
      const fx = await fixture();
      const { node } = await registerName(fx, fx.alice, "primary");
      await expect(fx.reverse.connect(fx.alice).setPrimaryName(node)).to.be.revertedWithCustomError(fx.reverse, "Unresolved");
      await fx.resolver.connect(fx.alice).setAddr(node, fx.alice.address);
      await expect(fx.reverse.connect(fx.bob).setPrimaryName(node)).to.be.revertedWithCustomError(fx.reverse, "OnlyActiveOwner");
      await expect(fx.reverse.connect(fx.alice).setPrimaryName(node)).to.emit(fx.reverse, "PrimaryNameSet").withArgs(fx.alice.address, node, 1n);
      expect(await fx.reverse.primaryNameOf(fx.alice.address)).to.equal("primary.quill");

      // pointing the record elsewhere silently invalidates the primary name
      await fx.resolver.connect(fx.alice).setAddr(node, fx.bob.address);
      expect(await fx.reverse.primaryNameOf(fx.alice.address)).to.equal("");
      await fx.resolver.connect(fx.alice).setAddr(node, fx.alice.address);
      expect(await fx.reverse.primaryNameOf(fx.alice.address)).to.equal("primary.quill");

      await fx.registry.connect(fx.alice).transferFrom(fx.alice.address, fx.bob.address, BigInt(node));
      expect(await fx.reverse.primaryNameOf(fx.alice.address)).to.equal("");
      expect(await fx.reverse.primaryNameOf(fx.bob.address)).to.equal("");
      await fx.reverse.connect(fx.alice).clearPrimaryName();
      expect((await fx.reverse.references(fx.alice.address)).node).to.equal(ethers.ZeroHash);
    });
  });

  describe("lifecycle", () => {
    it("renews within the horizon, keeps the epoch, and refuses after grace", async () => {
      const fx = await fixture();
      const { node } = await registerName(fx, fx.alice, "renewme", 4n);
      const price1 = await fx.controller.quote("renewme", 1n);
      await fx.controller.connect(fx.alice).renew("renewme", 1n, price1, { value: price1 });
      const price2 = await fx.controller.quote("renewme", 2n);
      await expect(fx.controller.connect(fx.alice).renew("renewme", 2n, price2, { value: price2 })).to.be.revertedWithCustomError(fx.registry, "HorizonExceeded");
      expect(await fx.registry.recordEpoch(node)).to.equal(1n);
      await time.increase(5n * YEAR + GRACE + 1n);
      expect(await fx.registry.nameState(node)).to.equal(0);
      await expect(fx.controller.connect(fx.alice).renew("renewme", 1n, price1, { value: price1 })).to.be.revertedWithCustomError(fx.registry, "NotRenewable");
    });

    it("lets a new registrant take an expired name; the old NFT is retired", async () => {
      const fx = await fixture();
      const { node } = await registerName(fx, fx.alice, "recycled");
      await time.increase(YEAR + GRACE + 1n);
      expect(await fx.controller.available("recycled")).to.equal(true);
      expect(await fx.registry.ownerOf(BigInt(node))).to.equal(fx.alice.address); // an expired receipt, no rights
      expect(await fx.registry.activeOwner(node)).to.equal(ethers.ZeroAddress);
      await registerName(fx, fx.bob, "recycled");
      expect(await fx.registry.ownerOf(BigInt(node))).to.equal(fx.bob.address);
      expect(await fx.registry.recordEpoch(node)).to.equal(2n);
      expect(await fx.registry.balanceOf(fx.alice.address)).to.equal(0n);
    });

    it("emits a tokenURI with the name, status, epoch and the avatar record", async () => {
      const fx = await fixture();
      const { node } = await registerName(fx, fx.alice, "meta");
      await fx.resolver.connect(fx.alice).setText(node, "avatar", 'https://img.example/a"b.png');
      const uri = await fx.registry.tokenURI(BigInt(node));
      expect(uri.startsWith("data:application/json;base64,")).to.equal(true);
      const json = JSON.parse(Buffer.from(uri.slice("data:application/json;base64,".length), "base64").toString("utf8"));
      expect(json.name).to.equal("meta.quill");
      expect(json.status).to.equal(1);
      expect(json.epoch).to.equal(1);
      expect(json.image).to.equal('https://img.example/a"b.png');
      expect(Number(json.expiresAt)).to.equal(Number(await fx.registry.expiresAt(node)));
    });

    it("keeps the controller as the only registrar", async () => {
      const fx = await fixture();
      await expect(fx.registry.connect(fx.alice).register("direct", fx.alice.address, 1n)).to.be.revertedWithCustomError(fx.registry, "OnlyController");
      await expect(fx.registry.connect(fx.alice).renew(nodeOf("direct"), 1n)).to.be.revertedWithCustomError(fx.registry, "OnlyController");
      await network.provider.send("evm_mine", []);
    });
  });
});
