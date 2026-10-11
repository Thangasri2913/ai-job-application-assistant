import { Construction } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '../../shared/ui/button-classes';
import { Card } from '../../shared/ui/Card';
import { EmptyState } from '../../shared/ui/EmptyState';
import { PageHeader } from '../../shared/ui/PageHeader';

/**
 * PLACEHOLDER — rendered for navigation entries whose feature has not been built yet.
 * Replace route-by-route as features ship.
 */
export function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState icon={Construction} title="Not available yet" description={description}>
          <Link to="/dashboard" className={buttonClasses('secondary')}>
            Back to dashboard
          </Link>
        </EmptyState>
      </Card>
    </>
  );
}
