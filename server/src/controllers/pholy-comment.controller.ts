import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import {
  PholyCommentAssetParamDto,
  PholyCommentAuthorParamDto,
  PholyCommentContextDto,
  PholyCommentCreateDto,
  PholyCommentEditDto,
  PholyCommentListDto,
  PholyCommentParamDto,
} from 'src/dtos/pholy-comment.dto.js';
import { Auth, Authenticated } from 'src/middleware/auth.guard.js';
import { PholyCommentService } from 'src/services/pholy-comment.service.js';

@ApiExcludeController()
@Controller('pholy/comments')
export class PholyCommentController {
  constructor(private service: PholyCommentService) {}
  @Get(':assetId')
  @Header('Cache-Control', 'private, no-store')
  @Authenticated()
  list(@Auth() auth: AuthDto, @Param() { assetId }: PholyCommentAssetParamDto, @Query() dto: PholyCommentListDto) {
    return this.service.list(auth, assetId, dto);
  }
  @Post(':assetId')
  @Header('Cache-Control', 'private, no-store')
  @Authenticated()
  create(@Auth() auth: AuthDto, @Param() { assetId }: PholyCommentAssetParamDto, @Body() dto: PholyCommentCreateDto) {
    return this.service.create(auth, assetId, dto);
  }
  @Get(':assetId/authors/:userId/avatar')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Authenticated()
  async avatar(
    @Auth() auth: AuthDto,
    @Param() { assetId, userId }: PholyCommentAuthorParamDto,
    @Query() dto: PholyCommentContextDto,
    @Res() response: Response,
  ) {
    response.type('image/jpeg').send(await this.service.avatar(auth, assetId, userId, dto));
  }
  @Patch(':assetId/:commentId')
  @Header('Cache-Control', 'private, no-store')
  @Authenticated()
  edit(@Auth() auth: AuthDto, @Param() { assetId, commentId }: PholyCommentParamDto, @Body() dto: PholyCommentEditDto) {
    return this.service.edit(auth, assetId, commentId, dto);
  }
  @Delete(':assetId/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated()
  remove(
    @Auth() auth: AuthDto,
    @Param() { assetId, commentId }: PholyCommentParamDto,
    @Query() dto: PholyCommentContextDto,
  ) {
    return this.service.remove(auth, assetId, commentId, dto);
  }
  @Put(':assetId/:commentId/like')
  @Header('Cache-Control', 'private, no-store')
  @Authenticated()
  like(
    @Auth() auth: AuthDto,
    @Param() { assetId, commentId }: PholyCommentParamDto,
    @Body() dto: PholyCommentContextDto,
  ) {
    return this.service.like(auth, assetId, commentId, dto, true);
  }
  @Delete(':assetId/:commentId/like')
  @Header('Cache-Control', 'private, no-store')
  @Authenticated()
  unlike(
    @Auth() auth: AuthDto,
    @Param() { assetId, commentId }: PholyCommentParamDto,
    @Query() dto: PholyCommentContextDto,
  ) {
    return this.service.like(auth, assetId, commentId, dto, false);
  }
}
