import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * OAuth 토큰 교환 요청 DTO
 */
export class ExchangeCodeDto {
  @ApiProperty({
    description: 'OAuth Authorization Code',
    example: 'abc123def456...',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: 'OAuth State (CSRF 방지)',
    example: 'state_abc123def456...',
  })
  @IsString()
  @IsNotEmpty()
  state: string;
}

/**
 * 토큰 응답 DTO
 */
export class TokenResponseDto {
  @ApiProperty({
    description: 'Access Token (JWT)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Refresh Token (JWT)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: '사용자 정보',
    example: {
      id: 'clx1234567890',
      email: 'user@example.com',
      username: 'johndoe',
      name: 'John Doe',
      avatar: 'https://example.com/avatar.jpg',
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
