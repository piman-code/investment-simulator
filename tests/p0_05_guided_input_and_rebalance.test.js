"use strict";

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "obsidian") {
    class Plugin {}
    class Notice {}
    class PluginSettingTab {}
    class Modal {}
    class Setting {
      setName() {
        return this;
      }
      addText() {
        return this;
      }
    }
    return { Plugin, Notice, PluginSettingTab, Setting, Modal };
  }
  return originalLoad(request, parent, isMain);
};

const InvestmentSimulatorPlugin = require("../main.js");
Module._load = originalLoad;

function run() {
  const plugin = new InvestmentSimulatorPlugin();
  plugin.settings = {
    principal: 10000000,
    monthlyContribution: 500000,
    years: 10,
    simulations: 1200,
    goalAmount: 200000000,
    annualReturn: 8,
    annualVolatility: 12,
    maxMdd: 35,
    maxVolatility: 25,
    maxCryptoWeight: 40,
    maxSingleAssetWeight: 35,
    rebalanceFeePct: 0.1,
    sellTaxPct: 0,
    minTradeAmount: 50000,
  };

  let noteValue = "## Some Existing Section\nkeep: true\n";
  const editor = {
    getValue() {
      return noteValue;
    },
    setValue(next) {
      noteValue = next;
    },
  };

  plugin.applyGuidedInputDraft(editor, {
    principal: 12000000,
    monthlyContribution: 600000,
    years: 12,
    simulations: 1500,
    goalAmount: 250000000,
    maxMdd: 30,
    maxVolatility: 22,
    maxCryptoWeight: 20,
    maxSingleAssetWeight: 30,
    marketQuotesText: "AAPL,190,USD,nasdaq,manual,2026-03-07T09:00:00Z\nMSFT,400,USD,nasdaq,manual,2026-03-07T09:00:00Z",
    portfolioText: "AAPL,stock,2,,25,150\nMSFT,stock,1,,15,300\nKRW,cash,1000000,1,60",
    scenarioOverridesText: "Bear,stock,-10,1.4\nBull,all,2,0.95",
  });

  assert.match(noteValue, /## Investment Params/);
  assert.match(noteValue, /principal: 12000000/);
  assert.match(noteValue, /## Market Quotes/);
  assert.match(noteValue, /- AAPL,190,USD,nasdaq,manual,2026-03-07T09:00:00Z/);
  assert.match(noteValue, /- MSFT,400,USD,nasdaq,manual,2026-03-07T09:00:00Z/);
  assert.match(noteValue, /## Portfolio/);
  assert.match(noteValue, /- AAPL,stock,2,,25,150/);
  assert.match(noteValue, /- MSFT,stock,1,,15,300/);
  assert.match(noteValue, /- KRW,cash,1000000,1,60/);
  assert.match(noteValue, /## Scenario Overrides/);
  assert.match(noteValue, /- Bear,stock,-10,1.4/);
  assert.match(noteValue, /- Bull,all,2,0.95/);

  const parsed = plugin.parse(noteValue);
  assert.strictEqual(parsed.positions[0].avgPrice, 150, "guided input should preserve optional avgPrice column");
  assert.strictEqual(parsed.scenarioOverrides.length, 2, "guided input should preserve scenario override rows");
  const portfolio = plugin.buildPortfolio(parsed.positions, parsed.marketQuotes);
  const rebalance = plugin.buildRebalancePlan({
    portfolio,
    targetBuckets: { stock: 40, cash: 60, etf: 0, crypto: 0, other: 0 },
    params: {
      rebalanceFeePct: 0.1,
      sellTaxPct: 0,
      minTradeAmount: 50000,
    },
  });

  assert.strictEqual(rebalance.actions.length, 2, "stock buy and cash deploy actions should be generated");
  assert.strictEqual(rebalance.actions[0].amount, 400000, "largest trade should be rounded to the nearest 1,000");
  assert.ok(rebalance.actions.some((action) => action.verb === "BUY" && action.assetType === "stock"));
  assert.ok(rebalance.actions.some((action) => action.verb === "DEPLOY" && action.assetType === "cash"));
  assert.strictEqual(rebalance.symbolTrades.length, 2, "stock sleeve should decompose into symbol-level trades");
  assert.deepStrictEqual(
    rebalance.symbolTrades.map((trade) => [trade.symbol, trade.amount]),
    [
      ["AAPL", 250000],
      ["MSFT", 150000],
    ],
    "symbol-level trade sizing should follow explicit targetWeight gaps"
  );
  assert.strictEqual(rebalance.estimatedFee, 400, "fee estimate should apply only to billable non-cash trades");

  console.log("PASS p0_05_guided_input_and_rebalance");
}

run();
