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
- `admin` / `viewer` 역할 기반 권한 분리
- 인물 등록/수정/상태 변경/삭제
- 이름, 성별, 출생년도, 거주지, 직장, 키, 이상형/조건, 특징 메모 관리
- 인물 상태 메뉴로 `활성`, `휴식중`, `비활성` 전환
- 관계 구분: 직접 아는 사이 / 건너건너 (목록에서는 직접 아는 사이 우선 표시)
- Cloudinary 사진 업로드, 리사이즈, 갤러리, 라이트박스
- 성별, 관계, 활성/휴식중/비활성 상태 필터
- viewer는 익명 별칭으로 표시되며, 본인과 반대 성별의 활성 인물만 기본 표시
- 관리자용 매칭 생성, 결과 변경, 삭제
- 인물 상세 페이지의 매칭 히스토리
- 모바일 공유: 텍스트만, 사진만, 텍스트 + 사진
- PWA 지원

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

## 자주 쓰는 명령어

```bash
npm run typecheck           # TypeScript 타입 검사
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
