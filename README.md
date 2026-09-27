# FE 초기 구조

현재 저장소에는 기존 프런트엔드 설정이나 의존성이 없어 요청한 소스 구조만 추가했습니다. React·TypeScript 설치, 빌드 도구, 앱 실행 진입점, 라우터 및 HTTP 클라이언트는 아직 구성하지 않았습니다.

## 파일별 생성 이유

| 파일 | 생성 이유 |
| --- | --- |
| src/api/authApi.ts | 소셜 로그인 및 인증 API 연동 위치 확보 |
| src/api/memberApi.ts | 회원 API 연동 위치 확보 |
| src/api/mountainApi.ts | 산 정보 API 연동 위치 확보 |
| src/api/hikingApi.ts | 등산 기록 API 연동 위치 확보 |
| src/api/rankingApi.ts | 랭킹 API 연동 위치 확보 |
| src/pages/LoginPage.tsx | 로그인 화면 컴포넌트 위치 확보 |
| src/pages/HomePage.tsx | 홈 화면 컴포넌트 위치 확보 |
| src/pages/MountainListPage.tsx | 산 목록 화면 컴포넌트 위치 확보 |
| src/pages/MountainDetailPage.tsx | 산 상세 화면 컴포넌트 위치 확보 |
| src/pages/HikingPage.tsx | 등산 화면 컴포넌트 위치 확보 |
| src/pages/RankingPage.tsx | 랭킹 화면 컴포넌트 위치 확보 |
| src/pages/MyPage.tsx | 내 정보 화면 컴포넌트 위치 확보 |
| src/App.tsx | 앱 최상위 컴포넌트와 향후 라우팅 연결 위치 확보 |
| src 및 모든 하위 폴더의 .gitkeep | 빈 폴더도 Git 커밋에 포함하여 원격 저장소에 구조 보존 |
| README.md | 파일의 역할과 현재 구현 범위 기록 |

## 공용 및 기능별 폴더

- `src/components/common`: 공용 UI 컴포넌트
- `src/components/mountain`: 산 관련 UI 컴포넌트
- `src/components/hiking`: 등산 관련 UI 컴포넌트
- `src/components/ranking`: 랭킹 관련 UI 컴포넌트
- `src/hooks`: 재사용할 커스텀 훅
- `src/types`: 공용 타입
- `src/utils`: 공용 유틸리티
- `src/routes`: 라우트 정의 및 연결

API 파일은 `export {}`만 포함하는 빈 모듈이며 네트워크 요청을 하지 않습니다. 페이지와 App은 `null`을 반환하는 컴포넌트 뼈대이며 UI를 렌더링하지 않습니다. 경로, 인증 토큰 보관 방식, 소셜 공급자, API 요청·응답 타입 및 AI 기능은 구현하지 않았습니다.

## 검증 및 실행

요청한 파일과 모든 소스 폴더의 `.gitkeep` 존재를 확인했습니다. `package.json`, TypeScript 설정 및 빌드·테스트 도구가 아직 없으므로 빌드·실행·테스트 검증은 수행하지 않았습니다. 실행 가능한 앱으로 구성하려면 이후 프런트엔드 도구와 의존성을 설정해야 합니다.

파일 생성까지 수행했으며 커밋과 원격 push는 수행하지 않았습니다.
