# 외부 접속(모바일) 빠른 시작

집에서 PC 앞에 있을 때 아래 순서만 하면 됩니다.

## 0) 최초 1회 설치
```powershell
winget install Cloudflare.cloudflared
```

(Python이 없다면)
```powershell
winget install Python.Python.3.12
```

## 1) 실행 (한 줄)
```powershell
cd C:\Users\jarvis-windows\.openclaw\workspace\investment-simulator
.\start-remote.ps1
```

## 2) 모바일에서 접속
터미널에 나오는 `https://xxxx.trycloudflare.com` 링크를 폰에서 열기.

## 3) 종료
- 터널 창에서 `Ctrl + C`
- 로컬 서버(http.server) 창 닫기

## 보안 메모
- 이 링크는 외부 공개 링크이므로, 테스트 끝나면 종료하세요.
- 장기 운영은 Cloudflare Access(로그인 보호) 적용 권장.
