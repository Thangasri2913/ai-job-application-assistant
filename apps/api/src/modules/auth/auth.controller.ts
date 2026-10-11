import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { AuthUser } from '@job-assist/shared';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { UsersService } from '../users/users.service.js';
import { toAuthUser } from '../users/users.service.js';
import { AuthUserDto } from './dto/auth-response.dto.js';

/**
 * Sign-in, registration, sessions and logout are handled by Keycloak (OIDC). The API only
 * exposes the current user, created/synchronised from the validated access token.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED | TOKEN_EXPIRED' })
  async me(@CurrentUser() principal: AuthenticatedUser): Promise<AuthUser> {
    const user = await this.users.findById(principal.userId);
    return toAuthUser(user!, principal.roles);
  }
}
