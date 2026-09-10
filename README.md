# 소개팅 주선 노트

소개팅 인물, 사진, 상태, 조건, 매칭 기록을 관리하는 private 웹앱입니다.

## 기술 스택

| 분류 | 사용 기술 |
|---|---|
| Frontend | React 18 + TypeScript |
| Bundler | Vite |
| Routing | React Router v6 |
| Database/Auth | Supabase |
| Image upload | Cloudinary unsigned upload |
| Hosting | Vercel |
| PWA | vite-plugin-pwa |
| Styling | Inline styles + shared style objects |

## 주요 기능

- Supabase 이메일/비밀번호 로그인
- 초대/비밀번호 재설정 링크 진입 시 `/set-password`에서 비밀번호와 성별 설정
- 관리자 프로필 메뉴의 **사용자 초대**에서 이메일로 초대 링크를 생성·복사하고 카톡 등으로 직접 전달합니다. 초대받은 사람은 `viewer`로 등록됩니다.
- `admin` / `viewer` 역할 기반 권한 분리
- 인물 등록/수정/상태 변경/삭제
- 인물 추가·수정 중 다른 앱이나 브라우저 탭에 다녀와도, 같은 계정과 권한이 유지되면 작성 창·입력 내용·창 안의 스크롤·진행 중인 사진 업로드 상태가 유지됩니다. 로그아웃·계정 전환·권한 변경 시에는 화면을 초기화합니다.
- **인물 추가 창은 PWA 재시작·새로고침 후에도 자동 복원됩니다.** 계정별로 기기의 `localStorage`에 창 열림 여부, 입력 내용, 업로드가 완료된 사진 주소, 스크롤 위치를 저장합니다. 로그인과 관리자 권한 확인 후 복원하며, 직접 닫은 창은 자동으로 열지 않습니다. 저장에 성공하거나 로그아웃·계정 전환·권한 해제가 확인되면 초안을 삭제합니다. 저장 실패 때는 초안을 유지합니다. 기존 같은 탭의 임시 입력 내용도 새 저장 방식으로 옮깁니다.
- 운영체제에서 PWA 프로세스를 종료한 경우에는 다시 시작할 때 인증·데이터 로딩이 필요할 수 있습니다. 아직 업로드되지 않은 사진 파일과 인물 **수정** 창은 프로세스 재시작 후 자동 복원 대상이 아닙니다. 기기 저장소 사용이 제한되면 폼에 안내합니다.
- 같은 계정의 권한 재조회가 통신 오류로 실패하면 마지막으로 확인한 화면 권한을 유지하고 다음 인증 이벤트에서 다시 확인합니다. 실제 데이터 접근은 Supabase RLS로 계속 검사하며, 최초 로그인·계정 전환 때 조회가 실패하면 `viewer`로 제한합니다. 목록을 다시 불러오는 중이거나 재조회가 실패해도 이미 열린 작성 창은 유지합니다.
- 이름, 성별, 출생년도, 거주지, 직장, 키, 이상형/조건, 특징 메모 관리
- 인물 상태 메뉴로 `활성`, `휴식중`, `비활성` 전환
- 관계 구분: 직접 아는 사이 / 건너건너 (목록에서는 직접 아는 사이 우선 표시)
- Cloudinary 사진 업로드, 리사이즈, 갤러리, 라이트박스
- 사진을 눌러 연 라이트박스에서 두 손가락으로 1~4배 확대·축소하고, 확대한 사진을 한 손가락으로 끌어 이동할 수 있습니다. 원래 크기에서는 좌우 스와이프로 사진을 넘기며, 사진 전환 시 확대 상태가 초기화됩니다. 별도 안내 문구나 초기화 버튼 없이 터치로 조작합니다.
- 성별, 관계, 활성/휴식중/비활성 상태 필터
- viewer는 익명 별칭으로 표시되며, 본인과 반대 성별의 활성 인물만 기본 표시
- 관리자용 매칭 생성, 결과 변경, 삭제
- 인물 상세 페이지의 매칭 히스토리
- 모바일 공유: 텍스트만, 사진만, 텍스트 + 사진
- PWA 지원
- PWA 업데이트는 실행 중인 앱을 강제로 인계하지 않고, 기존 앱/웹 탭을 모두 닫은 뒤 다음 실행 때 적용합니다.

## 권한 구조

- `admin`: `people`, `matches` 원본 데이터를 보고 생성/수정/삭제할 수 있습니다.
- `viewer`: 이름/사진이 제외된 `people_public` 뷰만 볼 수 있고, 화면에서는 성별별 등록 순서에 따른 익명 별칭(`남자 1`, `여자 1` 등)으로 표시됩니다. 삭제된 DB ID와 관계없이 현재 인물을 연속으로 번호 매깁니다. 매칭 기록은 볼 수 없습니다.
- 권한 기준은 `public.profiles.role`입니다.
- 비밀번호 설정 때 선택한 성별은 Supabase Auth 사용자 메타데이터에 저장되며 viewer의 기본 반대 성별 필터에 사용됩니다.
- RLS/role 정책은 `supabase/role_policies.sql`과 `supabase/migrations/20260528115100_role_policies.sql`에 있습니다.

## 프로젝트 구조

```text
src/
├── App.tsx                 # 라우팅과 AuthGate
├── constants.ts            # 상수, 유틸 함수
├── styles.ts               # 공통 스타일 객체
├── lib/supabase.ts         # Supabase 클라이언트
├── hooks/useAuth.ts        # 로그인 세션, role 로딩, 비밀번호 설정 redirect
├── hooks/useData.ts        # people/matches CRUD + 권한별 데이터 로딩
├── components/
│   ├── Avatar.tsx
│   ├── ConfirmDialog.tsx
│   ├── Lightbox.tsx
│   ├── InviteModal.tsx     # 관리자용 초대 링크 생성·복사
│   ├── MatchCard.tsx
│   ├── Modal.tsx
│   ├── PersonCard.tsx
│   └── PersonForm.tsx      # 인물 입력 + Cloudinary 업로드
├── pages/
│   ├── AuthCallback.tsx
│   ├── Layout.tsx
│   ├── LoginPage.tsx
│   ├── MatchesPage.tsx
│   ├── PeoplePage.tsx
│   ├── PersonDetail.tsx
│   └── SetPasswordPage.tsx
└── types/index.ts          # 공통 타입 정의

supabase/
├── config.toml            # Edge Function 인증 설정
├── functions/create-invite/ # 토큰·관리자 권한 확인 후 초대 링크 생성
├── role_policies.sql       # SQL Editor에서 참고/실행하기 쉬운 RLS 정책 파일
└── migrations/             # DB 변경 이력으로 보관하는 SQL migration
```

## 환경변수

`.env.example`을 복사해 `.env`를 만들고 값을 채웁니다.

```bash
cp .env.example .env
```

필요한 값:

```text
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx
VITE_CLOUDINARY_CLOUD_NAME=xxxx
VITE_CLOUDINARY_UPLOAD_PRESET=xxxx
```

Cloudinary 업로드 preset은 브라우저에서 직접 업로드할 수 있도록 unsigned preset으로 설정해야 합니다.

## 로컬 개발

```bash
npm install
npm run dev
```

### 폰에서 접속하기

PC와 폰을 같은 Wi-Fi에 연결한 뒤, 개발 서버를 다음 명령어로 실행합니다.

```bash
npm run dev -- --host 0.0.0.0
```

터미널에 표시되는 `Network` 주소(예: `http://192.168.0.10:5173`)를 폰 브라우저에서 엽니다.
접속이 안 되면 Windows 방화벽에서 Node.js의 개인 네트워크 접근이 허용되어 있는지 확인합니다.

## 자주 쓰는 명령어

```bash
npm run typecheck           # TypeScript 타입 검사
npm run test:auth           # 인증 갱신·계정 전환·비동기 경합 회귀 검사 (모의 이벤트, 실제 UI 검사 제외)
npm run test:app            # 실제 React 폼의 인증/목록 재조회 유지·PWA 재시작 복원 검사 (브라우저 DOM 제외)
npm run test:invite         # 초대 서버 권한·오류와 실제 React 초대/콜백 화면 검사 (외부 서비스 모의 응답)
npm run typecheck:edge      # Deno로 Edge Function 타입 검사 (첫 실행 시 npx가 Deno 다운로드)
npm run build               # 프로덕션 빌드
npm run preview             # 빌드 결과 로컬 미리보기
npm run docs:check          # src에서 쓰는 VITE_* env가 .env.example에 있는지 확인
npm run supabase:status     # 로컬 Supabase 상태 확인
npm run supabase:migrations # Supabase migration 목록 확인
```

## Supabase 설정

1. Supabase 프로젝트를 만들고 Auth 이메일 로그인을 설정합니다.
2. `people`, `matches`, `profiles` 테이블과 필요한 컬럼을 준비합니다.
3. `supabase/migrations/20260528115100_role_policies.sql`의 RLS/role 정책을 적용합니다.
   이후 migration도 시간순으로 모두 적용합니다. `20260726000000_harden_role_access.sql`은
   비로그인 접근 차단, 신규 사용자의 `viewer` 자동 등록, 기존 권한 정책 정리를 포함합니다.
   `20260726010000_fix_viewer_people_visibility.sql`은 `viewer` 목록이 비는 문제를 보완합니다.
4. 최소 한 명의 사용자를 `admin`으로 지정합니다.

관리자 지정 예시:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and u.email = 'your-admin-email@example.com';
```

SQL Editor로 수동 실행해야 할 때는 `supabase/role_policies.sql`을 참고할 수 있습니다.

적용 후에는 비로그인 사용자가 `people_public`을 읽지 못하는지, `viewer`는 이름과 사진을
제외한 정보만 보는지, `admin`은 인물과 매칭을 관리할 수 있는지 각각 확인합니다.

## 앱에서 사용자 초대

1. 관리자로 로그인하고 오른쪽 위 프로필 버튼 → **사용자 초대**를 누릅니다.
2. 상대 이메일을 입력하고 **초대 링크 만들기**를 누릅니다. 메일은 발송하지 않습니다.
3. **링크 복사** 후 카톡 등으로 해당 상대에게 직접 전달합니다. 자동 복사가 차단되면 화면의 링크를 선택해 직접 복사합니다.
4. 상대가 링크를 열고 비밀번호·성별 설정을 마치면 `viewer`로 이용할 수 있습니다.

초대 링크를 가진 사람은 그 계정에 접속할 수 있으므로 입력한 이메일의 당사자에게만 전달합니다.
링크와 입력값은 모달 메모리에만 보관하며, 창을 닫거나 로그아웃·계정 전환·권한 변경으로
모달이 해제되면 지웁니다. 앱 저장소나 함수 로그에는 링크·토큰을 남기지 않으며 함수 응답은
`Cache-Control: no-store`로 반환합니다. 복사한 클립보드나 이미 전달한 메시지는 지워지지 않습니다.

아직 수락하지 않은 초대는 같은 이메일로 링크를 다시 만들 수 있습니다. 가장 최근 링크를 전달하세요.
유효기간은 Supabase Auth의 Email OTP Expiration 설정을 따릅니다. 만료·사용된 링크는
재초대 안내를 보여줍니다. 이미 링크를 수락해 이메일이 확인된 계정은 재초대하지 않으며,
로그인·비밀번호 재설정 링크를 대신 발급하지 않습니다. 비밀번호 설정을 중단했다면
링크를 수락했던 브라우저의 세션에서 설정을 마칩니다.

이번 기능은 `viewer` 초대만 지원합니다. 관리자 초대, 이메일 발송, 초대 이력·취소는 포함하지 않습니다.

### 초대 함수 초기 배포

기존 Vercel 프런트엔드 배포와 별도로 Supabase Edge Function을 한 번 배포해야 합니다.
Supabase CLI에 로그인한 뒤 아래 명령의 `<project-ref>`와 예시 앱 주소를 실제 배포 대상으로 바꿉니다.

```bash
npx supabase login
npx supabase secrets set APP_URL=https://dating-note.vercel.app --project-ref <project-ref>
npx supabase functions deploy create-invite --project-ref <project-ref>
```

| 서버 설정 | 용도 |
|---|---|
| `APP_URL` | 앱의 origin만 지정합니다(예: `https://dating-note.vercel.app`). 경로·쿼리·해시는 넣지 않습니다. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase 호스팅 함수에 기본 제공되며 호출자 토큰과 DB 역할을 확인합니다. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 호스팅 함수에 기본 제공되는 서버 전용 키로 초대 링크를 생성합니다. |

서버 전용 키는 `VITE_*` 변수나 프런트엔드에 넣지 않습니다. 이 기능에는 새 프런트엔드 환경변수가
필요하지 않으며 `.env`도 수정하지 않습니다. `APP_URL`은 Supabase 함수의 설정입니다.

Supabase **Authentication → URL Configuration**에서 Site URL을 앱 주소로 설정하고,
Redirect URLs에 `https://your-app.vercel.app/auth/callback?next=/set-password`를 등록합니다.
함수는 이 주소를 고정해서 사용하며 요청에서 받은 redirect나 역할은 사용하지 않습니다.
SMTP 설정은 필요 없습니다. 비공개 초대 운영 시에는 Auth의 공개 신규 가입 허용을 꺼 둡니다.
관리자 API를 통한 초대는 별도로 사용할 수 있습니다.

`supabase/config.toml`의 `verify_jwt = false`는 게이트웨이의 기존 JWT 검사를 사용하지 않는다는 뜻입니다.
함수 본문에서 반드시 `auth.getUser(token)`으로 실제 사용자 토큰을 검증하고,
호출자 JWT로 `current_user_role()`을 조회해 `admin`일 때만 서버용 클라이언트를 만듭니다.
따라서 비로그인·viewer·프로필 누락·권한 조회 실패는 초대 API에 도달하지 않습니다.
CORS는 `APP_URL` origin만 허용합니다. 로컬 개발은 별도의 로컬/테스트 함수에 해당 origin을 설정합니다.

DB 변경은 없습니다. 신규 사용자를 `viewer`로 만드는 기존
`20260726000000_harden_role_access.sql`의 트리거와 RLS 적용이 전제입니다.
함수 인터페이스는 `POST /functions/v1/create-invite`, 사용자 Bearer 토큰, JSON `{ "email": "..." }`이며,
성공하면 `{ "inviteUrl": "..." }`, 실패하면 HTTP 오류 상태와 `{ "code": "...", "message": "..." }`를 반환합니다.

### 배포 후 검증

- 테스트용 관리자 계정으로 링크를 생성하고 새 브라우저에서 수락 → 비밀번호·성별 설정 → viewer 접근을 확인합니다. 이름·사진·매칭 관리 권한이 생기지 않아야 합니다.
- 미수락 테스트 계정은 같은 이메일로 재생성할 수 있고, 수락한 계정은 `409 already_registered`로 거절되는지 확인합니다. 사용된 링크와 만료된 링크는 새 링크 요청 안내를 보여야 합니다.
- 토큰 없는 요청과 만료 토큰은 401, viewer의 직접 호출은 403으로 차단되는지 확인합니다. 기존 관리자라도 DB 역할이 viewer로 바뀌면 발급할 수 없어야 합니다.
- 모바일에서 복사·수동 복사와 모달 닫기 후 링크 제거를 확인합니다. 생성 실패 시 함수 배포 상태, `APP_URL`, Auth redirect 등록을 점검하며 로그에 토큰·응답 본문을 추가하지 않습니다.

자동 테스트는 SDK의 네트워크 응답과 브라우저 API를 모의 처리하므로 실제 Supabase 프로젝트의
트리거·토큰 만료·redirect 설정이나 실제 브라우저 클립보드까지 검증하지는 않습니다.

## 배포

1. Vercel에서 GitHub 저장소를 연결합니다.
2. Vercel Environment Variables에 `.env`와 같은 값을 등록합니다.
3. 배포 후 Supabase Auth redirect URL에 배포 도메인을 등록합니다.
4. 모바일에서 PWA로 설치하려면 브라우저의 "홈 화면에 추가" 기능을 사용합니다.

`vercel.json`은 `/auth/callback`, `/set-password`, `/people/:id`처럼 React Router가
처리하는 주소를 직접 열어도 `index.html`로 연결되게 합니다. 따라서 초대 링크나
비밀번호 설정 링크를 새 창에서 열어도 Vercel 404가 발생하지 않습니다.

## 문서 관리

- 기능, 라우트, 권한, 환경변수, DB 구조가 바뀌면 README도 같이 갱신합니다.
- `import.meta.env.VITE_*` 변수를 추가/삭제하면 `.env.example`을 갱신하고 `npm run docs:check`를 실행합니다.
- Codex 작업 규칙은 `AGENTS.md`에 있습니다.
