import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { PholyHistoryAttemptDto, PholyHistorySearchDto } from 'src/dtos/pholy-history.dto.js';
import { Permission } from 'src/enum.js';
import { Auth, Authenticated } from 'src/middleware/auth.guard.js';
import { PholyHistoryService } from 'src/services/pholy-history.service.js';

@ApiExcludeController()
@Controller('pholy/history')
export class PholyHistoryController {
  constructor(private service: PholyHistoryService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Authenticated({ permission: Permission.AssetRead })
  list(@Auth() auth: AuthDto, @Query() dto: PholyHistorySearchDto) {
    return this.service.list(auth, dto);
  }

  @Get('quota')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ permission: Permission.AssetRead })
  quota(@Auth() auth: AuthDto) {
    return this.service.quota(auth);
  }

  @Post('attempts')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.AssetUpload })
  attempt(@Auth() auth: AuthDto, @Body() dto: PholyHistoryAttemptDto) {
    return this.service.attempt(auth, dto);
  }
}
