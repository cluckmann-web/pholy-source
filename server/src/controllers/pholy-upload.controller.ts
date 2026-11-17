import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { PholyUploadCreateDto } from 'src/dtos/pholy-upload.dto.js';
import { Permission } from 'src/enum.js';
import { Auth, Authenticated } from 'src/middleware/auth.guard.js';
import { PholyUploadService } from 'src/services/pholy-upload.service.js';
import { UUIDParamDto } from 'src/validation.js';

@ApiExcludeController()
@Controller('pholy/uploads')
export class PholyUploadController {
  constructor(private service: PholyUploadService) {}

  @Post('sessions')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ permission: Permission.AssetUpload })
  create(@Auth() auth: AuthDto, @Body() dto: PholyUploadCreateDto) {
    return this.service.create(auth, dto);
  }

  @Get('sessions/:id')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ permission: Permission.AssetUpload })
  get(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto) {
    return this.service.get(auth, id);
  }

  @Patch('sessions/:id')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ permission: Permission.AssetUpload })
  append(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Headers('upload-offset') offset: string,
    @Headers('content-length') length: string,
    @Req() request: Request,
  ) {
    if (
      request.headers['content-type']?.split(';', 1)[0].trim() !== 'application/octet-stream' ||
      !/^\d+$/.test(offset ?? '') ||
      !/^\d+$/.test(length ?? '') ||
      request.headers['content-encoding']
    ) {
      throw new BadRequestException('Expected an uncompressed octet-stream with Content-Length and Upload-Offset.');
    }
    request.setTimeout(120_000, () => request.destroy());
    return this.service.append(auth, id, Number(offset), Number(length), request);
  }

  @Post('sessions/:id/complete')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Authenticated({ permission: Permission.AssetUpload })
  complete(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto) {
    return this.service.complete(auth, id);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.AssetUpload })
  cancel(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto) {
    return this.service.cancel(auth, id);
  }

  @Get('assets/:id/status')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ permission: Permission.AssetRead })
  status(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto) {
    return this.service.status(auth, id);
  }
}
