import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';

export interface ISendMailOptions {
  to: string;
  subject: string;
  template: string;
  context?: any;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectQueue('mail') private readonly mailQueue: Queue
  ) {}

  /**
   * Pushes an email job to the queue
   */
  async sendMail(options: ISendMailOptions) {
    const trackingId = uuidv4();
    try {
      // Adding to Bull queue with retry options
      await this.mailQueue.add(
        'send-email',
        {
          ...options,
          trackingId,
        },
        {
          attempts: 3,
           backoff: {
            type: 'exponential',
            delay: 5000, 
          },
          removeOnComplete: true, // Auto clean up
          removeOnFail: false,   // Keep failed jobs for DLQ inspection
          jobId: trackingId       // Use trackingId as jobId
        }
      );
      this.logger.log(`[${trackingId}] Email job queued for: ${options.to}`);
      return { success: true, trackingId };
    } catch (error) {
      this.logger.error(`Failed to queue email to ${options.to}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
