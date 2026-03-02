import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: { userId: string }) {
    return this.usersService.getMe(user.userId);
  }

  @Patch('me')
  update(@CurrentUser() user: { userId: string }, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(user.userId, dto);
  }

  @Patch('me/password')
  updatePassword(@CurrentUser() user: { userId: string }, @Body() dto: UpdatePasswordDto) {
    return this.usersService.updatePassword(user.userId, dto);
  }
}
