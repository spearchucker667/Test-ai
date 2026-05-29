import React, { Component, ErrorInfo, ReactNode } from "react";
import { error as logError } from "../shared/logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError("ErrorBoundary caught an error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="m-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-8 backdrop-blur-md shadow-lg">
          <h2 className="text-xl font-display font-semibold text-red-400 mb-3">Something went wrong.</h2>
          <p className="text-sm text-red-300/80 mb-6">{this.state.error?.message}</p>
          <button className="btn primary" onClick={() => window.location.reload()}>Reload application</button>
        </div>
      );
    }

    return this.props.children;
  }
}
