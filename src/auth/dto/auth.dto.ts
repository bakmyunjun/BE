import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
