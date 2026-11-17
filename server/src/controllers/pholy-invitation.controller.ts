import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import {
  PholyInvitationAcceptDto,
  PholyInvitationCreateDto,
  PholyInvitationTokenDto,
} from 'src/dtos/pholy-invitation.dto.js';
import { Permission } from 'src/enum.js';
import { Auth, Authenticated } from 'src/middleware/auth.guard.js';
import { PholyInvitationService } from 'src/services/pholy-invitation.service.js';
import { UUIDParamDto } from 'src/validation.js';

// PHOLY-only extension; upstream SDK and mobile API remain unchanged.
@ApiExcludeController()
@Controller('pholy/invitations')
export class PholyInvitationController {
  constructor(private service: PholyInvitationService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Authenticated({ admin: true, permission: Permission.AdminUserRead })
  list(@Auth() auth: AuthDto) {
    return this.service.list(auth);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @Authenticated({ admin: true, permission: Permission.AdminUserCreate })
  create(@Auth() auth: AuthDto, @Body() dto: PholyInvitationCreateDto) {
    return this.service.create(auth, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ admin: true, permission: Permission.AdminUserDelete })
  revoke(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto) {
    return this.service.revoke(auth, id);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Authenticated({ public: true })
  preview(@Body() dto: PholyInvitationTokenDto, @Req() req: Request) {
    return this.service.preview(dto.token, req.ip ?? '');
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Authenticated({ public: true })
  accept(@Body() dto: PholyInvitationAcceptDto, @Req() req: Request) {
    return this.service.accept(dto, req.ip ?? '');
  }
}
