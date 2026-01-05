# Postman 컬렉션

## 자동 생성 방법

Swagger에서 생성한 OpenAPI 스펙을 기반으로 Postman 컬렉션을 자동 생성할 수 있습니다.

### 1. 서버 실행

```bash
npm run start:dev
```

### 2. 컬렉션 자동 생성

```bash
npm run postman:generate
```

이 명령어는:
- `http://localhost:3000/api-json`에서 OpenAPI 스펙을 가져옵니다
- Postman 컬렉션으로 변환합니다
- `postman/collection.json` 파일을 생성/업데이트합니다

### 3. Postman에서 Import

1. Postman 열기
2. **Import** 클릭
3. `postman/collection.json` 파일 선택

## 수동 생성 방법

Swagger UI에서 직접 Export도 가능합니다:

1. 서버 실행 후 `http://localhost:3000/api` 접속
2. 우측 상단 **Download** 버튼 클릭
3. **Postman Collection v2.1** 선택
4. 다운로드한 파일을 Postman에서 Import

## 환경 변수

컬렉션에는 다음 변수가 포함되어 있습니다:

- `baseUrl`: API 기본 URL (기본값: `http://localhost:3000`)
- `accessToken`: JWT Access Token
- `refreshToken`: JWT Refresh Token

## 주의사항

- 서버가 실행 중이어야 컬렉션을 생성할 수 있습니다
- API가 변경되면 `npm run postman:generate`를 다시 실행하여 컬렉션을 업데이트하세요

