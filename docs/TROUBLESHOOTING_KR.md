# 문제 해결

## 1. 처음 실행 시 흔한 실수

### 아무 결과가 안 나와요

확인할 것:
1. `## Portfolio`에 자산이 한 줄 이상 있는지
2. 수량이 0보다 큰지
3. `INV: Analyze current note`를 실행했는지

### Analysis blocked 메시지가 나와요

뜻:
- 필수 입력이 빠졌거나 형식이 잘못되었다는 뜻

주로 확인할 것:
1. `Portfolio` 줄에 종목명이 있는지
2. `assetType`이 있는지
3. `quantity`가 숫자인지

## 2. 입력 형식 오류

### Portfolio 형식

```md
- symbol,assetType,quantity,marketPrice,targetWeight[,avgPrice]
```

예시:

```md
- AAPL,stock,12,190,25,150
```

### 흔한 오류

- `quantity`에 글자를 넣음
- `assetType`을 빼먹음
- 쉼표 구분이 깨짐
- 가격을 빈칸으로 두었는데 `Market Quotes`도 비어 있음

## 3. OCR 관련 오류

### OCR JSON이 인식되지 않아요

확인할 것:
1. `## OCR JSON` 아래에 ` ```json ` 블록이 있는지
2. JSON 문법이 맞는지
3. `positions` 배열이 있는지

### 로컬 OCR이 실패해요

확인할 것:
1. 이미지 경로가 절대 경로인지
2. `tesseract` 경로가 설정되어 있는지
3. OCR 결과가 비어 있지 않은지

## 4. 왜 어려워 보였나

기존에 어려워 보인 이유:

1. 첫 화면부터 고급 기능 이름이 많이 보였음
2. 초보자가 당장 안 써도 되는 기능이 너무 빨리 등장했음
3. 템플릿이 강력하지만 첫 실행용으로는 길었음
4. 보고서 상단에 "지금 뭘 봐야 하는지"가 바로 드러나지 않았음

## 5. 이번에 어떻게 개선했나

개선 내용:

1. 명령어 이름을 `Start here`와 `Advanced`로 나눔
2. 기본 템플릿을 3분 첫 실행 중심으로 단순화
3. 초보자용 / 일반용 / 고급용 템플릿을 분리
4. README를 사용자 여정 중심으로 재작성
5. 보고서 상단에 `Read This First` 요약을 추가

## 6. 보고서가 여전히 어렵게 느껴진다면

이 순서만 따라가세요.

1. `Overall Status`
2. `Biggest Warning`
3. `Best Starter Plan`
4. `Do This Next`

나머지는 천천히 봐도 됩니다.
