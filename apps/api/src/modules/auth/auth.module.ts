import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import {
  KEYCLOAK_KEY_RESOLVER,
  KeycloakJwksResolver,
  KeycloakTokenVerifier,
} from './keycloak-token-verifier.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    KeycloakJwksResolver,
    {
      provide: KEYCLOAK_KEY_RESOLVER,
      inject: [KeycloakJwksResolver],
      useFactory: (jwks: KeycloakJwksResolver) => () => jwks.get(),
    },
    KeycloakTokenVerifier,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [KeycloakJwksResolver],
})
export class AuthModule {}
