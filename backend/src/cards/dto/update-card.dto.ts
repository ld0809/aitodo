import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class UpdateCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsEnum(['due_at', 'created_at', 'execute_at'])
  sortBy?: 'due_at' | 'created_at' | 'execute_at';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  x?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  y?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  w?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  h?: number;

  @IsOptional()
  @IsString()
  pluginType?: string;

  @IsOptional()
  @IsObject()
  pluginConfig?: Record<string, unknown>;

  @IsOptional()
  @Type(() => String)
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  tagIds?: string[];
}
