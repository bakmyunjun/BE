import { IsEmail, IsString, MinLength, IsOptional } from "class-validator";

/**
 * 로그인 DTO
 */
export class LoginDto {
  @IsEmail({}, { message: "올바른 이메일 형식이 아닙니다." })
  email: string;

  @IsString()
  @MinLength(8, { message: "비밀번호는 최소 8자 이상이어야 합니다." })
  password: string;
}

/**
 * 회원가입 DTO
 */
export class RegisterDto {
  @IsEmail({}, { message: "올바른 이메일 형식이 아닙니다." })
  email: string;

  @IsString()
  @MinLength(8, { message: "비밀번호는 최소 8자 이상이어야 합니다." })
  password: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

/**
 * 토큰 응답 DTO
 */
export class TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    username: string | null;
    name: string | null;
    avatar: string | null;
  };
}

