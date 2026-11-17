import { defaults } from 'src/dtos/config.dto.js';
import { ConfigRepository } from 'src/repositories/config.repository.js';
import { EmailRepository } from 'src/repositories/email.repository.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository.js';
import { PholyMailService } from 'src/services/pholy-mail.service.js';
import { getConfig } from 'src/utils/config.js';

vi.mock('src/utils/config.js', () => ({ getConfig: vi.fn() }));

describe(PholyMailService.name, () => {
  const email = { sendEmail: vi.fn() };
  const logger = { warn: vi.fn() };
  const service = new PholyMailService(
    {} as ConfigRepository,
    {} as SystemMetadataRepository,
    logger as unknown as LoggingRepository,
    email as unknown as EmailRepository,
  );
  const message = {
    to: 'test@example.test',
    subject: 'PHOLY',
    title: '<unsafe>',
    message: 'Text & content',
    actionLabel: 'Open',
    actionUrl: 'https://pholy.de/auth/reset-password#token=synthetic',
  };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getConfig).mockResolvedValue({
      ...defaults,
      notifications: { ...defaults.notifications, smtp: { ...defaults.notifications.smtp, enabled: true } },
    });
  });
  it('escapes markup and reports only SMTP acceptance', async () => {
    email.sendEmail.mockResolvedValue({ messageId: 'synthetic' });
    expect(await service.send(message)).toEqual({ status: 'accepted', messageId: 'synthetic' });
    expect(email.sendEmail.mock.calls[0][0].html).toContain('&lt;unsafe&gt;');
    expect(email.sendEmail.mock.calls[0][0].html).toContain('Text &amp; content');
  });
  it('returns disabled without sending and does not leak SMTP errors into logs', async () => {
    vi.mocked(getConfig).mockResolvedValue(defaults);
    expect(await service.send(message)).toEqual({ status: 'disabled' });
    expect(email.sendEmail).not.toHaveBeenCalled();
    vi.mocked(getConfig).mockResolvedValue({
      ...defaults,
      notifications: { ...defaults.notifications, smtp: { ...defaults.notifications.smtp, enabled: true } },
    });
    email.sendEmail.mockRejectedValue(new Error('SECRET SMTP payload'));
    expect(await service.send(message)).toEqual({ status: 'failed' });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('SECRET');
  });
});
