import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import 'dotenv/config';
import helmet from 'helmet';

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule);

  if (process.env.TRUST_PROXY)
    app
      .getHttpAdapter()
      .getInstance()
      .set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

  app.use(helmet());

  app.setGlobalPrefix(process.env.API_PREFIX ?? "v1", { exclude: ["", "health"] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: (process.env.FRONTEND_URL ?? 'http://localhost:3000')
      .split(',')
      .map((u) => u.trim()),
    credentials: true,
  });

  app.enableShutdownHooks();

  const PORT = Number(process.env.PORT ?? 5000);
  await app.listen(PORT);
  console.log(`database running on port :${PORT}/${process.env.API_PREFIX ?? "v1"}`);
};

await bootstrap();
