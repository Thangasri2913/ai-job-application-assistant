import { expect, type Page, test } from '@playwright/test';
import { addReviewedResume, apiStatus } from './helpers';
import { registerViaKeycloak, testAccount } from './keycloak';
import { buildResumePdf } from './resume-pdf';

/**
 * Application preparation against the real stack (Keycloak, React, NestJS, PostgreSQL, S3).
 * Runs with whatever AI provider the server has; with none, drafts come from verified data.
 */

const RESUME = [
  'Thanga Sri',
  'Frontend Developer',
  'thanga.sri@example.com | +91 98765 43210 | Chennai, India',
  '',
  'SKILLS',
  'Frontend: Angular, TypeScript, RxJS',
  'Tools: Git',
  '',
  'EXPERIENCE',
  'Frontend Developer | Acme Technologies | Chennai, India',
  'Jul 2022 - Present',
  '- Maintained the design system documentation',
  '- Reviewed pull requests for the frontend team',
  '- Developed dashboards for industrial IoT applications using Angular',
];

const JOB = `We are looking for a Frontend Developer to build our IoT dashboards.

Responsibilities:
- Build interactive dashboards in Angular

Requirements:
- 2+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS
- Experience with Docker`;

const card = (page: Page, text: RegExp | string) =>
  page
    .getByRole('list', { name: 'Resume suggestions' })
    .getByRole('listitem')
    .filter({ hasText: text });

test('prepare an application: suggestions, cover letter and answers, all reviewed and persisted', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  let applicationId = '';

  await test.step('sign in, add a reviewed resume, an analysed job and an application', async () => {
    await page.goto('/login');
    await registerViaKeycloak(page, testAccount());
    await expect(page.getByRole('heading', { name: 'Welcome, Thanga' })).toBeVisible();
    await addReviewedResume(page, 'Angular Resume', {
      name: 'Angular.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf(RESUME),
    });
    await page.getByRole('link', { name: 'Jobs', exact: true }).click();
    await page.getByRole('link', { name: 'Add job', exact: true }).click();
    await page.getByLabel('Job title').fill('Frontend Developer');
    await page.getByLabel('Company').fill('ABC Technologies');
    await page.getByLabel('Job description').fill(JOB);
    await page.getByRole('button', { name: 'Save and analyse' }).click();
    await expect(
      page.getByRole('region', { name: 'Recommended resume' }).getByText('Angular Resume'),
    ).toBeVisible();
    await page
      .getByRole('region', { name: 'Application' })
      .getByRole('button', { name: 'Track application' })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create application' }).click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}$/);
    applicationId = new URL(page.url()).pathname.split('/')[2]!;
  });

  await test.step('open preparation and confirm the exact resume version', async () => {
    await page.getByRole('link', { name: 'Prepare application' }).click();
    await expect(page.getByRole('heading', { name: 'Application preparation' })).toBeVisible();
    const resume = page.getByRole('region', { name: 'Selected resume' });
    await expect(resume.getByRole('link', { name: 'Angular Resume' })).toBeVisible();
    await expect(resume.getByText('v1')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Match summary' }).getByText(/^\d+%$/),
    ).toBeVisible();
  });

  await test.step('generate suggestions; accept one, reject one, edit one', async () => {
    await page.getByRole('button', { name: 'Generate resume suggestions' }).click();
    const bullet = card(page, 'Developed dashboards for industrial IoT applications using Angular');
    await expect(bullet).toBeVisible();
    await expect(
      card(page, /Do not add Docker unless you genuinely have this experience/),
    ).toBeVisible();

    // Edit: move the buried bullet up, in the user's own words.
    await bullet.getByRole('button', { name: 'Edit' }).click();
    await bullet
      .getByLabel('Your wording')
      .fill('Developed Angular dashboards for an industrial IoT platform');
    await bullet.getByRole('button', { name: 'Save my version' }).click();
    await expect(
      card(page, 'Developed Angular dashboards for an industrial IoT platform').getByText(
        'User edited',
      ),
    ).toBeVisible();

    // Accept (acknowledge) one and reject (dismiss) another.
    const typescript = card(page, /The job requires TypeScript/);
    await typescript.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(typescript.getByText('Accepted')).toBeVisible();
    const rxjs = card(page, /The job requires RxJS/);
    await rxjs.getByRole('button', { name: 'Dismiss' }).click();
    await expect(rxjs.getByText('Rejected')).toBeVisible();
    const docker = card(page, /Docker/);
    await docker.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(docker.getByText('Accepted')).toBeVisible();

    await page.getByRole('button', { name: 'View tailored draft' }).click();
    await expect(
      page.getByText(/with your \d+ accepted change\(s\)\. The original version is unchanged\./),
    ).toBeVisible();
  });

  await test.step('generate, edit and approve the cover letter', async () => {
    await page.getByRole('button', { name: 'Generate cover letter' }).click();
    const letter = page.getByRole('textbox', { name: 'Cover letter' });
    await expect(letter).toHaveValue(/^Dear Hiring Team,/);
    await expect(letter).toHaveValue(/ABC Technologies/);
    await expect(letter).not.toHaveValue(/Docker/);
    await expect(
      page.getByText(/Not claimed \(not found in your resume or profile\):/),
    ).toContainText('Docker');
    await letter.fill(
      `${await letter.inputValue()}\n\nP.S. I am available for an interview any weekday.`,
    );
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(
      page.getByRole('region', { name: 'Cover letter' }).getByText('User edited'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText(/added to this application’s documents/)).toBeVisible();
  });

  await test.step('add a question, generate an answer, edit and approve it', async () => {
    await page
      .getByLabel('Paste a question from the application form')
      .fill('Describe your experience with Angular. (Maximum 40 words)');
    await expect(page.getByText('Limit detected: 40 words')).toBeVisible();
    await page.getByRole('button', { name: '+ Add question' }).click();
    const q = page
      .getByRole('list', { name: 'Application questions' })
      .getByRole('listitem')
      .first();
    await q.getByRole('button', { name: 'Generate answer' }).click();
    await expect(q.getByText('Suggested answer')).toBeVisible();
    await expect(q.getByText(/Angular/).first()).toBeVisible();
    await q.getByRole('button', { name: 'Use suggestion as my answer' }).click();
    const answer = q.getByLabel('Your answer');
    await answer.fill(
      `${await answer.inputValue()} I also review pull requests for the frontend team.`,
    );
    await expect(q.getByText(/\/ 40 words/)).toBeVisible();
    await q.getByRole('button', { name: 'Save answer' }).click();
    await expect(q.getByText('User edited')).toBeVisible();
    await q.getByRole('button', { name: 'Approve answer' }).click();
    await expect(q.getByText('User approved')).toBeVisible();
  });

  await test.step('approve the preparation, refresh, and everything persists', async () => {
    await page.getByRole('button', { name: 'Approve as application-ready' }).click();
    await expect(page.getByText('Approved · application-ready')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Approved · application-ready')).toBeVisible();
    await expect(
      card(page, 'Developed Angular dashboards for an industrial IoT platform').getByText(
        'User edited',
      ),
    ).toBeVisible();
    await expect(card(page, /The job requires TypeScript/).getByText('Accepted')).toBeVisible();
    await expect(card(page, /The job requires RxJS/).getByText('Rejected')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Cover letter' })).toHaveValue(
      /P\.S\. I am available for an interview any weekday\./,
    );
    await expect(
      page.getByRole('region', { name: 'Cover letter' }).getByText('User approved'),
    ).toBeVisible();
    const q = page
      .getByRole('list', { name: 'Application questions' })
      .getByRole('listitem')
      .first();
    await expect(q.getByLabel('Your answer')).toHaveValue(
      /I also review pull requests for the frontend team\./,
    );
    await expect(q.getByText('User approved')).toBeVisible();

    await page.getByRole('link', { name: 'Back to application' }).click();
    const docs = page.getByRole('list', { name: 'Application documents' });
    await expect(docs.getByText('Cover letter v1')).toBeVisible();
  });

  await test.step('a new resume version leaves the application and its preparation on v1', async () => {
    await page
      .getByRole('region', { name: 'Resume' })
      .getByRole('link', { name: 'Angular Resume' })
      .click();
    await page.getByLabel('New resume file').setInputFiles({
      name: 'Angular_v2.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf([...RESUME, '', 'CERTIFICATIONS', 'Angular Certified Developer']),
    });
    await expect(page.getByRole('heading', { name: 'Review Angular Resume · v2' })).toBeVisible();
    await page.getByRole('button', { name: 'Save and make current' }).click();
    await expect(page.getByText('Current version · v2')).toBeVisible();

    await page.goto(`/applications/${applicationId}`);
    await expect(
      page.getByRole('region', { name: 'Resume' }).getByText('Version 1', { exact: true }),
    ).toBeVisible();
    await page.goto(`/applications/${applicationId}/preparation`);
    await expect(
      page.getByRole('region', { name: 'Selected resume' }).getByText('v1'),
    ).toBeVisible();
    await expect(page.getByText('Approved · application-ready')).toBeVisible();
  });

  await test.step('another user cannot access the preparation', async () => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    try {
      await otherPage.goto('/login');
      await registerViaKeycloak(otherPage, testAccount(), { first: 'Other', last: 'User' });
      await expect(otherPage.getByRole('heading', { name: 'Welcome, Other' })).toBeVisible();
      for (const path of [
        'preparation',
        'preparation/resume-suggestions',
        'preparation/cover-letter',
        'questions',
      ]) {
        expect(await apiStatus(otherPage, `/applications/${applicationId}/${path}`)).toBe(404);
      }
    } finally {
      await other.close();
    }
  });
});
