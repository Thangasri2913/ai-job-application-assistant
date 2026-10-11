# ADR-0008: React + Vite for the web app

## Context

The first foundation run built the SPA in Angular 21, per the initial brief. The Phase 1 brief states the frontend stack as React + TypeScript + Vite. When asked, the product owner chose to switch before any product features were built on the Angular code.

## Decision

- React 19, TypeScript, Vite, and React Router 7 (data router, lazy routes).
- Server state lives in TanStack Query, behind per-feature service modules. There is no Redux.
- Forms use React Hook Form with zod schemas. zod is also used by the API for config and AI-output validation.
- Styling uses Tailwind CSS 4 with semantic design tokens and small in-house UI primitives in `shared/ui`. A full component library was not adopted, which keeps the bundle and the dependency surface small. Revisit if complex widgets (date pickers, comboboxes) become numerous.
- Tests use Vitest, React Testing Library and jsdom, plus a minimal `fetch` stub.

## Consequences

- The Angular code was removed. The auth flow, app shell, guards and dashboard shell were rebuilt with the same behaviour and API contract (`@job-assist/shared`), and re-verified in a real browser.
- Accessibility of in-house primitives (menus, dialogs) is our responsibility. Use native elements (`<dialog>`, `<button>`) and test with a keyboard.
