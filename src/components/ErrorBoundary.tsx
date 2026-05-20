import React, { Component, ErrorInfo, ReactNode } from "react";

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
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="panel pad error">
          <h2>Something went wrong.</h2>
          <p className="small">{this.state.error?.message}</p>
          <button className="btn outline" onClick={() => window.location.reload()}>Reload application</button>
        </div>
      );
    }

    return this.props.children;
  }
}
