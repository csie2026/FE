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

## 마이페이지 통계와 완등 기록

- 통계는 이번 달 산행 / 이번 달 거리 / 내 점수, 완등 횟수 / 총 산행 / 총 거리의 2×3 구조입니다.
- 산행 횟수는 실제 API에서 불러온 등산일지 개수를 기준으로 계산하고, 점수는 사용자 API의 값을 표시합니다.
- 현재 등산일지 API에는 실제 산행 거리 필드가 없습니다. 사용자 요청에 따라 월간·누적 거리는 기본값 0 km, 목표 달성률은 0%로 표시합니다. 추천 코스의 예시 거리를 실제 산행 거리로 합산하지 않으며, 실제 거리 연동에는 BE 응답 계약이 필요합니다.
- 산 상세에서 완등을 직접 등록·해제할 수 있습니다. 완등 목록과 통계는 로컬에 저장한 산 ID를 기준으로 동기화됩니다.
- 커스텀 사진, 즐겨찾기, 완등 기록, 목표는 현재 브라우저에 저장됩니다. 서버 동기화와 사용자 계정별 저장은 제공하지 않습니다.

## ToPeak 메뉴와 목표 설정

- 하단 탭 대신 상단 오른쪽 햄버거 버튼으로 모바일 프레임 너비의 70%를 차지하는 사이드 메뉴를 오른쪽에서 엽니다. 배경 클릭, 닫기 버튼, Escape 또는 메뉴 선택으로 닫을 수 있습니다.
- 산탐색, 랭킹, 등산일지, 마이페이지는 기존 화면과 API를 사용합니다. 계정 설정과 마이페이지의 등산기록은 동일한 레이아웃의 별도 준비 중 화면으로 이동하며, 기존 헤더와 뒤로가기를 사용합니다. 프로필 편집과 내 등산일지는 마이페이지에서 계속 제공합니다. 오프라인 지도 관리와 센서 설정 메뉴 및 전용 안내 화면은 제거했습니다.
- 마이페이지의 목표 설정에서 거리(km), 산행 횟수(회)를 각각 선택할 수 있습니다. 두 항목을 모두 해제해 저장하면 목표가 해제됩니다.
- 목표는 `topeak.monthlyGoals`에 저장합니다. 기존 `topeak.monthlyGoalKm` 값이 있으면 거리 목표로 이어받습니다. 거리 목표는 1~1,000km, 산행 횟수 목표는 1~1,000회의 정수를 지원합니다.
- 목표가 있는 월간 통계 카드에는 현재값 / 목표값 및 진행률을 표시합니다. 거리 진행률은 실제 거리 데이터가 없는 현재 API 계약에 따라 0%를 유지합니다.
