import { Injectable } from '@nestjs/common';
import type { CareerIntelligenceReport } from '@job-assist/shared';
import { buildReport } from './analytics/report.js';
import { CareerDataLoader } from './career-data.loader.js';

/** Career analytics for one user, computed on request from stored data (the source of truth). */
@Injectable()
export class CareerIntelligenceService {
  constructor(private readonly loader: CareerDataLoader) {}

  async report(userId: string, now = new Date()): Promise<CareerIntelligenceReport> {
    return buildReport(await this.loader.load(userId), now);
  }
}
