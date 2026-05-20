import { IsEnum, IsOptional } from 'class-validator';

export class ApplyTodoAiSuggestionDto {
  @IsOptional()
  @IsEnum(['progress'])
  target?: 'progress';
}
