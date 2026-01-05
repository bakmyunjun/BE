import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}.local`, `.env.${process.env.NODE_ENV || 'development'}`, '.env.local', '.env'],
    }),
  ],
})
export class ConfigModule {}

