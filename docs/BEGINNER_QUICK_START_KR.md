# 초보자 빠른 시작

목표: 3분 안에 첫 분석 결과를 Obsidian 안에서 직접 보기

## 준비물

1. Obsidian에서 이 플러그인을 켭니다.
2. 빈 노트 하나를 만듭니다.

## 방법 A: 가장 쉬운 시작

1. 새 노트를 엽니다.
2. `Ctrl+P` 또는 `Cmd+P`를 눌러 명령 팔레트를 엽니다.
3. `INV: Start here - insert 3-minute note`를 실행합니다.
4. 노트에 들어간 샘플 값 중 아래만 먼저 바꿉니다.
   - `principal`
   - `monthlyContribution`
   - `years`
   - `goalAmount`
   - `## Portfolio`
5. 다시 명령 팔레트를 열고 `INV: Analyze current note`를 실행합니다.
6. 노트 아래쪽에 `## Latest Report`가 생기면 성공입니다.

## 방법 B: 폼으로 입력하기

1. 빈 노트를 엽니다.
2. `Ctrl+P` 또는 `Cmd+P`
3. `INV: Start here - open portfolio setup` 실행
4. 아래 순서로 채웁니다.
   - `1. Basic Goal and Risk Limits`
   - `3. Portfolio Table`
5. `Apply to note` 클릭
6. 다시 명령 팔레트를 열고 `INV: Analyze current note` 실행

## 바로 복붙할 샘플 노트

`SAMPLE_NOTE_KR.md` 전체를 새 노트에 붙여넣어도 됩니다.

## 무엇을 먼저 수정해야 하나

첫 실행에서 꼭 필요한 것은 2가지뿐입니다.

1. `Investment Params`
   - 내 돈
   - 매달 넣을 돈
   - 투자 기간
   - 목표 금액
2. `Portfolio`
   - 무슨 자산인지
   - 몇 개 있는지
   - 지금 가격이 얼마인지

## 무엇은 나중에 해도 되나

처음에는 아래 기능을 무시해도 됩니다.

- OCR
- Omniforge handoff
- Strategy league
- CSV export
- Daily briefing
- Scenario overrides
- JSON profile save / load

## 결과가 나오면 어디를 먼저 보나

`## Latest Report` 안에서 아래 순서로 읽으세요.

1. `Read This First`
   - 지금 상태를 짧게 설명합니다.
2. `Biggest Warning`
   - 제일 먼저 조심할 점입니다.
3. `Best Starter Plan`
   - A/B/C 중 어디서부터 볼지 알려줍니다.
4. `Execution Priority and Next Actions`
   - 지금 바로 할 일 / 이번 달 할 일 / 이번 분기 할 일

## 기대 결과

첫 분석이 끝나면 아래를 볼 수 있습니다.

- 현재 자산 비중
- 목표 달성 확률
- 추정 최대 낙폭
- 추천안 A / B / C
- 다음 행동

## 첫 실행에서 흔한 오해

- `Market Quotes`가 비어 있어도 됩니다.
  - `Portfolio`에 `marketPrice`를 직접 썼다면 첫 분석은 돌아갑니다.
- 보고서에 `UNKNOWN`이 떠도 실패는 아닙니다.
  - 첫 연습용 분석으로는 정상일 수 있습니다.
- `STALE`이면 가격이 오래됐다는 뜻입니다.
  - 실제 실행 전 가격을 다시 확인해야 합니다.
