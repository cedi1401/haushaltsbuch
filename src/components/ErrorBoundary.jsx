import React from "react";
import makeLogger from "../utils/logger.js";

const log = makeLogger("ErrorBoundary");

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const context = this.props.context ? ` in „${this.props.context}"` : "";
    log.error(`Unkritischer Fehler aufgefangen${context}`, { message: error.message, stack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 48, textAlign: "center" }}>
          <h2 style={{ marginBottom: 8 }}>
            {this.props.context ? `Fehler in „${this.props.context}"` : "Etwas ist schiefgelaufen"}
          </h2>
          <p className="hb-muted" style={{ marginBottom: 24 }}>
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="hb-btn"
            onClick={() => this.setState({ error: null })}
          >
            Erneut versuchen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
