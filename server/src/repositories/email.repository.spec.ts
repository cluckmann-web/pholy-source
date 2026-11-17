import { createTransport } from 'nodemailer';
import { EmailRenderRequest, EmailRepository, EmailTemplate } from 'src/repositories/email.repository.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { automock } from 'test/utils.js';

vi.mock('nodemailer', () => ({ createTransport: vi.fn() }));

describe(EmailRepository.name, () => {
  let sut: EmailRepository;

  beforeEach(() => {
    // eslint-disable-next-line no-sparse-arrays
    sut = new EmailRepository(automock(LoggingRepository, { args: [, { getEnv: () => ({}) }], strict: false }));
  });

  it('keeps the SMTP connection open until submission completes and forwards replyTo', async () => {
    const { promise, resolve: finish } = Promise.withResolvers<{ messageId: string; response: string }>();
    const sendMail = vi.fn(() => promise);
    const close = vi.fn();
    vi.mocked(createTransport).mockReturnValue({ sendMail, close } as unknown as ReturnType<typeof createTransport>);
    const result = sut.sendEmail({
      to: 'test@example.test',
      from: 'sender@example.test',
      replyTo: 'support@example.test',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
      smtp: { host: '127.0.0.1' },
    });
    expect(close).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'support@example.test' }));
    finish({ messageId: 'synthetic', response: 'accepted' });
    await expect(result).resolves.toHaveProperty('messageId', 'synthetic');
    expect(close).toHaveBeenCalledOnce();
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 15_000 }),
    );
  });

  it('closes a failed verification after the promise rejects', async () => {
    const close = vi.fn();
    vi.mocked(createTransport).mockReturnValue({
      verify: vi.fn().mockRejectedValue(new Error('unavailable')),
      close,
    } as unknown as ReturnType<typeof createTransport>);
    await expect(sut.verifySmtp({ host: '127.0.0.1' })).rejects.toThrow('unavailable');
    expect(close).toHaveBeenCalledOnce();
  });

  describe('renderEmail', () => {
    it('should render the email correctly for TEST_EMAIL template', async () => {
      const request: EmailRenderRequest = {
        template: EmailTemplate.TEST_EMAIL,
        data: { displayName: 'Alen Turing', baseUrl: 'http://localhost' },
        customTemplate: '',
      };

      const result = await sut.renderEmail(request);

      expect(result.html).toContain('<!DOCTYPE html PUBLIC');
      expect(result.text).toContain('test email');
    });

    it('should render the email correctly for WELCOME template', async () => {
      const request: EmailRenderRequest = {
        template: EmailTemplate.WELCOME,
        data: { displayName: 'Alen Turing', username: 'turing', baseUrl: 'http://localhost' },
        customTemplate: '',
      };

      const result = await sut.renderEmail(request);

      expect(result.html).toContain('<!DOCTYPE html PUBLIC');
      expect(result.text).toContain('A new account has been created for you');
    });

    it('should render the email correctly for ALBUM_INVITE template', async () => {
      const request: EmailRenderRequest = {
        template: EmailTemplate.ALBUM_INVITE,
        data: {
          albumName: 'Vacation',
          albumId: '123',
          senderName: 'John',
          recipientName: 'Jane',
          baseUrl: 'http://localhost',
        },
        customTemplate: '',
      };

      const result = await sut.renderEmail(request);

      expect(result.html).toContain('<!DOCTYPE html PUBLIC');
      expect(result.text).toContain('Vacation');
    });

    it('should escape user controlled values in a custom template', async () => {
      const request: EmailRenderRequest = {
        template: EmailTemplate.ALBUM_INVITE,
        data: {
          albumName: '</p><a href="https://example.com">Reset your password</a><p>',
          albumId: '123',
          senderName: '<script>alert(1)</script>',
          recipientName: "Tom & Jerry O'Brien",
          baseUrl: 'http://localhost',
        },
        customTemplate: '<p>Hey {recipientName}, {senderName} added you to {albumName}</p>',
      };

      const result = await sut.renderEmail(request);

      expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(result.html).toContain('&lt;a href=&quot;https://example.com&quot;&gt;');
      expect(result.html).not.toContain('<script>alert(1)</script>');
      expect(result.html).not.toContain('<a href="https://example.com">');
      expect(result.html).toContain('<p>Hey Tom &amp; Jerry O&#39;Brien');
    });

    it('should render the email correctly for ALBUM_UPDATE template', async () => {
      const request: EmailRenderRequest = {
        template: EmailTemplate.ALBUM_UPDATE,
        data: { albumName: 'Holiday', albumId: '123', recipientName: 'Jane', baseUrl: 'http://localhost' },
        customTemplate: '',
      };

      const result = await sut.renderEmail(request);

      expect(result.html).toContain('<!DOCTYPE html PUBLIC');
      expect(result.text).toContain('Holiday');
    });
  });
});
