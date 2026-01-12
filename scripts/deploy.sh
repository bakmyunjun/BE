#!/bin/bash

# Bakmyunjun Backend 배포 스크립트
# 사용법: ./scripts/deploy.sh

set -e  # 에러 발생 시 스크립트 중단

echo "🚀 Bakmyunjun Backend 배포 시작..."

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 디렉토리 확인
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json을 찾을 수 없습니다. 프로젝트 루트에서 실행하세요.${NC}"
    exit 1
fi

# Git 상태 확인
echo -e "${YELLOW}📦 Git 상태 확인...${NC}"
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  커밋되지 않은 변경사항이 있습니다.${NC}"
    read -p "계속하시겠습니까? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 최신 코드 가져오기
echo -e "${YELLOW}📥 최신 코드 가져오기...${NC}"
git pull origin main || git pull origin master

# 의존성 설치
echo -e "${YELLOW}📦 의존성 설치...${NC}"
pnpm install --prod

# Prisma Client 생성
echo -e "${YELLOW}🗄️  Prisma Client 생성...${NC}"
pnpm prisma generate

# 마이그레이션 실행
echo -e "${YELLOW}🔄 데이터베이스 마이그레이션 실행...${NC}"
read -p "마이그레이션을 실행하시겠습니까? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    pnpm prisma migrate deploy
else
    echo -e "${YELLOW}⏭️  마이그레이션 건너뛰기${NC}"
fi

# 빌드
echo -e "${YELLOW}🔨 프로덕션 빌드...${NC}"
pnpm build

# PM2 재시작
echo -e "${YELLOW}🔄 PM2 재시작...${NC}"
if pm2 list | grep -q "bakmyunjun-backend"; then
    pm2 restart bakmyunjun-backend
else
    pm2 start dist/main.js --name bakmyunjun-backend
    pm2 save
fi

# 상태 확인
echo -e "${YELLOW}📊 상태 확인...${NC}"
sleep 2
pm2 status

echo -e "${GREEN}✅ 배포 완료!${NC}"
echo -e "${GREEN}📝 로그 확인: pm2 logs bakmyunjun-backend${NC}"

