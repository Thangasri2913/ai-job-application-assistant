import { expect, test } from '@playwright/test';
import { addReviewedResume, apiCall } from './helpers';
import { registerViaKeycloak, testAccount } from './keycloak';
import { buildResumePdf, RESUME_LINES } from './resume-pdf';

/**
 * Smart Apply against the real stack: prepare → missing answer → review → handoff to the
 * official site → user-reported submission. No integration exists, so nothing is submitted
 * by the app (and nothing leaves the local machine).
 */
const JOB = `We are looking for a Frontend Developer to build our SaaS analytics dashboards.

Requirements:
- 2+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS`;

test('prepare an application, answer what is missing, then submit it yourself', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const status = () => page.getByRole('status', { name: 'Application status' });

  await test.step('sign in, add a reviewed resume and a job', async () => {
    await page.goto('/login');
    await registerViaKeycloak(page, testAccount());
    await addReviewedResume(page, 'Angular Resume', {
      name: 'Angular.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf(RESUME_LINES),
    });
    await page.getByRole('link', { name: 'Jobs', exact: true }).click();
    await page.getByRole('link', { name: 'Add job', exact: true }).click();
    await page.getByLabel('Job title').fill('Frontend Developer');
    await page.getByLabel('Company').fill('Example Corp');
    await page.getByLabel('Job description').fill(JOB);
    await page.getByLabel(/^Job URL/).fill('https://careers.example.com/jobs/42');
    await page.getByRole('button', { name: 'Save and analyse' }).click();
    await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/);
  });

  let smartId = '';
  await test.step('prepare the application (nothing is submitted)', async () => {
    await page.getByRole('button', { name: 'Prepare application' }).click();
    await expect(page).toHaveURL(/\/smart-apply\/[0-9a-f-]{36}$/);
    smartId = new URL(page.url()).pathname.split('/')[2]!;
    await expect(status()).toContainText('AI-prepared · awaiting your review', { timeout: 60_000 });
    await expect(page.getByText('You submit this application on the official site')).toBeVisible();
  });

  await test.step('a required question is asked, answered and confirmed', async () => {
    const detail = await apiCall<{ applicationId: string }>(
      page,
      'GET',
      `/smart-apply/applications/${smartId}`,
    );
    await apiCall(page, 'POST', `/applications/${detail.body.applicationId}/questions`, {
      question: 'How did you hear about this job?',
    });
    await apiCall(page, 'POST', `/smart-apply/applications/${smartId}/resume`);
    await page.reload();
    await expect(status()).toContainText('Needs your answers', { timeout: 60_000 });
    const form = page.getByRole('form', { name: 'How did you hear about this job?' });
    await form.getByLabel('Answer', { exact: true }).fill('Company website');
    await form.getByRole('button', { name: 'Confirm answer' }).click();
    await expect(status()).toContainText('AI-prepared · awaiting your review');
  });

  await test.step('approve, open the official page and report the submission', async () => {
    await page.getByRole('button', { name: 'Approve application' }).click();
    await expect(status()).toContainText('Submit on the official site');
    await expect(
      page.getByRole('link', { name: /Open the official application page/ }),
    ).toHaveAttribute('href', 'https://careers.example.com/jobs/42');
    const mark = page.getByRole('button', { name: 'Mark as submitted' });
    await expect(mark).toBeDisabled();
    await page.getByLabel('I submitted this application myself on the official site').check();
    await mark.click();
    await expect(status()).toContainText('Submitted · reported by you');
    await expect(page.getByText('Reported by you (not verified)', { exact: false })).toBeVisible();
  });

  await test.step('the application tracker shows it as applied', async () => {
    const detail = await apiCall<{ trackerStatus: string; confirmation: string }>(
      page,
      'GET',
      `/smart-apply/applications/${smartId}`,
    );
    expect(detail.body).toMatchObject({ trackerStatus: 'APPLIED', confirmation: 'USER_REPORTED' });
  });
});
