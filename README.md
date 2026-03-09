# Investment Simulator (Obsidian Plugin)

Obsidian 안에서 내 자산을 적고, 바로 점검 보고서를 만드는 플러그인입니다.

이 플러그인은 초보자에게는 "내 자산 입력 -> 분석 실행 -> 결과 읽기" 흐름만으로도 쓸 수 있어야 하고,
고급 사용자에게는 OCR, 리그, CSV, Omniforge 같은 확장 기능을 나중에 붙일 수 있어야 합니다.

## 이 플러그인은 무엇인가

- 메모 앱 Obsidian 안에서 자산 메모를 읽어 포트폴리오를 분석합니다.
- 목표 달성 가능성, 위험 경고, 추천안 A/B/C, 다음 행동을 한 노트 안에 정리해 줍니다.
- 투자를 대신 실행하는 도구가 아니라, "생각하고 점검하는 도구"입니다.

## 3분 첫 분석

1. Obsidian에서 새 노트를 엽니다.
2. `Ctrl+P` 또는 `Cmd+P`를 눌러 명령 팔레트를 엽니다.
3. `INV: Start here - insert 3-minute note`를 실행합니다.
4. 노트 안에서 아래만 먼저 수정합니다.
   - `principal`
   - `monthlyContribution`
   - `years`
   - `goalAmount`
   - `## Portfolio`
5. 다시 명령 팔레트를 열고 `INV: Analyze current note`를 실행합니다.
6. 결과가 나오면 `## Latest Report` 안에서 아래 순서로 읽습니다.
   - `Read This First`
   - `Current Status Summary`
   - `Execution Priority and Next Actions`
   - `Plan A / B / C`

빠른 복붙용 샘플 노트:
- `SAMPLE_NOTE_KR.md`

더 자세한 클릭 순서:
- `docs/BEGINNER_QUICK_START_KR.md`

## 처음엔 이것만 쓰면 된다

기본 기능:
- 초보자용 빠른 시작 노트 삽입
- Guided Editor로 숫자와 자산 입력
- 현재 노트 분석 실행
- 결과 보고서 읽기

고급 기능:
- OCR JSON ingest
- 로컬 OCR bridge
- JSON profile save / load
- Daily briefing
- Strategy league
- CSV export
- Omniforge handoff

처음에는 고급 기능을 몰라도 됩니다.
이 플러그인의 최소 사용 흐름은 `자산 입력 -> 분석 실행 -> 결과 읽기` 하나입니다.

## 명령어 안내

먼저 쓸 명령어:
- `INV: Start here - insert 3-minute note`
- `INV: Start here - open portfolio setup`
- `INV: Analyze current note`

나중에 써도 되는 명령어:
- `INV: Save portfolio draft (JSON profile)`
- `INV: Load last saved portfolio draft`
- `INV: Advanced - generate daily briefing`
- `INV: Advanced - ingest OCR JSON into portfolio`
- `INV: Advanced - OCR local image into note`
- `INV: Advanced - export CSV pack`
- `INV: Advanced - generate Omniforge handoff`

## 템플릿 구조

초보자용:
- `docs/templates/BEGINNER_NOTE_TEMPLATE.md`
- 가장 짧은 시작 노트
- `Investment Params`와 `Portfolio` 중심

일반용:
- `docs/templates/STANDARD_NOTE_TEMPLATE.md`
- `Market Quotes`, `Scenario Overrides`, `Results`까지 포함

고급용:
- `docs/templates/ADVANCED_NOTE_TEMPLATE.md`
- OCR, 리그, 고급 입력 섹션까지 포함

## 문서 안내

초보자 빠른 시작:
- `docs/BEGINNER_QUICK_START_KR.md`

초보자용 사용 가이드:
- `docs/BEGINNER_GUIDE_KR.md`

고급 기능 가이드:
- `docs/ADVANCED_FEATURES_KR.md`

문제 해결:
- `docs/TROUBLESHOOTING_KR.md`

왜 이 프로젝트가 어렵게 보였는지 / 어떻게 개선했는지:
- `docs/UX_IMPROVEMENT_SUMMARY_KR.md`

## 노트에 무엇을 적나

첫 실행에 꼭 필요한 섹션:

### `## Investment Params`

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

### `## Portfolio`

형식:

```md
- symbol,assetType,quantity,marketPrice,targetWeight[,avgPrice]
```

예시:

```md
## Portfolio
- AAPL,stock,12,190,25,150
- QQQ,etf,8,430,25,400
- BTC,crypto,0.18,90000,20
- KRW,cash,5000000,1,30
```

### `## Market Quotes`

선택 섹션입니다.
`Portfolio`에서 `marketPrice`를 직접 적었다면 첫 실행에서는 비워도 됩니다.

형식:

```md
- symbol,price,currency,market,source[,asOf]
```

## 보고서는 어떻게 읽나

`INV: Analyze current note`를 실행하면 결과가 `## Latest Report`에 들어갑니다.

초보자 기준으로는 이 순서가 가장 자연스럽습니다.

1. `Read This First`
   - 지금 상태를 한 줄로 설명합니다.
   - 제일 먼저 할 일을 적어줍니다.
2. `Current Status Summary`
   - 현재 자산 비중
   - 목표 달성 확률
   - 추정 낙폭
3. `Recommendation Plans Overview`
   - Plan A / B / C 비교표
4. `Execution Priority and Next Actions`
   - 지금
   - 이번 달
   - 이번 분기

## 초보자에게 중요한 해석 기준

- `Goal Probability`
  - 높을수록 목표 금액에 도달할 가능성이 높습니다.
- `Est MDD`
  - 낮을수록 버티기 쉬운 계획입니다.
- `Freshness`
  - `FRESH`면 비교적 최근 가격입니다.
  - `STALE`이면 가격이 오래되어 다시 확인이 필요합니다.
  - `UNKNOWN`이면 첫 연습용으로는 괜찮지만, 실제 실행 전에는 가격 확인이 필요합니다.

## 고급 기능은 언제 쓰나

- 캡처 이미지에서 자산을 읽고 싶을 때: OCR
- 저장해둔 포트폴리오 초안을 다시 불러오고 싶을 때: JSON profile
- 요약만 따로 보고 싶을 때: Daily briefing
- 외부 워크플로에 넘길 때: Omniforge handoff
- 표를 다른 도구로 내보낼 때: CSV export
- 전략 비교 신호를 섞고 싶을 때: Strategy league

## 현재 BRAT 배포 파일

- `manifest.json`
- `main.js`
- `versions.json`

## 주의

이 플러그인은 투자 조언이 아닙니다.
최종 투자 판단과 책임은 사용자에게 있습니다.
