import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateTodoDto } from './dto/create-todo.dto';
import { QueryTodosDto } from './dto/query-todos.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodosService } from './todos.service';

@Controller('todos')
@UseGuards(JwtAuthGuard)
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  findAll(@CurrentUser() user: { userId: string }, @Query() query: QueryTodosDto) {
    return this.todosService.findAll(user.userId, query);
  }

  @Get('today')
  findToday(@CurrentUser() user: { userId: string }) {
    return this.todosService.findToday(user.userId);
  }

  @Get('week')
  findWeek(@CurrentUser() user: { userId: string }) {
    return this.todosService.findWeek(user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateTodoDto) {
    return this.todosService.create(user.userId, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.todosService.findOne(user.userId, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() dto: UpdateTodoDto) {
    return this.todosService.update(user.userId, id, dto);
  }

  @Patch(':id/complete')
  complete(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: { completed: boolean }) {
    return this.todosService.complete(user.userId, id, body.completed);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.todosService.remove(user.userId, id);
  }
}
