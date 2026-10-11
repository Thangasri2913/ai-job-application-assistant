import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module.js';
import { JobDiscoveryModule } from '../job-discovery/job-discovery.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { OverviewController } from './overview.controller.js';
import { OverviewService } from './overview.service.js';

@Module({
  imports: [ProfileModule, ResumesModule, ApplicationsModule, JobDiscoveryModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
