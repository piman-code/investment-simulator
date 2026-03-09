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
    principal: 12000000,
    monthlyContribution: 600000,
    years: 12,
    simulations: 1200,
    goalAmount: 250000000,
    annualReturn: 8,
    annualVolatility: 12,
    maxMdd: 35,
    maxVolatility: 25,
    maxCryptoWeight: 40,
    maxSingleAssetWeight: 35,
    rebalanceFeePct: 0.15,
    sellTaxPct: 0,
    minTradeAmount: 100000,
  };
  plugin.quoteCache = {};
  plugin.quoteHistory = {};

  let noteValue = `# Integration Ready Note

## Investment Params
principal: 12000000
monthlyContribution: 600000
years: 12
simulations: 1200
goalAmount: 250000000
maxMdd: 35
maxVolatility: 25
maxCryptoWeight: 40
maxSingleAssetWeight: 35

## Market Quotes
- AAPL,190,USD,nasdaq,manual,2026-03-07T09:00:00Z
- BTC,90000,USD,binance,manual,2026-03-07T09:00:00Z

## Portfolio
- AAPL,stock,8,,25,150
- BTC,crypto,0.1,,15,82000
- KRW,cash,4000000,1,60
`;

  const editor = {
    getValue() {
      return noteValue;
    },
    setValue(next) {
      noteValue = next;
    },
  };

  const analysis = plugin.analyze(plugin.parse(noteValue));
  const report = plugin.renderReport(analysis);
  plugin.applyReportOutputToEditor(editor, analysis, report);
  plugin.applyDailyBriefingToEditor(editor, analysis, plugin.buildDailyBriefing(analysis));
  const payload = plugin.applyOmniforgeHandoffToEditor(editor, analysis);
  plugin.applyCsvExportsToEditor(editor, analysis);

  assert.strictEqual(payload.handoffVersion, 1, "handoff payload should expose stable version");
  assert.ok(Array.isArray(payload.recommendations), "handoff payload should include recommendation list");
  assert.match(noteValue, /## Omniforge Handoff/);
  assert.match(noteValue, /"handoffVersion": 1/);
  assert.match(noteValue, /## Omniforge Prompt/);
  assert.match(noteValue, /Use the attached JSON as the source of truth\./);
  assert.match(noteValue, /## CSV Exports/);
  assert.match(noteValue, /### Portfolio Snapshot/);
  assert.match(noteValue, /symbol,assetType,quantity,marketPrice/);
  assert.match(noteValue, /### Recommendation Plans/);
  assert.match(noteValue, /plan,name,rank,score,goalProbabilityPct/);
  assert.match(noteValue, /### Strategy League History/);
  assert.match(noteValue, /briefingId,generatedAt,topPlan,freshnessStatus,summary/);

  console.log("PASS p0_13_omniforge_handoff_and_csv_export");
}

run();
