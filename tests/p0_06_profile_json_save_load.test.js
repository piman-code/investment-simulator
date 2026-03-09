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
  plugin.savedProfiles = [];
  plugin.saveSettings = async () => {};

  let noteValue = `# Growth Plan

## Investment Params
principal: 15000000
monthlyContribution: 700000
years: 15
simulations: 1600
goalAmount: 300000000
maxMdd: 30
maxVolatility: 20
maxCryptoWeight: 15
maxSingleAssetWeight: 25

## Market Quotes
- AAPL,190,USD,nasdaq,manual,2026-03-07T09:00:00Z

## Portfolio
- AAPL,stock,10,,25,150
- KRW,cash,3000000,1,75

## Scenario Overrides
- Bear,stock,-8,1.3
`;

  const editor = {
    getValue() {
      return noteValue;
    },
    setValue(next) {
      noteValue = next;
    },
  };

  const first = await plugin.saveJsonProfileFromEditor(editor);
  assert.strictEqual(first.name, "Growth Plan", "profile name should default to the H1 heading");
  assert.strictEqual(plugin.savedProfiles.length, 1, "profile should be stored in plugin-local JSON collection");
  assert.strictEqual(plugin.savedProfiles[0].payload.params.goalAmount, 300000000, "saved payload should keep numeric params");
  assert.strictEqual(plugin.savedProfiles[0].payload.portfolioRows[0].symbol, "AAPL", "saved payload should keep portfolio rows");
  assert.strictEqual(plugin.savedProfiles[0].payload.portfolioRows[0].avgPrice, "150", "saved payload should preserve avgPrice");
  assert.strictEqual(plugin.savedProfiles[0].payload.scenarioOverrideRows[0].scenario, "Bear", "saved payload should preserve scenario overrides");

  noteValue = `# Growth Plan

## Portfolio
- TSLA,stock,1,250,100,220

## Scenario Overrides
- Bull,all,3,0.9
`;

  const second = await plugin.saveJsonProfileFromEditor(editor);
  assert.strictEqual(plugin.savedProfiles.length, 1, "saving the same profile name should overwrite the prior snapshot");
  assert.strictEqual(second.id, first.id, "overwrite should preserve the profile id");
  assert.strictEqual(plugin.savedProfiles[0].payload.portfolioRows[0].symbol, "TSLA", "latest snapshot should replace the prior one");

  noteValue = "";
  const loaded = plugin.loadLatestJsonProfileToEditor(editor);
  assert.ok(loaded, "latest profile should be loadable");
  assert.match(noteValue, /principal: 15000000/, "loaded profile should rehydrate investment params into the note");
  assert.match(noteValue, /- TSLA,stock,1,250,100,220/, "loaded profile should restore latest portfolio rows including avgPrice");
  assert.match(noteValue, /## Scenario Overrides/, "loaded profile should restore scenario override section");
  assert.match(noteValue, /- Bull,all,3,0.9/, "loaded profile should restore scenario override rows");

  console.log("PASS p0_06_profile_json_save_load");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
