/**
 * Whether development sample data (postings from a development source, stored with
 * jobs.is_sample_data = true) may be used and shown. False in production: sample jobs are
 * never discovered there and never returned by recommendation endpoints (ADR-0018).
 */
export abstract class SampleDataPolicy {
  abstract readonly allowSampleData: boolean;
}
