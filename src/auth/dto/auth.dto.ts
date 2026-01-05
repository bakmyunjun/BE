import { IsEmail, IsString, MinLength, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 로그인 DTO
 */
export class LoginDto {
  @ApiProperty({
    description: "이메일 주소",
    example: "user@example.com",
  })
  @IsEmail({}, { message: "올바른 이메일 형식이 아닙니다." })
  email: string;

  @ApiProperty({
    description: "비밀번호 (최소 8자)",
    example: "password123",
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: "비밀번호는 최소 8자 이상이어야 합니다." })
  password: string;
}

/**
 * 회원가입 DTO
 */
export class RegisterDto {
  @ApiProperty({
    description: "이메일 주소",
    example: "user@example.com",
  })
  @IsEmail({}, { message: "올바른 이메일 형식이 아닙니다." })
  email: string;

  @ApiProperty({
    description: "비밀번호 (최소 8자)",
    example: "password123",
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: "비밀번호는 최소 8자 이상이어야 합니다." })
  password: string;

  @ApiPropertyOptional({
    description: "사용자명",
    example: "johndoe",
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: "이름",
    example: "John Doe",
  })
  @IsOptional()
  @IsString()
  name?: string;
}

/**
 * 토큰 응답 DTO
 */
export class TokenResponseDto {
  @ApiProperty({
    description: "Access Token (JWT)",
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  })
  accessToken: string;

  @ApiProperty({
    description: "Refresh Token (JWT)",
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  })
  refreshToken: string;

  @ApiProperty({
    description: "사용자 정보",
    example: {
      id: "clx1234567890",
      email: "user@example.com",
      username: "johndoe",
      name: "John Doe",
      avatar: "https://example.com/avatar.jpg",
    },
  })
  user: {
    id: string;
    email: string | null;
    username: string | null;
    name: string | null;
    avatar: string | null;
  };
}
