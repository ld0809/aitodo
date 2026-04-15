import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UpdateOpenClawBindingDto } from './dto/update-openclaw-binding.dto';
import { OpenClawService } from './openclaw.service';

@Controller('openclaw')
export class OpenClawController {
  constructor(private readonly openClawService: OpenClawService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: { userId: string }) {
    return this.openClawService.getMyBinding(user.userId);
  }

  @Post('me/provision')
  @UseGuards(JwtAuthGuard)
  provisionMe(@CurrentUser() user: { userId: string }) {
    return this.openClawService.provisionMyBinding(user.userId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: { userId: string }, @Body() dto: UpdateOpenClawBindingDto) {
    return this.openClawService.upsertMyBinding(user.userId, dto);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  deleteMe(@CurrentUser() user: { userId: string }) {
    return this.openClawService.removeMyBinding(user.userId);
  }

  @Post('callbacks/:dispatchId/:callbackToken')
  handleCallback(
    @Param('dispatchId') dispatchId: string,
    @Param('callbackToken') callbackToken: string,
    @Body() payload: unknown,
  ) {
    return this.openClawService.acceptCallback(dispatchId, callbackToken, payload);
  }
}
