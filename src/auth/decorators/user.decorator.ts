import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type UserPayload = {
  id: string;
  email: string | null;
  username: string | null;
  name: string | null;
  avatar: string | null;
  provider: "EMAIL" | "GITHUB" | "KAKAO";
};

/**
 * @User() 데코레이터
 * 현재 인증된 사용자 정보를 가져옵니다.
 *
 * @example
 * @Get('profile')
 * getProfile(@User() user: UserPayload) {
 *   return user;
 * }
 */
export const User = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserPayload;

    return data ? user?.[data] : user;
  },
);

