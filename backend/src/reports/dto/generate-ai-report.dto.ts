import { IsISO8601, IsOptional } from 'class-validator';

export class GenerateAiReportDto {
  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;
}
