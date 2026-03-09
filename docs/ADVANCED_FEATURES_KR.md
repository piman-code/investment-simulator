# 고급 기능 가이드

이 문서는 첫 분석이 익숙해진 뒤에 쓰는 기능을 설명합니다.

기본 흐름:
- 자산 입력
- 분석 실행
- 결과 읽기

고급 기능은 이 기본 흐름 위에 덧붙이는 확장 기능입니다.

## 1. OCR JSON

용도:
- 다른 OCR 도구에서 뽑은 자산 데이터를 노트에 반영

방법:
1. `## OCR JSON` 섹션에 JSON 블록을 붙여넣기
2. `INV: Advanced - ingest OCR JSON into portfolio` 실행
3. `## Portfolio`, `## Market Quotes`, `## OCR Review` 갱신 확인

언제 쓰나:
- 손으로 자산 표를 다시 입력하기 싫을 때

## 2. 로컬 OCR bridge

용도:
- 로컬 `tesseract`로 이미지에서 텍스트를 읽고 포트폴리오로 반영

방법:
1. `## OCR Capture Input` 섹션 작성
2. 이미지 절대 경로 입력
3. `INV: Advanced - OCR local image into note` 실행
4. `## OCR Raw Text`, `## OCR JSON`, `## OCR Review` 생성 확인

주의:
- 초보자 첫 실행용 기능은 아님
- OCR 결과는 항상 검토가 필요함

## 3. Omniforge handoff

용도:
- 현재 분석 결과를 외부 워크플로 또는 다른 AI 스레드로 넘길 때

방법:
1. 현재 노트를 분석한 뒤
2. `INV: Advanced - generate Omniforge handoff` 실행
3. `## Omniforge Handoff`, `## Omniforge Prompt` 섹션 확인

언제 쓰나:
- 로컬 분석을 다른 시스템으로 이어가고 싶을 때

## 4. Strategy league

용도:
- 외부 리그 결과 또는 전략 점수 신호를 추천안 점수에 반영

입력 방법:
- `## Standings` 테이블
- 또는 `## Results` 목록

효과:
- Plan A/B/C 점수 순위에 외부 전략 신호를 섞을 수 있음

권장 시점:
- 기본 A/B/C 해석이 익숙해진 뒤

## 5. CSV export

용도:
- 결과를 표 형식으로 복사하거나 다른 도구로 옮길 때

방법:
1. 분석 실행
2. `INV: Advanced - export CSV pack` 실행
3. `## CSV Exports` 섹션 확인

포함되는 것:
- portfolio snapshot
- recommendation plans
- strategy league
- report history
- strategy league history
- daily briefing history

## 6. JSON profile save / load

용도:
- 자주 쓰는 포트폴리오 초안을 저장하고 다시 불러오기

저장:
- `INV: Save portfolio draft (JSON profile)`

불러오기:
- `INV: Load last saved portfolio draft`

언제 유용한가:
- 같은 포트폴리오를 반복 점검할 때
- 여러 포트폴리오 초안을 나눠 저장할 때

## 7. Daily briefing

용도:
- 분석 결과를 더 짧은 일일 요약으로 정리

방법:
1. 분석 실행
2. `INV: Advanced - generate daily briefing`
3. `## Daily Briefing` 확인

언제 쓰나:
- 긴 보고서 대신 핵심 요약만 빠르게 보고 싶을 때

## 고급 기능 사용 원칙

1. 기본 흐름이 먼저
2. 고급 기능은 필요할 때만
3. OCR과 외부 handoff는 항상 검토를 거칠 것
