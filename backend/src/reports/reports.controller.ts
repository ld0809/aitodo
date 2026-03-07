import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GenerateAiReportDto } from './dto/generate-ai-report.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('ai')
  generateAiReport(@CurrentUser() user: { userId: string }, @Body() dto: GenerateAiReportDto) {
    return this.reportsService.generateAiReport(user.userId, dto);
  }
}
