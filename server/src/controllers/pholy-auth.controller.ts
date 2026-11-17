import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PholyForgotPasswordDto, PholyResetPasswordDto } from 'src/dtos/pholy-auth.dto.js';
import { ImmichCookie } from 'src/enum.js';
import { Authenticated } from 'src/middleware/auth.guard.js';
import { PholyAuthService } from 'src/services/pholy-auth.service.js';
import { respondWithoutCookie } from 'src/utils/response.js';

@ApiExcludeController()
@Controller('pholy/auth')
export class PholyAuthController {
  constructor(private service: PholyAuthService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ public: true })
  status() {
    return this.service.status();
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  @Authenticated({ public: true })
  forgot(@Body() dto: PholyForgotPasswordDto, @Req() req: Request) {
    return this.service.forgot(dto, req.ip ?? '');
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Authenticated({ public: true })
  async reset(@Body() dto: PholyResetPasswordDto, @Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.service.reset(dto, req.ip ?? '');
    return respondWithoutCookie(response, result, [
      ImmichCookie.AccessToken,
      ImmichCookie.AuthType,
      ImmichCookie.IsAuthenticated,
    ]);
  }
}
