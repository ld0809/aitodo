import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { UpdateDashboardLayoutDto } from './dto/update-dashboard-layout.dto';
import { UpdateLayoutDto } from './dto/update-layout.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get('cards')
  findAll(
    @CurrentUser() user: { userId: string },
    @Query('viewport') viewport?: 'mobile' | 'tablet' | 'desktop_normal' | 'desktop_big',
  ) {
    return this.cardsService.findAll(user.userId, viewport);
  }

  @Post('cards')
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateCardDto) {
    return this.cardsService.create(user.userId, dto);
  }

  @Get('cards/:id')
  findOne(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('viewport') viewport?: 'mobile' | 'tablet' | 'desktop_normal' | 'desktop_big',
  ) {
    return this.cardsService.findOne(user.userId, id, viewport);
  }

  @Patch('cards/:id')
  update(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() dto: UpdateCardDto) {
    return this.cardsService.update(user.userId, id, dto);
  }

  @Delete('cards/:id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.cardsService.remove(user.userId, id);
  }

  @Patch('cards/:id/layout')
  updateLayout(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() dto: UpdateLayoutDto) {
    return this.cardsService.updateLayout(user.userId, id, dto);
  }

  @Put('dashboard/layout')
  updateDashboardLayout(@CurrentUser() user: { userId: string }, @Body() dto: UpdateDashboardLayoutDto) {
    return this.cardsService.updateDashboardLayout(user.userId, dto);
  }

  @Get('cards/:id/todos')
  fetchCardTodos(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.cardsService.fetchCardTodos(user.userId, id);
  }
}
