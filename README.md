# Bakmyunjun Backend

Bakmyunjun 백엔드 API 서버입니다.

## 기술 스택

- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL (Prisma ORM)
- **Cache**: Redis
- **Authentication**: JWT, OAuth (GitHub, Kakao)
- **Documentation**: Swagger (OpenAPI)

## 사전 요구사항

- Node.js 20 이상
- pnpm
- Docker & Docker Compose (로컬 개발용)

## 설치 및 실행

### 1. 저장소 클론 및 의존성 설치

```bash
git clone <repository-url>
cd BE
pnpm install
```

### 2. 환경 변수 설정

`.env.example` 파일을 참고하여 `.env` 파일을 생성하세요:

```bash
cp .env.example .env
# 또는
cp .env.development.example .env
```

필수 환경 변수:
- `DATABASE_URL`: PostgreSQL 연결 URL
- `JWT_ACCESS_SECRET`: JWT Access Token 비밀키 (최소 32자)
- `JWT_REFRESH_SECRET`: JWT Refresh Token 비밀키 (최소 32자)

### 3. 데이터베이스 설정

#### 로컬 개발 (Docker Compose 사용)

```bash
# PostgreSQL 및 Redis 시작
pnpm docker:up

# 데이터베이스 마이그레이션 실행
pnpm prisma:migrate:dev

# (선택) 시드 데이터 생성
pnpm prisma:seed
```

#### 수동 설정

PostgreSQL과 Redis를 직접 설치한 경우, `.env` 파일에 연결 정보를 설정하세요.

### 4. 애플리케이션 실행

```bash
# 개발 모드 (watch mode)
pnpm start:dev

# 프로덕션 모드
pnpm build
pnpm start:prod
```

서버가 실행되면 `http://localhost:3000`에서 접근할 수 있습니다.

## API 문서

개발 환경에서 Swagger UI를 통해 API 문서를 확인할 수 있습니다:

```
http://localhost:3000/api
```

## 주요 명령어

### 개발

```bash
# 개발 서버 실행 (watch mode)
pnpm start:dev

# 빌드
pnpm build

# 린트
pnpm lint

# 포맷팅
pnpm format
```

### 데이터베이스

```bash
# 마이그레이션 생성 및 적용
pnpm prisma:migrate:dev

# Prisma Studio 실행 (DB GUI)
pnpm prisma:studio

# Prisma Client 재생성
pnpm prisma:generate
```

### 테스트

```bash
# 단위 테스트
pnpm test

# E2E 테스트
pnpm test:e2e

# 테스트 커버리지
pnpm test:cov
```

### Docker

```bash
# 컨테이너 시작
pnpm docker:up

# 컨테이너 중지
pnpm docker:down

# 로그 확인
pnpm docker:logs
```

### Postman

```bash
# Postman 컬렉션 자동 생성
pnpm postman:generate
```

## 프로덕션 배포

### Docker Compose 사용

```bash
# 환경 변수 설정
cp .env.example .env.production
# .env.production 파일 편집

# 프로덕션 빌드 및 실행
docker-compose -f docker-compose.prod.yml up -d
```

### Dockerfile 사용

```bash
# 이미지 빌드
docker build -t bakmyunjun-backend .

# 컨테이너 실행
docker run -p 3000:3000 --env-file .env.production bakmyunjun-backend
```

## 프로젝트 구조

```
src/
├── auth/              # 인증 관련 모듈
│   ├── controllers/   # 인증 컨트롤러
│   ├── services/      # 인증 서비스
│   ├── strategies/    # Passport 전략 (JWT, GitHub, Kakao)
│   ├── guards/        # 인증 가드
│   └── decorators/    # 커스텀 데코레이터 (@User, @Public)
├── common/            # 공통 모듈
│   ├── dto/           # 공통 DTO
│   ├── filters/       # 예외 필터
│   ├── interceptors/  # 인터셉터
│   ├── middleware/    # 미들웨어
│   └── logger/        # 로깅 서비스
├── config/            # 설정 모듈
├── database/          # 데이터베이스 모듈 (Prisma)
└── main.ts            # 애플리케이션 진입점
```

## 환경 변수

자세한 환경 변수 목록은 `.env.example` 파일을 참고하세요.

주요 환경 변수:
- `NODE_ENV`: 실행 환경 (development, production)
- `PORT`: 서버 포트 (기본값: 3000)
- `DATABASE_URL`: PostgreSQL 연결 URL
- `REDIS_URL`: Redis 연결 URL
- `JWT_ACCESS_SECRET`: JWT Access Token 비밀키
- `JWT_REFRESH_SECRET`: JWT Refresh Token 비밀키
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: GitHub OAuth 설정
- `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`: Kakao OAuth 설정

## 라이선스

MIT
