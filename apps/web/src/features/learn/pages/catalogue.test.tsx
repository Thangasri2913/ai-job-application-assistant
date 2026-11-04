import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';
import { courseDetail, courseSummary, plannedCourse, progress } from '../test/fixtures';

const catalogue = { body: { courses: [courseSummary(), plannedCourse] } };
const skills = {
  body: { skills: [{ id: 'sql', name: 'SQL', category: 'DATA', description: '', courseIds: [] }] },
};

describe('Course catalogue', () => {
  it('is reachable from the navigation and lists available and planned courses', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/courses': catalogue,
      'GET /learning/skills': skills,
    });
    renderApp('/learn');

    expect(
      await screen.findByRole('heading', { name: 'Learn & Prepare', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Learn & Prepare' })[0]).toHaveAttribute(
      'href',
      '/learn',
    );
    const section = within(screen.getByRole('navigation', { name: 'Learn & Prepare' }));
    expect(section.getByRole('link', { name: 'My learning' })).toHaveAttribute(
      'href',
      '/learn/my-learning',
    );

    const available = await screen.findByRole('region', { name: /Available courses/ });
    const card = within(available).getByRole('article', { name: 'SQL fundamentals' });
    expect(within(card).getByText('2 lessons · 5 activities · about 7 hours')).toBeInTheDocument();
    expect(within(card).getByText('AI-generated · Not yet reviewed')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'View SQL fundamentals' })).toHaveAttribute(
      'href',
      '/learn/courses/sql-fundamentals',
    );

    const planned = within(screen.getByRole('region', { name: /Planned courses/ })).getByRole(
      'article',
      {
        name: 'Python fundamentals',
      },
    );
    expect(within(planned).getByText('Planned')).toBeInTheDocument();
    expect(within(planned).getByText('Curriculum in preparation')).toBeInTheDocument();
  });

  it('searches and filters through the API, with an empty state and clear', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /learning/courses': catalogue,
      'GET /learning/skills': skills,
      'GET /learning/courses?q=sql': { body: { courses: [courseSummary()] } },
      'GET /learning/courses?q=sql&category=DESIGN': { body: { courses: [] } },
    });
    const user = userEvent.setup();
    renderApp('/learn');
    await screen.findByRole('article', { name: 'Python fundamentals' });

    await user.type(screen.getByRole('searchbox', { name: 'Search courses' }), 'sql');
    await waitFor(
      () =>
        expect(
          screen.queryByRole('article', { name: 'Python fundamentals' }),
        ).not.toBeInTheDocument(),
      { timeout: 2000 },
    );
    expect(screen.getByRole('article', { name: 'SQL fundamentals' })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'DESIGN');
    expect(
      await screen.findByRole('heading', { name: 'No courses match your search' }),
    ).toBeInTheDocument();
    expect(api.find('GET', '/learning/courses?q=sql&category=DESIGN')).toHaveLength(1);

    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    expect(await screen.findByRole('article', { name: 'Python fundamentals' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search courses' })).toHaveValue('');
  });

  it('shows an error with a retry', async () => {
    let fail = true;
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/skills': skills,
      'GET /learning/courses': () =>
        fail
          ? { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } }
          : catalogue,
    });
    const user = userEvent.setup();
    renderApp('/learn');
    expect(await screen.findByRole('heading', { name: 'Couldn’t load this' })).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('article', { name: 'SQL fundamentals' })).toBeInTheDocument();
  });
});

describe('Course details', () => {
  const base = {
    'GET /auth/me': meOk,
    'GET /learning/courses': catalogue,
    'GET /learning/courses/sql-fundamentals': { body: courseDetail() },
  };

  it('shows the curriculum, levels, project and a selection action', async () => {
    let enrolled = false;
    const api = mockApi({
      ...base,
      'GET /learning/courses/sql-fundamentals/progress': () => ({ body: progress({ enrolled }) }),
      'PUT /learning/enrollments/sql-fundamentals': () => {
        enrolled = true;
        return { body: progress({ enrolled: true, enrolledAt: '2026-10-17T10:00:00.000Z' }) };
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/courses/sql-fundamentals');

    expect(
      await screen.findByRole('heading', { name: 'SQL fundamentals', level: 1 }),
    ).toBeInTheDocument();
    const curriculum = within(screen.getByRole('region', { name: 'Curriculum' }));
    expect(curriculum.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Module 1: Reading data',
      'Module 2: Combining data',
    ]);
    expect(
      curriculum.getByRole('link', { name: 'Lesson 1: SELECT, WHERE and ORDER BY' }),
    ).toHaveAttribute('href', '/learn/courses/sql-fundamentals/lessons/sql-select-and-filter');
    expect(curriculum.getByText('Level 1: Fundamentals')).toBeInTheDocument();
    expect(curriculum.getByText('Project: Job-search analytics database')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take the diagnostic' })).toHaveAttribute(
      'href',
      '/learn/courses/sql-fundamentals/diagnostic',
    );

    await user.click(await screen.findByRole('button', { name: 'Add to my learning' }));
    expect(await screen.findByText('In my learning')).toBeInTheDocument();
    expect(api.find('PUT', '/learning/enrollments/sql-fundamentals')).toHaveLength(1);
  });

  it('marks lessons the diagnostic suggests skimming, and completed ones', async () => {
    mockApi({
      ...base,
      'GET /learning/courses/sql-fundamentals/progress': {
        body: progress({
          enrolled: true,
          completedLessonIds: ['sql-joins'],
          skimLessonIds: ['sql-select-and-filter'],
        }),
      },
    });
    renderApp('/learn/courses/sql-fundamentals');
    expect(await screen.findByText('Diagnostic suggests skimming')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 lessons marked complete')).toBeInTheDocument();
  });

  it('explains planned courses and unknown ids', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/courses': catalogue,
      'GET /learning/courses/python-fundamentals': { body: { ...plannedCourse, modules: [] } },
      'GET /learning/courses/astronaut': {
        status: 404,
        body: { code: 'NOT_FOUND', message: 'Course not found.' },
      },
    });
    const { router } = renderApp('/learn/courses/python-fundamentals');
    expect(
      await screen.findByRole('heading', { name: 'Curriculum in preparation' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to my learning' })).not.toBeInTheDocument();

    await router.navigate('/learn/courses/astronaut');
    expect(await screen.findByRole('heading', { name: 'Course not found' })).toBeInTheDocument();
  });
});
