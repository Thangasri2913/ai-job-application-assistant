import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AppConfigService } from '../../config/config.module.js';
import { StorageService } from '../storage/storage.service.js';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
  ) {}

  /** Liveness: the process is up. Does not touch dependencies. */
  @Get()
  @ApiOkResponse({ description: 'Process is running.' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: the API can serve traffic (database, object storage and Keycloak reachable). */
  @Get('ready')
  @HealthCheck()
  @ApiServiceUnavailableResponse({ description: 'A dependency is unavailable.' })
  ready() {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.checkStorage(),
      () => this.checkIdentityProvider(),
    ]);
  }

  private async checkDatabase() {
    const indicator = this.indicators.check('database');
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch {
      return indicator.down({ message: 'Database unreachable' });
    }
  }

  private async checkStorage() {
    const indicator = this.indicators.check('storage');
    try {
      await this.storage.ping();
      return indicator.up();
    } catch {
      return indicator.down({ message: 'Object storage unreachable' });
    }
  }

  /** Keycloak is reachable and serves the configured realm (no configuration details exposed). */
  private async checkIdentityProvider() {
    const indicator = this.indicators.check('identityProvider');
    try {
      const issuer = this.config.get('KEYCLOAK_ISSUER_URL', { infer: true });
      const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok
        ? indicator.up()
        : indicator.down({ message: 'Identity provider unavailable' });
    } catch {
      return indicator.down({ message: 'Identity provider unavailable' });
    }
  }
}
