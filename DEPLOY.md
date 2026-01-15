# AWS EC2 배포 가이드

## 사전 준비

### 1. EC2 인스턴스 설정

- Ubuntu 22.04 LTS 이상 권장
- 최소 2GB RAM, 2 vCPU
- 보안 그룹에서 포트 3000 (또는 설정한 PORT) 열기

### 2. RDS 및 ElastiCache 설정

- RDS PostgreSQL 인스턴스 생성
- ElastiCache Redis 클러스터 생성
- EC2 보안 그룹을 RDS/ElastiCache 보안 그룹의 인바운드 규칙에 추가

## EC2 인스턴스 설정

### 1. SSH 접속

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

### 2. 시스템 업데이트

```bash
sudo apt update && sudo apt upgrade -y
```

### 3. Docker 설치

```bash
# Docker 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 현재 사용자를 docker 그룹에 추가 (sudo 없이 docker 사용)
sudo usermod -aG docker $USER
newgrp docker

# Docker Compose v2 설치 (권장)
# Docker Compose v2는 docker compose (하이픈 없음)로 사용
sudo apt install docker-compose-plugin -y

# 또는 수동 설치 (v1, 구버전)
# sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
# sudo chmod +x /usr/local/bin/docker-compose

# 설치 확인
docker --version
docker compose version  # v2 사용 시
# 또는
docker-compose --version  # v1 사용 시
```

### 4. Git 설치 (없는 경우)

```bash
sudo apt install git -y
```

### 5. 프로젝트 클론

```bash
# 프로젝트 디렉토리로 이동
cd /home/ubuntu

# 저장소 클론 (SSH 키 설정 필요)
git clone git@github.com:bakmyunjun/BE.git
cd BE

# 또는 HTTPS 사용
# git clone https://github.com/bakmyunjun/BE.git
# cd BE
```

### 6. 환경 변수 설정

```bash
# .env.production 파일 생성
nano .env.production
```

`.env.production` 파일 내용:

```env
NODE_ENV=production
PORT=3000
TZ=Asia/Seoul

# RDS 연결 (실제 RDS 엔드포인트로 변경)
DATABASE_URL=postgresql://username:password@your-rds-endpoint.region.rds.amazonaws.com:5432/dbname

# ElastiCache 연결 (실제 ElastiCache 엔드포인트로 변경)
REDIS_URL=redis://your-elasticache-endpoint.cache.amazonaws.com:6379

# JWT 시크릿 (프로덕션용 강력한 시크릿 사용)
JWT_ACCESS_SECRET=your-production-access-secret-minimum-64-characters
JWT_REFRESH_SECRET=your-production-refresh-secret-minimum-64-characters

# OAuth 설정 (선택)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=https://your-domain.com/auth/github/callback

KAKAO_CLIENT_ID=your-kakao-client-id
KAKAO_CLIENT_SECRET=your-kakao-client-secret
KAKAO_CALLBACK_URL=https://your-domain.com/auth/kakao/callback

OAUTH_REDIRECT_URL=https://your-domain.com
FRONTEND_URL=https://your-frontend-domain.com

# Swagger 활성화 (프로덕션에서도 사용하려면)
ENABLE_SWAGGER=true
```

파일 저장: `Ctrl + X`, `Y`, `Enter`

### 7. RDS 데이터베이스 생성

RDS에 데이터베이스가 없으면 먼저 생성해야 합니다:

**방법 1: psql을 사용하여 생성 (권장)**

```bash
# PostgreSQL 클라이언트 설치
sudo apt install postgresql-client -y

# RDS에 연결하여 데이터베이스 생성
# DATABASE_URL에서 정보 추출하여 사용
psql -h your-rds-endpoint.region.rds.amazonaws.com -U username -d postgres -c "CREATE DATABASE bakmyunjun_prod;"

# 또는 .env.production의 DATABASE_URL을 사용
# 예: DATABASE_URL=postgresql://user:pass@host:5432/postgres
# 위 URL에서 postgres 데이터베이스에 연결하여 새 데이터베이스 생성
```

**방법 2: Docker 컨테이너를 사용하여 생성**

```bash
# PostgreSQL 클라이언트가 포함된 컨테이너 실행
docker run -it --rm postgres:16-alpine psql "postgresql://username:password@your-rds-endpoint.region.rds.amazonaws.com:5432/postgres" -c "CREATE DATABASE bakmyunjun_prod;"
```

**방법 3: AWS RDS 콘솔에서 수정**

1. AWS RDS 콘솔 → 데이터베이스 선택
2. "수정" 클릭
3. "추가 구성" 섹션에서 "초기 데이터베이스 이름"에 `bakmyunjun_prod` 입력
4. 적용 (인스턴스 재시작 필요할 수 있음)

**데이터베이스 생성 확인:**

```bash
# 데이터베이스 목록 확인
psql -h your-rds-endpoint.region.rds.amazonaws.com -U username -d postgres -c "\l"

# 또는 Docker 사용
docker run -it --rm postgres:16-alpine psql "postgresql://username:password@your-rds-endpoint.region.rds.amazonaws.com:5432/postgres" -c "\l"
```

### 8. 데이터베이스 마이그레이션 실행

**방법 1: EC2에서 직접 실행 (권장, 더 간단)**

```bash
# Node.js 및 pnpm 설치 (아직 설치하지 않은 경우)
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc

# 프로젝트 디렉토리로 이동
cd ~/BE

# Prisma 설치
pnpm install prisma@5.22.0 @prisma/client@5.22.0 --save-dev

# .env.production 파일을 .env로 복사 (Prisma가 .env를 읽음)
cp .env.production .env

# 마이그레이션 실행
pnpm prisma migrate deploy

# .env 파일 삭제 (보안)
rm .env
```

**방법 2: Docker 컨테이너 사용 (migrations 폴더가 포함된 경우)**

```bash
# 먼저 빌드 (migrations 폴더 포함)
docker-compose -f docker-compose.prod.yml build

# 마이그레이션 실행
docker compose -f docker-compose.prod.yml run --rm app pnpm dlx prisma@5.22.0 migrate deploy
```

**방법 3: Docker 컨테이너에서 직접 실행 (임시)**

```bash
# 마이그레이션 파일을 컨테이너에 마운트하여 실행
docker run --rm \
  -v $(pwd)/prisma:/app/prisma \
  -v $(pwd)/.env.production:/app/.env \
  -w /app \
  node:20-bookworm-slim \
  sh -c "apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/* && corepack enable && corepack prepare pnpm@latest --activate && pnpm install prisma@5.22.0 && pnpm prisma migrate deploy"
```

### 9. 앱 실행

```bash
# 백그라운드로 실행
# Docker Compose v2 사용 시: docker compose (하이픈 없음)
docker compose -f docker-compose.prod.yml up -d

# 로그 확인
docker compose -f docker-compose.prod.yml logs -f app

# 상태 확인
docker-compose -f docker-compose.prod.yml ps
```

## 유용한 명령어

### 앱 재시작

```bash
docker-compose -f docker-compose.prod.yml restart app
```

### 앱 중지

```bash
docker-compose -f docker-compose.prod.yml down
```

### 앱 업데이트 (새 코드 배포)

```bash
# 최신 코드 가져오기
git pull origin main

# 재빌드 및 재시작
docker-compose -f docker-compose.prod.yml up -d --build
```

### 로그 확인

```bash
# 실시간 로그
docker-compose -f docker-compose.prod.yml logs -f app

# 최근 100줄
docker-compose -f docker-compose.prod.yml logs --tail=100 app
```

### 컨테이너 상태 확인

```bash
docker-compose -f docker-compose.prod.yml ps
docker ps
```

### 마이그레이션 상태 확인

```bash
# 마이그레이션 상태 확인
docker compose -f docker-compose.prod.yml run --rm app pnpm dlx prisma@5.22.0 migrate status

# 컨테이너 내부의 migrations 폴더 확인
docker compose -f docker-compose.prod.yml run --rm app ls -la prisma/migrations
```

### 마이그레이션 재실행

```bash
# 마이그레이션 강제 적용 (이미 적용된 것도 다시 실행)
docker compose -f docker-compose.prod.yml run --rm app pnpm dlx prisma@5.22.0 migrate deploy

# 또는 마이그레이션 상태 확인 후 필요시 실행
docker compose -f docker-compose.prod.yml run --rm app pnpm dlx prisma@5.22.0 migrate status
```

## 자동 시작 설정 (선택)

### systemd 서비스 생성

```bash
sudo nano /etc/systemd/system/bakmyunjun.service
```

서비스 파일 내용:

```ini
[Unit]
Description=Bakmyunjun Backend Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/BE
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

서비스 활성화:

```bash
sudo systemctl daemon-reload
sudo systemctl enable bakmyunjun.service
sudo systemctl start bakmyunjun.service

# 상태 확인
sudo systemctl status bakmyunjun.service
```

## 트러블슈팅

### RDS 연결 실패

- EC2 보안 그룹이 RDS 보안 그룹의 인바운드 규칙에 추가되었는지 확인
- RDS가 퍼블릭 액세스 가능한지 확인 (또는 같은 VPC 내에 있는지 확인)
- DATABASE_URL이 정확한지 확인

### ElastiCache 연결 실패

- EC2 보안 그룹이 ElastiCache 보안 그룹의 인바운드 규칙에 추가되었는지 확인
- ElastiCache가 같은 VPC 내에 있는지 확인
- REDIS_URL이 정확한지 확인

### 포트 이미 사용 중

```bash
# 포트 사용 확인
sudo lsof -i :3000
# 또는
sudo netstat -tulpn | grep 3000

# 기존 컨테이너 중지
docker-compose -f docker-compose.prod.yml down
```

### 디스크 공간 부족

```bash
# 사용하지 않는 Docker 이미지/컨테이너 정리
docker system prune -a
```

## 보안 권장사항

1. `.env.production` 파일 권한 설정:

```bash
chmod 600 .env.production
```

2. 방화벽 설정 (UFW):

```bash
sudo ufw allow 22/tcp  # SSH
sudo ufw allow 3000/tcp # 앱 포트
sudo ufw enable
```

3. Nginx 리버스 프록시 사용 권장 (HTTPS, 도메인 연결)
