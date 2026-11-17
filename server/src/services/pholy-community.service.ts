import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import type {
  PholyCommunityModerateDto,
  PholyCommunityProfileDto,
  PholyCommunityReportDto,
} from 'src/dtos/pholy-community.dto.js';
import { PholyCommunityRepository } from 'src/repositories/pholy-community.repository.js';

@Injectable()
export class PholyCommunityService {
  private activePreviews = 0;
  private previewWaiters: (() => void)[] = [];
  constructor(private repository: PholyCommunityRepository) {}

  private member(auth: AuthDto) {
    if (!auth?.user || auth.sharedLink) throw new ForbiddenException('Ein persönliches PHOLY-Konto ist erforderlich.');
    return auth.user.id;
  }
  private admin(auth: AuthDto) {
    const id = this.member(auth);
    if (!auth.user.isAdmin) throw new ForbiddenException('Administratorzugriff erforderlich.');
    return id;
  }
  list(offset: number) {
    return this.repository.list(offset);
  }
  view(slug: string) {
    return this.repository.view(slug);
  }
  unpublish(auth: AuthDto) {
    return this.repository.unpublish(this.member(auth));
  }
  getMine(auth: AuthDto) {
    return this.repository.getMine(this.member(auth));
  }
  picker(auth: AuthDto, offset: number) {
    return this.repository.picker(this.member(auth), offset);
  }
  save(auth: AuthDto, dto: PholyCommunityProfileDto) {
    return this.repository.save(this.member(auth), dto);
  }
  relation(auth: AuthDto, slug: string) {
    return this.repository.relation(this.member(auth), slug);
  }
  follow(auth: AuthDto, slug: string, enabled: boolean) {
    return this.repository.follow(this.member(auth), slug, enabled);
  }
  following(auth: AuthDto) {
    return this.repository.following(this.member(auth));
  }
  report(auth: AuthDto, dto: PholyCommunityReportDto) {
    return this.repository.report(this.member(auth), dto);
  }
  moderation(auth: AuthDto) {
    this.admin(auth);
    return this.repository.moderation();
  }
  moderate(auth: AuthDto, id: string, dto: PholyCommunityModerateDto) {
    return this.repository.moderate(this.admin(auth), id, dto);
  }
  private async acquirePreview() {
    if (this.activePreviews < 4) {
      this.activePreviews++;
      return;
    }
    if (this.previewWaiters.length >= 64) {
      throw new ServiceUnavailableException('Bitte lade dieses Foto gleich erneut.');
    }
    await new Promise<void>((resolve) => {
      this.previewWaiters.push(resolve);
    });
  }

  private releasePreview() {
    const next = this.previewWaiters.shift();
    // Transfer the occupied permit directly to the oldest request. New arrivals cannot jump the queue.
    if (next) next();
    else this.activePreviews--;
  }

  async thumbnail(slug: string, assetId: string) {
    await this.acquirePreview();
    try {
      return await this.repository.thumbnail(slug, assetId);
    } finally {
      this.releasePreview();
    }
  }
}
