import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from "@nestjs/swagger";
import type { Request } from "express";
import { AuthService } from "../services/auth.service";
import { LoginDto, RegisterDto, TokenResponseDto } from "../dto/auth.dto";
import { Public } from "../decorators/public.decorator";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { User } from "../decorators/user.decorator";
import type { UserPayload } from "../decorators/user.decorator";
import { GitHubAuthGuard } from "../guards/github-auth.guard";
import { KakaoAuthGuard } from "../guards/kakao-auth.guard";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 이메일/비밀번호 로그인
   */
  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "이메일/비밀번호 로그인" })
  @ApiResponse({
    status: 200,
    description: "로그인 성공",
    type: TokenResponseDto,
  })
  @ApiResponse({ status: 401, description: "인증 실패" })
  async login(@Body() loginDto: LoginDto): Promise<TokenResponseDto> {
    return this.authService.login(loginDto);
  }

  /**
   * 회원가입
   */
  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "회원가입" })
  @ApiResponse({
    status: 201,
    description: "회원가입 성공",
    type: TokenResponseDto,
  })
  @ApiResponse({ status: 409, description: "이미 가입된 이메일" })
  async register(@Body() registerDto: RegisterDto): Promise<TokenResponseDto> {
    return this.authService.register(registerDto);
  }

  /**
   * Refresh Token으로 Access Token 재발급
   */
  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Access Token 재발급" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        refreshToken: {
          type: "string",
          example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "토큰 재발급 성공",
    schema: {
      type: "object",
      properties: {
        accessToken: {
          type: "string",
          example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: "유효하지 않은 토큰" })
  async refresh(@Body("refreshToken") refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  /**
   * 현재 사용자 정보 조회
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({ summary: "현재 사용자 정보 조회" })
  @ApiResponse({
    status: 200,
    description: "사용자 정보",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", example: "clx1234567890" },
        email: { type: "string", example: "user@example.com" },
        username: { type: "string", example: "johndoe" },
        name: { type: "string", example: "John Doe" },
        avatar: { type: "string", nullable: true, example: "https://example.com/avatar.jpg" },
        provider: { type: "string", enum: ["EMAIL", "GITHUB", "KAKAO"] },
      },
    },
  })
  @ApiResponse({ status: 401, description: "인증 필요" })
  getProfile(@User() user: UserPayload) {
    return user;
  }

  /**
   * GitHub OAuth 로그인 시작
   */
  @Public()
  @Get("github")
  @UseGuards(GitHubAuthGuard)
  async githubAuth() {
    // Passport가 자동으로 GitHub 인증 페이지로 리다이렉트
  }

  /**
   * GitHub OAuth 콜백
   */
  @Public()
  @Get("github/callback")
  @UseGuards(GitHubAuthGuard)
  async githubCallback(@Req() req: Request) {
    const result = req.user as {
      user: UserPayload;
      tokens: { accessToken: string; refreshToken: string };
    };
    // 실제로는 프론트엔드로 리다이렉트하거나 토큰을 반환해야 함
    return {
      ...result.tokens,
      user: result.user,
    };
  }

  /**
   * Kakao OAuth 로그인 시작
   */
  @Public()
  @Get("kakao")
  @UseGuards(KakaoAuthGuard)
  async kakaoAuth() {
    // Passport가 자동으로 Kakao 인증 페이지로 리다이렉트
  }

  /**
   * Kakao OAuth 콜백
   */
  @Public()
  @Get("kakao/callback")
  @UseGuards(KakaoAuthGuard)
  async kakaoCallback(@Req() req: Request) {
    const result = req.user as {
      user: UserPayload;
      tokens: { accessToken: string; refreshToken: string };
    };
    // 실제로는 프론트엔드로 리다이렉트하거나 토큰을 반환해야 함
    return {
      ...result.tokens,
      user: result.user,
    };
  }
}

