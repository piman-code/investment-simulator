# Investment Simulator 샘플 노트 (복붙용)

아래를 Obsidian 노트에 그대로 붙여넣고 실행하세요.

1. `Ctrl+P` -> `INV: Ingest OCR JSON into portfolio` (OCR JSON 사용 시)
2. `Ctrl+P` -> `INV: Run market intelligence analysis`

---

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

## Market Quotes
- AAPL,190,USD,nasdaq,manual
- QQQ,430,USD,nasdaq,manual
- BTC,90000,USD,binance,manual

## Portfolio
- AAPL,stock,12,,25
- QQQ,etf,8,,25
- BTC,crypto,0.18,,20
- KRW,cash,5000000,1,30

## Results
- Alpha: 3.12%
- Beta: -0.42%
- Gamma: 1.07%

## OCR JSON (optional)
```json
{
  "source": {"platform": "sample", "capturedAt": "2026-02-28T12:00:00Z", "timezone": "UTC"},
  "positions": [
    {"symbolRaw": "AAPL", "symbol": "AAPL", "assetType": "stock", "quantity": 3, "marketPrice": 190, "confidence": 0.93},
    {"symbolRaw": "BTC", "symbol": "BTC", "assetType": "crypto", "quantity": 0.05, "marketPrice": 90000, "confidence": 0.72}
  ],
  "quality": {"overallConfidence": 0.82, "missingFields": [], "requiresManualReview": true}
}
```

---

참고:
- 이 플러그인은 투자 조언이 아닙니다.
- 최종 투자 판단과 책임은 사용자에게 있습니다.
