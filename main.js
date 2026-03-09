"use strict";

const fs = require("fs");
const { spawnSync } = require("child_process");
const { Plugin, Notice, PluginSettingTab, Setting, Modal } = require("obsidian");

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

const OCR_SYMBOL_ALIASES = {
  XBT: "BTC",
  BCHABC: "BCH",
};

const CRYPTO_SYMBOLS = new Set([
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "ADA",
  "DOGE",
  "BNB",
  "AVAX",
  "DOT",
  "LINK",
  "LTC",
  "BCH",
  "ETC",
  "ATOM",
  "TRX",
  "APT",
  "ARB",
  "OP",
  "MATIC",
  "POL",
  "SHIB",
  "USDT",
  "USDC",
]);

const SCENARIO_DEFINITIONS = [
  {
    key: "Bear",
    label: "Risk-Off",
    note: "Demand shock and tighter liquidity assumptions.",
    returnShift: { stock: -6, etf: -4, crypto: -20, cash: 0, other: -5 },
    volMultiplier: { stock: 1.25, etf: 1.15, crypto: 1.35, cash: 1, other: 1.2 },
  },
  {
    key: "Base",
    label: "Current Regime",
    note: "Current blended assumptions without extra regime stress.",
    returnShift: { stock: 0, etf: 0, crypto: 0, cash: 0, other: 0 },
    volMultiplier: { stock: 1, etf: 1, crypto: 1, cash: 1, other: 1 },
  },
  {
    key: "Bull",
    label: "Risk-On",
    note: "Expansionary backdrop with stronger upside participation.",
    returnShift: { stock: 3, etf: 2, crypto: 10, cash: 0, other: 3 },
    volMultiplier: { stock: 0.95, etf: 0.9, crypto: 1.1, cash: 1, other: 0.95 },
  },
];

const CORRELATION_PROXY = {
  stock: { stock: 0.78, etf: 0.82, crypto: 0.35, cash: -0.05, other: 0.45 },
  etf: { stock: 0.82, etf: 0.8, crypto: 0.3, cash: -0.05, other: 0.4 },
  crypto: { stock: 0.35, etf: 0.3, crypto: 0.65, cash: -0.1, other: 0.25 },
  cash: { stock: -0.05, etf: -0.05, crypto: -0.1, cash: 1, other: 0 },
  other: { stock: 0.45, etf: 0.4, crypto: 0.25, cash: 0, other: 0.5 },
};

const MARKET_POLICY = {
  maxQuoteAgeHours: 24,
  maxQuoteAgeHoursByMarket: {
    crypto: 12,
    stock: 24,
    etf: 24,
    cash: 24,
    unknown: 24,
  },
  cacheTtlHours: 168,
  maxCacheEntries: 500,
};

const HISTORY_POLICY = {
  maxDailyPointsPerSymbol: 180,
  minDailyReturnsForCorrelation: 5,
  minDailyReturnsForRiskMetrics: 10,
  minBucketCoverageWeight: 0.6,
};

const DOWNSIDE_VOL_FACTOR = {
  stock: 0.72,
  etf: 0.68,
  crypto: 0.88,
  cash: 0.1,
  other: 0.75,
};

const SAVED_PROFILE_LIMIT = 20;

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
  rebalanceFeePct: 0.15,
  sellTaxPct: 0,
  minTradeAmount: 100000,
  enableLiveQuoteFetch: 0,
  quoteApiBaseUrl: "https://query1.finance.yahoo.com/v7/finance/quote?symbols={symbol}",
  quoteRetryLimit: 2,
  quoteRetryBaseDelayMs: 250,
  quoteFetchMaxSymbolsPerRun: 5,
  ocrTesseractPath: "/opt/homebrew/bin/tesseract",
  ocrLanguage: "eng",
  ocrPsm: 6,
  ocrNormalizerScriptPath: "/Users/hangbokee/.codex/skills/investment-ocr-json/scripts/normalize_ocr_input.js",
  ocrDefaultPlatform: "local-tesseract",
  ocrDefaultTimezone: "Asia/Seoul",
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
      ["rebalanceFeePct", "Rebalance Fee (%)"],
      ["sellTaxPct", "Sell Tax (%)"],
      ["minTradeAmount", "Min Trade Amount"],
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

    const textKeys = [
      ["ocrTesseractPath", "OCR Tesseract Path"],
      ["ocrLanguage", "OCR Language"],
      ["ocrPsm", "OCR PSM"],
      ["ocrNormalizerScriptPath", "OCR Normalizer Script Path"],
      ["ocrDefaultPlatform", "OCR Default Platform"],
      ["ocrDefaultTimezone", "OCR Default Timezone"],
    ];

    for (const [key, label] of textKeys) {
      new Setting(containerEl)
        .setName(label)
        .addText((t) =>
          t.setValue(String(this.plugin.settings[key] ?? "")).onChange(async (v) => {
            this.plugin.settings[key] = String(v ?? "");
            await this.plugin.saveSettings();
          })
        );
    }
  }
}

class InvSimGuidedInputModal extends Modal {
  constructor(app, plugin, editor) {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
    this.state = null;
  }

  onOpen() {
    this.state = this.plugin.createGuidedInputDraft(this.editor.getValue());
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  render() {
    const { contentEl } = this;
    const numberFields = [
      ["principal", "Initial Capital"],
      ["monthlyContribution", "Monthly Contribution"],
      ["years", "Horizon (Years)"],
      ["simulations", "Simulation Paths"],
      ["goalAmount", "Goal Amount"],
      ["maxMdd", "Max Drawdown Tolerance (%)"],
      ["maxVolatility", "Max Volatility Tolerance (%)"],
      ["maxCryptoWeight", "Max Crypto Weight (%)"],
      ["maxSingleAssetWeight", "Max Single Asset Weight (%)"],
    ];

    contentEl.empty();
    contentEl.createEl("h2", { text: "Start Here: Portfolio Setup" });
    contentEl.createEl("p", {
      text: "For a first run, fill Basic Goal and Portfolio first. Market Quotes are optional, and Scenario Overrides can wait until later.",
    });

    const profileWrapper = contentEl.createDiv();
    profileWrapper.createEl("label", { text: "Draft Name" });
    const profileNameInput = profileWrapper.createEl("input", { type: "text" });
    profileNameInput.value = String(this.state.profileName || "");
    profileNameInput.addEventListener("input", () => {
      this.state.profileName = profileNameInput.value;
    });

    const libraryWrapper = contentEl.createDiv();
    libraryWrapper.createEl("label", { text: "Saved Drafts (Optional)" });
    const profileSelect = libraryWrapper.createEl("select");
    const profiles = this.plugin.savedProfiles || [];
    const placeholderOption = profileSelect.createEl("option", { text: profiles.length ? "Select a saved profile" : "No saved profiles yet" });
    placeholderOption.value = "";
    placeholderOption.selected = !this.state.selectedProfileId;
    for (const profile of profiles) {
      const option = profileSelect.createEl("option", {
        text: `${profile.name} (${this.plugin.formatTimestamp(profile.savedAt)})`,
      });
      option.value = profile.id;
      if (profile.id === this.state.selectedProfileId) option.selected = true;
    }
    profileSelect.addEventListener("change", () => {
      this.state.selectedProfileId = profileSelect.value || null;
    });

    const libraryActions = libraryWrapper.createDiv();
    const loadButton = libraryActions.createEl("button", { text: "Load selected profile" });
    loadButton.addEventListener("click", async () => {
      if (!this.state.selectedProfileId) return;
      const profile = this.plugin.getSavedProfileById(this.state.selectedProfileId);
      if (!profile) return;
      this.state = this.plugin.createDraftFromSavedProfile(profile);
      this.render();
    });

    const saveButton = libraryActions.createEl("button", { text: "Save current draft" });
    saveButton.addEventListener("click", async () => {
      const saved = await this.plugin.saveJsonProfile(this.state.profileName, this.state);
      this.state.selectedProfileId = saved?.id || null;
      this.render();
    });

    const deleteButton = libraryActions.createEl("button", { text: "Delete selected draft" });
    deleteButton.addEventListener("click", async () => {
      if (!this.state.selectedProfileId) return;
      await this.plugin.deleteJsonProfile(this.state.selectedProfileId);
      this.state.selectedProfileId = null;
      this.render();
    });

    const numbersWrapper = contentEl.createDiv();
    numbersWrapper.createEl("h3", { text: "1. Basic Goal and Risk Limits" });
    for (const [key, label] of numberFields) {
      const wrapper = numbersWrapper.createDiv();
      wrapper.createEl("label", { text: label });
      const inputEl = wrapper.createEl("input", { type: "text" });
      inputEl.value = String(this.state[key] ?? "");
      inputEl.addEventListener("input", () => {
        this.state[key] = this.plugin.toNumber(inputEl.value);
      });
    }

    this.renderMarketQuoteTable(contentEl);
    this.renderPortfolioTable(contentEl);
    this.renderScenarioOverrideTable(contentEl);

    const actionWrapper = contentEl.createDiv();
    const applyButton = actionWrapper.createEl("button", { text: "Apply to note" });
    applyButton.addEventListener("click", () => {
      this.plugin.applyGuidedInputDraft(this.editor, this.state);
      this.close();
    });
  }

  renderMarketQuoteTable(containerEl) {
    const section = containerEl.createDiv();
    section.createEl("h3", { text: "2. Market Quotes (Optional)" });
    section.createEl("p", {
      text: "Use this when you want freshness tracking or do not want to type marketPrice directly in Portfolio. Columns: symbol, price, currency, market, source, asOf",
    });

    const table = section.createEl("table");
    const head = table.createEl("thead");
    const headRow = head.createEl("tr");
    for (const label of ["Symbol", "Price", "Currency", "Market", "Source", "As-Of", ""]) {
      headRow.createEl("th", { text: label });
    }

    const body = table.createEl("tbody");
    const rows = this.state.marketQuoteRows || [];
    rows.forEach((row, index) => {
      const tr = body.createEl("tr");
      this.createTextCell(tr, row, "symbol");
      this.createTextCell(tr, row, "price");
      this.createTextCell(tr, row, "currency");
      this.createTextCell(tr, row, "market");
      this.createTextCell(tr, row, "source");
      this.createTextCell(tr, row, "asOf");
      const removeCell = tr.createEl("td");
      const removeButton = removeCell.createEl("button", { text: "Remove" });
      removeButton.addEventListener("click", () => {
        this.state.marketQuoteRows.splice(index, 1);
        if (!this.state.marketQuoteRows.length) this.state.marketQuoteRows.push(this.plugin.createEmptyMarketQuoteRow());
        this.render();
      });
    });

    const addButton = section.createEl("button", { text: "Add market quote row" });
    addButton.addEventListener("click", () => {
      this.state.marketQuoteRows.push(this.plugin.createEmptyMarketQuoteRow());
      this.render();
    });
  }

  renderPortfolioTable(containerEl) {
    const section = containerEl.createDiv();
    section.createEl("h3", { text: "3. Portfolio Table" });
    section.createEl("p", {
      text: "This is the only table you must fill for a first analysis. Columns: symbol, assetType, quantity, marketPrice, targetWeight, avgPrice",
    });

    const table = section.createEl("table");
    const head = table.createEl("thead");
    const headRow = head.createEl("tr");
    for (const label of ["Symbol", "Asset Type", "Quantity", "Market Price", "Target Weight", "Avg Price", ""]) {
      headRow.createEl("th", { text: label });
    }

    const body = table.createEl("tbody");
    const rows = this.state.portfolioRows || [];
    rows.forEach((row, index) => {
      const tr = body.createEl("tr");
      this.createTextCell(tr, row, "symbol");
      this.createSelectCell(tr, row, "assetType", ["stock", "etf", "crypto", "cash", "other"]);
      this.createTextCell(tr, row, "quantity");
      this.createTextCell(tr, row, "marketPrice");
      this.createTextCell(tr, row, "targetWeight");
      this.createTextCell(tr, row, "avgPrice");
      const removeCell = tr.createEl("td");
      const removeButton = removeCell.createEl("button", { text: "Remove" });
      removeButton.addEventListener("click", () => {
        this.state.portfolioRows.splice(index, 1);
        if (!this.state.portfolioRows.length) this.state.portfolioRows.push(this.plugin.createEmptyPortfolioRow());
        this.render();
      });
    });

    const addButton = section.createEl("button", { text: "Add portfolio row" });
    addButton.addEventListener("click", () => {
      this.state.portfolioRows.push(this.plugin.createEmptyPortfolioRow());
      this.render();
    });
  }

  renderScenarioOverrideTable(containerEl) {
    const section = containerEl.createDiv();
    section.createEl("h3", { text: "4. Scenario Overrides (Advanced)" });
    section.createEl("p", { text: "Optional stress-test rules. Skip this for your first run." });

    const table = section.createEl("table");
    const head = table.createEl("thead");
    const headRow = head.createEl("tr");
    for (const label of ["Scenario", "Asset Type", "Return Shift", "Vol Multiplier", ""]) {
      headRow.createEl("th", { text: label });
    }

    const body = table.createEl("tbody");
    const rows = this.state.scenarioOverrideRows || [];
    rows.forEach((row, index) => {
      const tr = body.createEl("tr");
      this.createSelectCell(tr, row, "scenario", ["Bear", "Base", "Bull"]);
      this.createSelectCell(tr, row, "assetType", ["all", "stock", "etf", "crypto", "cash", "other"]);
      this.createTextCell(tr, row, "returnShift");
      this.createTextCell(tr, row, "volMultiplier");
      const removeCell = tr.createEl("td");
      const removeButton = removeCell.createEl("button", { text: "Remove" });
      removeButton.addEventListener("click", () => {
        this.state.scenarioOverrideRows.splice(index, 1);
        if (!this.state.scenarioOverrideRows.length) this.state.scenarioOverrideRows.push(this.plugin.createEmptyScenarioOverrideRow());
        this.render();
      });
    });

    const addButton = section.createEl("button", { text: "Add scenario override row" });
    addButton.addEventListener("click", () => {
      this.state.scenarioOverrideRows.push(this.plugin.createEmptyScenarioOverrideRow());
      this.render();
    });
  }

  createTextCell(tr, row, key) {
    const cell = tr.createEl("td");
    const input = cell.createEl("input", { type: "text" });
    input.value = String(row[key] ?? "");
    input.addEventListener("input", () => {
      row[key] = input.value;
    });
  }

  createSelectCell(tr, row, key, values) {
    const cell = tr.createEl("td");
    const select = cell.createEl("select");
    for (const value of values) {
      const option = select.createEl("option", { text: value });
      option.value = value;
      if (String(row[key] || "") === value) option.selected = true;
    }
    select.addEventListener("change", () => {
      row[key] = select.value;
    });
  }
}

module.exports = class InvestmentSimulatorPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("calculator", "INV: Start here - insert 3-minute note", () => {
      const editor = this.app.workspace.activeEditor?.editor;
      if (!editor) return new Notice("No active editor.");
      editor.replaceSelection(this.template());
    });

    this.addSettingTab(new InvSimSettingTab(this.app, this));

    this.addCommand({
      id: "invsim-insert-template",
      name: "INV: Start here - insert 3-minute note",
      editorCallback: (editor) => {
        editor.replaceSelection(this.template());
      },
    });

    this.addCommand({
      id: "invsim-open-guided-editor",
      name: "INV: Start here - open portfolio setup",
      editorCallback: (editor) => {
        this.openGuidedInputModal(editor);
      },
    });

    this.addCommand({
      id: "invsim-save-json-profile",
      name: "INV: Save portfolio draft (JSON profile)",
      editorCallback: async (editor) => {
        await this.saveJsonProfileFromEditor(editor);
      },
    });

    this.addCommand({
      id: "invsim-load-latest-json-profile",
      name: "INV: Load last saved portfolio draft",
      editorCallback: (editor) => {
        this.loadLatestJsonProfileToEditor(editor);
      },
    });

    this.addCommand({
      id: "invsim-run",
      name: "INV: Analyze current note",
      editorCallback: async (editor) => {
        const params = this.parse(editor.getValue());
        const blockingIssues = this.getBlockingValidationIssues(params.inputValidation, params.positions);
        if (blockingIssues.length) {
          new Notice(`Analysis blocked: fix required input fields first (${blockingIssues[0]})`);
          return;
        }

        if (Number(this.settings.enableLiveQuoteFetch) === 1) {
          params.marketQuotes = await this.hydrateMissingMarketQuotes(params.positions, params.marketQuotes);
        }

        const analysis = this.analyze(params);
        const report = this.renderReport(analysis);
        this.applyReportOutputToEditor(editor, analysis, report);

        if (analysis.auditLog?.integrityHash) {
          this.lastAuditIntegrityHash = analysis.auditLog.integrityHash;
          this.saveSettings().catch(() => {});
        }

        new Notice("Market intelligence report generated.");
      },
    });

    this.addCommand({
      id: "invsim-generate-daily-briefing",
      name: "INV: Advanced - generate daily briefing",
      editorCallback: async (editor) => {
        const params = this.parse(editor.getValue());
        const blockingIssues = this.getBlockingValidationIssues(params.inputValidation, params.positions);
        if (blockingIssues.length) {
          new Notice(`Briefing blocked: fix required input fields first (${blockingIssues[0]})`);
          return;
        }

        if (Number(this.settings.enableLiveQuoteFetch) === 1) {
          params.marketQuotes = await this.hydrateMissingMarketQuotes(params.positions, params.marketQuotes);
        }

        const analysis = this.analyze(params);
        const briefing = this.buildDailyBriefing(analysis);
        this.applyDailyBriefingToEditor(editor, analysis, briefing);
        new Notice("Daily portfolio briefing generated.");
      },
    });

    this.addCommand({
      id: "invsim-generate-omniforge-handoff",
      name: "INV: Advanced - generate Omniforge handoff",
      editorCallback: async (editor) => {
        const params = this.parse(editor.getValue());
        const blockingIssues = this.getBlockingValidationIssues(params.inputValidation, params.positions);
        if (blockingIssues.length) {
          new Notice(`Handoff blocked: fix required input fields first (${blockingIssues[0]})`);
          return;
        }

        if (Number(this.settings.enableLiveQuoteFetch) === 1) {
          params.marketQuotes = await this.hydrateMissingMarketQuotes(params.positions, params.marketQuotes);
        }

        const analysis = this.analyze(params);
        this.applyOmniforgeHandoffToEditor(editor, analysis);
        new Notice("Omniforge handoff bundle generated.");
      },
    });

    this.addCommand({
      id: "invsim-ocr-local-image-into-note",
      name: "INV: Advanced - OCR local image into note",
      editorCallback: async (editor) => {
        this.ingestLocalOcrImageToEditor(editor);
      },
    });

    this.addCommand({
      id: "invsim-export-csv-pack",
      name: "INV: Advanced - export CSV pack",
      editorCallback: async (editor) => {
        const params = this.parse(editor.getValue());
        const blockingIssues = this.getBlockingValidationIssues(params.inputValidation, params.positions);
        if (blockingIssues.length) {
          new Notice(`CSV export blocked: fix required input fields first (${blockingIssues[0]})`);
          return;
        }

        if (Number(this.settings.enableLiveQuoteFetch) === 1) {
          params.marketQuotes = await this.hydrateMissingMarketQuotes(params.positions, params.marketQuotes);
        }

        const analysis = this.analyze(params);
        this.applyCsvExportsToEditor(editor, analysis);
        new Notice("CSV export pack generated.");
      },
    });

    this.addCommand({
      id: "invsim-ingest-ocr-json",
      name: "INV: Advanced - ingest OCR JSON into portfolio",
      editorCallback: (editor) => {
        this.ingestOcrToEditor(editor);
      },
    });
  }

  async loadSettings() {
    const raw = Object.assign({}, await this.loadData());
    this.quoteCache = this.sanitizeQuoteCache(raw.__quoteCache || {});
    this.quoteHistory = this.sanitizeQuoteHistory(raw.__quoteHistory || {});
    this.lastAuditIntegrityHash = typeof raw.__lastAuditIntegrityHash === "string" ? raw.__lastAuditIntegrityHash : null;
    this.savedProfiles = this.sanitizeSavedProfiles(raw.__savedProfiles || []);
    this.lastLiveQuoteHydrationSummary = null;
    delete raw.__quoteCache;
    delete raw.__quoteHistory;
    delete raw.__lastAuditIntegrityHash;
    delete raw.__savedProfiles;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
  }

  async saveSettings() {
    await this.saveData({
      ...this.settings,
      __quoteCache: this.quoteCache,
      __quoteHistory: this.quoteHistory,
      __lastAuditIntegrityHash: this.lastAuditIntegrityHash,
      __savedProfiles: this.savedProfiles || [],
    });
  }

  openGuidedInputModal(editor) {
    if (!editor) {
      new Notice("No active editor.");
      return;
    }
    new InvSimGuidedInputModal(this.app, this, editor).open();
  }

  async saveJsonProfileFromEditor(editor) {
    if (!editor) {
      new Notice("No active editor.");
      return null;
    }
    const sourceText = editor.getValue();
    const draft = this.createGuidedInputDraft(sourceText);
    return this.saveJsonProfile(draft.profileName, draft, { sourceText });
  }

  loadLatestJsonProfileToEditor(editor) {
    if (!editor) {
      new Notice("No active editor.");
      return null;
    }

    const latest = (this.savedProfiles || [])[0];
    if (!latest) {
      new Notice("No saved JSON profile available.");
      return null;
    }

    this.applyGuidedInputDraft(editor, this.createDraftFromSavedProfile(latest));
    new Notice(`Loaded JSON profile: ${latest.name}`);
    return latest;
  }

  createGuidedInputDraft(text) {
    const parsed = this.parse(text || "");
    return {
      principal: parsed.principal,
      monthlyContribution: parsed.monthlyContribution,
      years: parsed.years,
      simulations: parsed.simulations,
      goalAmount: parsed.goalAmount,
      maxMdd: parsed.maxMdd,
      maxVolatility: parsed.maxVolatility,
      maxCryptoWeight: parsed.maxCryptoWeight,
      maxSingleAssetWeight: parsed.maxSingleAssetWeight,
      profileName: this.deriveProfileName(text),
      selectedProfileId: null,
      marketQuoteRows: this.marketQuotesToRows(parsed.marketQuotes),
      portfolioRows: this.portfolioPositionsToRows(parsed.positions),
      scenarioOverrideRows: this.scenarioOverridesToRows(parsed.scenarioOverrides),
    };
  }

  applyGuidedInputDraft(editor, draft) {
    const source = editor.getValue();
    const normalizedMarketQuoteRows = this.normalizeMarketQuoteRows(draft.marketQuoteRows || this.deserializeMarketQuotesText(draft.marketQuotesText));
    const normalizedPortfolioRows = this.normalizePortfolioRows(draft.portfolioRows || this.deserializePortfolioRowsText(draft.portfolioText));
    const normalizedScenarioOverrideRows = this.normalizeScenarioOverrideRows(
      draft.scenarioOverrideRows || this.deserializeScenarioOverrideRowsText(draft.scenarioOverridesText)
    );
    const normalizedDraft = {
      principal: this.fallbackNumber(draft.principal, this.settings.principal),
      monthlyContribution: this.fallbackNumber(draft.monthlyContribution, this.settings.monthlyContribution),
      years: this.fallbackNumber(draft.years, this.settings.years),
      simulations: this.fallbackNumber(draft.simulations, this.settings.simulations),
      goalAmount: this.fallbackNumber(draft.goalAmount, this.settings.goalAmount),
      maxMdd: this.fallbackNumber(draft.maxMdd, this.settings.maxMdd),
      maxVolatility: this.fallbackNumber(draft.maxVolatility, this.settings.maxVolatility),
      maxCryptoWeight: this.fallbackNumber(draft.maxCryptoWeight, this.settings.maxCryptoWeight),
      maxSingleAssetWeight: this.fallbackNumber(draft.maxSingleAssetWeight, this.settings.maxSingleAssetWeight),
      marketQuotesText: this.rowsToMarketQuotesText(normalizedMarketQuoteRows),
      portfolioText: this.rowsToPortfolioText(normalizedPortfolioRows),
      scenarioOverridesText: this.rowsToScenarioOverridesText(normalizedScenarioOverrideRows),
    };

    const paramsBody = [
      `principal: ${this.prettyNum(normalizedDraft.principal)}`,
      `monthlyContribution: ${this.prettyNum(normalizedDraft.monthlyContribution)}`,
      `years: ${this.prettyNum(normalizedDraft.years)}`,
      `simulations: ${this.prettyNum(normalizedDraft.simulations)}`,
      `goalAmount: ${this.prettyNum(normalizedDraft.goalAmount)}`,
      `maxMdd: ${this.prettyNum(normalizedDraft.maxMdd)}`,
      `maxVolatility: ${this.prettyNum(normalizedDraft.maxVolatility)}`,
      `maxCryptoWeight: ${this.prettyNum(normalizedDraft.maxCryptoWeight)}`,
      `maxSingleAssetWeight: ${this.prettyNum(normalizedDraft.maxSingleAssetWeight)}`,
    ].join("\n");

    let next = this.upsertSection(source, "Investment Params", paramsBody);
    next = this.upsertSection(next, "Market Quotes", normalizedDraft.marketQuotesText);
    next = this.upsertSection(next, "Portfolio", normalizedDraft.portfolioText);
    if (normalizedDraft.scenarioOverridesText || this.readSection(source, "Scenario Overrides")) {
      next = this.upsertSection(next, "Scenario Overrides", normalizedDraft.scenarioOverridesText || "");
    }
    editor.setValue(next);
    new Notice("Guided portfolio input applied to note.");
  }

  marketQuotesToRows(quotes) {
    const rows = Object.values(quotes || {})
      .sort((a, b) => String(a.symbol || "").localeCompare(String(b.symbol || "")))
      .map((quote) => ({
        symbol: String(quote.symbol || "").toUpperCase(),
        price: Number.isFinite(Number(quote.price)) ? this.prettyNum(quote.price) : "",
        currency: quote.currency || "USD",
        market: quote.market || "unknown",
        source: quote.source || "manual",
        asOf: quote.asOf || "",
      }));
    return rows.length ? rows : [this.createEmptyMarketQuoteRow()];
  }

  portfolioPositionsToRows(positions) {
    const rows = (positions || []).map((position) => ({
      symbol: position.symbol || position.symbolRaw || "",
      assetType: position.assetType || "other",
      quantity: Number.isFinite(Number(position.quantity)) ? this.prettyNum(position.quantity) : "",
      marketPrice: Number.isFinite(Number(position.marketPrice)) ? this.prettyNum(position.marketPrice) : "",
      targetWeight: Number.isFinite(Number(position.targetWeight)) ? this.prettyNum(position.targetWeight) : "",
      avgPrice: Number.isFinite(Number(position.avgPrice)) ? this.prettyNum(position.avgPrice) : "",
    }));
    return rows.length ? rows : [this.createEmptyPortfolioRow()];
  }

  createEmptyMarketQuoteRow() {
    return {
      symbol: "",
      price: "",
      currency: "USD",
      market: "stock",
      source: "manual",
      asOf: "",
    };
  }

  createEmptyPortfolioRow() {
    return {
      symbol: "",
      assetType: "stock",
      quantity: "",
      marketPrice: "",
      targetWeight: "",
      avgPrice: "",
    };
  }

  createEmptyScenarioOverrideRow() {
    return {
      scenario: "Base",
      assetType: "all",
      returnShift: "",
      volMultiplier: "",
    };
  }

  serializeMarketQuotes(quotes) {
    return this.rowsToMarketQuotesText(this.marketQuotesToRows(quotes));
  }

  serializePortfolioRows(positions) {
    return this.rowsToPortfolioText(this.portfolioPositionsToRows(positions));
  }

  scenarioOverridesToRows(rows) {
    const normalized = this.normalizeScenarioOverrideRows(rows);
    return normalized.length ? normalized : [this.createEmptyScenarioOverrideRow()];
  }

  normalizeSectionListText(text) {
    return String(text || "")
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .map((line) => (line.startsWith("-") ? line : `- ${line}`))
      .join("\n");
  }

  normalizeMarketQuoteRows(rows) {
    const out = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        symbol: String(row?.symbol || "").trim().toUpperCase(),
        price: String(row?.price || "").trim(),
        currency: String(row?.currency || "USD").trim() || "USD",
        market: String(row?.market || "stock").trim() || "stock",
        source: String(row?.source || "manual").trim() || "manual",
        asOf: String(row?.asOf || "").trim(),
      }))
      .filter((row) => this.rowHasAnyValue(row, ["symbol", "price", "currency", "market", "source", "asOf"]));
    return out.length ? out : [this.createEmptyMarketQuoteRow()];
  }

  normalizePortfolioRows(rows) {
    const out = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        symbol: String(row?.symbol || "").trim().toUpperCase(),
        assetType: String(row?.assetType || "stock").trim().toLowerCase() || "stock",
        quantity: String(row?.quantity || "").trim(),
        marketPrice: String(row?.marketPrice || "").trim(),
        targetWeight: String(row?.targetWeight || "").trim(),
        avgPrice: String(row?.avgPrice || "").trim(),
      }))
      .filter((row) => this.rowHasAnyValue(row, ["symbol", "quantity", "marketPrice", "targetWeight", "avgPrice"]));
    return out.length ? out : [this.createEmptyPortfolioRow()];
  }

  normalizeScenarioOverrideRows(rows) {
    const out = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        scenario: this.normalizeScenarioKey(row?.scenario),
        assetType: this.normalizeScenarioAssetType(row?.assetType),
        returnShift: String(row?.returnShift || "").trim(),
        volMultiplier: String(row?.volMultiplier || "").trim(),
      }))
      .filter((row) => this.rowHasAnyValue(row, ["returnShift", "volMultiplier"]));
    return out.length ? out : [this.createEmptyScenarioOverrideRow()];
  }

  rowsToMarketQuotesText(rows) {
    return this.normalizeMarketQuoteRows(rows)
      .filter((row) => this.rowHasAnyValue(row, ["symbol", "price", "currency", "market", "source", "asOf"]))
      .map((row) => {
        const fields = [row.symbol, row.price, row.currency, row.market, row.source];
        if (row.asOf) fields.push(row.asOf);
        return `- ${fields.join(",")}`;
      })
      .join("\n");
  }

  rowsToPortfolioText(rows) {
    return this.normalizePortfolioRows(rows)
      .filter((row) => this.rowHasAnyValue(row, ["symbol", "quantity", "marketPrice", "targetWeight", "avgPrice"]))
      .map((row) => {
        const fields = [row.symbol, row.assetType, row.quantity, row.marketPrice, row.targetWeight];
        if (row.avgPrice) fields.push(row.avgPrice);
        return `- ${fields.join(",")}`;
      })
      .join("\n");
  }

  rowsToScenarioOverridesText(rows) {
    return this.normalizeScenarioOverrideRows(rows)
      .filter((row) => this.rowHasAnyValue(row, ["returnShift", "volMultiplier"]))
      .map((row) => `- ${[row.scenario, row.assetType, row.returnShift, row.volMultiplier].join(",")}`)
      .join("\n");
  }

  deserializeMarketQuotesText(text) {
    const lines = this.normalizeSectionListText(text)
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(/^-+\s*/, ""));
    const rows = lines.map((line) => {
      const [symbol, price, currency, market, source, asOf] = line.split(",").map((value) => String(value || "").trim());
      return { symbol, price, currency, market, source, asOf };
    });
    return this.normalizeMarketQuoteRows(rows);
  }

  deserializePortfolioRowsText(text) {
    const lines = this.normalizeSectionListText(text)
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(/^-+\s*/, ""));
    const rows = lines.map((line) => {
      const [symbol, assetType, quantity, marketPrice, targetWeight, avgPrice] = line.split(",").map((value) => String(value || "").trim());
      return { symbol, assetType, quantity, marketPrice, targetWeight, avgPrice };
    });
    return this.normalizePortfolioRows(rows);
  }

  deserializeScenarioOverrideRowsText(text) {
    const lines = this.normalizeSectionListText(text)
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(/^-+\s*/, ""));
    const rows = lines.map((line) => {
      const [scenario, assetType, returnShift, volMultiplier] = line.split(",").map((value) => String(value || "").trim());
      return { scenario, assetType, returnShift, volMultiplier };
    });
    return this.normalizeScenarioOverrideRows(rows);
  }

  rowHasAnyValue(row, keys) {
    return (keys || []).some((key) => String(row?.[key] || "").trim() !== "");
  }

  deriveProfileName(text) {
    const headingMatch = String(text || "").match(/^#\s+(.+)$/m);
    if (headingMatch) {
      const heading = String(headingMatch[1] || "").trim();
      if (heading) return heading;
    }
    return `Portfolio Profile ${this.buildReportId(new Date().toISOString())}`;
  }

  sanitizeSavedProfiles(rawProfiles) {
    return (Array.isArray(rawProfiles) ? rawProfiles : [])
      .map((profile) => this.normalizeSavedProfile(profile))
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.savedAt || 0) - Date.parse(a.savedAt || 0))
      .slice(0, SAVED_PROFILE_LIMIT);
  }

  normalizeSavedProfile(profile) {
    const id = String(profile?.id || "").trim();
    const name = String(profile?.name || "").trim();
    if (!id || !name) return null;

    const payload = profile?.payload || {};
    return {
      version: Number(profile?.version) || 1,
      id,
      name,
      savedAt: profile?.savedAt || new Date().toISOString(),
      payload: {
        params: {
          principal: this.fallbackNumber(payload?.params?.principal, this.settings?.principal || DEFAULT_SETTINGS.principal),
          monthlyContribution: this.fallbackNumber(payload?.params?.monthlyContribution, this.settings?.monthlyContribution || DEFAULT_SETTINGS.monthlyContribution),
          years: this.fallbackNumber(payload?.params?.years, this.settings?.years || DEFAULT_SETTINGS.years),
          simulations: this.fallbackNumber(payload?.params?.simulations, this.settings?.simulations || DEFAULT_SETTINGS.simulations),
          goalAmount: this.fallbackNumber(payload?.params?.goalAmount, this.settings?.goalAmount || DEFAULT_SETTINGS.goalAmount),
          maxMdd: this.fallbackNumber(payload?.params?.maxMdd, this.settings?.maxMdd || DEFAULT_SETTINGS.maxMdd),
          maxVolatility: this.fallbackNumber(payload?.params?.maxVolatility, this.settings?.maxVolatility || DEFAULT_SETTINGS.maxVolatility),
          maxCryptoWeight: this.fallbackNumber(payload?.params?.maxCryptoWeight, this.settings?.maxCryptoWeight || DEFAULT_SETTINGS.maxCryptoWeight),
          maxSingleAssetWeight: this.fallbackNumber(payload?.params?.maxSingleAssetWeight, this.settings?.maxSingleAssetWeight || DEFAULT_SETTINGS.maxSingleAssetWeight),
        },
        marketQuoteRows: this.normalizeMarketQuoteRows(payload?.marketQuoteRows),
        portfolioRows: this.normalizePortfolioRows(payload?.portfolioRows),
        scenarioOverrideRows: this.normalizeScenarioOverrideRows(payload?.scenarioOverrideRows),
      },
    };
  }

  buildSavedProfilePayload(draft) {
    return {
      params: {
        principal: this.fallbackNumber(draft?.principal, this.settings.principal),
        monthlyContribution: this.fallbackNumber(draft?.monthlyContribution, this.settings.monthlyContribution),
        years: this.fallbackNumber(draft?.years, this.settings.years),
        simulations: this.fallbackNumber(draft?.simulations, this.settings.simulations),
        goalAmount: this.fallbackNumber(draft?.goalAmount, this.settings.goalAmount),
        maxMdd: this.fallbackNumber(draft?.maxMdd, this.settings.maxMdd),
        maxVolatility: this.fallbackNumber(draft?.maxVolatility, this.settings.maxVolatility),
        maxCryptoWeight: this.fallbackNumber(draft?.maxCryptoWeight, this.settings.maxCryptoWeight),
        maxSingleAssetWeight: this.fallbackNumber(draft?.maxSingleAssetWeight, this.settings.maxSingleAssetWeight),
      },
      marketQuoteRows: this.normalizeMarketQuoteRows(draft?.marketQuoteRows || this.deserializeMarketQuotesText(draft?.marketQuotesText)),
      portfolioRows: this.normalizePortfolioRows(draft?.portfolioRows || this.deserializePortfolioRowsText(draft?.portfolioText)),
      scenarioOverrideRows: this.normalizeScenarioOverrideRows(
        draft?.scenarioOverrideRows || this.deserializeScenarioOverrideRowsText(draft?.scenarioOverridesText)
      ),
    };
  }

  createDraftFromSavedProfile(profile) {
    const normalized = this.normalizeSavedProfile(profile);
    if (!normalized) return this.createGuidedInputDraft("");
    return {
      ...normalized.payload.params,
      profileName: normalized.name,
      selectedProfileId: normalized.id,
      marketQuoteRows: this.normalizeMarketQuoteRows(normalized.payload.marketQuoteRows),
      portfolioRows: this.normalizePortfolioRows(normalized.payload.portfolioRows),
      scenarioOverrideRows: this.normalizeScenarioOverrideRows(normalized.payload.scenarioOverrideRows),
    };
  }

  getSavedProfileById(profileId) {
    const id = String(profileId || "").trim();
    return (this.savedProfiles || []).find((profile) => profile.id === id) || null;
  }

  async saveJsonProfile(profileName, draft, options = {}) {
    const name = String(profileName || draft?.profileName || "").trim() || this.deriveProfileName("");
    const nowIso = new Date().toISOString();
    const existing = (this.savedProfiles || []).find((profile) => profile.name === name);
    let payload = this.buildSavedProfilePayload(draft || {});
    if (existing) {
      payload = this.mergeSavedProfilePayload(existing.payload, payload, options.sourceText);
    }
    const profile = {
      version: 1,
      id: existing?.id || `profile-${this.buildReportId(nowIso)}`,
      name,
      savedAt: nowIso,
      payload,
    };

    const others = (this.savedProfiles || []).filter((item) => item.id !== profile.id);
    this.savedProfiles = this.sanitizeSavedProfiles([profile, ...others]);
    await this.saveSettings();
    new Notice(`Saved JSON profile: ${profile.name}`);
    return profile;
  }

  async deleteJsonProfile(profileId) {
    const before = (this.savedProfiles || []).length;
    this.savedProfiles = (this.savedProfiles || []).filter((profile) => profile.id !== profileId);
    if (this.savedProfiles.length !== before) {
      await this.saveSettings();
      new Notice("Saved JSON profile deleted.");
    }
  }

  mergeSavedProfilePayload(previousPayload, nextPayload, sourceText) {
    const source = String(sourceText || "");
    const hasParamsSection = Boolean(this.readSection(source, "Investment Params"));
    const hasQuotesSection = Boolean(this.readSection(source, "Market Quotes"));
    const hasPortfolioSection = Boolean(this.readSection(source, "Portfolio"));
    const hasScenarioSection = Boolean(this.readSection(source, "Scenario Overrides"));

    return {
      params: hasParamsSection ? nextPayload.params : previousPayload?.params || nextPayload.params,
      marketQuoteRows: hasQuotesSection ? nextPayload.marketQuoteRows : previousPayload?.marketQuoteRows || nextPayload.marketQuoteRows,
      portfolioRows: hasPortfolioSection ? nextPayload.portfolioRows : previousPayload?.portfolioRows || nextPayload.portfolioRows,
      scenarioOverrideRows: hasScenarioSection
        ? nextPayload.scenarioOverrideRows
        : previousPayload?.scenarioOverrideRows || nextPayload.scenarioOverrideRows,
    };
  }

  template() {
    const s = this.settings;
    return `# Investment Simulator Quick Start Note

This note is designed for a first analysis inside Obsidian.

## Start Here
1. Open Command Palette with \`Ctrl+P\` or \`Cmd+P\`.
2. Run \`INV: Start here - open portfolio setup\` if you prefer forms, or edit the sections below directly.
3. For a first run, only \`## Investment Params\` and \`## Portfolio\` matter.
4. Run \`INV: Analyze current note\`.
5. After the report appears, read \`Read This First\` and \`Execution Priority and Next Actions\` first.

## First-Run Rules
- It is okay to type the current price directly in the \`Portfolio\` table.
- \`Market Quotes\` are optional for the first run.
- \`OCR JSON\`, \`League Standings\`, \`Scenario Overrides\`, \`CSV Exports\`, and \`Omniforge\` are advanced features.
- If the report says \`STALE\` or \`UNKNOWN\`, treat the result as a planning draft until prices are refreshed.

## Investment Params
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
Optional. Leave this empty for the first run if you already typed marketPrice in Portfolio.

## Portfolio
- AAPL,stock,12,190,25,150
- QQQ,etf,8,430,25,400
- BTC,crypto,0.18,90000,20
- KRW,cash,5000000,1,30

## What To Look For After Running
- \`Goal Probability\`: higher is better.
- \`Est MDD\`: lower is safer.
- \`Read This First\`: the shortest plain-language summary.
- \`Plan A/B/C\`: three ways to rebalance.

## Advanced Features (Later)
- OCR: see \`docs/ADVANCED_FEATURES_KR.md\`
- Scenario overrides: use the advanced template from \`docs/templates/ADVANCED_NOTE_TEMPLATE.md\`
- League input: add \`## League Standings\` or \`## Results\` later if you want plan scoring to react to external league results.
- CSV export / Omniforge / JSON profile save-load: optional extensions after the first analysis.

## Notes
- This plugin is not investment advice.
- Final decisions and responsibility stay with the user.
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

    const portfolioParsed = this.parsePortfolioSectionDetailed(text);
    out.positions = portfolioParsed.positions;
    out.inputValidation = portfolioParsed.issues;
    out.marketQuotes = this.parseMarketQuotesSection(text);
    out.scenarioOverrides = this.parseScenarioOverrideSection(text);
    out.leagueContext = this.parseLeagueContext(text);
    out.previousAuditIntegrityHash = this.extractPreviousAuditIntegrityHash(text) || this.lastAuditIntegrityHash || null;
    return out;
  }

  parsePortfolioSection(text) {
    return this.parsePortfolioSectionDetailed(text).positions;
  }

  parsePortfolioSectionDetailed(text) {
    const section = this.readSection(text, "Portfolio");
    if (!section) return { positions: [], issues: [] };

    const positions = [];
    const issues = [];
    for (const [index, rawLine] of section.split("\n").entries()) {
      const line = rawLine.trim();
      if (!line.startsWith("-")) continue;

      const row = line.replace(/^-+\s*/, "");
      const [symbolRaw, assetTypeRaw, quantityRaw, priceRaw, targetWeightRaw, avgPriceRaw] = row
        .split(",")
        .map((x) => String(x || "").trim());
      const lineNo = index + 1;
      if (!symbolRaw) {
        issues.push(`Portfolio line ${lineNo}: missing required field 'symbol'.`);
        continue;
      }

      const quantity = this.toNumber(quantityRaw);
      if (!(quantity > 0)) {
        issues.push(`Portfolio line ${lineNo} (${symbolRaw}): quantity must be a positive number.`);
        continue;
      }

      if (!assetTypeRaw) {
        issues.push(`Portfolio line ${lineNo} (${symbolRaw}): missing required field 'assetType'.`);
      }

      const assetType = this.normalizeAssetType(assetTypeRaw);
      if (assetType === "other" && assetTypeRaw && assetTypeRaw.toLowerCase() !== "other") {
        issues.push(`Portfolio line ${lineNo} (${symbolRaw}): unknown assetType '${assetTypeRaw}' normalized to 'other'.`);
      }

      const marketPrice = this.toNumber(priceRaw);
      if (priceRaw && !Number.isFinite(marketPrice)) {
        issues.push(`Portfolio line ${lineNo} (${symbolRaw}): marketPrice parse failed ('${priceRaw}').`);
      }

      const targetWeight = this.toNumber(targetWeightRaw);
      if (targetWeightRaw && !Number.isFinite(targetWeight)) {
        issues.push(`Portfolio line ${lineNo} (${symbolRaw}): targetWeight parse failed ('${targetWeightRaw}').`);
      }

      const avgPrice = this.toNumber(avgPriceRaw);
      if (avgPriceRaw && !Number.isFinite(avgPrice)) {
        issues.push(`Portfolio line ${lineNo} (${symbolRaw}): avgPrice parse failed ('${avgPriceRaw}').`);
      }

      positions.push({
        symbolRaw,
        symbol: symbolRaw.toUpperCase(),
        assetType,
        quantity,
        marketPrice: Number.isFinite(marketPrice) ? marketPrice : null,
        targetWeight: Number.isFinite(targetWeight) ? targetWeight : null,
        avgPrice: Number.isFinite(avgPrice) ? avgPrice : null,
      });
    }

    return { positions, issues };
  }

  getBlockingValidationIssues(inputValidation, positions) {
    const issues = Array.isArray(inputValidation) ? inputValidation : [];
    const blockedByRules = issues.filter((issue) =>
      /missing required field|quantity must be a positive number/i.test(String(issue || ""))
    );

    if (blockedByRules.length) return blockedByRules;
    if (!Array.isArray(positions) || positions.length === 0) {
      return ["No valid portfolio positions available."];
    }

    return [];
  }

  parseScenarioOverrideSection(text) {
    const section = this.readSection(text, "Scenario Overrides");
    if (!section) return [];

    const rows = [];
    for (const rawLine of section.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("-")) continue;
      const [scenarioRaw, assetTypeRaw, returnShiftRaw, volMultiplierRaw] = line
        .replace(/^-+\s*/, "")
        .split(",")
        .map((value) => String(value || "").trim());
      const returnShift = this.toNumber(returnShiftRaw);
      const volMultiplier = this.toNumber(volMultiplierRaw);
      if (!Number.isFinite(returnShift) && !Number.isFinite(volMultiplier)) continue;
      rows.push({
        scenario: this.normalizeScenarioKey(scenarioRaw),
        assetType: this.normalizeScenarioAssetType(assetTypeRaw),
        returnShift: Number.isFinite(returnShift) ? returnShift : null,
        volMultiplier: Number.isFinite(volMultiplier) ? volMultiplier : null,
      });
    }

    return rows;
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
        market: this.normalizeMarketLabel(marketRaw || "unknown"),
        source: sourceRaw || "manual",
        asOf: asOfRaw || nowIso,
      };
    }

    this.updateQuoteCache(quotes);
    return quotes;
  }

  extractPreviousAuditIntegrityHash(text) {
    const section = this.readSection(text, "Audit Log (Minimal Schema)");
    if (!section) return null;

    const match = section.match(/-\s*Integrity Hash\s*:\s*([^\n]+)/i);
    if (!match) return null;

    const hash = String(match[1] || "").trim();
    return hash || null;
  }

  extractAuditIntegrityHash(text) {
    const match = String(text || "").match(/-\s*Integrity Hash\s*:\s*([^\n]+)/i);
    if (!match) return null;
    const hash = String(match[1] || "").trim();
    return hash || null;
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

  analyze(params) {
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
      portfolio,
      baseSimulation,
      leagueContext: params.leagueContext,
    });

    const warnings = this.buildWarnings({
      params,
      portfolio,
      goalProbability: baseSimulation.goalProbability,
      leagueContext: params.leagueContext,
    });

    const auditLog = this.buildAuditLog({
      params,
      portfolio,
      principal,
      assumptions: blended,
      simulation: baseSimulation,
      recommendations,
      warnings,
      leagueContext: params.leagueContext,
    });

    return {
      params,
      portfolio,
      principal,
      assumptions: blended,
      simulation: baseSimulation,
      recommendations,
      warnings,
      leagueContext: params.leagueContext,
      auditLog,
    };
  }

  run(params) {
    return this.renderReport(this.analyze(params));
  }

  applyReportOutputToEditor(editor, analysis, report) {
    if (!editor?.setValue || !editor?.getValue) return null;

    const source = editor.getValue();
    const historyEntry = this.buildReportHistoryEntry(analysis);
    const existingHistory = this.parseReportHistorySection(source);
    const mergedHistory = this.mergeTimelineEntries(existingHistory, historyEntry, "reportId", 30);
    const leagueHistoryEntry = this.buildStrategyLeagueHistoryEntry(analysis);
    const existingLeagueHistory = this.parseStrategyLeagueHistorySection(source);
    const mergedLeagueHistory = this.mergeTimelineEntries(existingLeagueHistory, leagueHistoryEntry, "reportId", 30);
    const nestedReport = this.shiftMarkdownHeadingDepth(report, 2);

    let next = source;
    next = this.upsertSection(next, "Latest Report", nestedReport);
    next = this.upsertSection(next, "Report History", this.buildReportHistorySectionBody(mergedHistory));
    next = this.upsertSection(next, "Strategy League History", this.buildStrategyLeagueHistorySectionBody(mergedLeagueHistory));
    editor.setValue(next);
    return historyEntry;
  }

  buildReportHistoryEntry(analysis) {
    const generatedAt = analysis?.auditLog?.generatedAt || new Date().toISOString();
    const topPlan = analysis?.recommendations?.find((plan) => plan.isTopRecommendation) || analysis?.recommendations?.[0] || null;
    const freshness = this.buildFreshnessMeta(analysis?.portfolio?.marketContext, generatedAt);
    return {
      reportId: this.buildReportId(generatedAt),
      generatedAt,
      topPlan: topPlan?.key || "n/a",
      topScore: Number(topPlan?.score) || 0,
      goalProbability: Number(topPlan?.simulation?.goalProbability) || 0,
      estimatedMdd: Number(topPlan?.simulation?.estimatedMdd) || 0,
      freshnessStatus: freshness.status || "UNKNOWN",
      auditHash: String(analysis?.auditLog?.integrityHash || "n/a"),
    };
  }

  parseReportHistorySection(text) {
    const section = this.readSection(text, "Report History");
    if (!section) return [];

    const entries = [];
    for (const rawLine of section.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("|")) continue;
      if (/^[\|\-:\s]+$/.test(line)) continue;

      const cells = line
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
      if (cells.length < 8) continue;
      if (/^Report ID$/i.test(cells[0])) continue;

      entries.push({
        reportId: cells[0],
        generatedAt: cells[1],
        topPlan: cells[2],
        topScore: this.toNumber(cells[3]),
        goalProbability: this.toNumber(String(cells[4]).replace(/%/g, "")),
        estimatedMdd: this.toNumber(String(cells[5]).replace(/%/g, "")),
        freshnessStatus: cells[6],
        auditHash: cells[7],
      });
    }

    return entries;
  }

  buildReportHistorySectionBody(entries) {
    const rows = Array.isArray(entries) ? entries : [];
    if (!rows.length) return "_No report snapshots saved yet._";

    return [
      "| Report ID | Generated At | Top Plan | Score | Goal Prob | Est MDD | Freshness | Audit Hash |",
      "|---|---|---|---:|---:|---:|---|---|",
      ...rows.map((entry) => {
        return `| ${entry.reportId} | ${entry.generatedAt} | ${entry.topPlan} | ${(Number(entry.topScore) || 0).toFixed(1)} | ${this.formatPct(
          entry.goalProbability
        )} | ${this.formatPct(entry.estimatedMdd)} | ${entry.freshnessStatus || "UNKNOWN"} | ${entry.auditHash || "n/a"} |`;
      }),
    ].join("\n");
  }

  buildStrategyLeagueHistoryEntry(analysis) {
    const generatedAt = analysis?.auditLog?.generatedAt || new Date().toISOString();
    const leagueView = this.buildStrategyLeagueScoreboard(analysis?.recommendations || []);
    const winner = leagueView.entries?.[0] || null;
    return {
      reportId: this.buildReportId(generatedAt),
      generatedAt,
      winnerPlan: winner?.key || "n/a",
      leagueScore: Number(winner?.leagueScore) || 0,
      edge: winner?.edgeNote || "n/a",
    };
  }

  parseStrategyLeagueHistorySection(text) {
    const section = this.readSection(text, "Strategy League History");
    if (!section) return [];

    const entries = [];
    for (const rawLine of section.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("|")) continue;
      if (/^[\|\-:\s]+$/.test(line)) continue;

      const cells = line
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
      if (cells.length < 5) continue;
      if (/^Report ID$/i.test(cells[0])) continue;

      entries.push({
        reportId: cells[0],
        generatedAt: cells[1],
        winnerPlan: cells[2],
        leagueScore: this.toNumber(cells[3]),
        edge: cells[4],
      });
    }

    return entries;
  }

  buildStrategyLeagueHistorySectionBody(entries) {
    const rows = Array.isArray(entries) ? entries : [];
    if (!rows.length) return "_No strategy league snapshots saved yet._";

    return [
      "| Report ID | Generated At | Winner Plan | League Score | Edge |",
      "|---|---|---|---:|---|",
      ...rows.map((entry) => {
        return `| ${entry.reportId} | ${entry.generatedAt} | ${entry.winnerPlan} | ${(Number(entry.leagueScore) || 0).toFixed(1)} | ${entry.edge || "n/a"} |`;
      }),
    ].join("\n");
  }

  buildDailyBriefing(analysis) {
    const generatedAt = analysis?.auditLog?.generatedAt || new Date().toISOString();
    const briefingId = `BRF-${this.buildReportId(generatedAt).replace(/^RPT-/, "")}`;
    const topPlan = analysis?.recommendations?.find((plan) => plan.isTopRecommendation) || analysis?.recommendations?.[0] || null;
    const freshnessMeta = this.buildFreshnessMeta(analysis?.portfolio?.marketContext, generatedAt);
    const diagnoses = this.buildKeyDiagnoses({
      portfolio: analysis?.portfolio,
      simulation: analysis?.simulation,
      freshnessMeta,
      warnings: analysis?.warnings || [],
      params: analysis?.params,
      topPlan,
    });
    const actionPlan = this.buildActionPlan({
      recommendations: analysis?.recommendations || [],
      warnings: analysis?.warnings || [],
      freshnessMeta,
      portfolio: analysis?.portfolio,
      params: analysis?.params,
    });
    const tickerCards = this.buildTickerAnalysisCards({
      portfolio: analysis?.portfolio,
      params: analysis?.params,
      runAt: generatedAt,
    });
    const watchlist = this.buildDailyBriefingWatchlist(tickerCards);
    const leagueView = this.buildStrategyLeagueScoreboard(analysis?.recommendations || []);
    const leagueLeader = leagueView.entries?.[0] || null;

    return [
      `- briefingId: ${briefingId}`,
      `- generatedAt: ${this.formatTimestamp(generatedAt)}`,
      `- oneLineConclusion: Plan ${topPlan?.key || "A"} is currently the highest-ranked baseline. Execute only after confirming ${freshnessMeta.status.toLowerCase()} data status.`,
      `- dataStatus: ${freshnessMeta.status} / ${freshnessMeta.latencyLabel}`,
      `- leagueLeader: ${leagueLeader ? `Plan ${leagueLeader.key} (${leagueLeader.leagueScore.toFixed(1)})` : "n/a"}`,
      `- externalHeadlineFeed: not-configured (this briefing is portfolio/quote driven only)`,
      "",
      "### Focus Now",
      `1. ${actionPlan.immediate}`,
      `2. ${diagnoses[0]}`,
      `3. ${diagnoses[1]}`,
      "",
      "### Risk Watch",
      ...(analysis?.warnings?.slice(0, 5).map((warning, index) => `${index + 1}. ${warning}`) || ["1. No warnings available."]),
      "",
      "### Watchlist",
      ...watchlist.map((line) => `- ${line}`),
      "",
      "### Next Steps",
      `1. ${actionPlan.month}`,
      `2. ${actionPlan.quarter}`,
      "3. Re-check OCR reviewed fields and quote freshness before placing trades.",
    ].join("\n");
  }

  buildDailyBriefingWatchlist(cards) {
    const list = Array.isArray(cards) ? cards : [];
    const stale = list.filter((card) => card.quoteStatus === "STALE").slice(0, 2);
    const overweight = list
      .filter((card) => Number.isFinite(card.targetGap) && card.targetGap > 5)
      .sort((a, b) => b.targetGap - a.targetGap)
      .slice(0, 2);
    const underweight = list
      .filter((card) => Number.isFinite(card.targetGap) && card.targetGap < -5)
      .sort((a, b) => a.targetGap - b.targetGap)
      .slice(0, 2);

    const lines = [];
    for (const card of stale) {
      lines.push(`${card.symbol}: quote is stale, refresh before using ${card.market || card.assetType} price for execution.`);
    }
    for (const card of overweight) {
      lines.push(`${card.symbol}: overweight by ${this.formatPct(Math.abs(card.targetGap))}, candidate trim if Plan ${card.targetGap > 0 ? "A/B" : "C"} stays selected.`);
    }
    for (const card of underweight) {
      lines.push(`${card.symbol}: under target by ${this.formatPct(Math.abs(card.targetGap))}, review for staged add using fresh quotes.`);
    }

    return lines.length ? [...new Set(lines)].slice(0, 5) : ["No urgent symbol watch item. Keep monitoring quote freshness and concentration."];
  }

  applyDailyBriefingToEditor(editor, analysis, briefing) {
    if (!editor?.setValue || !editor?.getValue) return null;

    const source = editor.getValue();
    const historyEntry = this.buildDailyBriefingHistoryEntry(analysis);
    const existingHistory = this.parseDailyBriefingHistorySection(source);
    const mergedHistory = this.mergeTimelineEntries(existingHistory, historyEntry, "briefingId", 30);

    let next = source;
    next = this.upsertSection(next, "Daily Briefing", briefing);
    next = this.upsertSection(next, "Daily Briefing History", this.buildDailyBriefingHistorySectionBody(mergedHistory));
    editor.setValue(next);
    return historyEntry;
  }

  buildDailyBriefingHistoryEntry(analysis) {
    const generatedAt = analysis?.auditLog?.generatedAt || new Date().toISOString();
    const topPlan = analysis?.recommendations?.find((plan) => plan.isTopRecommendation) || analysis?.recommendations?.[0] || null;
    const freshness = this.buildFreshnessMeta(analysis?.portfolio?.marketContext, generatedAt);
    return {
      briefingId: `BRF-${this.buildReportId(generatedAt).replace(/^RPT-/, "")}`,
      generatedAt,
      topPlan: topPlan?.key || "n/a",
      freshnessStatus: freshness.status || "UNKNOWN",
      summary: `Goal ${this.formatPct(topPlan?.simulation?.goalProbability)} / MDD ${this.formatPct(topPlan?.simulation?.estimatedMdd)}`,
    };
  }

  parseDailyBriefingHistorySection(text) {
    const section = this.readSection(text, "Daily Briefing History");
    if (!section) return [];

    const entries = [];
    for (const rawLine of section.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("|")) continue;
      if (/^[\|\-:\s]+$/.test(line)) continue;

      const cells = line
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
      if (cells.length < 5) continue;
      if (/^Briefing ID$/i.test(cells[0])) continue;

      entries.push({
        briefingId: cells[0],
        generatedAt: cells[1],
        topPlan: cells[2],
        freshnessStatus: cells[3],
        summary: cells[4],
      });
    }

    return entries;
  }

  buildDailyBriefingHistorySectionBody(entries) {
    const rows = Array.isArray(entries) ? entries : [];
    if (!rows.length) return "_No daily briefings saved yet._";

    return [
      "| Briefing ID | Generated At | Top Plan | Freshness | Summary |",
      "|---|---|---|---|---|",
      ...rows.map((entry) => {
        return `| ${entry.briefingId} | ${entry.generatedAt} | ${entry.topPlan} | ${entry.freshnessStatus} | ${entry.summary} |`;
      }),
    ].join("\n");
  }

  mergeTimelineEntries(existingEntries, nextEntry, idKey, maxEntries = 30) {
    const key = String(idKey || "id");
    const out = [];

    if (nextEntry && nextEntry[key]) {
      out.push(nextEntry);
    }

    for (const entry of Array.isArray(existingEntries) ? existingEntries : []) {
      if (!entry || !entry[key]) continue;
      if (out.some((candidate) => String(candidate[key]) === String(entry[key]))) continue;
      out.push(entry);
    }

    return out
      .slice()
      .sort((a, b) => Date.parse(b.generatedAt || 0) - Date.parse(a.generatedAt || 0))
      .slice(0, maxEntries);
  }

  ingestLocalOcrImageToEditor(editor) {
    const text = editor?.getValue?.() || "";
    const captureInput = this.parseOcrCaptureInputSection(text);
    if (!captureInput?.path) {
      new Notice("No valid OCR image path found. Add it under '## OCR Capture Input'.");
      return null;
    }

    try {
      const bridgeResult = this.runLocalOcrBridge(captureInput);
      const normalized = this.normalizeOcrPayload(bridgeResult.payload);
      const next = this.applyNormalizedOcrPayloadToText(text, normalized, {
        rawText: bridgeResult.rawText,
        captureInput,
      });
      editor.setValue(next);
      new Notice(
        `Local OCR complete: ${normalized.portfolioPositions.length} positions applied, ${normalized.manualReviewCount} flagged for review.`
      );
      return normalized;
    } catch (error) {
      new Notice(`Local OCR failed: ${error.message || error}`);
      return null;
    }
  }

  parseOcrCaptureInputSection(text) {
    const section = this.readSection(text, "OCR Capture Input");
    if (!section) return null;

    const data = {
      path: "",
      platform: "",
      capturedAt: "",
      timezone: "",
      broker: "",
      accountMask: "",
      currency: "",
      lang: "",
      psm: "",
    };

    for (const rawLine of section.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;

      const keyValueMatch = line.match(/^-?\s*([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
      if (keyValueMatch) {
        const key = String(keyValueMatch[1] || "").trim();
        if (!(key in data)) continue;
        data[key] = this.extractOcrCapturePath(String(keyValueMatch[2] || "").trim());
        continue;
      }

      if (!data.path) {
        data.path = this.extractOcrCapturePath(line);
      }
    }

    if (!data.path) return null;
    return data;
  }

  extractOcrCapturePath(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";

    const wiki = text.match(/^!?\[\[([^\]]+)\]\]$/);
    if (wiki) return wiki[1].trim();
    const md = text.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
    if (md) return md[1].trim();
    return text;
  }

  runLocalOcrBridge(captureInput) {
    const rawText = this.executeLocalOcrCommand(captureInput);
    const normalizedJson = this.runOcrNormalizerScript(rawText, captureInput);

    let payload = null;
    try {
      payload = JSON.parse(normalizedJson);
    } catch (error) {
      throw new Error("OCR normalizer returned invalid JSON.");
    }

    if (!payload || !Array.isArray(payload.positions)) {
      throw new Error("OCR normalizer did not produce a valid positions payload.");
    }

    return {
      rawText,
      payload,
    };
  }

  executeLocalOcrCommand(captureInput) {
    const imagePath = String(captureInput?.path || "").trim();
    if (!imagePath) throw new Error("OCR image path is empty.");
    if (!fs.existsSync(imagePath)) throw new Error(`OCR image path does not exist: ${imagePath}`);

    const tesseractPath = String(this.settings.ocrTesseractPath || "/opt/homebrew/bin/tesseract").trim();
    if (!tesseractPath) throw new Error("OCR tesseract path is empty.");
    if (!fs.existsSync(tesseractPath)) throw new Error(`Tesseract binary not found: ${tesseractPath}`);

    const language = String(captureInput?.lang || this.settings.ocrLanguage || "eng").trim() || "eng";
    const psm = String(captureInput?.psm || this.settings.ocrPsm || "6").trim() || "6";
    const result = spawnSync(tesseractPath, [imagePath, "stdout", "-l", language, "--psm", psm], {
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(String(result.stderr || result.stdout || "tesseract failed").trim());
    }
    const rawText = String(result.stdout || "").trim();
    if (!rawText) throw new Error("Tesseract returned no OCR text.");
    return rawText;
  }

  runOcrNormalizerScript(rawText, captureInput) {
    const scriptPath = String(this.settings.ocrNormalizerScriptPath || "").trim();
    if (!scriptPath) throw new Error("OCR normalizer script path is empty.");
    if (!fs.existsSync(scriptPath)) throw new Error(`OCR normalizer script not found: ${scriptPath}`);

    const args = [
      scriptPath,
      "--format",
      "auto",
      "--platform",
      String(captureInput?.platform || this.settings.ocrDefaultPlatform || "local-tesseract").trim() || "local-tesseract",
      "--captured-at",
      String(captureInput?.capturedAt || new Date().toISOString()).trim() || new Date().toISOString(),
      "--timezone",
      String(captureInput?.timezone || this.settings.ocrDefaultTimezone || "UTC").trim() || "UTC",
    ];

    const broker = String(captureInput?.broker || "").trim();
    const accountMask = String(captureInput?.accountMask || "").trim();
    const currency = String(captureInput?.currency || "").trim();
    if (broker) args.push("--broker", broker);
    if (accountMask) args.push("--account-mask", accountMask);
    if (currency) args.push("--currency", currency);

    const result = spawnSync(process.execPath, args, {
      encoding: "utf8",
      input: String(rawText || ""),
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(String(result.stderr || result.stdout || "ocr normalizer failed").trim());
    }
    return String(result.stdout || "").trim();
  }

  applyOmniforgeHandoffToEditor(editor, analysis) {
    if (!editor?.setValue || !editor?.getValue) return null;

    const source = editor.getValue();
    const payload = this.buildOmniforgeHandoffPayload(analysis);
    const prompt = this.buildOmniforgePrompt(payload);

    let next = source;
    next = this.upsertSection(next, "Omniforge Handoff", `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``);
    next = this.upsertSection(next, "Omniforge Prompt", `\`\`\`text\n${prompt}\n\`\`\``);
    editor.setValue(next);
    return payload;
  }

  buildOmniforgeHandoffPayload(analysis) {
    const generatedAt = analysis?.auditLog?.generatedAt || new Date().toISOString();
    const topPlan = analysis?.recommendations?.find((plan) => plan.isTopRecommendation) || analysis?.recommendations?.[0] || null;
    const freshness = this.buildFreshnessMeta(analysis?.portfolio?.marketContext, generatedAt);
    const leagueView = this.buildStrategyLeagueScoreboard(analysis?.recommendations || []);
    const briefingEntry = this.buildDailyBriefingHistoryEntry(analysis);
    const diagnosis = this.buildKeyDiagnoses({
      portfolio: analysis?.portfolio,
      simulation: analysis?.simulation,
      freshnessMeta: freshness,
      warnings: analysis?.warnings || [],
      params: analysis?.params,
      topPlan,
    });

    return {
      handoffVersion: 1,
      generatedAt,
      reportId: this.buildReportId(generatedAt),
      briefingId: briefingEntry.briefingId,
      sourceBoundary: "obsidian-note-local",
      freshness: {
        status: freshness.status,
        asOf: analysis?.portfolio?.marketContext?.latestAsOf || null,
        latency: freshness.latencyLabel,
        note: freshness.note,
      },
      portfolioSummary: {
        totalMarketValue: Number(analysis?.portfolio?.totalMarketValue) || 0,
        currentAllocation: analysis?.portfolio?.bucketWeights || {},
        missingPriceCount: Number(analysis?.portfolio?.marketContext?.missingPriceCount) || 0,
        topPosition: analysis?.portfolio?.topPosition
          ? {
              symbol: analysis.portfolio.topPosition.symbol,
              weight: Number(analysis.portfolio.topPosition.weight) || 0,
              assetType: analysis.portfolio.topPosition.assetType,
            }
          : null,
      },
      recommendations: this.buildSlimRecommendationsForHandoff(analysis?.recommendations || []),
      leagueScoreboard: (leagueView.entries || []).map((entry) => ({
        rank: entry.leagueRank,
        plan: entry.key,
        leagueScore: Number(entry.leagueScore) || 0,
        survivalScore: Number(entry.survivalScore) || 0,
        riskAdjustedScore: Number(entry.riskAdjustedScore) || 0,
        edge: entry.edgeNote,
      })),
      topRecommendation: topPlan
        ? {
            key: topPlan.key,
            name: topPlan.name,
            score: Number(topPlan.score) || 0,
            goalProbability: Number(topPlan.simulation?.goalProbability) || 0,
            estimatedMdd: Number(topPlan.simulation?.estimatedMdd) || 0,
            sharpe: Number(topPlan.riskAdjustedMetrics?.sharpe) || null,
            sortino: Number(topPlan.riskAdjustedMetrics?.sortino) || null,
          }
        : null,
      diagnostics: diagnosis,
      warnings: (analysis?.warnings || []).slice(0, 8),
      nextActions: this.buildActionPlan({
        recommendations: analysis?.recommendations || [],
        warnings: analysis?.warnings || [],
        freshnessMeta: freshness,
        portfolio: analysis?.portfolio,
        params: analysis?.params,
      }),
      noteSectionsExpected: [
        "Investment Params",
        "Market Quotes",
        "Portfolio",
        "Latest Report",
        "Report History",
        "Daily Briefing",
      ],
    };
  }

  buildSlimRecommendationsForHandoff(recommendations) {
    return (Array.isArray(recommendations) ? recommendations : []).map((plan) => ({
      key: plan.key,
      name: plan.name,
      rank: plan.rank,
      score: Number(plan.score) || 0,
      goalProbability: Number(plan.simulation?.goalProbability) || 0,
      estimatedMdd: Number(plan.simulation?.estimatedMdd) || 0,
      turnover: Number(plan.turnover) || 0,
      sharpe: Number(plan.riskAdjustedMetrics?.sharpe) || null,
      sortino: Number(plan.riskAdjustedMetrics?.sortino) || null,
      riskMetricSource: plan.riskAdjustedMetrics?.source || "n/a",
      targetBuckets: plan.adjustments?.buckets || {},
      firstSymbolOrder: plan.rebalance?.symbolTrades?.[0]
        ? {
            verb: plan.rebalance.symbolTrades[0].verb,
            symbol: plan.rebalance.symbolTrades[0].symbol,
            amount: Number(plan.rebalance.symbolTrades[0].amount) || 0,
          }
        : null,
    }));
  }

  buildOmniforgePrompt(payload) {
    const topPlan = payload?.topRecommendation;
    return [
      "You are receiving a local Obsidian portfolio analysis handoff.",
      "Use the attached JSON as the source of truth.",
      "Focus on refining the recommendation, identifying hidden risks, and proposing the next decision checkpoint.",
      "",
      "Output requirements:",
      "1. Restate the current baseline plan and explain why it leads.",
      "2. Flag the top 3 execution risks from freshness, concentration, and drawdown angles.",
      "3. Suggest a better plan only if the evidence clearly beats the current top recommendation.",
      "4. Keep the answer grounded in the provided JSON only. Do not invent external market data.",
      "",
      `Current top plan: ${topPlan ? `Plan ${topPlan.key} (${topPlan.name || "n/a"})` : "n/a"}`,
      `Current report id: ${payload?.reportId || "n/a"}`,
      `Current data freshness: ${payload?.freshness?.status || "UNKNOWN"} / ${payload?.freshness?.latency || "n/a"}`,
    ].join("\n");
  }

  applyCsvExportsToEditor(editor, analysis) {
    if (!editor?.setValue || !editor?.getValue) return null;

    const source = editor.getValue();
    const csvBody = this.buildCsvExportSectionBody({
      analysis,
      reportHistory: this.parseReportHistorySection(source),
      strategyLeagueHistory: this.parseStrategyLeagueHistorySection(source),
      dailyBriefingHistory: this.parseDailyBriefingHistorySection(source),
    });

    const next = this.upsertSection(source, "CSV Exports", csvBody);
    editor.setValue(next);
    return csvBody;
  }

  buildCsvExportSectionBody(context) {
    const analysis = context?.analysis;
    const leagueView = this.buildStrategyLeagueScoreboard(analysis?.recommendations || []);
    const reportHistory = Array.isArray(context?.reportHistory) && context.reportHistory.length ? context.reportHistory : [this.buildReportHistoryEntry(analysis)];
    const strategyLeagueHistory =
      Array.isArray(context?.strategyLeagueHistory) && context.strategyLeagueHistory.length
        ? context.strategyLeagueHistory
        : [this.buildStrategyLeagueHistoryEntry(analysis)];
    const dailyBriefingHistory =
      Array.isArray(context?.dailyBriefingHistory) && context.dailyBriefingHistory.length
        ? context.dailyBriefingHistory
        : [this.buildDailyBriefingHistoryEntry(analysis)];

    const portfolioCsv = this.rowsToCsv(
      [
        "symbol",
        "assetType",
        "quantity",
        "marketPrice",
        "marketValue",
        "weightPct",
        "targetWeightPct",
        "avgPrice",
        "unrealizedPnl",
        "priceSource",
        "asOf",
      ],
      (analysis?.portfolio?.positions || []).map((position) => ({
        symbol: position.symbol,
        assetType: position.assetType,
        quantity: this.prettyNum(position.quantity),
        marketPrice: Number.isFinite(position.marketPrice) ? position.marketPrice : "",
        marketValue: Number.isFinite(position.marketValue) ? Math.round(position.marketValue) : "",
        weightPct: Number.isFinite(position.weight) ? position.weight.toFixed(2) : "",
        targetWeightPct: Number.isFinite(position.targetWeight) ? Number(position.targetWeight).toFixed(2) : "",
        avgPrice: Number.isFinite(position.avgPrice) ? position.avgPrice : "",
        unrealizedPnl: Number.isFinite(position.unrealizedPnl) ? Math.round(position.unrealizedPnl) : "",
        priceSource: position.priceSource,
        asOf: position.asOf || "",
      }))
    );

    const recommendationCsv = this.rowsToCsv(
      [
        "plan",
        "name",
        "rank",
        "score",
        "goalProbabilityPct",
        "annualReturnPct",
        "annualVolatilityPct",
        "estimatedMddPct",
        "turnoverPct",
        "sharpe",
        "sortino",
        "riskMetricSource",
      ],
      (analysis?.recommendations || []).map((plan) => ({
        plan: plan.key,
        name: plan.name,
        rank: plan.rank,
        score: Number(plan.score || 0).toFixed(1),
        goalProbabilityPct: Number(plan.simulation?.goalProbability || 0).toFixed(2),
        annualReturnPct: Number(plan.assumptions?.annualReturn || 0).toFixed(2),
        annualVolatilityPct: Number(plan.assumptions?.annualVolatility || 0).toFixed(2),
        estimatedMddPct: Number(plan.simulation?.estimatedMdd || 0).toFixed(2),
        turnoverPct: Number(plan.turnover || 0).toFixed(2),
        sharpe: this.formatRatio(plan.riskAdjustedMetrics?.sharpe),
        sortino: this.formatRatio(plan.riskAdjustedMetrics?.sortino),
        riskMetricSource: plan.riskAdjustedMetrics?.source || "n/a",
      }))
    );

    const leagueCsv = this.rowsToCsv(
      ["leagueRank", "plan", "leagueScore", "survivalScore", "riskAdjustedScore", "stabilityScore", "costEfficiencyScore", "tailRiskScore", "edge"],
      (leagueView.entries || []).map((entry) => ({
        leagueRank: entry.leagueRank,
        plan: entry.key,
        leagueScore: entry.leagueScore.toFixed(1),
        survivalScore: entry.survivalScore.toFixed(1),
        riskAdjustedScore: entry.riskAdjustedScore.toFixed(1),
        stabilityScore: entry.stabilityScore.toFixed(1),
        costEfficiencyScore: entry.costEfficiencyScore.toFixed(1),
        tailRiskScore: entry.tailRiskScore.toFixed(1),
        edge: entry.edgeNote,
      }))
    );

    const reportHistoryCsv = this.rowsToCsv(
      ["reportId", "generatedAt", "topPlan", "score", "goalProbabilityPct", "estimatedMddPct", "freshnessStatus", "auditHash"],
      reportHistory.map((entry) => ({
        reportId: entry.reportId,
        generatedAt: entry.generatedAt,
        topPlan: entry.topPlan,
        score: Number(entry.topScore || 0).toFixed(1),
        goalProbabilityPct: Number(entry.goalProbability || 0).toFixed(2),
        estimatedMddPct: Number(entry.estimatedMdd || 0).toFixed(2),
        freshnessStatus: entry.freshnessStatus,
        auditHash: entry.auditHash,
      }))
    );

    const leagueHistoryCsv = this.rowsToCsv(
      ["reportId", "generatedAt", "winnerPlan", "leagueScore", "edge"],
      strategyLeagueHistory.map((entry) => ({
        reportId: entry.reportId,
        generatedAt: entry.generatedAt,
        winnerPlan: entry.winnerPlan,
        leagueScore: Number(entry.leagueScore || 0).toFixed(1),
        edge: entry.edge,
      }))
    );

    const briefingHistoryCsv = this.rowsToCsv(
      ["briefingId", "generatedAt", "topPlan", "freshnessStatus", "summary"],
      dailyBriefingHistory.map((entry) => ({
        briefingId: entry.briefingId,
        generatedAt: entry.generatedAt,
        topPlan: entry.topPlan,
        freshnessStatus: entry.freshnessStatus,
        summary: entry.summary,
      }))
    );

    return [
      "### Portfolio Snapshot",
      "```csv",
      portfolioCsv,
      "```",
      "",
      "### Recommendation Plans",
      "```csv",
      recommendationCsv,
      "```",
      "",
      "### Strategy League",
      "```csv",
      leagueCsv,
      "```",
      "",
      "### Report History",
      "```csv",
      reportHistoryCsv,
      "```",
      "",
      "### Strategy League History",
      "```csv",
      leagueHistoryCsv,
      "```",
      "",
      "### Daily Briefing History",
      "```csv",
      briefingHistoryCsv,
      "```",
    ].join("\n");
  }

  rowsToCsv(headers, rows) {
    const headerRow = (Array.isArray(headers) ? headers : []).map((header) => this.escapeCsvValue(header)).join(",");
    const dataRows = (Array.isArray(rows) ? rows : []).map((row) =>
      (Array.isArray(headers) ? headers : []).map((header) => this.escapeCsvValue(row?.[header])).join(",")
    );
    return [headerRow, ...dataRows].join("\n");
  }

  escapeCsvValue(value) {
    if (value === undefined || value === null) return "";
    const text = String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  ingestOcrToEditor(editor) {
    const text = editor?.getValue?.() || "";
    const payload = this.parseOcrPayloadFromNote(text);
    if (!payload) {
      new Notice("No valid OCR JSON found. Add a JSON block under '## OCR JSON'.");
      return;
    }

    const normalized = this.normalizeOcrPayload(payload);
    if (!normalized.portfolioPositions.length) {
      new Notice("OCR JSON parsed but no usable positions found.");
      return null;
    }

    const next = this.applyNormalizedOcrPayloadToText(text, normalized);
    editor.setValue(next);

    new Notice(
      `OCR ingestion complete: ${normalized.portfolioPositions.length} positions applied, ${normalized.manualReviewCount} flagged for review.`
    );
    return normalized;
  }

  applyNormalizedOcrPayloadToText(text, normalized, extras = {}) {
    const existingPositions = this.parsePortfolioSection(text);
    const mergedPositions = this.mergePositions(existingPositions, normalized.portfolioPositions);
    const existingQuotes = this.parseMarketQuotesSection(text);
    const mergedQuotes = this.mergeMarketQuotes(existingQuotes, normalized.marketQuotes);

    let next = text;
    if (extras.captureInput?.path) {
      next = this.upsertSection(next, "OCR Capture Input", this.buildOcrCaptureInputSectionBody(extras.captureInput));
    }
    if (typeof extras.rawText === "string" && extras.rawText.trim()) {
      next = this.upsertSection(next, "OCR Raw Text", `\`\`\`text\n${extras.rawText.trim()}\n\`\`\``);
    }
    next = this.upsertSection(next, "OCR JSON", `\`\`\`json\n${JSON.stringify(normalized.payload, null, 2)}\n\`\`\``);
    if (Object.keys(mergedQuotes).length) {
      next = this.upsertSection(next, "Market Quotes", this.serializeMarketQuotes(mergedQuotes));
    }
    next = this.upsertSection(next, "Portfolio", this.buildPortfolioSectionBody(mergedPositions));
    next = this.upsertSection(next, "OCR Review", this.buildOcrReviewSectionBody(normalized));
    return next;
  }

  buildOcrCaptureInputSectionBody(captureInput) {
    return [
      `path: ${captureInput.path || ""}`,
      `platform: ${captureInput.platform || this.settings.ocrDefaultPlatform || "local-tesseract"}`,
      `capturedAt: ${captureInput.capturedAt || new Date().toISOString()}`,
      `timezone: ${captureInput.timezone || this.settings.ocrDefaultTimezone || "UTC"}`,
      captureInput.broker ? `broker: ${captureInput.broker}` : null,
      captureInput.accountMask ? `accountMask: ${captureInput.accountMask}` : null,
      captureInput.currency ? `currency: ${captureInput.currency}` : null,
      captureInput.lang ? `lang: ${captureInput.lang}` : null,
      captureInput.psm ? `psm: ${captureInput.psm}` : null,
    ]
      .filter(Boolean)
      .join("\n");
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
      timezone: payload?.source?.timezone || "UTC",
    };
    const account = {
      brokerOrExchange: String(payload?.account?.brokerOrExchange || "").trim(),
      accountMask: this.maskAccountIdentifier(payload?.account?.accountMask),
    };
    const totals = {
      totalValue: this.toNumber(payload?.totals?.totalValue),
      cash: this.toNumber(payload?.totals?.cash),
      dailyPnl: this.toNumber(payload?.totals?.dailyPnl),
      currency: this.normalizeCurrencyLabel(payload?.totals?.currency || ""),
    };

    const rows = [];
    const portfolioPositions = [];
    const marketQuotes = {};
    let manualReviewCount = 0;

    const positions = Array.isArray(payload.positions) ? payload.positions : [];
    for (const p of positions) {
      const symbolRaw = String(p?.symbolRaw || p?.symbol || "").trim().toUpperCase();
      const symbol = this.normalizeOcrSymbol(p?.symbol || symbolRaw);
      const quantity = this.toNumber(p?.quantity);
      const assetType = this.normalizeAssetType(p?.assetType || this.inferAssetTypeFromSymbol(symbol, p?.currency));
      const avgPrice = this.toNumber(p?.avgPrice);
      const marketPrice = this.toNumber(p?.marketPrice ?? p?.avgPrice);
      const marketValue = this.toNumber(p?.marketValue);
      const pnl = this.toNumber(p?.pnl);
      const currency = this.normalizeCurrencyLabel(p?.currency || this.defaultCurrencyForSymbol(symbol, assetType));
      const confidence = this.clamp(Number(p?.confidence ?? 0), 0, 1);
      const include = p?.include !== false;
      const reviewNote = String(p?.reviewNote || "").trim();

      const missing = [];
      if (!symbol) missing.push("symbol");
      if (!(quantity > 0)) missing.push("quantity");

      let decision = "manual";
      if (!missing.length && confidence >= OCR_THRESHOLDS.autoApply) {
        decision = "auto-apply";
      } else if (!missing.length && confidence >= OCR_THRESHOLDS.recommendReview) {
        decision = "review-recommended";
      }

      if (!include || decision !== "auto-apply") manualReviewCount += 1;

      rows.push({
        include,
        symbolRaw,
        symbol,
        assetType,
        quantity: Number.isFinite(quantity) ? quantity : null,
        avgPrice: Number.isFinite(avgPrice) ? avgPrice : null,
        marketPrice: Number.isFinite(marketPrice) ? marketPrice : null,
        marketValue: Number.isFinite(marketValue) ? marketValue : null,
        pnl: Number.isFinite(pnl) ? pnl : null,
        currency,
        confidence,
        reviewNote,
        decision,
        missing,
      });

      if (include && !missing.length) {
        portfolioPositions.push({
          symbolRaw,
          symbol,
          assetType,
          quantity,
          marketPrice: Number.isFinite(marketPrice) ? marketPrice : null,
          targetWeight: null,
          avgPrice: Number.isFinite(avgPrice) ? avgPrice : null,
        });

        if (Number.isFinite(marketPrice) && marketPrice > 0) {
          marketQuotes[symbol] = {
            symbol,
            price: marketPrice,
            currency,
            market: this.marketLabelForAssetType(assetType),
            source: include && decision === "auto-apply" ? "ocr-auto" : "ocr-reviewed",
            asOf: source.capturedAt,
          };
        }
      }
    }

    const computedOverallConfidence = rows.length
      ? rows.reduce((sum, row) => sum + (Number(row.confidence) || 0), 0) / rows.length
      : 0;
    const quality = {
      overallConfidence: this.clamp(Number(payload?.quality?.overallConfidence ?? computedOverallConfidence), 0, 1),
      missingFields: Array.isArray(payload?.quality?.missingFields)
        ? payload.quality.missingFields.map((field) => String(field || "").trim()).filter(Boolean)
        : [...new Set(rows.flatMap((row) => row.missing))],
      requiresManualReview: Boolean(payload?.quality?.requiresManualReview || manualReviewCount > 0),
    };

    return {
      source,
      account,
      totals,
      rows,
      quality,
      portfolioPositions,
      manualReviewCount,
      marketQuotes,
      payload: {
        source,
        account,
        positions: rows.map((row) => ({
          include: row.include,
          symbolRaw: row.symbolRaw,
          symbol: row.symbol,
          assetType: row.assetType,
          quantity: row.quantity,
          avgPrice: row.avgPrice,
          marketPrice: row.marketPrice,
          marketValue: row.marketValue,
          pnl: row.pnl,
          currency: row.currency,
          confidence: row.confidence,
          reviewNote: row.reviewNote,
        })),
        totals,
        quality,
      },
    };
  }

  buildPortfolioSectionBody(positions) {
    return (positions || [])
      .map((position) => {
        const fields = [
          position.symbol,
          position.assetType,
          this.prettyNum(position.quantity),
          Number.isFinite(position.marketPrice) ? position.marketPrice : "",
          Number.isFinite(position.targetWeight) ? position.targetWeight : "",
        ];
        if (Number.isFinite(position.avgPrice)) fields.push(position.avgPrice);
        return `- ${fields.join(",")}`;
      })
      .join("\n");
  }

  mergeMarketQuotes(existing, incoming) {
    const merged = { ...(existing || {}) };
    for (const quote of Object.values(incoming || {})) {
      const symbol = String(quote?.symbol || "").trim().toUpperCase();
      const price = this.toNumber(quote?.price);
      if (!symbol || !(price > 0)) continue;
      const previous = merged[symbol] || {};
      merged[symbol] = {
        symbol,
        price,
        currency: this.normalizeCurrencyLabel(quote?.currency || previous.currency || this.defaultCurrencyForSymbol(symbol)),
        market: this.normalizeMarketLabel(quote?.market || previous.market || "unknown"),
        source: String(quote?.source || previous.source || "ocr-reviewed").trim() || "ocr-reviewed",
        asOf: String(quote?.asOf || previous.asOf || new Date().toISOString()).trim() || new Date().toISOString(),
      };
    }
    return merged;
  }

  buildOcrReviewSectionBody(normalized) {
    const lines = [
      `- platform: ${normalized.source.platform}`,
      `- capturedAt: ${normalized.source.capturedAt}`,
      `- overallConfidence: ${normalized.quality.overallConfidence.toFixed(2)}`,
      `- requiresManualReview: ${normalized.quality.requiresManualReview ? "true" : "false"}`,
      `- rowsIncluded: ${normalized.portfolioPositions.length}`,
      `- rowsFlaggedForReview: ${normalized.manualReviewCount}`,
      "",
      "| Apply | Symbol | Type | Qty | Avg Px | Price | Currency | Confidence | Decision | Notes |",
      "|---|---|---|---:|---:|---:|---|---:|---|---|",
      ...normalized.rows.map((row) => {
        const quantity = Number.isFinite(row.quantity) ? this.prettyNum(row.quantity) : "-";
        const avgPrice = Number.isFinite(row.avgPrice) ? row.avgPrice : "-";
        const marketPrice = Number.isFinite(row.marketPrice) ? row.marketPrice : "-";
        const note = String(row.reviewNote || "-").replace(/\|/g, "/");
        const decision = [row.include ? null : "excluded", row.decision, row.missing?.length ? `missing: ${row.missing.join(", ")}` : null]
          .filter(Boolean)
          .join(" / ");
        return `| ${row.include ? "Y" : "N"} | ${row.symbol || "-"} | ${row.assetType} | ${quantity} | ${avgPrice} | ${marketPrice} | ${
          row.currency || "-"
        } | ${(row.confidence * 100).toFixed(1)}% | ${decision} | ${note} |`;
      }),
    ];
    return lines.join("\n");
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
        avgPrice: Number.isFinite(p.avgPrice) ? p.avgPrice : prev.avgPrice,
      });
    }

    return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  buildPortfolio(positions, marketQuotes) {
    const normalized = [];

    for (const pos of positions) {
      const quoteLookup = this.resolveQuoteForSymbol(pos.symbol, marketQuotes);
      const quote = quoteLookup.quote;
      const resolvedPrice = Number.isFinite(pos.marketPrice) ? pos.marketPrice : quote?.price;
      const marketValue = Number.isFinite(resolvedPrice) ? resolvedPrice * pos.quantity : null;
      const priceSource = Number.isFinite(pos.marketPrice)
        ? "note"
        : quote
        ? quoteLookup.fallbackApplied
          ? `${quote.source}:fallback-cache`
          : quote.source
        : "missing";
      const asOf = quote?.asOf || null;

      normalized.push({
        ...pos,
        avgPrice: Number.isFinite(pos.avgPrice) ? pos.avgPrice : null,
        marketPrice: Number.isFinite(resolvedPrice) ? resolvedPrice : null,
        marketValue,
        costBasis: Number.isFinite(pos.avgPrice) ? pos.avgPrice * pos.quantity : null,
        unrealizedPnl:
          Number.isFinite(pos.avgPrice) && Number.isFinite(marketValue) ? marketValue - pos.avgPrice * pos.quantity : null,
        unrealizedPnlPct:
          Number.isFinite(pos.avgPrice) && pos.avgPrice * pos.quantity > 0 && Number.isFinite(marketValue)
            ? ((marketValue - pos.avgPrice * pos.quantity) / (pos.avgPrice * pos.quantity)) * 100
            : null,
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
    const fallbackQuoteCount = positions.filter((p) => String(p.priceSource || "").includes("fallback-cache")).length;
    const missingPriceCount = positions.filter((p) => p.priceSource === "missing").length;
    const priceSources = [...new Set(positions.map((p) => String(p.priceSource || "").trim()).filter(Boolean))];
    const markets = [...new Set(Object.values(marketQuotes || {}).map((q) => this.normalizeMarketLabel(q?.market || "unknown")))];
    const hydrationSummary = this.lastLiveQuoteHydrationSummary || {};

    let latestAsOf = null;
    for (const q of Object.values(marketQuotes || {})) {
      const t = Date.parse(q.asOf);
      if (!Number.isFinite(t)) continue;
      if (!latestAsOf || t > Date.parse(latestAsOf)) latestAsOf = new Date(t).toISOString();
    }

    if (!latestAsOf) {
      for (const q of Object.values(this.quoteCache || {})) {
        const t = Date.parse(q.asOf);
        if (!Number.isFinite(t)) continue;
        if (!latestAsOf || t > Date.parse(latestAsOf)) latestAsOf = new Date(t).toISOString();
      }
    }

    return {
      quoteCount,
      usedQuoteCount,
      fallbackQuoteCount,
      missingPriceCount,
      latestAsOf,
      priceSources,
      markets,
      liveFetchAttemptedCount: Math.max(0, Number(hydrationSummary.attemptedCount) || 0),
      liveFetchSuccessCount: Math.max(0, Number(hydrationSummary.fetchedCount) || 0),
      liveFetchSkippedByCapCount: Math.max(0, Number(hydrationSummary.skippedByCapCount) || 0),
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
    const seededRandom = this.createSeededRandom(input.randomSeed);
    const randomFn = seededRandom || Math.random;

    for (let i = 0; i < runs; i++) {
      let v = input.principal;
      for (let m = 0; m < months; m++) {
        v = v * (1 + mu + sigma * this.randn(randomFn)) + input.monthlyContribution;
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
    const baseYears = Math.max(1, Number(input.params?.years) || 1);
    const baseMonthlyContribution = Math.max(0, Number(input.params?.monthlyContribution) || 0);
    const baseGoalProbability = Number(input.baseSimulation?.goalProbability) || 0;
    const topWeight = Number(input.portfolio?.topPosition?.weight) || 0;
    const concentrationBreached = topWeight > Number(input.params?.maxSingleAssetWeight || 0);
    const goalShortfall = baseGoalProbability < 70;
    const bucketReturnSeries = this.buildBucketReturnSeries(input.portfolio);

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
      {
        key: "A",
        name: "Conservative",
        styleLabel: "Capital Defense",
        buckets: planA,
        notes: "Lower drawdown by reducing risk concentration.",
        recommendedFor: "Users who prioritize capital preservation and smoother downside control.",
        yearsDelta: goalShortfall ? 2 : 1,
        contributionMultiplier: goalShortfall ? 1.1 : 1.02,
      },
      {
        key: "B",
        name: "Balanced",
        styleLabel: "Core Growth",
        buckets: planB,
        notes: "Balance growth and stability under constraints.",
        recommendedFor: "Users who want a practical default plan with moderate rebalancing effort.",
        yearsDelta: goalShortfall ? 1 : 0,
        contributionMultiplier: goalShortfall ? 1.15 : 1.05,
      },
      {
        key: "C",
        name: "Aggressive",
        styleLabel: "Upside Capture",
        buckets: planC,
        notes: "Prioritize upside while still honoring risk caps.",
        recommendedFor: "Users who can tolerate wider drawdowns and actively monitor execution discipline.",
        yearsDelta: 0,
        contributionMultiplier: goalShortfall ? 1.25 : 1.1,
      },
    ];

    const simulationRuns = Math.min(400, Math.max(150, Math.floor(input.params.simulations / 3)));
    const enriched = plans.map((plan) => {
      const targetYears = Math.max(1, baseYears + plan.yearsDelta);
      const targetMonthlyContribution = this.roundCurrencyStep(baseMonthlyContribution * plan.contributionMultiplier, 10000);
      const assumptions = this.assumptionsFromBuckets(plan.buckets);
      const sim = this.simulate({
        principal: input.principal,
        monthlyContribution: targetMonthlyContribution,
        years: targetYears,
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
      const riskAdjustedMetrics = this.buildPlanRiskAdjustedMetrics({
        buckets: plan.buckets,
        assumptions,
        portfolio: input.portfolio,
        bucketReturnSeries,
      });
      const scoreComponents = this.buildRecommendationScoreComponents({
        goalProbability: sim.goalProbability,
        returnScore,
        riskScore,
        costScore,
        riskAdjustedMetrics,
      });
      const baseScore = scoreComponents.total;

      const leagueAdjustment = Number(input.leagueContext?.adjustments?.[plan.key] || 0);
      const score = this.clamp(baseScore + leagueAdjustment, 0, 100);

      const failures = [];
      if (sim.estimatedMdd > input.params.maxMdd) failures.push("Estimated drawdown can exceed tolerance.");
      if (assumptions.annualVolatility > input.params.maxVolatility) failures.push("Volatility may breach user limit.");
      if (sim.goalProbability < 70) failures.push("Goal probability is below 70%. Raise contribution or extend horizon.");
      if (!failures.length) failures.push("Adverse macro shock can still impair results.");

      const failureScenario = this.buildPlanFailureScenario({
        plan,
        simulation: sim,
        assumptions,
        input,
        goalShortfall,
      });
      const rebalance = this.buildRebalancePlan({
        portfolio: input.portfolio,
        targetBuckets: plan.buckets,
        params: input.params,
      });

      return {
        ...plan,
        assumptions,
        simulation: sim,
        turnover,
        riskAdjustedMetrics,
        scoreComponents,
        score,
        baseScore,
        leagueAdjustment,
        adjustments: {
          years: {
            current: baseYears,
            target: targetYears,
          },
          monthlyContribution: {
            current: baseMonthlyContribution,
            target: targetMonthlyContribution,
          },
          buckets: plan.buckets,
        },
        why: this.buildPlanReasons({
          plan,
          currentBuckets: current,
          assumptions,
          simulation: sim,
          input,
          goalShortfall,
          concentrationBreached,
          targetYears,
          targetMonthlyContribution,
        }),
        checklist: this.buildPlanChecklist({
          plan,
          targetYears,
          targetMonthlyContribution,
          targetBuckets: plan.buckets,
          input,
        }),
        failureScenario,
        rebalance,
        failures,
      };
    });

    const rankByKey = new Map(
      [...enriched]
        .sort((a, b) => b.score - a.score)
        .map((plan, index) => [plan.key, index + 1])
    );

    return enriched.map((plan) => ({
      ...plan,
      rank: rankByKey.get(plan.key) || enriched.length,
      isTopRecommendation: (rankByKey.get(plan.key) || enriched.length) === 1,
    }));
  }

  buildWarnings(input) {
    const warnings = [];
    const top = input.portfolio.topPosition;
    const freshnessMeta = this.buildFreshnessMeta(input.portfolio.marketContext);
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

    if (input.portfolio.marketContext.fallbackQuoteCount > 0) {
      warnings.push(
        `${input.portfolio.marketContext.fallbackQuoteCount} position(s) used cached fallback quotes (market-specific freshness policy applied).`
      );
    }

    if (input.portfolio.marketContext.missingPriceCount > 0) {
      warnings.push(`${input.portfolio.marketContext.missingPriceCount} position(s) are missing price after market adapter lookup.`);
    }

    if (input.portfolio.marketContext.liveFetchSkippedByCapCount > 0) {
      warnings.push(
        `${input.portfolio.marketContext.liveFetchSkippedByCapCount} symbol(s) were skipped by live quote fetch cap (${input.portfolio.marketContext.liveFetchSuccessCount}/${input.portfolio.marketContext.liveFetchAttemptedCount} fetched this run).`
      );
    }

    if (freshnessMeta.status === "STALE") {
      warnings.push(`Market data is stale (${freshnessMeta.latencyLabel} old). Refresh quotes before acting on this report.`);
    } else if (freshnessMeta.status === "UNKNOWN" && input.portfolio.marketContext.quoteCount > 0) {
      warnings.push("Market data freshness is unknown because quote timestamps are missing.");
    }

    if (!input.leagueContext?.count) {
      warnings.push("No league data found. Recommendation score uses only portfolio + risk rules.");
    }

    const validationIssues = Array.isArray(input.params?.inputValidation) ? input.params.inputValidation : [];
    if (validationIssues.length > 0) {
      warnings.push(`Input validation flagged ${validationIssues.length} issue(s).`);
      warnings.push(...validationIssues.slice(0, 3));
      if (validationIssues.length > 3) {
        warnings.push(`...and ${validationIssues.length - 3} more validation issue(s).`);
      }
    }

    if (!warnings.length) warnings.push("No major risk limit breach detected in current inputs.");
    return warnings;
  }

  pickTopWarning(warnings, fallbackMessage) {
    const list = (Array.isArray(warnings) ? warnings : []).filter(Boolean);
    const priorityPatterns = [/stale/i, /missing price/i, /concentration/i, /crypto weight/i, /input validation/i, /goal probability/i];
    for (const pattern of priorityPatterns) {
      const hit = list.find((warning) => pattern.test(String(warning)));
      if (hit) return String(hit);
    }
    if (list.length) return String(list[0]);
    return fallbackMessage || "No major warning. Review the recommended plan and keep monitoring the note.";
  }

  buildBeginnerReadThisFirst(input) {
    const topPlan = input.recommendations.find((plan) => plan.isTopRecommendation) || input.recommendations[0] || null;
    const freshnessMeta = this.buildFreshnessMeta(input.portfolio.marketContext, input.auditLog.generatedAt);
    const goalProbability = Number(input.simulation.goalProbability) || 0;
    const estimatedMdd = Number(input.simulation.estimatedMdd) || 0;
    const topPosition = input.portfolio.topPosition || null;
    const concentrationBreached =
      topPosition &&
      Number.isFinite(topPosition.weight) &&
      topPosition.weight > (Number(input.params.maxSingleAssetWeight) || 35);

    let overallStatus = "Good first draft";
    let meaning = "You can already compare plans, but treat this as a planning draft until you confirm prices.";

    if (input.portfolio.missingPriceCount > 0) {
      overallStatus = "Fix missing prices first";
      meaning = `${input.portfolio.missingPriceCount} position(s) are missing a usable price, so the report is incomplete until you fill them in.`;
    } else if (freshnessMeta.status === "STALE") {
      overallStatus = "Wait for fresher prices";
      meaning = `The latest quote is ${freshnessMeta.latencyLabel} old, so you should refresh prices before acting on this report.`;
    } else if (estimatedMdd > input.params.maxMdd || concentrationBreached) {
      overallStatus = "Risk is higher than requested";
      meaning = `The current setup can swing harder than the limits you asked for, so the safer plan deserves extra attention.`;
    } else if (goalProbability < 70) {
      overallStatus = "Not on track yet";
      meaning = `At the current contribution and time horizon, the goal probability is only ${this.formatPct(goalProbability)}. You likely need more time, more monthly cash, or a different mix.`;
    } else if (freshnessMeta.status === "FRESH") {
      overallStatus = "Reasonably on track";
      meaning = "The current setup is within the basic risk guardrails and uses fresh enough prices for a practical review.";
    }

    return {
      overallStatus,
      meaning,
      bestPlanLabel: topPlan ? `Plan ${topPlan.key} (${topPlan.name})` : "n/a",
      bestPlanWhy: topPlan?.why?.[0] || topPlan?.recommendedFor || "No recommendation was generated yet.",
      biggestWarning: this.pickTopWarning(
        input.warnings,
        freshnessMeta.status === "UNKNOWN" && input.portfolio.marketContext.quoteCount === 0
          ? "No external market quotes were attached. That is fine for a first practice run, but refresh prices before trading."
          : "No major warning detected."
      ),
      goalProbabilityNote: `${this.formatPct(goalProbability)}. Higher is better because it means a better chance of reaching the target amount.`,
      mddNote: `${this.formatPct(estimatedMdd)}. Lower is safer because it estimates how deep the worst drawdown could be.`,
      freshnessNote: `${freshnessMeta.status}. ${freshnessMeta.note}`,
    };
  }

  renderReport(input) {
    const reportId = this.buildReportId(input.auditLog.generatedAt);
    const freshnessMeta = this.buildFreshnessMeta(input.portfolio.marketContext, input.auditLog.generatedAt);
    const keyDiagnoses = this.buildKeyDiagnoses({
      portfolio: input.portfolio,
      simulation: input.simulation,
      freshnessMeta,
      warnings: input.warnings,
      params: input.params,
      topPlan: input.recommendations.find((plan) => plan.isTopRecommendation) || input.recommendations[0] || null,
    });
    const actionPlan = this.buildActionPlan({
      recommendations: input.recommendations,
      warnings: input.warnings,
      freshnessMeta,
      portfolio: input.portfolio,
      params: input.params,
    });
    const beginnerSummary = this.buildBeginnerReadThisFirst(input);
    const currentAllocation = this.formatBucketSummary(input.portfolio.bucketWeights);
    const positions = input.portfolio.positions;
    const tickerCards = this.buildTickerAnalysisCards({
      portfolio: input.portfolio,
      params: input.params,
      runAt: input.auditLog.generatedAt,
    });
    const scenarios = this.buildScenarioAnalysis({
      portfolio: input.portfolio,
      assumptions: input.assumptions,
      params: input.params,
      principal: input.principal,
    });
    const correlationView = this.buildCorrelationMatrix(input.portfolio);
    const positionTable = positions.length
      ? [
          "| Symbol | Type | Qty | Price | Value | Weight | Target | Source |",
          "|---|---|---:|---:|---:|---:|---:|---|",
          ...positions.map((p) => {
            const price = Number.isFinite(p.marketPrice) ? this.formatMoney(p.marketPrice) : "-";
            const value = Number.isFinite(p.marketValue) ? this.formatMoney(p.marketValue) : "-";
            const weight = Number.isFinite(p.weight) ? this.formatPct(p.weight) : "-";
            const target = Number.isFinite(p.targetWeight) ? this.formatPct(p.targetWeight) : "-";
            return `| ${p.symbol} | ${p.assetType} | ${this.prettyNum(p.quantity)} | ${price} | ${value} | ${weight} | ${target} | ${p.priceSource} |`;
          }),
        ].join("\n")
      : "_No portfolio rows found. Simulation used parameter defaults only._";
    const tickerCardSection = this.renderTickerAnalysisCards(tickerCards);
    const scenarioSection = this.renderScenarioAnalysis(scenarios);
    const correlationSection = this.renderCorrelationMatrix(correlationView);
    const strategyLeagueView = this.buildStrategyLeagueScoreboard(input.recommendations);
    const strategyLeagueSection = this.renderStrategyLeagueScoreboard(strategyLeagueView);

    const recTable = [
      "| Plan | Style | Goal Prob | Exp Return | Exp Vol | Est MDD | Sharpe | Sortino | Rank | Recommended For |",
      "|---|---|---:|---:|---:|---:|---:|---:|---:|---|",
      ...input.recommendations.map((r) => {
        return `| ${r.key} | ${r.styleLabel} | ${this.formatPct(r.simulation.goalProbability)} | ${this.formatPct(
          r.assumptions.annualReturn
        )} | ${this.formatPct(r.assumptions.annualVolatility)} | ${this.formatPct(r.simulation.estimatedMdd)} | ${this.formatRatio(
          r.riskAdjustedMetrics?.sharpe
        )} | ${this.formatRatio(r.riskAdjustedMetrics?.sortino)} | #${r.rank} | ${r.recommendedFor} |`;
      }),
    ].join("\n");

    const planDetails = input.recommendations
      .map((r) => {
        const rebalanceTable = this.renderRebalanceTable(r.rebalance);
        const symbolTradeTable = this.renderSymbolTradeTable(r.rebalance);
        return [
          `### Plan ${r.key} (${r.name})`,
          `- Score / Rank: ${r.score.toFixed(1)} / #${r.rank}`,
          `- Recommended For: ${r.recommendedFor}`,
          `- Adjustment: horizon ${r.adjustments.years.current}y -> ${r.adjustments.years.target}y`,
          `- Adjustment: monthlyContribution ${this.formatMoney(r.adjustments.monthlyContribution.current)} -> ${this.formatMoney(
            r.adjustments.monthlyContribution.target
          )}`,
          `- Adjustment: target allocation ${this.formatBucketSummary(r.adjustments.buckets)}`,
          `- Expected Metrics: Goal Prob ${this.formatPct(r.simulation.goalProbability)}, P10 ${this.formatMoney(
            r.simulation.p10
          )}, P50 ${this.formatMoney(r.simulation.p50)}, P90 ${this.formatMoney(r.simulation.p90)}, Est MDD ${this.formatPct(
            r.simulation.estimatedMdd
          )}, Turnover ${this.formatPct(r.turnover)}, Sharpe ${this.formatRatio(r.riskAdjustedMetrics?.sharpe)}, Sortino ${this.formatRatio(
            r.riskAdjustedMetrics?.sortino
          )}`,
          `- Risk-Adjusted Metrics: source ${r.riskAdjustedMetrics?.source || "n/a"}, annualReturn ${this.formatPct(
            r.riskAdjustedMetrics?.annualReturn
          )}, annualVol ${this.formatPct(r.riskAdjustedMetrics?.annualVolatility)}, downsideDev ${this.formatPct(
            r.riskAdjustedMetrics?.downsideDeviation
          )}, observations ${Number(r.riskAdjustedMetrics?.pointCount) || 0}`,
          `- Score Breakdown: goal ${r.scoreComponents.goalScore.toFixed(1)}, return ${r.scoreComponents.returnScore.toFixed(1)}, risk ${r.scoreComponents.riskScore.toFixed(
            1
          )}, cost ${r.scoreComponents.costScore.toFixed(1)}, sharpe ${r.scoreComponents.sharpeScore.toFixed(1)}, sortino ${r.scoreComponents.sortinoScore.toFixed(
            1
          )}, league ${r.leagueAdjustment.toFixed(1)}`,
          `- Rebalance Summary: grossTrade ${this.formatMoney(r.rebalance.grossTradeValue)}, fee ${this.formatMoney(
            r.rebalance.estimatedFee
          )}, sellTax ${this.formatMoney(r.rebalance.estimatedSellTax)}, netCashImpact ${this.formatMoney(r.rebalance.netCashImpact)}`,
          `- Rebalance Actions:`,
          rebalanceTable,
          `- Symbol-Level Orders:`,
          symbolTradeTable,
          `- Why This Plan:`,
          `  1. ${r.why[0]}`,
          `  2. ${r.why[1]}`,
          `  3. ${r.why[2]}`,
          `- Failure Scenario: ${r.failureScenario || r.failures[0]}`,
          `- Execution Checklist:`,
          `  1. ${r.checklist[0]}`,
          `  2. ${r.checklist[1]}`,
          `  3. ${r.checklist[2]}`,
        ].join("\n");
      })
      .join("\n\n");

    return `# Investment Simulation Recommendation Report v1

## 1) Report Header
- reportId: ${reportId}
- generatedAt: ${this.formatTimestamp(input.auditLog.generatedAt)}
- Initial Capital: ${this.formatMoney(input.principal)}
- Goal Amount: ${this.formatMoney(input.params.goalAmount)}
- Monthly Contribution: ${this.formatMoney(input.params.monthlyContribution)}
- Horizon: ${input.params.years} years
- Simulations: ${input.simulation.runs}
- Risk Limits: maxMdd ${this.formatPct(input.params.maxMdd)}, maxVolatility ${this.formatPct(input.params.maxVolatility)}, maxCryptoWeight ${this.formatPct(
      input.params.maxCryptoWeight
    )}
- Input Validation Issues: ${Array.isArray(input.params.inputValidation) ? input.params.inputValidation.length : 0}

## 2) Data Freshness
- asOf: ${freshnessMeta.asOfDisplay}
- runAt: ${freshnessMeta.runAtDisplay}
- priceSource: ${freshnessMeta.priceSource}
- fxSource: ${freshnessMeta.fxSource}
- latency: ${freshnessMeta.latencyLabel}
- freshnessStatus: ${freshnessMeta.status}
- freshnessNote: ${freshnessMeta.note}
- Market Quotes Provided: ${input.portfolio.marketContext.quoteCount}
- Quotes Used by Adapter: ${input.portfolio.marketContext.usedQuoteCount}
- Fallback Quotes From Cache: ${input.portfolio.marketContext.fallbackQuoteCount}
- Missing Prices After Adapter: ${input.portfolio.marketContext.missingPriceCount}
- Live Quote Fetch Attempts: ${input.portfolio.marketContext.liveFetchAttemptedCount}
- Live Quote Fetch Successes: ${input.portfolio.marketContext.liveFetchSuccessCount}
- Live Quote Skipped By Cap: ${input.portfolio.marketContext.liveFetchSkippedByCapCount}
- Market Data As-Of: ${input.portfolio.marketContext.latestAsOf || "n/a"}
- League Samples: ${input.leagueContext.count}
- League Average Return: ${this.formatPct(input.leagueContext.avgReturn)}
- League Regime: ${input.leagueContext.regime}
- League Note: ${input.leagueContext.note}

## 3) Current Status Summary
### Read This First
- Overall Status: ${beginnerSummary.overallStatus}
- What It Means: ${beginnerSummary.meaning}
- Best Starter Plan: ${beginnerSummary.bestPlanLabel}
- Why It Leads: ${beginnerSummary.bestPlanWhy}
- Biggest Warning: ${beginnerSummary.biggestWarning}
- Do This Next: ${actionPlan.immediate}
- Goal Probability: ${beginnerSummary.goalProbabilityNote}
- Est MDD: ${beginnerSummary.mddNote}
- Data Freshness: ${beginnerSummary.freshnessNote}

- Current Allocation: ${currentAllocation}
- Total Market Value: ${this.formatMoney(input.portfolio.totalMarketValue)}
- Goal Probability: ${this.formatPct(input.simulation.goalProbability)} (higher is better)
- Final Value Percentiles: P10 ${this.formatMoney(input.simulation.p10)} / P50 ${this.formatMoney(input.simulation.p50)} / P90 ${this.formatMoney(
      input.simulation.p90
    )}
- Blended Return / Volatility / Est MDD: ${this.formatPct(input.assumptions.annualReturn)} / ${this.formatPct(
      input.assumptions.annualVolatility
    )} / ${this.formatPct(input.simulation.estimatedMdd)} (higher return can help, lower volatility and MDD are safer)
- Key Diagnosis:
  1. ${keyDiagnoses[0]}
  2. ${keyDiagnoses[1]}
  3. ${keyDiagnoses[2]}

### Portfolio Positions
${positionTable}

### Scenario Analysis
${scenarioSection}

### ${correlationView.headingLabel || "Correlation Matrix"}
${correlationSection}

### Ticker Analysis Cards
${tickerCardSection}

## 4) Recommendation Plans Overview
${recTable}

### Strategy League Scoreboard
${strategyLeagueSection}

## 5) Recommendation Details
${planDetails}

## 6) Execution Priority and Next Actions
- Immediate: ${actionPlan.immediate}
- This Month: ${actionPlan.month}
- This Quarter: ${actionPlan.quarter}

## 7) Warnings / Disclaimer
${input.warnings.map((w) => `- ${w}`).join("\n")}
- This tool is not investment advice and is for decision support only.
- Final investment decisions and responsibility remain with the user.
- Results may change due to market regime shifts, data delays, or model limitations.
- Market quote timestamps and OCR confidence should be reviewed before execution.

## 8) Audit Log (Minimal Schema)
- Generated At: ${input.auditLog.generatedAt}
- Input Snapshot: principalBand=${input.auditLog.inputSnapshot.principalBand}, monthlyContributionBand=${input.auditLog.inputSnapshot.monthlyContributionBand}, positionCount=${input.auditLog.inputSnapshot.positionCount}, symbols=${input.auditLog.inputSnapshot.symbolsMasked}
- Rule Snapshot: maxMdd=${this.formatPct(input.auditLog.ruleSnapshot.maxMdd)}, maxVolatility=${this.formatPct(
      input.auditLog.ruleSnapshot.maxVolatility
    )}, maxCryptoWeight=${this.formatPct(input.auditLog.ruleSnapshot.maxCryptoWeight)}, maxSingleAssetWeight=${this.formatPct(
      input.auditLog.ruleSnapshot.maxSingleAssetWeight
    )}
- Market Snapshot: asOf=${input.auditLog.marketSnapshot.latestAsOf}, quoteCount=${input.auditLog.marketSnapshot.quoteCount}, usedQuoteCount=${input.auditLog.marketSnapshot.usedQuoteCount}, fallbackQuoteCount=${input.auditLog.marketSnapshot.fallbackQuoteCount}, missingPriceCount=${input.auditLog.marketSnapshot.missingPriceCount}, liveFetchAttemptedCount=${input.auditLog.marketSnapshot.liveFetchAttemptedCount}, liveFetchSuccessCount=${input.auditLog.marketSnapshot.liveFetchSuccessCount}, liveFetchSkippedByCapCount=${input.auditLog.marketSnapshot.liveFetchSkippedByCapCount}
- Warning Snapshot: count=${input.auditLog.warningSnapshot.count}, sample=${input.auditLog.warningSnapshot.sample.join(" / ")}
- Previous Integrity Hash: ${input.auditLog.previousIntegrityHash || "none"}
- Integrity Hash: ${input.auditLog.integrityHash}
- Chain Hash: ${input.auditLog.chainHash}

## 9) Audit Masking Rules
- Currency values are stored as KRW bands (nearest 1,000,000) instead of exact amounts.
- Symbols are masked as first/last character only (e.g., BTC -> B*C).
- Raw OCR JSON and personal identifiers are excluded from audit output by default.`;
  }

  buildPlanReasons(input) {
    const reasons = [];
    const { plan, currentBuckets, simulation, assumptions, input: contextInput, goalShortfall, concentrationBreached } = input;
    const baseGoalProbability = Number(contextInput.baseSimulation?.goalProbability) || 0;
    const topPosition = contextInput.portfolio?.topPosition || null;
    const dominantShift = this.describeDominantShift(currentBuckets, plan.buckets);

    if (plan.key === "A") {
      reasons.push(
        `This plan extends the horizon to ${input.targetYears} year(s) and raises monthly contribution to ${this.formatMoney(
          input.targetMonthlyContribution
        )} to recover from the current ${this.formatPct(baseGoalProbability)} goal probability shortfall.`
      );
    } else if (plan.key === "B") {
      reasons.push(
        `This plan keeps execution realistic by moving contribution to ${this.formatMoney(
          input.targetMonthlyContribution
        )} while avoiding a full defensive pivot away from growth assets.`
      );
    } else {
      reasons.push(
        `This plan prioritizes upside by combining a larger contribution (${this.formatMoney(
          input.targetMonthlyContribution
        )}) with a higher growth allocation and no extra horizon extension.`
      );
    }

    if (simulation.estimatedMdd > contextInput.params.maxMdd) {
      reasons.push(
        `Estimated MDD ${this.formatPct(simulation.estimatedMdd)} is still above the user cap ${this.formatPct(
          contextInput.params.maxMdd
        )}, so this allocation needs disciplined execution and explicit stop rules.`
      );
    } else {
      reasons.push(
        `Estimated MDD ${this.formatPct(simulation.estimatedMdd)} stays within the user cap ${this.formatPct(
          contextInput.params.maxMdd
        )}, which keeps downside closer to the requested tolerance.`
      );
    }

    if (dominantShift) {
      reasons.push(`${dominantShift} This keeps expected volatility near ${this.formatPct(assumptions.annualVolatility)}.`);
    }

    if (concentrationBreached && topPosition) {
      reasons.push(
        `It also dilutes the current single-name concentration around ${topPosition.symbol}, which is currently ${this.formatPct(
          topPosition.weight
        )}.`
      );
    }

    if (goalShortfall && reasons.length < 3) {
      reasons.push(
        `Because the current setup is below the 70% target-probability threshold, contribution and allocation changes are prioritized over cosmetic rebalancing.`
      );
    }

    if (contextInput.leagueContext?.count && reasons.length < 3) {
      const leagueAdjustment = Number(contextInput.leagueContext?.adjustments?.[plan.key] || 0);
      reasons.push(
        `League regime is ${contextInput.leagueContext.regime}, and this plan receives a ${leagueAdjustment.toFixed(
          1
        )}-point scoring adjustment from that signal.`
      );
    }

    while (reasons.length < 3) {
      reasons.push(
        `Projected goal probability ${this.formatPct(simulation.goalProbability)} and turnover ${this.formatPct(
          plan.turnover || 0
        )} remain visible enough to manage through routine quarterly reviews.`
      );
    }

    return reasons.slice(0, 3);
  }

  buildPlanChecklist(input) {
    const checklist = [];
    const { plan, targetYears, targetMonthlyContribution, targetBuckets, input: contextInput } = input;
    checklist.push(`Reset the portfolio toward ${this.formatBucketSummary(targetBuckets)}.`);
    checklist.push(`Update the monthly contribution schedule to ${this.formatMoney(targetMonthlyContribution)} and confirm it is cash-flow sustainable.`);
    if (plan.key === "C") {
      checklist.push(
        `Set a downgrade trigger to Plan B if realized drawdown exceeds ${this.formatPct(
          contextInput.params.maxMdd
        )} or if crypto weight drifts above ${this.formatPct(contextInput.params.maxCryptoWeight)}.`
      );
    } else if (plan.key === "A") {
      checklist.push(`Commit to rechecking goal probability and drawdown after ${targetYears} year(s) remains the intended horizon.`);
    } else {
      checklist.push(`Run a quarterly review to keep the plan aligned with the ${targetYears}-year horizon and market regime changes.`);
    }
    return checklist.slice(0, 3);
  }

  buildPlanFailureScenario(input) {
    const { plan, simulation, assumptions, input: contextInput, goalShortfall } = input;
    if (plan.key === "A") {
      return `If contribution increases are skipped or the investment horizon cannot extend beyond ${contextInput.params.years} years, this defensive plan may still miss the goal despite lower drawdown.`;
    }
    if (plan.key === "B") {
      return `If the balanced allocation is left un-rebalanced during a prolonged selloff, the portfolio can drift away from risk limits before the expected recovery kicks in.`;
    }
    if (simulation.estimatedMdd > contextInput.params.maxMdd || assumptions.annualVolatility > contextInput.params.maxVolatility) {
      return `A fast risk-off regime can push this aggressive plan beyond the stated loss tolerance and force an untimely exit before upside is realized.`;
    }
    if (goalShortfall) {
      return `Without maintaining the higher contribution level, this aggressive plan can still underdeliver on the target despite better upside potential.`;
    }
    return `A sharp macro shock or liquidity squeeze can invalidate the growth assumptions before the higher-return mix has time to work.`;
  }

  buildFreshnessMeta(marketContext, runAt) {
    const asOf = marketContext?.latestAsOf || null;
    const runAtIso = runAt || new Date().toISOString();
    const priceSourceList = Array.isArray(marketContext?.priceSources) && marketContext.priceSources.length
      ? marketContext.priceSources.join(", ")
      : marketContext?.quoteCount > 0
      ? "quote-source-unavailable"
      : "no-market-quotes";

    if (!asOf || !Number.isFinite(Date.parse(asOf))) {
      return {
        asOfDisplay: "n/a",
        runAtDisplay: this.formatTimestamp(runAtIso),
        priceSource: priceSourceList,
        fxSource: "native quote currency assumed",
        latencyLabel: "unknown",
        status: "UNKNOWN",
        note: marketContext?.quoteCount > 0 ? "Quote timestamps were not supplied, so freshness cannot be verified." : "No external market quotes were supplied for this run.",
      };
    }

    const latencyMs = Math.max(0, Date.parse(runAtIso) - Date.parse(asOf));
    const latencyHours = latencyMs / (1000 * 60 * 60);
    const status = latencyHours > 24 ? "STALE" : "FRESH";
    const note = status === "STALE"
      ? "Data is older than 24 hours. Refresh quotes before executing any rebalance."
      : marketContext?.fallbackQuoteCount > 0
      ? "Fresh enough for analysis, but at least one position relied on cached fallback quotes."
      : "Quote timestamps are recent enough for the current report.";

    return {
      asOfDisplay: this.formatTimestamp(asOf),
      runAtDisplay: this.formatTimestamp(runAtIso),
      priceSource: priceSourceList,
      fxSource: "native quote currency assumed",
      latencyLabel: this.formatLatency(latencyMs),
      status,
      note,
    };
  }

  buildKeyDiagnoses(input) {
    const diagnoses = [];
    if (input.simulation.goalProbability < 70) {
      diagnoses.push(
        `Current settings reach only ${this.formatPct(input.simulation.goalProbability)}, so either more monthly capital or more time is required to reach the stated goal.`
      );
    } else {
      diagnoses.push(`Current settings clear the 70% goal-probability threshold at ${this.formatPct(input.simulation.goalProbability)}.`);
    }

    const top = input.portfolio.topPosition;
    const singleAssetCap = Number(input.params?.maxSingleAssetWeight) || 35;
    if (top && Number.isFinite(top.weight) && top.weight > singleAssetCap) {
      diagnoses.push(`The portfolio is concentrated in ${top.symbol} at ${this.formatPct(top.weight)}, which amplifies drawdown risk and rebalancing urgency.`);
    } else {
      diagnoses.push(`No single position currently breaches the default concentration warning threshold in the analyzed snapshot.`);
    }

    if (input.freshnessMeta.status === "STALE") {
      diagnoses.push(`Market data is stale (${input.freshnessMeta.latencyLabel}), so recommendation quality is degraded until quotes are refreshed.`);
    } else if (input.topPlan) {
      diagnoses.push(`Plan ${input.topPlan.key} currently ranks highest, mainly because it best balances goal probability and drawdown under the active rule set.`);
    } else {
      diagnoses.push(`No recommendation ranking was available, so only base portfolio diagnostics are shown.`);
    }

    return diagnoses.slice(0, 3);
  }

  buildTickerAnalysisCards(input) {
    const positions = Array.isArray(input.portfolio?.positions) ? input.portfolio.positions : [];
    const maxSingleAssetWeight = Number(input.params?.maxSingleAssetWeight) || 35;
    const maxCryptoWeight = Number(input.params?.maxCryptoWeight) || 40;
    const runAtIso = input.runAt || new Date().toISOString();

    return positions
      .map((position) => {
        const targetGap =
          Number.isFinite(position.weight) && Number.isFinite(position.targetWeight) ? position.weight - position.targetWeight : null;
        const quoteTime = Date.parse(position.asOf || "");
        const quoteLatencyMs = Number.isFinite(quoteTime) ? Math.max(0, Date.parse(runAtIso) - quoteTime) : null;
        const expectedFreshHours = this.resolveQuoteFreshnessHours({ market: this.marketLabelForAssetType(position.assetType) });
        const quoteStatus = !Number.isFinite(quoteTime)
          ? position.priceSource === "note"
            ? "MANUAL"
            : "UNKNOWN"
          : quoteLatencyMs / (1000 * 60 * 60) > expectedFreshHours
          ? "STALE"
          : "FRESH";

        const warnings = [];
        if (!Number.isFinite(position.marketValue)) {
          warnings.push("Missing market price.");
        }
        if (Number.isFinite(position.weight) && position.weight > maxSingleAssetWeight) {
          warnings.push(`Weight ${this.formatPct(position.weight)} exceeds single-asset cap ${this.formatPct(maxSingleAssetWeight)}.`);
        }
        if (position.assetType === "crypto" && Number.isFinite(position.weight) && position.weight > maxCryptoWeight) {
          warnings.push(`Crypto sleeve weight ${this.formatPct(position.weight)} exceeds crypto cap ${this.formatPct(maxCryptoWeight)}.`);
        }
        if (Number.isFinite(targetGap) && Math.abs(targetGap) >= 5) {
          warnings.push(`${targetGap > 0 ? "Over" : "Under"} target by ${this.formatPct(Math.abs(targetGap))}.`);
        }
        if (quoteStatus === "STALE" && Number.isFinite(quoteLatencyMs)) {
          warnings.push(`Quote age ${this.formatLatency(quoteLatencyMs)} breaches freshness policy.`);
        }
        if (this.isLikelyLeveragedSymbol(position.symbol)) {
          warnings.push("Likely leveraged or inverse product. Confirm risk suitability.");
        }
        if (!warnings.length) {
          warnings.push("No immediate concentration or pricing warning.");
        }

        return {
          ...position,
          targetGap,
          quoteLatencyMs,
          quoteStatus,
          warnings,
          attentionScore: warnings.filter((warning) => !/^No immediate /.test(warning)).length,
        };
      })
      .sort((a, b) => {
        if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;
        return (b.marketValue || 0) - (a.marketValue || 0);
      });
  }

  buildScenarioAnalysis(input) {
    const buckets = this.normalizeBucketWeights(input.portfolio?.bucketWeights || {});
    const scenarioRuns = Math.min(240, Math.max(120, Math.floor((Number(input.params?.simulations) || 600) / 6)));
    const overrideMap = this.buildScenarioOverrideMap(input.params?.scenarioOverrides);
    return SCENARIO_DEFINITIONS.map((scenario) => {
      const scenarioDefinition = this.applyScenarioOverrides(scenario, overrideMap[scenario.key] || {});
      const assumptions = this.deriveScenarioAssumptions(buckets, input.assumptions, scenarioDefinition);
      const simulation = this.simulate({
        principal: Math.max(1, Number(input.principal) || 1),
        monthlyContribution: Math.max(0, Number(input.params?.monthlyContribution) || 0),
        years: Math.max(1, Number(input.params?.years) || 1),
        simulations: scenarioRuns,
        annualReturn: assumptions.annualReturn,
        annualVolatility: assumptions.annualVolatility,
        goalAmount: Math.max(0, Number(input.params?.goalAmount) || 0),
        randomSeed: `scenario:${scenario.key}:${Math.round(Number(input.principal) || 0)}:${Math.round(Number(input.params?.goalAmount) || 0)}:${Math.round(
          Number(input.params?.monthlyContribution) || 0
        )}:${Number(input.params?.years) || 0}`,
      });

      return {
        ...scenarioDefinition,
        assumptions,
        simulation,
        sharpe: this.computeSharpeRatio(assumptions.annualReturn, assumptions.annualVolatility),
        overrideRows: (overrideMap[scenario.key] || {}).rows || [],
      };
    });
  }

  buildScenarioOverrideMap(rows) {
    const out = {};
    const normalizedRows = Array.isArray(rows) ? rows : [];
    for (const rawRow of normalizedRows) {
      const scenario = this.normalizeScenarioKey(rawRow?.scenario);
      const assetType = this.normalizeScenarioAssetType(rawRow?.assetType);
      const returnShift = this.toNumber(rawRow?.returnShift);
      const volMultiplier = this.toNumber(rawRow?.volMultiplier);
      if (!Number.isFinite(returnShift) && !Number.isFinite(volMultiplier)) continue;
      if (!out[scenario]) out[scenario] = { returnShift: {}, volMultiplier: {}, rows: [] };
      if (assetType === "all") {
        for (const key of ["stock", "etf", "crypto", "cash", "other"]) {
          if (Number.isFinite(returnShift)) out[scenario].returnShift[key] = returnShift;
          if (Number.isFinite(volMultiplier)) out[scenario].volMultiplier[key] = volMultiplier;
        }
      } else {
        if (Number.isFinite(returnShift)) out[scenario].returnShift[assetType] = returnShift;
        if (Number.isFinite(volMultiplier)) out[scenario].volMultiplier[assetType] = volMultiplier;
      }
      out[scenario].rows.push({
        scenario,
        assetType,
        returnShift: Number.isFinite(returnShift) ? returnShift : null,
        volMultiplier: Number.isFinite(volMultiplier) ? volMultiplier : null,
      });
    }
    return out;
  }

  applyScenarioOverrides(scenario, overrides) {
    const next = {
      ...scenario,
      returnShift: { ...(scenario?.returnShift || {}) },
      volMultiplier: { ...(scenario?.volMultiplier || {}) },
    };

    for (const [assetType, value] of Object.entries(overrides?.returnShift || {})) {
      if (Number.isFinite(Number(value))) next.returnShift[assetType] = Number(value);
    }
    for (const [assetType, value] of Object.entries(overrides?.volMultiplier || {})) {
      if (Number.isFinite(Number(value))) next.volMultiplier[assetType] = Number(value);
    }

    return next;
  }

  deriveScenarioAssumptions(buckets, baseAssumptions, scenario) {
    const normalizedBuckets = this.normalizeBucketWeights(buckets || {});
    let annualReturn = 0;
    let variance = 0;

    for (const [assetType, weightPct] of Object.entries(normalizedBuckets)) {
      const weight = (Number(weightPct) || 0) / 100;
      const base = ASSET_ASSUMPTIONS[assetType] || ASSET_ASSUMPTIONS.other;
      const shiftedReturn = base.annualReturn + (Number(scenario?.returnShift?.[assetType]) || 0);
      const shiftedVolatility = base.annualVolatility * (Number(scenario?.volMultiplier?.[assetType]) || 1);
      annualReturn += weight * shiftedReturn;
      variance += Math.pow(weight * shiftedVolatility, 2);
    }

    if (!(annualReturn || variance)) {
      return {
        annualReturn:
          (Number(baseAssumptions?.annualReturn) || 0) + (Number(scenario?.returnShift?.stock) || 0) * 0.6 + (Number(scenario?.returnShift?.cash) || 0) * 0.4,
        annualVolatility:
          (Number(baseAssumptions?.annualVolatility) || 0) * (Number(scenario?.volMultiplier?.stock) || 1),
      };
    }

    return {
      annualReturn,
      annualVolatility: Math.sqrt(variance),
    };
  }

  renderScenarioAnalysis(scenarios) {
    if (!Array.isArray(scenarios) || !scenarios.length) {
      return "_Scenario analysis unavailable for the current input set._";
    }

    const table = [
      "| Scenario | Regime | Assumed Return | Assumed Vol | Sharpe | Goal Prob | P10 | P50 | P90 | Est MDD |",
      "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
      ...scenarios.map((scenario) => {
        return `| ${scenario.key} | ${scenario.label} | ${this.formatPct(scenario.assumptions.annualReturn)} | ${this.formatPct(
          scenario.assumptions.annualVolatility
        )} | ${Number.isFinite(scenario.sharpe) ? scenario.sharpe.toFixed(2) : "n/a"} | ${this.formatPct(
          scenario.simulation.goalProbability
        )} | ${this.formatMoney(scenario.simulation.p10)} | ${this.formatMoney(scenario.simulation.p50)} | ${this.formatMoney(
          scenario.simulation.p90
        )} | ${this.formatPct(scenario.simulation.estimatedMdd)} |`;
      }),
    ].join("\n");

    const notes = scenarios
      .map((scenario) => {
        const overrideSummary = (scenario.overrideRows || [])
          .map((row) => {
            const parts = [`${row.assetType}`];
            if (Number.isFinite(row.returnShift)) parts.push(`return ${this.formatSignedPct(row.returnShift)}`);
            if (Number.isFinite(row.volMultiplier)) parts.push(`vol x${Number(row.volMultiplier).toFixed(2)}`);
            return parts.join(" ");
          })
          .join("; ");
        return `- ${scenario.key}: ${scenario.note}${overrideSummary ? ` Override: ${overrideSummary}` : ""}`;
      })
      .join("\n");
    return [
      "- Regime scenarios are assumption-based stress views, not historical backtests.",
      table,
      notes,
    ].join("\n");
  }

  buildCorrelationMatrix(portfolio) {
    const allPositions = Array.isArray(portfolio?.positions) ? portfolio.positions : [];
    const corePositions = allPositions
      .filter((position) => Number.isFinite(position.marketValue) && position.assetType !== "cash")
      .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
      .slice(0, 5);
    const fallbackPositions = allPositions
      .filter((position) => Number.isFinite(position.marketValue))
      .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
      .slice(0, 5);
    const positions = corePositions.length >= 2 ? corePositions : fallbackPositions;
    const historicalView = this.buildHistoricalCorrelationMatrix(positions);
    if (historicalView) return historicalView;

    return {
      headingLabel: "Correlation Matrix (Proxy)",
      note: "Correlation values are proxy estimates derived from asset-type relationships, not downloaded covariance history.",
      positions,
      matrix: positions.map((rowPosition) =>
        positions.map((colPosition) => this.resolveCorrelationProxy(rowPosition, colPosition))
      ),
    };
  }

  resolveCorrelationProxy(a, b) {
    if (!a || !b) return null;
    if (String(a.symbol || "").toUpperCase() === String(b.symbol || "").toUpperCase()) return 1;
    const left = this.normalizeAssetType(a.assetType);
    const right = this.normalizeAssetType(b.assetType);
    const direct = CORRELATION_PROXY[left]?.[right];
    if (Number.isFinite(direct)) return direct;
    const reverse = CORRELATION_PROXY[right]?.[left];
    if (Number.isFinite(reverse)) return reverse;
    return 0;
  }

  buildHistoricalCorrelationMatrix(positions) {
    const list = Array.isArray(positions) ? positions.filter((position) => position?.symbol) : [];
    if (list.length < 2) return null;

    const returnSeriesBySymbol = new Map();
    const coverage = [];
    let earliestDate = null;
    let latestDate = null;

    for (const position of list) {
      const series = this.buildDailyReturnSeriesForSymbol(position.symbol);
      returnSeriesBySymbol.set(position.symbol, series);
      if (!series.size) continue;

      const dates = [...series.keys()].sort();
      coverage.push(`${position.symbol} ${series.size}d`);
      if (!earliestDate || dates[0] < earliestDate) earliestDate = dates[0];
      if (!latestDate || dates[dates.length - 1] > latestDate) latestDate = dates[dates.length - 1];
    }

    let historicalPairCount = 0;
    const totalPairCount = Math.max(0, (list.length * (list.length - 1)) / 2);
    const matrix = list.map((rowPosition, rowIndex) =>
      list.map((colPosition, colIndex) => {
        if (String(rowPosition.symbol || "").toUpperCase() === String(colPosition.symbol || "").toUpperCase()) return 1;

        const pairStats = this.computeHistoricalCorrelation(
          returnSeriesBySymbol.get(rowPosition.symbol),
          returnSeriesBySymbol.get(colPosition.symbol)
        );
        if (pairStats && Number.isFinite(pairStats.correlation)) {
          if (rowIndex < colIndex) historicalPairCount += 1;
          return pairStats.correlation;
        }

        return this.resolveCorrelationProxy(rowPosition, colPosition);
      })
    );

    if (historicalPairCount < 1) return null;

    const fullyHistorical = historicalPairCount === totalPairCount;
    return {
      headingLabel: fullyHistorical ? "Correlation Matrix (Historical)" : "Correlation Matrix (Historical + Proxy Fallback)",
      note: fullyHistorical
        ? "Correlation values use locally accumulated daily quote history."
        : "Correlation values use locally accumulated daily quote history where overlap is sufficient, with proxy fallback for uncovered pairs.",
      positions: list,
      matrix,
      historyWindow: earliestDate && latestDate ? `${earliestDate} to ${latestDate}` : null,
      historyCoverage: coverage.length ? `Daily return coverage: ${coverage.join(", ")}` : null,
      historyPairCoverage: `Historical pair coverage: ${historicalPairCount}/${totalPairCount}`,
    };
  }

  buildDailyReturnSeriesForSymbol(symbol) {
    const normalizedSymbol = String(symbol || "").trim().toUpperCase();
    const history = Array.isArray(this.quoteHistory?.[normalizedSymbol]) ? this.quoteHistory[normalizedSymbol] : [];
    if (history.length < 2) return new Map();

    const points = history
      .slice()
      .sort((a, b) => Date.parse(a.asOf || a.cachedAt || 0) - Date.parse(b.asOf || b.cachedAt || 0));
    const returns = new Map();

    for (let index = 1; index < points.length; index += 1) {
      const previousPrice = Number(points[index - 1]?.price);
      const currentPrice = Number(points[index]?.price);
      if (!(previousPrice > 0) || !(currentPrice > 0)) continue;

      const dateKey = this.quoteHistoryDayKey(points[index].asOf || points[index].cachedAt);
      if (!dateKey) continue;
      returns.set(dateKey, currentPrice / previousPrice - 1);
    }

    return returns;
  }

  computeHistoricalCorrelation(leftSeries, rightSeries) {
    if (!(leftSeries instanceof Map) || !(rightSeries instanceof Map)) return null;

    const left = [];
    const right = [];
    for (const [dateKey, leftValue] of leftSeries.entries()) {
      if (!rightSeries.has(dateKey)) continue;
      const rightValue = rightSeries.get(dateKey);
      if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) continue;
      left.push(leftValue);
      right.push(rightValue);
    }

    if (left.length < HISTORY_POLICY.minDailyReturnsForCorrelation) return null;
    const correlation = this.computePearsonCorrelation(left, right);
    if (!Number.isFinite(correlation)) return null;

    return {
      correlation: this.clamp(correlation, -1, 1),
      overlapCount: left.length,
    };
  }

  buildBucketReturnSeries(portfolio) {
    const positions = Array.isArray(portfolio?.positions) ? portfolio.positions : [];
    const bucketSeries = {};
    const bucketOrder = ["stock", "etf", "crypto", "other"];

    for (const assetType of bucketOrder) {
      const bucketPositions = positions.filter(
        (position) =>
          this.normalizeAssetType(position.assetType) === assetType &&
          Number.isFinite(position.marketValue) &&
          position.marketValue > 0
      );
      if (!bucketPositions.length) continue;

      const bucketValue = bucketPositions.reduce((sum, position) => sum + (Number(position.marketValue) || 0), 0);
      if (!(bucketValue > 0)) continue;

      const seriesItems = bucketPositions
        .map((position) => ({
          weight: (Number(position.marketValue) || 0) / bucketValue,
          series: this.buildDailyReturnSeriesForSymbol(position.symbol),
        }))
        .filter((item) => item.series.size > 0);
      if (!seriesItems.length) continue;

      const allDates = [...new Set(seriesItems.flatMap((item) => [...item.series.keys()]))].sort();
      const bucketMap = new Map();
      for (const dateKey of allDates) {
        let weightedReturn = 0;
        let coveredWeight = 0;

        for (const item of seriesItems) {
          if (!item.series.has(dateKey)) continue;
          weightedReturn += item.weight * item.series.get(dateKey);
          coveredWeight += item.weight;
        }

        if (coveredWeight < HISTORY_POLICY.minBucketCoverageWeight) continue;
        bucketMap.set(dateKey, weightedReturn / coveredWeight);
      }

      if (bucketMap.size >= HISTORY_POLICY.minDailyReturnsForRiskMetrics) {
        bucketSeries[assetType] = bucketMap;
      }
    }

    return bucketSeries;
  }

  buildPlanRiskAdjustedMetrics(input) {
    const assumptions = input?.assumptions || { annualReturn: 0, annualVolatility: 0 };
    const dailySeries = this.buildPlanDailyReturnSeries(input?.buckets, input?.bucketReturnSeries);
    if (Array.isArray(dailySeries) && dailySeries.length >= HISTORY_POLICY.minDailyReturnsForRiskMetrics) {
      return this.computeRiskAdjustedMetricsFromDailySeries(dailySeries);
    }

    const downsideDeviation = this.estimateDownsideDeviation(input?.buckets);
    return {
      source: "assumption-fallback",
      pointCount: 0,
      annualReturn: assumptions.annualReturn,
      annualVolatility: assumptions.annualVolatility,
      downsideDeviation,
      sharpe: this.computeSharpeRatio(assumptions.annualReturn, assumptions.annualVolatility),
      sortino: this.computeSortinoRatio(assumptions.annualReturn, downsideDeviation),
    };
  }

  buildPlanDailyReturnSeries(buckets, bucketReturnSeries) {
    const normalizedBuckets = this.normalizeBucketWeights(buckets || {});
    const requiredAssets = Object.entries(normalizedBuckets)
      .filter(([assetType, weight]) => assetType !== "cash" && Number(weight) >= 5)
      .map(([assetType]) => assetType);
    if (!requiredAssets.length) return null;

    const requiredSeries = requiredAssets.map((assetType) => bucketReturnSeries?.[assetType]).filter((series) => series instanceof Map);
    if (requiredSeries.length !== requiredAssets.length) return null;

    let commonDates = [...requiredSeries[0].keys()];
    for (const series of requiredSeries.slice(1)) {
      const availableDates = new Set(series.keys());
      commonDates = commonDates.filter((dateKey) => availableDates.has(dateKey));
    }

    if (commonDates.length < HISTORY_POLICY.minDailyReturnsForRiskMetrics) return null;
    commonDates.sort();

    const syntheticCashDaily = this.annualRateToDaily(ASSET_ASSUMPTIONS.cash.annualReturn);
    const dailySeries = [];
    for (const dateKey of commonDates) {
      let dailyReturn = (normalizedBuckets.cash || 0) / 100 * syntheticCashDaily;

      for (const [assetType, weight] of Object.entries(normalizedBuckets)) {
        if (assetType === "cash" || !(weight > 0)) continue;
        const series = bucketReturnSeries?.[assetType];
        if (series instanceof Map && series.has(dateKey)) {
          dailyReturn += (weight / 100) * series.get(dateKey);
        } else {
          dailyReturn += (weight / 100) * this.annualRateToDaily((ASSET_ASSUMPTIONS[assetType] || ASSET_ASSUMPTIONS.other).annualReturn);
        }
      }

      dailySeries.push(dailyReturn);
    }

    return dailySeries;
  }

  computeRiskAdjustedMetricsFromDailySeries(dailySeries, riskFreeRate = ASSET_ASSUMPTIONS.cash.annualReturn) {
    const returns = Array.isArray(dailySeries) ? dailySeries.map((value) => Number(value)).filter((value) => Number.isFinite(value)) : [];
    if (returns.length < HISTORY_POLICY.minDailyReturnsForRiskMetrics) return null;

    const dailyMean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const annualReturn = this.dailyMeanToAnnual(dailyMean);
    const dailyVolatility = this.computeStandardDeviation(returns);
    const annualVolatility = Number.isFinite(dailyVolatility) ? dailyVolatility * Math.sqrt(252) * 100 : null;
    const downsideDeviation = this.computeAnnualizedDownsideDeviation(returns, riskFreeRate);

    return {
      source: "historical-bucket-series",
      pointCount: returns.length,
      annualReturn,
      annualVolatility,
      downsideDeviation,
      sharpe: this.computeSharpeRatio(annualReturn, annualVolatility, riskFreeRate),
      sortino: this.computeSortinoRatio(annualReturn, downsideDeviation, riskFreeRate),
    };
  }

  estimateDownsideDeviation(buckets) {
    const normalizedBuckets = this.normalizeBucketWeights(buckets || {});
    let downsideVariance = 0;

    for (const [assetType, weightPct] of Object.entries(normalizedBuckets)) {
      const assumption = ASSET_ASSUMPTIONS[assetType] || ASSET_ASSUMPTIONS.other;
      const downsideFactor = DOWNSIDE_VOL_FACTOR[assetType] || DOWNSIDE_VOL_FACTOR.other;
      const weightedDownside = (weightPct / 100) * assumption.annualVolatility * downsideFactor;
      downsideVariance += weightedDownside * weightedDownside;
    }

    return Math.sqrt(downsideVariance);
  }

  buildRecommendationScoreComponents(input) {
    const goalScore = this.clamp(Number(input?.goalProbability) || 0, 0, 100);
    const returnScore = this.clamp(Number(input?.returnScore) || 0, 0, 100);
    const riskScore = this.clamp(Number(input?.riskScore) || 0, 0, 100);
    const costScore = this.clamp(Number(input?.costScore) || 0, 0, 100);
    const sharpeScore = this.normalizeMetricScore(input?.riskAdjustedMetrics?.sharpe, -0.25, 1.5);
    const sortinoScore = this.normalizeMetricScore(input?.riskAdjustedMetrics?.sortino, -0.25, 2.25);
    const total = this.clamp(
      0.36 * goalScore + 0.17 * returnScore + 0.15 * riskScore + 0.08 * costScore + 0.11 * sharpeScore + 0.13 * sortinoScore,
      0,
      100
    );

    return {
      goalScore,
      returnScore,
      riskScore,
      costScore,
      sharpeScore,
      sortinoScore,
      total,
    };
  }

  normalizeMetricScore(value, floor, ceiling) {
    const metric = Number(value);
    const min = Number(floor);
    const max = Number(ceiling);
    if (!Number.isFinite(metric) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 50;
    return this.clamp(((metric - min) / (max - min)) * 100, 0, 100);
  }

  renderCorrelationMatrix(view) {
    const positions = Array.isArray(view?.positions) ? view.positions : [];
    if (positions.length < 2) {
      return "_Need at least two priced positions to render a correlation view._";
    }

    const header = ["Symbol", ...positions.map((position) => position.symbol)];
    const rows = positions.map((rowPosition, rowIndex) => {
      const values = (view.matrix?.[rowIndex] || []).map((value) => (Number.isFinite(value) ? value.toFixed(2) : "n/a"));
      return `| ${rowPosition.symbol} | ${values.join(" | ")} |`;
    });

    return [
      `- ${view.note}`,
      view.historyWindow ? `- History window: ${view.historyWindow}` : null,
      view.historyCoverage ? `- ${view.historyCoverage}` : null,
      view.historyPairCoverage ? `- ${view.historyPairCoverage}` : null,
      `- Core assets shown: ${positions.map((position) => `${position.symbol} (${position.assetType})`).join(", ")}`,
      `| ${header.join(" | ")} |`,
      `|${header.map(() => "---").join("|")}|`,
      ...rows,
    ]
      .filter(Boolean)
      .join("\n");
  }

  renderTickerAnalysisCards(cards) {
    if (!Array.isArray(cards) || !cards.length) {
      return "_No portfolio positions available for ticker-level analysis._";
    }

    return cards
      .map((card) => {
        const value = Number.isFinite(card.marketValue) ? this.formatMoney(card.marketValue) : "n/a";
        const weight = Number.isFinite(card.weight) ? this.formatPct(card.weight) : "n/a";
        const targetWeight = Number.isFinite(card.targetWeight) ? this.formatPct(card.targetWeight) : "n/a";
        const gap = Number.isFinite(card.targetGap) ? this.formatSignedPct(card.targetGap) : "n/a";
        const avgPrice = Number.isFinite(card.avgPrice) ? this.formatMoney(card.avgPrice) : "n/a";
        const marketPrice = Number.isFinite(card.marketPrice) ? this.formatMoney(card.marketPrice) : "n/a";
        const pnl = Number.isFinite(card.unrealizedPnl) ? this.formatSignedMoney(card.unrealizedPnl) : "n/a";
        const pnlPct = Number.isFinite(card.unrealizedPnlPct) ? this.formatSignedPct(card.unrealizedPnlPct) : "n/a";
        const asOf = card.asOf ? this.formatTimestamp(card.asOf) : "n/a";
        const warnings = (card.warnings || []).slice(0, 3).join(" / ");

        return [
          `#### ${card.symbol}`,
          `- Snapshot: ${card.assetType}, value ${value}, weight ${weight}, qty ${this.prettyNum(card.quantity)}, price ${marketPrice}, avgPrice ${avgPrice}`,
          `- PnL: ${pnl} / ${pnlPct}`,
          `- Allocation: target ${targetWeight}, gap ${gap}, source ${card.priceSource}, quoteStatus ${card.quoteStatus}, asOf ${asOf}`,
          `- Warnings: ${warnings}`,
        ].join("\n");
      })
      .join("\n\n");
  }

  buildStrategyLeagueScoreboard(recommendations) {
    const entries = (Array.isArray(recommendations) ? recommendations : []).map((plan) => {
      const scoreComponents = plan.scoreComponents || {};
      const survivalScore = this.clamp(Number(scoreComponents.riskScore) || 0, 0, 100);
      const returnScore = this.clamp(Number(scoreComponents.returnScore) || 0, 0, 100);
      const sharpeScore = this.clamp(
        Number.isFinite(Number(scoreComponents.sharpeScore))
          ? Number(scoreComponents.sharpeScore)
          : this.normalizeMetricScore(plan.riskAdjustedMetrics?.sharpe, -0.25, 1.5),
        0,
        100
      );
      const sortinoScore = this.clamp(
        Number.isFinite(Number(scoreComponents.sortinoScore))
          ? Number(scoreComponents.sortinoScore)
          : this.normalizeMetricScore(plan.riskAdjustedMetrics?.sortino, -0.25, 2.25),
        0,
        100
      );
      const riskAdjustedScore = (sharpeScore + sortinoScore) / 2;
      const stabilityScore = this.derivePlanStabilityScore(plan);
      const costEfficiencyScore = this.clamp(Number(scoreComponents.costScore) || 0, 0, 100);
      const tailRiskScore = this.derivePlanTailRiskScore(plan);
      const leagueScore =
        0.25 * survivalScore +
        0.25 * returnScore +
        0.2 * riskAdjustedScore +
        0.15 * stabilityScore +
        0.1 * costEfficiencyScore +
        0.05 * tailRiskScore;

      return {
        key: plan.key,
        name: plan.name,
        leagueScore: this.clamp(leagueScore, 0, 100),
        survivalScore,
        returnScore,
        riskAdjustedScore,
        stabilityScore,
        costEfficiencyScore,
        tailRiskScore,
        edgeNote: this.describeLeagueEdge({
          survivalScore,
          returnScore,
          riskAdjustedScore,
          stabilityScore,
          costEfficiencyScore,
          tailRiskScore,
        }),
      };
    });

    const ranked = entries
      .slice()
      .sort((a, b) => b.leagueScore - a.leagueScore)
      .map((entry, index) => ({
        ...entry,
        leagueRank: index + 1,
      }));

    return {
      note: "League score uses identical starting capital, same simulation rules, and weighted survival-first scoring.",
      entries: ranked,
    };
  }

  derivePlanStabilityScore(plan) {
    const p10 = Number(plan?.simulation?.p10);
    const p50 = Number(plan?.simulation?.p50);
    const p90 = Number(plan?.simulation?.p90);
    if (!(p10 > 0) || !(p50 > 0) || !(p90 > 0)) return 50;

    const spreadRatio = Math.max(0, (p90 - p10) / p50);
    const drawdownPenalty = Math.max(0, Number(plan?.simulation?.estimatedMdd) || 0) * 0.6;
    const penalty = spreadRatio * 35 + drawdownPenalty;
    return this.clamp(100 - penalty, 0, 100);
  }

  derivePlanTailRiskScore(plan) {
    const mddPenalty = Math.max(0, Number(plan?.simulation?.estimatedMdd) || 0) * 1.6;
    const volPenalty = Math.max(0, Number(plan?.assumptions?.annualVolatility) || 0) * 0.8;
    return this.clamp(100 - mddPenalty - volPenalty, 0, 100);
  }

  describeLeagueEdge(scores) {
    const dimensions = [
      ["survival-first risk control", Number(scores?.survivalScore) || 0],
      ["return potential", Number(scores?.returnScore) || 0],
      ["Sharpe/Sortino quality", Number(scores?.riskAdjustedScore) || 0],
      ["stability", Number(scores?.stabilityScore) || 0],
      ["cost efficiency", Number(scores?.costEfficiencyScore) || 0],
      ["tail-risk containment", Number(scores?.tailRiskScore) || 0],
    ].sort((a, b) => b[1] - a[1]);

    return `Best edge: ${dimensions[0][0]}.`;
  }

  renderStrategyLeagueScoreboard(view) {
    const entries = Array.isArray(view?.entries) ? view.entries : [];
    if (!entries.length) return "_No recommendation plans available for league scoring._";

    return [
      `- ${view.note}`,
      "| Rank | Plan | Survival | Return | Risk-Adj | Stability | Cost | Tail | League Score | Edge |",
      "|---|---|---:|---:|---:|---:|---:|---:|---:|---|",
      ...entries.map((entry) => {
        return `| #${entry.leagueRank} | ${entry.key} (${entry.name}) | ${entry.survivalScore.toFixed(1)} | ${entry.returnScore.toFixed(
          1
        )} | ${entry.riskAdjustedScore.toFixed(1)} | ${entry.stabilityScore.toFixed(1)} | ${entry.costEfficiencyScore.toFixed(
          1
        )} | ${entry.tailRiskScore.toFixed(1)} | ${entry.leagueScore.toFixed(1)} | ${entry.edgeNote} |`;
      }),
    ].join("\n");
  }

  buildActionPlan(input) {
    const topPlan = input.recommendations.find((plan) => plan.isTopRecommendation) || input.recommendations[0] || null;
    const hasMissingPrice = input.warnings.some((warning) => /missing price/i.test(String(warning)));
    const stale = input.freshnessMeta.status === "STALE";
    const unknownWithoutQuotes =
      input.freshnessMeta.status === "UNKNOWN" && (Number(input.portfolio?.marketContext?.quoteCount) || 0) === 0;
    const leadSymbolTrade = topPlan?.rebalance?.symbolTrades?.[0] || null;
    const leadTrade = topPlan?.rebalance?.actions?.find((action) => action.assetType !== "cash") || topPlan?.rebalance?.actions?.[0] || null;
    const immediate = stale || hasMissingPrice
      ? `Refresh market quotes first, then confirm whether Plan ${topPlan?.key || "A"} is still the best-ranked option before trading.`
      : unknownWithoutQuotes
      ? `Use Plan ${topPlan?.key || "A"} as a practice baseline, then add or confirm fresh prices before placing any real trade.`
      : leadSymbolTrade
      ? `Choose Plan ${topPlan?.key || "A"} as the working baseline and start with ${leadSymbolTrade.verb} ${leadSymbolTrade.symbol} ${this.formatMoney(leadSymbolTrade.amount)}.`
      : leadTrade
      ? `Choose Plan ${topPlan?.key || "A"} as the working baseline and start with ${leadTrade.verb} ${leadTrade.assetType} ${this.formatMoney(leadTrade.amount)}.`
      : `Choose Plan ${topPlan?.key || "A"} as the working baseline and execute the first rebalance in the most overweight asset.`;
    const month = topPlan
      ? `Move monthly contribution toward ${this.formatMoney(topPlan.adjustments.monthlyContribution.target)} and complete gross trades around ${this.formatMoney(
          topPlan.rebalance?.grossTradeValue || 0
        )} toward ${this.formatBucketSummary(topPlan.adjustments.buckets)}.`
      : `Stabilize inputs, then rerun the report after fresh quotes are available.`;
    const quarter = `Re-run the report quarterly, compare realized drawdown against ${this.formatPct(
      input.params.maxMdd
    )}, and downgrade risk if the top-ranked plan changes.`;
    return { immediate, month, quarter };
  }

  buildRebalancePlan(input) {
    const totalMarketValue = Number(input.portfolio?.totalMarketValue) || 0;
    const targetBuckets = this.normalizeBucketWeights(input.targetBuckets || {});
    const currentByBucket = { stock: 0, etf: 0, crypto: 0, cash: 0, other: 0 };
    const positions = Array.isArray(input.portfolio?.positions) ? input.portfolio.positions : [];

    for (const position of positions) {
      if (!Number.isFinite(position.marketValue)) continue;
      currentByBucket[position.assetType] = (currentByBucket[position.assetType] || 0) + position.marketValue;
    }

    const minTradeAmount = Math.max(0, Number(input.params?.minTradeAmount) || 0);
    const actions = [];
    const symbolTrades = [];
    for (const assetType of Object.keys(currentByBucket)) {
      const currentValue = currentByBucket[assetType] || 0;
      const targetWeight = Number(targetBuckets[assetType]) || 0;
      const targetValue = totalMarketValue * (targetWeight / 100);
      const delta = targetValue - currentValue;
      const amount = this.roundCurrencyStep(Math.abs(delta), 1000);
      if (!(amount > 0)) continue;
      if (minTradeAmount > 0 && amount < minTradeAmount) continue;

      const sleevePositions = positions
        .filter((position) => position.assetType === assetType)
        .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));

      const action = {
        assetType,
        verb: this.resolveTradeVerb(assetType, delta),
        amount,
        delta,
        currentValue,
        targetValue,
        currentWeight: totalMarketValue > 0 ? (currentValue / totalMarketValue) * 100 : 0,
        targetWeight,
        note: this.buildRebalanceActionNote(assetType, sleevePositions, delta),
      };
      const actionSymbolTrades = this.buildSymbolTradesForAction({
        action,
        sleevePositions,
        totalMarketValue,
        params: input.params,
      });
      if (actionSymbolTrades.length) {
        action.symbolTrades = actionSymbolTrades;
        symbolTrades.push(...actionSymbolTrades);
      }

      actions.push(action);
    }

    actions.sort((a, b) => {
      if (a.assetType === "cash" && b.assetType !== "cash") return 1;
      if (a.assetType !== "cash" && b.assetType === "cash") return -1;
      return b.amount - a.amount;
    });
    symbolTrades.sort((a, b) => {
      if (a.isPlaceholder && !b.isPlaceholder) return 1;
      if (!a.isPlaceholder && b.isPlaceholder) return -1;
      return b.amount - a.amount;
    });

    const billableActions = actions.filter((action) => action.assetType !== "cash");
    const grossBuyValue = billableActions.filter((action) => action.delta > 0).reduce((acc, action) => acc + action.amount, 0);
    const grossSellValue = billableActions.filter((action) => action.delta < 0).reduce((acc, action) => acc + action.amount, 0);
    const grossTradeValue = grossBuyValue + grossSellValue;
    const estimatedFee = grossTradeValue * (Math.max(0, Number(input.params?.rebalanceFeePct) || 0) / 100);
    const estimatedSellTax = grossSellValue * (Math.max(0, Number(input.params?.sellTaxPct) || 0) / 100);

    return {
      actions,
      symbolTrades,
      grossBuyValue,
      grossSellValue,
      grossTradeValue,
      estimatedFee,
      estimatedSellTax,
      netCashImpact: grossSellValue - grossBuyValue - estimatedFee - estimatedSellTax,
    };
  }

  renderRebalanceTable(rebalance) {
    if (!rebalance?.actions?.length) {
      return "- No trade exceeds the configured minimum trade amount.";
    }

    return [
      "| Action | Sleeve | Current | Target | Delta | Note |",
      "|---|---|---:|---:|---:|---|",
      ...rebalance.actions.map((action) => {
        const deltaLabel = `${action.delta >= 0 ? "+" : "-"}${this.formatMoney(action.amount)}`;
        return `| ${action.verb} | ${action.assetType} | ${this.formatMoney(action.currentValue)} | ${this.formatMoney(
          action.targetValue
        )} | ${deltaLabel} | ${action.note} |`;
      }),
    ].join("\n");
  }

  renderSymbolTradeTable(rebalance) {
    if (!rebalance?.symbolTrades?.length) {
      return "- No symbol-level order could be derived from the current sleeve composition.";
    }

    return [
      "| Action | Symbol | Sleeve | Amount | Basis | Note |",
      "|---|---|---|---:|---|---|",
      ...rebalance.symbolTrades.map((trade) => {
        return `| ${trade.verb} | ${trade.symbol} | ${trade.assetType} | ${this.formatMoney(trade.amount)} | ${trade.basis} | ${trade.note} |`;
      }),
    ].join("\n");
  }

  buildSymbolTradesForAction(input) {
    const { action, sleevePositions, totalMarketValue } = input;
    if (!action || action.assetType === "cash") return [];

    const tradePositions = (sleevePositions || []).filter((position) => Number.isFinite(position.marketValue));
    if (!tradePositions.length) {
      return [
        {
          symbol: `${String(action.assetType || "asset").toUpperCase()}_NEW`,
          assetType: action.assetType,
          verb: action.verb,
          amount: action.amount,
          basis: "preferred-instrument",
          note: `No existing ${action.assetType} position is available. Route this sleeve through the preferred instrument manually.`,
          isPlaceholder: true,
        },
      ];
    }

    const explicitCandidates = tradePositions
      .filter((position) => Number.isFinite(position.targetWeight))
      .map((position) => {
        const targetValue = totalMarketValue * (Number(position.targetWeight) / 100);
        const gap = action.delta >= 0 ? targetValue - (position.marketValue || 0) : (position.marketValue || 0) - targetValue;
        return {
          position,
          score: Math.max(0, gap),
        };
      })
      .filter((candidate) => candidate.score > 0);

    const fallbackCandidates = tradePositions.map((position) => ({
      position,
      score: Math.max(1, Number(position.marketValue) || 0),
    }));

    const candidates = explicitCandidates.length ? explicitCandidates : fallbackCandidates;
    const basis = explicitCandidates.length ? "targetWeight" : "current-sleeve-weight";
    const allocations = this.distributeAmountByScores(
      candidates.map((candidate) => ({
        key: candidate.position.symbol,
        score: candidate.score,
      })),
      action.amount,
      1000
    );
    const allocationMap = new Map(allocations.map((allocation) => [allocation.key, allocation.amount]));

    return candidates
      .map((candidate) => {
        const amount = allocationMap.get(candidate.position.symbol) || 0;
        if (!(amount > 0)) return null;
        return {
          symbol: candidate.position.symbol,
          assetType: action.assetType,
          verb: action.verb,
          amount,
          basis,
          note: this.buildSymbolTradeNote(candidate.position, action, basis),
          isPlaceholder: false,
        };
      })
      .filter(Boolean);
  }

  buildSymbolTradeNote(position, action, basis) {
    if (basis === "targetWeight" && Number.isFinite(position.targetWeight)) {
      return `Uses note targetWeight ${this.formatPct(position.targetWeight)} as the primary rebalance anchor.`;
    }
    if (action.delta >= 0) {
      return "Distributed by current sleeve mix because no symbol-level targetWeight was provided.";
    }
    return "Trimmed in proportion to current sleeve size because no symbol-level targetWeight was provided.";
  }

  distributeAmountByScores(items, totalAmount, step = 1000) {
    const normalizedTotal = this.roundCurrencyStep(totalAmount, step);
    if (!(normalizedTotal > 0) || !Array.isArray(items) || !items.length) return [];

    const cleaned = items
      .map((item) => ({
        key: item.key,
        score: Math.max(0, Number(item.score) || 0),
      }))
      .filter((item) => item.key);

    if (!cleaned.length) return [];
    const scoreSum = cleaned.reduce((acc, item) => acc + item.score, 0) || cleaned.length;
    const base = cleaned.map((item) => {
      const raw = scoreSum > 0 ? (normalizedTotal * item.score) / scoreSum : normalizedTotal / cleaned.length;
      const roundedDown = Math.floor(raw / step) * step;
      return {
        key: item.key,
        raw,
        rounded: roundedDown,
        fraction: raw - roundedDown,
      };
    });

    let remainder = normalizedTotal - base.reduce((acc, item) => acc + item.rounded, 0);
    base.sort((a, b) => b.fraction - a.fraction);
    let index = 0;
    while (remainder >= step && base.length > 0) {
      base[index % base.length].rounded += step;
      remainder -= step;
      index += 1;
    }

    return base.map((item) => ({
      key: item.key,
      amount: item.rounded,
    }));
  }

  resolveTradeVerb(assetType, delta) {
    if (assetType === "cash") {
      return delta >= 0 ? "RAISE" : "DEPLOY";
    }
    return delta >= 0 ? "BUY" : "SELL";
  }

  buildRebalanceActionNote(assetType, positions, delta) {
    const symbols = positions.map((position) => position.symbol).filter(Boolean);
    if (assetType === "cash") {
      return delta >= 0 ? "Raise cash buffer from trims in risk sleeves." : "Deploy idle cash into underweight sleeves.";
    }
    if (!symbols.length) {
      return delta >= 0 ? `Open a new ${assetType} sleeve or use the preferred instrument for this bucket.` : `No existing ${assetType} sleeve is available to trim directly.`;
    }
    if (delta >= 0) {
      return `Add into ${symbols.slice(0, 2).join(", ")} or the preferred ${assetType} instrument.`;
    }
    return `Trim ${symbols.slice(0, 2).join(", ")} proportionally to fund other sleeves.`;
  }

  describeDominantShift(currentBuckets, targetBuckets) {
    const keys = ["stock", "etf", "crypto", "cash", "other"];
    const shifts = keys
      .map((key) => ({
        key,
        delta: (targetBuckets[key] || 0) - (currentBuckets[key] || 0),
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const dominant = shifts.find((item) => Math.abs(item.delta) >= 1);
    if (!dominant) return "";
    const direction = dominant.delta > 0 ? "adds" : "cuts";
    return `The biggest allocation change ${direction} ${Math.abs(dominant.delta).toFixed(1)}% in ${dominant.key}.`;
  }

  buildAuditLog(input) {
    const symbols = (input.portfolio.positions || []).map((p) => this.maskSymbol(p.symbol));
    const auditLog = {
      generatedAt: new Date().toISOString(),
      inputSnapshot: {
        principalBand: this.bandCurrency(input.principal),
        monthlyContributionBand: this.bandCurrency(input.params.monthlyContribution),
        positionCount: input.portfolio.positions.length,
        symbolsMasked: symbols.join(", ") || "n/a",
      },
      ruleSnapshot: {
        maxMdd: input.params.maxMdd,
        maxVolatility: input.params.maxVolatility,
        maxCryptoWeight: input.params.maxCryptoWeight,
        maxSingleAssetWeight: input.params.maxSingleAssetWeight,
      },
      marketSnapshot: {
        latestAsOf: input.portfolio.marketContext.latestAsOf || "n/a",
        quoteCount: Number(input.portfolio.marketContext.quoteCount) || 0,
        usedQuoteCount: Number(input.portfolio.marketContext.usedQuoteCount) || 0,
        fallbackQuoteCount: Number(input.portfolio.marketContext.fallbackQuoteCount) || 0,
        missingPriceCount: Number(input.portfolio.marketContext.missingPriceCount) || 0,
        liveFetchAttemptedCount: Number(input.portfolio.marketContext.liveFetchAttemptedCount) || 0,
        liveFetchSuccessCount: Number(input.portfolio.marketContext.liveFetchSuccessCount) || 0,
        liveFetchSkippedByCapCount: Number(input.portfolio.marketContext.liveFetchSkippedByCapCount) || 0,
      },
      warningSnapshot: {
        count: input.warnings.length,
        sample: input.warnings.slice(0, 2),
      },
    };

    const previousIntegrityHash = input.params?.previousAuditIntegrityHash || null;
    const integrityHash = this.computeAuditIntegrityHash(auditLog);

    return {
      ...auditLog,
      previousIntegrityHash,
      integrityHash,
      chainHash: this.computeAuditChainHash(previousIntegrityHash, integrityHash),
    };
  }

  sanitizeQuoteCache(rawCache) {
    const cache = {};
    for (const [symbol, quote] of Object.entries(rawCache || {})) {
      if (!quote || !Number.isFinite(Number(quote.price))) continue;
      const normalizedSymbol = String(symbol).toUpperCase();
      const normalizedQuote = {
        symbol: normalizedSymbol,
        price: Number(quote.price),
        currency: quote.currency || "USD",
        market: quote.market || "unknown",
        source: quote.source || "cache",
        asOf: quote.asOf || new Date().toISOString(),
        cachedAt: quote.cachedAt || new Date().toISOString(),
      };
      const expectedHash = this.computeQuoteIntegrityHash(normalizedQuote);
      if (quote.integrityHash && quote.integrityHash !== expectedHash) continue;
      if (!this.isQuoteWithinCacheTtl(normalizedQuote)) continue;
      cache[normalizedSymbol] = {
        ...normalizedQuote,
        integrityHash: quote.integrityHash || expectedHash,
      };
    }
    return cache;
  }

  sanitizeQuoteHistory(rawHistory) {
    const history = {};
    for (const [symbol, entries] of Object.entries(rawHistory || {})) {
      const normalizedSymbol = String(symbol || "").trim().toUpperCase();
      if (!normalizedSymbol) continue;

      const bucket = [];
      for (const entry of Array.isArray(entries) ? entries : []) {
        const point = this.normalizeQuoteHistoryPoint(normalizedSymbol, entry);
        if (!point) continue;
        this.upsertQuoteHistoryPoint(bucket, point);
      }

      const trimmed = this.trimQuoteHistoryPoints(bucket);
      if (trimmed.length) history[normalizedSymbol] = trimmed;
    }
    return history;
  }

  updateQuoteCache(quotes) {
    if (!quotes || !Object.keys(quotes).length) return;
    const nowIso = new Date().toISOString();
    this.quoteCache = this.quoteCache || {};
    this.quoteHistory = this.quoteHistory || {};
    const normalizedQuotes = {};

    for (const [symbol, quote] of Object.entries(quotes)) {
      const normalizedSymbol = String(symbol || quote?.symbol || "").trim().toUpperCase();
      const price = Number(quote?.price);
      if (!normalizedSymbol || !(price > 0)) continue;

      const normalizedQuote = {
        symbol: normalizedSymbol,
        price,
        currency: this.normalizeCurrencyLabel(quote?.currency || this.defaultCurrencyForSymbol(normalizedSymbol)) || "USD",
        market: this.normalizeMarketLabel(quote?.market || "unknown"),
        source: String(quote?.source || "cache"),
        asOf: String(quote?.asOf || nowIso),
        cachedAt: nowIso,
      };
      normalizedQuotes[normalizedSymbol] = normalizedQuote;
      this.quoteCache[normalizedSymbol] = {
        ...normalizedQuote,
        integrityHash: this.computeQuoteIntegrityHash(normalizedQuote),
      };
    }

    this.recordQuoteHistory(normalizedQuotes);

    const entries = Object.entries(this.quoteCache)
      .filter(([, quote]) => this.isQuoteWithinCacheTtl(quote))
      .sort((a, b) => {
        const ta = Date.parse(a[1]?.cachedAt || 0);
        const tb = Date.parse(b[1]?.cachedAt || 0);
        return tb - ta;
      });

    this.quoteCache = Object.fromEntries(entries.slice(0, MARKET_POLICY.maxCacheEntries));
    this.saveSettings().catch(() => {});
  }

  recordQuoteHistory(quotes) {
    if (!quotes || !Object.keys(quotes).length) return;
    this.quoteHistory = this.quoteHistory || {};

    for (const [symbol, quote] of Object.entries(quotes)) {
      const normalizedSymbol = String(symbol || quote?.symbol || "").trim().toUpperCase();
      const point = this.normalizeQuoteHistoryPoint(normalizedSymbol, quote);
      if (!point) continue;

      const bucket = Array.isArray(this.quoteHistory[normalizedSymbol]) ? this.quoteHistory[normalizedSymbol].slice() : [];
      this.upsertQuoteHistoryPoint(bucket, point);
      this.quoteHistory[normalizedSymbol] = this.trimQuoteHistoryPoints(bucket);
    }
  }

  normalizeQuoteHistoryPoint(symbol, quote) {
    const normalizedSymbol = String(symbol || quote?.symbol || "").trim().toUpperCase();
    const price = Number(quote?.price);
    const asOfSource = quote?.asOf || quote?.cachedAt;
    const asOfTime = Date.parse(asOfSource || "");
    if (!normalizedSymbol || !(price > 0) || !Number.isFinite(asOfTime)) return null;

    const cachedAtTime = Date.parse(quote?.cachedAt || asOfSource || "");
    return {
      symbol: normalizedSymbol,
      price,
      currency: this.normalizeCurrencyLabel(quote?.currency || this.defaultCurrencyForSymbol(normalizedSymbol)) || "USD",
      market: this.normalizeMarketLabel(quote?.market || "unknown"),
      source: String(quote?.source || "cache"),
      asOf: new Date(asOfTime).toISOString(),
      cachedAt: Number.isFinite(cachedAtTime) ? new Date(cachedAtTime).toISOString() : new Date(asOfTime).toISOString(),
    };
  }

  upsertQuoteHistoryPoint(points, point) {
    const pointDay = this.quoteHistoryDayKey(point?.asOf || point?.cachedAt);
    if (!pointDay) return false;

    const pointTime = Date.parse(point.asOf || point.cachedAt || 0);
    for (let index = 0; index < points.length; index += 1) {
      const existing = points[index];
      if (this.quoteHistoryDayKey(existing?.asOf || existing?.cachedAt) !== pointDay) continue;

      const existingTime = Date.parse(existing?.asOf || existing?.cachedAt || 0);
      if (!Number.isFinite(existingTime) || pointTime >= existingTime) {
        points[index] = point;
        return true;
      }
      return false;
    }

    points.push(point);
    return true;
  }

  trimQuoteHistoryPoints(points) {
    return (Array.isArray(points) ? points : [])
      .slice()
      .sort((a, b) => Date.parse(a.asOf || a.cachedAt || 0) - Date.parse(b.asOf || b.cachedAt || 0))
      .slice(-HISTORY_POLICY.maxDailyPointsPerSymbol);
  }

  quoteHistoryDayKey(value) {
    const ts = Date.parse(value || "");
    if (!Number.isFinite(ts)) return null;
    return new Date(ts).toISOString().slice(0, 10);
  }

  resolveQuoteFreshnessHours(quote) {
    const marketKey = this.normalizeMarketLabel(quote?.market || "unknown");
    const marketPolicy = MARKET_POLICY.maxQuoteAgeHoursByMarket || {};
    if (Number.isFinite(marketPolicy[marketKey])) return marketPolicy[marketKey];
    return marketPolicy.unknown || MARKET_POLICY.maxQuoteAgeHours;
  }

  isQuoteWithinCacheTtl(quote) {
    const ttlHours = Number(MARKET_POLICY.cacheTtlHours);
    if (!(ttlHours > 0)) return true;

    const quoteTime = Date.parse(quote?.cachedAt || quote?.asOf || 0);
    if (!Number.isFinite(quoteTime)) return false;

    const ageHours = (Date.now() - quoteTime) / (1000 * 60 * 60);
    return ageHours <= ttlHours;
  }

  resolveQuoteForSymbol(symbol, marketQuotes) {
    const liveQuote = marketQuotes?.[symbol];
    if (liveQuote) return { quote: liveQuote, fallbackApplied: false };

    const cachedQuote = this.quoteCache?.[symbol];
    if (!cachedQuote) return { quote: null, fallbackApplied: false };
    if (!this.isQuoteWithinCacheTtl(cachedQuote)) return { quote: null, fallbackApplied: false };

    const expectedHash = this.computeQuoteIntegrityHash(cachedQuote);
    if (cachedQuote.integrityHash && cachedQuote.integrityHash !== expectedHash) {
      return { quote: null, fallbackApplied: false };
    }

    const quoteTime = Date.parse(cachedQuote.asOf || cachedQuote.cachedAt || 0);
    const ageHours = Number.isFinite(quoteTime) ? (Date.now() - quoteTime) / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;
    const maxFreshHours = this.resolveQuoteFreshnessHours(cachedQuote);
    if (ageHours > maxFreshHours) {
      return { quote: null, fallbackApplied: false };
    }

    return {
      quote: {
        ...cachedQuote,
        source: cachedQuote.source || "cache",
      },
      fallbackApplied: true,
    };
  }

  async hydrateMissingMarketQuotes(positions, marketQuotes) {
    const out = { ...(marketQuotes || {}) };
    const list = Array.isArray(positions) ? positions : [];
    const maxSymbols = Math.max(0, Math.floor(Number(this.settings.quoteFetchMaxSymbolsPerRun) || 0));
    const missingSymbols = [];
    let fetchedCount = 0;
    let skippedByCapCount = 0;

    for (const pos of list) {
      const symbol = String(pos?.symbol || "").trim().toUpperCase();
      if (!symbol) continue;
      if (out[symbol]) continue;
      if (Number.isFinite(Number(pos?.marketPrice))) continue;
      if (missingSymbols.includes(symbol)) continue;
      missingSymbols.push(symbol);
    }

    for (const symbol of missingSymbols) {
      if (maxSymbols > 0 && fetchedCount >= maxSymbols) {
        skippedByCapCount += 1;
        continue;
      }

      const marketHint = list.find((pos) => String(pos?.symbol || "").trim().toUpperCase() === symbol)?.assetType;
      try {
        const fetched = await this.fetchLiveQuoteForSymbol(symbol, marketHint);
        if (!fetched) continue;
        out[symbol] = fetched;
        fetchedCount += 1;
      } catch (_) {
        // ignore adapter errors and proceed with fallback logic
      }
    }

    this.lastLiveQuoteHydrationSummary = {
      attemptedCount: missingSymbols.length,
      fetchedCount,
      skippedByCapCount,
      maxSymbols,
    };
    this.updateQuoteCache(out);
    return out;
  }

  async fetchLiveQuoteForSymbol(symbol, marketHint) {
    const sym = String(symbol || "").trim().toUpperCase();
    if (!sym) return null;

    const retryLimit = Math.max(0, Math.floor(Number(this.settings.quoteRetryLimit) || 2));
    const baseDelayMs = Math.max(0, Math.floor(Number(this.settings.quoteRetryBaseDelayMs) || 250));

    return this.fetchQuoteWithRetry(
      async () => this.fetchLiveQuoteHttp(sym, marketHint),
      { retryLimit, baseDelayMs }
    );
  }

  async fetchLiveQuoteHttp(symbol, marketHint) {
    const base = String(this.settings.quoteApiBaseUrl || "").trim();
    if (!base) {
      const err = new Error("quoteApiBaseUrl is empty");
      err.status = 400;
      throw err;
    }

    const url = base.includes("{symbol}")
      ? base.replace("{symbol}", encodeURIComponent(symbol))
      : `${base}${encodeURIComponent(symbol)}`;

    const response = await fetch(url);
    if (!response.ok) {
      const err = new Error(`quote api request failed (${response.status})`);
      err.status = response.status;
      throw err;
    }

    const payload = await response.json();
    return this.normalizeFetchedQuotePayload(symbol, payload, marketHint);
  }

  normalizeFetchedQuotePayload(symbol, payload, marketHint) {
    let price = Number(payload?.price);
    let currency = payload?.currency;
    let asOf = payload?.asOf;
    let source = payload?.source;
    let market = payload?.market;

    const yahoo = payload?.quoteResponse?.result?.[0];
    if (!Number.isFinite(price) && yahoo) {
      price = Number(yahoo.regularMarketPrice);
      currency = currency || yahoo.currency;
      asOf = asOf || (Number.isFinite(yahoo.regularMarketTime) ? new Date(yahoo.regularMarketTime * 1000).toISOString() : null);
      source = source || "yahoo-finance";
      market = market || yahoo.fullExchangeName || yahoo.exchange || yahoo.quoteType;
    }

    if (!Number.isFinite(price)) {
      const err = new Error(`price not found for ${symbol}`);
      err.status = 502;
      throw err;
    }

    return {
      symbol,
      price,
      currency: String(currency || "USD"),
      market: this.normalizeMarketLabel(market || marketHint || "unknown"),
      source: String(source || "live-api"),
      asOf: asOf || new Date().toISOString(),
    };
  }

  async fetchQuoteWithRetry(fetcher, options = {}) {
    const retryLimit = Math.max(0, Math.floor(options.retryLimit ?? 2));
    const baseDelayMs = Math.max(0, Math.floor(options.baseDelayMs ?? 250));

    let lastError = null;
    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      try {
        return await fetcher();
      } catch (error) {
        lastError = error;
        const retryable = this.isRetryableQuoteError(error);
        if (!retryable || attempt >= retryLimit) break;

        const waitMs = baseDelayMs * Math.pow(2, attempt);
        await this.sleep(waitMs);
      }
    }

    throw lastError;
  }

  isRetryableQuoteError(error) {
    const status = Number(error?.status || error?.statusCode || 0);
    if (status === 429 || status >= 500) return true;

    const code = String(error?.code || "").toUpperCase();
    if (["ETIMEDOUT", "ECONNRESET", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
      return true;
    }

    const message = String(error?.message || "").toLowerCase();
    if (message.includes("timeout") || message.includes("timed out")) return true;

    return false;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  computeQuoteIntegrityHash(quote) {
    const payload = [
      String(quote?.symbol || "").toUpperCase(),
      Number(quote?.price || 0).toFixed(8),
      String(quote?.currency || "USD").toUpperCase(),
      String(quote?.market || "unknown").toLowerCase(),
      String(quote?.asOf || ""),
    ].join("|");

    let hash = 2166136261;
    for (let i = 0; i < payload.length; i += 1) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  computeAuditIntegrityHash(auditLog) {
    const payload = JSON.stringify({
      inputSnapshot: auditLog?.inputSnapshot || {},
      ruleSnapshot: auditLog?.ruleSnapshot || {},
      marketSnapshot: auditLog?.marketSnapshot || {},
      warningSnapshot: auditLog?.warningSnapshot || {},
    });

    let hash = 2166136261;
    for (let i = 0; i < payload.length; i += 1) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  computeAuditChainHash(previousIntegrityHash, currentIntegrityHash) {
    const payload = `${previousIntegrityHash || "none"}|${currentIntegrityHash || "none"}`;
    let hash = 2166136261;
    for (let i = 0; i < payload.length; i += 1) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  bandCurrency(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "n/a";
    const band = Math.round(n / 1000000) * 1000000;
    return `${band.toLocaleString("en-US")} KRW (band)`;
  }

  maskSymbol(symbol) {
    const s = String(symbol || "").trim().toUpperCase();
    if (!s) return "n/a";
    if (s.length <= 2) return `${s[0]}*`;
    return `${s[0]}${"*".repeat(Math.max(1, s.length - 2))}${s[s.length - 1]}`;
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

  shiftMarkdownHeadingDepth(text, depth = 1) {
    const n = Math.max(0, Math.floor(Number(depth) || 0));
    if (!n) return String(text || "");

    return String(text || "").replace(/^(#{1,6})(\s+)/gm, (_, hashes, spacing) => {
      const nextDepth = Math.min(6, hashes.length + n);
      return `${"#".repeat(nextDepth)}${spacing}`;
    });
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

  normalizeScenarioKey(raw) {
    const value = String(raw || "Base").trim().toLowerCase();
    if (value === "bear") return "Bear";
    if (value === "bull") return "Bull";
    return "Base";
  }

  normalizeScenarioAssetType(raw) {
    const value = String(raw || "all").trim().toLowerCase();
    if (value === "all") return "all";
    return this.normalizeAssetType(value);
  }

  normalizeOcrSymbol(raw) {
    const symbol = String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9.\-]/g, "");
    return OCR_SYMBOL_ALIASES[symbol] || symbol;
  }

  inferAssetTypeFromSymbol(symbol, currency) {
    const normalizedSymbol = this.normalizeOcrSymbol(symbol);
    const normalizedCurrency = this.normalizeCurrencyLabel(currency || "");
    if (normalizedSymbol === "KRW" || normalizedSymbol === "USD" || normalizedSymbol === "JPY" || normalizedSymbol === "EUR") {
      return "cash";
    }
    if (CRYPTO_SYMBOLS.has(normalizedSymbol)) return "crypto";
    if (normalizedCurrency === "USDT" || normalizedCurrency === "USDC") return "crypto";
    return "stock";
  }

  defaultCurrencyForSymbol(symbol, assetType = "") {
    const normalizedSymbol = this.normalizeOcrSymbol(symbol);
    const normalizedType = this.normalizeAssetType(assetType || this.inferAssetTypeFromSymbol(normalizedSymbol));
    if (normalizedSymbol === "KRW") return "KRW";
    if (normalizedSymbol === "USD") return "USD";
    if (normalizedType === "cash") return "KRW";
    return "USD";
  }

  normalizeCurrencyLabel(raw) {
    const value = String(raw || "").trim().toUpperCase();
    if (!value) return "";
    if (value === "₩" || value === "원") return "KRW";
    if (value === "$") return "USD";
    if (value === "XBT") return "BTC";
    return value;
  }

  marketLabelForAssetType(assetType) {
    const normalizedType = this.normalizeAssetType(assetType);
    if (normalizedType === "crypto") return "crypto";
    if (normalizedType === "etf") return "etf";
    if (normalizedType === "cash") return "cash";
    if (normalizedType === "stock") return "stock";
    return "other";
  }

  maskAccountIdentifier(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    const digits = text.replace(/\s+/g, "");
    if (digits.length <= 4) return `**${digits}`;
    return `${"*".repeat(Math.max(2, digits.length - 4))}${digits.slice(-4)}`;
  }

  isLikelyLeveragedSymbol(symbol) {
    const normalized = String(symbol || "").trim().toUpperCase();
    return [
      "TQQQ",
      "SQQQ",
      "SOXL",
      "SOXS",
      "UPRO",
      "SPXL",
      "SPXS",
      "TECL",
      "TECS",
      "LABU",
      "LABD",
      "FNGU",
      "FNGD",
      "NVDL",
      "NVDX",
      "TMF",
      "TNA",
      "TZA",
    ].includes(normalized);
  }

  normalizeMarketLabel(raw) {
    const x = String(raw || "unknown").trim().toLowerCase();
    if (!x) return "unknown";

    if (["crypto", "coin", "coins", "binance", "upbit", "bybit", "kraken", "okx"].some((k) => x.includes(k))) {
      return "crypto";
    }

    if (["etf", "index-fund", "index fund"].some((k) => x.includes(k))) {
      return "etf";
    }

    if (["stock", "equity", "nasdaq", "nyse", "kospi", "kosdaq", "amex"].some((k) => x.includes(k))) {
      return "stock";
    }

    if (["cash", "fiat", "krw", "usd", "jpy", "eur"].some((k) => x === k)) {
      return "cash";
    }

    return x;
  }

  buildReportId(generatedAt) {
    const ts = Date.parse(generatedAt || "");
    if (!Number.isFinite(ts)) return "RPT-UNKNOWN";
    const compact = new Date(ts).toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    return `RPT-${compact}`;
  }

  formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "n/a";
    return `${Math.round(n).toLocaleString("en-US")}`;
  }

  formatPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "n/a";
    return `${n.toFixed(2)}%`;
  }

  formatRatio(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "n/a";
    return n.toFixed(2);
  }

  formatSignedMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "n/a";
    const prefix = n > 0 ? "+" : n < 0 ? "-" : "";
    return `${prefix}${this.formatMoney(Math.abs(n))}`;
  }

  formatSignedPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "n/a";
    const prefix = n > 0 ? "+" : n < 0 ? "-" : "";
    return `${prefix}${Math.abs(n).toFixed(2)}%`;
  }

  computeSharpeRatio(annualReturn, annualVolatility, riskFreeRate = ASSET_ASSUMPTIONS.cash.annualReturn) {
    const ret = Number(annualReturn);
    const vol = Number(annualVolatility);
    const rf = Number(riskFreeRate);
    if (!Number.isFinite(ret) || !Number.isFinite(vol) || vol <= 0) return null;
    return (ret - (Number.isFinite(rf) ? rf : 0)) / vol;
  }

  computeSortinoRatio(annualReturn, downsideDeviation, riskFreeRate = ASSET_ASSUMPTIONS.cash.annualReturn) {
    const ret = Number(annualReturn);
    const downside = Number(downsideDeviation);
    const rf = Number(riskFreeRate);
    if (!Number.isFinite(ret) || !Number.isFinite(downside) || downside <= 0) return null;
    return (ret - (Number.isFinite(rf) ? rf : 0)) / downside;
  }

  computePearsonCorrelation(left, right) {
    const xs = Array.isArray(left) ? left.map((value) => Number(value)) : [];
    const ys = Array.isArray(right) ? right.map((value) => Number(value)) : [];
    if (xs.length !== ys.length || xs.length < 2) return null;
    if (xs.some((value) => !Number.isFinite(value)) || ys.some((value) => !Number.isFinite(value))) return null;

    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    let numerator = 0;
    let varianceX = 0;
    let varianceY = 0;

    for (let index = 0; index < xs.length; index += 1) {
      const dx = xs[index] - meanX;
      const dy = ys[index] - meanY;
      numerator += dx * dy;
      varianceX += dx * dx;
      varianceY += dy * dy;
    }

    if (!(varianceX > 0) || !(varianceY > 0)) return null;
    return numerator / Math.sqrt(varianceX * varianceY);
  }

  computeStandardDeviation(values) {
    const list = Array.isArray(values) ? values.map((value) => Number(value)).filter((value) => Number.isFinite(value)) : [];
    if (list.length < 2) return null;

    const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
    const variance = list.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / list.length;
    return variance > 0 ? Math.sqrt(variance) : 0;
  }

  computeAnnualizedDownsideDeviation(dailyReturns, annualThresholdRate = ASSET_ASSUMPTIONS.cash.annualReturn) {
    const returns = Array.isArray(dailyReturns) ? dailyReturns.map((value) => Number(value)).filter((value) => Number.isFinite(value)) : [];
    if (!returns.length) return null;

    const dailyThreshold = this.annualRateToDaily(annualThresholdRate);
    const downsideVariance =
      returns.reduce((sum, value) => {
        const shortfall = Math.min(0, value - dailyThreshold);
        return sum + shortfall * shortfall;
      }, 0) / returns.length;
    if (downsideVariance <= 0) return 0;
    return Math.sqrt(downsideVariance) * Math.sqrt(252) * 100;
  }

  annualRateToDaily(annualRatePct) {
    const annualRate = Number(annualRatePct);
    if (!Number.isFinite(annualRate)) return 0;
    return Math.pow(1 + annualRate / 100, 1 / 252) - 1;
  }

  dailyMeanToAnnual(dailyMean) {
    const mean = Number(dailyMean);
    if (!Number.isFinite(mean)) return null;
    return (Math.pow(1 + mean, 252) - 1) * 100;
  }

  formatBucketSummary(buckets) {
    const merged = { stock: 0, etf: 0, crypto: 0, cash: 0, other: 0, ...(buckets || {}) };
    const sum = Object.values(merged).reduce((acc, value) => acc + (Number(value) || 0), 0);
    if (sum <= 0) return "no priced assets";
    const normalized = {};
    for (const [key, value] of Object.entries(merged)) {
      normalized[key] = ((Number(value) || 0) / sum) * 100;
    }
    const order = ["stock", "etf", "crypto", "cash", "other"];
    return order
      .filter((key) => normalized[key] > 0)
      .map((key) => `${key} ${this.formatPct(normalized[key])}`)
      .join(" / ");
  }

  formatTimestamp(value) {
    const ts = Date.parse(value || "");
    if (!Number.isFinite(ts)) return "n/a";
    return new Date(ts).toISOString().replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC");
  }

  formatLatency(latencyMs) {
    const ms = Number(latencyMs);
    if (!Number.isFinite(ms) || ms < 0) return "unknown";

    const minutes = Math.round(ms / (1000 * 60));
    if (minutes < 60) return `${minutes} minute(s)`;

    const hours = ms / (1000 * 60 * 60);
    if (hours < 24) return `${hours.toFixed(1)} hour(s)`;

    return `${(hours / 24).toFixed(1)} day(s)`;
  }

  roundCurrencyStep(value, step) {
    const n = Number(value);
    const s = Math.max(1, Number(step) || 1);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n / s) * s;
  }

  fallbackNumber(value, fallback) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    return Number(fallback) || 0;
  }

  toNumber(v) {
    if (v === undefined || v === null) return null;
    const text = String(v).trim().replace(/,/g, "");
    if (!text) return null;
    return Number(text);
  }

  prettyNum(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "-";
    return Number.isInteger(v) ? String(v) : v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }

  clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  createSeededRandom(seedInput) {
    if (seedInput === undefined || seedInput === null || seedInput === "") return null;

    let state = this.normalizeSeed(seedInput);
    if (!state) state = 0x9e3779b9;

    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  normalizeSeed(seedInput) {
    if (Number.isFinite(seedInput)) return Math.abs(Math.floor(seedInput)) >>> 0;

    const text = String(seedInput || "").trim();
    if (!text) return 0;

    let hash = 2166136261;
    for (const ch of text) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  randn(randomFn = Math.random) {
    let u = 0;
    let v = 0;
    while (u === 0) u = randomFn();
    while (v === 0) v = randomFn();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
};
