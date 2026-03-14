import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ISendMailOptions } from './mail.service';

@Processor('mail')
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailerService: MailerService) {
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
          trackingId // Inject tracking ID for template if needed
        },
        headers: {
          'X-Email-ID': trackingId,
        }
      });
      this.logger.log(`[${trackingId}] Email successfully sent to: ${to}`);
    } catch (error) {
      this.logger.error(`[${trackingId}] Failed to send email to ${to}: ${error.message}`);
      // Throwing error triggers Bull's retry mechanism
      throw error; 
    }
  }
}
