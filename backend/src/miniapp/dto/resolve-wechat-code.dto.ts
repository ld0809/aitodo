import { IsString, MaxLength } from 'class-validator';

export class ResolveWechatCodeDto {
  @IsString()
  @MaxLength(256)
  code!: string;
}
