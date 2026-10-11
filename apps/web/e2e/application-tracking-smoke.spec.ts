import { expect, test } from '@playwright/test';
import { addReviewedResume, apiStatus } from './helpers';
import { registerViaKeycloak, testAccount } from './keycloak';
import { buildResumeDocx } from './resume-docx';
import { buildResumePdf, RESUME_LINES } from './resume-pdf';

/**
 * Application tracking against the real stack: job → recommendation → track application
 * with an exact resume version → status changes, note, document → timeline → a new resume
 * version doesn't change the application. Two throwaway Keycloak users.
 */

const REACT_RESUME_LINES = [
  'Thanga Sri',
  'React Developer',
  'thanga.sri@example.com',
  '',
  'SKILLS',
  'Frontend: React, TypeScript',
  '',
  'EXPERIENCE',
  'React Developer | Beta Labs | Chennai, India',
  'Jan 2023 - Present',
  '- Built React pages',
];

const JOB = `We are looking for a Frontend Developer to build SaaS dashboards.

Responsibilities:
- Build and maintain frontend applications in Angular
- Integrate REST APIs

Requirements:
- 2+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS`;

test('track an application with the exact resume version and follow it through the pipeline', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  let applicationId = '';
  const statusCard = () => page.getByRole('region', { name: 'Status' });
  const timeline = () => page.getByRole('list', { name: 'Application timeline' });

  await test.step('sign in, add two reviewed resumes and an analysed job', async () => {
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
    await page.getByRole('link', { name: 'Jobs', exact: true }).click();
    await page.getByRole('link', { name: 'Add job', exact: true }).click();
    await page.getByLabel('Job title').fill('Frontend Developer');
    await page.getByLabel('Company').fill('ABC Technologies');
    await page.getByLabel('Job description').fill(JOB);
    await page.getByRole('button', { name: 'Save and analyse' }).click();
    await expect(
      page.getByRole('region', { name: 'Recommended resume' }).getByText('Angular Resume'),
    ).toBeVisible();
  });

  await test.step('create the application with the recommended version preselected', async () => {
    const panel = page.getByRole('region', { name: 'Application' });
    await expect(panel.getByText(/No application yet/)).toBeVisible();
    await panel.getByRole('button', { name: 'Track application' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio', { name: /Angular Resume/ })).toBeChecked();
    await expect(dialog.getByText('AI recommended')).toBeVisible();
    await dialog.getByLabel(/^Application source/).fill('Company website');
    await dialog.getByLabel(/^Notes/).fill('Found through the careers page.');
    await dialog.getByRole('button', { name: 'Create application' }).click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}$/);
    applicationId = new URL(page.url()).pathname.split('/')[2]!;
    const resume = page.getByRole('region', { name: 'Resume' });
    await expect(resume.getByRole('link', { name: 'Angular Resume' })).toBeVisible();
    await expect(resume.getByText('Version 1')).toBeVisible();
    await expect(statusCard().getByText('Saved')).toBeVisible();
  });

  await test.step('change status to Applied, add a note and a cover letter, then Interview', async () => {
    await statusCard().getByLabel('Change to').selectOption('APPLIED');
    await statusCard()
      .getByLabel(/Note for the timeline/)
      .fill('Submitted through company website');
    await statusCard().getByRole('button', { name: 'Update status' }).click();
    await expect(statusCard().getByText('Applied', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Important dates' }).getByText('Not yet'),
    ).toHaveCount(0);

    await page.getByLabel('New note').fill('Recruiter contacted me on LinkedIn.');
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(
      page.getByRole('list', { name: 'Notes' }).getByText('Recruiter contacted me on LinkedIn.'),
    ).toBeVisible();

    const docs = page.getByRole('region', { name: 'Documents' });
    await docs.getByLabel('Name (optional)').fill('Cover letter for ABC');
    await docs.getByLabel('Document file').setInputFiles({
      name: 'cover.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf(['Dear hiring team,', 'I am excited to apply.']),
    });
    await expect(docs.getByText('Cover letter for ABC')).toBeVisible();

    await statusCard().getByLabel('Change to').selectOption('INTERVIEW');
    await statusCard()
      .getByLabel(/Note for the timeline/)
      .fill('First technical interview scheduled');
    await statusCard().getByRole('button', { name: 'Update status' }).click();
    await expect(statusCard().getByText('Interview', { exact: true })).toBeVisible();
  });

  await test.step('the timeline shows every event, newest first', async () => {
    const items = timeline().getByRole('listitem');
    await expect(items).toHaveCount(6);
    await expect(items.nth(0)).toContainText('Interview');
    await expect(items.nth(0)).toContainText('First technical interview scheduled');
    await expect(items.nth(1)).toContainText('Cover letter added');
    await expect(items.nth(2)).toContainText('Recruiter contacted me on LinkedIn.');
    await expect(items.nth(3)).toContainText('Submitted through company website');
    await expect(items.nth(4)).toContainText('Found through the careers page.');
    await expect(items.nth(5)).toContainText('Application created · Saved');
    await expect(items.nth(5)).toContainText('Angular Resume v1 selected');
    await expect(
      page.getByRole('region', { name: 'Important dates' }).getByText('First interview stage'),
    ).toBeVisible();
  });

  await test.step('a new resume version does not change the application', async () => {
    await page
      .getByRole('region', { name: 'Resume' })
      .getByRole('link', { name: 'Angular Resume' })
      .click();
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
    await expect(page.getByRole('heading', { name: 'Review Angular Resume · v2' })).toBeVisible();
    await page.getByRole('button', { name: 'Save and make current' }).click();
    await expect(page.getByText('Current version · v2')).toBeVisible();

    await page.goto(`/applications/${applicationId}`);
    const resume = page.getByRole('region', { name: 'Resume' });
    await expect(resume.getByText('Version 1', { exact: true })).toBeVisible();
    await expect(resume.getByText('Newer version exists')).toBeVisible();
    await expect(resume.getByText(/this application still uses version 1/)).toBeVisible();
  });

  await test.step('the list and the dashboard show the real pipeline', async () => {
    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: 'Frontend Developer' });
    await expect(row.getByText('ABC Technologies')).toBeVisible();
    await expect(row.getByText('Angular Resume')).toBeVisible();
    await expect(row.getByText('v1')).toBeVisible();
    await expect(row.getByText('Interview')).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(
      page.getByRole('list', { name: 'Pipeline stages' }).getByLabel('1 applications'),
    ).toBeVisible();
    await expect(page.getByText(/1 active application/)).toBeVisible();
  });

  await test.step('another user cannot access the application', async () => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    try {
      await otherPage.goto('/login');
      await registerViaKeycloak(otherPage, testAccount(), { first: 'Other', last: 'User' });
      await expect(otherPage.getByRole('heading', { name: 'Welcome, Other' })).toBeVisible();
      for (const path of [
        `/applications/${applicationId}`,
        `/applications/${applicationId}/timeline`,
        `/applications/${applicationId}/documents`,
        `/applications/${applicationId}/notes`,
      ]) {
        expect(await apiStatus(otherPage, path)).toBe(404);
      }
      await otherPage.goto(`/applications/${applicationId}`);
      await expect(otherPage.getByText('Couldn’t load this')).toBeVisible();
      expect(await apiStatus(page, `/applications/${applicationId}`)).toBe(200);
    } finally {
      await other.close();
    }
  });
});
