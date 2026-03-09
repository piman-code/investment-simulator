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
    simulations: 1000,
    goalAmount: 200000000,
    maxMdd: 35,
    maxVolatility: 25,
    maxCryptoWeight: 40,
    maxSingleAssetWeight: 35,
  };
  plugin.quoteCache = {};

  const note = `## Portfolio
- AAPL,stock,10,190,25
- BTC,crypto,0,90000,20
- ETH,,2,3100,15
- SOL,coin,1,abc,foo
`;

  const parsed = plugin.parse(note);
  assert.strictEqual(parsed.positions.length, 3, "one invalid quantity row should be excluded");
  assert.ok(Array.isArray(parsed.inputValidation), "inputValidation should exist");
  assert.ok(parsed.inputValidation.length >= 4, "validation issues should be collected");

  const blockingIssues = plugin.getBlockingValidationIssues(parsed.inputValidation, parsed.positions);
  assert.ok(blockingIssues.length >= 2, "missing required fields and invalid quantity should block analysis");

  const report = plugin.run(parsed);
  assert.ok(report.includes("Input Validation Issues:"), "report should expose validation issue count");
  assert.ok(report.includes("Input validation flagged"), "risk section should include validation warning summary");

  const cleanParsed = plugin.parse(`## Portfolio\n- AAPL,stock,10,190,25\n- QQQ,etf,3,430,25\n`);
  const cleanBlockingIssues = plugin.getBlockingValidationIssues(cleanParsed.inputValidation, cleanParsed.positions);
  assert.strictEqual(cleanBlockingIssues.length, 0, "valid inputs should not be blocked");

  console.log("PASS p0_01_input_validation");
}

run();
