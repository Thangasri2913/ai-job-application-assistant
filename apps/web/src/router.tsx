import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RedirectIfAuthenticated, RequireAuth } from './features/auth/components/RouteGuards';
import { AppShell } from './layout/AppShell';
import { AuthLayout } from './layout/AuthLayout';

/** PLACEHOLDER routes for features that are planned but not built yet. */
const COMING_SOON: { path: string; title: string; description: string }[] = [
  {
    path: 'resumes',
    title: 'Resumes',
    description:
      'Upload and manage multiple resumes. Originals are never modified — edits create new versions.',
  },
  {
    path: 'profile',
    title: 'Career Profile',
    description:
      'Your experience, skills, education and projects — the facts every suggestion is grounded in.',
  },
  {
    path: 'analytics',
    title: 'Analytics',
    description: 'Insights calculated from your real application outcomes.',
  },
  {
    path: 'settings',
    title: 'Settings',
    description: 'Account, security and notification settings.',
  },
];

export const routes: RouteObject[] = [
  {
    path: 'auth/callback',
    lazy: async () => ({
      Component: (await import('./features/auth/pages/CallbackPage')).CallbackPage,
    }),
  },
  {
    element: <RedirectIfAuthenticated />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            path: 'login',
            lazy: async () => ({
              Component: (await import('./features/auth/pages/LoginPage')).LoginPage,
            }),
          },
        ],
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: 'dashboard',
            lazy: async () => ({
              Component: (await import('./features/dashboard/pages/DashboardPage')).DashboardPage,
            }),
          },
          {
            path: 'profile',
            lazy: async () => ({
              Component: (await import('./features/career-profile/pages/CareerProfilePage'))
                .CareerProfilePage,
            }),
          },
          {
            path: 'resumes',
            lazy: async () => ({
              Component: (await import('./features/resumes/pages/ResumeLibraryPage'))
                .ResumeLibraryPage,
            }),
          },
          {
            path: 'resumes/:resumeId',
            lazy: async () => ({
              Component: (await import('./features/resumes/pages/ResumeDetailPage'))
                .ResumeDetailPage,
            }),
          },
          {
            path: 'resumes/:resumeId/versions/:versionId/review',
            lazy: async () => ({
              Component: (await import('./features/resumes/pages/ResumeReviewPage'))
                .ResumeReviewPage,
            }),
          },
          {
            path: 'jobs',
            lazy: async () => ({
              Component: (await import('./features/jobs/pages/JobsPage')).JobsPage,
            }),
          },
          {
            path: 'jobs/new',
            lazy: async () => ({
              Component: (await import('./features/jobs/pages/AddJobPage')).AddJobPage,
            }),
          },
          {
            path: 'jobs/:jobId',
            lazy: async () => ({
              Component: (await import('./features/jobs/pages/JobDetailsPage')).JobDetailsPage,
            }),
          },
          {
            path: 'applications',
            lazy: async () => ({
              Component: (await import('./features/applications/pages/ApplicationsPage'))
                .ApplicationsPage,
            }),
          },
          {
            path: 'applications/:applicationId/interviews',
            lazy: async () => ({
              Component: (await import('./features/interviews/pages/InterviewPreparationPage'))
                .InterviewPreparationPage,
            }),
          },
          {
            path: 'recommendations',
            lazy: async () => ({
              Component: (await import('./features/job-discovery/pages/RecommendedJobsPage'))
                .RecommendedJobsPage,
            }),
          },
          {
            path: 'job-alerts',
            lazy: async () => ({
              Component: (await import('./features/job-discovery/pages/JobAlertsPage'))
                .JobAlertsPage,
            }),
          },
          {
            path: 'job-alerts/:alertId/runs',
            lazy: async () => ({
              Component: (await import('./features/job-discovery/pages/JobSearchRunPage'))
                .JobSearchRunPage,
            }),
          },
          {
            path: 'interviews',
            lazy: async () => ({
              Component: (await import('./features/interviews/pages/InterviewHistoryPage'))
                .InterviewHistoryPage,
            }),
          },
          {
            path: 'interviews/:sessionId',
            lazy: async () => ({
              Component: (await import('./features/interviews/pages/InterviewSessionPage'))
                .InterviewSessionPage,
            }),
          },
          {
            path: 'interviews/:sessionId/report',
            lazy: async () => ({
              Component: (await import('./features/interviews/pages/InterviewReportPage'))
                .InterviewReportPage,
            }),
          },
          {
            path: 'applications/:applicationId/preparation',
            lazy: async () => ({
              Component: (
                await import('./features/application-preparation/pages/ApplicationPreparationPage')
              ).ApplicationPreparationPage,
            }),
          },
          {
            path: 'applications/:applicationId',
            lazy: async () => ({
              Component: (await import('./features/applications/pages/ApplicationDetailsPage'))
                .ApplicationDetailsPage,
            }),
          },
          ...COMING_SOON.map(({ path, title, description }) => ({
            path,
            lazy: async () => {
              const { ComingSoonPage } = await import('./features/placeholder/ComingSoonPage');
              return {
                Component: () => <ComingSoonPage title={title} description={description} />,
              };
            },
          })),
          {
            path: '*',
            lazy: async () => ({ Component: (await import('./pages/NotFoundPage')).NotFoundPage }),
          },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
