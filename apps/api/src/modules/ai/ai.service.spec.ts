import { z } from 'zod';
import { AiAbortedError, AiNotConfiguredError, AiOutputValidationError } from './ai.errors.js';
import { AiService } from './ai.service.js';
import { MockAiProvider } from './providers/mock-ai.provider.js';
import { UnconfiguredAiProvider } from './providers/unconfigured-ai.provider.js';

const skillsSchema = z.object({
  skills: z.array(z.object({ name: z.string().min(1), evidence: z.string().min(1) })),
});

const task = {
  task: 'test.extract-skills',
  system: 'Extract skills.',
  input: 'Built Angular apps.',
  schema: skillsSchema,
};

describe('AiService', () => {
  it('returns provider output that matches the schema', async () => {
    const provider = new MockAiProvider().respondTo(task.task, {
      skills: [{ name: 'Angular', evidence: 'Built Angular apps.' }],
    });
    const result = await new AiService(provider).generateStructured(task);
    expect(result.skills[0]?.name).toBe('Angular');
  });

  it('sends the schema to the provider as JSON Schema', async () => {
    const provider = new MockAiProvider().respondTo(task.task, { skills: [] });
    await new AiService(provider).generateStructured(task);
    expect(provider.requests[0]?.outputSchema).toMatchObject({
      type: 'object',
      required: ['skills'],
    });
  });

  it('rejects output that does not match the schema', async () => {
    const provider = new MockAiProvider().respondTo(task.task, { skills: [{ name: 'Angular' }] });
    await expect(new AiService(provider).generateStructured(task)).rejects.toBeInstanceOf(
      AiOutputValidationError,
    );
  });

  it('fails loudly when no provider is configured', async () => {
    await expect(
      new AiService(new UnconfiguredAiProvider()).generateStructured(task),
    ).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it('does not call the provider when the signal is already aborted', async () => {
    const provider = new MockAiProvider().respondTo(task.task, { skills: [] });
    const controller = new AbortController();
    controller.abort();
    await expect(
      new AiService(provider).generateStructured({ ...task, signal: controller.signal }),
    ).rejects.toBeInstanceOf(AiAbortedError);
    expect(provider.requests).toHaveLength(0);
  });

  it('passes the signal to the provider, which abandons the request when it aborts', async () => {
    const provider = new MockAiProvider().respondTo(task.task, { skills: [] }, { delayMs: 5_000 });
    const controller = new AbortController();
    const pending = new AiService(provider).generateStructured({
      ...task,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(AiAbortedError);
    expect(provider.requests[0]!.signal).toBe(controller.signal);
    expect(provider.cancelled).toBe(1);
  });
});
