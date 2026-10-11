import type {
  AchievementInput,
  AchievementItem,
  CareerProfile,
  CertificationInput,
  CertificationItem,
  EducationInput,
  EducationItem,
  ExperienceInput,
  ExperienceItem,
  ImportToProfileRequest,
  ImportToProfileResult,
  LanguageInput,
  LanguageItem,
  OrderableProfileSection,
  ProfileCompletion,
  ProfileDetails,
  ProjectInput,
  ProjectItem,
  SkillInput,
  SkillItem,
  UpdateProfileRequest,
} from '@job-assist/shared';
import { apiRequest } from '../../../lib/api/http';

/** URL section names under /profile. */
export type ProfileSection =
  | 'skills'
  | 'experiences'
  | 'education'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'achievements';

export interface SectionTypes {
  skills: { item: SkillItem; input: SkillInput };
  experiences: { item: ExperienceItem; input: ExperienceInput };
  education: { item: EducationItem; input: EducationInput };
  projects: { item: ProjectItem; input: ProjectInput };
  certifications: { item: CertificationItem; input: CertificationInput };
  languages: { item: LanguageItem; input: LanguageInput };
  achievements: { item: AchievementItem; input: AchievementInput };
}

export const profileApi = {
  get: () => apiRequest<CareerProfile>('/profile'),
  update: (body: UpdateProfileRequest) =>
    apiRequest<ProfileDetails>('/profile', { method: 'PUT', body }),
  completion: () => apiRequest<ProfileCompletion>('/profile/completion'),
  import: (body: ImportToProfileRequest) =>
    apiRequest<ImportToProfileResult>('/profile/import', { method: 'POST', body }),

  createItem: <S extends ProfileSection>(section: S, body: SectionTypes[S]['input']) =>
    apiRequest<SectionTypes[S]['item']>(`/profile/${section}`, { method: 'POST', body }),
  updateItem: <S extends ProfileSection>(section: S, id: string, body: SectionTypes[S]['input']) =>
    apiRequest<SectionTypes[S]['item']>(`/profile/${section}/${id}`, { method: 'PATCH', body }),
  reorder: (section: OrderableProfileSection, ids: string[]) =>
    apiRequest<void>(`/profile/${section}/order`, { method: 'PUT', body: { ids } }),
  deleteItem: (section: ProfileSection, id: string) =>
    apiRequest<void>(`/profile/${section}/${id}`, { method: 'DELETE' }),
};
