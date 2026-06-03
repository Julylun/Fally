import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class MobileFallDto {
  @IsDateString()
  @IsNotEmpty()
  detectedAt: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  scopeId?: string;
}
