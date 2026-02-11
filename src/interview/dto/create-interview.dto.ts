import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ArrayUnique,
  IsString,
  MaxLength,
  IsOptional,
} from 'class-validator';

export class CreateInterviewDto {
  @ApiPropertyOptional({ example: '프론트엔드 모의면접' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @ApiProperty({ example: 'frontend' })
  @IsString()
  mainTopicId: string;

  @ApiProperty({ example: ['react', 'network'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  subTopicIds: string[];
}
