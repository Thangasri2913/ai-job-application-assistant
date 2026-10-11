import { expect, test } from '@playwright/test';
import { addReviewedResume, apiJson, apiStatus } from './helpers';
import { registerViaKeycloak, testAccount } from './keycloak';
import { buildResumePdf, RESUME_LINES } from './resume-pdf';

/**
 * Job alerts against the real stack with the development job source (JOB_SOURCES=dev):
 * every posting is a labelled sample, never a real listing.
 */

interface Recommendation {
  id: string;
  matchScore: number;
  job: { id: string; title: string; companyName: string };
  resume: { resumeVersionId: string; resumeName: string; versionNumber: number };
}

test('job alert → Run Now → recommendation → application with the recommended version; re-run adds no duplicates', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  let alertsUrl = '';
  let recommendation: Recommendation;
  let count = 0;

  await test.step('sign in and add a reviewed resume', async () => {
    await page.goto('/login');
    await registerViaKeycloak(page, testAccount());
    await expect(page.getByRole('heading', { name: 'Welcome, Thanga' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'New recommendations' }).getByText('No new recommendations'),
    ).toBeVisible();
    await addReviewedResume(page, 'Angular Resume', {
      name: 'Angular.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf(RESUME_LINES),
    });
  });

  await test.step('create an alert: Frontend Developer, Bangalore, 75%, daily', async () => {
    await page.getByRole('link', { name: 'Job Alerts', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Job alerts', exact: true })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('Development mode');
    await page.getByRole('button', { name: 'New alert' }).click();
    const dialog = page.getByRole('dialog', { name: 'New job alert' });
    await dialog.getByLabel('Alert name').fill('Frontend Developer in Bangalore');
    await dialog.getByLabel('Keywords').fill('Frontend Developer');
    await dialog.getByLabel('Keywords').press('Enter');
    await dialog.getByLabel(/Locations/).fill('Bangalore');
    await dialog.getByLabel(/Locations/).press('Enter');
    await dialog.getByLabel('Minimum match score (%)').fill('75');
    await expect(dialog.getByLabel('Schedule')).toHaveValue('DAILY');
    await dialog.getByRole('button', { name: 'Create alert' }).click();
    await expect(dialog).toBeHidden();
    const card = page.getByRole('list', { name: 'Job alerts' }).getByRole('listitem').first();
    await expect(card.getByText('Frontend Developer in Bangalore')).toBeVisible();
    await expect(card.getByText(/Every day at 08:00/)).toBeVisible();
    alertsUrl = page.url();
  });

  await test.step('Run Now finds and recommends jobs', async () => {
    const card = page.getByRole('list', { name: 'Job alerts' }).getByRole('listitem').first();
    await card.getByRole('button', { name: 'Run now' }).click();
    await expect(card.getByText('Completed')).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText(/^[1-9]\d* new recommendations?$/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Notifications, 1 unread/ })).toBeVisible({
      timeout: 70_000,
    });
  });

  await test.step('recommendations are listed with explanations and a sample-data label', async () => {
    await page.getByRole('link', { name: 'Recommendations', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Recommended jobs', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('note')).toContainText('not a real job board');
    const list = page.getByRole('list', { name: 'Recommended jobs' });
    const items = await apiJson<Recommendation[]>(page, '/recommendations');
    count = items.length;
    expect(count).toBeGreaterThan(0);
    for (const r of items) expect(r.matchScore).toBeGreaterThanOrEqual(75);
    recommendation = items[0]!;
    const card = list
      .getByRole('listitem')
      .filter({ hasText: recommendation.job.companyName })
      .first();
    await expect(card.getByText('Sample data')).toBeVisible();
    await expect(card.getByText(/match \(\d+%\) with “Angular Resume” v1/)).toBeVisible();
    await expect(card.getByText(/Recommended resume:/)).toBeVisible();
    await card.getByRole('link', { name: 'View job' }).click();
  });

  await test.step('the job details show the match analysis and the recommended resume', async () => {
    await expect(
      page.getByRole('heading', { name: recommendation.job.title, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('note').first()).toContainText('Development mode');
    const why = page.getByRole('region', { name: 'Why this job was recommended' });
    await expect(why.getByText(/not a prediction of being hired/)).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Match overview' }).getByText(/%/).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Recommended resume' }).getByText('Angular Resume'),
    ).toBeVisible();
    await why.getByRole('button', { name: 'Save job' }).click();
    await expect(why.getByText('Saved to your jobs.')).toBeVisible();
  });

  await test.step('create the application with the recommended version preselected', async () => {
    const panel = page.getByRole('region', { name: 'Application' });
    await panel.getByRole('button', { name: 'Track application' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio', { name: /Angular Resume/ })).toBeChecked();
    await dialog.getByRole('button', { name: 'Create application' }).click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}$/);
    const applicationId = new URL(page.url()).pathname.split('/')[2]!;
    await expect(page.getByRole('region', { name: 'Resume' }).getByText('Version 1')).toBeVisible();
    const application = await apiJson<{ resume: { resumeVersionId: string } }>(
      page,
      `/applications/${applicationId}`,
    );
    expect(application.resume.resumeVersionId).toBe(recommendation.resume.resumeVersionId);
    const after = await apiJson<{ status: string }>(page, `/recommendations/${recommendation.id}`);
    expect(after.status).toBe('APPLIED');
  });

  await test.step('Run Now again creates no duplicate jobs, recommendations or notifications', async () => {
    const jobsBefore = (await apiJson<unknown[]>(page, '/jobs?status=ALL')).length;
    await page.goto(alertsUrl);
    const card = page.getByRole('list', { name: 'Job alerts' }).getByRole('listitem').first();
    await card.getByRole('button', { name: 'Run now' }).click();
    await expect(card.getByText('0 new recommendations')).toBeVisible({ timeout: 60_000 });
    await card.getByRole('link', { name: 'Run history' }).click();
    const runs = page.getByRole('list', { name: 'Search runs' }).locator(':scope > li');
    await expect(runs).toHaveCount(2);
    expect((await apiJson<unknown[]>(page, '/recommendations?status=ALL')).length).toBe(count);
    expect((await apiJson<unknown[]>(page, '/jobs?status=ALL')).length).toBe(jobsBefore);
    const notes = await apiJson<{ items: unknown[] }>(page, '/notifications');
    expect(notes.items).toHaveLength(1);
  });

  await test.step('another user cannot access the alert or recommendation', async () => {
    const alertId = (await apiJson<{ id: string }[]>(page, '/job-alerts'))[0]!.id;
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    try {
      await otherPage.goto('/login');
      await registerViaKeycloak(otherPage, testAccount(), { first: 'Other', last: 'User' });
      await expect(otherPage.getByRole('heading', { name: 'Welcome, Other' })).toBeVisible();
      for (const path of [
        `/job-alerts/${alertId}`,
        `/job-alerts/${alertId}/runs`,
        `/recommendations/${recommendation.id}`,
        `/jobs/${recommendation.job.id}`,
      ]) {
        expect(await apiStatus(otherPage, path)).toBe(404);
      }
    } finally {
      await other.close();
    }
  });
});
