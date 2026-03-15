import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  getClient(): Redis {
    return this.client;
  }

  /** Set a key with optional TTL in seconds */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /** Get a key's value */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Delete a key */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** Set JSON data with optional TTL */
  async setJSON(key: string, data: Record<string, any>, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(data), ttlSeconds);
  }

  /** Get JSON data */
  async getJSON<T = any>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
