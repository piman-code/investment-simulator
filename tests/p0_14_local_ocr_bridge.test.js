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
    ocrTesseractPath: "/opt/homebrew/bin/tesseract",
    ocrLanguage: "eng",
    ocrPsm: 6,
    ocrNormalizerScriptPath: "/Users/hangbokee/.codex/skills/investment-ocr-json/scripts/normalize_ocr_input.js",
    ocrDefaultPlatform: "local-tesseract",
    ocrDefaultTimezone: "Asia/Seoul",
  };
  plugin.quoteCache = {};
  plugin.quoteHistory = {};

  let noteValue = `# OCR Bridge Note

## Investment Params
principal: 10000000
monthlyContribution: 500000
years: 10
simulations: 1200
goalAmount: 200000000
maxMdd: 35
maxVolatility: 25
maxCryptoWeight: 40
maxSingleAssetWeight: 35

## OCR Capture Input
path: /tmp/sample-capture.png
platform: upbit-mobile
capturedAt: 2026-03-08T09:00:00+09:00
timezone: Asia/Seoul
broker: upbit
accountMask: 5678
currency: KRW
lang: eng+kor
psm: 6

## Portfolio
- KRW,cash,5000000,1,100
`;

  const editor = {
    getValue() {
      return noteValue;
    },
    setValue(next) {
      noteValue = next;
    },
  };

  let receivedRawText = "";
  plugin.executeLocalOcrCommand = (captureInput) => {
    assert.strictEqual(captureInput.path, "/tmp/sample-capture.png", "capture path should be parsed from note section");
    return "AAPL,3,190,USD,0.93\nBTC,0.15,90000,USD,0.72";
  };
  plugin.runOcrNormalizerScript = (rawText, captureInput) => {
    receivedRawText = rawText;
    assert.strictEqual(captureInput.platform, "upbit-mobile", "capture metadata should flow into normalizer");
    return JSON.stringify({
      source: {
        platform: captureInput.platform,
        capturedAt: captureInput.capturedAt,
        timezone: captureInput.timezone,
      },
      account: {
        brokerOrExchange: captureInput.broker,
        accountMask: captureInput.accountMask,
      },
      positions: [
        {
          include: true,
          symbolRaw: "AAPL",
          symbol: "AAPL",
          assetType: "stock",
          quantity: 3,
          avgPrice: 170,
          marketPrice: 190,
          currency: "USD",
          confidence: 0.93,
          reviewNote: "from local tesseract",
        },
        {
          include: true,
          symbolRaw: "BTC",
          symbol: "BTC",
          assetType: "crypto",
          quantity: 0.15,
          marketPrice: 90000,
          currency: "USD",
          confidence: 0.72,
          reviewNote: "needs review",
        },
      ],
      totals: {
        cash: 5000000,
        currency: "KRW",
      },
      quality: {
        overallConfidence: 0.825,
        requiresManualReview: true,
      },
    });
  };

  const applied = plugin.ingestLocalOcrImageToEditor(editor);
  assert.ok(applied, "local OCR bridge should produce a normalized OCR payload");
  assert.match(receivedRawText, /AAPL,3,190,USD,0.93/);
  assert.match(noteValue, /## OCR Capture Input/);
  assert.match(noteValue, /## OCR Raw Text/);
  assert.match(noteValue, /AAPL,3,190,USD,0.93/);
  assert.match(noteValue, /## OCR JSON/);
  assert.match(noteValue, /"platform": "upbit-mobile"/);
  assert.match(noteValue, /## OCR Review/);
  assert.match(noteValue, /from local tesseract/);
  assert.match(noteValue, /## Market Quotes/);
  assert.match(noteValue, /- AAPL,190,USD,stock,ocr-auto,2026-03-08T09:00:00\+09:00/);
  assert.match(noteValue, /- BTC,90000,USD,crypto,ocr-reviewed,2026-03-08T09:00:00\+09:00/);
  assert.match(noteValue, /## Portfolio/);
  assert.match(noteValue, /- AAPL,stock,3,190,,170/);
  assert.match(noteValue, /- BTC,crypto,0\.15,90000,/);

  console.log("PASS p0_14_local_ocr_bridge");
}

run();
