import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  ArrayUnique,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateInterviewDto {
  @ApiProperty({ example: '프론트엔드 모의면접' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  title: string;

  @ApiProperty({ example: 'frontend' })
  @IsString()
  mainTopicId: string;

  @ApiProperty({ example: ['react', 'network'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  subTopicIds: string[];
}
