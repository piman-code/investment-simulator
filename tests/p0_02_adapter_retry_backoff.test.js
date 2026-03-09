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
  plugin.sleep = async () => {};

  let attempts = 0;
  const recovered = await plugin.fetchQuoteWithRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      const err = new Error("timeout while reading upstream");
      err.code = "ETIMEDOUT";
      throw err;
    }
    return { symbol: "AAPL", price: 190 };
  }, { retryLimit: 2, baseDelayMs: 1 });

  assert.strictEqual(attempts, 3, "retryable error should be retried up to limit");
  assert.strictEqual(recovered.price, 190, "recovered quote mismatch");

  attempts = 0;
  await assert.rejects(
    plugin.fetchQuoteWithRetry(async () => {
      attempts += 1;
      const err = new Error("bad request");
      err.status = 400;
      throw err;
    }, { retryLimit: 3, baseDelayMs: 1 }),
    /bad request/
  );
  assert.strictEqual(attempts, 1, "non-retryable 4xx should not be retried");

  assert.strictEqual(plugin.isRetryableQuoteError({ status: 429 }), true, "429 should be retryable");
  assert.strictEqual(plugin.isRetryableQuoteError({ status: 503 }), true, "5xx should be retryable");
  assert.strictEqual(plugin.isRetryableQuoteError({ code: "ECONNRESET" }), true, "connection reset should be retryable");
  assert.strictEqual(plugin.isRetryableQuoteError({ status: 404 }), false, "404 should not be retryable");

  console.log("PASS p0_02_adapter_retry_backoff");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
