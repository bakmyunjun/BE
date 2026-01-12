import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import type { Env } from "../../config/env.schema";
import type { UserPayload } from "../decorators/user.decorator";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>
  ) {}

  /**
   * Refresh Token으로 Access Token 재발급
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get("JWT_REFRESH_SECRET", { infer: true }),
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
        throw new UnauthorizedException("유효하지 않은 토큰입니다.");
      }

      const accessToken = await this.generateAccessToken(
        tokenRecord.user.id,
        tokenRecord.user.email || undefined
      );

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException("유효하지 않은 토큰입니다.");
    }
  }

  /**
   * Access Token 생성
   */
  private async generateAccessToken(
    userId: bigint,
    email?: string
  ): Promise<string> {
    const payload = { sub: userId.toString(), email };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get("JWT_ACCESS_SECRET", { infer: true }),
      expiresIn: "15m", // 15분
    });
  }

  /**
   * Refresh Token 생성
   */
  private async generateRefreshToken(userId: bigint): Promise<string> {
    const payload = { sub: userId.toString() };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get("JWT_REFRESH_SECRET", { infer: true }),
      expiresIn: "7d", // 7일
    });
  }

  /**
   * Access Token과 Refresh Token 생성
   */
  private async generateTokens(
    userId: bigint,
    email?: string
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
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * Refresh Token 저장
   */
  private async saveRefreshToken(
    userId: bigint,
    refreshToken: string
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
   * OAuth 사용자 찾기 또는 생성
   */
  async findOrCreateOAuthUser(
    provider: "GITHUB" | "KAKAO",
    providerId: string,
    email: string | null,
    nickname: string | null
  ): Promise<{
    user: UserPayload;
    tokens: { accessToken: string; refreshToken: string };
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
          // 기존 사용자에 OAuth 계정 연결
          oauthAccount = await this.prisma.oAuthAccount.create({
            data: {
              userId: user.id,
              provider,
              providerUserId: providerId,
              providerEmail: email,
            },
            include: {
              user: true,
            },
          });
        }
      }

      if (!user) {
        // 새 사용자 생성
        user = await this.prisma.user.create({
          data: {
            email,
            nickname: nickname || email?.split("@")[0] || null,
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

    const tokens = await this.generateTokens(user.id, user.email || undefined);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
      },
      tokens,
    };
  }
}
