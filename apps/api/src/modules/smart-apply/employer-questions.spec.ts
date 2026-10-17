import { fakeFetch } from '../job-discovery/sources/test-fetch.fixture.js';
import { EmployerQuestionsReader, parseGreenhouseQuestions } from './employer-questions.js';

// Shaped like the Greenhouse Job Board API's job response with ?questions=true.
const FORM = {
  questions: [
    { label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text' }] },
    {
      label: 'Resume/CV',
      required: true,
      fields: [
        { name: 'resume', type: 'input_file' },
        { name: 'resume_text', type: 'textarea' },
      ],
    },
    {
      label: 'Will you now or in the future require visa sponsorship?',
      required: true,
      fields: [
        {
          name: 'question_1',
          type: 'multi_value_single_select',
          values: [
            { label: 'Yes', value: 1 },
            { label: 'No', value: 0 },
          ],
        },
      ],
    },
    {
      label: 'LinkedIn &amp; portfolio links',
      required: false,
      fields: [{ name: 'question_2', type: 'input_text' }],
    },
    {
      label: 'Upload a writing sample',
      required: false,
      fields: [{ name: 'question_3', type: 'input_file' }],
    },
  ],
};

describe('employer application questions', () => {
  it('reads the employer’s own questions, skipping contact and file fields', () => {
    expect(parseGreenhouseQuestions(FORM.questions)).toEqual([
      {
        externalKey: 'greenhouse:question_1',
        question: 'Will you now or in the future require visa sponsorship?',
        questionType: 'WORK_AUTHORIZATION',
        required: true,
        options: ['Yes', 'No'],
        origin: 'employer’s Greenhouse application form',
      },
      {
        externalKey: 'greenhouse:question_2',
        question: 'LinkedIn & portfolio links',
        questionType: 'OTHER',
        required: false,
        options: [],
        origin: 'employer’s Greenhouse application form',
      },
    ]);
  });

  it('fetches only Greenhouse jobs, from the public endpoint, and caches the form', async () => {
    const { fn, calls } = fakeFetch([['https://boards-api.greenhouse.io/', { body: FORM }]]);
    const reader = new EmployerQuestionsReader(fn, true);
    expect(await reader.read('adzuna', '123')).toBeNull();
    expect(await reader.read('greenhouse', 'acme:77')).toHaveLength(2);
    await reader.read('greenhouse', 'acme:77');
    expect(calls).toEqual([
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs/77?questions=true',
    ]);
    expect(await new EmployerQuestionsReader(fn, false).read('greenhouse', 'acme:77')).toBeNull();
  });

  it('reports a removed job with a safe error', async () => {
    const { fn } = fakeFetch([['https://boards-api.greenhouse.io/', { status: 404 }]]);
    await expect(
      new EmployerQuestionsReader(fn, true).read('greenhouse', 'acme:1'),
    ).rejects.toThrow('The job is no longer on the employer’s board.');
  });
});
