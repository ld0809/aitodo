import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateOpenClawBindingDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceLabel?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  timeoutSeconds?: number;

  @IsOptional()
  @IsBoolean()
  rotateToken?: boolean;
}
