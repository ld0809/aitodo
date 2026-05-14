import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { LayoutViewport } from './update-layout.dto';

export class UpdateCardPreferencesDto {
  @IsOptional()
  @IsBoolean()
  showCompletedTodos?: boolean;

  @IsOptional()
  @IsEnum(['mobile', 'tablet', 'desktop_normal', 'desktop_big'])
  viewport?: LayoutViewport;
}
