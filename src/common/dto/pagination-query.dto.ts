import { Type } from "class-transformer";
import { IsOptional, IsInt, Min, Max } from "class-validator";

/**
 * 페이지네이션 쿼리 DTO
 * 모든 페이지네이션이 필요한 엔드포인트에서 사용
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number = 10;

  get skip(): number {
    return ((this.page || 1) - 1) * (this.size || 10);
  }

  get take(): number {
    return this.size || 10;
  }
}

