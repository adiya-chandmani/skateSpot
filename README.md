# SKATESPOT

Find it. Skate it. Pin it. — 스트리트 스팟 커뮤니티 지도 MVP. 기준 문서: [`prd.md`](./prd.md).

## 구성

- Next.js 16 (App Router) · Tailwind CSS 4
- Supabase: Postgres + PostGIS, 비공개 Storage
- Clerk: 로그인(이메일 코드, 직접 만든 폼 `src/components/LoginForm.tsx`). 서버는 `auth()`로 사용자를 확인한다
- 카카오맵 JavaScript API, 카카오 로컬 API(키워드 검색·좌표→주소)
- 사진: 브라우저에서 EXIF GPS 읽기(exifr)와 방향 보정·축소·JPEG 변환, 서버(sharp)에서 다시 검증하고 재인코딩

쓰기는 모두 서버 라우트(`src/app/api`)가 service role로 처리한다. 사용자 RLS는 읽기만 허용한다(공개 스팟, 그리고 본인 스팟의 숨김 상태). 사진은 `/api/photos/:id`가 공개 상태를 확인한 뒤 10분짜리 서명 URL로 리다이렉트한다.

| 경로 | 내용 |
|---|---|
| `/` | 지도: 전체 공개 스팟 기본 조회, 클러스터, 즐겨찾기 표시, 미리보기, 목록, My Location |
| `/search` | 지역 검색 전용: 최근 검색 기록(기기 저장), 카카오 키워드 검색 → 지도 이동 |
| `/add`, `/spot/[id]/edit` | 등록·수정 공용 폼 (`src/components/SpotForm.tsx`) |
| `/spot/[id]` | 상세, 신고, 작성자 수정·삭제 |
| `/account` | 즐겨찾기·내 등록 목록, 로그아웃, 탈퇴 |
| `/admin` | 운영자 신고 처리와 직접 조치 (공개 메뉴에 없음) |
| `/terms`, `/privacy` | 약관·개인정보처리방침 초안 |

공통 규칙(유형, 글자 수, 대한민국 좌표 범위)은 `src/lib/spot-rules.ts` 한 곳에 있다. DB 제약은 `supabase/migrations/`(0001 + 이후 변경)에 같은 규칙으로 들어 있다.

## 로컬 실행

```sh
npm install
npx supabase start            # Docker 필요. 마이그레이션 자동 적용
npm run env:local            # 로컬 Supabase URL·키를 .env.local에 기록 (start할 때마다 키가 바뀌면 다시 실행)
npm run dev
```

로컬 인증 메일은 Supabase가 출력하는 Mailpit(Inbucket) URL에서 확인한다. 카카오 키가 없으면 지도 대신 안내가 뜨고, 목록·검색·등록(좌표 직접 입력)은 계속 동작한다.

### 호스팅 Supabase (`vutbkddvfgswfdzgeior`)

- 마이그레이션 `0001`~`0008`이 적용되어 있다. 새 마이그레이션도 로컬(`npm run test:db`, `npx supabase migration up`, E2E)에서 먼저 검증한 뒤 호스팅에 적용한다.
- `.env.local`은 호스팅을 가리킨다. 공개 키는 `sb_publishable_…`이고, 서버 키 `SUPABASE_SERVICE_ROLE_KEY`에는 대시보드 → Project Settings → API Keys의 **secret key**(`sb_secret_…`)를 넣는다. 서버 키는 절대 `NEXT_PUBLIC_`으로 두지 않는다.
- 로컬로 되돌리기: `cp .env.local.localdev .env.local` 또는 `npm run env:local`. 이 명령은 `.env.local`을 로컬 Supabase로 덮어쓴다.

### Clerk (`app_3K1cncq7GX3rSlPNEXsHiryCxdJ`, 개발 인스턴스)

- 설정: 이메일 코드만 사용(비밀번호·Google 끔), 약관 동의 기록 켬. 확인은 `clerk config pull`, 연결 점검은 `clerk doctor`.
- 개발 인스턴스에서 `+clerk_test`가 들어간 이메일(예: `me+clerk_test@example.com`)은 메일이 실제로 가지 않고 코드 `424242`로 로그인된다.
- 운영자 지정: 사용자가 바꿀 수 없는 `publicMetadata.role`을 쓴다. Clerk 대시보드 → Users → 사용자 → Metadata의 public에 `{"role":"admin"}`을 넣는다.
- 출시 전: `clerk deploy`로 운영 인스턴스를 만들고 도메인을 연결한 뒤, Vercel 환경변수에 운영 키를 넣는다.

## 검사

```sh
npm test        # 공통 입력 규칙 (NFC, 좌표, 유형)
npm run test:db # 스키마·RLS·멱등·한도·그리드 집계·익명화·고아 파일 (PostGIS 컨테이너)
npm run lint && npm run build
# 앱과 로컬 Supabase를 띄운 상태에서: 인증, 멱등 등록, 메타데이터 제거, 권한, 숨김, 탈퇴 E2E
BASE=http://localhost:3000 node --env-file=.env.local scripts/e2e-api.mjs
```

E2E는 Clerk **개발** 인스턴스의 백엔드 API로 테스트 사용자·세션을 만들고 끝나면 지운다(`CLERK_SECRET_KEY` 필요).

## 배포 체크 (PRD §15)

- 환경 변수: `.env.example` 참조. 서버 전용 키는 `NEXT_PUBLIC_`을 붙이지 않는다.
- 정리 작업: `vercel.json` 크론이 매시 `/api/cron/cleanup` 호출 (`CRON_SECRET` 필요).
- Clerk: 운영 인스턴스(`clerk deploy`), 허용 도메인, Vercel에 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`·`CLERK_SECRET_KEY` 등록.
- 카카오: developers.kakao.com에서 앱 생성 → JavaScript 키(웹 플랫폼에 배포 도메인·`http://localhost:3000` 등록)와 REST API 키 발급, 카카오맵·로컬 API 사용 설정, 쿼터 확인.
- `NEXT_PUBLIC_CONTACT_EMAIL`, `OPERATOR_WEBHOOK_URL`(우선 신고 알림) 설정.
- 약관·개인정보처리방침 초안의 법률 검토, 위치정보법 신고 여부 판단.

## 미구현 / 다음 단계

- §13 분석 이벤트: 분석 도구가 정해지지 않아 넣지 않았다. 도구를 확정하면 폼과 검색 성공 지점에 이벤트를 추가한다.
- 지도는 전체 공개 핀을 메모리에 보관하고 픽셀 격자로 묶는다. 대규모 데이터로 성능 문제가 생기면 타일 단위 조회로 교체한다.

## DAILY GRIND 지도 장소 가져오기

`data/dailygrind-spots.json`은 [DAILY GRIND 원본 지도](https://www.google.com/maps/d/viewer?mid=1ZOHd2CTv61X5HGhsCpQDV7pLyt-gQEQ)의 장소 218곳을 저장한 스냅샷이다. 원본 이름·좌표·설명·레이어·대표 사진 URL을 보존한다. 현재 유형은 PLAZA(구역형, ⛲) / STREET SPOTS(개별 장애물형, 📷) 중 하나다. 원본 PLAZA 레이어 23곳과 ‘사진 필요’ 레이어의 Plaza 아이콘 4곳을 Plaza로 분류하고, 나머지 191곳은 Street Spot으로 분류한다. JSON의 `types`에는 최초 장애물 태그를 보존하고 `category`에 현재 분류를 저장한다. 현장 상태를 새로 검증한 데이터는 아니다.

```sh
# 네트워크·DB 없이 데이터 검증
node --experimental-strip-types scripts/import-dailygrind.mjs --check
# 대상 DB와 새로 추가할 개수 확인 (쓰기 없음)
node --experimental-strip-types --env-file=.env.local scripts/import-dailygrind.mjs
# 사진 저장 후 장소 일괄 공개 등록
node --experimental-strip-types --env-file=.env.local scripts/import-dailygrind.mjs --apply
```

대표 사진 207장은 JPEG로 변환해 기존 비공개 Storage에 저장하고, 사진이 없는 11곳은 ‘사진 없음’ 안내 이미지를 사용한다. 설명에 원본 출처와 현장 확인 안내를 덧붙인다. 별도 import 작성자와 고정 ID를 사용하며, 같은 ID 또는 같은 이름·좌표가 이미 있으면 숨김 상태를 포함해 건너뛴다. 사진 처리에 실패하면 장소는 등록하지 않으며, 원인을 해결한 뒤 같은 명령으로 재시도할 수 있다. 사용자 등록 규칙과 DB 스키마는 그대로 사용한다.

## 즐겨찾기와 X-GAME PARK

`0008_favorites_and_xgame.sql`은 세 번째 유형 `xgame_park`(🛹 X-GAME PARK)와 사용자별 즐겨찾기 테이블을 추가한다. 호스팅에도 적용되어 있다. 즐겨찾기는 인증된 서버 API로만 접근하며 다른 사용자에게 공개하지 않는다. 프로필 목록, 지도 별 표시, 상세 버튼이 같은 저장 상태를 사용한다.

`data/xgame-parks.json`은 전국 키워드 및 17개 시도 검색 결과에서 전용 시설 70곳을 정리해 호스팅 DB에 등록한 목록이다. 카카오 장소 출처, 보완 현장 기록, 일부 지자체 출처를 포함한다. 중복 장소·화장실·주차장·일반 인라인 트랙·빙상장은 제외했다. 현재 장소 검색에 등재되어 있다는 뜻이며 실제 운영 중임을 보증하거나 전국 시설을 빠짐없이 포함한다는 뜻은 아니다. 오래된 현장 기록만 확인된 장소는 `review_candidates`에 보존하고 자동 등록하지 않는다. 확인된 철거 기록과 좌표 문제도 검토 사유에 남긴다. 대표 사진은 실제 시설 사진 대신 ‘사진 없음’ 안내를 사용한다.

```sh
node --experimental-strip-types scripts/import-xgame-parks.mjs --check
node --experimental-strip-types --env-file=.env.local scripts/import-xgame-parks.mjs
# 0008 적용 후 실행. 기존 장소/수정/숨김 상태를 덮어쓰지 않음.
node --experimental-strip-types --env-file=.env.local scripts/import-xgame-parks.mjs --apply
# 앱 실행 및 0008 적용 후: 사용자 간 격리, 멱등 저장/삭제, 숨김, 탈퇴, 전체 핀 조회
BASE=http://localhost:3000 node --env-file=.env.local scripts/e2e-favorites.mjs
```
