import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

const layoutViewports = ['mobile', 'tablet', 'desktop_normal', 'desktop_big'] as const;
export type LayoutViewport = (typeof layoutViewports)[number];

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

  @IsOptional()
  @IsIn(layoutViewports)
  viewport?: LayoutViewport;
}
