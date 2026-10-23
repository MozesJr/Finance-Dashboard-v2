import { HttpException, HttpStatus, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';

/** LLM tidak bisa dijangkau / timeout / error server. Fitur non-AI tetap jalan. */
export class AiUnavailableError extends ServiceUnavailableException {
  constructor(message = 'Layanan AI sedang tidak tersedia. Coba lagi sebentar lagi.') {
    super(message);
  }
}

/** Output model tidak sesuai skema setelah 1× retry. */
export class AiParseError extends UnprocessableEntityException {
  constructor(message = 'Maaf, jawaban AI tidak bisa dipahami. Coba lagi atau isi manual.') {
    super(message);
  }
}

/** Kuota harian per fitur habis. */
export class AiQuotaError extends HttpException {
  constructor(
    readonly limit: number,
    message = `Batas penggunaan AI untuk fitur ini (${limit}/hari) sudah tercapai. Coba lagi besok.`,
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
