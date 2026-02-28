"use strict";

const { Plugin, Notice, PluginSettingTab, Setting } = require("obsidian");

const ASSET_ASSUMPTIONS = {
  stock: { annualReturn: 8, annualVolatility: 18 },
  etf: { annualReturn: 7, annualVolatility: 14 },
  crypto: { annualReturn: 15, annualVolatility: 60 },
  cash: { annualReturn: 2, annualVolatility: 1 },
  other: { annualReturn: 5, annualVolatility: 20 },
};

const OCR_THRESHOLDS = {
  autoApply: 0.9,
  recommendReview: 0.7,
};

const DEFAULT_SETTINGS = {
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
};

class InvSimSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Investment Simulator Settings" });

    const keys = [
      ["principal", "Default Initial Capital"],
      ["monthlyContribution", "Default Monthly Contribution"],
      ["years", "Default Horizon (Years)"],
      ["simulations", "Simulation Paths"],
      ["goalAmount", "Goal Amount"],
      ["maxMdd", "Max Drawdown Tolerance (%)"],
      ["maxVolatility", "Max Volatility Tolerance (%)"],
      ["maxCryptoWeight", "Max Crypto Weight (%)"],
      ["maxSingleAssetWeight", "Max Single Asset Weight (%)"],
    ];

    for (const [key, label] of keys) {
      new Setting(containerEl)
        .setName(label)
        .addText((t) =>
          t.setValue(String(this.plugin.settings[key])).onChange(async (v) => {
            const n = Number(String(v).replace(/,/g, ""));
            if (!Number.isFinite(n)) return;
            this.plugin.settings[key] = n;
            await this.plugin.saveSettings();
          })
        );
    }
  }
}

module.exports = class InvestmentSimulatorPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("calculator", "INV: Insert analysis template", () => {
      const editor = this.app.workspace.activeEditor?.editor;
      if (!editor) return new Notice("No active editor.");
      editor.replaceSelection(this.template());
    });

    this.addSettingTab(new InvSimSettingTab(this.app, this));

    this.addCommand({
      id: "invsim-insert-template",
      name: "INV: Insert analysis template",
      editorCallback: (editor) => {
        editor.replaceSelection(this.template());
      },
    });

    this.addCommand({
      id: "invsim-run",
      name: "INV: Run market intelligence analysis",
      editorCallback: (editor) => {
        const params = this.parse(editor.getValue());
        const report = this.run(params);
        editor.replaceSelection(`\n\n${report}\n`);
        new Notice("Market intelligence report generated.");
      },
    });

    this.addCommand({
      id: "invsim-ingest-ocr-json",
      name: "INV: Ingest OCR JSON into portfolio",
      editorCallback: (editor) => {
        this.ingestOcrToEditor(editor);
      },
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  template() {
    const s = this.settings;
    return `## Investment Params
principal: ${s.principal}
monthlyContribution: ${s.monthlyContribution}
years: ${s.years}
simulations: ${s.simulations}
goalAmount: ${s.goalAmount}
maxMdd: ${s.maxMdd}
maxVolatility: ${s.maxVolatility}
maxCryptoWeight: ${s.maxCryptoWeight}
maxSingleAssetWeight: ${s.maxSingleAssetWeight}

## Market Quotes
- AAPL,190,USD,nasdaq,manual
- QQQ,430,USD,nasdaq,manual
- BTC,90000,USD,binance,manual

## Portfolio
- AAPL,stock,12,,25
- QQQ,etf,8,,25
- BTC,crypto,0.18,,20
- KRW,cash,5000000,1,30

## League Standings (optional)
## Results
- Alpha: 3.12%
- Beta: -0.42%
- Gamma: 1.07%

## OCR JSON (optional)
\`\`\`json
{
  "source": {"platform": "sample", "capturedAt": "2026-02-28T12:00:00Z", "timezone": "UTC"},
  "positions": [
    {"symbolRaw": "AAPL", "symbol": "AAPL", "assetType": "stock", "quantity": 3, "marketPrice": 190, "confidence": 0.93},
    {"symbolRaw": "BTC", "symbol": "BTC", "assetType": "crypto", "quantity": 0.05, "marketPrice": 90000, "confidence": 0.72}
  ],
  "quality": {"overallConfidence": 0.82, "missingFields": [], "requiresManualReview": true}
}
\`\`\`
`;
  }

  parse(text) {
    const out = { ...this.settings };
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*([^#\n]+)\s*$/);
      if (!m) continue;
      const key = m[1];
      if (!(key in out)) continue;
      const val = Number(String(m[2]).trim().replace(/,/g, ""));
      if (Number.isFinite(val)) out[key] = val;
    }

    out.positions = this.parsePortfolioSection(text);
    out.marketQuotes = this.parseMarketQuotesSection(text);
    out.leagueContext = this.parseLeagueContext(text);
    return out;
  }

  parsePortfolioSection(text) {
    const section = this.readSection(text, "Portfolio");
    if (!section) return [];

    const positions = [];
    for (const rawLine of section.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("-")) continue;

      const row = line.replace(/^-+\s*/, "");
      const [symbolRaw, assetTypeRaw, quantityRaw, priceRaw, targetWeightRaw] = row
        .split(",")
        .map((x) => String(x || "").trim());
      if (!symbolRaw) continue;

      const quantity = this.toNumber(quantityRaw);
      if (!(quantity > 0)) continue;

      const assetType = this.normalizeAssetType(assetTypeRaw);
      const marketPrice = this.toNumber(priceRaw);
      const targetWeight = this.toNumber(targetWeightRaw);

      positions.push({
        symbolRaw,
        symbol: symbolRaw.toUpperCase(),
        assetType,
        quantity,
        marketPrice: Number.isFinite(marketPrice) ? marketPrice : null,
        targetWeight: Number.isFinite(targetWeight) ? targetWeight : null,
      });
    }

    return positions;
  }

  parseMarketQuotesSection(text) {
    const section = this.readSection(text, "Market Quotes");
    if (!section) return {};

    const quotes = {};
    const nowIso = new Date().toISOString();

    for (const rawLine of section.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("-")) continue;

      const row = line.replace(/^-+\s*/, "");
      const [symbolRaw, priceRaw, currencyRaw, marketRaw, sourceRaw, asOfRaw] = row
        .split(",")
        .map((x) => String(x || "").trim());
      const symbol = symbolRaw.toUpperCase();
      const price = this.toNumber(priceRaw);
      if (!symbol || !Number.isFinite(price) || price <= 0) continue;

      quotes[symbol] = {
        symbol,
        price,
        currency: currencyRaw || "USD",
        market: marketRaw || "unknown",
        source: sourceRaw || "manual",
        asOf: asOfRaw || nowIso,
      };
    }

    return quotes;
  }

  parseLeagueContext(text) {
    const returns = [];

    const standings = this.readSection(text, "Standings");
    if (standings) {
      for (const row of standings.split("\n")) {
        const m = row.match(/^\|\s*\d+\s*\|\s*[^|]+\|\s*([+-]?\d+(?:\.\d+)?)\s*%?\s*\|/);
        if (m) returns.push(Number(m[1]));
      }
    }

    const results = this.readSection(text, "Results") || this.readSection(text, "League Results");
    if (results) {
      for (const row of results.split("\n")) {
        const m = row.match(/^-\s*[^:]+:\s*([+-]?\d+(?:\.\d+)?)\s*%?\s*$/);
        if (m) returns.push(Number(m[1]));
      }
    }

    if (!returns.length) {
      return {
        count: 0,
        avgReturn: 0,
        regime: "neutral",
        adjustments: { A: 0, B: 0, C: 0 },
        note: "No league signal found.",
      };
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    let regime = "neutral";
    let adjustments = { A: 0, B: 0, C: 0 };
    let note = "League signal is neutral.";

    if (avgReturn >= 1.5) {
      regime = "riskOn";
      adjustments = { A: -3, B: 1, C: 3 };
      note = "League trend is risk-on (positive average return).";
    } else if (avgReturn <= -1.5) {
      regime = "riskOff";
      adjustments = { A: 3, B: 1, C: -3 };
      note = "League trend is risk-off (negative average return).";
    }

    return {
      count: returns.length,
      avgReturn,
      regime,
      adjustments,
      note,
    };
  }

  run(params) {
    const portfolio = this.buildPortfolio(params.positions || [], params.marketQuotes || {});
    const principal = portfolio.totalMarketValue > 0 ? portfolio.totalMarketValue : Math.max(1, params.principal);
    const blended = this.derivePortfolioAssumptions(portfolio, params);
    const baseSimulation = this.simulate({
      principal,
      monthlyContribution: Math.max(0, params.monthlyContribution),
      years: Math.max(1, params.years),
      simulations: Math.max(50, params.simulations),
      annualReturn: blended.annualReturn,
      annualVolatility: blended.annualVolatility,
      goalAmount: Math.max(0, params.goalAmount),
    });

    const recommendations = this.generateRecommendations({
      params,
      principal,
      buckets: portfolio.bucketWeights,
      leagueContext: params.leagueContext,
    });

    const warnings = this.buildWarnings({
      params,
      portfolio,
      goalProbability: baseSimulation.goalProbability,
      leagueContext: params.leagueContext,
    });

    return this.renderReport({
      params,
      portfolio,
      principal,
      assumptions: blended,
      simulation: baseSimulation,
      recommendations,
      warnings,
      leagueContext: params.leagueContext,
    });
  }

  ingestOcrToEditor(editor) {
    const text = editor.getValue();
    const payload = this.parseOcrPayloadFromNote(text);
    if (!payload) {
      new Notice("No valid OCR JSON found. Add a JSON block under '## OCR JSON'.");
      return;
    }

    const normalized = this.normalizeOcrPayload(payload);
    if (!normalized.portfolioPositions.length) {
      new Notice("OCR JSON parsed but no usable positions found.");
      return;
    }

    const existing = this.parsePortfolioSection(text);
    const merged = this.mergePositions(existing, normalized.portfolioPositions);
    const portfolioBody = merged
      .map((p) => `- ${p.symbol},${p.assetType},${this.prettyNum(p.quantity)},${Number.isFinite(p.marketPrice) ? p.marketPrice : ""},${Number.isFinite(p.targetWeight) ? p.targetWeight : ""}`)
      .join("\n");

    const reviewLines = [
      `- platform: ${normalized.source.platform}`,
      `- capturedAt: ${normalized.source.capturedAt}`,
      `- overallConfidence: ${normalized.quality.overallConfidence.toFixed(2)}`,
      `- requiresManualReview: ${normalized.quality.requiresManualReview ? "true" : "false"}`,
      "",
      "| Symbol | Type | Qty | Price | Confidence | Decision |",
      "|---|---|---:|---:|---:|---|",
      ...normalized.rows.map((r) => {
        const price = Number.isFinite(r.marketPrice) ? r.marketPrice : "-";
        return `| ${r.symbol || "-"} | ${r.assetType} | ${this.prettyNum(r.quantity)} | ${price} | ${(r.confidence * 100).toFixed(1)}% | ${r.decision} |`;
      }),
    ].join("\n");

    let next = this.upsertSection(text, "Portfolio", portfolioBody);
    next = this.upsertSection(next, "OCR Review", reviewLines);
    editor.setValue(next);

    new Notice(
      `OCR ingestion complete: ${normalized.portfolioPositions.length} positions applied, ${normalized.manualReviewCount} flagged for review.`
    );
  }

  parseOcrPayloadFromNote(text) {
    const ocrSection = this.readSection(text, "OCR JSON");
    const candidates = [];

    if (ocrSection) {
      const fromSection = [...ocrSection.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]);
      candidates.push(...fromSection);
    }

    const allJsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]);
    candidates.push(...allJsonBlocks);

    for (const raw of candidates) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.positions)) return parsed;
      } catch (err) {
        // ignore invalid JSON blocks
      }
    }

    return null;
  }

  normalizeOcrPayload(payload) {
    const source = {
      platform: payload?.source?.platform || "unknown",
      capturedAt: payload?.source?.capturedAt || new Date().toISOString(),
    };

    const rows = [];
    const portfolioPositions = [];
    let manualReviewCount = 0;

    const positions = Array.isArray(payload.positions) ? payload.positions : [];
    for (const p of positions) {
      const symbol = String(p?.symbol || p?.symbolRaw || "").trim().toUpperCase();
      const quantity = this.toNumber(p?.quantity);
      const assetType = this.normalizeAssetType(p?.assetType || "other");
      const marketPrice = this.toNumber(p?.marketPrice ?? p?.avgPrice);
      const confidence = this.clamp(Number(p?.confidence ?? 0), 0, 1);

      const missing = [];
      if (!symbol) missing.push("symbol");
      if (!(quantity > 0)) missing.push("quantity");

      let decision = "manual";
      if (!missing.length && confidence >= OCR_THRESHOLDS.autoApply) {
        decision = "auto-apply";
      } else if (!missing.length && confidence >= OCR_THRESHOLDS.recommendReview) {
        decision = "review-recommended";
      }

      if (decision !== "auto-apply") manualReviewCount += 1;

      rows.push({
        symbol,
        assetType,
        quantity: Number.isFinite(quantity) ? quantity : null,
        marketPrice: Number.isFinite(marketPrice) ? marketPrice : null,
        confidence,
        decision,
        missing,
      });

      if (!missing.length) {
        portfolioPositions.push({
          symbolRaw: symbol,
          symbol,
          assetType,
          quantity,
          marketPrice: Number.isFinite(marketPrice) ? marketPrice : null,
          targetWeight: null,
        });
      }
    }

    const quality = {
      overallConfidence: this.clamp(Number(payload?.quality?.overallConfidence ?? 0), 0, 1),
      requiresManualReview: Boolean(payload?.quality?.requiresManualReview || manualReviewCount > 0),
    };

    return {
      source,
      rows,
      quality,
      portfolioPositions,
      manualReviewCount,
    };
  }

  mergePositions(existing, incoming) {
    const map = new Map();

    for (const p of existing) {
      const key = `${p.symbol}|${p.assetType}`;
      map.set(key, { ...p });
    }

    for (const p of incoming) {
      const key = `${p.symbol}|${p.assetType}`;
      if (!map.has(key)) {
        map.set(key, { ...p });
        continue;
      }

      const prev = map.get(key);
      map.set(key, {
        ...prev,
        quantity: p.quantity,
        marketPrice: Number.isFinite(p.marketPrice) ? p.marketPrice : prev.marketPrice,
      });
    }

    return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  buildPortfolio(positions, marketQuotes) {
    const normalized = [];

    for (const pos of positions) {
      const quote = marketQuotes[pos.symbol];
      const resolvedPrice = Number.isFinite(pos.marketPrice) ? pos.marketPrice : quote?.price;
      const marketValue = Number.isFinite(resolvedPrice) ? resolvedPrice * pos.quantity : null;
      const priceSource = Number.isFinite(pos.marketPrice) ? "note" : quote ? quote.source : "missing";
      const asOf = quote?.asOf || null;

      normalized.push({
        ...pos,
        marketPrice: Number.isFinite(resolvedPrice) ? resolvedPrice : null,
        marketValue,
        priceSource,
        asOf,
      });
    }

    const pricedPositions = normalized.filter((p) => Number.isFinite(p.marketValue) && p.marketValue >= 0);
    const totalMarketValue = pricedPositions.reduce((acc, p) => acc + p.marketValue, 0);

    const withWeight = normalized.map((p) => {
      const weight = totalMarketValue > 0 && Number.isFinite(p.marketValue) ? (p.marketValue / totalMarketValue) * 100 : null;
      return { ...p, weight };
    });

    const bucketWeights = { stock: 0, etf: 0, crypto: 0, cash: 0, other: 0 };
    for (const p of withWeight) {
      if (!Number.isFinite(p.weight)) continue;
      bucketWeights[p.assetType] += p.weight;
    }

    const topPosition =
      withWeight
        .filter((p) => Number.isFinite(p.weight))
        .sort((a, b) => b.weight - a.weight)[0] || null;

    const marketContext = this.buildMarketContext(withWeight, marketQuotes);

    return {
      positions: withWeight,
      totalMarketValue,
      bucketWeights,
      topPosition,
      missingPriceCount: normalized.filter((p) => !Number.isFinite(p.marketValue)).length,
      marketContext,
    };
  }

  buildMarketContext(positions, marketQuotes) {
    const quoteCount = Object.keys(marketQuotes || {}).length;
    const usedQuoteCount = positions.filter((p) => p.priceSource !== "note" && p.priceSource !== "missing").length;
    const missingPriceCount = positions.filter((p) => p.priceSource === "missing").length;

    let latestAsOf = null;
    for (const q of Object.values(marketQuotes || {})) {
      const t = Date.parse(q.asOf);
      if (!Number.isFinite(t)) continue;
      if (!latestAsOf || t > Date.parse(latestAsOf)) latestAsOf = new Date(t).toISOString();
    }

    return {
      quoteCount,
      usedQuoteCount,
      missingPriceCount,
      latestAsOf,
    };
  }

  derivePortfolioAssumptions(portfolio, params) {
    const hasPortfolioWeights = Object.values(portfolio.bucketWeights).some((x) => x > 0);
    if (!hasPortfolioWeights) {
      return {
        annualReturn: params.annualReturn,
        annualVolatility: params.annualVolatility,
      };
    }

    let ret = 0;
    let volVariance = 0;
    for (const [assetType, weightPct] of Object.entries(portfolio.bucketWeights)) {
      const w = weightPct / 100;
      const ass = ASSET_ASSUMPTIONS[assetType] || ASSET_ASSUMPTIONS.other;
      ret += w * ass.annualReturn;
      volVariance += (w * ass.annualVolatility) * (w * ass.annualVolatility);
    }

    return {
      annualReturn: Number.isFinite(ret) ? ret : params.annualReturn,
      annualVolatility: Number.isFinite(volVariance) ? Math.sqrt(volVariance) : params.annualVolatility,
    };
  }

  simulate(input) {
    const months = Math.max(1, Math.floor(input.years * 12));
    const runs = Math.max(20, Math.floor(input.simulations));
    const mu = input.annualReturn / 100 / 12;
    const sigma = input.annualVolatility / 100 / Math.sqrt(12);
    const finals = [];

    for (let i = 0; i < runs; i++) {
      let v = input.principal;
      for (let m = 0; m < months; m++) {
        v = v * (1 + mu + sigma * this.randn()) + input.monthlyContribution;
      }
      finals.push(v);
    }

    finals.sort((a, b) => a - b);
    const avg = finals.reduce((a, b) => a + b, 0) / finals.length;
    const p10 = finals[Math.floor(finals.length * 0.1)];
    const p50 = finals[Math.floor(finals.length * 0.5)];
    const p90 = finals[Math.floor(finals.length * 0.9)];
    const goalProbability = input.goalAmount > 0 ? (finals.filter((x) => x >= input.goalAmount).length / finals.length) * 100 : 0;
    const estimatedMdd = Math.min(95, input.annualVolatility * 2.1);

    return {
      runs,
      averageFinal: avg,
      p10,
      p50,
      p90,
      goalProbability,
      estimatedMdd,
    };
  }

  generateRecommendations(input) {
    const current = this.normalizeBucketWeights(input.buckets);

    const planA = this.normalizeBucketWeights({
      stock: Math.max(10, current.stock - 5),
      etf: current.etf + 8,
      crypto: Math.max(0, current.crypto - 10),
      cash: current.cash + 7,
      other: current.other,
    });

    const planB = this.normalizeBucketWeights({
      stock: 45,
      etf: 30,
      crypto: Math.min(current.crypto || 15, input.params.maxCryptoWeight - 5),
      cash: 100,
      other: 0,
    });
    planB.cash = Math.max(0, 100 - (planB.stock + planB.etf + planB.crypto + planB.other));

    const planC = this.normalizeBucketWeights({
      stock: Math.min(60, current.stock + 8),
      etf: Math.max(10, current.etf - 5),
      crypto: Math.min(input.params.maxCryptoWeight, current.crypto + 6),
      cash: Math.max(5, current.cash - 9),
      other: current.other,
    });

    const plans = [
      { key: "A", name: "Conservative", buckets: planA, notes: "Lower drawdown by reducing risk concentration." },
      { key: "B", name: "Balanced", buckets: planB, notes: "Balance growth and stability under constraints." },
      { key: "C", name: "Aggressive", buckets: planC, notes: "Prioritize upside while still honoring risk caps." },
    ];

    const simulationRuns = Math.min(400, Math.max(150, Math.floor(input.params.simulations / 3)));
    const enriched = plans.map((plan) => {
      const assumptions = this.assumptionsFromBuckets(plan.buckets);
      const sim = this.simulate({
        principal: input.principal,
        monthlyContribution: Math.max(0, input.params.monthlyContribution),
        years: Math.max(1, input.params.years),
        simulations: simulationRuns,
        annualReturn: assumptions.annualReturn,
        annualVolatility: assumptions.annualVolatility,
        goalAmount: Math.max(0, input.params.goalAmount),
      });

      const turnover = this.turnoverPct(current, plan.buckets);
      const returnScore = this.clamp((assumptions.annualReturn / 20) * 100, 0, 100);
      const riskPenalty =
        Math.max(0, sim.estimatedMdd - input.params.maxMdd) * 2 +
        Math.max(0, assumptions.annualVolatility - input.params.maxVolatility) * 1.5;
      const riskScore = this.clamp(100 - riskPenalty, 0, 100);
      const costScore = this.clamp(100 - turnover * 1.5, 0, 100);
      const baseScore = 0.45 * sim.goalProbability + 0.25 * returnScore + 0.2 * riskScore + 0.1 * costScore;

      const leagueAdjustment = Number(input.leagueContext?.adjustments?.[plan.key] || 0);
      const score = this.clamp(baseScore + leagueAdjustment, 0, 100);

      const failures = [];
      if (sim.estimatedMdd > input.params.maxMdd) failures.push("Estimated drawdown can exceed tolerance.");
      if (assumptions.annualVolatility > input.params.maxVolatility) failures.push("Volatility may breach user limit.");
      if (sim.goalProbability < 70) failures.push("Goal probability is below 70%. Raise contribution or extend horizon.");
      if (!failures.length) failures.push("Adverse macro shock can still impair results.");

      return {
        ...plan,
        assumptions,
        simulation: sim,
        turnover,
        score,
        baseScore,
        leagueAdjustment,
        failures,
      };
    });

    return enriched.sort((a, b) => b.score - a.score);
  }

  buildWarnings(input) {
    const warnings = [];
    const top = input.portfolio.topPosition;
    if (top && Number.isFinite(top.weight) && top.weight > input.params.maxSingleAssetWeight) {
      warnings.push(
        `Single asset concentration is high (${top.symbol}: ${top.weight.toFixed(
          1
        )}%). Consider reducing below ${input.params.maxSingleAssetWeight}%.`
      );
    }

    if (input.portfolio.bucketWeights.crypto > input.params.maxCryptoWeight) {
      warnings.push(
        `Crypto weight is ${input.portfolio.bucketWeights.crypto.toFixed(1)}%, above user cap ${input.params.maxCryptoWeight}%.`
      );
    }

    if (input.goalProbability < 70) {
      warnings.push(`Base goal probability is ${input.goalProbability.toFixed(1)}%. Increase contribution or extend years.`);
    }

    if (input.portfolio.marketContext.missingPriceCount > 0) {
      warnings.push(`${input.portfolio.marketContext.missingPriceCount} position(s) are missing price after market adapter lookup.`);
    }

    if (!input.leagueContext?.count) {
      warnings.push("No league data found. Recommendation score uses only portfolio + risk rules.");
    }

    if (!warnings.length) warnings.push("No major risk limit breach detected in current inputs.");
    return warnings;
  }

  renderReport(input) {
    const money = (n) => `${Math.round(n).toLocaleString("en-US")}`;
    const pct = (n) => `${Number(n).toFixed(2)}%`;

    const positions = input.portfolio.positions;
    const positionTable = positions.length
      ? [
          "| Symbol | Type | Qty | Price | Value | Weight | Target | Source |",
          "|---|---|---:|---:|---:|---:|---:|---|",
          ...positions.map((p) => {
            const price = Number.isFinite(p.marketPrice) ? money(p.marketPrice) : "-";
            const value = Number.isFinite(p.marketValue) ? money(p.marketValue) : "-";
            const weight = Number.isFinite(p.weight) ? pct(p.weight) : "-";
            const target = Number.isFinite(p.targetWeight) ? pct(p.targetWeight) : "-";
            return `| ${p.symbol} | ${p.assetType} | ${this.prettyNum(p.quantity)} | ${price} | ${value} | ${weight} | ${target} | ${p.priceSource} |`;
          }),
        ].join("\n")
      : "_No portfolio rows found. Simulation used parameter defaults only._";

    const recTable = [
      "| Plan | Style | Goal Prob | Exp Return | Exp Vol | Est MDD | Turnover | League Adj | Score |",
      "|---|---|---:|---:|---:|---:|---:|---:|---:|",
      ...input.recommendations.map((r) => {
        return `| ${r.key} | ${r.name} | ${pct(r.simulation.goalProbability)} | ${pct(r.assumptions.annualReturn)} | ${pct(
          r.assumptions.annualVolatility
        )} | ${pct(r.simulation.estimatedMdd)} | ${pct(r.turnover)} | ${r.leagueAdjustment.toFixed(1)} | ${r.score.toFixed(1)} |`;
      }),
    ].join("\n");

    const recNotes = input.recommendations
      .map((r) => {
        return [
          `- **Plan ${r.key} (${r.name})**: ${r.notes}`,
          `  - Failure Scenario: ${r.failures[0]}`,
          "  - Adjustable Levers: years, monthlyContribution, bucket targets",
        ].join("\n");
      })
      .join("\n");

    return `## Market Intelligence Report

### 1) Input Summary
- Initial Capital: ${money(input.principal)}
- Monthly Contribution: ${money(input.params.monthlyContribution)}
- Horizon: ${input.params.years} years
- Goal Amount: ${money(input.params.goalAmount)}
- Simulations: ${input.simulation.runs}

### 2) Data Context
- Market Quotes Provided: ${input.portfolio.marketContext.quoteCount}
- Quotes Used by Adapter: ${input.portfolio.marketContext.usedQuoteCount}
- Missing Prices After Adapter: ${input.portfolio.marketContext.missingPriceCount}
- Market Data As-Of: ${input.portfolio.marketContext.latestAsOf || "n/a"}
- League Samples: ${input.leagueContext.count}
- League Average Return: ${pct(input.leagueContext.avgReturn)}
- League Regime: ${input.leagueContext.regime}
- League Note: ${input.leagueContext.note}

### 3) Current Portfolio Snapshot
${positionTable}

### 4) Base Simulation (Current Portfolio Assumptions)
| Metric | Value |
|---|---:|
| Blended Annual Return | ${pct(input.assumptions.annualReturn)} |
| Blended Annual Volatility | ${pct(input.assumptions.annualVolatility)} |
| Average Final Value | ${money(input.simulation.averageFinal)} |
| P10 | ${money(input.simulation.p10)} |
| P50 | ${money(input.simulation.p50)} |
| P90 | ${money(input.simulation.p90)} |
| Goal Probability | ${pct(input.simulation.goalProbability)} |
| Estimated MDD | ${pct(input.simulation.estimatedMdd)} |

### 5) Recommendation Plans (A/B/C)
${recTable}

${recNotes}

### 6) Risk Alerts
${input.warnings.map((w) => `- ${w}`).join("\n")}

### 7) Compliance Notice
- This tool is not investment advice and is for decision support only.
- Final investment decisions and responsibility remain with the user.
- Results may change due to market regime shifts, data delays, or model limitations.
- Market quote timestamps and OCR confidence should be reviewed before execution.`;
  }

  readSection(text, heading) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|\\n)##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
    const m = text.match(regex);
    return m ? m[2].trim() : "";
  }

  upsertSection(text, heading, body) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|\\n)##\\s*${escaped}\\s*\\n[\\s\\S]*?(?=\\n##\\s|$)`, "i");
    const nextSection = `\n## ${heading}\n${body.trim()}\n`;

    if (regex.test(text)) {
      return text.replace(regex, nextSection);
    }

    const suffix = text.endsWith("\n") ? "" : "\n";
    return `${text}${suffix}${nextSection}`;
  }

  assumptionsFromBuckets(buckets) {
    let annualReturn = 0;
    let volVariance = 0;
    for (const [assetType, weightPct] of Object.entries(buckets)) {
      const w = weightPct / 100;
      const ass = ASSET_ASSUMPTIONS[assetType] || ASSET_ASSUMPTIONS.other;
      annualReturn += w * ass.annualReturn;
      volVariance += (w * ass.annualVolatility) * (w * ass.annualVolatility);
    }
    return {
      annualReturn,
      annualVolatility: Math.sqrt(volVariance),
    };
  }

  normalizeBucketWeights(raw) {
    const defaults = { stock: 0, etf: 0, crypto: 0, cash: 0, other: 0 };
    const merged = { ...defaults, ...raw };
    for (const key of Object.keys(merged)) {
      merged[key] = Math.max(0, Number(merged[key]) || 0);
    }
    const sum = Object.values(merged).reduce((a, b) => a + b, 0);
    if (sum <= 0) return { stock: 45, etf: 30, crypto: 15, cash: 10, other: 0 };
    const norm = {};
    for (const [k, v] of Object.entries(merged)) norm[k] = (v / sum) * 100;
    return norm;
  }

  turnoverPct(a, b) {
    const keys = ["stock", "etf", "crypto", "cash", "other"];
    const gross = keys.reduce((acc, key) => acc + Math.abs((a[key] || 0) - (b[key] || 0)), 0);
    return gross / 2;
  }

  normalizeAssetType(raw) {
    const x = String(raw || "other").trim().toLowerCase();
    if (x === "stock" || x === "crypto" || x === "etf" || x === "cash") return x;
    return "other";
  }

  toNumber(v) {
    return Number(String(v || "").trim().replace(/,/g, ""));
  }

  prettyNum(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "-";
    return Number.isInteger(v) ? String(v) : v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }

  clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  randn() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
};
