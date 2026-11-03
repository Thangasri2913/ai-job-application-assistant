/** Errors the host maps to HTTP responses. Messages are safe to show to the user. */
export class MentorAgentError extends Error {
  constructor(
    readonly code: 'INVALID_REQUEST' | 'JOB_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'MentorAgentError';
  }
}
