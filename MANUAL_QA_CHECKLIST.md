# Manual QA Checklist

Use this inside a real Obsidian desktop vault.

## 0. Beginner First Run
- Run `INV: Start here - insert 3-minute note`.
- Fill only `Investment Params` and `Portfolio`.
- Run `INV: Analyze current note`.
- Confirm `## Latest Report` is created.
- Confirm `Read This First` appears near the top of the report.

## 1. Guided Editor
- Run `INV: Start here - open portfolio setup`.
- Confirm numeric fields load current note values.
- Add and remove rows in `Market Quotes`, `Portfolio`, and `Scenario Overrides`.
- Click `Apply to note`.
- Verify note sections update without corrupting unrelated sections.

## 2. Analysis Report
- Run `INV: Analyze current note`.
- Confirm `## Latest Report` is created or refreshed.
- Confirm `## Report History` gains one new row.
- Confirm `## Strategy League History` gains one new row.
- Verify the report contains:
  - `Scenario Analysis`
  - `Correlation Matrix`
  - `Ticker Analysis Cards`
  - `Strategy League Scoreboard`
  - `Plan A/B/C`

## 3. Daily Briefing
- Run `INV: Advanced - generate daily briefing`.
- Confirm `## Daily Briefing` is created or refreshed.
- Confirm `## Daily Briefing History` gains one new row.
- Check `Focus Now`, `Risk Watch`, `Watchlist`, and `Next Steps`.

## 4. JSON Profiles
- Run `INV: Save portfolio draft (JSON profile)`.
- Clear or change the note.
- Run `INV: Load last saved portfolio draft`.
- Confirm params, quotes, portfolio rows, and scenario overrides restore correctly.

## 5. OCR JSON Ingestion
- Paste valid normalized payload into `## OCR JSON`.
- Run `INV: Advanced - ingest OCR JSON into portfolio`.
- Confirm:
  - `## OCR Review` is written
  - `## Market Quotes` updates
  - `## Portfolio` updates
  - low-confidence rows remain flagged

## 6. Local OCR Bridge
- Add `## OCR Capture Input` with an absolute image path.
- Run `INV: Advanced - OCR local image into note`.
- Confirm:
  - `## OCR Raw Text` is created
  - `## OCR JSON` is generated
  - `## OCR Review` is updated
  - `## Market Quotes` and `## Portfolio` merge correctly

## 7. Omniforge Handoff
- Run `INV: Advanced - generate Omniforge handoff`.
- Confirm:
  - `## Omniforge Handoff` contains valid JSON
  - `## Omniforge Prompt` contains an external-thread prompt

## 8. CSV Export
- Run `INV: Advanced - export CSV pack`.
- Confirm `## CSV Exports` contains CSV blocks for:
  - portfolio snapshot
  - recommendation plans
  - strategy league
  - report history
  - strategy league history
  - daily briefing history

## 9. Mobile Layout
- Open `index.html` in a browser.
- Check 768px and below.
- Confirm single-column layout and no horizontal overflow.

## 10. Regression Notes
- Re-run analysis after each major note change.
- Confirm history sections dedupe correctly when the same report is re-applied.
- Confirm audit hash still appears in the latest report.
