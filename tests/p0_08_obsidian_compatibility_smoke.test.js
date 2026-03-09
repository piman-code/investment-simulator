"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const manifestPath = path.join(__dirname, "..", "manifest.json");
const versionsPath = path.join(__dirname, "..", "versions.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const versions = JSON.parse(fs.readFileSync(versionsPath, "utf8"));

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
        };
      }
      open() {}
      close() {}
    }
    class PluginSettingTab {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
      }
    }
    class Setting {
      setName() {
        return this;
      }
      setDesc() {
        return this;
      }
      addText(cb) {
        cb({
          setPlaceholder() {
            return this;
          },
          setValue() {
            return this;
          },
          onChange() {
            return this;
          },
        });
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
  assert.strictEqual(manifest.id, "investment-simulator", "manifest id should stay stable for Obsidian install path");
  assert.strictEqual(manifest.isDesktopOnly, false, "plugin must remain installable on mobile for P0-08");
  assert.strictEqual(versions[manifest.version], manifest.minAppVersion, "versions.json should map current plugin version to minAppVersion");

  const plugin = new InvestmentSimulatorPlugin();
  await plugin.onload();

  const commandIds = plugin.__commands.map((command) => command.id).sort();
  assert.deepStrictEqual(commandIds, [
    "invsim-export-csv-pack",
    "invsim-generate-daily-briefing",
    "invsim-generate-omniforge-handoff",
    "invsim-ingest-ocr-json",
    "invsim-insert-template",
    "invsim-load-latest-json-profile",
    "invsim-ocr-local-image-into-note",
    "invsim-open-guided-editor",
    "invsim-run",
    "invsim-save-json-profile",
  ]);

  assert.strictEqual(plugin.__ribbons.length, 1, "ribbon action should be registered");
  assert.strictEqual(plugin.__tabs.length, 1, "settings tab should be registered");
  const runCommand = plugin.__commands.find((command) => command.id === "invsim-run");
  assert.strictEqual(typeof runCommand?.editorCallback, "function", "run command should expose editor callback");

  console.log("PASS p0_08_obsidian_compatibility_smoke");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
