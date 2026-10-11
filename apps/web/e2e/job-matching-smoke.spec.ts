import { expect, test } from '@playwright/test';
import { addReviewedResume, apiStatus } from './helpers';
import { registerViaKeycloak, testAccount } from './keycloak';
import { buildResumeDocx } from './resume-docx';
import { buildResumePdf, RESUME_LINES } from './resume-pdf';

/**
 * Job intake → analysis → comparison against ALL resumes → recommendation, against the
 * real stack (Keycloak, React, NestJS, PostgreSQL, S3). Two throwaway Keycloak users.
 */

const REACT_RESUME_LINES = [
  'Thanga Sri',
  'React Developer',
  'thanga.sri@example.com | +91 98765 43210 | Chennai, India',
  '',
  'SKILLS',
  'Frontend: React, TypeScript, Next.js',
  'Backend: Node.js',
  '',
  'EXPERIENCE',
  'React Developer | Beta Labs | Chennai, India',
  'Jan 2023 - Present',
  '- Built React pages and reusable hooks for a customer portal',
  '- Wrote unit tests with Jest',
];

const ANGULAR_JOB = `We are looking for a Frontend Developer to build our SaaS analytics dashboards.

Responsibilities:
- Build and maintain frontend applications in Angular
- Develop reusable UI components
- Integrate REST APIs

Requirements:
- 2+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS
- Bachelor's degree in Computer Science or equivalent experience

Nice to have:
- Docker and AWS`;

const REACT_JOB = `We are hiring a React engineer for our customer portal.

Responsibilities:
- Build React pages and reusable hooks
- Write unit tests with Jest

Requirements:
- 2+ years of experience with React and TypeScript
- Experience with Node.js

Nice to have:
- Next.js`;

test('add a job, analyse it, compare all resumes and get a recommendation', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  let jobId = '';
  const comparison = () => page.getByRole('list', { name: 'Compared resumes' });
  const recommendation = () => page.getByRole('region', { name: 'Recommended resume' });

  await test.step('sign in and create two reviewed resumes', async () => {
    await page.goto('/login');
    await registerViaKeycloak(page, testAccount());
    await expect(page.getByRole('heading', { name: 'Welcome, Thanga' })).toBeVisible();
    await addReviewedResume(page, 'Angular Resume', {
      name: 'Angular.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf(RESUME_LINES),
    });
    await addReviewedResume(page, 'React Resume', {
      name: 'React.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: buildResumeDocx(REACT_RESUME_LINES),
    });
  });

  await test.step('open Jobs and add a realistic job description', async () => {
    await page.getByRole('link', { name: 'Jobs', exact: true }).click();
    await expect(page.getByText('You haven’t added any jobs yet.')).toBeVisible();
    await page.getByRole('link', { name: 'Add job', exact: true }).click();
    await page.getByLabel('Job title').fill('Frontend Developer');
    await page.getByLabel('Company').fill('Example Corp');
    await page.getByLabel('Job description').fill(ANGULAR_JOB);
    await page.getByLabel(/^Location/).fill('Chennai');
    await page.getByRole('button', { name: 'Save and analyse' }).click();
    await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/);
    jobId = new URL(page.url()).pathname.split('/')[2]!;
  });

  await test.step('view structured requirements', async () => {
    const required = page.getByRole('region', { name: 'Required skills' });
    await expect(required.getByText('Angular', { exact: true })).toBeVisible();
    await expect(required.getByText('TypeScript', { exact: true })).toBeVisible();
    const preferred = page.getByRole('region', { name: 'Preferred skills' });
    await expect(preferred.getByText('AWS', { exact: true })).toBeVisible();
    await expect(required.getByText('AWS', { exact: true })).toHaveCount(0);
  });

  await test.step('both resumes are compared, with individual scores, strengths and gaps', async () => {
    await expect(comparison().getByRole('listitem')).toHaveCount(2);
    const angular = comparison().getByRole('listitem').filter({ hasText: 'Angular Resume' });
    const react = comparison().getByRole('listitem').filter({ hasText: 'React Resume' });
    await expect(angular.getByText('Recommended')).toBeVisible();
    await expect(react.getByText(/Required skills not found: .*Angular/)).toBeVisible();
    await expect(page.getByText('AI-assisted job compatibility score').first()).toBeVisible();
    await angular.getByRole('button', { name: /^Why \d+%\?$/ }).click();
    await expect(angular.getByText(/lists it in work experience/).first()).toBeVisible();
  });

  await test.step('see the recommended resume and choose another one', async () => {
    await expect(recommendation().getByText('Angular Resume')).toBeVisible();
    await expect(recommendation().getByText('Why')).toBeVisible();
    await recommendation()
      .getByRole('radio', { name: /React Resume/ })
      .check();
    await recommendation().getByRole('button', { name: 'Use selected resume' }).click();
    await expect(recommendation().getByText('Your choice')).toBeVisible();
  });

  await test.step('changing the job produces different matching results', async () => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Job title').fill('React Engineer');
    await dialog.getByLabel('Job description').fill(REACT_JOB);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('The job details changed after this analysis.')).toBeVisible();
    await page.getByRole('button', { name: 'Analyse again' }).click();
    await expect(recommendation().getByText('React Resume').first()).toBeVisible();
    const react = comparison().getByRole('listitem').filter({ hasText: 'React Resume' });
    await expect(react.getByText('Recommended')).toBeVisible();
  });

  await test.step('the jobs list shows the real result', async () => {
    await page.getByRole('link', { name: 'Jobs', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: 'React Engineer' });
    await expect(row.getByText('React Resume')).toBeVisible();
    await expect(row.getByText(/^\d+%$/)).toBeVisible();
  });

  await test.step('another user cannot access this job', async () => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    try {
      await otherPage.goto('/login');
      await registerViaKeycloak(otherPage, testAccount(), { first: 'Other', last: 'User' });
      await expect(otherPage.getByRole('heading', { name: 'Welcome, Other' })).toBeVisible();
      for (const path of [
        `/jobs/${jobId}`,
        `/jobs/${jobId}/matches`,
        `/jobs/${jobId}/recommendation`,
      ]) {
        expect(await apiStatus(otherPage, path)).toBe(404);
      }
      await otherPage.goto(`/jobs/${jobId}`);
      await expect(otherPage.getByText('Couldn’t load this')).toBeVisible();
      await otherPage.goto('/jobs');
      await expect(otherPage.getByText('You haven’t added any jobs yet.')).toBeVisible();
      expect(await apiStatus(page, `/jobs/${jobId}`)).toBe(200);
    } finally {
      await other.close();
    }
  });
});
