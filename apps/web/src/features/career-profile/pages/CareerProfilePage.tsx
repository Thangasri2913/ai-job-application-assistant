import { useState } from 'react';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatDateRange, formatMonth } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { cn } from '../../../shared/ui/cn';
import { CertificationForm } from '../components/CertificationForm';
import { CompletionCard } from '../components/CompletionCard';
import { EditableSection } from '../components/EditableSection';
import { EducationForm } from '../components/EducationForm';
import { ExperienceForm } from '../components/ExperienceForm';
import { ProfileDetailsForm } from '../components/ProfileDetailsForm';
import { ProjectForm } from '../components/ProjectForm';
import { SkillsSection } from '../components/SkillsSection';
import { AchievementForm } from '../components/AchievementForm';
import { LanguageForm } from '../components/LanguageForm';
import {
  useDeleteSectionItem,
  useProfile,
  useProfileCompletion,
  useReorderSection,
} from '../hooks/useProfile';

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'skills', label: 'Skills' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'projects', label: 'Projects' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'languages', label: 'Languages' },
  { id: 'achievements', label: 'Achievements' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function CareerProfilePage() {
  const profile = useProfile();
  const completion = useProfileCompletion();
  const [tab, setTab] = useState<TabId>('details');
  const deleteExperience = useDeleteSectionItem('experiences');
  const deleteEducation = useDeleteSectionItem('education');
  const deleteProject = useDeleteSectionItem('projects');
  const deleteCertification = useDeleteSectionItem('certifications');
  const deleteLanguage = useDeleteSectionItem('languages');
  const deleteAchievement = useDeleteSectionItem('achievements');
  const reorderExperiences = useReorderSection('experiences');
  const reorderEducation = useReorderSection('education');
  const reorderProjects = useReorderSection('projects');
  const reorderCertifications = useReorderSection('certifications');
  const reorderLanguages = useReorderSection('languages');
  const reorderAchievements = useReorderSection('achievements');

  if (profile.isPending) return <LoadingState label="Loading your profile" />;
  if (profile.isError)
    return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  const data = profile.data;

  return (
    <>
      <PageHeader
        title="Career profile"
        subtitle="Your facts, in your words. Everything the assistant suggests is grounded in what you enter here."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div
            role="tablist"
            aria-label="Profile sections"
            className="mb-5 flex gap-1 overflow-x-auto border-b border-border"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                  tab === t.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'details' ? <ProfileDetailsForm details={data.details} /> : null}
            {tab === 'skills' ? <SkillsSection skills={data.skills} /> : null}
            {tab === 'experience' ? (
              <EditableSection
                id="experience"
                title="Work experience"
                itemLabel="experience"
                items={data.experiences}
                emptyText="No experience added yet."
                onDelete={(id) => deleteExperience.mutateAsync(id)}
                deleting={deleteExperience.isPending}
                onReorder={(ids) => reorderExperiences.mutate(ids)}
                renderForm={(p) => <ExperienceForm {...p} />}
                renderItem={(e) => (
                  <>
                    <div className="font-medium">{e.jobTitle}</div>
                    <div className="text-sm text-muted">
                      {[e.company, e.location, formatDateRange(e.startDate, e.endDate, e.isCurrent)]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {e.technologies.length > 0 ? (
                      <div className="mt-1 text-xs text-muted">{e.technologies.join(', ')}</div>
                    ) : null}
                  </>
                )}
              />
            ) : null}
            {tab === 'education' ? (
              <EditableSection
                id="education"
                title="Education"
                itemLabel="education"
                items={data.educations}
                emptyText="No education added yet."
                onDelete={(id) => deleteEducation.mutateAsync(id)}
                deleting={deleteEducation.isPending}
                onReorder={(ids) => reorderEducation.mutate(ids)}
                renderForm={(p) => <EducationForm {...p} />}
                renderItem={(e) => (
                  <>
                    <div className="font-medium">
                      {[e.degree, e.fieldOfStudy].filter(Boolean).join(', ') || e.institution}
                    </div>
                    <div className="text-sm text-muted">
                      {[
                        e.degree || e.fieldOfStudy ? e.institution : null,
                        formatDateRange(e.startDate, e.endDate),
                        e.grade,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </>
                )}
              />
            ) : null}
            {tab === 'projects' ? (
              <EditableSection
                id="projects"
                title="Projects"
                itemLabel="project"
                items={data.projects}
                emptyText="No projects added yet."
                onDelete={(id) => deleteProject.mutateAsync(id)}
                deleting={deleteProject.isPending}
                onReorder={(ids) => reorderProjects.mutate(ids)}
                renderForm={(p) => <ProjectForm {...p} />}
                renderItem={(p) => (
                  <>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-muted">
                      {[p.role, p.technologies.join(', ')].filter(Boolean).join(' · ')}
                    </div>
                  </>
                )}
              />
            ) : null}
            {tab === 'certifications' ? (
              <EditableSection
                id="certifications"
                title="Certifications"
                itemLabel="certification"
                items={data.certifications}
                emptyText="No certifications added yet."
                onDelete={(id) => deleteCertification.mutateAsync(id)}
                deleting={deleteCertification.isPending}
                onReorder={(ids) => reorderCertifications.mutate(ids)}
                renderForm={(p) => <CertificationForm {...p} />}
                renderItem={(c) => (
                  <>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-muted">
                      {[
                        c.issuer,
                        formatMonth(c.issueDate),
                        c.expiryDate ? `Expires ${formatMonth(c.expiryDate)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </>
                )}
              />
            ) : null}
            {tab === 'languages' ? (
              <EditableSection
                id="languages"
                title="Languages"
                itemLabel="language"
                items={data.languages}
                emptyText="No languages added yet."
                onDelete={(id) => deleteLanguage.mutateAsync(id)}
                deleting={deleteLanguage.isPending}
                onReorder={(ids) => reorderLanguages.mutate(ids)}
                renderForm={(p) => <LanguageForm {...p} />}
                renderItem={(l) => (
                  <>
                    <div className="font-medium">{l.name}</div>
                    {l.proficiency ? (
                      <div className="text-sm text-muted">{l.proficiency}</div>
                    ) : null}
                  </>
                )}
              />
            ) : null}
            {tab === 'achievements' ? (
              <EditableSection
                id="achievements"
                title="Achievements"
                itemLabel="achievement"
                items={data.achievements}
                emptyText="No achievements added yet. Awards, recognitions and results you can stand behind belong here."
                onDelete={(id) => deleteAchievement.mutateAsync(id)}
                deleting={deleteAchievement.isPending}
                onReorder={(ids) => reorderAchievements.mutate(ids)}
                renderForm={(p) => <AchievementForm {...p} />}
                renderItem={(a) => (
                  <>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-sm text-muted">
                      {[a.description, formatMonth(a.date)].filter(Boolean).join(' · ')}
                    </div>
                  </>
                )}
              />
            ) : null}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24">
          {completion.data ? <CompletionCard completion={completion.data} /> : null}
        </aside>
      </div>
    </>
  );
}
