import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Header,
  Param,
  PayloadTooLargeException,
  Post,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators';
import { parseUuid } from '../../common/pipes/parse-uuid.pipe';
import { CurrentUserData } from '../../common/types';
import { MAX_RECEIPT_BYTES, ReceiptsService } from './receipts.service';

/** Pesan Bahasa Indonesia untuk berkas terlalu besar (multer). */
@Catch(PayloadTooLargeException)
export class ReceiptTooLargeFilter implements ExceptionFilter {
  catch(exception: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(413).json({
      message: 'Ukuran file maksimal 10 MB.',
      error: 'Payload Too Large',
      statusCode: 413,
    });
  }
}

@Controller('receipts')
export class ReceiptsController {
  constructor(private receipts: ReceiptsService) {}

  @Post('parse')
  @UseFilters(ReceiptTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } }))
  parse(@CurrentUser() user: CurrentUserData, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Unggah gambar struk pada field "file".');
    return this.receipts.parseUpload(user.userId, file.buffer);
  }

  /** Gambar struk: hanya pemilik. */
  @Get(':id/image')
  @Header('Cache-Control', 'private, max-age=3600')
  @Header('X-Content-Type-Options', 'nosniff')
  async image(@CurrentUser() user: CurrentUserData, @Param('id', parseUuid()) id: string) {
    const { buffer, mimeType } = await this.receipts.getImage(user.userId, id);
    return new StreamableFile(buffer, { type: mimeType });
  }
}
