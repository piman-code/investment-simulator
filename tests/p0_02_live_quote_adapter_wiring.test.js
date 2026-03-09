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

async function run() {
  const plugin = new InvestmentSimulatorPlugin();
  plugin.settings = {
    enableLiveQuoteFetch: 1,
    quoteApiBaseUrl: "https://unit.test/quote?symbol={symbol}",
    quoteRetryLimit: 2,
    quoteRetryBaseDelayMs: 1,
    quoteFetchMaxSymbolsPerRun: 1,
  };
  plugin.sleep = async () => {};
  plugin.quoteCache = {};
  plugin.quoteHistory = {};

  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    if (callCount < 2) {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        quoteResponse: {
          result: [
            {
              regularMarketPrice: 192.55,
              currency: "USD",
              regularMarketTime: 1700000000,
              fullExchangeName: "NASDAQ",
            },
          ],
        },
      }),
    };
  };

  const merged = await plugin.hydrateMissingMarketQuotes(
    [
      { symbol: "AAPL", assetType: "stock", quantity: 1, marketPrice: NaN },
      { symbol: "MSFT", assetType: "stock", quantity: 1, marketPrice: NaN },
    ],
    {}
  );

  assert.strictEqual(callCount, 2, "retry/backoff should be applied to live fetch path");
  assert.ok(merged.AAPL, "missing symbol should be hydrated via adapter");
  assert.strictEqual(merged.AAPL.price, 192.55, "hydrated quote price mismatch");
  assert.strictEqual(merged.AAPL.market, "stock", "market label should be normalized");
  assert.ok(plugin.quoteCache.AAPL, "hydrated quote should be persisted into quote cache");
  assert.ok(plugin.quoteHistory.AAPL?.length, "hydrated quote should be persisted into local quote history");
  assert.ok(!merged.MSFT, "per-run fetch cap should prevent fetching symbols beyond the configured limit");
  assert.deepStrictEqual(plugin.lastLiveQuoteHydrationSummary, {
    attemptedCount: 2,
    fetchedCount: 1,
    skippedByCapCount: 1,
    maxSymbols: 1,
  });

  const params = {
    ...plugin.settings,
    principal: 1000000,
    monthlyContribution: 100000,
    years: 5,
    simulations: 120,
    goalAmount: 5000000,
    annualReturn: 8,
    annualVolatility: 12,
    maxMdd: 35,
    maxVolatility: 25,
    maxCryptoWeight: 40,
    maxSingleAssetWeight: 35,
    positions: [
      { symbol: "AAPL", assetType: "stock", quantity: 1, marketPrice: NaN },
      { symbol: "MSFT", assetType: "stock", quantity: 1, marketPrice: NaN },
    ],
    marketQuotes: merged,
    inputValidation: [],
    leagueContext: { count: 0, avgReturn: 0, regime: "n/a", note: "n/a" },
  };
  const report = plugin.run(params);
  assert.match(report, /Live Quote Skipped By Cap: 1/, "report should expose cap-skipped live fetch count");
  assert.match(report, /1 symbol\(s\) were skipped by live quote fetch cap \(1\/2 fetched this run\)\./, "warning should expose cap-hit detail");

  console.log("PASS p0_02_live_quote_adapter_wiring");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
