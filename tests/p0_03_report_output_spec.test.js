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
  };
  plugin.quoteCache = {};
  const freshAsOf = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const note = `principal: 10000000
monthlyContribution: 500000
years: 10
simulations: 1200
goalAmount: 200000000
maxMdd: 35
maxVolatility: 25
maxCryptoWeight: 40
maxSingleAssetWeight: 35

## Market Quotes
- AAPL,190,USD,nasdaq,manual,${freshAsOf}
- BTC,90000,USD,binance,manual,${freshAsOf}

## Portfolio
- AAPL,stock,2,,25,150
- BTC,crypto,0.1,,20
- KRW,cash,1000000,1,55

## Scenario Overrides
- Bear,stock,-10,1.4
- Bull,all,2,0.95
`;

  const parsed = plugin.parse(note);
  assert.strictEqual(parsed.positions[0].marketPrice, null, "blank marketPrice should stay null until quote resolution");
  assert.strictEqual(parsed.positions[0].avgPrice, 150, "optional avgPrice field should be parsed from portfolio rows");

  const portfolio = plugin.buildPortfolio(parsed.positions, parsed.marketQuotes);
  const aapl = portfolio.positions.find((position) => position.symbol === "AAPL");
  assert.ok(aapl, "AAPL position should exist");
  assert.strictEqual(aapl.marketPrice, 190, "blank marketPrice should hydrate from market quotes");
  assert.strictEqual(aapl.priceSource, "manual", "hydrated quote should be attributed to the market quote source");

  const report = plugin.run(parsed);
  assert.match(report, /^# Investment Simulation Recommendation Report v1/m);
  assert.match(report, /## 2\) Data Freshness/);
  assert.match(report, /freshnessStatus: FRESH/);
  assert.match(report, /### Read This First/);
  assert.match(report, /- Best Starter Plan: Plan /);
  assert.match(report, /- Do This Next: /);
  assert.match(report, /## 4\) Recommendation Plans Overview/);
  assert.match(report, /\| Plan \| Style \| Goal Prob \| Exp Return \| Exp Vol \| Est MDD \| Sharpe \| Sortino \| Rank \| Recommended For \|/);
  assert.match(report, /### Strategy League Scoreboard/);
  assert.match(report, /League score uses identical starting capital, same simulation rules, and weighted survival-first scoring\./);
  assert.match(report, /## 5\) Recommendation Details/);
  assert.match(report, /### Plan A \(Conservative\)/);
  assert.match(report, /- Risk-Adjusted Metrics: source /);
  assert.match(report, /- Score Breakdown: goal /);
  assert.match(report, /- Execution Checklist:/);
  assert.match(report, /- Symbol-Level Orders:/);
  assert.match(report, /\| BUY \| AAPL \| stock \|/);
  assert.match(report, /### Scenario Analysis/);
  assert.match(report, /\| Bear \| Risk-Off \|/);
  assert.match(report, /Override: stock return -10\.00% vol x1\.40/);
  assert.match(report, /Override: all return \+2\.00% vol x0\.95/);
  assert.match(report, /### Correlation Matrix \(Proxy\)/);
  assert.match(report, /Correlation values are proxy estimates derived from asset-type relationships/);
  assert.match(report, /### Ticker Analysis Cards/);
  assert.match(report, /#### AAPL/);
  assert.match(report, /- PnL: \+80 \/ \+26\.67%/);
  assert.match(report, /## 6\) Execution Priority and Next Actions/);
  assert.match(report, /\| AAPL \| stock \| 2 \| 190 \| 380 \|/);

  console.log("PASS p0_03_report_output_spec");
}

run();
