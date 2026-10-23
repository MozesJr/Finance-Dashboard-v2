import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthRepository } from './health.repository';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  version: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly repository: HealthRepository,
    private readonly config: ConfigService,
  ) {}

  async check(): Promise<HealthResponse> {
    const version = this.config.get<string>('GIT_COMMIT')?.trim() || 'dev';
    try {
      await this.repository.ping();
      return { status: 'ok', db: 'up', version };
    } catch {
      return { status: 'degraded', db: 'down', version };
    }
  }
}
