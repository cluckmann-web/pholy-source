import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import type {
  PholyCommentContextDto,
  PholyCommentCreateDto,
  PholyCommentEditDto,
  PholyCommentListDto,
} from 'src/dtos/pholy-comment.dto.js';
import { PholyCommentRepository } from 'src/repositories/pholy-comment.repository.js';

@Injectable()
export class PholyCommentService {
  private activeAvatars = 0;
  private avatarWaiters: (() => void)[] = [];
  constructor(private repository: PholyCommentRepository) {}

  private member(auth: AuthDto) {
    if (!auth?.user || !auth.session || auth.apiKey || auth.sharedLink)
      throw new ForbiddenException('Bitte melde dich mit deinem persönlichen PHOLY-Konto an.');
    return { id: auth.user.id, isAdmin: auth.user.isAdmin };
  }
  list(auth: AuthDto, assetId: string, dto: PholyCommentListDto) {
    return this.repository.list(this.member(auth), assetId, dto);
  }
  create(auth: AuthDto, assetId: string, dto: PholyCommentCreateDto) {
    return this.repository.create(this.member(auth), assetId, dto);
  }
  edit(auth: AuthDto, assetId: string, id: string, dto: PholyCommentEditDto) {
    return this.repository.edit(this.member(auth), assetId, id, dto);
  }
  remove(auth: AuthDto, assetId: string, id: string, dto: PholyCommentContextDto) {
    return this.repository.remove(this.member(auth), assetId, id, dto);
  }
  like(auth: AuthDto, assetId: string, id: string, dto: PholyCommentContextDto, enabled: boolean) {
    return this.repository.like(this.member(auth), assetId, id, dto, enabled);
  }
  async avatar(auth: AuthDto, assetId: string, userId: string, dto: PholyCommentContextDto) {
    const actor = this.member(auth);
    if (this.activeAvatars < 4) this.activeAvatars++;
    else {
      if (this.avatarWaiters.length >= 64)
        throw new ServiceUnavailableException('Bitte lade dieses Profilbild gleich erneut.');
      await new Promise<void>((resolve) => {
        this.avatarWaiters.push(resolve);
      });
    }
    try {
      return await this.repository.avatar(actor, assetId, userId, dto);
    } finally {
      const next = this.avatarWaiters.shift();
      if (next) next();
      else this.activeAvatars--;
    }
  }
}
