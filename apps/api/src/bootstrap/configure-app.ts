import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { API_PREFIX, API_VERSION } from '@job-assist/shared';
import { validationExceptionFactory } from '../common/errors/validation-exception.factory.js';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter.js';
import { type AppConfigService } from '../config/config.module.js';

/**
 * Cross-cutting HTTP setup shared by `main.ts` and the e2e tests,
 * so tests exercise exactly the production pipeline.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<AppConfigService>(ConfigService);

  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.disable('x-powered-by');
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });

  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_VERSION });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) setupSwagger(app);
}

function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('AI Job Application Assistant API')
      .setDescription(
        'REST API. All routes require a Keycloak access token (Bearer) unless marked otherwise.',
      )
      .setVersion(API_VERSION)
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, {
    jsonDocumentUrl: `${API_PREFIX}/docs/openapi.json`,
  });
}
