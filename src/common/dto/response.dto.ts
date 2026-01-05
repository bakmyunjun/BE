/**
 * 공통 응답 DTO
 * 모든 API 응답은 이 포맷을 따릅니다.
 */

/**
 * 성공 응답
 */
export class SuccessResponseDto<T = unknown> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };

  constructor(data: T, requestId: string) {
    this.success = true;
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
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
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

  constructor(
    number: number,
    size: number,
    totalItems: number,
  ) {
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

  constructor(
    items: T[],
    page: PaginationMetaDto,
    requestId: string,
  ) {
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

