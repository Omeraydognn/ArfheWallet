import React from "react";
import i18n from "../i18n";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * Global Error Boundary — catches unhandled React errors and shows
 * a recovery UI instead of a white screen of death.
 * Uses i18n.t() directly (class components can't use useTranslation hook).
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
  }

  handleReload = () => {
    window.location.hash = "#/";
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const t = i18n.t.bind(i18n);
      return (
        <div
          style={{
            width: 375,
            height: 600,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)",
            color: "#fff",
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
            padding: 32,
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 700 }}>
            {t("errorBoundary.title")}
          </h2>
          <p
            style={{
              margin: "0 0 24px 0",
              fontSize: 13,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.5,
            }}
          >
            {t("errorBoundary.description")}
          </p>

          {this.state.error && (
            <pre
              style={{
                background: "rgba(255,0,0,0.1)",
                border: "1px solid rgba(255,0,0,0.2)",
                borderRadius: 8,
                padding: 12,
                fontSize: 10,
                color: "rgba(255,255,255,0.5)",
                maxHeight: 80,
                overflow: "auto",
                width: "100%",
                textAlign: "left",
                marginBottom: 24,
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
              }}
            >
              {this.state.error.message}
            </pre>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: "10px 20px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "transparent",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("errorBoundary.retry")}
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: "10px 20px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("errorBoundary.restart")}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
