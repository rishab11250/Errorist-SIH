'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="mx-auto max-w-2xl p-6">
          <div role="alert" className="rounded-lg border border-fail/30 bg-fail/10 p-5 text-fail">
            <h2 className="text-h2">Something went wrong</h2>
            <p className="mt-2">{this.state.error?.message ?? 'An unexpected error occurred.'}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 inline-flex min-h-11 items-center rounded-md border bg-background px-5 py-2 font-semibold text-foreground hover:bg-muted"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
