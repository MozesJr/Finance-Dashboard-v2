import 'reflect-metadata';
import './bootstrap';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Middleware
  app.use(cookieParser());

  // CORS for web app (localhost:5173)
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}/api`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
});
