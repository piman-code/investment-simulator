# Codex 긴밀 연동 워크플로우

이 프로젝트는 이제 Codex로 바로 작업 가능한 상태입니다.

## 1) Codex로 작업 지시
프로젝트 폴더에서:

```powershell
cd C:\Users\jarvis-windows\.openclaw\workspace\investment-simulator
.\codex-task.ps1 -Task "목표달성확률 카드 아래에 샤프지수 추정치 추가해줘"
```

- 기본은 `--full-auto`로 빠르게 수정합니다.
- 좀 더 안전하게 하려면:

```powershell
.\codex-task.ps1 -Task "README를 사용자 가이드 형태로 개선" -SafeMode
```

## 2) 반복 작업 패턴 (추천)
1. 기능 요청 1개만 명확히 지시
2. 결과 확인 (`git diff`)
3. 브라우저 테스트
4. 만족하면 커밋

## 3) 고급 팁
- 큰 작업은 쪼개서: "UI 개선"보다 "결과 카드 색상 규칙 추가"처럼.
- 코인/주식 로직 변경은 항상 `README.md`도 함께 갱신 지시.
- 프롬프트 끝에 "테스트 방법도 README에 반영"을 붙이면 유지보수 좋아짐.

## 4) 즉시 실행 가능한 예시 프롬프트
- `몬테카를로 결과를 CSV로 내보내기 버튼 추가`
- `최대 낙폭(MDD) 계산 과정을 툴팁으로 설명`
- `모바일 화면에서 카드 1열 레이아웃 최적화`
- `코인 비중이 40% 넘으면 리스크 경고 배지 표시`
