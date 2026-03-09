"use strict";

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "obsidian") {
    class Plugin {
      constructor() {
        this.__commands = [];
        this.__ribbons = [];
        this.__tabs = [];
        this.app = {
          workspace: {
            activeEditor: null,
          },
        };
      }
      addRibbonIcon(icon, title, callback) {
        this.__ribbons.push({ icon, title, callbackType: typeof callback });
      }
      addSettingTab(tab) {
        this.__tabs.push(tab);
      }
      addCommand(command) {
        this.__commands.push(command);
      }
      async loadData() {
        return {};
      }
      async saveData() {}
    }
    class Notice {}
    class Modal {
      constructor(app) {
        this.app = app;
        this.contentEl = {
          empty() {},
          createEl() {
            return {
              value: "",
              addEventListener() {},
              createEl() {
                return this;
              },
              createDiv() {
                return this;
              },
            };
          },
          createDiv() {
            return {
              createEl() {
                return {
                  value: "",
                  addEventListener() {},
                  createEl() {
                    return this;
                  },
                  createDiv() {
                    return this;
                  },
                };
              },
              createDiv() {
                return this;
              },
            };
          },
        };
      }
      open() {}
      close() {}
    }
    class PluginSettingTab {}
    class Setting {
      setName() {
        return this;
      }
      addText() {
        return this;
      }
      addToggle() {
        return this;
      }
      addDropdown() {
        return this;
      }
    }
    return { Plugin, Notice, Modal, PluginSettingTab, Setting };
  }
  return originalLoad(request, parent, isMain);
};

const InvestmentSimulatorPlugin = require("../main.js");
Module._load = originalLoad;

async function run() {
  const plugin = new InvestmentSimulatorPlugin();
  await plugin.onload();

  const nameById = new Map(plugin.__commands.map((command) => [command.id, command.name]));
  assert.strictEqual(nameById.get("invsim-insert-template"), "INV: Start here - insert 3-minute note");
  assert.strictEqual(nameById.get("invsim-open-guided-editor"), "INV: Start here - open portfolio setup");
  assert.strictEqual(nameById.get("invsim-run"), "INV: Analyze current note");
  assert.strictEqual(nameById.get("invsim-export-csv-pack"), "INV: Advanced - export CSV pack");
  assert.strictEqual(nameById.get("invsim-ingest-ocr-json"), "INV: Advanced - ingest OCR JSON into portfolio");

  const template = plugin.template();
  assert.match(template, /## Start Here/);
  assert.match(template, /INV: Start here - open portfolio setup/);
  assert.match(template, /INV: Analyze current note/);
  assert.match(template, /## First-Run Rules/);
  assert.match(template, /## Advanced Features \(Later\)/);
  assert.match(template, /## Portfolio/);

  const parsed = plugin.parse(`## Investment Params
principal: 10000000
monthlyContribution: 500000
years: 10
simulations: 1200
goalAmount: 200000000
maxMdd: 35
maxVolatility: 25
maxCryptoWeight: 40
maxSingleAssetWeight: 35

## Portfolio
- AAPL,stock,2,190,25,150
- BTC,crypto,0.1,90000,20
- KRW,cash,1000000,1,55
`);
  const report = plugin.run(parsed);
  assert.match(report, /### Read This First/);
  assert.match(report, /- Overall Status: /);
  assert.match(report, /- Best Starter Plan: Plan /);
  assert.match(report, /- Goal Probability: .*Higher is better/);

  console.log("PASS p0_15_beginner_entrypoints");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
