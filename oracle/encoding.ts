/// Report-body encoding, shared by the CRE workflow and the Node simulator.
///
/// Deliberately free of any `@chainlink/cre-sdk` import. The SDK types Node's `fs` and friends as
/// `never`, globally, because a workflow runs in a WASM sandbox with no filesystem — so anything
/// that imports the SDK inherits the sandbox's restrictions. The simulator runs in Node and needs
/// `fs`; keeping these helpers SDK-free is what lets both environments use one implementation.

/// Stamped into every report body and checked by IngotIndexReceiver, so a report from some other
/// workflow aimed at our receiver is rejected on chain.
export const WORKFLOW_TAG = "ingot-h100-index-v1";

/// ABI-encode `(bytes32, uint64, uint256, uint32, uint16)` — the body IngotIndexReceiver decodes.
/// Hand-rolled because the workflow runs in a restricted WASM sandbox without an ABI library.
export function encodeReport(input: {
  tag: string;
  observedAt: bigint;
  priceWei: bigint;
  sampleCount: bigint;
  sourceCount: bigint;
}): Uint8Array {
  const words: bigint[] = [
    bytes32FromAscii(input.tag),
    input.observedAt,
    input.priceWei,
    input.sampleCount,
    input.sourceCount,
  ];

  const out = new Uint8Array(words.length * 32);
  words.forEach((word, index) => {
    const bytes = word.toString(16).padStart(64, "0");
    for (let i = 0; i < 32; i += 1) {
      out[index * 32 + i] = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
    }
  });
  return out;
}

/// Base64 without Buffer or btoa: the workflow runs in a restricted WASM sandbox and neither is
/// guaranteed to be present.
export function toBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const c = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    out += alphabet[a >> 2];
    out += alphabet[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : alphabet[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : alphabet[c & 0x3f];
  }

  return out;
}

/// The tag is a right-padded ASCII bytes32, matching `bytes32("ingot-h100-index-v1")` in Solidity.
export function bytes32FromAscii(text: string): bigint {
  if (text.length > 32) throw new Error("tag longer than 32 bytes");
  let hex = "";
  for (let i = 0; i < text.length; i += 1) hex += text.charCodeAt(i).toString(16).padStart(2, "0");
  return BigInt("0x" + hex.padEnd(64, "0"));
}
