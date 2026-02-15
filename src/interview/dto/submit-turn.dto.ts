import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsObject,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

/**
 * 얼굴 metrics
 */
export class FaceMetricsDto {
  @ApiPropertyOptional({
    example: 120,
    description: '얼굴 검출된 프레임 수',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  detectedFrames?: number;

  @ApiPropertyOptional({
    example: { neutral: 0.6, smile: 0.3, frown: 0.1 },
    description: '표정 분포',
  })
  @IsOptional()
  @IsObject()
  expressionDistribution?: Record<string, number>;
}

/**
 * 음성 metrics
 */
export class VoiceMetricsDto {
  @ApiPropertyOptional({ example: 180.5, description: '평균 피치 (Hz)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  avgPitch?: number;

  @ApiPropertyOptional({ example: 0.65, description: '평균 볼륨 (0~1)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  avgVolume?: number;

  @ApiPropertyOptional({
    example: 1.2,
    description: '평균 말하기 속도 (초당 단어 수)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  speakingRate?: number;

  @ApiPropertyOptional({
    example: { pause: 2.5, speaking: 27.5 },
    description: '침묵/말하기 시간 분포 (초)',
  })
  @IsOptional()
  @IsObject()
  timeDistribution?: Record<string, number>;
}

/**
 * 턴 제출 DTO
 */
export class SubmitTurnDto {
  @ApiProperty({
    example: 'React의 상태 업데이트는 비동기 배치 처리로 동작합니다...',
    description: '답변 텍스트 (STT 결과)',
  })
  @IsString()
  answerText: string;

  @ApiProperty({ example: 1, description: '현재 턴 번호 (1~10)' })
  @IsNumber()
  @Min(1)
  @Max(10)
  turnIndex: number;

  @ApiProperty({ example: 30.5, description: '답변 소요 시간 (초)' })
  @IsNumber()
  @Min(0)
  answerDuration: number;

  @ApiPropertyOptional({
    type: FaceMetricsDto,
    description: '얼굴 분석 metrics',
  })
  @IsOptional()
  @IsObject()
  faceMetrics?: FaceMetricsDto;

  @ApiPropertyOptional({
    type: VoiceMetricsDto,
    description: '음성 분석 metrics',
  })
  @IsOptional()
  @IsObject()
  voiceMetrics?: VoiceMetricsDto;

  @ApiPropertyOptional({
    example: false,
    description:
      '다음 질문이 꼬리질문인지 여부 (true면 답변 기반으로 꼬리질문 생성)',
  })
  @IsOptional()
  isFollowupQuestion?: boolean;
}
