import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ISendMailOptions } from './mail.service';
import { PrismaService } from '../prisma/prisma.service';

@Processor('mail')
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<ISendMailOptions & { trackingId: string }>) {
    const { to, subject, template, context, trackingId } = job.data;
    this.logger.log(`[${trackingId}] Processing email job for: ${to}`);

    try {
      await this.mailerService.sendMail({
        to,
        subject,
        template,
        context: {
          ...context,
          trackingId
        },
        headers: {
          'X-Email-ID': trackingId,
        }
      });

      this.logger.log(`[${trackingId}] Email successfully sent to: ${to}`);

      // Save SUCCESS log
      await this.prisma.emailLog.create({
        data: {
          to,
          subject,
          template,
          context: this.redactContext(context),
          status: 'SUCCESS',
        }
      });
    } catch (error) {
      this.logger.error(`[${trackingId}] Failed to send email to ${to}: ${error.message}`);

      // Save FAILED log
      try {
        await this.prisma.emailLog.create({
          data: {
            to,
            subject,
            template,
            context: this.redactContext(context),
            status: 'FAILED',
            error: error.message,
          }
        });
      } catch (dbError) {
        this.logger.error(`Failed to record failed email log: ${dbError.message}`);
      }

      throw error;
    }
  }

  private redactContext(ctx: any): string | null {
    if (!ctx) return null;
    const sensitiveKeys = ['otpCode', 'token', 'password', 'newPassword', 'creditCard'];
    const redacted = { ...ctx };
    for (const key of sensitiveKeys) {
      if (key in redacted) {
        redacted[key] = '[REDACTED]';
      }
    }
    return JSON.stringify(redacted);
  }
}
