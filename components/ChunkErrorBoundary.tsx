'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if it's a chunk loading error
    if (
      error.name === 'ChunkLoadError' ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch dynamically imported module')
    ) {
      return { hasError: true };
    }
    // Re-throw other errors
    throw error;
  }

  componentDidCatch(error: Error) {
    // Log to console for debugging
    console.warn('ChunkLoadError detected, reloading page...', error);

    // Auto-reload after a short delay to get fresh chunks
    if (
      error.name === 'ChunkLoadError' ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch dynamically imported module')
    ) {
      // Small delay to prevent reload loops
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Updating to latest version...</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
