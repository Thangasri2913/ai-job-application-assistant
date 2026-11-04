import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk, resume, version } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';
import { recommendation } from '../test/fixtures';

describe('Personalised plan', () => {
  it('builds a plan from a selected resume, shows evidence honestly and applies corrections', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /resumes?status=ACTIVE': {
        body: [resume({ currentVersion: version({ id: 'v-own' }) })],
      },
      'POST /learning/recommendations': { body: recommendation() },
    });
    const user = userEvent.setup();
    renderApp('/learn/plan');

    expect(await screen.findByText(/not sent to an AI service/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target role' }), 'DATA_ANALYST');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Resume' }), 'v-own');
    await user.click(screen.getByRole('button', { name: 'Build my plan' }));

    const sql = within(await screen.findByRole('article', { name: 'SQL' }));
    expect(sql.getByText('Listed only')).toBeInTheDocument();
    expect(sql.getByText('From your resume')).toBeInTheDocument();
    expect(
      within(screen.getByRole('article', { name: 'Python' })).getByText('Unknown'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What the labels mean' })).toBeInTheDocument();
    expect(
      screen.getByText('Inferred from what your resume says. Proficiency is not measured.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Plan ready for Data Analyst: 1 suggested course, 2 skills/),
    ).toBeInTheDocument();
    expect(sql.getByText('Proficiency unknown')).toBeInTheDocument();
    expect(sql.getByText('Low')).toBeInTheDocument();
    expect(sql.getByRole('link', { name: 'Take the SQL diagnostic.' })).toHaveAttribute(
      'href',
      '/learn/courses/sql-fundamentals/diagnostic',
    );
    expect(screen.getByRole('link', { name: 'SQL fundamentals' })).toHaveAttribute(
      'href',
      '/learn/courses/sql-fundamentals',
    );
    expect(screen.getByText('Not derived from job-market statistics.')).toBeInTheDocument();
    expect(screen.getByText(/No analysed jobs match this role yet/)).toBeInTheDocument();

    expect(api.find('POST', '/learning/recommendations')[0]?.body).toEqual({
      role: 'DATA_ANALYST',
      resumeVersionId: 'v-own',
      corrections: [],
    });

    const python = within(screen.getByRole('article', { name: 'Python' }));
    await user.selectOptions(
      python.getByRole('combobox', { name: 'Correct this skill' }),
      'HAS_SKILL',
    );
    await user.click(screen.getByRole('button', { name: 'Update plan with my corrections' }));
    expect(api.find('POST', '/learning/recommendations')[1]?.body).toEqual({
      role: 'DATA_ANALYST',
      resumeVersionId: 'v-own',
      corrections: [{ skillId: 'python', status: 'HAS_SKILL' }],
    });
  });

  it('works without a resume and shows API errors', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /resumes?status=ACTIVE': { body: [] },
      'POST /learning/recommendations': {
        status: 409,
        body: {
          code: 'RESUME_CONTENT_MISSING',
          message: 'This resume version has no reviewed content yet.',
        },
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/plan');
    expect(
      await screen.findByRole('link', { name: 'Upload one in the resume library' }),
    ).toHaveAttribute('href', '/resumes');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target role' }), 'QA_TESTER');
    await user.click(screen.getByRole('button', { name: 'Build my plan' }));
    expect(
      await screen.findByText('This resume version has no reviewed content yet.'),
    ).toBeInTheDocument();
    expect(api.find('POST', '/learning/recommendations')[0]?.body).toEqual({
      role: 'QA_TESTER',
      corrections: [],
    });
  });
});
