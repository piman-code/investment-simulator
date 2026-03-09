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
  plugin.quoteCache = {};
  plugin.savedProfiles = [];

  let noteValue = `## Market Quotes
- KRW,1,KRW,cash,manual,2026-03-08T00:00:00Z

## Portfolio
- KRW,cash,5000000,1,100

## OCR JSON
\`\`\`json
{
  "source": {
    "platform": "upbit",
    "capturedAt": "2026-03-08T01:00:00Z",
    "timezone": "Asia/Seoul"
  },
  "account": {
    "brokerOrExchange": "Upbit",
    "accountMask": "12345678"
  },
  "positions": [
    {
      "include": true,
      "symbolRaw": "BTC",
      "symbol": "BTC",
      "assetType": "crypto",
      "quantity": 0.15,
      "marketPrice": 90000,
      "currency": "USD",
      "confidence": 0.72,
      "reviewNote": "confirmed from external OCR"
    },
    {
      "include": true,
      "symbolRaw": "AAPL",
      "symbol": "AAPL",
      "assetType": "stock",
      "quantity": 3,
      "avgPrice": 170,
      "marketPrice": 190,
      "currency": "USD",
      "confidence": 0.95
    },
    {
      "include": false,
      "symbolRaw": "???",
      "symbol": "???",
      "assetType": "stock",
      "quantity": null,
      "marketPrice": null,
      "currency": "USD",
      "confidence": 0.4,
      "reviewNote": "noise row"
    }
  ],
  "totals": {
    "totalValue": 15000000,
    "cash": 5000000,
    "currency": "KRW"
  },
  "quality": {
    "overallConfidence": 0.82,
    "requiresManualReview": true
  }
}
\`\`\`
`;

  const editor = {
    getValue() {
      return noteValue;
    },
    setValue(next) {
      noteValue = next;
    },
  };

  const applied = plugin.ingestOcrToEditor(editor);
  assert.ok(applied, "standard OCR JSON should ingest successfully");
  assert.strictEqual(applied.portfolioPositions.length, 2, "only valid included OCR rows should merge into portfolio");
  assert.strictEqual(applied.manualReviewCount, 2, "review-recommended and excluded rows should remain flagged");

  assert.doesNotMatch(noteValue, /## OCR Capture/, "capture/image workflow should stay outside the plugin");
  assert.match(noteValue, /## OCR JSON/);
  assert.match(noteValue, /"accountMask": "\*{4}5678"/);

  assert.match(noteValue, /## OCR Review/);
  assert.match(noteValue, /- rowsIncluded: 2/);
  assert.match(noteValue, /- rowsFlaggedForReview: 2/);
  assert.match(noteValue, /\| Y \| BTC \| crypto \| 0\.15 \| - \| 90000 \| USD \| 72\.0% \| review-recommended \| confirmed from external OCR \|/);
  assert.match(noteValue, /\| N \| - \| stock \| - \| - \| - \| USD \| 40\.0% \| excluded \/ manual \/ missing: symbol, quantity \| noise row \|/);

  assert.match(noteValue, /## Market Quotes/);
  assert.match(noteValue, /- AAPL,190,USD,stock,ocr-auto,2026-03-08T01:00:00Z/);
  assert.match(noteValue, /- BTC,90000,USD,crypto,ocr-reviewed,2026-03-08T01:00:00Z/);

  assert.match(noteValue, /## Portfolio/);
  assert.match(noteValue, /- AAPL,stock,3,190,,170/);
  assert.match(noteValue, /- BTC,crypto,0\.15,90000,/);
  assert.match(noteValue, /- KRW,cash,5000000,1,100/);

  console.log("PASS p0_07_ocr_review_flow");
}

run();
