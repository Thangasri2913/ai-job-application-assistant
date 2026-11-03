import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { LEARNING_ROLES, type LearningRole } from '@job-assist/shared';

export class ListSkillDemandQueryDto {
  @ApiPropertyOptional({
    enum: LEARNING_ROLES,
    description: 'Only jobs whose titles match the role.',
  })
  @IsOptional()
  @IsIn(LEARNING_ROLES, { message: 'role must be a supported learning role.' })
  role?: LearningRole;
}
