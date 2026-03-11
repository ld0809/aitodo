import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user: string;
  pass: string;
  from: string;
  subject: string;
};

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  private readonly smtpConfig = this.resolveSmtpConfig();
  private readonly smtpConfigured = this.smtpConfig !== null;
  private readonly transporter = this.smtpConfig
    ? nodemailer.createTransport({
        host: this.smtpConfig.host,
        port: this.smtpConfig.port,
        secure: this.smtpConfig.secure,
        requireTLS: this.smtpConfig.requireTLS,
        auth: {
          user: this.smtpConfig.user,
          pass: this.smtpConfig.pass,
        },
      })
    : null;
  private warnedMissingConfig = false;

  async sendVerificationCodeEmail(to: string, code: string, expiresAt: Date) {
    if (!this.smtpConfigured || !this.smtpConfig || !this.transporter) {
      if (!this.warnedMissingConfig) {
        this.logger.warn('SMTP is not configured. Skip sending verification email.');
        this.warnedMissingConfig = true;
      }
      return false;
    }

    const expireMinutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));
    const text = `您的验证码是 ${code}，${expireMinutes} 分钟内有效。`;
    const html = `<p>您的验证码是 <strong>${code}</strong>，${expireMinutes} 分钟内有效。</p>`;

    try {
      await this.transporter.sendMail({
        from: this.smtpConfig.from,
        to,
        subject: this.smtpConfig.subject,
        text,
        html,
      });
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`send verification email failed: ${message}`);
      throw new InternalServerErrorException('send verification email failed');
    }
  }

  private resolveSmtpConfig(): SmtpConfig | null {
    const host = process.env.SMTP_HOST?.trim();
    const portRaw = process.env.SMTP_PORT?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const from = process.env.SMTP_FROM?.trim() || user;

    if (!host || !portRaw || !user || !pass || !from) {
      return null;
    }

    const port = Number.parseInt(portRaw, 10);
    if (!Number.isInteger(port) || port <= 0) {
      return null;
    }

    const secure = this.toBoolean(process.env.SMTP_SECURE, port === 465);
    const requireTLS = this.toBoolean(process.env.SMTP_REQUIRE_TLS, false);
    const subject = process.env.SMTP_VERIFY_SUBJECT?.trim() || '【AI待办】邮箱验证码';

    return {
      host,
      port,
      secure,
      requireTLS,
      user,
      pass,
      from,
      subject,
    };
  }

  private toBoolean(raw: string | undefined, fallback: boolean) {
    const normalized = raw?.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
    return fallback;
  }
}
