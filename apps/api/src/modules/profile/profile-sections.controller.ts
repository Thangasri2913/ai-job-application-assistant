import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  type AchievementItem,
  type CertificationItem,
  type EducationItem,
  type ExperienceItem,
  type LanguageItem,
  ORDERABLE_PROFILE_SECTIONS,
  type OrderableProfileSection,
  type ProjectItem,
  type SkillItem,
} from '@job-assist/shared';
import {
  type AuthenticatedPrincipal,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  type RequestContext,
  ReqContext,
} from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  AchievementDto,
  CertificationDto,
  EducationDto,
  ExperienceDto,
  LanguageDto,
  ProjectDto,
  ReorderDto,
  SkillDto,
} from './dto/sections.dto.js';
import { type OrderedSection, ProfileSectionsService } from './profile-sections.service.js';

const Id = () => Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));

/** URL section name → internal section key. */
const SECTION_BY_PATH: Record<OrderableProfileSection, OrderedSection> = {
  experiences: 'experiences',
  education: 'educations',
  projects: 'projects',
  certifications: 'certifications',
  languages: 'languages',
  achievements: 'achievements',
};

type P = AuthenticatedPrincipal;
type C = RequestContext;

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileSectionsController {
  constructor(private readonly sections: ProfileSectionsService) {}

  // Skills
  @Get('skills')
  listSkills(@CurrentUser() u: P): Promise<SkillItem[]> {
    return this.sections.listSkills(u.userId);
  }
  @Post('skills')
  createSkill(@CurrentUser() u: P, @Body() dto: SkillDto, @ReqContext() ctx: C) {
    return this.sections.createSkill(u.userId, dto, ctx);
  }
  @Patch('skills/:id')
  updateSkill(@CurrentUser() u: P, @Id() id: string, @Body() dto: SkillDto, @ReqContext() ctx: C) {
    return this.sections.updateSkill(u.userId, id, dto, ctx);
  }
  @Delete('skills/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSkill(@CurrentUser() u: P, @Id() id: string, @ReqContext() ctx: C) {
    return this.sections.remove('skills', u.userId, id, ctx);
  }

  // Experience
  @Get('experiences')
  listExperiences(@CurrentUser() u: P): Promise<ExperienceItem[]> {
    return this.sections.listExperiences(u.userId);
  }
  @Post('experiences')
  createExperience(@CurrentUser() u: P, @Body() dto: ExperienceDto, @ReqContext() ctx: C) {
    return this.sections.createExperience(u.userId, dto, ctx);
  }
  @Patch('experiences/:id')
  updateExperience(
    @CurrentUser() u: P,
    @Id() id: string,
    @Body() dto: ExperienceDto,
    @ReqContext() ctx: C,
  ) {
    return this.sections.updateExperience(u.userId, id, dto, ctx);
  }
  @Delete('experiences/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteExperience(@CurrentUser() u: P, @Id() id: string, @ReqContext() ctx: C) {
    return this.sections.remove('experiences', u.userId, id, ctx);
  }

  // Education
  @Get('education')
  listEducation(@CurrentUser() u: P): Promise<EducationItem[]> {
    return this.sections.listEducations(u.userId);
  }
  @Post('education')
  createEducation(@CurrentUser() u: P, @Body() dto: EducationDto, @ReqContext() ctx: C) {
    return this.sections.createEducation(u.userId, dto, ctx);
  }
  @Patch('education/:id')
  updateEducation(
    @CurrentUser() u: P,
    @Id() id: string,
    @Body() dto: EducationDto,
    @ReqContext() ctx: C,
  ) {
    return this.sections.updateEducation(u.userId, id, dto, ctx);
  }
  @Delete('education/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEducation(@CurrentUser() u: P, @Id() id: string, @ReqContext() ctx: C) {
    return this.sections.remove('educations', u.userId, id, ctx);
  }

  // Projects
  @Get('projects')
  listProjects(@CurrentUser() u: P): Promise<ProjectItem[]> {
    return this.sections.listProjects(u.userId);
  }
  @Post('projects')
  createProject(@CurrentUser() u: P, @Body() dto: ProjectDto, @ReqContext() ctx: C) {
    return this.sections.createProject(u.userId, dto, ctx);
  }
  @Patch('projects/:id')
  updateProject(
    @CurrentUser() u: P,
    @Id() id: string,
    @Body() dto: ProjectDto,
    @ReqContext() ctx: C,
  ) {
    return this.sections.updateProject(u.userId, id, dto, ctx);
  }
  @Delete('projects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProject(@CurrentUser() u: P, @Id() id: string, @ReqContext() ctx: C) {
    return this.sections.remove('projects', u.userId, id, ctx);
  }

  // Certifications
  @Get('certifications')
  listCertifications(@CurrentUser() u: P): Promise<CertificationItem[]> {
    return this.sections.listCertifications(u.userId);
  }
  @Post('certifications')
  createCertification(@CurrentUser() u: P, @Body() dto: CertificationDto, @ReqContext() ctx: C) {
    return this.sections.createCertification(u.userId, dto, ctx);
  }
  @Patch('certifications/:id')
  updateCertification(
    @CurrentUser() u: P,
    @Id() id: string,
    @Body() dto: CertificationDto,
    @ReqContext() ctx: C,
  ) {
    return this.sections.updateCertification(u.userId, id, dto, ctx);
  }
  @Delete('certifications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCertification(@CurrentUser() u: P, @Id() id: string, @ReqContext() ctx: C) {
    return this.sections.remove('certifications', u.userId, id, ctx);
  }

  // Languages
  @Get('languages')
  listLanguages(@CurrentUser() u: P): Promise<LanguageItem[]> {
    return this.sections.listLanguages(u.userId);
  }
  @Post('languages')
  createLanguage(@CurrentUser() u: P, @Body() dto: LanguageDto, @ReqContext() ctx: C) {
    return this.sections.createLanguage(u.userId, dto, ctx);
  }
  @Patch('languages/:id')
  updateLanguage(
    @CurrentUser() u: P,
    @Id() id: string,
    @Body() dto: LanguageDto,
    @ReqContext() ctx: C,
  ) {
    return this.sections.updateLanguage(u.userId, id, dto, ctx);
  }
  @Delete('languages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteLanguage(@CurrentUser() u: P, @Id() id: string, @ReqContext() ctx: C) {
    return this.sections.remove('languages', u.userId, id, ctx);
  }

  // Achievements
  @Get('achievements')
  listAchievements(@CurrentUser() u: P): Promise<AchievementItem[]> {
    return this.sections.listAchievements(u.userId);
  }
  @Post('achievements')
  createAchievement(@CurrentUser() u: P, @Body() dto: AchievementDto, @ReqContext() ctx: C) {
    return this.sections.createAchievement(u.userId, dto, ctx);
  }
  @Patch('achievements/:id')
  updateAchievement(
    @CurrentUser() u: P,
    @Id() id: string,
    @Body() dto: AchievementDto,
    @ReqContext() ctx: C,
  ) {
    return this.sections.updateAchievement(u.userId, id, dto, ctx);
  }
  @Delete('achievements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAchievement(@CurrentUser() u: P, @Id() id: string, @ReqContext() ctx: C) {
    return this.sections.remove('achievements', u.userId, id, ctx);
  }

  // Ordering
  @Put(':section/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'section', enum: ORDERABLE_PROFILE_SECTIONS })
  @ApiNoContentResponse({ description: 'Items reordered.' })
  reorder(
    @CurrentUser() u: P,
    @Param('section') section: string,
    @Body() dto: ReorderDto,
    @ReqContext() ctx: C,
  ) {
    const key = SECTION_BY_PATH[section as OrderableProfileSection] as OrderedSection | undefined;
    if (!key)
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Unknown profile section.');
    return this.sections.reorder(key, u.userId, dto.ids, ctx);
  }
}
