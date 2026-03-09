"use strict";

const assert = require("assert");
const Module = require("module");
const { performance } = require("perf_hooks");

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
  const start = performance.now();
  const result = plugin.simulate({
    principal: 100000000,
    monthlyContribution: 2000000,
    years: 30,
    simulations: 5000,
    annualReturn: 8,
    annualVolatility: 22,
    goalAmount: 2500000000,
  });
  const elapsedMs = performance.now() - start;

  assert.strictEqual(result.runs, 5000, "simulate should honor requested run count");
  assert.ok(result.p10 <= result.p50, "p10 should not exceed p50");
  assert.ok(result.p50 <= result.p90, "p50 should not exceed p90");
  assert.ok(Number.isFinite(result.goalProbability), "goalProbability should be finite");
  assert.ok(elapsedMs < 10000, `simulate exceeded p95 budget: ${elapsedMs.toFixed(2)}ms`);

  console.log(`PASS p0_04_simulation_performance (${elapsedMs.toFixed(2)}ms)`);
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
