/**
 * Every brand-facing string lives here. Renaming the service is a change to
 * this file (and to Names.TLD in the contracts, which fixes the root node).
 */
export const BRAND = {
  /** Wordmark, as displayed. */
  name: "QUILL",
  fullName: "Quill Name Service",
  tagline: "Your name, in ink.",
  /** The namespace: every name is `<label>.quill`. Must match Names.TLD on chain. */
  tld: "quill",
  /** Illustrative name used in copy and code samples. */
  exampleName: "ada.quill",
  /** Names shown on the home carousel when the chain has no avatars yet. */
  sampleNames: ["ada", "hal", "ines", "noor", "remy"],
  /** SDK naming used in the developer snippets. */
  sdkPackage: "@quill/sdk",
  sdkFactory: "createQuill",
  sdkVariable: "quill",
  /** Prefix of every localStorage key and every server log line. */
  storagePrefix: "quill",
  /** X handle without the @. Empty hides the social links. */
  xHandle: "",
  /** Token contract address shown as a copyable badge in the hero. Empty hides it. */
  tokenAddress: "",
  siteTitle: "QUILL — Your name, in ink.",
  siteDescription:
    "An independent name service on Robinhood Chain. Readable .quill names, commit–reveal registration, explicit chain-aware resolution.",
  footerLine: "QUILL NAME SERVICE / INDEPENDENT PROJECT",
} as const;

export const SUFFIX = `.${BRAND.tld}`;
