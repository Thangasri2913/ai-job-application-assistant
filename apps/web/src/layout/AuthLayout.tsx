import { Outlet } from 'react-router';
import { BrandMark } from '../shared/ui/BrandMark';

/** Centered single-card layout for sign-in / sign-up. */
export function AuthLayout() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <BrandMark size="lg" />
      <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <Outlet />
      </section>
      <p className="text-sm text-muted">Your career data is private to your account.</p>
    </main>
  );
}
