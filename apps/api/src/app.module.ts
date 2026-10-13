import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ANALYSIS_RATE_LIMIT_KEY } from './common/decorators/analysis-rate-limit.decorator.js';
import { UPLOAD_RATE_LIMIT_KEY } from './common/decorators/upload-rate-limit.decorator.js';
import { ConfigModule, type AppConfigService } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { ApplicationPreparationModule } from './modules/application-preparation/application-preparation.module.js';
import { ApplicationsModule } from './modules/applications/applications.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { InterviewsModule } from './modules/interviews/interviews.module.js';
import { CareerIntelligenceModule } from './modules/career-intelligence/career-intelligence.module.js';
import { JobDiscoveryModule } from './modules/job-discovery/job-discovery.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { OverviewModule } from './modules/overview/overview.module.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { ResumesModule } from './modules/resumes/resumes.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { UsersModule } from './modules/users/users.module.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => {
        const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const incoming = req.headers['x-request-id'];
              const id =
                typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
                  ? incoming
                  : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            // Career data is sensitive: never log credentials, tokens or cookies. Bodies are not logged.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                '*.password',
                '*.passwordHash',
                '*.accessToken',
                '*.refreshToken',
              ],
              censor: '[REDACTED]',
            },
            autoLogging: {
              ignore: (req: IncomingMessage) => req.url?.startsWith('/api/v1/health') ?? false,
            },
            transport: isDev ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => {
        const ttl = config.get('RATE_LIMIT_TTL_SECONDS', { infer: true }) * 1000;
        return {
          throttlers: [
            { name: 'default', ttl, limit: config.get('RATE_LIMIT_MAX', { infer: true }) },
            {
              name: 'upload',
              ttl,
              limit: config.get('UPLOAD_RATE_LIMIT_MAX', { infer: true }),
              skipIf: (context) =>
                !Reflect.getMetadata(UPLOAD_RATE_LIMIT_KEY, context.getHandler()) &&
                !Reflect.getMetadata(UPLOAD_RATE_LIMIT_KEY, context.getClass()),
            },
            {
              name: 'analysis',
              ttl,
              limit: config.get('JOB_ANALYSIS_RATE_LIMIT_MAX', { infer: true }),
              skipIf: (context) =>
                !Reflect.getMetadata(ANALYSIS_RATE_LIMIT_KEY, context.getHandler()) &&
                !Reflect.getMetadata(ANALYSIS_RATE_LIMIT_KEY, context.getClass()),
            },
          ],
        };
      },
    }),
    DatabaseModule,
    AuditModule,
    StorageModule,
    HealthModule,
    UsersModule,
    AuthModule,
    AiModule,
    ProfileModule,
    ResumesModule,
    OverviewModule,
    JobsModule,
    ApplicationsModule,
    ApplicationPreparationModule,
    InterviewsModule,
    NotificationsModule,
    JobDiscoveryModule,
    CareerIntelligenceModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
