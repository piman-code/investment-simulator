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
  const input = {
    principal: 50000000,
    monthlyContribution: 1500000,
    years: 15,
    simulations: 800,
    annualReturn: 7.5,
    annualVolatility: 16,
    goalAmount: 350000000,
    randomSeed: "regression-seed-v1",
  };

  const first = plugin.simulate(input);
  const second = plugin.simulate(input);
  const differentSeed = plugin.simulate({ ...input, randomSeed: "regression-seed-v2" });

  assert.deepStrictEqual(second, first, "same randomSeed should reproduce the same simulation output");
  assert.notDeepStrictEqual(differentSeed, first, "different randomSeed should change simulation output");
  assert.ok(first.p10 <= first.p50 && first.p50 <= first.p90, "seeded simulation percentiles should remain ordered");

  console.log("PASS p0_04_simulation_seed_regression");
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
