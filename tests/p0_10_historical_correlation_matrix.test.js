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
    principal: 5000000,
    monthlyContribution: 250000,
    years: 8,
    simulations: 800,
    goalAmount: 100000000,
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
      { price: 100, asOf: "2026-03-01T09:00:00Z" },
      { price: 103, asOf: "2026-03-02T09:00:00Z" },
      { price: 101, asOf: "2026-03-03T09:00:00Z" },
      { price: 105, asOf: "2026-03-04T09:00:00Z" },
      { price: 104, asOf: "2026-03-05T09:00:00Z" },
      { price: 108, asOf: "2026-03-06T09:00:00Z" },
    ],
    MSFT: [
      { price: 200, asOf: "2026-03-01T09:00:00Z" },
      { price: 206, asOf: "2026-03-02T09:00:00Z" },
      { price: 201, asOf: "2026-03-03T09:00:00Z" },
      { price: 210, asOf: "2026-03-04T09:00:00Z" },
      { price: 208, asOf: "2026-03-05T09:00:00Z" },
      { price: 216, asOf: "2026-03-06T09:00:00Z" },
    ],
  };

  const note = `principal: 5000000
monthlyContribution: 250000
years: 8
simulations: 800
goalAmount: 100000000
maxMdd: 35
maxVolatility: 25
maxCryptoWeight: 40
maxSingleAssetWeight: 35

## Market Quotes
- AAPL,110,USD,nasdaq,manual,2026-03-07T09:00:00Z
- MSFT,220,USD,nasdaq,manual,2026-03-07T09:00:00Z

## Portfolio
- AAPL,stock,10,,45,95
- MSFT,stock,8,,35,190
`;

  const report = plugin.run(plugin.parse(note));
  assert.match(report, /### Correlation Matrix \(Historical\)/);
  assert.match(report, /Correlation values use locally accumulated daily quote history\./);
  assert.match(report, /History window: 2026-03-02 to 2026-03-07/);
  assert.match(report, /Daily return coverage:/);
  assert.match(report, /AAPL 6d/);
  assert.match(report, /MSFT 6d/);
  assert.match(report, /Historical pair coverage: 1\/1/);
  assert.doesNotMatch(report, /proxy estimates derived from asset-type relationships/);

  console.log("PASS p0_10_historical_correlation_matrix");
}

run();
