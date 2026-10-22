import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/** ParseUUIDPipe dengan pesan Bahasa Indonesia. */
export const parseUuid = () =>
  new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('ID tidak valid') });
