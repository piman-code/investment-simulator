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
    principal: 8000000,
    monthlyContribution: 400000,
    years: 10,
    simulations: 1200,
    goalAmount: 150000000,
    annualReturn: 8,
    annualVolatility: 12,
    maxMdd: 35,
    maxVolatility: 25,
    maxCryptoWeight: 40,
    maxSingleAssetWeight: 35,
  };
  plugin.quoteCache = {};
  plugin.quoteHistory = {
    AAPL: [
      { price: 100, asOf: "2026-02-24T09:00:00Z" },
      { price: 102, asOf: "2026-02-25T09:00:00Z" },
      { price: 101, asOf: "2026-02-26T09:00:00Z" },
      { price: 104, asOf: "2026-02-27T09:00:00Z" },
      { price: 103, asOf: "2026-02-28T09:00:00Z" },
      { price: 106, asOf: "2026-03-01T09:00:00Z" },
      { price: 108, asOf: "2026-03-02T09:00:00Z" },
      { price: 107, asOf: "2026-03-03T09:00:00Z" },
      { price: 109, asOf: "2026-03-04T09:00:00Z" },
      { price: 111, asOf: "2026-03-05T09:00:00Z" },
      { price: 112, asOf: "2026-03-06T09:00:00Z" },
    ],
    QQQ: [
      { price: 300, asOf: "2026-02-24T09:00:00Z" },
      { price: 306, asOf: "2026-02-25T09:00:00Z" },
      { price: 303, asOf: "2026-02-26T09:00:00Z" },
      { price: 312, asOf: "2026-02-27T09:00:00Z" },
      { price: 309, asOf: "2026-02-28T09:00:00Z" },
      { price: 318, asOf: "2026-03-01T09:00:00Z" },
      { price: 321, asOf: "2026-03-02T09:00:00Z" },
      { price: 318, asOf: "2026-03-03T09:00:00Z" },
      { price: 324, asOf: "2026-03-04T09:00:00Z" },
      { price: 330, asOf: "2026-03-05T09:00:00Z" },
      { price: 333, asOf: "2026-03-06T09:00:00Z" },
    ],
  };

  const note = `principal: 8000000
monthlyContribution: 400000
years: 10
simulations: 1200
goalAmount: 150000000
maxMdd: 35
maxVolatility: 25
maxCryptoWeight: 40
maxSingleAssetWeight: 35

## Market Quotes
- AAPL,114,USD,nasdaq,manual,2026-03-07T09:00:00Z
- QQQ,336,USD,nasdaq,manual,2026-03-07T09:00:00Z

## Portfolio
- AAPL,stock,15,,30,100
- QQQ,etf,6,,30,280
- KRW,cash,1500000,1,40
`;

  const parsed = plugin.parse(note);
  const portfolio = plugin.buildPortfolio(parsed.positions, parsed.marketQuotes);
  const blended = plugin.derivePortfolioAssumptions(portfolio, parsed);
  const baseSimulation = plugin.simulate({
    principal: portfolio.totalMarketValue,
    monthlyContribution: parsed.monthlyContribution,
    years: parsed.years,
    simulations: 300,
    annualReturn: blended.annualReturn,
    annualVolatility: blended.annualVolatility,
    goalAmount: parsed.goalAmount,
  });
  const recommendations = plugin.generateRecommendations({
    params: parsed,
    principal: portfolio.totalMarketValue,
    buckets: portfolio.bucketWeights,
    portfolio,
    baseSimulation,
    leagueContext: parsed.leagueContext,
  });

  assert.strictEqual(recommendations.length, 3, "should emit three recommendation plans");
  assert.ok(recommendations.every((plan) => plan.riskAdjustedMetrics), "each plan should expose risk-adjusted metrics");
  assert.ok(recommendations.every((plan) => plan.scoreComponents), "each plan should expose score components");
  assert.strictEqual(
    recommendations.find((plan) => plan.key === "A").riskAdjustedMetrics.source,
    "historical-bucket-series",
    "Plan A should use historical bucket series when bucket history is available"
  );
  assert.strictEqual(
    recommendations.find((plan) => plan.key === "B").riskAdjustedMetrics.source,
    "assumption-fallback",
    "Plan B should fall back when a required bucket has no history"
  );
  assert.ok(
    Number.isFinite(recommendations[0].scoreComponents.sortinoScore),
    "sortino component should contribute to recommendation scoring"
  );

  console.log("PASS p0_11_recommendation_risk_adjusted_scoring");
}

run();
