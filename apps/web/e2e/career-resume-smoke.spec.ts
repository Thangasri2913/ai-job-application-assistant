import { expect, type Page, test } from '@playwright/test';
import { registerViaKeycloak, testAccount } from './keycloak';
import { buildResumeDocx } from './resume-docx';
import { buildResumePdf, RESUME_LINES } from './resume-pdf';

/**
 * Career profile + resume library smoke test against the real stack:
 * Keycloak → React → NestJS → PostgreSQL + S3. Two throwaway Keycloak users.
 */

const RESUME_A_LINES = [RESUME_LINES[0]!, 'Angular Developer', ...RESUME_LINES.slice(1)];
const RESUME_B_LINES = [
  'Thanga Sri',
  'React Developer',
  'thanga.sri@example.com | +91 98765 43210 | Chennai, India',
  '',
  'SUMMARY',
  'Frontend developer building React and TypeScript applications.',
  '',
  'SKILLS',
  'Frontend: React, TypeScript',
  'Backend: Node.js',
  '',
  'EXPERIENCE',
  'Frontend Developer | Acme Technologies | Chennai, India',
  'Jul 2023 - Present',
  '- Built React dashboards',
];

const card = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ has: page.getByRole('link', { name, exact: true }) });

/** Status code of an API call made with the signed-in user's own access token. */
async function apiStatus(page: Page, path: string): Promise<number> {
  return page.evaluate(async (p) => {
    const key = Object.keys(sessionStorage).find((k) => k.startsWith('oidc.user:'));
    const token = key
      ? (JSON.parse(sessionStorage.getItem(key)!) as { access_token: string }).access_token
      : '';
    const res = await fetch(`/api/v1${p}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.status;
  }, path);
}

test('career profile and multiple resumes, end to end', async ({ page, browser, request }) => {
  test.setTimeout(180_000);
  let resumeAId = '';

  await test.step('1–4. infrastructure, Keycloak and API are up', async () => {
    const health = await request.get('http://localhost:3000/api/v1/health/ready');
    expect(health.ok()).toBe(true);
    expect((await health.json()).info).toMatchObject({
      database: { status: 'up' },
      storage: { status: 'up' },
      identityProvider: { status: 'up' },
    });
  });

  await test.step('5. sign in (new Keycloak account)', async () => {
    await page.goto('/login');
    await registerViaKeycloak(page, testAccount());
    await expect(page.getByRole('heading', { name: 'Welcome, Thanga' })).toBeVisible();
  });

  await test.step('6–7. open the career profile and save it', async () => {
    await page.getByRole('link', { name: 'Career Profile', exact: true }).click();
    await page.getByLabel(/^Professional headline/).fill('Frontend Developer · Angular & React');
    await page.getByLabel(/^Phone/).fill('+91 98765 43210');
    await page.getByLabel(/^Location/).fill('Chennai');
    await page.getByLabel(/^Country/).fill('India');
    await page.getByLabel(/Years of experience/).fill('3.3');
    await page.getByLabel('Remote').check();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/^Professional headline/)).toHaveValue(
      'Frontend Developer · Angular & React',
    );
  });

  await test.step('8. add an experience', async () => {
    await page.getByRole('tab', { name: 'Experience' }).click();
    await page.getByRole('button', { name: 'Add experience' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Job title/).fill('Frontend Developer');
    await dialog.getByLabel(/^Company/).fill('Acme Technologies');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Acme Technologies').first()).toBeVisible();
  });

  await test.step('9. add skills', async () => {
    await page.getByRole('tab', { name: 'Skills' }).click();
    for (const skill of ['Angular', 'TypeScript']) {
      await page.getByLabel('Skill name').fill(skill);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByRole('button', { name: `Remove ${skill}` })).toBeVisible();
    }
  });

  await test.step('10–11. upload Resume A (PDF) and wait for parsing', async () => {
    await page.getByRole('link', { name: 'Resumes' }).click();
    await page.getByRole('button', { name: 'Add resume' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Resume file').setInputFiles({
      name: 'Angular_Resume.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf(RESUME_A_LINES),
    });
    await dialog.getByLabel(/Resume name/).fill('Angular Developer');
    await dialog.getByLabel(/Category/).fill('Frontend');
    await dialog.getByRole('button', { name: 'Upload' }).click();
    await expect(dialog.getByText('Resume processed.')).toBeVisible();
    await dialog.getByRole('link', { name: 'Review information' }).click();
  });

  await test.step('12–13. review the extracted information and confirm it', async () => {
    await expect(page.getByText('Extracted automatically — please review.')).toBeVisible();
    await expect(page.getByLabel(/^Name/).first()).toHaveValue('Thanga Sri');
    // Headline taken verbatim from the line under the name.
    await expect(page.getByLabel(/^Headline/)).toHaveValue('Angular Developer');
    await page.getByRole('button', { name: 'Save and make current' }).click();
    await expect(page.getByText('Current version · v1')).toBeVisible();
    await expect(page.getByText('Confirmed by you').first()).toBeVisible();
    await expect(page.getByText('Extracted from file').first()).toBeVisible();
    resumeAId = new URL(page.url()).pathname.split('/')[2]!;
  });

  await test.step('14–15. create Resume B by uploading a DOCX', async () => {
    await page.getByRole('link', { name: 'All resumes' }).click();
    await page.getByRole('button', { name: 'Add resume' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Resume file').setInputFiles({
      name: 'React_Resume.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: buildResumeDocx(RESUME_B_LINES),
    });
    await dialog.getByLabel(/Resume name/).fill('React Developer');
    await dialog.getByLabel(/Category/).fill('Frontend');
    await dialog.getByRole('button', { name: 'Upload' }).click();
    await expect(dialog.getByText('Resume processed.')).toBeVisible();
    await dialog.getByRole('link', { name: 'Review information' }).click();
    await expect(page.getByLabel(/^Headline/)).toHaveValue('React Developer');
    await page.getByRole('button', { name: 'Save and make current' }).click();
    await expect(page.getByText('Current version · v1')).toBeVisible();
  });

  await test.step('16. both resumes appear in the library', async () => {
    await page.getByRole('link', { name: 'All resumes' }).click();
    await expect(card(page, 'Angular Developer')).toBeVisible();
    await expect(card(page, 'React Developer')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search resumes' }).fill('react');
    await expect(card(page, 'Angular Developer')).toBeHidden();
    await expect(card(page, 'React Developer')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search resumes' }).fill('');
    await expect(card(page, 'Angular Developer')).toBeVisible();
  });

  await test.step('17–18. set Resume B as default; Resume A is no longer default', async () => {
    await card(page, 'Angular Developer').getByRole('button', { name: 'Set as default' }).click();
    await expect(
      card(page, 'Angular Developer').getByText('Default', { exact: true }),
    ).toBeVisible();
    await card(page, 'React Developer').getByRole('button', { name: 'Set as default' }).click();
    await expect(card(page, 'React Developer').getByText('Default', { exact: true })).toBeVisible();
    await expect(
      card(page, 'Angular Developer').getByText('Default', { exact: true }),
    ).toBeHidden();
    await expect(
      card(page, 'Angular Developer').getByRole('button', { name: 'Set as default' }),
    ).toBeVisible();
  });

  await test.step('19–20. create a new version of Resume A and check the history', async () => {
    await page.getByRole('link', { name: 'Angular Developer', exact: true }).click();
    await page.getByLabel('New resume file').setInputFiles({
      name: 'Angular_Resume_v2.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf([
        ...RESUME_A_LINES,
        '',
        'CERTIFICATIONS',
        'Angular Certified Developer',
      ]),
    });
    // A new file opens its draft for review straight away.
    await expect(
      page.getByRole('heading', { name: 'Review Angular Developer · v2' }),
    ).toBeVisible();
    await expect(page.getByText('Extracted automatically — please review.')).toBeVisible();
    await page.getByRole('button', { name: 'Save and make current' }).click();
    await expect(page.getByText('Current version · v2')).toBeVisible();
    const history = page.locator('section', {
      has: page.getByRole('heading', { name: 'Version history' }),
    });
    await expect(history.getByText('v2', { exact: true })).toBeVisible();
    await expect(history.getByText('v1', { exact: true })).toBeVisible();
    await expect(history.getByText('Current', { exact: true })).toBeVisible();
    await expect(history.getByText('Superseded', { exact: true })).toBeVisible();
  });

  await test.step('21–22. archive Resume A; it leaves the active library', async () => {
    await page.getByRole('link', { name: 'All resumes' }).click();
    await card(page, 'Angular Developer').getByRole('button', { name: 'Archive' }).click();
    await expect(card(page, 'Angular Developer')).toBeHidden();
    await expect(card(page, 'React Developer')).toBeVisible();
  });

  await test.step('23–24. restore Resume A; it returns', async () => {
    await page.getByRole('tab', { name: 'Archived' }).click();
    await card(page, 'Angular Developer').getByRole('button', { name: 'Restore' }).click();
    await expect(card(page, 'Angular Developer')).toBeHidden();
    await page.getByRole('tab', { name: 'Active' }).click();
    await expect(card(page, 'Angular Developer')).toBeVisible();
    // Restoring does not take the default back: Resume B stays the default.
    await expect(card(page, 'React Developer').getByText('Default', { exact: true })).toBeVisible();
  });

  await test.step('dashboard shows the real numbers', async () => {
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByText('Active resumes · 2 total')).toBeVisible();
    await expect(page.getByRole('link', { name: /React Developer.*Default resume/ })).toBeVisible();
  });

  await test.step('25. another user cannot access this user’s resume', async () => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    try {
      await otherPage.goto('/login');
      await registerViaKeycloak(otherPage, testAccount(), { first: 'Other', last: 'User' });
      await expect(otherPage.getByRole('heading', { name: 'Welcome, Other' })).toBeVisible();

      expect(await apiStatus(otherPage, `/resumes/${resumeAId}`)).toBe(404);
      expect(await apiStatus(otherPage, `/resumes/${resumeAId}/versions`)).toBe(404);
      await otherPage.goto(`/resumes/${resumeAId}`);
      await expect(otherPage.getByText('Couldn’t load this')).toBeVisible();
      await otherPage.goto('/resumes');
      await expect(otherPage.getByText('You don’t have any resumes yet.')).toBeVisible();
      // …while the owner still sees it.
      expect(await apiStatus(page, `/resumes/${resumeAId}`)).toBe(200);
    } finally {
      await other.close();
    }
  });
});
