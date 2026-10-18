// Robinhood documents these as real order/exercise mutations, distinct from
// review_*_order and preview_crypto_order. Provider hints cannot downgrade them.
// https://robinhood.com/us/en/support/articles/trading-with-your-agent/
const TRADING_MUTATIONS = new Set([
  "place-equity-order",
  "cancel-equity-order",
  "place-option-order",
  "cancel-option-order",
  "exercise-option",
  "cancel-option-exercise",
  "place-crypto-order",
  "cancel-crypto-order",
  "place-advanced-order",
  "cancel-advanced-order",
]);

export function isRobinhoodTradingMutation(
  toolName: string,
  sourceTemplateKey?: string | null,
): boolean {
  const normalize = (name: string) => name.trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[:./_-]+/g, "-");
  const normalized = normalize(toolName);
  // Catalog discovery supplies the trusted provider key. Plugin tool names
  // carry their namespace instead; never classify an unrelated bare verb.
  if (sourceTemplateKey != null && sourceTemplateKey !== "robinhood") return false;
  if (
    sourceTemplateKey !== "robinhood" &&
    !/(^|-)robinhood(?:-[a-f0-9]{8})?-/.test(normalized)
  ) return false;
  const localName = normalize(toolName.split(/[:./]|__+/).at(-1) ?? "")
    .replace(/^robinhood(?:-[a-f0-9]{8})?-/, "");
  return TRADING_MUTATIONS.has(localName);
}
