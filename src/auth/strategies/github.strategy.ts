import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, Profile } from "passport-github2";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";
import { AuthService } from "../services/auth.service";

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, "github") {
  constructor(
    private readonly configService: ConfigService<Env, true>,
    private readonly authService: AuthService
  ) {
    super({
      clientID: configService.get("GITHUB_CLIENT_ID", { infer: true }) || "",
      clientSecret:
        configService.get("GITHUB_CLIENT_SECRET", { infer: true }) || "",
      callbackURL: "/auth/github/callback",
      scope: ["user:email"],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile) {
    const { id, username, displayName, photos, emails } = profile;

    const result = await this.authService.findOrCreateOAuthUser(
      "GITHUB",
      id,
      emails?.[0]?.value || null,
      username || null,
      displayName || username || null,
      photos?.[0]?.value || null
    );

    return result;
  }
}
