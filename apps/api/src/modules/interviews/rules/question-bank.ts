import type { InterviewDifficulty } from '@job-assist/shared';

/** Curated technical questions by skill key and difficulty, with the topics a good answer covers. */
export interface BankQuestion {
  question: string;
  topics: string[];
}

type ByDifficulty = Record<InterviewDifficulty, BankQuestion>;

export const TECHNICAL_BANK: Record<string, ByDifficulty> = {
  angular: {
    EASY: {
      question: 'How do Angular components communicate with each other?',
      topics: ['@Input/@Output', 'services', 'dependency injection'],
    },
    MEDIUM: {
      question: 'How would you improve the performance of a large Angular application?',
      topics: ['change detection', 'OnPush', 'lazy loading', 'trackBy'],
    },
    HARD: {
      question:
        'How would you structure state management and change detection for a large Angular dashboard with real-time data?',
      topics: ['OnPush', 'RxJS', 'state management', 'trade-offs'],
    },
  },
  react: {
    EASY: {
      question: 'What is the difference between state and props in React?',
      topics: ['state', 'props', 're-rendering'],
    },
    MEDIUM: {
      question: 'How do you avoid unnecessary re-renders in a React application?',
      topics: ['memoization', 'useMemo', 'useCallback', 'component structure'],
    },
    HARD: {
      question:
        'How would you design state management for a large React application, and what trade-offs would you weigh?',
      topics: ['server state', 'client state', 'context', 'trade-offs'],
    },
  },
  typescript: {
    EASY: {
      question: 'Why use TypeScript instead of plain JavaScript in a frontend codebase?',
      topics: ['type safety', 'tooling', 'refactoring'],
    },
    MEDIUM: {
      question: 'How do you use TypeScript types to model API responses and avoid runtime errors?',
      topics: ['interfaces', 'union types', 'validation', 'strict mode'],
    },
    HARD: {
      question:
        'When would you use generics or discriminated unions in TypeScript? Give an example from your work.',
      topics: ['generics', 'discriminated unions', 'type narrowing'],
    },
  },
  javascript: {
    EASY: {
      question: 'Explain the difference between let, const and var.',
      topics: ['scope', 'hoisting', 'immutability'],
    },
    MEDIUM: {
      question: 'How does the JavaScript event loop handle asynchronous code?',
      topics: ['event loop', 'promises', 'microtasks'],
    },
    HARD: {
      question: 'How would you track down a memory leak in a long-running JavaScript application?',
      topics: ['profiling', 'closures', 'event listeners'],
    },
  },
  rxjs: {
    EASY: {
      question: 'What is an Observable, and how is it different from a Promise?',
      topics: ['streams', 'multiple values', 'cancellation'],
    },
    MEDIUM: {
      question: 'When would you use switchMap, mergeMap or concatMap?',
      topics: ['switchMap', 'mergeMap', 'concatMap', 'cancellation'],
    },
    HARD: {
      question:
        'How do you avoid memory leaks and race conditions with RxJS subscriptions in a large application?',
      topics: ['unsubscribe', 'takeUntil', 'async pipe', 'race conditions'],
    },
  },
  'rest apis': {
    EASY: {
      question: 'What makes an API RESTful?',
      topics: ['resources', 'HTTP methods', 'status codes'],
    },
    MEDIUM: {
      question:
        'How have you designed or integrated REST APIs, and how did you handle errors and retries?',
      topics: ['error handling', 'status codes', 'retries', 'idempotency'],
    },
    HARD: {
      question:
        'How would you design pagination, versioning and error contracts for a REST API used by several clients?',
      topics: ['pagination', 'versioning', 'error format', 'backward compatibility'],
    },
  },
  'node.js': {
    EASY: {
      question: 'Why is Node.js well suited to I/O-heavy services?',
      topics: ['event loop', 'non-blocking I/O'],
    },
    MEDIUM: {
      question: 'How do you structure error handling and logging in a Node.js service?',
      topics: ['async errors', 'logging', 'middleware'],
    },
    HARD: {
      question:
        'How would you handle CPU-heavy work in a Node.js service without blocking requests?',
      topics: ['worker threads', 'queues', 'event loop'],
    },
  },
  nestjs: {
    EASY: {
      question: 'What are modules, controllers and providers in NestJS?',
      topics: ['modules', 'dependency injection'],
    },
    MEDIUM: {
      question: 'How do you implement validation and authorization in a NestJS API?',
      topics: ['pipes', 'guards', 'DTOs'],
    },
    HARD: {
      question: 'How would you keep module boundaries clean as a NestJS monolith grows?',
      topics: ['module boundaries', 'dependencies', 'testing'],
    },
  },
  postgresql: {
    EASY: {
      question: 'What is the difference between a primary key and a foreign key?',
      topics: ['keys', 'referential integrity'],
    },
    MEDIUM: {
      question: 'How do you find and fix a slow PostgreSQL query?',
      topics: ['EXPLAIN', 'indexes', 'query plans'],
    },
    HARD: {
      question:
        'How would you design a schema change on a large PostgreSQL table without downtime?',
      topics: ['migrations', 'locks', 'backfills'],
    },
  },
  sql: {
    EASY: {
      question: 'What is the difference between an INNER JOIN and a LEFT JOIN?',
      topics: ['joins'],
    },
    MEDIUM: {
      question: 'How do you decide which indexes a table needs?',
      topics: ['indexes', 'query patterns', 'write cost'],
    },
    HARD: {
      question: 'How do transactions and isolation levels prevent data anomalies?',
      topics: ['transactions', 'isolation levels'],
    },
  },
  docker: {
    EASY: {
      question: 'What problem do containers solve?',
      topics: ['isolation', 'reproducibility'],
    },
    MEDIUM: {
      question: 'How would you write a production-ready Dockerfile for a web application?',
      topics: ['multi-stage builds', 'image size', 'security'],
    },
    HARD: {
      question: 'How would you debug a container that works locally but fails in production?',
      topics: ['configuration', 'logs', 'networking'],
    },
  },
  aws: {
    EASY: {
      question: 'Which cloud services would a typical web application use, and why?',
      topics: ['compute', 'storage', 'databases'],
    },
    MEDIUM: {
      question: 'How would you deploy and scale a web application on a cloud platform?',
      topics: ['deployment', 'scaling', 'monitoring'],
    },
    HARD: {
      question: 'How would you design a cloud setup for high availability and controlled cost?',
      topics: ['availability', 'cost', 'trade-offs'],
    },
  },
  websockets: {
    EASY: {
      question: 'When would you use WebSockets instead of HTTP requests?',
      topics: ['real-time', 'persistent connections'],
    },
    MEDIUM: {
      question: 'How do you handle reconnections and missed messages with WebSockets?',
      topics: ['reconnection', 'backoff', 'message ordering'],
    },
    HARD: {
      question:
        'How would you render high-frequency real-time data in a UI without hurting performance?',
      topics: ['throttling', 'batching', 'change detection'],
    },
  },
  graphql: {
    EASY: {
      question: 'How does GraphQL differ from REST?',
      topics: ['schema', 'queries', 'over-fetching'],
    },
    MEDIUM: {
      question: 'How do you avoid N+1 queries in a GraphQL API?',
      topics: ['DataLoader', 'batching'],
    },
    HARD: {
      question: 'How would you evolve a GraphQL schema without breaking clients?',
      topics: ['deprecation', 'versioning'],
    },
  },
  jest: {
    EASY: {
      question: 'What makes a good unit test?',
      topics: ['isolation', 'assertions', 'readability'],
    },
    MEDIUM: {
      question: 'How do you decide what to mock in a unit test?',
      topics: ['mocks', 'boundaries', 'test value'],
    },
    HARD: {
      question: 'How would you build a testing strategy for a large frontend application?',
      topics: ['unit', 'integration', 'end-to-end', 'trade-offs'],
    },
  },
  kubernetes: {
    EASY: {
      question: 'What does Kubernetes do for containerised applications?',
      topics: ['orchestration', 'scaling'],
    },
    MEDIUM: {
      question: 'How do you configure health checks and rolling updates in Kubernetes?',
      topics: ['probes', 'deployments'],
    },
    HARD: {
      question: 'How would you troubleshoot pods that keep restarting?',
      topics: ['logs', 'events', 'resources'],
    },
  },
  python: {
    EASY: {
      question: 'What are lists, tuples and dictionaries used for in Python?',
      topics: ['data structures'],
    },
    MEDIUM: {
      question: 'How do you structure and test a Python service?',
      topics: ['packaging', 'testing'],
    },
    HARD: {
      question: 'How would you speed up a slow Python data-processing job?',
      topics: ['profiling', 'vectorisation', 'concurrency'],
    },
  },
  java: {
    EASY: {
      question: 'What is the difference between an interface and an abstract class in Java?',
      topics: ['interfaces', 'inheritance'],
    },
    MEDIUM: {
      question: 'How do you handle exceptions and transactions in a Java service?',
      topics: ['exceptions', 'transactions'],
    },
    HARD: {
      question: 'How would you diagnose high memory usage in a Java application?',
      topics: ['heap', 'GC', 'profiling'],
    },
  },
};

/** Fallback for skills without a curated entry. */
export function genericTechnical(skill: string, difficulty: InterviewDifficulty): BankQuestion {
  const q: Record<InterviewDifficulty, string> = {
    EASY: `What is ${skill} used for, and how have you used it?`,
    MEDIUM: `Describe a problem you solved with ${skill}. What was your approach?`,
    HARD: `Describe a difficult problem you solved with ${skill}, the alternatives you considered and the trade-offs you made.`,
  };
  return {
    question: q[difficulty],
    topics: [skill, 'concrete example', difficulty === 'HARD' ? 'trade-offs' : 'approach'],
  };
}

export const BEHAVIORAL_BANK: { question: string; difficulty: InterviewDifficulty }[] = [
  {
    question: 'Tell me about a time you disagreed with a teammate. How did you handle it?',
    difficulty: 'MEDIUM',
  },
  {
    question: 'Tell me about a mistake you made at work and what you learned from it.',
    difficulty: 'MEDIUM',
  },
  { question: 'Describe a time you had to deliver under a tight deadline.', difficulty: 'EASY' },
  {
    question: 'Tell me about a time you took ownership of a problem nobody else was handling.',
    difficulty: 'MEDIUM',
  },
  {
    question: 'Describe a time you received difficult feedback. What did you do with it?',
    difficulty: 'MEDIUM',
  },
  {
    question:
      'Tell me about a time you had to explain a technical decision to a non-technical person.',
    difficulty: 'EASY',
  },
  {
    question: 'Describe a situation where requirements changed late. How did you respond?',
    difficulty: 'HARD',
  },
  { question: 'Tell me about a time you improved a process for your team.', difficulty: 'HARD' },
];

export const SITUATIONAL_BANK: string[] = [
  'A release is due tomorrow and you find a serious bug in a feature you didn’t write. What do you do?',
  'You are asked to estimate a feature with unclear requirements. How do you approach it?',
  'Two stakeholders ask for conflicting changes. How would you handle it?',
];

export const STAR_TOPICS = ['situation', 'task', 'action', 'result'];
