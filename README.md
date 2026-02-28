# Investment Simulator (Obsidian Plugin)

노트 안의 파라미터를 읽어 몬테카를로 투자 시뮬레이션 결과를 생성하는 Obsidian 플러그인입니다.

## BRAT 설치
1. Obsidian에서 **BRAT** 플러그인 설치/활성화
2. BRAT → **Add a beta plugin**
3. 아래 저장소 URL 입력:
   - `https://github.com/piman-code/investment-simulator`
4. 설치 후 커맨드 팔레트에서 아래 명령 실행

## 제공 명령어
- `INV: 파라미터 템플릿 삽입`
- `INV: 현재 노트로 시뮬레이션 실행`

## 파라미터 키
- `principal` (초기자산)
- `monthlyContribution` (월 적립금)
- `annualReturn` (기대 연수익률 %)
- `annualVolatility` (연변동성 %)
- `years` (기간)
- `simulations` (시뮬레이션 횟수)

## 예시
```md
principal: 10000000
monthlyContribution: 500000
annualReturn: 8
annualVolatility: 12
years: 10
simulations: 200
```

## BRAT 호환 파일
- `manifest.json`
- `main.js`
- `versions.json`

위 3개 파일을 저장소 루트에 두어 BRAT에서 바로 인식되도록 구성했습니다.
