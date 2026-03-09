# Advanced Note Template

OCR, 리그, 고급 입력까지 한 노트에서 다루고 싶을 때 쓰는 템플릿입니다.

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
- AAPL,190,USD,nasdaq,manual,2026-03-09T09:00:00Z
- QQQ,430,USD,nasdaq,manual,2026-03-09T09:00:00Z
- BTC,90000,USD,binance,manual,2026-03-09T09:00:00Z

## Portfolio
- AAPL,stock,12,,25,150
- QQQ,etf,8,,25,400
- BTC,crypto,0.18,,20
- KRW,cash,5000000,1,30

## Scenario Overrides
- Bear,stock,-8,1.3
- Bear,crypto,-25,1.45
- Bull,stock,4,0.95

## League Standings
## Results
- Alpha: 3.12%
- Beta: -0.42%
- Gamma: 1.07%

## OCR Capture Input
path: /absolute/path/to/broker-capture.png
platform: local-tesseract
capturedAt: 2026-03-08T09:00:00+09:00
timezone: Asia/Seoul
broker: sample-broker
accountMask: 1234
currency: KRW
lang: eng
psm: 6

## OCR JSON
```json
{
  "source": { "platform": "sample", "capturedAt": "2026-03-08T09:00:00+09:00", "timezone": "Asia/Seoul" },
  "positions": [
    { "symbolRaw": "AAPL", "symbol": "AAPL", "assetType": "stock", "quantity": 3, "marketPrice": 190, "confidence": 0.93 },
    { "symbolRaw": "BTC", "symbol": "BTC", "assetType": "crypto", "quantity": 0.05, "marketPrice": 90000, "confidence": 0.72 }
  ],
  "quality": { "overallConfidence": 0.82, "missingFields": [], "requiresManualReview": true }
}
```
