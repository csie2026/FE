# ToPeak FE

## 프로젝트 소개

ToPeak은 경기도의 산을 대상으로 산 탐색, 등산 코스, GPS 기반 등산기록, 등산일지와 랭킹을 제공하는 서비스입니다. 이 저장소는 사용자 화면, GPS 측정, 지도 표시와 BE API 연동을 담당합니다.

## 주요 기능

- Google/Kakao OAuth 로그인, 로그아웃, 최초 프로필 설정 및 수정
- 경기도 산 탐색과 즐겨찾기, 산·코스 선택 및 지도 경로 표시
- GPS 위치 수집, 산행 시작·일시정지·종료, 거리와 활동 시간 계산
- 등산 종료 결과 서버 저장, 실패 시 같은 요청 ID로 재시도, 내 등산기록 목록 조회
- 본인의 저장된 등산기록을 선택하여 일지 작성: 산과 날짜는 자동 표시하며 제목·내용·공개 여부를 입력
- 내 일지·공개 일지·사용자별 공개 일지 및 상세 조회, 본인 일지 수정·삭제
- 랭킹과 타 사용자 공개 프로필 조회
- 본인 프로필·배경 이미지 업로드/삭제, 마이페이지와 목표 설정

### 현재 구현 범위

실등산 화면의 산·코스·경로는 BE 데이터를 사용하지만 기존 탐색 지도·추천·산 상세에는 정적 자료도 사용합니다. 산 이름 및 시·군 검색은 산 목록을 받아 FE에서 처리합니다.

GPS 경로는 산행 중 메모리에 관리하며 서버에는 산·코스, 시간, 거리, 정상 도달 여부 등의 요약 결과를 저장합니다. 서버의 원시 GPS 검증이나 산행 인증 기능은 아닙니다. 저장 전 새로고침·이탈 시 진행 데이터가 유실될 수 있습니다.

즐겨찾기, 수동 완등 표시와 월 목표는 브라우저 `localStorage`에 저장하며 서버 동기화와 계정별 분리는 제공하지 않습니다. 마이페이지 산행 횟수 일부는 일지 수를 기준으로 하고 월간·누적 거리는 현재 0으로 표시합니다. 실제 활동 기반 통계 연동은 남아 있습니다.

랭킹은 BE에 저장된 점수를 표시하며 산행 기반 점수 자동 계산은 아직 없습니다. 본인 사진은 ToPeak 업로드 사진을 우선하지만 타 사용자 공개 프로필과 랭킹은 현재 OAuth 공급자의 사진을 사용합니다. BE의 날씨 API와 등산기록 상세 API는 아직 FE에서 호출하지 않습니다.

## 기술 스택

`package.json` 선언 기준입니다.

| 기술 | 버전/역할 |
| --- | --- |
| React / React DOM | ^19.2.8, 사용자 화면 |
| TypeScript | ~6.0.2, 타입 검사 |
| Vite / React plugin | ^8.3.0 / ^6.1.1, 개발 서버·빌드 |
| d3-geo | ^3.1.1, 지역 지도 처리 |
| Kakao Maps JavaScript SDK | 지도 및 코스·GPS 경로 표시 |
| 브라우저 Geolocation API | 위치 수집 |
| Oxlint / Prettier | ^1.81.0 / ^3.9.9, 정적 검사·서식 검사 |
| Node.js test runner | TypeScript 테스트 실행 |

API 공통 요청은 `src/api.ts`의 `fetch` 기반 client를 사용합니다. 화면 전환은 주로 `App.tsx`에서 관리합니다.

## 프로젝트 구조

```text
src/
├─ main.tsx                 # 앱 진입점
├─ App.tsx / App.css        # 화면 전환, 인증·일지·프로필 흐름
├─ api.ts                   # 세션/CSRF 공통 요청, 활동·일지·이미지 API
├─ components/
│  ├─ hiking/               # GPS 산행 화면, 지도, 코스 API, 위치·세션 hooks
│  ├─ mountain/             # 산 탐색 지도
│  ├─ profile/              # 마이페이지, 산 컬렉션
│  ├─ ranking/              # 랭킹 화면
│  ├─ common/               # 사이드 메뉴 등 공통 화면
│  └─ RegionExplorer.tsx    # 지역 탐색
├─ hooks/                   # 개인 이미지, 로컬 목표·산 ID 관리
├─ data/                    # 지역 경계 및 정적 산·탐색 자료
├─ utils/                   # 이미지 처리
└─ assets/                  # 화면 이미지
tests/                      # API 계약, GPS·코스·지도·검색 테스트
```

## 실행 방법

FE 디렉터리에서 실행합니다. Vite 8 및 TypeScript 직접 실행 테스트를 지원하는 Node.js 22.12 이상과 npm을 사용합니다.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

기존 `.env.local`이 있다면 복사 대신 기존 파일을 사용합니다. 지도 키를 설정한 뒤 서버를 시작합니다. 기본 개발 주소는 `http://localhost:5173`이며 포트가 사용 중이면 Vite가 다른 포트를 선택할 수 있습니다. 인증 기능 사용에는 BE와 PostgreSQL이 실행되어 있어야 합니다.

GPS는 위치 권한과 secure context(HTTPS 또는 localhost)가 필요합니다. 휴대폰에서 접속할 때는 HTTPS 환경을 준비합니다.

## 환경 변수

현재 FE 코드에서 사용하는 환경 변수는 다음 하나입니다.

```dotenv
VITE_KAKAO_MAP_JAVASCRIPT_KEY=<Kakao Maps JavaScript 키>
```

`.env.example`을 참고하여 `.env.local`에 설정합니다. `.env.local`은 `.gitignore`에서 제외됩니다. Kakao Developers에 실제 FE 접속 도메인을 등록해야 합니다. 이 값은 브라우저 SDK용 JavaScript 키이며 OAuth Client Secret이나 REST API 키를 FE에 넣지 않습니다. 변경 후 개발 서버를 재시작합니다.

## BE 연결

`vite.config.ts`는 `/api`, `/oauth2`, `/login`을 `http://localhost:8080`으로 proxy합니다. API 요청은 세션 cookie를 포함하고 변경 요청 전에 `/api/csrf`를 조회하여 반환된 헤더명과 토큰을 전달합니다. JWT를 저장하거나 발급받는 흐름은 없습니다.

OAuth 로그인은 브라우저 이동으로 시작하며 성공 시 BE의 `FRONTEND_URL`로 돌아옵니다. 개발 proxy를 사용하면 공급자 콘솔 callback 주소는 `http://localhost:5173/login/oauth2/code/google`과 `http://localhost:5173/login/oauth2/code/kakao`입니다. 포트를 바꾸면 callback과 BE의 `FRONTEND_URL`도 실제 주소에 맞춥니다.

Vite 개발 proxy는 배포에 자동 적용되지 않습니다. 배포 환경에서는 같은 origin에서 위 경로를 BE에 전달하도록 proxy와 OAuth 주소를 구성해야 합니다.

상세 API 명세는 DOCS Repository의 [ToPeak_API명세서.md](https://github.com/csie2026/DOCS/blob/main/ToPeak_API명세서.md)에서 관리합니다.

## 테스트 및 빌드

```powershell
npm run test
npm run build
npm run lint
npm run format:check
```

`test`는 Node.js test runner로 `tests/*.test.ts`를 실행하며 API/CSRF 계약과 GPS 계산·필터, 코스·지도·검색 처리를 검사합니다. 실제 공급자 로그인과 현장 GPS의 브라우저 E2E 검증은 포함하지 않습니다. `build`는 TypeScript 검사 후 Vite로 `dist`를 생성합니다. `npm run preview`로 빌드 결과를 확인할 수 있지만 개발 proxy와 같은 BE 연결을 제공하는 설정은 없습니다.
