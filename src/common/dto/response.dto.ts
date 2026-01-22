import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 공통 응답 DTO
 * 모든 API 응답은 이 포맷을 따릅니다.
 */

/**
 * 성공 응답
 */
export class SuccessResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ example: 'SUCCESS', description: '응답 코드' })
  code: string;

  @ApiProperty()
  data: T;

  @ApiProperty({
    type: 'object',
    properties: {
      requestId: { type: 'string', example: 'req_xxx' },
      timestamp: { type: 'string', example: '2026-01-05T00:00:00.000Z' },
    },
  })
  meta: {
    requestId: string;
    timestamp: string;
  };

  constructor(data: T, requestId: string, code = 'SUCCESS') {
    this.success = true;
    this.code = code;
    this.data = data;
    this.meta = {
      requestId,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 실패 응답
 */
export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({
    type: 'object',
    properties: {
      code: { type: 'string', example: 'VALIDATION_ERROR' },
      message: { type: 'string', example: '입력값 검증에 실패했습니다.' },
      details: { type: 'object', additionalProperties: true },
    },
  })
  error: {
    code: string;
    message: string;
    details?: unknown;
  };

  @ApiProperty({
    type: 'object',
    properties: {
      requestId: { type: 'string', example: 'req_xxx' },
      timestamp: { type: 'string', example: '2026-01-05T00:00:00.000Z' },
    },
  })
  meta: {
    requestId: string;
    timestamp: string;
  };

  constructor(
    code: string,
    message: string,
    requestId: string,
    details?: unknown,
  ) {
    this.success = false;
    this.error = {
      code,
      message,
      ...(details ? { details } : {}),
    };
    this.meta = {
      requestId,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 페이지네이션 정보
 */
export class PaginationMetaDto {
  number: number;
  size: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;

  constructor(number: number, size: number, totalItems: number) {
    this.number = number;
    this.size = size;
    this.totalItems = totalItems;
    this.totalPages = Math.ceil(totalItems / size);
    this.hasNext = number < this.totalPages;
    this.hasPrev = number > 1;
  }
}

/**
 * 페이지네이션 응답
 */
export class PaginatedResponseDto<T> {
  success: true;
  data: {
    items: T[];
    page: PaginationMetaDto;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };

  constructor(items: T[], page: PaginationMetaDto, requestId: string) {
    this.success = true;
    this.data = {
      items,
      page,
    };
    this.meta = {
      requestId,
      timestamp: new Date().toISOString(),
    };
  }
}
