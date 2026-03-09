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
    rebalanceFeePct: 0.15,
    sellTaxPct: 0,
    minTradeAmount: 100000,
  };
  plugin.quoteCache = {};
  plugin.quoteHistory = {};

  let noteValue = `# Portfolio Hub

## Investment Params
principal: 10000000
monthlyContribution: 500000
years: 10
simulations: 1200
goalAmount: 200000000
maxMdd: 35
maxVolatility: 25
maxCryptoWeight: 40
maxSingleAssetWeight: 35

## Market Quotes
- AAPL,190,USD,nasdaq,manual,2026-03-07T09:00:00Z
- QQQ,430,USD,nasdaq,manual,2026-03-07T09:00:00Z

## Portfolio
- AAPL,stock,12,,25,150
- QQQ,etf,8,,25,400
- KRW,cash,5000000,1,30
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

  assert.match(noteValue, /## Latest Report/);
  assert.match(noteValue, /# Investment Simulation Recommendation Report v1/);
  assert.match(noteValue, /## Report History/);
  assert.match(noteValue, /## Strategy League History/);
  assert.match(noteValue, /\| Report ID \| Generated At \| Top Plan \| Score \| Goal Prob \| Est MDD \| Freshness \| Audit Hash \|/);
  assert.match(noteValue, /\| Report ID \| Generated At \| Winner Plan \| League Score \| Edge \|/);

  const historyOnce = plugin.parseReportHistorySection(noteValue);
  assert.strictEqual(historyOnce.length, 1, "report history should store a single fresh snapshot");

  plugin.applyReportOutputToEditor(editor, analysis, report);
  const historyTwice = plugin.parseReportHistorySection(noteValue);
  assert.strictEqual(historyTwice.length, 1, "re-applying the same report should dedupe by report id");

  const briefing = plugin.buildDailyBriefing(analysis);
  plugin.applyDailyBriefingToEditor(editor, analysis, briefing);

  assert.match(noteValue, /## Daily Briefing/);
  assert.match(noteValue, /oneLineConclusion: Plan /);
  assert.match(noteValue, /### Focus Now/);
  assert.match(noteValue, /externalHeadlineFeed: not-configured/);
  assert.match(noteValue, /## Daily Briefing History/);

  const briefingHistory = plugin.parseDailyBriefingHistorySection(noteValue);
  assert.strictEqual(briefingHistory.length, 1, "daily briefing history should store one snapshot");

  console.log("PASS p0_12_report_history_and_briefing");
}

run();
