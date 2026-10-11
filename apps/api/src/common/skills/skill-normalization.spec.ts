import {
  detectSkills,
  normalizeSkillName,
  relatedSkillKeys,
  skillKey,
} from './skill-normalization.js';

describe('skill normalisation', () => {
  it.each([
    ['React.js', 'React'],
    ['ReactJS', 'React'],
    ['TS', 'TypeScript'],
    ['Node', 'Node.js'],
    ['nodejs', 'Node.js'],
    ['Postgres', 'PostgreSQL'],
    ['Nest', 'NestJS'],
    ['typescript', 'TypeScript'],
    ['RESTful APIs', 'REST APIs'],
    ['k8s', 'Kubernetes'],
    ['Some Niche Tool', 'Some Niche Tool'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeSkillName(input)).toBe(expected);
  });

  it.each([
    ['Java', 'JavaScript'],
    ['React', 'React Native'],
    ['PostgreSQL', 'MySQL'],
    ['Angular', 'AngularJS'],
  ])('never merges %s and %s', (a, b) => {
    expect(skillKey(a)).not.toBe(skillKey(b));
  });

  it('detects canonical skills in prose, including common variants', () => {
    expect(detectSkills('We use ReactJS, Postgres, TS and Node with NestJS on K8s.')).toEqual(
      expect.arrayContaining([
        'React',
        'PostgreSQL',
        'TypeScript',
        'Node.js',
        'NestJS',
        'Kubernetes',
      ]),
    );
    expect(detectSkills('Java backend')).toEqual(['Java']);
    expect(detectSkills('Our stack ends with Node.')).toEqual(['Node.js']);
    expect(detectSkills('JavaScript only')).toEqual(['JavaScript']);
    expect(detectSkills('React Native apps')).toEqual(['React Native']);
    expect(detectSkills('React and React Native')).toEqual(['React Native', 'React']);
    expect(detectSkills('MS SQL Server')).toEqual(['SQL Server']);
  });

  it('relates different skills only for partial credit, and only in listed directions', () => {
    expect(relatedSkillKeys('TypeScript')).toContain('javascript');
    expect(relatedSkillKeys('PostgreSQL')).toEqual([]);
    expect(relatedSkillKeys('Java')).toEqual([]);
  });
});
