import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Fix BigInt serialization issue
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  app.use(helmet());

  // ─── Swagger ───────────────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('AlexStore API')
    .setDescription('The AlexStore API description')
    .setVersion('1.0')
    .addTag('AlexStore')
    .addBearerAuth() // for JWT authentication
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // ─── CORS ──────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    credentials: true,
  });

  // ─── Global Prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ─── Validation Pipe ───────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields
      forbidNonWhitelisted: true,
      transform: true, // auto-cast query params to types
    }),
  );

  // ─── Global Exception Filter ───────────────────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());

  // ─── Global Response Interceptor ──────────────────────────────────────────
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = process.env.PORT ?? 8080;
  app.enableShutdownHooks();
  await app.listen(port);

  console.log(`🚀 AlexStore API running on: http://localhost:${port}/api/v1`);
  console.log(`OpenAPI documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
