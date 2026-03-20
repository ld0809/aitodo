import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BindMiniappDto {
  @IsString()
  @MaxLength(128)
  miniOpenId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  miniUnionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  miniNickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  miniAvatarUrl?: string;
}
