import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface OperatorPresenceData {
  operatorId: string;
  socketId: string;
  userId: string;
  name: string;
  companyId: string;
  companyName: string;
  vehiclePlate?: string;
  vehicleId?: string;
  connectedAt: string;
  lastPing: string;
}

export interface LocationBufferEntry {
  tripId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: string;
}

const OPERATOR_QUEUE_KEY = 'operator-queue';
const ONLINE_OPERATORS_KEY = 'online-operators';
const LOCATION_BUFFER_KEY = 'location-buffer';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');
    this.client = new Redis(url ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err.message));
  }

  getClient(): Redis {
    return this.client;
  }

  createDuplicate(): Redis {
    return this.client.duplicate();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // ─── Operator Queue (operator-status gateway) ───────────────────────

  async setOperatorPresence(operatorId: string, presence: OperatorPresenceData): Promise<void> {
    await this.client.hset(OPERATOR_QUEUE_KEY, operatorId, JSON.stringify(presence));
  }

  async getOperatorPresence(operatorId: string): Promise<OperatorPresenceData | null> {
    const raw = await this.client.hget(OPERATOR_QUEUE_KEY, operatorId);
    return raw ? (JSON.parse(raw) as OperatorPresenceData) : null;
  }

  async removeOperatorPresence(operatorId: string): Promise<void> {
    await this.client.hdel(OPERATOR_QUEUE_KEY, operatorId);
  }

  async getAllOperatorPresences(): Promise<OperatorPresenceData[]> {
    const all = await this.client.hgetall(OPERATOR_QUEUE_KEY);
    return Object.values(all).map((raw) => JSON.parse(raw) as OperatorPresenceData);
  }

  async getOperatorQueueSize(): Promise<number> {
    return this.client.hlen(OPERATOR_QUEUE_KEY);
  }

  async isInQueue(operatorId: string): Promise<boolean> {
    return (await this.client.hexists(OPERATOR_QUEUE_KEY, operatorId)) === 1;
  }

  // ─── Online Operators (trips gateway) ───────────────────────────────

  async setOnlineOperator(operatorId: string, socketId: string): Promise<void> {
    await this.client.hset(ONLINE_OPERATORS_KEY, operatorId, socketId);
  }

  async removeOnlineOperator(operatorId: string): Promise<void> {
    await this.client.hdel(ONLINE_OPERATORS_KEY, operatorId);
  }

  async getOnlineOperatorSocket(operatorId: string): Promise<string | null> {
    return this.client.hget(ONLINE_OPERATORS_KEY, operatorId);
  }

  async isOperatorOnline(operatorId: string): Promise<boolean> {
    return (await this.client.hexists(ONLINE_OPERATORS_KEY, operatorId)) === 1;
  }

  async getOnlineOperatorIds(): Promise<string[]> {
    return this.client.hkeys(ONLINE_OPERATORS_KEY);
  }

  async getOnlineOperatorCount(): Promise<number> {
    return this.client.hlen(ONLINE_OPERATORS_KEY);
  }

  // ─── Location Buffer ────────────────────────────────────────────────

  async bufferLocation(entry: LocationBufferEntry): Promise<void> {
    await this.client.rpush(LOCATION_BUFFER_KEY, JSON.stringify(entry));
  }

  async flushLocationBuffer(batchSize: number): Promise<LocationBufferEntry[]> {
    // Atomic pop using Lua script
    const script = `
      local entries = redis.call('lrange', KEYS[1], 0, ARGV[1] - 1)
      if #entries > 0 then
        redis.call('ltrim', KEYS[1], #entries, -1)
      end
      return entries
    `;
    const raw = (await this.client.eval(script, 1, LOCATION_BUFFER_KEY, batchSize)) as string[];
    return raw.map((r) => JSON.parse(r) as LocationBufferEntry);
  }
}
