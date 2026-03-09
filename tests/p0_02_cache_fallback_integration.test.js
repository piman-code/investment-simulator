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

function quote(plugin, { symbol, price, market, asOf }) {
  const base = {
    symbol,
    price,
    currency: "USD",
    market,
    source: "cache",
    asOf,
    cachedAt: asOf,
  };
  return {
    ...base,
    integrityHash: plugin.computeQuoteIntegrityHash(base),
  };
}

function run() {
  const plugin = new InvestmentSimulatorPlugin();
  plugin.saveSettings = async () => {};

  const now = Date.now();
  const iso = (hoursAgo) => new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();

  const live = { BTC: { symbol: "BTC", price: 100000, market: "crypto", asOf: iso(0.1) } };
  let result = plugin.resolveQuoteForSymbol("BTC", live);
  assert.strictEqual(result.fallbackApplied, false, "live quote should not trigger fallback");
  assert.strictEqual(result.quote.price, 100000, "live quote price mismatch");

  plugin.quoteCache = {
    BTC: quote(plugin, { symbol: "BTC", price: 99000, market: "crypto", asOf: iso(11) }),
  };
  result = plugin.resolveQuoteForSymbol("BTC", {});
  assert.strictEqual(result.fallbackApplied, true, "fresh crypto cache should fallback");
  assert.strictEqual(result.quote.price, 99000, "fallback quote price mismatch");

  plugin.quoteCache.BTC = quote(plugin, { symbol: "BTC", price: 98000, market: "crypto", asOf: iso(13) });
  result = plugin.resolveQuoteForSymbol("BTC", {});
  assert.strictEqual(result.quote, null, "stale crypto cache must be rejected");

  plugin.quoteCache.BTC = {
    ...quote(plugin, { symbol: "BTC", price: 97000, market: "crypto", asOf: iso(1) }),
    integrityHash: "fnv1a32:deadbeef",
  };
  result = plugin.resolveQuoteForSymbol("BTC", {});
  assert.strictEqual(result.quote, null, "tampered cache hash must be rejected");

  plugin.quoteCache.BTC = quote(plugin, { symbol: "BTC", price: 96000, market: "stock", asOf: iso(170) });
  result = plugin.resolveQuoteForSymbol("BTC", {});
  assert.strictEqual(result.quote, null, "cache ttl exceeded entries must be rejected");

  console.log("PASS p0_02_cache_fallback_integration");
}

run();
