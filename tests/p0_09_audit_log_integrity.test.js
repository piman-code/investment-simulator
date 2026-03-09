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
    principal: 52341000,
    params: {
      monthlyContribution: 1200000,
      maxMdd: 0.18,
      maxVolatility: 0.22,
      maxCryptoWeight: 0.2,
      maxSingleAssetWeight: 0.35,
      previousAuditIntegrityHash: "fnv1a32:1234abcd",
    },
    portfolio: {
      positions: [
        { symbol: "BTC" },
        { symbol: "AAPL" },
      ],
      marketContext: {
        latestAsOf: "2026-03-07T00:00:00.000Z",
        quoteCount: 2,
        usedQuoteCount: 2,
        fallbackQuoteCount: 1,
        missingPriceCount: 0,
      },
    },
    warnings: ["single asset concentration risk"],
  };

  const audit = plugin.buildAuditLog(input);

  assert.ok(audit.integrityHash.startsWith("fnv1a32:"), "integrity hash must exist");
  assert.strictEqual(audit.previousIntegrityHash, "fnv1a32:1234abcd", "previous hash should be carried");
  assert.ok(audit.chainHash.startsWith("fnv1a32:"), "chain hash must exist");
  assert.ok(audit.inputSnapshot.symbolsMasked.includes("B*C"), "BTC should be masked");
  assert.ok(!audit.inputSnapshot.symbolsMasked.includes("BTC"), "raw symbol must not appear");
  assert.ok(audit.inputSnapshot.principalBand.endsWith("KRW (band)"), "principal should be banded");

  const recomputed = plugin.computeAuditIntegrityHash(audit);
  assert.strictEqual(recomputed, audit.integrityHash, "audit integrity hash should be reproducible");

  const recomputedChain = plugin.computeAuditChainHash(audit.previousIntegrityHash, audit.integrityHash);
  assert.strictEqual(recomputedChain, audit.chainHash, "audit chain hash should be reproducible");

  const tampered = {
    ...audit,
    warningSnapshot: {
      ...audit.warningSnapshot,
      count: audit.warningSnapshot.count + 1,
    },
  };
  const tamperedHash = plugin.computeAuditIntegrityHash(tampered);
  assert.notStrictEqual(tamperedHash, audit.integrityHash, "tampering must change integrity hash");

  plugin.lastAuditIntegrityHash = "fnv1a32:persisted01";
  const parsed = plugin.parse("## Portfolio\n- AAPL,stock,1\n");
  assert.strictEqual(
    parsed.previousAuditIntegrityHash,
    "fnv1a32:persisted01",
    "parse should fallback to persisted integrity hash when note has no audit section"
  );

  const extracted = plugin.extractAuditIntegrityHash("- Integrity Hash: fnv1a32:feedbeef\n");
  assert.strictEqual(extracted, "fnv1a32:feedbeef", "integrity hash extractor should parse report lines");

  console.log("PASS p0_09_audit_log_integrity");
}

run();
