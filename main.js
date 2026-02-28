"use strict";

const { Plugin, Notice, PluginSettingTab, Setting } = require("obsidian");

const DEFAULT_SETTINGS = {
  principal: 10000000,
  monthlyContribution: 500000,
  annualReturn: 8,
  annualVolatility: 12,
  years: 10,
  simulations: 300,
};

class InvSimSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Investment Simulator 설정" });

    const keys = [
      ["principal", "기본 초기자산"],
      ["monthlyContribution", "기본 월 적립금"],
      ["annualReturn", "기대 연수익률(%)"],
      ["annualVolatility", "연변동성(%)"],
      ["years", "기본 기간(년)"],
      ["simulations", "시뮬레이션 횟수"],
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

    this.addRibbonIcon("calculator", "INV: 시뮬레이션 템플릿 삽입", () => {
      const editor = this.app.workspace.activeEditor?.editor;
      if (!editor) return new Notice("활성 에디터가 없습니다.");
      editor.replaceSelection(this.template());
    });

    this.addSettingTab(new InvSimSettingTab(this.app, this));

    this.addCommand({
      id: "invsim-insert-template",
      name: "INV: 파라미터 템플릿 삽입",
      editorCallback: (editor) => {
        editor.replaceSelection(this.template());
      },
    });

    this.addCommand({
      id: "invsim-run",
      name: "INV: 현재 노트로 시뮬레이션 실행",
      editorCallback: (editor) => {
        const params = this.parse(editor.getValue());
        const report = this.run(params);
        editor.replaceSelection(`\n\n${report}\n`);
        new Notice("시뮬레이션 완료");
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
annualReturn: ${s.annualReturn}
annualVolatility: ${s.annualVolatility}
years: ${s.years}
simulations: ${s.simulations}
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
    return out;
  }

  run(p) {
    const months = Math.max(1, Math.floor(p.years * 12));
    const runs = Math.max(20, Math.floor(p.simulations));
    const mu = p.annualReturn / 100 / 12;
    const sigma = p.annualVolatility / 100 / Math.sqrt(12);
    const finals = [];

    for (let i = 0; i < runs; i++) {
      let v = p.principal;
      for (let m = 0; m < months; m++) {
        v = v * (1 + mu + sigma * this.randn()) + p.monthlyContribution;
      }
      finals.push(v);
    }

    finals.sort((a, b) => a - b);
    const avg = finals.reduce((a, b) => a + b, 0) / finals.length;
    const p10 = finals[Math.floor(finals.length * 0.1)];
    const p50 = finals[Math.floor(finals.length * 0.5)];
    const p90 = finals[Math.floor(finals.length * 0.9)];
    const won = (n) => `${Math.round(n).toLocaleString("ko-KR")}원`;

    return `## Simulation Report

| Metric | Value |
|---|---:|
| Initial | ${won(p.principal)} |
| Monthly | ${won(p.monthlyContribution)} |
| Return (annual) | ${p.annualReturn}% |
| Volatility (annual) | ${p.annualVolatility}% |
| Years | ${p.years} |
| Simulations | ${runs} |
| Average Final | ${won(avg)} |
| P10 | ${won(p10)} |
| P50 | ${won(p50)} |
| P90 | ${won(p90)} |

> 간단한 정규분포 기반 모델이며, 세금/수수료/시장 단절 리스크는 미반영.`;
  }

  randn() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
};
