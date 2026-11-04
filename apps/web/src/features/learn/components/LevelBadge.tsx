import { SKILL_LEVEL_LABELS, type SkillLevel } from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';

export function LevelBadge({ level }: { level: SkillLevel }) {
  return (
    <Badge>
      Level {level}: {SKILL_LEVEL_LABELS[level]}
    </Badge>
  );
}
