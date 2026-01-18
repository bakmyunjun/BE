import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { AuthService } from '../services/auth.service';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    private readonly configService: ConfigService<Env, true>,
    private readonly authService: AuthService,
  ) {
    const callbackURL =
      configService.get('GITHUB_CALLBACK_URL', { infer: true }) ||
      '/auth/github/callback';

    super({
      clientID: configService.get('GITHUB_CLIENT_ID', { infer: true }) || '',
      clientSecret:
        configService.get('GITHUB_CLIENT_SECRET', { infer: true }) || '',
      callbackURL,
      scope: ['user:email'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile) {
    const { id, username, displayName, emails } = profile;

    const result = await this.authService.findOrCreateOAuthUser(
      'GITHUB',
      id.toString(),
      emails?.[0]?.value || null,
      displayName || username || null,
    );

    return result;
  }
}
