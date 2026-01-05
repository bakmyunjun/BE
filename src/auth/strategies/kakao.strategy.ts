import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, Profile } from "passport-kakao";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";
import { AuthService } from "../services/auth.service";

@Injectable()
export class KakaoStrategy extends PassportStrategy(Strategy, "kakao") {
  constructor(
    private readonly configService: ConfigService<Env, true>,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get("KAKAO_CLIENT_ID", { infer: true }) || "",
      clientSecret:
        configService.get("KAKAO_CLIENT_SECRET", { infer: true }) || "",
      callbackURL: "/auth/kakao/callback",
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ) {
    const { id, username, displayName, _json } = profile;
    const kakaoAccount = _json?.kakao_account;

    const result = await this.authService.findOrCreateOAuthUser(
      "KAKAO",
      id.toString(),
      kakaoAccount?.email || null,
      username || kakaoAccount?.profile?.nickname || null,
      displayName || kakaoAccount?.profile?.nickname || null,
      kakaoAccount?.profile?.profile_image_url || null,
    );

    return result;
  }
}

