import { IsString, MaxLength } from 'class-validator';

export class CreateTodoProgressDto {
  @IsString()
  @MaxLength(2000)
  content!: string;
}
