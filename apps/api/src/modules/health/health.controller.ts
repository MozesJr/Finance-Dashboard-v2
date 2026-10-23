import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly service: HealthService) {}

  /** Publik, tanpa data sensitif: hanya status, kondisi DB dan versi build. 503 jika DB mati. */
  @Public()
  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    const result = await this.service.check();
    if (result.db === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
