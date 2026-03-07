# 💘 소개팅 주선 노트

소개팅 인물과 매칭을 관리하는 웹앱

## 기술 스택

| 분류 | 사용 기술 |
|---|---|
| Frontend | React 18 + TypeScript |
| Bundler | Vite |
| Routing | React Router v6 |
| Database | Supabase (PostgreSQL) |
| Hosting | Vercel |
| PWA | vite-plugin-pwa |
| Styling | Inline styles (shared style objects) |

## 주요 기능

- 인물 등록 (이름, 출생년도, 거주지, 이상형, 사진 여러 장, 메모)
- 남/여 필터 및 성별 배지 표시
- 매칭 연결 및 상태 관리 (진행중 / 성공 / 실패)
- 인물 상세 페이지 (사진 갤러리, 매칭 히스토리)
- 삭제 확인 모달
- PWA 지원 — 폰 홈 화면에 앱으로 추가 가능

## 프로젝트 구조

```
src/
├── types/index.ts          # 공통 타입 정의
├── constants.ts            # 상수, 유틸 함수
├── styles.ts               # 공통 스타일 객체
├── lib/supabase.ts         # Supabase 클라이언트
├── hooks/useData.ts        # 데이터 CRUD + Context Provider
├── components/
│   ├── Avatar.tsx
│   ├── Modal.tsx
│   ├── Lightbox.tsx
│   ├── ConfirmDialog.tsx
│   ├── PersonForm.tsx
│   ├── PersonCard.tsx
│   └── MatchCard.tsx
└── pages/
    ├── Layout.tsx          # 공통 헤더 + 탭 네비게이션
    ├── PeoplePage.tsx      # /people
    ├── PersonDetail.tsx    # /people/:id
    └── MatchesPage.tsx     # /matches
```

## 로컬 개발

```bash
git clone https://github.com/유저명/blind-date-note.git
cd blind-date-note
npm install
cp .env.example .env      # 환경변수 입력 후 저장
npm run dev
```

## 배포 순서

### 1단계 — Supabase 테이블 생성

[supabase.com](https://supabase.com) → 프로젝트 선택 → **SQL Editor** → 아래 SQL 실행

```sql
create table people (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  name text,
  gender text not null,
  year text,
  location text,
  ideal_type text,
  note text,
  photos text[] default '{}'
);

create table matches (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  male_id bigint references people(id) on delete cascade,
  female_id bigint references people(id) on delete cascade,
  result text default '진행중',
  note text
);
```

**Project Settings → API** 에서 `Project URL`과 `anon public key` 복사

### 2단계 — 환경변수 설정

`.env` 파일:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx
```

### 3단계 — Vercel 배포

1. [vercel.com](https://vercel.com) → **Add New → Project** → GitHub 저장소 연결
2. **Environment Variables** 에 `.env` 값 동일하게 입력
3. **Deploy**

### 4단계 — PWA 설치 (선택)

배포 후 폰 브라우저에서:
- **iPhone**: Safari → 공유 버튼 → "홈 화면에 추가"
- **Android**: Chrome → 주소창 설치 버튼

## 마이그레이션 이력

| 항목 | 이전 | 현재 |
|---|---|---|
| 언어 | JavaScript | TypeScript |
| 데이터베이스 | Firebase Firestore | Supabase (PostgreSQL) |
| 이미지 스토리지 | Cloudinary | base64 → Supabase DB 저장 |
| 스타일링 | Tailwind CSS | Inline styles |
| 라우팅 | 없음 (단일 페이지) | React Router v6 |