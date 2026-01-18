import {
  Controller,
  Get,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '헬스 체크' })
  @ApiResponse({
    status: 200,
    description: '서버가 정상적으로 동작 중',
    schema: {
      type: 'string',
      example: 'Hello World!',
    },
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('test-sentry')
  @ApiOperation({ summary: 'Sentry 테스트 (500 에러 발생)' })
  @ApiResponse({
    status: 500,
    description: '테스트용 500 에러',
  })
  testSentry(): never {
    throw new InternalServerErrorException(
      'Sentry 테스트: 의도적으로 발생시킨 500 에러입니다.',
    );
  }
}
