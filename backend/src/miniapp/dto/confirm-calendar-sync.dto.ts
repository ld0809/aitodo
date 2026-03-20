import { ArrayNotEmpty, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CalendarSyncDeviceDto } from './calendar-sync-device.dto';

export class ConfirmCalendarSyncDto {
  @ValidateNested()
  @Type(() => CalendarSyncDeviceDto)
  device!: CalendarSyncDeviceDto;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  todoIds!: string[];
}
