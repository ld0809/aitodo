import { Type } from 'class-transformer';
import { IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

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
}
