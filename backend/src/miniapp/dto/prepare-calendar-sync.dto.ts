import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { CalendarSyncDeviceDto } from './calendar-sync-device.dto';

export class PrepareCalendarSyncDto {
  @ValidateNested()
  @Type(() => CalendarSyncDeviceDto)
  device!: CalendarSyncDeviceDto;

  @IsOptional()
  @IsUUID()
  tagId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeCompleted?: boolean;
}
