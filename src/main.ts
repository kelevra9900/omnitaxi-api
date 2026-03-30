import { NestFactory } from '@nestjs/core';
import { Logger, Type, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '@/app.module';
import * as dotenv from 'dotenv';

dotenv.config();

const DEFAULT_CORS_ORIGINS = ['http://localhost:3001', 'https://omnitaxi-admin.vercel.app'];

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule as Type<object>, {
    bufferLogs: true,
  });

  app.useLogger(logger);

  // CORS centralizado desde variable de entorno
  const origins = process.env.CORS_ORIGINS?.split(',') ?? DEFAULT_CORS_ORIGINS;
  app.enableCors({
    origin: origins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Graceful shutdown hooks
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('OmniTransit API')
    .setDescription('System for OMA Taxi management, traceability, and sales.')
    .setVersion('1.0')
    .addTag('Auth', 'Login y JWT')
    .addTag('Users')
    .addTag('Tickets')
    .addTag('Trips')
    .addTag('Operators')
    .addTag('Audit')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Token JWT obtenido en POST /auth/login',
        in: 'header',
      },
      'Bearer',
    )
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  const port = process.env.PORT ?? 1337;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger UI: http://localhost:${port}/api`);
  logger.log(`Health check: http://localhost:${port}/health`);
}

bootstrap();
