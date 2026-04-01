"use client";

import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Section name for logging (e.g., "Market Snapshot", "Deals Table") */
  section?: string;
  /** Optional fallback UI. If not provided, renders a subtle inline error message. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.section ? `: ${this.props.section}` : ""}]`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: "24px",
          background: "#FEF2F2",
          border: "1px solid #FECACA",
          borderRadius: 8,
          textAlign: "center",
          margin: "12px 0",
        }}>
          <p style={{ fontSize: 14, color: "#991B1B", margin: 0, fontWeight: 600 }}>
            {this.props.section
              ? `Unable to load ${this.props.section}. Please refresh the page.`
              : "Something went wrong. Please refresh the page."}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
