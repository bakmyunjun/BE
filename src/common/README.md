# Common 모듈

공통 모듈, DTO, 데코레이터, 유틸리티를 제공합니다.

## 구조

```
common/
├── dto/              # 공통 DTO
│   ├── response.dto.ts          # 응답 DTO (성공/실패/페이지네이션)
│   └── pagination-query.dto.ts  # 페이지네이션 쿼리 DTO
├── filters/          # 예외 필터
│   └── http-exception.filter.ts # HTTP 예외 필터
├── interceptors/     # 인터셉터
│   └── transform.interceptor.ts # 응답 변환 인터셉터
├── decorators/       # 데코레이터
│   ├── request-id.decorator.ts  # Request ID 데코레이터
│   └── api-pagination.decorator.ts # 페이지네이션 Swagger 데코레이터
└── utils/            # 유틸리티
    └── request-id.util.ts        # Request ID 생성 유틸
```

## 사용 예시

### 1. 기본 컨트롤러 (자동 응답 변환)

```typescript
import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    // 자동으로 SuccessResponseDto로 변환됨
    return this.appService.getHello();
  }
}
```

**응답:**
```json
{
  "success": true,
  "data": "Hello World!",
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-01-05T00:00:00.000Z"
  }
}
```

### 2. 페이지네이션 사용

```typescript
import { Controller, Get, Query } from "@nestjs/common";
import { PaginationQueryDto, PaginatedResponseDto, PaginationMetaDto } from "../common";

@Controller("items")
export class ItemsController {
  @Get()
  async findAll(@Query() query: PaginationQueryDto) {
    const [items, total] = await this.prisma.item.findManyAndCount({
      skip: query.skip,
      take: query.take,
    });

    const pageMeta = new PaginationMetaDto(
      query.page || 1,
      query.size || 10,
      total,
    );

    // 수동으로 PaginatedResponseDto 생성
    return new PaginatedResponseDto(items, pageMeta, requestId);
  }
}
```

### 3. 에러 발생

```typescript
import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("error")
  throwError() {
    // 자동으로 ErrorResponseDto로 변환됨
    throw new HttpException("에러 메시지", HttpStatus.BAD_REQUEST);
  }
}
```

**응답:**
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "에러 메시지"
  },
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-01-05T00:00:00.000Z"
  }
}
```

### 4. ValidationPipe 에러

DTO에 `class-validator` 데코레이터를 사용하면 자동으로 검증됩니다:

```typescript
import { IsString, IsEmail } from "class-validator";

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;
}
```

**검증 실패 응답:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값 검증에 실패했습니다.",
    "details": {
      "fields": [
        "email must be an email",
        "name should not be empty"
      ]
    }
  },
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-01-05T00:00:00.000Z"
  }
}
```

## 주요 기능

### ValidationPipe
- 글로벌로 적용됨
- DTO에 정의되지 않은 속성 자동 제거 (`whitelist: true`)
- 타입 자동 변환 (`transform: true`)

### 응답 변환
- 모든 성공 응답은 자동으로 `SuccessResponseDto` 형식으로 변환
- 예외는 자동으로 `ErrorResponseDto` 형식으로 변환

### Request ID
- 모든 요청에 고유한 `requestId` 자동 생성
- `X-Request-Id` 헤더로 전달 가능

