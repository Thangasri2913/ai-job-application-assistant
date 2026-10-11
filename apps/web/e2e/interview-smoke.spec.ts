import { expect, test } from '@playwright/test';
import { addReviewedResume, apiStatus } from './helpers';
import { registerViaKeycloak, testAccount } from './keycloak';
import { buildResumePdf, RESUME_LINES } from './resume-pdf';

/**
 * Interview preparation and a full 10-question mock interview against the real stack. Runs
 * with whatever AI provider the server has; with none, questions come from the job and
 * resume, and feedback is rule-based practice feedback.
 */

const JOB = `We are looking for a Frontend Developer to build IoT dashboards.

Responsibilities:
- Build interactive dashboards in Angular
- Integrate REST APIs

Requirements:
- 2+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS
- Experience with Docker`;

const ANSWER = `At Acme Technologies I built reusable Angular components for our dashboards.
For example, I moved heavy components to OnPush change detection and used RxJS to stream data from REST APIs.

As a result the dashboards stayed responsive for our users.`;

test('practise for an application, then complete a 10-question mock interview', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  let practiceUrl = '';
  let applicationId = '';

  await test.step('sign in, add a reviewed resume, an analysed job and an application', async () => {
    await page.goto('/login');
    await registerViaKeycloak(page, testAccount());
    await expect(page.getByRole('heading', { name: 'Welcome, Thanga' })).toBeVisible();
    await addReviewedResume(page, 'Angular Resume', {
      name: 'Angular.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf(RESUME_LINES),
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

  await test.step('open interview preparation and review the focus', async () => {
    await page.getByRole('link', { name: 'Interview preparation' }).click();
    await expect(page.getByRole('heading', { name: 'Interview preparation' })).toBeVisible();
    await expect(page.getByText('Angular Resume v1')).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Strengths to discuss' }).getByText('Angular'),
    ).toBeVisible();
    await expect(page.getByRole('list', { name: 'Gaps' }).getByText('Docker')).toBeVisible();
  });

  await test.step('technical practice: answer a question and get feedback', async () => {
    await page.getByLabel('Interview type').selectOption('TECHNICAL');
    await page.getByRole('button', { name: 'Start preparation' }).click();
    await expect(page.getByRole('heading', { name: 'Technical practice' })).toBeVisible();
    practiceUrl = page.url();
    await expect(page.getByText(/^Question 1 of 10 · 0 answered$/)).toBeVisible();
    await page.getByLabel('Your answer').fill(ANSWER);
    await page.getByRole('button', { name: 'Evaluate answer' }).click();
    const feedback = page.getByLabel('Answer feedback');
    await expect(feedback.getByText(/^Score: [\d.]+\/10$/)).toBeVisible();
    await expect(feedback.getByText(/practice feedback/i).first()).toBeVisible();
    await expect(page.getByText(/Question 1 of 10 · 1 answered/)).toBeVisible();
    // The answer is shown exactly as written.
    await expect(
      page
        .getByText('At Acme Technologies I built reusable Angular components for our dashboards.', {
          exact: false,
        })
        .first(),
    ).toBeVisible();
  });

  await test.step('mock interview: 10 questions, one at a time, feedback only at the end', async () => {
    await page.getByRole('link', { name: 'Interview preparation' }).click();
    await page.getByRole('button', { name: 'Start mock interview' }).click();
    await expect(page.getByRole('heading', { name: 'Mock interview' })).toBeVisible();
    for (let i = 1; i <= 10; i++) {
      await expect(page.getByText(`Question ${i} / 10`)).toBeVisible();
      await expect(page.getByLabel('Answer feedback')).toHaveCount(0);
      await page.getByLabel('Answer', { exact: true }).fill(`${ANSWER}\n(Answer ${i})`);
      await page.getByRole('button', { name: 'Submit answer' }).click();
    }
    await expect(page.getByText('All 10 questions answered')).toBeVisible();
    await page.getByRole('button', { name: 'Finish interview' }).click();
    await expect(page.getByText(/^\d+ \/ 100$/)).toBeVisible();
    await expect(page.getByText('10 of 10 questions answered')).toBeVisible();
    await expect(page.getByText(/not scientific measurements or a prediction/)).toBeVisible();
  });

  await test.step('the report persists after a refresh; the session is read-only', async () => {
    const score = await page.getByText(/^\d+ \/ 100$/).textContent();
    await page.reload();
    await expect(page.getByText(score!)).toBeVisible();
    await expect(page.getByText('Completed — this session is read-only')).toBeVisible();
    await expect(page.getByLabel('Answer feedback')).toBeVisible(); // per-question feedback now revealed
  });

  await test.step('history lists both sessions; the earlier one opens with its answer and feedback', async () => {
    await page.getByRole('link', { name: 'Interview', exact: true }).click();
    const list = page.getByRole('list', { name: 'Interview sessions' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list.getByText(/Mock interview ·/)).toBeVisible();
    await expect(list.getByText(/Technical practice ·/)).toBeVisible();
    await list
      .getByRole('listitem')
      .filter({ hasText: 'Technical practice' })
      .getByRole('link')
      .click();
    await expect(page).toHaveURL(practiceUrl);
    await expect(page.getByLabel('Answer feedback')).toBeVisible();
  });

  await test.step('sessions keep the exact resume version after a new version is uploaded', async () => {
    await page.goto('/resumes');
    await page.getByRole('link', { name: 'Angular Resume', exact: true }).click();
    await page.getByLabel('New resume file').setInputFiles({
      name: 'Angular_v2.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf([
        ...RESUME_LINES,
        '',
        'CERTIFICATIONS',
        'Angular Certified Developer',
      ]),
    });
    await page.getByRole('button', { name: 'Save and make current' }).click();
    await expect(page.getByText('Current version · v2')).toBeVisible();
    await page.goto(practiceUrl);
    await expect(page.getByText(/Angular Resume v1/)).toBeVisible();
  });

  await test.step('another user cannot access the sessions', async () => {
    const sessionId = practiceUrl.split('/').pop()!;
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    try {
      await otherPage.goto('/login');
      await registerViaKeycloak(otherPage, testAccount(), { first: 'Other', last: 'User' });
      await expect(otherPage.getByRole('heading', { name: 'Welcome, Other' })).toBeVisible();
      for (const path of [
        `/interviews/${sessionId}`,
        `/interviews/${sessionId}/report`,
        `/applications/${applicationId}/interviews`,
      ]) {
        expect(await apiStatus(otherPage, path)).toBe(404);
      }
    } finally {
      await other.close();
    }
  });
});
