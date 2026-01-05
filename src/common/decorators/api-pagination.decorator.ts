import { Type } from "@nestjs/common";

/**
 * 페이지네이션 응답 데코레이터
 * Swagger를 사용하는 경우 @nestjs/swagger 패키지 설치 후 사용하세요.
 * 
 * @example
 * // @nestjs/swagger 설치 후:
 * import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
 * import { applyDecorators } from "@nestjs/common";
 * 
 * export const ApiPaginatedResponse = <DataDto extends Type<unknown>>(
 *   dataDto: DataDto,
 * ) =>
 *   applyDecorators(
 *     ApiOkResponse({
 *       schema: {
 *         allOf: [
 *           { $ref: getSchemaPath(PaginatedResponseDto) },
 *           {
 *             properties: {
 *               data: {
 *                 properties: {
 *                   items: {
 *                     type: "array",
 *                     items: { $ref: getSchemaPath(dataDto) },
 *                   },
 *                 },
 *               },
 *             },
 *           },
 *         ],
 *       },
 *     }),
 *   );
 */
export const ApiPaginatedResponse = <DataDto extends Type<unknown>>(
  _dataDto: DataDto,
) => {
  // Swagger 미설치 시 빈 데코레이터 (추후 확장 가능)
  return () => {};
};

