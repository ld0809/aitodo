import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  name?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}
