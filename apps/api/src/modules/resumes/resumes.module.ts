import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppConfigService } from '../../config/config.module.js';
import { AiModule } from '../ai/ai.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { InProcessParsingDispatcher, ParsingDispatcher } from './parsing/parsing-dispatcher.js';
import { ResumeAiStructurer } from './parsing/resume-ai-structurer.js';
import { ResumeParsingService } from './parsing/resume-parsing.service.js';
import { TextExtractor } from './parsing/text-extractor.js';
import { ResumeStructuredDataController } from './resume-structured-data.controller.js';
import { ResumeVersionsController } from './resume-versions.controller.js';
import { ResumeVersionsService } from './resume-versions.service.js';
import { ResumesController } from './resumes.controller.js';
import { ResumesService } from './resumes.service.js';

@Module({
  imports: [
    ProfileModule,
    AiModule,
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        // Files are held in memory only long enough to validate and stream to object storage.
        storage: memoryStorage(),
        limits: {
          fileSize: config.get('RESUME_MAX_UPLOAD_BYTES', { infer: true }),
          files: 1,
          fields: 10,
          parts: 12,
        },
      }),
    }),
  ],
  controllers: [ResumesController, ResumeVersionsController, ResumeStructuredDataController],
  providers: [
    ResumesService,
    ResumeVersionsService,
    ResumeParsingService,
    ResumeAiStructurer,
    TextExtractor,
    { provide: ParsingDispatcher, useClass: InProcessParsingDispatcher },
  ],
  exports: [ResumesService],
})
export class ResumesModule {}
