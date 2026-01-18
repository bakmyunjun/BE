import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, createHmac } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { Env } from '../../config/env.schema';
import type { UserPayload } from '../decorators/user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  /**
   * Refresh Token으로 Access Token 재발급
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
      });

      const tokenHash = this.hashToken(refreshToken);
      const userId = BigInt(payload.sub);

      // RefreshToken 테이블에서 토큰 확인
      const tokenRecord = await this.prisma.refreshToken.findFirst({
        where: {
          userId,
          tokenHash,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          user: true,
        },
      });

      if (!tokenRecord) {
        throw new UnauthorizedException('유효하지 않은 토큰입니다.');
      }

      const accessToken = await this.generateAccessToken(
        tokenRecord.user.id,
        tokenRecord.user.email || undefined,
      );

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
  }

  /**
   * Access Token 생성
   */
  private async generateAccessToken(
    userId: bigint,
    email?: string,
  ): Promise<string> {
    const payload = { sub: userId.toString(), email };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: '15m', // 15분
    });
  }

  /**
   * Refresh Token 생성
   */
  private async generateRefreshToken(userId: bigint): Promise<string> {
    const payload = { sub: userId.toString() };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
      expiresIn: '7d', // 7일
    });
  }

  /**
   * Access Token과 Refresh Token 생성
   */
  private async generateTokens(
    userId: bigint,
    email?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(userId, email),
      this.generateRefreshToken(userId),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Refresh Token 해시 생성
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Refresh Token 저장
   */
  private async saveRefreshToken(
    userId: bigint,
    refreshToken: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7일 후

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  /**
   * OAuth State 생성
   * @param provider OAuth 제공자 ("GITHUB" | "KAKAO")
   * @param redirectUri 커스텀 리다이렉트 URI (선택적)
   * @returns { state, codeChallenge } - state 반환 (codeChallenge는 빈 문자열, 하위 호환성 유지)
   */
  async generateOAuthState(
    provider: 'GITHUB' | 'KAKAO',
    redirectUri?: string,
  ): Promise<{ state: string; codeChallenge: string }> {
    // State 생성 (CSRF 방지)
    const state = randomBytes(32).toString('hex');

    // State 저장 (10분 후 만료)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await this.prisma.oAuthState.create({
      data: {
        state,
        provider,
        redirectUri, // 커스텀 리다이렉트 URI 저장
        expiresAt,
      },
    });

    return { state, codeChallenge: '' };
  }

  /**
   * OAuth State 데이터 조회
   * @param state State 값
   * @returns State 데이터 (redirectUri 포함)
   */
  async getOAuthStateData(
    state: string,
  ): Promise<{ redirectUri?: string | null } | null> {
    const stateRecord = await this.prisma.oAuthState.findUnique({
      where: { state },
      select: { redirectUri: true },
    });

    return stateRecord;
  }

  /**
   * PKCE code_verifier 생성
   * RFC 7636: 43-128자의 URL-safe 문자열
   */
  private generateCodeVerifier(): string {
    // 43-128자 사이의 랜덤 문자열 생성 (base64url 인코딩)
    const length = 43 + Math.floor(Math.random() * 85); // 43-128
    return randomBytes(length)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
      .substring(0, length);
  }

  /**
   * PKCE code_challenge 생성
   * SHA256(code_verifier) 후 base64url 인코딩
   */
  private generateCodeChallenge(codeVerifier: string): string {
    const hash = createHash('sha256').update(codeVerifier).digest('base64');
    return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /**
   * OAuth State 검증
   * @param state OAuth 콜백에서 받은 state
   * @returns 검증 성공 시 void, 실패 시 예외 발생
   */
  async verifyOAuthState(state: string): Promise<void> {
    const now = new Date();

    // State 조회 및 사용 처리 (원자적 연산)
    const result = await this.prisma.oAuthState.updateMany({
      where: {
        state,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (result.count === 0) {
      throw new BadRequestException('유효하지 않거나 만료된 state입니다.');
    }
  }

  /**
   * OAuth Authorization Code 생성
   */
  async generateAuthorizationCode(userId: bigint): Promise<string> {
    const code = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10분 후 만료

    await this.prisma.oAuthAuthorizationCode.create({
      data: {
        code,
        userId,
        expiresAt,
      },
    });

    return code;
  }

  /**
   * OAuth Authorization Code로 토큰 교환
   * @param code Authorization Code
   * @param state OAuth State (검증용)
   */
  async exchangeAuthorizationCode(
    code: string,
    state: string,
  ): Promise<{
    user: {
      id: string;
      email: string | null;
      nickname: string | null;
    };
    tokens: { accessToken: string; refreshToken: string };
  }> {
    // State 검증
    await this.verifyOAuthState(state);
    // Atomically mark code as used and retrieve it
    const now = new Date();
    const result = await this.prisma.oAuthAuthorizationCode.updateMany({
      where: {
        code,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (result.count === 0) {
      throw new BadRequestException('유효하지 않거나 만료된 인증 코드입니다.');
    }

    const authorizationCode =
      await this.prisma.oAuthAuthorizationCode.findUnique({
        where: { code },
        include: { user: true },
      });

    if (!authorizationCode) {
      throw new BadRequestException('유효하지 않은 인증 코드입니다.');
    }

    const tokens = await this.generateTokens(
      authorizationCode.user.id,
      authorizationCode.user.email || undefined,
    );
    await this.saveRefreshToken(authorizationCode.user.id, tokens.refreshToken);

    return {
      user: {
        id: authorizationCode.user.id.toString(),
        email: authorizationCode.user.email,
        nickname: authorizationCode.user.nickname,
      },
      tokens,
    };
  }

  /**
   * OAuth 사용자 찾기 또는 생성 (토큰 생성 없이 사용자 정보만 반환)
   */
  async findOrCreateOAuthUser(
    provider: 'GITHUB' | 'KAKAO',
    providerId: string,
    email: string | null,
    nickname: string | null,
  ): Promise<{
    user: UserPayload;
  }> {
    // OAuthAccount에서 사용자 찾기
    let oauthAccount = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: providerId,
        },
      },
      include: {
        user: true,
      },
    });

    let user = oauthAccount?.user;

    if (!user) {
      // 이메일로 기존 사용자 찾기
      if (email) {
        const existingUser = await this.prisma.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          user = existingUser;
          // 기존 사용자에 OAuth 계정 연결 (upsert로 race condition 방지)
          oauthAccount = await this.prisma.oAuthAccount.upsert({
            where: {
              provider_providerUserId: {
                provider,
                providerUserId: providerId,
              },
            },
            update: {
              providerEmail: email,
            },
            create: {
              userId: user.id,
              provider,
              providerUserId: providerId,
              providerEmail: email,
            },
            include: { user: true },
          });
        }
      }

      if (!user) {
        // 새 사용자 생성
        user = await this.prisma.user.create({
          data: {
            email,
            nickname: nickname || email?.split('@')[0] || null,
            oauthAccounts: {
              create: {
                provider,
                providerUserId: providerId,
                providerEmail: email,
              },
            },
          },
        });
      }
    } else {
      // 기존 사용자 정보 업데이트
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          email: email || user.email,
          nickname: nickname || user.nickname,
        },
      });

      // OAuthAccount 정보 업데이트
      if (oauthAccount) {
        await this.prisma.oAuthAccount.update({
          where: { id: oauthAccount.id },
          data: {
            providerEmail: email || oauthAccount.providerEmail,
          },
        });
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
      },
    };
  }
}
