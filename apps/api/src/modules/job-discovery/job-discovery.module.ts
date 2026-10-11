import { Logger, Module } from '@nestjs/common';
import { AppConfigService } from '../../config/config.module.js';
import { ApplicationsModule } from '../applications/applications.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { InProcessJobSearchDispatcher } from './in-process-job-search-dispatcher.js';
import { JobAlertScheduler } from './job-alert-scheduler.js';
import { JobAlertsService } from './job-alerts.service.js';
import { JobDiscoveryController } from './job-discovery.controller.js';
import { JobDiscoveryService } from './job-discovery.service.js';
import { JobSearchDispatcher } from './job-search-dispatcher.js';
import { RecommendationsService } from './recommendations.service.js';
import { DevJobSourceAdapter } from './sources/dev-job-source.js';
import { JOB_SOURCE_ADAPTERS, type JobSourceAdapter } from './sources/job-source-adapter.js';
import { JobSourceRegistry } from './sources/job-source-registry.js';

/** Every adapter the application ships, by key. Add legitimate API/feed adapters here. */
const BUILT_IN_SOURCES: Record<string, () => JobSourceAdapter> = {
  dev: () => new DevJobSourceAdapter(),
};

/**
 * Job discovery and alerts (ADR-0018). Reads jobs, analyses, resumes and applications only
 * through their modules' services; owns job_search_alerts, job_sources, discovered_jobs,
 * job_search_runs and job_recommendations.
 */
@Module({
  imports: [JobsModule, ResumesModule, ApplicationsModule, NotificationsModule],
  controllers: [JobDiscoveryController],
  providers: [
    {
      provide: JOB_SOURCE_ADAPTERS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): JobSourceAdapter[] => {
        const logger = new Logger('JobSources');
        const production = config.get('NODE_ENV', { infer: true }) === 'production';
        return config.get('JOB_SOURCES', { infer: true }).flatMap((key) => {
          const create = BUILT_IN_SOURCES[key];
          if (!create) {
            logger.warn(`Unknown job source "${key}" in JOB_SOURCES; ignored.`);
            return [];
          }
          const adapter = create();
          if (adapter.descriptor.isDevelopment && production) {
            logger.warn(`Development job source "${key}" is disabled in production.`);
            return [];
          }
          return [adapter];
        });
      },
    },
    JobSourceRegistry,
    JobDiscoveryService,
    JobAlertsService,
    RecommendationsService,
    JobAlertScheduler,
    { provide: JobSearchDispatcher, useClass: InProcessJobSearchDispatcher },
  ],
  exports: [RecommendationsService],
})
export class JobDiscoveryModule {}
