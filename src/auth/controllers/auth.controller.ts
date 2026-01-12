import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
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
import type { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../services/auth.service";
import { Public } from "../decorators/public.decorator";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { User } from "../decorators/user.decorator";
import type { UserPayload } from "../decorators/user.decorator";
import { GitHubAuthGuard } from "../guards/github-auth.guard";
import { KakaoAuthGuard } from "../guards/kakao-auth.guard";
import type { Env } from "../../config/env.schema";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<Env, true>
  ) {}

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
        id: { type: "string", format: "bigint", example: "1" },
        email: { type: "string", nullable: true, example: "user@example.com" },
        nickname: { type: "string", nullable: true, example: "johndoe" },
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
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    const result = req.user as {
      user: UserPayload;
      tokens: { accessToken: string; refreshToken: string };
    };

    const redirectUrl =
      this.configService.get("OAUTH_REDIRECT_URL", { infer: true }) ||
      "http://localhost:3000";

    // 토큰을 쿼리 파라미터로 프론트엔드에 전달
    const url = new URL(redirectUrl);
    url.searchParams.set("accessToken", result.tokens.accessToken);
    url.searchParams.set("refreshToken", result.tokens.refreshToken);

    res.redirect(url.toString());
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
  async kakaoCallback(@Req() req: Request, @Res() res: Response) {
    const result = req.user as {
      user: UserPayload;
      tokens: { accessToken: string; refreshToken: string };
    };

    const redirectUrl =
      this.configService.get("OAUTH_REDIRECT_URL", { infer: true }) ||
      "http://localhost:3000";

    // 토큰을 쿼리 파라미터로 프론트엔드에 전달
    const url = new URL(redirectUrl);
    url.searchParams.set("accessToken", result.tokens.accessToken);
    url.searchParams.set("refreshToken", result.tokens.refreshToken);

    res.redirect(url.toString());
  }
}

