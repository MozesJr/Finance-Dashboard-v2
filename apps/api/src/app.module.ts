import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '..', '..', '.env'),
    }),
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
