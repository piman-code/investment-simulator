# Investment Simulator (Obsidian Plugin)

Market-intelligence plugin for Obsidian:
- Portfolio analysis + Monte Carlo simulation
- A/B/C recommendation plans with risk constraints
- OCR JSON ingestion into portfolio
- Market quote adapter (`asOf`, source tracking)
- League signal integration from note standings/results

## Commands
- `INV: Insert analysis template`
- `INV: Run market intelligence analysis`
- `INV: Ingest OCR JSON into portfolio`

## Beginner Quick Start (KR)
1. Obsidian에서 플러그인 활성화 후 `Ctrl+P`를 엽니다.
2. `INV: Insert analysis template` 실행.
3. 노트 값 수정:
   - `principal`, `monthlyContribution`, `years`, `goalAmount`
   - `## Portfolio`에 보유자산 한 줄씩 입력
4. 필요하면 `## Market Quotes`에 시세 입력.
5. OCR JSON이 있으면 `## OCR JSON`에 붙여넣고 `INV: Ingest OCR JSON into portfolio` 실행.
6. `INV: Run market intelligence analysis` 실행.
7. 같은 노트에 리포트가 자동 생성됩니다.

빠른 시작용 샘플 노트:
- `SAMPLE_NOTE_KR.md`

## Input Sections

### 1) `## Investment Params`
```md
principal: 10000000
monthlyContribution: 500000
years: 10
simulations: 1200
goalAmount: 200000000
maxMdd: 35
maxVolatility: 25
maxCryptoWeight: 40
maxSingleAssetWeight: 35
```

### 2) `## Market Quotes`
Format:
`- symbol,price,currency,market,source[,asOf]`

Example:
```md
## Market Quotes
- AAPL,190,USD,nasdaq,manual
- BTC,90000,USD,binance,manual
```

### 3) `## Portfolio`
Format:
`- symbol,assetType,quantity,marketPrice,targetWeight`

Example:
```md
## Portfolio
- AAPL,stock,12,,25
- QQQ,etf,8,,25
- BTC,crypto,0.18,,20
- KRW,cash,5000000,1,30
```

Allowed `assetType`:
- `stock`
- `etf`
- `crypto`
- `cash`
- `other`

### 4) `## League Standings (optional)`
The plugin reads:
- `## Standings` table rows from trading-agent-league style output, or
- `## Results` bullet rows like `- Alpha: 3.12%`

It derives a risk-on / risk-off / neutral signal and adjusts plan scores.

### 5) `## OCR JSON (optional)`
Put OCR output JSON in a fenced block.
Run `INV: Ingest OCR JSON into portfolio` to:
- Normalize OCR positions
- Merge into `## Portfolio`
- Generate `## OCR Review`

## Output
`INV: Run market intelligence analysis` generates a report with:
- Data context (`asOf`, adapter usage, league regime)
- Portfolio snapshot
- Simulation summary (P10/P50/P90, goal probability, est. MDD)
- Recommendation plans A/B/C
- Risk alerts
- Compliance notice

## BRAT Files
- `manifest.json`
- `main.js`
- `versions.json`

## Compliance
This plugin is not investment advice. It is decision-support tooling only.
