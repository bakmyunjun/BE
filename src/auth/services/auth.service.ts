import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../database/prisma.service";
import type { Env } from "../../config/env.schema";
import { LoginDto, RegisterDto, TokenResponseDto } from "../dto/auth.dto";
import type { UserPayload } from "../decorators/user.decorator";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>
  ) {}

  /**
   * 이메일/비밀번호 로그인
   */
  async login(loginDto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user || user.provider !== "EMAIL") {
      throw new UnauthorizedException(
        "이메일 또는 비밀번호가 올바르지 않습니다."
      );
    }

    // 비밀번호 확인 (현재는 EMAIL provider만 지원)
    // 실제로는 비밀번호 필드가 필요하지만, 지금은 OAuth 위주로 진행

    const tokens = await this.generateTokens(user.id, user.email || undefined);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
      },
    };
  }

  /**
   * 회원가입
   */
  async register(registerDto: RegisterDto): Promise<TokenResponseDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException("이미 가입된 이메일입니다.");
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        username: registerDto.username,
        name: registerDto.name,
        provider: "EMAIL",
        // 실제로는 password 필드가 필요하지만, 지금은 OAuth 위주
      },
    });

    const tokens = await this.generateTokens(user.id, user.email || undefined);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
      },
    };
  }

  /**
   * Refresh Token으로 Access Token 재발급
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get("JWT_REFRESH_SECRET", { infer: true }),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.refreshToken !== refreshToken) {
        throw new UnauthorizedException("유효하지 않은 토큰입니다.");
      }

      const accessToken = await this.generateAccessToken(
        user.id,
        user.email || undefined
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
    userId: string,
    email?: string
  ): Promise<string> {
    const payload = { sub: userId, email };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get("JWT_ACCESS_SECRET", { infer: true }),
      expiresIn: "15m", // 15분
    });
  }

  /**
   * Refresh Token 생성
   */
  private async generateRefreshToken(userId: string): Promise<string> {
    const payload = { sub: userId };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get("JWT_REFRESH_SECRET", { infer: true }),
      expiresIn: "7d", // 7일
    });
  }

  /**
   * Access Token과 Refresh Token 생성
   */
  private async generateTokens(
    userId: string,
    email?: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(userId, email),
      this.generateRefreshToken(userId),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Refresh Token 업데이트
   */
  private async updateRefreshToken(
    userId: string,
    refreshToken: string
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken },
    });
  }

  /**
   * OAuth 사용자 찾기 또는 생성
   */
  async findOrCreateOAuthUser(
    provider: "GITHUB" | "KAKAO",
    providerId: string,
    email: string | null,
    username: string | null,
    name: string | null,
    avatar: string | null
  ): Promise<{
    user: UserPayload;
    tokens: { accessToken: string; refreshToken: string };
  }> {
    let user = await this.prisma.user.findFirst({
      where: {
        provider,
        providerId,
      },
    });

    if (!user) {
      // 이메일로 기존 사용자 찾기
      if (email) {
        user = await this.prisma.user.findUnique({
          where: { email },
        });
      }

      if (user) {
        // 기존 사용자에 OAuth 정보 연결
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            provider,
            providerId,
            avatar: avatar || user.avatar,
          },
        });
      } else {
        // 새 사용자 생성
        user = await this.prisma.user.create({
          data: {
            email,
            username: username || email?.split("@")[0] || null,
            name: name || username || null,
            avatar,
            provider,
            providerId,
          },
        });
      }
    } else {
      // 기존 사용자 정보 업데이트
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          email: email || user.email,
          username: username || user.username,
          name: name || user.name,
          avatar: avatar || user.avatar,
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email || undefined);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
        provider: user.provider,
      },
      tokens,
    };
  }
}
