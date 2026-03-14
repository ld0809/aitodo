import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';

class LayoutItemDto {
  @IsUUID('4')
  id!: string;

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

export class UpdateDashboardLayoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayoutItemDto)
  items!: LayoutItemDto[];

  @IsOptional()
  @IsIn(['mobile', 'tablet', 'desktop_normal', 'desktop_big'] as const)
  viewport?: 'mobile' | 'tablet' | 'desktop_normal' | 'desktop_big';
}
