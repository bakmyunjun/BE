import { convert } from 'openapi-to-postmanv2';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Swagger에서 생성한 OpenAPI JSON을 Postman 컬렉션으로 변환하는 스크립트
 *
 * 사용법:
 * 1. 서버 실행: npm run start:dev
 * 2. http://localhost:3000/api-json 에서 OpenAPI JSON 다운로드
 * 3. 또는 이 스크립트 실행: npm run postman:generate
 */

async function generatePostmanCollection() {
  const openApiUrl =
    process.env.OPENAPI_URL || 'http://localhost:3000/api-json';
  const outputPath =
    process.env.POSTMAN_OUTPUT_PATH ||
    path.join(__dirname, '../postman/collection.json');

  try {
    console.log(`📥 OpenAPI 스펙 다운로드 중: ${openApiUrl}`);

    // OpenAPI JSON 가져오기
    const response = await fetch(openApiUrl);
    if (!response.ok) {
      throw new Error(
        `OpenAPI 스펙을 가져올 수 없습니다: ${response.statusText}\n서버가 실행 중인지 확인하세요: npm run start:dev`,
      );
    }

    const openApiSpec = await response.json();

    console.log('🔄 Postman 컬렉션으로 변환 중...');

    // OpenAPI를 Postman 컬렉션으로 변환
    const conversionResult = await convert(openApiSpec, {
      folderStrategy: 'Tags', // 태그별로 폴더 생성
      requestParametersResolution: 'Example', // 예시 값 사용
      optimizeConversion: true,
    });

    if (!conversionResult.result) {
      throw new Error(
        `변환 실패: ${conversionResult.reason || '알 수 없는 오류'}`,
      );
    }

    // 컬렉션에 변수 추가 (baseUrl 등)
    const collection = conversionResult.output[0].data;
    if (collection.variable) {
      collection.variable.push({
        key: 'baseUrl',
        value: 'http://localhost:3000',
        type: 'string',
      });
      collection.variable.push({
        key: 'accessToken',
        value: '',
        type: 'string',
      });
      collection.variable.push({
        key: 'refreshToken',
        value: '',
        type: 'string',
      });
    } else {
      collection.variable = [
        {
          key: 'baseUrl',
          value: 'http://localhost:3000',
          type: 'string',
        },
        {
          key: 'accessToken',
          value: '',
          type: 'string',
        },
        {
          key: 'refreshToken',
          value: '',
          type: 'string',
        },
      ];
    }

    // 출력 디렉토리 생성
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 파일 저장
    fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));

    console.log(`✅ Postman 컬렉션 생성 완료: ${outputPath}`);
    console.log(
      `\n📋 사용 방법:\n1. Postman 열기\n2. Import 클릭\n3. ${outputPath} 파일 선택`,
    );
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
generatePostmanCollection();
