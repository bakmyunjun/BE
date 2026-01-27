import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY, IS_DEV_PUBLIC_KEY } from '../decorators/public.decorator';
import type { Env } from '../../config/env.schema';

/**
 * JWT 인증 Guard
 * @Public() 데코레이터가 있으면 인증을 건너뜁니다.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService<Env, true>,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const isDevPublic = this.reflector.getAllAndOverride<boolean>(
      IS_DEV_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isDevPublic) {
      const nodeEnv = this.configService.get('NODE_ENV', { infer: true });
      if (nodeEnv !== 'production') return true;
    }

    return super.canActivate(context);
  }
}
