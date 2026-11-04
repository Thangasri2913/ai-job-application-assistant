import { NavLink } from 'react-router';
import { cn } from '../../../shared/ui/cn';

const LINKS = [
  { to: '/learn', label: 'Course catalogue', end: true },
  { to: '/learn/my-learning', label: 'My learning', end: false },
  { to: '/learn/mentor', label: 'Career mentor', end: false },
  { to: '/learn/revision', label: 'Revision', end: false },
  { to: '/learn/plan', label: 'Personalised plan', end: false },
  { to: '/learn/interview', label: 'Interview practice', end: false },
  { to: '/learn/projects', label: 'Projects', end: false },
  { to: '/learn/jobs', label: 'Job readiness', end: false },
];

/** Section navigation for Learn & Prepare. */
export function LearnNav() {
  return (
    <nav aria-label="Learn & Prepare" className="mb-6 border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-1">
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'inline-block border-b-2 px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-fg',
                )
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
