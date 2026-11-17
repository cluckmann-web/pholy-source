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
  PholyCommunityAssetParamDto,
  PholyCommunityModerateDto,
  PholyCommunityPageDto,
  PholyCommunityProfileDto,
  PholyCommunityReportDto,
  PholyCommunitySlugDto,
} from 'src/dtos/pholy-community.dto.js';
import { Auth, Authenticated } from 'src/middleware/auth.guard.js';
import { PholyCommunityService } from 'src/services/pholy-community.service.js';
import { UUIDParamDto } from 'src/validation.js';

@ApiExcludeController()
@Controller('pholy/community')
export class PholyCommunityController {
  constructor(private service: PholyCommunityService) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @Authenticated()
  getMine(@Auth() auth: AuthDto) {
    return this.service.getMine(auth);
  }

  @Put('me')
  @Header('Cache-Control', 'no-store')
  @Authenticated()
  save(@Auth() auth: AuthDto, @Body() dto: PholyCommunityProfileDto) {
    return this.service.save(auth, dto);
  }

  @Delete('me/publication')
  @Header('Cache-Control', 'no-store')
  @Authenticated()
  unpublish(@Auth() auth: AuthDto) {
    return this.service.unpublish(auth);
  }

  @Get('me/assets')
  @Header('Cache-Control', 'no-store')
  @Authenticated()
  picker(@Auth() auth: AuthDto, @Query() dto: PholyCommunityPageDto) {
    return this.service.picker(auth, dto.offset);
  }

  @Get('me/following')
  @Header('Cache-Control', 'no-store')
  @Authenticated()
  following(@Auth() auth: AuthDto) {
    return this.service.following(auth);
  }

  @Get('profiles')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ public: true })
  list(@Query() dto: PholyCommunityPageDto) {
    return this.service.list(dto.offset);
  }

  @Get('profiles/:slug')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ public: true })
  view(@Param() { slug }: PholyCommunitySlugDto) {
    return this.service.view(slug);
  }

  @Get('profiles/:slug/assets/:id')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Authenticated({ public: true })
  async thumbnail(@Param() { slug, id }: PholyCommunityAssetParamDto, @Res() response: Response) {
    const buffer = await this.service.thumbnail(slug, id);
    response.type('image/jpeg').send(buffer);
  }

  @Get('profiles/:slug/relation')
  @Header('Cache-Control', 'no-store')
  @Authenticated()
  relation(@Auth() auth: AuthDto, @Param() { slug }: PholyCommunitySlugDto) {
    return this.service.relation(auth, slug);
  }

  @Put('profiles/:slug/follow')
  @Header('Cache-Control', 'no-store')
  @Authenticated()
  follow(@Auth() auth: AuthDto, @Param() { slug }: PholyCommunitySlugDto) {
    return this.service.follow(auth, slug, true);
  }

  @Delete('profiles/:slug/follow')
  @Header('Cache-Control', 'no-store')
  @Authenticated()
  unfollow(@Auth() auth: AuthDto, @Param() { slug }: PholyCommunitySlugDto) {
    return this.service.follow(auth, slug, false);
  }

  @Post('reports')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Authenticated()
  report(@Auth() auth: AuthDto, @Body() dto: PholyCommunityReportDto) {
    return this.service.report(auth, dto);
  }

  @Get('moderation')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ admin: true })
  moderation(@Auth() auth: AuthDto) {
    return this.service.moderation(auth);
  }

  @Patch('moderation/:id')
  @Header('Cache-Control', 'no-store')
  @Authenticated({ admin: true })
  moderate(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto, @Body() dto: PholyCommunityModerateDto) {
    return this.service.moderate(auth, id, dto);
  }
}
