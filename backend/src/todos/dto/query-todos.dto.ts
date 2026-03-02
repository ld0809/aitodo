import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

export class QueryTodosDto {
  @IsOptional()
  @IsEnum(['todo', 'done'])
  status?: 'todo' | 'done';

  @IsOptional()
  @IsString()
  tag_ids?: string;

  @IsOptional()
  @IsISO8601()
  due_from?: string;

  @IsOptional()
  @IsISO8601()
  due_to?: string;

  @IsOptional()
  @IsEnum(['due_at', 'created_at', 'execute_at', 'updated_at'])
  sort_by?: 'due_at' | 'created_at' | 'execute_at' | 'updated_at';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sort_order?: 'asc' | 'desc';
}
