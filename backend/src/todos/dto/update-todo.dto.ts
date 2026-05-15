import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  content?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsISO8601()
  executeAt?: string;

  @IsOptional()
  @IsEnum(['todo', 'done'])
  status?: 'todo' | 'done';

  @IsOptional()
  @Type(() => String)
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  cardId?: string | null;
}
