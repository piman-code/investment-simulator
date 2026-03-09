# Standard Note Template

기본 분석을 꾸준히 돌릴 때 쓰는 템플릿입니다.

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
- AAPL,stock,12,,25,150
- QQQ,etf,8,,25,400
- BTC,crypto,0.18,,20
- KRW,cash,5000000,1,30

## Scenario Overrides
- Bear,stock,-8,1.3
- Bear,crypto,-25,1.45
- Bull,stock,4,0.95

## Results
- Alpha: 3.12%
- Beta: -0.42%
- Gamma: 1.07%
