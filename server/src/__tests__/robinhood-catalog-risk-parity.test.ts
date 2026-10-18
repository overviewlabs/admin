import { expect, it } from "vitest";
import { classifyRisk } from "../services/tool-access.js";
import { isRobinhoodTradingMutation } from "../services/robinhood-tool-risk.js";
const writes=["place_equity_order","cancel_equity_order","place_option_order","cancel_option_order","exercise_option","cancel_option_exercise","place_crypto_order","cancel_crypto_order","place_advanced_order","cancel_advanced_order"];
it.each(writes)("retains deployed destructive classification for %s", (name) => {
  for (const readOnlyHint of [undefined,false,true]) expect(classifyRisk({name,annotations:{readOnlyHint}},"robinhood")).toBe("destructive");
  expect(isRobinhoodTradingMutation(`mcp__robinhood__${name}`)).toBe(true);
});
it.each(["review_equity_order","review_option_order","preview_crypto_order","review_advanced_order","get_option_orders"])("keeps %s read-only", (name) => {
  expect(classifyRisk({name,annotations:{readOnlyHint:true}},"robinhood")).toBe("read");
});
it("does not escalate unrelated providers", () => {
  expect(classifyRisk({name:"place_equity_order",annotations:{readOnlyHint:true}},"other-provider")).toBe("read");
});
