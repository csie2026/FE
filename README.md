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

산·코스 목록과 경로, 산별 날씨는 API에서 조회합니다. 권역·시군 구분과 경계 지도에는 정적 자료를 사용합니다. 등산기록과 월 목표는 회원 기준으로 조회하며 즐겨찾기는 이 브라우저에서 회원별로 보관합니다.

산행 중 수락한 GPS 표본과 상태를 같은 origin·회원의 브라우저 저장소에 체크포인트로 남깁니다. 종료 요청에는 구간별 GPS 증거와 같은 `clientRequestId`가 들어갑니다. 위치 정확도 50m 이내, 정상 반경 30m 기준을 사용하며 화면 표시를 위한 지도 보정은 원본 판정에 사용하지 않습니다.

### 휴대폰 산행과 복구

- 브라우저 위치 권한을 허용한 후 코스를 선택합니다. 정확도가 낮으면 탁 트인 곳에서 기다립니다. 시작·계속하기 후 상태 표시를 확인합니다.
- 웹의 숨김·복귀·focus 이벤트는 체크포인트를 남기며 단순 숨김만으로 사용자 일시정지를 만들지 않습니다. OS가 탭을 정지하거나 종료할 수 있으므로 잠금·앱 전환 중 연속 GPS 수신과 마지막 표본 저장은 보장되지 않습니다. iOS 앱은 네이티브 수집 상태를 별도로 확인합니다.
- 새로고침 뒤 같은 브라우저·주소·회원으로 등산 메뉴를 엽니다. 유효한 웹 초안·같은 탭 소유권·갱신 후12시간 이내 조건이면 이전 진행/수동 일시정지 상태를 자동 복구합니다. 다른 탭·소유권 불명·구버전·오래된 초안은 수동 확인하며7일 만료 기록도 자동 재개하지 않습니다. 마지막 체크포인트 이후 수집하지 못한 경로는 복원되지 않습니다. 삭제 전 초안을 보존하지만 브라우저 데이터 삭제·시크릿 창 종료로 저장소가 없어지면 복구할 수 없습니다.
- 통신이 끊겨도 열린 산행의 로컬 저장은 계속 시도합니다. 저장 공간이 부족하면 화면의 오류를 확인합니다. 완전히 오프라인인 상태의 새 페이지 로드·로그인·코스 조회는 보장하지 않습니다. 종료 기록은 통신 복구 후 ‘저장 다시 시도’, 재진입 시 ‘종료 기록 저장 재시도’를 선택합니다. 서버 확인 전에는 임시 기록을 삭제하지 않습니다. 충돌 시 내 등산기록부터 확인합니다.
- 구버전 종료 기록 중 GPS 증거가 없는 경우 기존 UUID로 이미 저장된 결과를 확인할 수 있습니다. 서버에 없으면 증거를 복원할 수 없어 임시 기록을 보관합니다.

## 기술 스택

`package.json` 선언 기준입니다.

| 기술                      | 버전/역할                             |
| ------------------------- | ------------------------------------- |
| React / React DOM         | ^19.2.8, 사용자 화면                  |
| TypeScript                | ~6.0.2, 타입 검사                     |
| Vite / React plugin       | ^8.3.0 / ^6.1.1, 개발 서버·빌드       |
| d3-geo                    | ^3.1.1, 지역 지도 처리                |
| Kakao Maps JavaScript SDK | 지도 및 코스·GPS 경로 표시            |
| 브라우저 Geolocation API  | 웹 위치 수집                          |
| Capacitor core/ios/cli     | ^8.0.0, iOS Core Location·SQLite 연동 |
| Oxlint / Prettier         | ^1.81.0 / ^3.9.9, 정적 검사·서식 검사 |
| Node.js test runner       | TypeScript 테스트 실행                |

API 공통 요청은 `src/api.ts`의 `fetch` 기반 client를 사용합니다. 화면 전환은 주로 `App.tsx`에서 관리합니다.

## 프로젝트 구조

```text
src/
├─ main.tsx                 # 앱 진입점
├─ App.tsx / App.css        # 화면 전환, 인증·일지·프로필 흐름
├─ api.ts                   # 세션/CSRF 공통 요청, 활동·일지·이미지 API
├─ components/
│  ├─ hiking/               # GPS 산행 화면, 지도, 코스 API, 위치·세션 hooks
│  ├─ GyeonggiMap.tsx       # 지역 경계 지도
│  ├─ CityMountainList.tsx   # 시·군 산 목록
│  ├─ profile/              # 마이페이지, 산 컬렉션
│  ├─ ranking/              # 랭킹 화면
│  ├─ settings/             # 계정 정보·회원탈퇴
│  ├─ common/               # 사이드 메뉴 등 공통 화면
│  └─ RegionExplorer.tsx    # 지역 탐색
├─ hooks/                   # 개인 이미지, 서버 월 목표·회원별 찜 관리
├─ data/                    # 지역 경계 및 권역 배치 자료
├─ utils/                   # 이미지 처리
└─ assets/                  # 화면 이미지
tests/                      # API 계약, GPS·코스·지도·검색 테스트
```

## 실행 방법

FE 디렉터리에서 실행합니다. Vite 8 및 TypeScript 직접 실행 테스트를 지원하는 Node.js 22.12 이상과 npm을 사용합니다.

```powershell
npm ci
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

상세 API 명세는 DOCS 저장소의 [ToPeak API 명세서](https://github.com/csie2026/DOCS/blob/dev/API_SPEC.md)에서 관리합니다.

## 기능별 구현·검증 문서

기능 구현·검증 이력은 팀 공용 DOCS 저장소에서 관리하며, FE의 기존 `docs/` 경로에는 안내 링크를 유지합니다. 출생연도·탈퇴 UI 이력은 `fe-` 원본을 사용하고, FE·BE 내용이 동일한 계정 정보 이력은 공통 `settings-account-details.md`로 연결합니다.

- [출생연도 선택](https://github.com/csie2026/DOCS/blob/dev/fe-profile-year-selection.md)
- [설정·회원탈퇴](https://github.com/csie2026/DOCS/blob/dev/fe-settings-withdrawal.md)
- [설정 화면 후속 개선](https://github.com/csie2026/DOCS/blob/dev/settings-account-details.md)

문서의 브랜치명과 테스트 결과는 작업 당시의 기록이며, 현재 상태는 최신 코드와 이슈·PR을 함께 확인합니다.

코드와 함께 확인할 [iOS 백그라운드 GPS와 Mac 빌드·실기기 검증 안내](docs/ios-background-gps.md)는 FE에 유지합니다. 지도 데이터의 출처와 생성 안내도 [src/data/README.md](src/data/README.md)와 [src/data/MAP_SOURCE.md](src/data/MAP_SOURCE.md)에 유지합니다.

## 테스트 및 빌드

```powershell
npm run test
npm run build
npm run lint
npm run format:check
```

`test`는 Node.js test runner로 `tests/*.test.ts`를 실행하며 API/CSRF 계약과 GPS 계산·필터, 코스·지도·검색 처리를 검사합니다. 실제 공급자 로그인과 현장 GPS의 브라우저 E2E 검증은 포함하지 않습니다. `build`는 TypeScript 검사 후 Vite로 `dist`를 생성합니다. `npm run preview`로 빌드 결과를 확인할 수 있지만 개발 proxy와 같은 BE 연결을 제공하는 설정은 없습니다.
