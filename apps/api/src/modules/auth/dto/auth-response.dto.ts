import { ApiProperty } from '@nestjs/swagger';
import type { AuthUser } from '@job-assist/shared';

export class AuthUserDto implements AuthUser {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: [String], example: ['user'] }) roles!: string[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
