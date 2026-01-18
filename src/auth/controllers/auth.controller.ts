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
  InternalServerErrorException,
  HttpRedirectResponse,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { RequestWithId } from '../../types/express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';
import { Public } from '../decorators/public.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { User } from '../decorators/user.decorator';
import type { UserPayload } from '../decorators/user.decorator';
import { GitHubAuthGuard } from '../guards/github-auth.guard';
import { KakaoAuthGuard } from '../guards/kakao-auth.guard';
import type { Env } from '../../config/env.schema';
import { ExchangeCodeDto } from '../dto/auth.dto';
import { LoggerService } from '../../common/logger/logger.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<Env, true>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Refresh Token으로 Access Token 재발급
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Access Token 재발급' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '토큰 재발급 성공',
    schema: {
      type: 'object',
      properties: {
        accessToken: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: '유효하지 않은 토큰' })
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  /**
   * 현재 사용자 정보 조회
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '현재 사용자 정보 조회' })
  @ApiResponse({
    status: 200,
    description: '사용자 정보',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'bigint', example: '1' },
        email: { type: 'string', nullable: true, example: 'user@example.com' },
        nickname: { type: 'string', nullable: true, example: 'johndoe' },
      },
    },
  })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getProfile(@User() user: UserPayload) {
    return {
      id: user.id.toString(),
      email: user.email,
      nickname: user.nickname,
    };
  }

  /**
   * GitHub OAuth 로그인 시작
   * State와 PKCE code_challenge 생성 후 OAuth 제공자로 리다이렉트
   *
   * @query redirect_uri - 프론트엔드가 리다이렉트받을 URL (선택적)
   */
  @Public()
  @Get('github')
  async githubAuth(@Req() req: RequestWithId, @Res() res: Response): Promise<void> {
    const result = await this.handleOAuthStart(req, 'GITHUB');
    res.redirect(result.url);
  }

  /**
   * GitHub OAuth 콜백
   */
  @Public()
  @Get('github/callback')
  @UseGuards(GitHubAuthGuard)
  @ApiOperation({ summary: 'GitHub OAuth 콜백 (GitHub에서 호출)' })
  @ApiQuery({
    name: 'code',
    description: 'GitHub에서 발급한 Authorization Code',
    required: true,
  })
  @ApiQuery({
    name: 'state',
    description: 'OAuth State (CSRF 방지)',
    required: true,
  })
  @ApiResponse({
    status: 302,
    description: '프론트엔드로 리다이렉트 (code, state 포함)',
  })
  async githubCallback(
    @Req() req: RequestWithId,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.handleOAuthCallback(req, 'github');
    res.redirect(result.url);
  }

  /**
   * Kakao OAuth 로그인 시작
   * State와 PKCE code_challenge 생성 후 OAuth 제공자로 리다이렉트
   */
  @Public()
  @Get('kakao')
  async kakaoAuth(@Req() req: RequestWithId, @Res() res: Response): Promise<void> {
    const result = await this.handleOAuthStart(req, 'KAKAO');
    res.redirect(result.url);
  }

  /**
   * Kakao OAuth 콜백
   */
  @Public()
  @Get('kakao/callback')
  @UseGuards(KakaoAuthGuard)
  @ApiOperation({ summary: 'Kakao OAuth 콜백 (Kakao에서 호출)' })
  @ApiQuery({
    name: 'code',
    description: 'Kakao에서 발급한 Authorization Code',
    required: true,
  })
  @ApiQuery({
    name: 'state',
    description: 'OAuth State (CSRF 방지)',
    required: true,
  })
  @ApiResponse({
    status: 302,
    description: '프론트엔드로 리다이렉트 (code, state 포함)',
  })
  async kakaoCallback(
    @Req() req: RequestWithId,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.handleOAuthCallback(req, 'kakao');
    res.redirect(result.url);
  }

  /**
   * OAuth Authorization Code로 토큰 교환
   */
  @Public()
  @Post('oauth/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OAuth Authorization Code로 토큰 교환' })
  @ApiBody({ type: ExchangeCodeDto })
  @ApiResponse({
    status: 200,
    description: '토큰 교환 성공',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'bigint', example: '1' },
            email: {
              type: 'string',
              nullable: true,
              example: 'user@example.com',
            },
            nickname: { type: 'string', nullable: true, example: 'johndoe' },
          },
        },
        tokens: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refreshToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: '유효하지 않은 인증 코드' })
  async exchangeCode(@Body() dto: ExchangeCodeDto) {
    return this.authService.exchangeAuthorizationCode(dto.code, dto.state);
  }

  /**
   * OAuth 시작 공통 처리 메서드
   * State와 PKCE code_challenge 생성 후 OAuth 제공자로 리다이렉트
   */
  private async handleOAuthStart(
    req: RequestWithId,
    provider: 'GITHUB' | 'KAKAO',
  ): Promise<HttpRedirectResponse> {
    try {
      // 프론트엔드에서 전달한 redirect_uri (선택적)
      const customRedirectUri = req.query.redirect_uri as string | undefined;

      // 화이트리스트 검증
      if (customRedirectUri) {
        const isAllowed = this.isRedirectUriAllowed(customRedirectUri);
        if (!isAllowed) {
          this.logger.logError(
            req.id,
            new Error(`Redirect URI not allowed: ${customRedirectUri}`),
            `AuthController.${provider}Auth`,
            { customRedirectUri },
          );
          throw new BadRequestException('허용되지 않은 리다이렉트 URL입니다.');
        }
      }

      // State와 PKCE code_challenge 생성
      const { state, codeChallenge } =
        await this.authService.generateOAuthState(
          provider,
          customRedirectUri, // 커스텀 redirect_uri를 state에 저장
        );

      // OAuth 제공자 URL 구성
      let oauthUrl: string;

      if (provider === 'GITHUB') {
        const clientId = this.configService.get('GITHUB_CLIENT_ID', {
          infer: true,
        });
        const callbackUrl =
          this.configService.get('GITHUB_CALLBACK_URL', {
            infer: true,
          }) || '/auth/github/callback';
        if (!clientId) {
          throw new InternalServerErrorException(
            'GITHUB_CLIENT_ID가 설정되지 않았습니다.',
          );
        }
        // GitHub OAuth는 PKCE를 지원하지 않음 (code_challenge 제거)
        oauthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=user:email&state=${state}`;
        this.logger.log(
          `GitHub OAuth URL: ${oauthUrl}`,
          `AuthController.${provider}Auth`,
        );
      } else {
        // KAKAO
        const clientId = this.configService.get('KAKAO_CLIENT_ID', {
          infer: true,
        });
        const callbackUrl =
          this.configService.get('KAKAO_CALLBACK_URL', {
            infer: true,
          }) || '/auth/kakao/callback';
        if (!clientId) {
          throw new InternalServerErrorException(
            'KAKAO_CLIENT_ID가 설정되지 않았습니다.',
          );
        }
        // Kakao OAuth도 PKCE를 지원하지 않음 (code_challenge 제거)
        oauthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&state=${state}`;
      }

      return {
        url: oauthUrl,
        statusCode: HttpStatus.FOUND, // 302
      };
    } catch (error) {
      this.logger.logError(
        req.id,
        error instanceof Error ? error : new Error(String(error)),
        `AuthController.${provider}Auth`,
        { provider },
      );
      throw new InternalServerErrorException(
        'OAuth 시작 처리 중 오류가 발생했습니다.',
      );
    }
  }

  /**
   * OAuth 콜백 공통 처리 메서드
   * @param req Express Request 객체 (LoggingMiddleware 이후이므로 id가 보장됨)
   * @param provider OAuth 제공자 ("github" | "kakao")
   * @returns HttpRedirectResponse 리다이렉트 응답
   */
  private async handleOAuthCallback(
    req: RequestWithId,
    provider: 'github' | 'kakao',
  ): Promise<HttpRedirectResponse> {
    const result = req.user as {
      user: UserPayload;
    };

    try {
      // Authorization code 생성
      const code = await this.authService.generateAuthorizationCode(
        result.user.id,
      );

      // State 검증 (쿼리 파라미터에서)
      const state = req.query.state as string;
      if (!state) {
        throw new BadRequestException('State 파라미터가 필요합니다.');
      }

      // State에서 커스텀 redirect_uri 추출
      const stateData = await this.authService.getOAuthStateData(state);
      const customRedirectUri = stateData?.redirectUri;

      // 리다이렉트 URL 결정 (우선순위: 커스텀 > 환경변수)
      let redirectUrl = customRedirectUri;
      if (!redirectUrl) {
        redirectUrl = this.configService.get('OAUTH_REDIRECT_URL', {
          infer: true,
        });
      }

      if (!redirectUrl) {
        this.logger.logError(
          req.id,
          new Error('OAUTH_REDIRECT_URL is not configured'),
          `AuthController.${provider}Callback`,
          {
            userId: result.user.id.toString(),
            provider,
          },
        );
        throw new InternalServerErrorException(
          'OAuth 리다이렉트 URL이 설정되지 않았습니다.',
        );
      }

      // Authorization code와 state를 쿼리 파라미터로 프론트엔드에 전달
      const url = new URL(redirectUrl);
      url.searchParams.set('code', code);
      url.searchParams.set('state', state);

      // HttpRedirectResponse 반환 (NestJS 파이프라인 유지)
      return {
        url: url.toString(),
        statusCode: HttpStatus.FOUND, // 302
      };
    } catch (error) {
      this.logger.logError(
        req.id,
        error instanceof Error ? error : new Error(String(error)),
        `AuthController.${provider}Callback`,
        {
          userId: result.user.id.toString(),
          provider,
        },
      );

      if (error instanceof TypeError && error.message.includes('Invalid URL')) {
        throw new InternalServerErrorException(
          '잘못된 리다이렉트 URL 형식입니다.',
        );
      }

      throw new InternalServerErrorException(
        'OAuth 콜백 처리 중 오류가 발생했습니다.',
      );
    }
  }

  /**
   * 리다이렉트 URI 화이트리스트 검증
   * @param redirectUri 검증할 리다이렉트 URI
   * @returns 허용 여부
   */
  private isRedirectUriAllowed(redirectUri: string): boolean {
    try {
      const url = new URL(redirectUri);

      // 환경변수에서 허용된 URL 목록 가져오기
      const allowedUrls =
        this.configService.get('OAUTH_ALLOWED_REDIRECT_URLS', {
          infer: true,
        }) || [];

      // 기본 허용 URL (OAUTH_REDIRECT_URL)
      const defaultRedirectUrl = this.configService.get('OAUTH_REDIRECT_URL', {
        infer: true,
      });
      if (defaultRedirectUrl) {
        allowedUrls.push(defaultRedirectUrl);
      }

      // 개발 환경에서는 localhost 자동 허용
      const nodeEnv = this.configService.get('NODE_ENV', { infer: true });
      if (nodeEnv === 'development' && url.hostname === 'localhost') {
        return true;
      }

      // 화이트리스트 검증 (origin 기준)
      const origin = url.origin; // https://bakmyunjun.site
      return allowedUrls.some((allowedUrl) => {
        try {
          const allowedOrigin = new URL(allowedUrl).origin;
          return origin === allowedOrigin;
        } catch {
          return false;
        }
      });
    } catch {
      // URL 파싱 실패 시 거부
      return false;
    }
  }
}
