import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DEFAULT_MINIMUM_MATCH_SCORE,
  JOB_ALERTS_PER_USER,
  type JobAlertItem,
  type JobAlertSchedule,
  type JobSearchRunItem,
  type JobSourceItem,
} from '@job-assist/shared';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateJobAlertDto, UpdateJobAlertDto } from './dto/job-alert.dto.js';
import { toAlertItem, toRunItem } from './job-alert.mapper.js';
import { JobDiscoveryService } from './job-discovery.service.js';
import { isValidTimeZone, nextRunAt } from './pipeline/schedule.js';
import { JobSourceRegistry } from './sources/job-source-registry.js';

const alertNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Job alert not found.');

const DEFAULT_SCHEDULE: JobAlertSchedule = {
  type: 'DAILY',
  time: '08:00',
  days: [],
  timezone: 'UTC',
};

const RUN_HISTORY_LIMIT = 50;

/** Validates and normalises a schedule (WEEKLY = one day, CUSTOM = at least one). */
function checkSchedule(schedule: JobAlertSchedule): JobAlertSchedule {
  if (!isValidTimeZone(schedule.timezone)) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
      'Unknown time zone.',
      [{ field: 'schedule.timezone', messages: ['Use an IANA time zone such as Asia/Kolkata.'] }],
    );
  }
  const days = [...new Set(schedule.days)].sort();
  if (schedule.type === 'WEEKLY' && days.length !== 1) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
      'Choose one day for a weekly alert.',
      [{ field: 'schedule.days', messages: ['A weekly alert runs on exactly one day.'] }],
    );
  }
  if (schedule.type === 'CUSTOM' && days.length === 0) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
      'Choose at least one day.',
      [{ field: 'schedule.days', messages: ['A custom schedule needs at least one day.'] }],
    );
  }
  return { ...schedule, days: schedule.type === 'DAILY' ? [] : days };
}

/** Job alerts: saved searches that run on a schedule or on demand (ADR-0018). */
@Injectable()
export class JobAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly discovery: JobDiscoveryService,
    private readonly sources: JobSourceRegistry,
  ) {}

  async create(userId: string, dto: CreateJobAlertDto, ctx: RequestContext): Promise<JobAlertItem> {
    const count = await this.prisma.jobSearchAlert.count({ where: { userId } });
    if (count >= JOB_ALERTS_PER_USER) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.JOB_ALERT_LIMIT,
        `You can have up to ${JOB_ALERTS_PER_USER} job alerts. Delete one to add another.`,
      );
    }
    const schedule = checkSchedule(dto.schedule ?? DEFAULT_SCHEDULE);
    const isActive = dto.isActive ?? true;
    const alert = await this.prisma.jobSearchAlert.create({
      data: {
        userId,
        name: dto.name,
        keywords: dto.keywords,
        locations: dto.locations ?? [],
        remotePreference: dto.remotePreference ?? 'ANY',
        employmentTypes: dto.employmentTypes ?? [],
        experienceLevel: dto.experienceLevel ?? null,
        minimumMatchScore: dto.minimumMatchScore ?? DEFAULT_MINIMUM_MATCH_SCORE,
        resumeMode: dto.resumeMode ?? 'BEST_MATCH',
        isActive,
        scheduleType: schedule.type,
        scheduleTime: schedule.time,
        scheduleDays: schedule.days,
        timezone: schedule.timezone,
        nextRunAt: isActive ? nextRunAt(schedule, new Date()) : null,
      },
    });
    await this.audit.record({
      action: AuditAction.JOB_ALERT_CREATED,
      userId,
      requestId: ctx.requestId,
      metadata: { alertId: alert.id },
    });
    return toAlertItem(alert, null, 0);
  }

  async list(userId: string): Promise<JobAlertItem[]> {
    const alerts = await this.prisma.jobSearchAlert.findMany({
      where: { userId },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    const counts = await this.recommendationCounts(userId);
    return alerts.map((a) => toAlertItem(a, a.runs[0] ?? null, counts.get(a.id) ?? 0));
  }

  async get(userId: string, alertId: string): Promise<JobAlertItem> {
    const alert = await this.prisma.jobSearchAlert.findFirst({
      where: { id: alertId, userId },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
    });
    if (!alert) throw alertNotFound();
    const counts = await this.recommendationCounts(userId, alertId);
    return toAlertItem(alert, alert.runs[0] ?? null, counts.get(alertId) ?? 0);
  }

  async update(
    userId: string,
    alertId: string,
    dto: UpdateJobAlertDto,
    ctx: RequestContext,
  ): Promise<JobAlertItem> {
    const existing = await this.prisma.jobSearchAlert.findFirst({ where: { id: alertId, userId } });
    if (!existing) throw alertNotFound();
    const schedule = checkSchedule(
      dto.schedule ?? {
        type: existing.scheduleType,
        time: existing.scheduleTime,
        days: existing.scheduleDays,
        timezone: existing.timezone,
      },
    );
    const isActive = dto.isActive ?? existing.isActive;
    const scheduleChanged =
      dto.schedule !== undefined ||
      (dto.isActive !== undefined && dto.isActive !== existing.isActive);
    await this.prisma.jobSearchAlert.update({
      where: { id: alertId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.keywords !== undefined ? { keywords: dto.keywords } : {}),
        ...(dto.locations !== undefined ? { locations: dto.locations } : {}),
        ...(dto.remotePreference !== undefined ? { remotePreference: dto.remotePreference } : {}),
        ...(dto.employmentTypes !== undefined ? { employmentTypes: dto.employmentTypes } : {}),
        ...(dto.experienceLevel !== undefined ? { experienceLevel: dto.experienceLevel } : {}),
        ...(dto.minimumMatchScore !== undefined
          ? { minimumMatchScore: dto.minimumMatchScore }
          : {}),
        ...(dto.resumeMode !== undefined ? { resumeMode: dto.resumeMode } : {}),
        isActive,
        scheduleType: schedule.type,
        scheduleTime: schedule.time,
        scheduleDays: schedule.days,
        timezone: schedule.timezone,
        ...(scheduleChanged || (isActive && !existing.nextRunAt)
          ? { nextRunAt: isActive ? nextRunAt(schedule, new Date()) : null }
          : {}),
      },
    });
    await this.audit.record({
      action: AuditAction.JOB_ALERT_UPDATED,
      userId,
      requestId: ctx.requestId,
      metadata: { alertId, fields: Object.keys(dto).join(',') },
    });
    return this.get(userId, alertId);
  }

  /** Deletes the alert and its run history. Recommendations and jobs it found are kept. */
  async remove(userId: string, alertId: string, ctx: RequestContext): Promise<void> {
    const { count } = await this.prisma.jobSearchAlert.deleteMany({
      where: { id: alertId, userId },
    });
    if (count === 0) throw alertNotFound();
    await this.audit.record({
      action: AuditAction.JOB_ALERT_DELETED,
      userId,
      requestId: ctx.requestId,
      metadata: { alertId },
    });
  }

  /** Run Now: the same pipeline the scheduler uses. */
  async run(userId: string, alertId: string, ctx: RequestContext): Promise<JobSearchRunItem> {
    const run = await this.discovery.startRun(userId, alertId, 'MANUAL', ctx.requestId);
    const row = await this.prisma.jobSearchRun.findUniqueOrThrow({ where: { id: run!.id } });
    return toRunItem(row);
  }

  async runs(userId: string, alertId: string): Promise<JobSearchRunItem[]> {
    const alert = await this.prisma.jobSearchAlert.findFirst({
      where: { id: alertId, userId },
      select: { id: true },
    });
    if (!alert) throw alertNotFound();
    const rows = await this.prisma.jobSearchRun.findMany({
      where: { alertId, userId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: RUN_HISTORY_LIMIT,
    });
    return rows.map(toRunItem);
  }

  listSources(): Promise<JobSourceItem[]> {
    return this.sources.list();
  }

  private async recommendationCounts(userId: string, alertId?: string) {
    const rows = await this.prisma.jobRecommendation.groupBy({
      by: ['alertId'],
      where: { userId, status: { not: 'DISMISSED' }, ...(alertId ? { alertId } : {}) },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.alertId ?? '', r._count._all]));
  }
}
