# 초보자용 사용 가이드

이 문서는 "한 번 돌려봤다" 다음 단계에서,
이 플러그인을 어떻게 꾸준히 쓸지 설명합니다.

## 1. 자산 입력하기

### 가장 쉬운 방법

1. `INV: Start here - open portfolio setup`
2. `Basic Goal and Risk Limits` 입력
3. `Portfolio Table` 입력
4. `Apply to note`
5. `INV: Analyze current note`

### Portfolio 한 줄은 무슨 뜻인가

예시:

```md
- AAPL,stock,12,190,25,150
```

뜻:

1. `AAPL`
   - 종목 이름
2. `stock`
   - 자산 종류
3. `12`
   - 보유 수량
4. `190`
   - 현재 가격
5. `25`
   - 목표 비중
6. `150`
   - 평균 매수가

## 2. 위험 경고 읽기

보고서에는 숫자만 있는 것이 아니라 경고도 있습니다.

### 자주 나오는 경고

- `Single asset concentration is high`
  - 한 자산에 너무 몰려 있다는 뜻
- `Crypto weight is above user cap`
  - 코인 비중이 스스로 정한 한도를 넘었다는 뜻
- `Market data is stale`
  - 가격 정보가 오래됐다는 뜻
- `missing price`
  - 가격이 비어 있어 계산이 불완전하다는 뜻

### 초보자 해석법

1. `stale`나 `missing price`가 있으면 먼저 가격부터 다시 확인
2. 그다음 한 자산 쏠림 경고 확인
3. 마지막으로 목표 달성 확률 확인

## 3. 추천안 A/B/C 이해하기

이 플러그인은 보통 3개의 계획을 보여줍니다.

### Plan A

- 더 방어적인 쪽
- 손실 통제와 생존을 우선
- 초보자에게 가장 먼저 보기 쉬운 계획

### Plan B

- 중간 정도
- 수익과 위험의 균형
- "기본안"처럼 보기 좋음

### Plan C

- 더 공격적인 쪽
- 더 높은 변동성과 더 큰 하락을 감수할 수 있을 때
- 초보자라면 A/B부터 먼저 보고 나서 비교

### 무엇을 먼저 비교하나

1. `Goal Prob`
   - 높을수록 좋음
2. `Est MDD`
   - 낮을수록 안전함
3. `Recommended For`
   - 그 계획이 어떤 사용자에게 맞는지 설명
4. `Execution Checklist`
   - 실제로 뭘 해야 하는지 문장으로 알려줌

## 4. 결과 보고서 읽는 순서

1. `Read This First`
2. `Current Status Summary`
3. `Recommendation Plans Overview`
4. `Plan A / B / C`
5. `Execution Priority and Next Actions`

## 5. 매일 / 매주 어떻게 쓰면 좋나

### 매일

1. 가격이 크게 바뀐 자산만 업데이트
2. `INV: Analyze current note`
3. `Read This First`와 `Biggest Warning`만 확인

### 매주

1. 전체 가격 다시 확인
2. 비중이 많이 틀어졌는지 확인
3. `Plan A/B/C` 비교 다시 보기
4. 이번 주에 실제로 바꿀 행동 1개만 정하기

### 매달

1. `monthlyContribution` 현실성 다시 보기
2. 목표 금액과 기간이 아직 맞는지 확인
3. `Execution Priority and Next Actions`의 이번 달 항목 점검

## 6. 초보자에게 권하는 사용 습관

- 처음부터 모든 기능을 쓰려고 하지 말 것
- 한 번에 한 개의 경고만 해결할 것
- `UNKNOWN`이면 연습용 결과로 보고 실제 실행은 미룰 것
- `STALE`이면 다시 가격 확인 후 재실행할 것
