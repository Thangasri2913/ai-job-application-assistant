import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AchievementItem,
  CertificationItem,
  EducationItem,
  ExperienceItem,
  LanguageItem,
  ProjectItem,
  SkillItem,
} from '@job-assist/shared';
import { toDbDate } from '../../common/dates.js';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  AchievementDto,
  CertificationDto,
  EducationDto,
  ExperienceDto,
  LanguageDto,
  ProjectDto,
  SkillDto,
} from './dto/sections.dto.js';
import {
  normalizeSkillName,
  toAchievementItem,
  toCertificationItem,
  toEducationItem,
  toExperienceItem,
  toLanguageItem,
  toProjectItem,
  toSkillItem,
} from './profile.mapper.js';

/** Internal section keys (URL paths are mapped in the controller, e.g. /profile/education). */
export type ProfileSection =
  | 'skills'
  | 'experiences'
  | 'educations'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'achievements';
export type OrderedSection = Exclude<ProfileSection, 'skills'>;

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Item not found.');

function assertDateOrder(start: string | null, end: string | null, label = 'End date'): void {
  if (start && end && end < start) {
    throw AppException.validation([
      { field: 'endDate', messages: [`${label} must not be before the start date.`] },
    ]);
  }
}

export const experienceData = (dto: ExperienceDto) => {
  assertDateOrder(dto.startDate, dto.isCurrent ? null : dto.endDate);
  return {
    company: dto.company,
    jobTitle: dto.jobTitle,
    location: dto.location ?? null,
    startDate: toDbDate(dto.startDate),
    endDate: dto.isCurrent ? null : toDbDate(dto.endDate),
    isCurrent: dto.isCurrent,
    description: dto.description ?? null,
    responsibilities: dto.responsibilities,
    achievements: dto.achievements,
    technologies: dto.technologies,
  };
};

export const educationData = (dto: EducationDto) => {
  assertDateOrder(dto.startDate, dto.endDate);
  return {
    institution: dto.institution,
    degree: dto.degree ?? null,
    fieldOfStudy: dto.fieldOfStudy ?? null,
    startDate: toDbDate(dto.startDate),
    endDate: toDbDate(dto.endDate),
    grade: dto.grade ?? null,
  };
};

export const projectData = (dto: ProjectDto) => ({
  name: dto.name,
  description: dto.description ?? null,
  role: dto.role ?? null,
  technologies: dto.technologies,
  responsibilities: dto.responsibilities,
  achievements: dto.achievements,
  url: dto.url ?? null,
});

export const certificationData = (dto: CertificationDto) => {
  assertDateOrder(dto.issueDate, dto.expiryDate, 'Expiry date');
  return {
    name: dto.name,
    issuer: dto.issuer ?? null,
    issueDate: toDbDate(dto.issueDate),
    expiryDate: toDbDate(dto.expiryDate),
    credentialId: dto.credentialId ?? null,
    credentialUrl: dto.credentialUrl ?? null,
  };
};

export const languageData = (dto: LanguageDto) => ({
  name: dto.name,
  normalizedName: normalizeSkillName(dto.name),
  proficiency: dto.proficiency ?? null,
});

export const achievementData = (dto: AchievementDto) => ({
  title: dto.title,
  description: dto.description ?? null,
  date: toDbDate(dto.date),
});

/** The operations every user-owned list table supports; lets one code path enforce ownership for all. */
interface OwnedDelegate {
  findFirst(args: {
    where: { id: string; userId: string };
    select: { id: true };
  }): Promise<{ id: string } | null>;
  findMany(args: { where: { userId: string }; select: { id: true } }): Promise<{ id: string }[]>;
  deleteMany(args: { where: { id: string; userId: string } }): Promise<{ count: number }>;
  aggregate(args: {
    where: { userId: string };
    _max: { sortOrder: true };
  }): Promise<{ _max: { sortOrder: number | null } }>;
  update(args: {
    where: { id: string };
    data: { sortOrder: number };
  }): Prisma.PrismaPromise<unknown>;
}

const ORDER = [{ sortOrder: 'asc' }, { createdAt: 'asc' }] as const;

/**
 * CRUD and ordering for the list sections of the career profile. Every query is scoped by
 * userId; an id belonging to another user behaves exactly like a missing id (404).
 */
@Injectable()
export class ProfileSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Skills (grouped by category, alphabetical; not manually ordered) ──
  async listSkills(userId: string): Promise<SkillItem[]> {
    const rows = await this.prisma.skill.findMany({
      where: { userId },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toSkillItem);
  }

  async createSkill(userId: string, dto: SkillDto, ctx: RequestContext): Promise<SkillItem> {
    try {
      const row = await this.prisma.skill.create({
        data: {
          userId,
          name: dto.name,
          normalizedName: normalizeSkillName(dto.name),
          category: dto.category,
        },
      });
      await this.changed(userId, 'skills', 'create', ctx);
      return toSkillItem(row);
    } catch (error) {
      throw this.mapUnique(error, 'You already have this skill.');
    }
  }

  async updateSkill(
    userId: string,
    id: string,
    dto: SkillDto,
    ctx: RequestContext,
  ): Promise<SkillItem> {
    await this.ensureOwned('skills', userId, id);
    try {
      const row = await this.prisma.skill.update({
        where: { id },
        data: {
          name: dto.name,
          normalizedName: normalizeSkillName(dto.name),
          category: dto.category,
        },
      });
      await this.changed(userId, 'skills', 'update', ctx);
      return toSkillItem(row);
    } catch (error) {
      throw this.mapUnique(error, 'You already have this skill.');
    }
  }

  // ── Ordered sections ──
  async listExperiences(userId: string): Promise<ExperienceItem[]> {
    return (await this.prisma.experience.findMany({ where: { userId }, orderBy: [...ORDER] })).map(
      toExperienceItem,
    );
  }
  async createExperience(
    userId: string,
    dto: ExperienceDto,
    ctx: RequestContext,
  ): Promise<ExperienceItem> {
    const sortOrder = await this.nextSortOrder('experiences', userId);
    const row = await this.prisma.experience.create({
      data: { userId, sortOrder, ...experienceData(dto) },
    });
    await this.changed(userId, 'experiences', 'create', ctx);
    return toExperienceItem(row);
  }
  async updateExperience(
    userId: string,
    id: string,
    dto: ExperienceDto,
    ctx: RequestContext,
  ): Promise<ExperienceItem> {
    await this.ensureOwned('experiences', userId, id);
    const row = await this.prisma.experience.update({ where: { id }, data: experienceData(dto) });
    await this.changed(userId, 'experiences', 'update', ctx);
    return toExperienceItem(row);
  }

  async listEducations(userId: string): Promise<EducationItem[]> {
    return (await this.prisma.education.findMany({ where: { userId }, orderBy: [...ORDER] })).map(
      toEducationItem,
    );
  }
  async createEducation(
    userId: string,
    dto: EducationDto,
    ctx: RequestContext,
  ): Promise<EducationItem> {
    const sortOrder = await this.nextSortOrder('educations', userId);
    const row = await this.prisma.education.create({
      data: { userId, sortOrder, ...educationData(dto) },
    });
    await this.changed(userId, 'educations', 'create', ctx);
    return toEducationItem(row);
  }
  async updateEducation(
    userId: string,
    id: string,
    dto: EducationDto,
    ctx: RequestContext,
  ): Promise<EducationItem> {
    await this.ensureOwned('educations', userId, id);
    const row = await this.prisma.education.update({ where: { id }, data: educationData(dto) });
    await this.changed(userId, 'educations', 'update', ctx);
    return toEducationItem(row);
  }

  async listProjects(userId: string): Promise<ProjectItem[]> {
    return (await this.prisma.project.findMany({ where: { userId }, orderBy: [...ORDER] })).map(
      toProjectItem,
    );
  }
  async createProject(userId: string, dto: ProjectDto, ctx: RequestContext): Promise<ProjectItem> {
    const sortOrder = await this.nextSortOrder('projects', userId);
    const row = await this.prisma.project.create({
      data: { userId, sortOrder, ...projectData(dto) },
    });
    await this.changed(userId, 'projects', 'create', ctx);
    return toProjectItem(row);
  }
  async updateProject(
    userId: string,
    id: string,
    dto: ProjectDto,
    ctx: RequestContext,
  ): Promise<ProjectItem> {
    await this.ensureOwned('projects', userId, id);
    const row = await this.prisma.project.update({ where: { id }, data: projectData(dto) });
    await this.changed(userId, 'projects', 'update', ctx);
    return toProjectItem(row);
  }

  async listCertifications(userId: string): Promise<CertificationItem[]> {
    return (
      await this.prisma.certification.findMany({ where: { userId }, orderBy: [...ORDER] })
    ).map(toCertificationItem);
  }
  async createCertification(
    userId: string,
    dto: CertificationDto,
    ctx: RequestContext,
  ): Promise<CertificationItem> {
    const sortOrder = await this.nextSortOrder('certifications', userId);
    const row = await this.prisma.certification.create({
      data: { userId, sortOrder, ...certificationData(dto) },
    });
    await this.changed(userId, 'certifications', 'create', ctx);
    return toCertificationItem(row);
  }
  async updateCertification(
    userId: string,
    id: string,
    dto: CertificationDto,
    ctx: RequestContext,
  ): Promise<CertificationItem> {
    await this.ensureOwned('certifications', userId, id);
    const row = await this.prisma.certification.update({
      where: { id },
      data: certificationData(dto),
    });
    await this.changed(userId, 'certifications', 'update', ctx);
    return toCertificationItem(row);
  }

  async listLanguages(userId: string): Promise<LanguageItem[]> {
    return (
      await this.prisma.profileLanguage.findMany({ where: { userId }, orderBy: [...ORDER] })
    ).map(toLanguageItem);
  }
  async createLanguage(
    userId: string,
    dto: LanguageDto,
    ctx: RequestContext,
  ): Promise<LanguageItem> {
    const sortOrder = await this.nextSortOrder('languages', userId);
    try {
      const row = await this.prisma.profileLanguage.create({
        data: { userId, sortOrder, ...languageData(dto) },
      });
      await this.changed(userId, 'languages', 'create', ctx);
      return toLanguageItem(row);
    } catch (error) {
      throw this.mapUnique(error, 'You already listed this language.');
    }
  }
  async updateLanguage(
    userId: string,
    id: string,
    dto: LanguageDto,
    ctx: RequestContext,
  ): Promise<LanguageItem> {
    await this.ensureOwned('languages', userId, id);
    try {
      const row = await this.prisma.profileLanguage.update({
        where: { id },
        data: languageData(dto),
      });
      await this.changed(userId, 'languages', 'update', ctx);
      return toLanguageItem(row);
    } catch (error) {
      throw this.mapUnique(error, 'You already listed this language.');
    }
  }

  async listAchievements(userId: string): Promise<AchievementItem[]> {
    return (await this.prisma.achievement.findMany({ where: { userId }, orderBy: [...ORDER] })).map(
      toAchievementItem,
    );
  }
  async createAchievement(
    userId: string,
    dto: AchievementDto,
    ctx: RequestContext,
  ): Promise<AchievementItem> {
    const sortOrder = await this.nextSortOrder('achievements', userId);
    const row = await this.prisma.achievement.create({
      data: { userId, sortOrder, ...achievementData(dto) },
    });
    await this.changed(userId, 'achievements', 'create', ctx);
    return toAchievementItem(row);
  }
  async updateAchievement(
    userId: string,
    id: string,
    dto: AchievementDto,
    ctx: RequestContext,
  ): Promise<AchievementItem> {
    await this.ensureOwned('achievements', userId, id);
    const row = await this.prisma.achievement.update({ where: { id }, data: achievementData(dto) });
    await this.changed(userId, 'achievements', 'update', ctx);
    return toAchievementItem(row);
  }

  // ── Shared ──

  async remove(
    section: ProfileSection,
    userId: string,
    id: string,
    ctx: RequestContext,
  ): Promise<void> {
    const { count } = await this.delegate(section).deleteMany({ where: { id, userId } });
    if (count === 0) throw notFound();
    await this.changed(userId, section, 'delete', ctx);
  }

  /**
   * Applies a user-defined order. `ids` must be exactly the user's items in the section —
   * an unknown, foreign or missing id rejects the whole request.
   */
  async reorder(
    section: OrderedSection,
    userId: string,
    ids: string[],
    ctx: RequestContext,
  ): Promise<void> {
    const delegate = this.delegate(section);
    const owned = new Set(
      (await delegate.findMany({ where: { userId }, select: { id: true } })).map((r) => r.id),
    );
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== owned.size ||
      ids.some((id) => !owned.has(id))
    ) {
      throw AppException.validation([
        { field: 'ids', messages: ['Provide every item of this section exactly once.'] },
      ]);
    }
    await this.prisma.$transaction(
      ids.map((id, index) => delegate.update({ where: { id }, data: { sortOrder: index } })),
    );
    await this.changed(userId, section, 'reorder', ctx);
  }

  async nextSortOrder(section: OrderedSection, userId: string): Promise<number> {
    const { _max } = await this.delegate(section).aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    return (_max.sortOrder ?? -1) + 1;
  }

  private async ensureOwned(section: ProfileSection, userId: string, id: string): Promise<void> {
    const found = await this.delegate(section).findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!found) throw notFound();
  }

  private delegate(section: ProfileSection): OwnedDelegate {
    const delegates: Record<ProfileSection, unknown> = {
      skills: this.prisma.skill,
      experiences: this.prisma.experience,
      educations: this.prisma.education,
      projects: this.prisma.project,
      certifications: this.prisma.certification,
      languages: this.prisma.profileLanguage,
      achievements: this.prisma.achievement,
    };
    return delegates[section] as OwnedDelegate;
  }

  private changed(
    userId: string,
    section: ProfileSection,
    operation: 'create' | 'update' | 'delete' | 'reorder',
    ctx: RequestContext,
  ) {
    return this.audit.record({
      action: AuditAction.PROFILE_UPDATED,
      userId,
      requestId: ctx.requestId,
      metadata: { section, operation },
    });
  }

  private mapUnique(error: unknown, message: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new AppException(HttpStatus.CONFLICT, ErrorCode.CONFLICT, message);
    }
    return error;
  }
}
