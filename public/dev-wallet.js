// Dev-only EIP-1193 provider for rehearsals against the local chain
// (loaded by the layout outside production). It never holds a key:
// transactions go out as eth_sendTransaction to the Hardhat network, which
// signs for its own unlocked accounts. Arm it from the console, then reload:
//   localStorage.setItem("quill:dev-wallet", JSON.stringify({ rpc: "http://127.0.0.1:8697", address: "0x7099…" }))
// Disarm: localStorage.removeItem("quill:dev-wallet")
(function () {
  var raw = null;
  try {
    raw = localStorage.getItem("quill:dev-wallet");
  } catch {}
  if (!raw) return;
  var cfg = JSON.parse(raw);
  var id = 1;
  var listeners = {};
  function rpc(method, params) {
    return fetch(cfg.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method: method, params: params || [] }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.error) { var e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
        return j.result;
      });
  }
  var provider = {
    isMetaMask: true,
    isQuillDev: true,
    request: function (args) {
      var m = args.method;
      var p = args.params || [];
      if (m === "eth_requestAccounts" || m === "eth_accounts") return Promise.resolve([cfg.address]);
      if (m === "eth_chainId") return rpc("eth_chainId", []);
      if (m === "wallet_switchEthereumChain" || m === "wallet_addEthereumChain") return Promise.resolve(null);
      if (m === "wallet_getPermissions" || m === "wallet_requestPermissions") return Promise.resolve([{ parentCapability: "eth_accounts" }]);
      if (m === "eth_sendTransaction") {
        var tx = Object.assign({}, p[0], { from: cfg.address });
        delete tx.gas;
        window.__DEV_WALLET_LAST_TX = tx;
        return rpc("eth_sendTransaction", [tx]);
      }
      return rpc(m, p);
    },
    on: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return provider; },
    removeListener: function (ev, fn) { listeners[ev] = (listeners[ev] || []).filter(function (f) { return f !== fn; }); return provider; },
    emit: function (ev, data) { (listeners[ev] || []).forEach(function (f) { f(data); }); },
  };
  window.ethereum = provider;
  var info = { uuid: "quill-dev-wallet-0000-0000", name: "Dev Wallet (local chain)", icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", rdns: "local.quill.devwallet" };
  var announce = function () {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: info, provider: provider }) }));
  };
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
  window.dispatchEvent(new Event("ethereum#initialized"));
  console.log("[quill] dev wallet provider installed for", cfg.address);
})();
