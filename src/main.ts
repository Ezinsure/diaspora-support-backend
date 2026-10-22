import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("v1", { exclude: ["", "health"] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: (process.env.FRONTEND_URL ?? 'http://localhost:3000')
      .split(',')
      .map((u) => u.trim()),
    credentials: true,
  });

  app.enableShutdownHooks();

  const PORT = Number(process.env.PORT ?? 5000);
  await app.listen(PORT);
  console.log(`database is running on port :${PORT}/v1`);
};

await bootstrap();
