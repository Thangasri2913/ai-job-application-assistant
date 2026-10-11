import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AI_PROVIDER, type AiProvider } from '../src/modules/ai/ai-provider.js';
import { KEYCLOAK_KEY_RESOLVER } from '../src/modules/auth/keycloak-token-verifier.js';
import { testKeyResolver } from './support/test-identity.js';

/**
 * `aiProvider` replaces the configured AI provider (e.g. a MockAiProvider with fixtures);
 * `overrides` replaces other providers by token.
 */
export async function createTestApp(
  options: { aiProvider?: AiProvider; overrides?: [token: unknown, value: unknown][] } = {},
): Promise<{
  app: NestExpressApplication;
  prisma: PrismaService;
}> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    // Tokens in tests are signed with a local test key instead of Keycloak's realm key.
    .overrideProvider(KEYCLOAK_KEY_RESOLVER)
    .useValue(testKeyResolver);
  if (options.aiProvider)
    builder = builder.overrideProvider(AI_PROVIDER).useValue(options.aiProvider);
  for (const [token, value] of options.overrides ?? [])
    builder = builder.overrideProvider(token as string).useValue(value);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE audit_logs, users RESTART IDENTITY CASCADE');
}
