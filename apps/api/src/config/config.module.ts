import { resolve } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from './env.schema.js';

/**
 * Typed, validated configuration: `config.get('KEYCLOAK_ISSUER_URL', { infer: true })`.
 * A real class (not a type alias) so it works as a DI token; it resolves to Nest's ConfigService.
 */
export abstract class AppConfigService extends ConfigService<Env, true> {}

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Repo-root .env for local development; real environments inject variables directly.
      envFilePath: resolve(import.meta.dirname, '../../../../.env'),
      validate: validateEnv,
    }),
  ],
  providers: [{ provide: AppConfigService, useExisting: ConfigService }],
  exports: [AppConfigService],
})
export class ConfigModule {}
