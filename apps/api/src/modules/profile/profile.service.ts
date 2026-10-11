import { Injectable } from '@nestjs/common';
import type { CareerProfile, ImportToProfileResult, ProfileDetails } from '@job-assist/shared';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { ImportToProfileDto } from './dto/import.dto.js';
import type { UpdateProfileDto } from './dto/profile.dto.js';
import {
  certificationData,
  educationData,
  experienceData,
  languageData,
  ProfileSectionsService,
  projectData,
} from './profile-sections.service.js';
import { normalizeSkillName, toProfileDetails } from './profile.mapper.js';

const IMPORTABLE_DETAIL_FIELDS = [
  'phone',
  'location',
  'linkedinUrl',
  'githubUrl',
  'portfolioUrl',
  'headline',
  'summary',
  'currentJobTitle',
] as const;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sections: ProfileSectionsService,
    private readonly audit: AuditService,
  ) {}

  async getDetails(userId: string): Promise<ProfileDetails> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw AppException.unauthorized(ErrorCode.UNAUTHORIZED, 'Authentication required.');
    return toProfileDetails(user, user.profile);
  }

  async getProfile(userId: string): Promise<CareerProfile> {
    const [
      details,
      skills,
      experiences,
      educations,
      projects,
      certifications,
      languages,
      achievements,
    ] = await Promise.all([
      this.getDetails(userId),
      this.sections.listSkills(userId),
      this.sections.listExperiences(userId),
      this.sections.listEducations(userId),
      this.sections.listProjects(userId),
      this.sections.listCertifications(userId),
      this.sections.listLanguages(userId),
      this.sections.listAchievements(userId),
    ]);
    return {
      details,
      skills,
      experiences,
      educations,
      projects,
      certifications,
      languages,
      achievements,
    };
  }

  /** Replaces the profile's scalar fields with exactly what the user submitted. */
  async updateDetails(
    userId: string,
    dto: UpdateProfileDto,
    ctx: RequestContext,
  ): Promise<ProfileDetails> {
    const { fullName, ...fields } = dto;
    if (
      fields.salaryMin !== null &&
      fields.salaryMax !== null &&
      fields.salaryMin > fields.salaryMax
    ) {
      throw AppException.validation([
        { field: 'salaryMax', messages: ['Maximum salary must not be lower than the minimum.'] },
      ]);
    }
    const data = {
      phone: fields.phone ?? null,
      location: fields.location ?? null,
      country: fields.country ?? null,
      linkedinUrl: fields.linkedinUrl ?? null,
      githubUrl: fields.githubUrl ?? null,
      portfolioUrl: fields.portfolioUrl ?? null,
      preferredRoles: fields.preferredRoles,
      preferredLocations: fields.preferredLocations,
      workModes: fields.workModes,
      salaryMin: fields.salaryMin ?? null,
      salaryMax: fields.salaryMax ?? null,
      salaryCurrency: fields.salaryCurrency ?? null,
      employmentTypes: fields.employmentTypes,
      noticePeriod: fields.noticePeriod ?? null,
      workAuthorization: fields.workAuthorization ?? null,
      headline: fields.headline ?? null,
      summary: fields.summary ?? null,
      yearsOfExperience: fields.yearsOfExperience ?? null,
      currentJobTitle: fields.currentJobTitle ?? null,
      currentCompany: fields.currentCompany ?? null,
      previousJobTitles: fields.previousJobTitles,
      previousCompanies: fields.previousCompanies,
    };

    const { user, created } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.userProfile.findUnique({
        where: { userId },
        select: { userId: true },
      });
      await tx.userProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      const updated = await tx.user.update({
        where: { id: userId },
        data: { fullName },
        include: { profile: true },
      });
      return { user: updated, created: existing === null };
    });

    await this.audit.record({
      action: created ? AuditAction.PROFILE_CREATED : AuditAction.PROFILE_UPDATED,
      userId,
      requestId: ctx.requestId,
      metadata: { section: 'details', operation: created ? 'create' : 'update' },
    });
    return toProfileDetails(user, user.profile);
  }

  /**
   * Imports items the user explicitly selected while reviewing a parsed resume.
   * Never overwrites: scalar fields are only filled when empty; list items are added;
   * skills already present (case-insensitive) are skipped.
   */
  async importFromResume(
    userId: string,
    dto: ImportToProfileDto,
    ctx: RequestContext,
  ): Promise<ImportToProfileResult> {
    const result: ImportToProfileResult = {
      filledFields: [],
      skippedFields: [],
      added: {
        skills: 0,
        experiences: 0,
        educations: 0,
        projects: 0,
        certifications: 0,
        languages: 0,
      },
      skippedDuplicateSkills: [],
      skippedDuplicateLanguages: [],
    };
    // Imported items go after the user's existing ones.
    const order = {
      experiences: await this.sections.nextSortOrder('experiences', userId),
      educations: await this.sections.nextSortOrder('educations', userId),
      projects: await this.sections.nextSortOrder('projects', userId),
      certifications: await this.sections.nextSortOrder('certifications', userId),
      languages: await this.sections.nextSortOrder('languages', userId),
    };

    await this.prisma.$transaction(async (tx) => {
      if (dto.details) {
        const existing = await tx.userProfile.findUnique({ where: { userId } });
        const fill: Record<string, string> = {};
        for (const field of IMPORTABLE_DETAIL_FIELDS) {
          const incoming = dto.details[field];
          if (!incoming) continue;
          if (existing?.[field]) result.skippedFields.push(field);
          else {
            fill[field] = incoming;
            result.filledFields.push(field);
          }
        }
        if (Object.keys(fill).length > 0) {
          await tx.userProfile.upsert({
            where: { userId },
            create: { userId, ...fill },
            update: fill,
          });
        }
      }

      if (dto.skills?.length) {
        const existing = new Set(
          (await tx.skill.findMany({ where: { userId }, select: { normalizedName: true } })).map(
            (s) => s.normalizedName,
          ),
        );
        for (const skill of dto.skills) {
          const normalizedName = normalizeSkillName(skill.name);
          if (existing.has(normalizedName)) {
            result.skippedDuplicateSkills.push(skill.name);
            continue;
          }
          existing.add(normalizedName);
          await tx.skill.create({
            data: { userId, name: skill.name, normalizedName, category: skill.category },
          });
          result.added.skills++;
        }
      }

      for (const item of dto.experiences ?? []) {
        await tx.experience.create({
          data: { userId, sortOrder: order.experiences++, ...experienceData(item) },
        });
        result.added.experiences++;
      }
      for (const item of dto.educations ?? []) {
        await tx.education.create({
          data: { userId, sortOrder: order.educations++, ...educationData(item) },
        });
        result.added.educations++;
      }
      for (const item of dto.projects ?? []) {
        await tx.project.create({
          data: { userId, sortOrder: order.projects++, ...projectData(item) },
        });
        result.added.projects++;
      }
      for (const item of dto.certifications ?? []) {
        await tx.certification.create({
          data: { userId, sortOrder: order.certifications++, ...certificationData(item) },
        });
        result.added.certifications++;
      }

      if (dto.languages?.length) {
        const existing = new Set(
          (
            await tx.profileLanguage.findMany({
              where: { userId },
              select: { normalizedName: true },
            })
          ).map((l) => l.normalizedName),
        );
        for (const item of dto.languages) {
          const data = languageData(item);
          if (existing.has(data.normalizedName)) {
            result.skippedDuplicateLanguages.push(item.name);
            continue;
          }
          existing.add(data.normalizedName);
          await tx.profileLanguage.create({
            data: { userId, sortOrder: order.languages++, ...data },
          });
          result.added.languages++;
        }
      }
    });

    await this.audit.record({
      action: AuditAction.PROFILE_IMPORTED_FROM_RESUME,
      userId,
      requestId: ctx.requestId,
      metadata: { filledFields: result.filledFields, added: { ...result.added } },
    });
    return result;
  }
}
