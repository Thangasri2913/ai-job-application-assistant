import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Contains a rendering failure to one dashboard section, so the rest of the page keeps
 * working. Shows a short message instead of the section.
 */
export class SectionBoundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Career Intelligence section "${this.props.name}" failed to render`, error, info);
  }

  override render() {
    if (this.state.failed) {
      return (
        <div
          role="alert"
          className="rounded-xl border border-border bg-surface p-4 text-sm text-muted"
        >
          The {this.props.name} section couldn’t be displayed. The rest of the page is unaffected.
        </div>
      );
    }
    return this.props.children;
  }
}
