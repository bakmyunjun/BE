// Jest E2E 테스트 환경 설정
// CI 환경을 위한 환경변수 설정

// NODE_ENV를 development로 설정하면 localhost가 자동으로 허용됨
process.env.NODE_ENV = 'development';

// OAuth 설정
process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'test-client-id';
process.env.GITHUB_CLIENT_SECRET =
  process.env.GITHUB_CLIENT_SECRET || 'test-client-secret';
process.env.GITHUB_CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL ||
  'http://localhost:3001/auth/github/callback';
process.env.OAUTH_ALLOWED_REDIRECT_URLS =
  process.env.OAUTH_ALLOWED_REDIRECT_URLS ||
  'http://localhost:3000,https://bakmyunjun.site';
process.env.OAUTH_REDIRECT_URL =
  process.env.OAUTH_REDIRECT_URL || 'http://localhost:3000/auth/callback';

// AI 서비스 설정 (테스트용 더미 값)
process.env.UPSTAGE_API_KEY =
  process.env.UPSTAGE_API_KEY || 'test-upstage-api-key';
