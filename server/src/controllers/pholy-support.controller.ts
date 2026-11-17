import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import {
  PholySupportCreateDto,
  PholySupportListDto,
  PholySupportReplyDto,
  PholySupportUpdateDto,
} from 'src/dtos/pholy-support.dto.js';
import { Permission } from 'src/enum.js';
import { Auth, Authenticated } from 'src/middleware/auth.guard.js';
import { PholySupportService } from 'src/services/pholy-support.service.js';
import { UUIDParamDto } from 'src/validation.js';

@ApiExcludeController()
@Controller('pholy/support')
export class PholySupportController {
  constructor(private service: PholySupportService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Authenticated({ permission: Permission.UserRead })
  list(@Auth() auth: AuthDto, @Query() dto: PholySupportListDto) {
    return this.service.list(auth, dto);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @Authenticated({ permission: Permission.UserUpdate })
  create(@Auth() auth: AuthDto, @Body() dto: PholySupportCreateDto) {
    return this.service.create(auth, dto);
  }

  @Get('admin/list')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ admin: true, permission: Permission.AdminUserRead })
  listAdmin(@Auth() auth: AuthDto, @Query() dto: PholySupportListDto) {
    return this.service.list(auth, dto, true);
  }

  @Get('admin/:id')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ admin: true, permission: Permission.AdminUserRead })
  getAdmin(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto) {
    return this.service.get(auth, id, true);
  }

  @Post('admin/:id/messages')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ admin: true, permission: Permission.AdminUserUpdate })
  replyAdmin(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto, @Body() dto: PholySupportReplyDto) {
    return this.service.reply(auth, id, dto, true);
  }

  @Patch('admin/:id')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ admin: true, permission: Permission.AdminUserUpdate })
  update(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto, @Body() dto: PholySupportUpdateDto) {
    return this.service.update(auth, id, dto);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ permission: Permission.UserRead })
  get(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto) {
    return this.service.get(auth, id);
  }

  @Post(':id/messages')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ permission: Permission.UserUpdate })
  reply(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto, @Body() dto: PholySupportReplyDto) {
    return this.service.reply(auth, id, dto);
  }
}
