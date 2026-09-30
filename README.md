# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## 실제 API 연결

프로필, 등산일지, 랭킹은 실제 BE API를 사용합니다. npm run dev의 Vite proxy가 /api, /oauth2, /login을 localhost:8080으로 전달합니다. BE의 FRONTEND_URL 기본값은 http://localhost:5173이며 Vite 포트를 바꾸면 함께 설정하세요.

운영에서는 FE origin의 /api, /oauth2, /login을 BE로 전달하는 reverse proxy와 실제 FE 주소의 FRONTEND_URL을 설정해야 합니다. OAuth 공급자 콘솔의 callback 주소는 로그인 시작 시 사용되는 외부 origin과 일치해야 합니다. 개발 proxy 경유 로그인은 http://localhost:5173/login/oauth2/code/google 및 /kakao를 콘솔에 등록하세요. 기존 BE 직접 로그인 callback(8080)도 사용할 수 있습니다.

공개 프로필 주소는 기존 상태 기반 화면 전환에 맞춘 #users/{userId}이며 랭킹에서 진입하고 브라우저 뒤로가기를 지원합니다. 별도 아이콘 라이브러리 없이 SVG Mountain 아이콘을 사용합니다.

검증: npm run test, npm run build, npm run lint. 테스트 명령은 TypeScript 직접 실행을 지원하는 Node 22.6 이상이 필요합니다. FE 자동 테스트는 API client/CSRF/오류/점수 표시를 검증하며 실제 공급자 로그인 브라우저 E2E는 포함하지 않습니다.
