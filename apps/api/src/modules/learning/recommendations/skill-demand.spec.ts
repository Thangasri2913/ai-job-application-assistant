import { titleMatchesRole } from './skill-demand.service.js';

describe('titleMatchesRole', () => {
  it('matches whole words in job titles', () => {
    expect(titleMatchesRole('Senior Backend Engineer', 'BACKEND_DEVELOPER')).toBe(true);
    expect(titleMatchesRole('API Developer (Node)', 'BACKEND_DEVELOPER')).toBe(true);
    expect(titleMatchesRole('QA Engineer', 'QA_TESTER')).toBe(true);
    expect(titleMatchesRole('Front-end Developer', 'FRONTEND_DEVELOPER')).toBe(true);
    expect(titleMatchesRole('BI Developer', 'DATA_ANALYST')).toBe(true);
  });

  it('does not match keywords inside other words', () => {
    expect(titleMatchesRole('Rapid Response Coordinator', 'BACKEND_DEVELOPER')).toBe(false);
    expect(titleMatchesRole('Contest Manager', 'QA_TESTER')).toBe(false);
    expect(titleMatchesRole('Mobile Engineer', 'DATA_ANALYST')).toBe(false);
  });
});
