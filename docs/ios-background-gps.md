# Issue #28: iOS 백그라운드 GPS와 React 산행 연결

## 현재 상태

React 산행 화면과 Capacitor iOS의 Core Location/SQLite를 연결했다.
브라우저/Safari/PWA는 기존 watchPosition과 숨김 자동 일시정지를 유지한다.
iOS 앱은 네이티브 수집 시작 확인 후 TRACKING을 확정하며, 화면 잠금/앱 전환만으로 pause하지 않는다.
명시적 pause/resume/종료, 복귀 조회, 복구 종료/삭제를 연결했다.

서버 요청 형식, UUID/저장 재시도 계약, 거리 계산식, 정확도·속도·최소 이동·정상 반경은 유지한다.
복구 초안의 기존 v1/v2 형식에 선택적 native 메타데이터만 추가한다.
새 라이브러리 설치, Android/BE 변경, commit/push/PR은 하지 않았다.

설치된 Capacitor core/ios/cli는 모두 **8.0.0**이다.
공식 ios/ 프로젝트는 Windows에서 생성된 Capacitor 8 SPM 프로젝트다.
App 타깃은 native/ios/의 Swift 원본 네 개를 직접 참조한다. 원본을 복제하거나 삭제하지 않았다.
storyboard 플러그인 등록, 위치 권한/Background Modes, SDK SQLite 링크를 프로젝트 파일에 반영했다.
**Swift 컴파일, Apple SQLite 실행, Xcode 빌드, iPhone 실기기 검증은 미실행이다.**
Windows 테스트는 네이티브 GPS의 실기기 동작을 입증하지 않는다.

## Mac에서 빌드 준비

macOS, Xcode 26 이상, Command Line Tools, Node 22 이상이 필요하다.
Capacitor 8의 iOS 최소 지원 버전은 15다. 연결할 iPhone과 Xcode의 호환성을 확인한다.
현재 Windows Node는 v24.19.0이다.

작업 디렉터리는 FE/이며 기존 브랜치 fix/28-hiking-session-recovery와 미커밋 파일을 보존한다.
아래는 Mac에서 수행할 절차이며 이번 Windows 작업에서는 실행하지 않았다.

```sh
node --version
xcodebuild -version
xcode-select -p
# Mac에 의존성이 없으면 기존 잠금 파일 기준으로 설치
npm ci
npm ls @capacitor/core @capacitor/ios @capacitor/cli
npm run build
npx --no-install cap config --json
```

capacitor.config.ts는 이미 있다. cap init으로 덮어쓰지 않는다.
appId com.topeak.app은 개발용 값이므로 기기 서명 전에 팀의 식별자를 확인한다.
ios/는 이미 있으므로 cap add ios를 다시 실행하거나 디렉터리를 재생성하지 않는다.
Mac으로 작업을 옮길 때 FE/ios/와 FE/native/ios/를 함께 가져가야 상대 참조가 유지된다.

```sh
npx --no-install cap sync ios
npx --no-install cap open ios
```

SPM 의존성 해결과 Apple SDK 빌드는 Mac에서 확인한다. CocoaPods나 Android 플랫폼은 추가하지 않는다.
Capacitor는 MIT 라이선스이며 배포 시 고지를 유지한다.
SQLite3, CoreLocation, Foundation, UIKit은 Apple SDK를 사용한다. 외부 유료 플러그인은 없다.

## 반영된 iOS 프로젝트 설정과 Xcode 확인 항목

1. App 프로젝트의 ToPeak GPS 그룹은 SOURCE_ROOT 기준 ../../native/ios를 참조한다.
   아래 네 파일은 App 타깃 Sources에 각각 한 번씩 포함했다.
   Xcode에서 참조 경로와 Compile Sources를 확인하되 동일 파일을 다시 추가하지 않는다.
   - LocationStore.swift
   - LocationRecorder.swift
   - BackgroundLocationPlugin.swift
   - ToPeakViewController.swift
2. ios/App/App/Base.lproj/Main.storyboard의 초기 bridge View Controller를
   ToPeakViewController, Module App, customModuleProvider target으로 설정했다.
   기존 capacitorDidLoad()의 registerPluginInstance(ToPeakBackgroundLocationPlugin())를 사용한다.
   설치된 Capacitor 8 SDK가 제공하는 실제 API와 대조했다. TS와 Swift의 jsName은
   ToPeakBackgroundLocation으로 일치한다. AppDelegate와 Swift 원본은 수정하지 않았다.
   생성된 capacitor.config.json의 packageClassList에는 이 로컬 플러그인을 수동 추가하지 않는다.
3. native/ios/LocationPermissions.plist의 세 키를 앱 Info.plist에 병합했다.
   NSLocationWhenInUseUsageDescription, NSLocationAlwaysAndWhenInUseUsageDescription,
   UIBackgroundModes의 location이다. 기존 키와 다른 background mode는 보존한다.
   별도 plist를 리소스로 추가하는 것만으로 권한이 적용되지는 않는다.
4. App TargetAttributes의 com.apple.BackgroundModes를 활성화했고 Info.plist의
   UIBackgroundModes에 location을 추가했다. Xcode에서 Location updates 표시를 확인한다.
5. App Frameworks에 SDKROOT/usr/lib/libsqlite3.tbd를 한 번 연결했다.
   CapApp-SPM의 기존 링크는 보존했다. SDK의 SQLite3 모듈과 실제 링크 성공은 Mac 빌드에서 확인한다.
   CapApp-SPM/Package.swift는 CLI 관리 파일이므로 수정하지 않았으며 외부 SQLite 패키지도 추가하지 않았다.
6. LocationStore.swift의 디렉터리/DB 파일 보호는 기존
   completeUntilFirstUserAuthentication 설정을 유지한다. 디렉터리는 백업에서 제외하고
   저널은 같은 디렉터리에 만든다. 새 Data Protection entitlement나 전역 기본 보호 변경은 하지 않았다.
   실제 잠금 중 DB/저널 보호 클래스와 쓰기 동작은 iPhone에서 검증해야 한다.
7. Mac에서 SPM Resolve Package Dependencies와 개발 기기용 Team/서명을 확인한다.
   앱스토어 배포 설정은 범위 밖이다.
8. Swift concurrency 진단과 SDK 가용성은 실제 빌드로 확인한다.
   프로젝트 전체의 안전 검사를 끄거나 설정을 임의로 우회하지 않는다.

## 인터페이스와 상태

src/native/backgroundLocation.ts가 공식 Capacitor 런타임으로 클라이언트를 만든다.
isNativePlatform() && getPlatform() === 'ios'일 때만 React의 네이티브 경로를 사용한다.
브라우저와 iPhone Safari/PWA는 웹 경로다. 플러그인 미등록/실패 시 웹 GPS로 전환하지 않는다.

플러그인 이름은 ToPeakBackgroundLocation이다.

| 메서드                                       | 동작                                                           |
| -------------------------------------------- | -------------------------------------------------------------- |
| requestPermissions()                         | foreground에서 When In Use 권한 요청                           |
| start(key)                                   | 새 UUID 수집 시작. 수집 중 같은 요청은 재시작하지 않음         |
| pause(key)                                   | 수집 중지·활동 시간 저장. 좌표 삭제 없음                       |
| resume(key)                                  | 같은 UUID의 paused/interrupted/error 세션을 새 구간으로 재개   |
| stop(key)                                    | 최종 종료. 반복 호출해도 종료 시각/기록 유지                   |
| getStatus(key)                               | 권한·오류, 상태·활동 시간·구간, 마지막 측정 시각/sequence 조회 |
| readPoints({ ...key, afterSequence, limit }) | 순번 기반 비파괴 조회. 기본 500, 최대 1000                     |

key는 현재 사용자의 userId와 기존 산행 clientRequestId다. 네이티브용 UUID를 새로 만들지 않는다.
한 프로세스에 수집기는 하나다. 다른 사용자/UUID의 접근 또는 동시 시작은 SESSION_CONFLICT다.
stopped UUID는 resume할 수 없고 SESSION_CLOSED다. start로 다시 호출해도 수집하지 않는다.
없는 세션의 getStatus/pause/stop은 session:null, resume/readPoints는 NOT_FOUND다.

상태에는 activeSince, accumulatedMs, segment, lastSequence가 포함된다.
포인트에도 segment가 포함된다. 모든 시각은 정수 Unix 밀리초다.
TS에서 사용자/UUID, 시각/시간, 상태, 순번/페이지 구조를 검증한다.
recording은 위치 수집기 시작 확인이며 첫 GPS fix 수신을 보장하지 않는다.
첫 좌표 전에는 수신 대기를 표시하고 실제 측정 시각으로 무수신 경고를 판단한다.

권한 거부/철회, 서비스 꺼짐, 저장 오류를 구분한다.
일시적 fix 부재는 LOCATION_UNAVAILABLE로 표시하며 수집을 유지한다.
다른 오류나 의도하지 않은 native pause는 중단한다.
저장 실패 시 Core Location부터 멈추고, 실패 상태 저장도 불가능하면 메모리에 중단 경계를 남긴다.
저장 공간이 복구된 후 재개할 때 실제로 멈춰 있던 시간을 활동 시간에 더하지 않는다.

권한 요청과 start/resume은 foreground에서 실행한다.
When In Use + location background mode + 위치 표시기를 사용하며 Always 자동 승격은 하지 않는다.
정밀 위치 해제는 precise:false로 전달한다. 실제 OS별 지속 수집과 권한은 기기 시험 대상이다.

## React 연결과 복구

- 시작: 기존 UUID로 PAUSED 초안 저장 → 권한/네이티브 시작 확인 → TRACKING 확정.
  실패하면 같은 UUID의 초안과 네이티브 원본을 보존한다.
- 수집: iOS는 browser watchPosition을 실행하지 않는다.
  foreground에서 2초 간격과 visibilitychange/focus 복귀 시 조회한다.
  WebView 실행 중단 중에도 Swift 수집기는 네이티브 프로세스 안에서 독립적으로 동작한다.
- 사용자 pause/resume: 네이티브 확인 후 React 상태·시간을 대조한다.
- 화면 잠금/앱 전환: iOS는 visibilitychange/pagehide/beforeunload로 pause하지 않는다.
  웹은 기존 처리를 유지한다. 실제 산행 화면 unmount/로그아웃에는 가능한 범위에서 pause를 요청한다.
  StrictMode effect 재실행은 실제 이탈로 취급하지 않는다.
- 상태 확인 실패: 확인 필요/오류를 표시하고 완료를 막는다. 중지 확인 전 PAUSED라고 확정하지 않는다.
  페이지 읽기 중 권한이 바뀔 수 있으므로 마지막에 상태를 다시 조회한다.
- 복구: 사용자/UUID/ownerToken을 대조한다. 저장 초안의 PAUSED만으로 native 중지를 판단하지 않는다.
  await 이후에도 소유권을 확인하며, 오래된 화면이 새 소유자의 기록을 덮어쓰지 못한다.
- 복구 종료: 실제 코스를 읽고 stop → 최종 조회/저장 → 기존 completeSession을 호출한다.
- 삭제: 유효한 사용자/UUID로 stop을 확인하고 소유권을 재확인한 후 웹 초안만 삭제한다.
  SQLite 원본은 자동 삭제하지 않는다. 손상되어 소유권을 확인할 수 없는 iOS 초안은 삭제를 거부한다.
- 종료: stop → 최종 sequence까지 처리/영속 저장 → pendingInput 고정 → 기존 서버 저장.
  이미 COMPLETED인 UUID/본문은 좌표를 붙이거나 재생성하지 않는다.

선택적인 native 체크포인트에는 cursor, lastTimestamp, segment, baseElapsedMs가 들어간다.
baseElapsedMs는 기존 웹 산행을 명시적으로 네이티브로 전환할 때 이미 누적된 시간을 보존한다.
이 메타데이터는 서버 요청에 포함되지 않는다. 기존 v1/v2 초안과 완료 요청도 읽는다.
기존 7일 복구 유효기간과 ownerToken 검증도 유지한다. 만료·손상 기록은 자동 삭제하지 않는다.

## 좌표 병합 정책

1. getStatus의 lastSequence를 조회 상한으로 고정한다. 계속 도착하는 새 좌표를 끝없이 쫓지 않는다.
2. sequence 순서로 처리한다. lastTimestamp 이하의 측정 시각(늦은 삽입/역전/동일 시각)은
   과거 경로에 소급 삽입하지 않고 거부한다. 페이지를 측정 시각으로 재정렬하지 않는다.
3. 유효한 산행 범위의 측정 시각은 정확도/이동 검증에서 거부된 표본에도 high-water mark로 남긴다.
   같은 페이지·다음 페이지·재실행에서 판정을 일관되게 유지하기 위한 정책이다.
4. 과거 표본은 측정 시각 기준으로 검사하여 15초 freshness만 우회한다.
   정확도 50m, 이동 5m, 같은 구간 속도 8m/s, 좌표/시간 검증은 유지한다.
5. native segment 변경 또는 기존 규칙의 30초 초과 공백은 새 구간이다.
   기존과 동일하게 구간 사이 거리·속도를 연결하지 않는다.
6. 채택/거부 결과와 cursor를 하나의 복구 초안으로 영속 저장한다.
   저장 실패 시 cursor는 진행하지 않는다. 일부 페이지만 저장했으면 이후 페이지부터 재처리한다.
7. FE의 10,000점/1MB 한도를 유지한다. 한도를 넘는 표본은 반영하지 않고 중단 사유·cursor를 저장하며
   native를 pause한다. 남은 SQLite 원본은 삭제하지 않는다.
8. 완료 직전 stopped 상태와 최종 lastSequence/cursor 일치를 다시 확인한다.
   stop/조회/저장 중 하나라도 실패하면 새로운 pendingInput을 만들지 않는다.
9. 과거 좌표를 조회한 시각을 현재 GPS 수신 시각으로 꾸미지 않는다.
   무수신 경고는 native의 실제 lastRecordedAt을 사용한다.

## 영속 저장과 스키마 마이그레이션

Application Support/ToPeakLocation/locations.sqlite에 두 테이블을 사용한다.

- sessions: UUID, 사용자, 상태, 시작/종료 시각, 오류, active_since, accumulated_ms, segment
- points: 증가 순번, 세션 UUID, 측정 시각, 위도/경도, 정확도, 고도/속도, segment

didUpdateLocations의 전체 배열을 네이티브 트랜잭션으로 저장한다. JS 콜백은 필요 없다.
유효하지 않은 좌표/정확도, 현재 수집 구간 시작 전 또는 미래 시각은 제외한다.
같은 세션의 동일 시각·위경도 재수신은 UNIQUE 제약으로 중복 저장하지 않는다.
React의 거리·정상 판정 규칙을 Swift에서 재구현하지 않는다.

DELETE journal과 synchronous FULL을 사용한다.
DB 부모 디렉터리와 DB 파일에 completeUntilFirstUserAuthentication 보호를 적용하고 백업에서 제외한다.
저널은 보호된 디렉터리 안에 생성된다. 잠금 중 쓰기·파일 보호·백업 제외는 iPhone에서 검증해야 한다.
재부팅 후 첫 잠금 해제 전 수집은 보장하지 않는다.

SQLite user_version=1 → 2는 트랜잭션에서 sessions_v2로 데이터를 복사해 상태 CHECK를 확장하고
points에 segment 기본값 0을 추가한다. UUID/사용자/좌표/sequence는 보존한다.
외래 키를 검사하고 성공한 경우만 버전을 갱신한다. 실패하면 기존 테이블/행/버전으로 rollback한다.
v2 재실행 시 컬럼을 중복 추가하지 않는다. v1에 없던 활동 시간을 추측해서 만들지 않는다.

새 프로세스에서 DB를 열 때 기존 recording은 interrupted로 바꾸고 자동 시작하지 않는다.
종료 시각을 모르므로 마지막 저장 좌표까지 확인되는 활동 시간만 보수적으로 유지한다.
이후의 프로세스 종료/재부팅 시간을 임의로 더하지 않는다.
사용자의 명시적 resume은 같은 UUID의 새 구간으로 시작한다.

stop/조회에는 좌표 삭제 코드가 없다. SQLite 자체의 자동 보관 정리/용량 제한은 없다.
FE 한도는 복귀/병합 시 적용하므로 긴 백그라운드 구간의 원본은 FE에 반영되는 양보다 많을 수 있다.
저장장치가 가득 차면 오류로 중단한다. 앱 삭제/기기 손상까지의 영속성을 보장하지 않는다.

## Windows 검증

- npm.cmd test: 기존 전체 FE 테스트 + 네이티브 연동 테스트
- npm.cmd run build: TypeScript 검사 + React/Vite production build
- npm.cmd run lint: 프로젝트 기존 Oxlint (ESLint를 추가하지 않음)
- npm.cmd run format:check: 전체 저장소의 기존 불일치도 확인
- 변경 파일에 한정한 Prettier 검사

iosProject.test.ts는 OpenStep project.pbxproj 전체 구문/중복 ID/참조를 검사하고,
Swift 원본 경로와 App Sources의 단일 포함, SDK SQLite 링크, SPM 참조,
Debug/Release Info.plist, Background Modes, storyboard와 TS/Swift 등록 이름을 확인한다.
XML 파서는 설치된 Capacitor CLI의 기존 plist/xml2js 의존성을 재사용하며 새 라이브러리는 없다.
이 검사는 프로젝트 구성의 정적 검증이며 Swift를 컴파일하지 않는다.

이 실행 환경에서는 cap config --json이 CLI 초기화 중 os.userInfo()의
uv_os_get_passwd ENOMEM 오류로 종료됐다. CLI/시스템 설정을 패치하거나 우회하지 않았다.
Capacitor 설정은 TypeScript 파일을 직접 로드해 App/생성 JSON과 대조했다.
cap copy/sync 성공은 이번 실행에서 검증하지 않았으며 Mac에서 다시 수행해야 한다.
현재 생성된 앱 public/에는 최신 dist/와 바이트가 동일한 웹 파일 9개가 있음을 확인했다.
따라서 CLI 실패를 우회해 생성 파일을 수동 복사하거나 관리 파일을 변경하지 않았다.

nativeTracking 테스트는 mock bridge와 실제 병합/복구 저장 함수로 시작 확인, pause/resume,
지연·중복·역전 표본, cursor 저장 실패/부분 재처리, 소유권, 종료 순서/본문 불변성을 검증한다.
nativeLocationSql 테스트는 Swift의 SQL을 Node SQLite에서 실행하여 신규 스키마,
v1 마이그레이션/rollback/sequence 보존/재실행 중단 시간을 검사한다.
이는 Swift 컴파일, Apple SQLite, UIKit/WebView 생명주기 검증을 대체하지 않는다.

전체 저장소에는 기존 포맷 불일치가 다수 있다. 전체 일괄 포맷은 하지 않고 변경 파일만 정리한다.
브라우저 이벤트와 실제 UI 조작은 수동 회귀 시험이 필요하다.

React 연동 단계 검증 기록: FE 전체 189개 통과(네이티브 관련 31개 포함),
TypeScript/Vite production build 및 Oxlint 통과. 변경 파일 Prettier 검사도 통과했다.
전체 format:check는 이번 수정 파일 밖의 기존 91개 파일 포맷 불일치로 실패했다.

공식 iOS 프로젝트 연결 단계: FE 전체 194개 통과(기존 189개 + iOS 구성 검사 5개),
TypeScript/Vite production build, Oxlint, 이번 변경 테스트/문서의 Prettier 검사 통과.
이 단계에서 기존 React/Swift/패키지/SPM 관리 파일을 변경하지 않았다.

## iPhone 시험 전 필수 작업과 미검증 항목

프로젝트 생성, Swift 타깃 참조, storyboard 등록, 권한/Location updates, SQLite 링크는
파일에 반영했다. Mac에서는 이를 Xcode에서 재확인하고 SPM 의존성 해결, 개발 서명,
실제 Swift 컴파일과 iPhone 설치를 완료해야 한다.
실제 WebView의 UUID 지원과 산행 준비 화면도 확인한다.

설치형 앱에는 Vite dev proxy가 없다. API/OAuth/cookie가 연결되는 테스트 환경을 확인해야 한다.
이번에는 API 주소·OAuth·BE 계약을 변경하지 않았다. 변경이 필요하면 별도 범위로 보고한다.

React 산행 화면으로 다음을 시험한다. 기존 개발용 네이티브 수집기가 남아 있지 않은지 먼저 확인한다.

| 시험                          | 확인할 결과                                          |
| ----------------------------- | ---------------------------------------------------- |
| 일반 웹/Safari 시작·숨김·복귀 | 기존 자동 pause, 명시적 resume, 15초 필터 유지       |
| iOS 권한 허용·시작            | native 확인 전 TRACKING 미확정, 같은 UUID            |
| 화면 잠금 10–15분 이동        | 잠금 구간 좌표 반영, 숨김만으로 pause하지 않음       |
| 다른 앱 전환·반복 복귀        | 구간 좌표 반영, cursor/거리 중복 없음                |
| pause → 이동 → resume         | pause 중 기록 없음, 같은 UUID·새 구간·휴식 시간 제외 |
| pause/stop 반복               | 시간·구간 중복 누적과 좌표 삭제 없음                 |
| stopped UUID resume           | SESSION_CLOSED, 완료 본문 유지                       |
| 산행 화면 이탈·로그아웃       | 가능한 범위에서 pause, 다른 사용자와 분리            |
| WebView reload                | 기존 UUID 복구 후 native recording/paused 상태 대조  |
| 프로세스 종료·재실행          | interrupted, 미확인 시간 자동 누적 없음              |
| 복구 종료·저장                | stop/마지막 병합 후 확정, 재시도 UUID/본문 유지      |
| 임시 기록 삭제                | stop 확인 후 웹 초안 삭제, SQLite 원본 보존          |
| 권한 철회·서비스 끄기         | 오류 구분, 상태 재확인, web fallback 없음            |
| 저장 실패 주입                | 수집 중단, cursor/확정 본문 미진행, 원본 보존        |
| v1 데이터가 있는 앱 업데이트  | 좌표/sequence 보존, v2 스키마, pause/resume          |
| 10,000점/FE 용량 경계         | 명시적 중단, 원본 보존, 완료 요청 유효성             |
| 오프라인·서버 응답 유실       | 로컬 수집 유지, 기존 UUID/본문으로 재시도            |

Safari Web Inspector와 Xcode Devices and Simulators의 앱 컨테이너에서 UUID/sequence/상태를 비교한다.
debugger 없이도 시험한다. 잠금 중 파일 쓰기, When In Use 지속 수집, 배터리/저전력 모드,
위치 정확도, StrictMode/화면 이탈·복귀는 실기기와 수동 브라우저 검증 대상이다.
앱 강제 종료/OS 종료/재부팅 이후의 연속 수집은 보장하지 않는다.
JS 실행 중단 중 발생한 오류는 다음 복귀/상태 조회에서 React에 반영된다.

```sql
SELECT id,user_id,state,active_since,accumulated_ms,segment FROM sessions;
SELECT sequence,timestamp,latitude,longitude,accuracy,segment
FROM points WHERE session_id='<UUID>' ORDER BY sequence;
PRAGMA user_version;
PRAGMA foreign_key_check;
PRAGMA integrity_check;
```

## 근거 자료

- [Capacitor 환경 요구사항](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor iOS](https://capacitorjs.com/docs/ios)
- [로컬 플러그인 등록](https://capacitorjs.com/docs/ios/custom-code)
- [공식 SPM 프로젝트 생성](https://capacitorjs.com/docs/ios/spm)
- [Capacitor MIT](https://github.com/ionic-team/capacitor/blob/8.0.0/LICENSE)
- [Apple 백그라운드 위치](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background)
- [Apple allowsBackgroundLocationUpdates](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates)
- [Apple 파일 보호](https://developer.apple.com/documentation/foundation/fileprotectiontype/completeuntilfirstuserauthentication)

community background-geolocation은 검토한 iOS 소스에 영속 저장/재조회가 없어 설치하지 않았다.
유료 플러그인도 사용하지 않는다.
