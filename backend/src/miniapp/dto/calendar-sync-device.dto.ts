import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CalendarSyncDeviceDto {
  @IsString()
  @MaxLength(64)
  brand!: string;

  @IsString()
  @MaxLength(64)
  model!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  screenWidth!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  screenHeight!: number;
}
