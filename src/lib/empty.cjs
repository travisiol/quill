// CommonJS stub for optional wallet-SDK payment modules that are never called.
module.exports = new Proxy({}, { get: () => undefined });
