import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { PholyAccountCloseDto, PholyAccountPartDto, PholyAccountVerifyDto } from 'src/dtos/pholy-account.dto.js';
import { Auth, Authenticated, FileResponse } from 'src/middleware/auth.guard.js';
import { PholyAccountService } from 'src/services/pholy-account.service.js';
import { asStreamableFile } from 'src/utils/file.js';

@ApiExcludeController()
@Controller('pholy/account')
export class PholyAccountController {
  constructor(private service: PholyAccountService) {}

  @Get()
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  status(@Auth() auth: AuthDto) {
    return this.service.status(auth);
  }

  @Post('export')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  startExport(@Auth() auth: AuthDto, @Body() dto: PholyAccountVerifyDto) {
    return this.service.startExport(auth, dto.password);
  }

  @Get('export/part')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  part(@Auth() auth: AuthDto, @Query() dto: PholyAccountPartDto) {
    return this.service.part(auth, dto.cursor);
  }

  @Get('export/archive')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  @FileResponse()
  archive(@Auth() auth: AuthDto, @Query() dto: PholyAccountPartDto) {
    return this.service.archive(auth, dto.cursor).then(asStreamableFile);
  }

  @Get('export/metadata')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  @FileResponse()
  metadata(@Auth() auth: AuthDto) {
    return this.service.metadata(auth).then(asStreamableFile);
  }

  @Post('closure')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  requestClosure(@Auth() auth: AuthDto, @Body() dto: PholyAccountCloseDto) {
    return this.service.requestClosure(auth, dto);
  }

  @Delete('closure')
  @Authenticated()
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelClosure(@Auth() auth: AuthDto) {
    return this.service.cancelClosure(auth);
  }
}
