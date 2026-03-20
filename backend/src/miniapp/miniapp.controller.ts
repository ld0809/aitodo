import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BindMiniappByCodeDto } from './dto/bind-miniapp-by-code.dto';
import { BindMiniappDto } from './dto/bind-miniapp.dto';
import { ConfirmCalendarSyncDto } from './dto/confirm-calendar-sync.dto';
import { PrepareCalendarSyncDto } from './dto/prepare-calendar-sync.dto';
import { QueryMiniappHomeDto } from './dto/query-miniapp-home.dto';
import { ResolveWechatCodeDto } from './dto/resolve-wechat-code.dto';
import { MiniappService } from './miniapp.service';

@Controller('miniapp')
@UseGuards(JwtAuthGuard)
export class MiniappController {
  constructor(private readonly miniappService: MiniappService) {}

  @Get('binding')
  getBindingStatus(@CurrentUser() user: { userId: string }) {
    return this.miniappService.getBindingStatus(user.userId);
  }

  @Post('bind')
  bindMiniappUser(@CurrentUser() user: { userId: string }, @Body() dto: BindMiniappDto) {
    return this.miniappService.bindMiniappUser(user.userId, dto);
  }

  @Post('wechat/resolve-code')
  resolveWechatCode(@Body() dto: ResolveWechatCodeDto) {
    return this.miniappService.resolveWechatCode(dto);
  }

  @Post('wechat/bind-by-code')
  bindMiniappByCode(@CurrentUser() user: { userId: string }, @Body() dto: BindMiniappByCodeDto) {
    return this.miniappService.bindMiniappByCode(user.userId, dto);
  }

  @Get('home')
  getHomeData(@CurrentUser() user: { userId: string }, @Query() query: QueryMiniappHomeDto) {
    return this.miniappService.getHomeData(user.userId, query);
  }

  @Post('calendar-sync/prepare')
  prepareCalendarSync(@CurrentUser() user: { userId: string }, @Body() dto: PrepareCalendarSyncDto) {
    return this.miniappService.prepareCalendarSync(user.userId, dto);
  }

  @Post('calendar-sync/confirm')
  confirmCalendarSync(@CurrentUser() user: { userId: string }, @Body() dto: ConfirmCalendarSyncDto) {
    return this.miniappService.confirmCalendarSync(user.userId, dto);
  }
}
