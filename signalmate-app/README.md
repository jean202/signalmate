# SignalMate 모바일 앱

## 실행

```bash
npm install
EXPO_PUBLIC_API_BASE_URL=http://<개발-PC-IP>:3000/api/v1 npm start
```

실기기에서는 `localhost`가 휴대폰 자신을 가리키므로 개발 PC의 같은 네트워크 IP를 사용한다.

## 검증

```bash
npm test
npm run typecheck
npx expo export --platform web
```
