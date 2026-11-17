import { Injectable } from '@nestjs/common';
import { ConfigRepository } from 'src/repositories/config.repository.js';
import { EmailRepository } from 'src/repositories/email.repository.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository.js';
import { getConfig } from 'src/utils/config.js';

export type PholyMailResult = { status: 'accepted' | 'disabled' | 'failed'; messageId?: string };
export type PholyMail = {
  to: string;
  subject: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
};
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

@Injectable()
export class PholyMailService {
  constructor(
    private configRepo: ConfigRepository,
    private metadataRepo: SystemMetadataRepository,
    private logger: LoggingRepository,
    private email: EmailRepository,
  ) {}

  async available() {
    const config = await getConfig(
      { configRepo: this.configRepo, metadataRepo: this.metadataRepo, logger: this.logger },
      { withCache: false },
    );
    return { mailEnabled: config.notifications.smtp.enabled, passwordLoginEnabled: config.passwordLogin.enabled };
  }

  async send(message: PholyMail): Promise<PholyMailResult> {
    try {
      const { notifications } = await getConfig(
        { configRepo: this.configRepo, metadataRepo: this.metadataRepo, logger: this.logger },
        { withCache: false },
      );
      if (!notifications.smtp.enabled) return { status: 'disabled' };
      // Never put tokens into persisted queue payloads or logs. Links are fragment-based.
      const action =
        message.actionUrl && message.actionLabel
          ? `<p><a href="${escape(message.actionUrl)}" style="display:inline-block;background:#143e35;color:#fff;padding:14px 20px;text-decoration:none">${escape(message.actionLabel)}</a></p>`
          : '';
      const html = `<html lang="de"><body style="font-family:Arial,sans-serif;background:#f7f7f2;color:#1f332b;padding:32px"><main style="max-width:580px;margin:auto;background:white;padding:32px"><p style="letter-spacing:3px;font-weight:bold">PHOLY</p><h1 style="font-size:26px">${escape(message.title)}</h1><p style="line-height:1.7;white-space:pre-line">${escape(message.message)}</p>${action}<p style="font-size:12px;color:#637168">PHOLY · Deine Erinnerungen. Dein Ort.<br>https://pholy.de</p></main></body></html>`;
      const text = `${message.title}\n\n${message.message}\n\n${message.actionUrl ?? ''}\n\nPHOLY · https://pholy.de`;
      const result = await this.email.sendEmail({
        to: message.to,
        from: notifications.smtp.from,
        replyTo: notifications.smtp.replyTo || notifications.smtp.from,
        subject: message.subject,
        html,
        text,
        smtp: notifications.smtp.transport,
      });
      return { status: 'accepted', messageId: result.messageId };
    } catch {
      // SMTP errors can contain addresses, authentication details and message content.
      this.logger.warn('PHOLY mail could not be submitted to the configured mail server.');
      return { status: 'failed' };
    }
  }
}
