import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppConfigService } from '../../config/config.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';

/**
 * Application tracking (ADR-0015). Owns applications, application_status_history,
 * application_notes and application_documents; reads resumes through ResumesService.
 */
@Module({
  imports: [
    ResumesModule,
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        // Held in memory only long enough to validate and stream to object storage.
        storage: memoryStorage(),
        limits: {
          fileSize: config.get('RESUME_MAX_UPLOAD_BYTES', { infer: true }),
          files: 1,
          fields: 5,
          parts: 7,
        },
      }),
    }),
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
