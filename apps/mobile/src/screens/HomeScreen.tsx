import {
  type AuthUser,
  type DashboardSummary,
  type JobRecommendationItem,
  type SmartApplicationListResponse,
  type SmartApplicationSummary,
  smartApplyDisplay,
} from '@job-assist/shared';
import { ArrowRight, Briefcase, FileText, Inbox, Sparkles, UserRound } from '../icons';
import { View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Screen } from '../components/Screen';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  type Icon,
  LoadingState,
  MatchScore,
  Section,
  Text,
} from '../components/ui';
import { firstName } from '../format';
import { type Route, type Tab, useNav } from '../navigation';
import { space, useColors } from '../theme';
import { messageOf, useLoad } from '../useLoad';

interface HomeData {
  user: AuthUser | null;
  dashboard: DashboardSummary | null;
  applications: SmartApplicationListResponse | null;
  recommendations: JobRecommendationItem[] | null;
  /** Sections that couldn't load (each is shown or omitted on its own). */
  errors: string[];
}

/** Everything the home screen shows, from real API data; a failing part doesn't hide the rest. */
async function loadHome(api: ReturnType<typeof useAuth>['api']): Promise<HomeData> {
  const [user, dashboard, applications, recommendations] = await Promise.allSettled([
    api.me(),
    api.dashboard(),
    api.applications(),
    api.recommendations({ status: 'NEW' }),
  ]);
  const value = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
  const failed = [user, dashboard, applications, recommendations].filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  );
  if (failed.length === 4) throw failed[0]!.reason;
  return {
    user: value(user),
    dashboard: value(dashboard),
    applications: value(applications),
    recommendations: value(recommendations),
    errors: [...new Set(failed.map((f) => messageOf(f.reason)))],
  };
}

interface NextStep {
  icon: Icon;
  title: string;
  text: string;
  action: string;
  tab: Tab;
  route?: Route;
}

/** The single most useful next action, from real data, in priority order. */
export function nextStep(d: HomeData): NextStep | null {
  const apps = d.applications?.items ?? [];
  const needsInput = apps.filter((a) => a.state === 'NEEDS_USER_INPUT');
  if (needsInput.length > 0) {
    const n = needsInput.reduce((sum, a) => sum + a.outstandingQuestions, 0);
    return {
      icon: Inbox,
      title: `Answer ${n} question${n === 1 ? '' : 's'}`,
      text: `${needsInput.length === 1 ? 'An application is' : `${needsInput.length} applications are`} waiting for information only you can give.`,
      action: 'Answer questions',
      tab: 'home',
      route: { name: 'questions' },
    };
  }
  const handoff = apps.find((a) => a.state === 'AWAITING_USER_SUBMISSION');
  if (handoff) {
    return {
      icon: ArrowRight,
      title: 'Submit on the employer’s site',
      text: `${handoff.job.title} at ${handoff.job.companyName} is approved and ready for you to submit.`,
      action: 'Open application',
      tab: 'applications',
      route: { name: 'application', id: handoff.id },
    };
  }
  const review = apps.find((a) => a.state === 'READY_FOR_REVIEW');
  if (review) {
    return {
      icon: FileText,
      title: 'Review a prepared application',
      text: `${review.job.title} at ${review.job.companyName} is ready for your review.`,
      action: 'Review',
      tab: 'applications',
      route: { name: 'application', id: review.id },
    };
  }
  if (d.dashboard && d.dashboard.resumes.active === 0) {
    return {
      icon: FileText,
      title: 'Add your resume',
      text: 'Matching and recommendations need at least one reviewed resume. Upload one on the JobAssist website.',
      action: 'See resumes',
      tab: 'profile',
      route: { name: 'resumes' },
    };
  }
  if (d.recommendations && d.recommendations.length > 0) {
    return {
      icon: Sparkles,
      title: `${d.recommendations.length} new job${d.recommendations.length === 1 ? '' : 's'} to look at`,
      text: 'Real jobs your alerts found that match your resumes.',
      action: 'Browse jobs',
      tab: 'jobs',
    };
  }
  if (d.dashboard && d.dashboard.profileCompletion.percentage < 100) {
    return {
      icon: UserRound,
      title: 'Complete your career profile',
      text: `Your profile is ${d.dashboard.profileCompletion.percentage}% complete. A fuller profile gives better matches.`,
      action: 'See what’s missing',
      tab: 'profile',
    };
  }
  return null;
}

const attention = (a: SmartApplicationSummary) =>
  a.state === 'NEEDS_USER_INPUT' ||
  a.state === 'READY_FOR_REVIEW' ||
  a.state === 'AWAITING_USER_SUBMISSION' ||
  a.uncertain;

export function HomeScreen() {
  const { api } = useAuth();
  const { navigate } = useNav();
  const home = useLoad(() => loadHome(api), [api]);
  const d = home.data;

  return (
    <Screen title="Home" refreshing={home.refreshing} onRefresh={home.reload}>
      {home.loading ? (
        <LoadingState label="Loading your overview" />
      ) : !d ? (
        <EmptyState
          icon={Inbox}
          title="Couldn’t load your overview"
          text={home.error ?? 'Please try again.'}
          action={<Button label="Try again" variant="secondary" onPress={home.reload} />}
        />
      ) : (
        <HomeContent data={d} onNavigate={(tab, route) => navigate(tab, route)} />
      )}
      {d && home.error ? <Banner tone="warning">{home.error}</Banner> : null}
    </Screen>
  );
}

function HomeContent({
  data: d,
  onNavigate,
}: {
  data: HomeData;
  onNavigate: (tab: Tab, route?: Route) => void;
}) {
  const c = useColors();
  const step = nextStep(d);
  const attentionItems = (d.applications?.items ?? []).filter(attention).slice(0, 3);
  const top = (d.recommendations ?? []).slice(0, 3);
  const pipeline = d.dashboard?.applications;
  const name = firstName(d.user?.fullName);

  return (
    <>
      <View style={{ gap: space.xs }}>
        <Text variant="title">{name ? `Hi, ${name}` : 'Welcome'}</Text>
        <Text muted>Here’s what needs your attention.</Text>
      </View>

      {d.errors.length > 0 ? (
        <Banner tone="warning" title="Some information couldn’t load">
          {d.errors.join(' ')}
        </Banner>
      ) : null}

      {step ? (
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
            <step.icon size={22} color={c.primary} />
            <View style={{ flex: 1, gap: space.xs }}>
              <Text variant="caption" muted>
                NEXT STEP
              </Text>
              <Text variant="subheading">{step.title}</Text>
              <Text muted>{step.text}</Text>
            </View>
          </View>
          <Button label={step.action} onPress={() => onNavigate(step.tab, step.route)} />
        </Card>
      ) : (
        <Card>
          <Text variant="subheading">You’re all caught up</Text>
          <Text muted>
            Nothing needs your attention right now. New job matches will appear here.
          </Text>
        </Card>
      )}

      {attentionItems.length > 0 ? (
        <Section title="Needs your attention">
          {attentionItems.map((a) => {
            const display = smartApplyDisplay(a);
            return (
              <Card
                key={a.id}
                onPress={() => onNavigate('applications', { name: 'application', id: a.id })}
                accessibilityLabel={`${a.job.title} at ${a.job.companyName}. ${display.label}`}
              >
                <Text variant="label" numberOfLines={2}>
                  {a.job.title}
                </Text>
                <Text variant="small" muted numberOfLines={1}>
                  {a.job.companyName}
                </Text>
                <Badge label={display.label} tone={display.tone} />
              </Card>
            );
          })}
        </Section>
      ) : null}

      {d.recommendations ? (
        <Section
          title="New job matches"
          action={
            top.length > 0 ? (
              <Button compact variant="ghost" label="See all" onPress={() => onNavigate('jobs')} />
            ) : null
          }
        >
          {top.length === 0 ? (
            <Text muted>
              No new matches. Your job alerts add real jobs here when they match your resumes.
            </Text>
          ) : (
            top.map((r) => (
              <Card
                key={r.id}
                onPress={() =>
                  onNavigate('jobs', { name: 'job', jobId: r.job.id, recommendationId: r.id })
                }
                accessibilityLabel={`${r.job.title} at ${r.job.companyName}, ${r.matchScore}% match`}
              >
                <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="label" numberOfLines={2}>
                      {r.job.title}
                    </Text>
                    <Text variant="small" muted numberOfLines={1}>
                      {[r.job.companyName, r.job.location].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <MatchScore score={r.matchScore} compact />
                </View>
              </Card>
            ))
          )}
        </Section>
      ) : null}

      {pipeline ? (
        <Section title="Your applications">
          <Card onPress={() => onNavigate('applications')} accessibilityLabel="Open applications">
            {pipeline.total === 0 ? (
              <Text muted>No applications tracked yet. Prepare one from a job you like.</Text>
            ) : (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {[
                  ['Tracked', pipeline.total],
                  ['Applied', pipeline.byStatus.APPLIED + pipeline.byStatus.RECRUITER_SCREEN],
                  [
                    'Interviews',
                    pipeline.byStatus.ASSESSMENT +
                      pipeline.byStatus.INTERVIEW +
                      pipeline.byStatus.TECHNICAL_INTERVIEW +
                      pipeline.byStatus.FINAL_INTERVIEW,
                  ],
                  ['Offers', pipeline.byStatus.OFFER + pipeline.byStatus.ACCEPTED],
                ].map(([label, n]) => (
                  <View
                    key={label}
                    style={{ alignItems: 'center', flex: 1 }}
                    accessible
                    accessibilityLabel={`${label}: ${n}`}
                  >
                    <Text variant="heading">{String(n)}</Text>
                    <Text variant="caption" muted>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </Section>
      ) : null}

      {d.dashboard ? (
        <Section title="Profile and resumes">
          <Card onPress={() => onNavigate('profile')} accessibilityLabel="Open profile">
            <Text variant="label">
              Career profile {d.dashboard.profileCompletion.percentage}% complete
            </Text>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ height: 6, borderRadius: 999, backgroundColor: c.border }}
            >
              <View
                style={{
                  width: `${d.dashboard.profileCompletion.percentage}%`,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: c.primary,
                }}
              />
            </View>
            <Text variant="small" muted>
              {d.dashboard.resumes.active === 0
                ? 'No active resumes yet.'
                : `${d.dashboard.resumes.active} active resume${d.dashboard.resumes.active === 1 ? '' : 's'}${
                    d.dashboard.resumes.defaultResume
                      ? ` · default: ${d.dashboard.resumes.defaultResume.name}`
                      : ''
                  }${d.dashboard.resumes.needsReview > 0 ? ` · ${d.dashboard.resumes.needsReview} to review` : ''}`}
            </Text>
          </Card>
        </Section>
      ) : null}

      {!step && !d.dashboard && !d.recommendations ? (
        <EmptyState icon={Briefcase} title="Nothing to show yet" text="Pull down to refresh." />
      ) : null}
    </>
  );
}
