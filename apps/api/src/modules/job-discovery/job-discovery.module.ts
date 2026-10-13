import { Logger, Module } from '@nestjs/common';
import { AppConfigService } from '../../config/config.module.js';
import { ApplicationsModule } from '../applications/applications.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { InProcessJobSearchDispatcher } from './in-process-job-search-dispatcher.js';
import { JobAlertScheduler } from './job-alert-scheduler.js';
import { JobAlertsService } from './job-alerts.service.js';
import { JobDiscoveryController } from './job-discovery.controller.js';
import { JobDiscoveryService } from './job-discovery.service.js';
import { JobSearchDispatcher } from './job-search-dispatcher.js';
import { RecommendationsService } from './recommendations.service.js';
import { SampleDataPolicy } from './sample-data-policy.js';
import { describeSelection, selectJobSources } from './sources/create-adapters.js';
import { parseBoardList } from './sources/http.js';
import { JOB_SOURCE_ADAPTERS, type JobSourceAdapter } from './sources/job-source-adapter.js';
import { JobSourceRegistry } from './sources/job-source-registry.js';

/**
 * Job discovery and alerts (ADR-0018). Reads jobs, analyses, resumes and applications only
 * through their modules' services; owns job_search_alerts, job_sources, discovered_jobs,
 * job_search_runs and job_recommendations.
 */
@Module({
  imports: [JobsModule, ResumesModule, ApplicationsModule, NotificationsModule, ProfileModule],
  controllers: [JobDiscoveryController],
  providers: [
    {
      provide: JOB_SOURCE_ADAPTERS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): JobSourceAdapter[] => {
        const selection = selectJobSources(
          config.get('JOB_SOURCES', { infer: true }),
          config.get('NODE_ENV', { infer: true }),
          {
            adzuna: {
              appId: config.get('ADZUNA_APP_ID', { infer: true }),
              appKey: config.get('ADZUNA_APP_KEY', { infer: true }),
              country: config.get('ADZUNA_COUNTRY', { infer: true }),
              maxDaysOld: config.get('ADZUNA_MAX_DAYS_OLD', { infer: true }),
              dailyRequestLimit: config.get('ADZUNA_DAILY_REQUEST_LIMIT', { infer: true }),
            },
            remotive: {
              dailyRequestLimit: config.get('REMOTIVE_DAILY_REQUEST_LIMIT', { infer: true }),
            },
            greenhouse: {
              boards: parseBoardList(config.get('GREENHOUSE_BOARDS', { infer: true })),
            },
            lever: {
              sites: parseBoardList(config.get('LEVER_SITES', { infer: true })),
              region: config.get('LEVER_REGION', { infer: true }),
            },
          },
        );
        // One clear startup line: whether alert runs can find any jobs on this server.
        const { level, message } = describeSelection(selection);
        new Logger('JobSources')[level](message);
        return selection.adapters;
      },
    },
    {
      provide: SampleDataPolicy,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): SampleDataPolicy => ({
        allowSampleData: config.get('NODE_ENV', { infer: true }) !== 'production',
      }),
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
