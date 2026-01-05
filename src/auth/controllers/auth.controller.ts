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
import type { Request } from "express";
import { AuthService } from "../services/auth.service";
import { LoginDto, RegisterDto, TokenResponseDto } from "../dto/auth.dto";
import { Public } from "../decorators/public.decorator";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { User } from "../decorators/user.decorator";
import type { UserPayload } from "../decorators/user.decorator";
import { GitHubAuthGuard } from "../guards/github-auth.guard";
import { KakaoAuthGuard } from "../guards/kakao-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 이메일/비밀번호 로그인
   */
  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<TokenResponseDto> {
    return this.authService.login(loginDto);
  }

  /**
   * 회원가입
   */
  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto): Promise<TokenResponseDto> {
    return this.authService.register(registerDto);
  }

  /**
   * Refresh Token으로 Access Token 재발급
   */
  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body("refreshToken") refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  /**
   * 현재 사용자 정보 조회
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
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

