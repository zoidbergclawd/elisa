import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="fixed inset-0 flex items-center justify-center atelier-bg">
          <div className="glass-elevated rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center animate-float-in">
            <h2 className="text-2xl font-display font-bold mb-4 gradient-text-warm">
              Something went wrong
            </h2>
            <p className="text-atelier-text-secondary mb-6">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-5 py-2.5 rounded-xl text-sm font-medium bg-accent-lavender/15 text-accent-lavender hover:bg-accent-lavender/25 transition-colors cursor-pointer"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="go-btn px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
