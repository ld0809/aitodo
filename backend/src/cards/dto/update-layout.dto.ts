import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateLayoutDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  x!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  y!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  w!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  h!: number;
}
