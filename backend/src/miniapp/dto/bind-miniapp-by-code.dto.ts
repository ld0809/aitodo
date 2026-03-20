import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ResolveWechatCodeDto } from './resolve-wechat-code.dto';

export class BindMiniappByCodeDto extends ResolveWechatCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  miniNickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  miniAvatarUrl?: string;
}
