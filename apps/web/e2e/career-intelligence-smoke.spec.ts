import { expect, type Page, test } from '@playwright/test';
import { addReviewedResume, apiCall, apiJson } from './helpers';
import { registerViaKeycloak, testAccount } from './keycloak';
import { buildResumePdf, RESUME_LINES } from './resume-pdf';

/**
 * Career intelligence against the real stack: outcomes recorded in the UI, the dashboard's
 * funnel and resume performance, the insufficient-data state, patterns and stored insights
 * once there is enough history, and isolation from another user.
 */

const description = (title: string) => `We are looking for a ${title} to build dashboards.

Responsibilities:
- Build reusable Angular components for our dashboards

Requirements:
- 2+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS
- Experience with Docker`;

/** Adds an analysed job and an application (status APPLIED) through the API. */
async function applyTo(page: Page, versionId: string, title: string, company: string) {
  const job = await apiCall<{ id: string }>(page, 'POST', '/jobs', {
    title,
    companyName: company,
    description: description(title),
  });
  expect(job.status).toBe(201);
  expect((await apiCall(page, 'POST', `/jobs/${job.body.id}/analyze`)).status).toBe(202);
  await expect
    .poll(
      async () =>
        (await apiJson<{ analysisStatus: string }>(page, `/jobs/${job.body.id}`)).analysisStatus,
      {
        timeout: 30_000,
      },
    )
    .toBe('COMPLETED');
  const app = await apiCall<{ id: string }>(page, 'POST', '/applications', {
    jobId: job.body.id,
    resumeVersionId: versionId,
    status: 'APPLIED',
    source: 'LinkedIn',
  });
  expect(app.status).toBe(201);
  return app.body.id;
}

const move = async (page: Page, id: string, status: string) =>
  expect((await apiCall(page, 'POST', `/applications/${id}/status`, { status })).status).toBe(200);

test('record outcomes, then review analytics and evidence-based insights', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  // Any uncaught exception or console error on the page fails the test at the end.
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
  });
  let versionId = '';
  const ids: string[] = [];

  await test.step('sign in and add a reviewed resume', async () => {
    await page.goto('/login');
    await registerViaKeycloak(page, testAccount());
    await expect(page.getByRole('heading', { name: 'Welcome, Thanga' })).toBeVisible();
    await addReviewedResume(page, 'Angular Resume', {
      name: 'Angular.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf(RESUME_LINES),
    });
    const resumes = await apiJson<{ currentVersion: { id: string } }[]>(
      page,
      '/resumes?status=ACTIVE',
    );
    versionId = resumes[0]!.currentVersion.id;
  });

  await test.step('track three applications', async () => {
    for (const company of ['Northwind', 'Contoso', 'Fabrikam'])
      ids.push(await applyTo(page, versionId, 'Angular Developer', company));
  });

  await test.step('record outcomes in the application page', async () => {
    await page.goto(`/applications/${ids[0]}`);
    const status = page.getByRole('region', { name: 'Status' });
    await status.getByLabel('Change to').selectOption('TECHNICAL_INTERVIEW');
    await status.getByRole('button', { name: 'Update status' }).click();
    await expect(status.getByText('Technical Interview', { exact: true })).toBeVisible();
    await status.getByLabel('Change to').selectOption('OFFER');
    await status.getByLabel('Offer details (optional)').fill('Offer received by email.');
    await status.getByRole('button', { name: 'Update status' }).click();
    await expect(status.getByText('Offer details: Offer received by email.')).toBeVisible();

    await page.goto(`/applications/${ids[1]}`);
    const status2 = page.getByRole('region', { name: 'Status' });
    await status2.getByLabel('Change to').selectOption('REJECTED');
    await status2.getByLabel('Category (optional)').selectOption('EXPERIENCE_LEVEL');
    await status2.getByRole('button', { name: 'Update status' }).click();
    await expect(status2.getByText('Rejection category: Experience level')).toBeVisible();
  });

  await test.step('the dashboard shows the funnel, resume performance and the data limitation', async () => {
    await page.getByRole('link', { name: 'Career Intelligence', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Career Intelligence', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Data limitations' })
        .getByText(/You have 3 submitted applications\. At least 10/),
    ).toBeVisible();
    const funnel = page.getByRole('list', { name: 'Application funnel' });
    await expect(funnel.getByLabel('Applied: 3. 100% of tracked.')).toBeVisible();
    await expect(funnel.getByLabel(/^Interview: 1\./)).toBeVisible();
    await expect(funnel.getByLabel(/^Offer: 1\./)).toBeVisible();
    const resumes = page.getByRole('region', { name: 'Resume performance' });
    const row = resumes.getByRole('row', { name: /Angular Resume/ });
    await expect(row.getByRole('cell').nth(2)).toHaveText('3'); // applications
    await expect(row.getByText('Limited data')).toBeVisible();
    await expect(page.getByText('Rejections: Experience level (1)')).toBeVisible();
    // Insufficient data: insights explain it instead of comparing groups.
    const insights = page.getByRole('list', { name: 'Career insights' });
    await expect(
      insights.getByRole('heading', { name: 'Record outcomes to unlock patterns' }),
    ).toBeVisible({
      timeout: 30_000,
    });
    // Skill patterns come from target jobs (no outcomes needed); outcome comparisons don't appear yet.
    const patterns = page.getByRole('list', { name: 'Patterns' });
    await expect(
      patterns.getByText(
        /Docker appears in 3 of your 3 analysed target jobs; your best-matching resume showed limited evidence/,
      ),
    ).toBeVisible();
    await expect(patterns.getByText(/Strongest observed/)).toHaveCount(0);
  });

  await test.step('with enough history, patterns and insights appear with their evidence', async () => {
    // Angular roles: 3 more (6 in total, 2 already with a response). React roles: 6, one interview.
    for (const company of ['Litware', 'Proseware', 'Woodgrove']) {
      const id = await applyTo(page, versionId, 'Angular Developer', company);
      await move(page, id, 'INTERVIEW');
    }
    for (const company of ['Tailspin', 'Coho', 'Alpine', 'Adatum', 'Lucerne', 'Margie']) {
      const id = await applyTo(page, versionId, 'React Developer', company);
      if (company === 'Tailspin') await move(page, id, 'INTERVIEW');
    }
    await page.reload();
    const patterns = page.getByRole('list', { name: 'Patterns' });
    await expect(patterns.getByText('Strongest observed role: Angular Developer')).toBeVisible();
    await expect(
      patterns.getByText(
        /Angular Developer had a 67% interview rate across 6 applications, compared with 17% across 6/,
      ),
    ).toBeVisible();
    const card = page
      .getByRole('list', { name: 'Career insights' })
      .getByRole('listitem')
      .filter({ hasText: 'A role type with stronger response' });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByText(/^Evidence/).click();
    await expect(card.getByRole('list', { name: 'Evidence' })).toContainText(
      'Angular Developer had a 67%',
    );
    await expect(page.getByText(/They are not predictions/)).toBeVisible();

    // Refresh on demand: progress, then success feedback.
    await page.getByRole('button', { name: 'Refresh insights' }).click();
    await expect(page.getByText('Insights updated.')).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: 'A role type with stronger response' }),
    ).toBeVisible();
  });

  await test.step('the dashboard is usable on tablet and mobile widths', async () => {
    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      await page.reload();
      await expect(page.getByRole('region', { name: 'Overview' })).toBeVisible();
      for (const name of [
        /Application funnel/,
        /Career insights/,
        /Resume performance/,
        /Skill intelligence/,
      ])
        await expect(page.getByRole('region', { name })).toBeVisible();
      // No horizontal page scroll: wide tables scroll inside their own container.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  await test.step('the old match score is kept when the job changes', async () => {
    const before = await apiJson<{ matchScoreAtCreation: number; jobId: string }>(
      page,
      `/applications/${ids[2]}`,
    );
    await apiCall(page, 'PATCH', `/jobs/${before.jobId}`, {
      description: `${description('Angular Developer')}\n- Strong experience with Kubernetes, Go and Terraform`,
    });
    await apiCall(page, 'POST', `/jobs/${before.jobId}/analyze`);
    await expect
      .poll(
        async () =>
          (await apiJson<{ analysisStatus: string }>(page, `/jobs/${before.jobId}`)).analysisStatus,
      )
      .toBe('COMPLETED');
    const after = await apiJson<{ matchScoreAtCreation: number }>(page, `/applications/${ids[2]}`);
    expect(after.matchScoreAtCreation).toBe(before.matchScoreAtCreation);
  });

  await test.step('another user sees only their own (empty) analytics', async () => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    try {
      await otherPage.goto('/login');
      await registerViaKeycloak(otherPage, testAccount(), { first: 'Other', last: 'User' });
      await expect(otherPage.getByRole('heading', { name: 'Welcome, Other' })).toBeVisible();
      const report = await apiJson<{ totals: { tracked: number; submitted: number } }>(
        otherPage,
        '/career-intelligence/overview',
      );
      expect(report.totals).toMatchObject({ tracked: 0, submitted: 0 });
      const insights = await apiJson<{ insights: unknown[]; run: unknown }>(
        otherPage,
        '/career-intelligence/insights',
      );
      expect(insights).toMatchObject({ insights: [], run: null });
      await otherPage.goto('/career-intelligence');
      await expect(otherPage.getByText('Nothing to analyse yet')).toBeVisible();
    } finally {
      await other.close();
    }
  });

  await test.step('no uncaught errors or console errors on the page', async () => {
    expect(pageErrors).toEqual([]);
  });
});
