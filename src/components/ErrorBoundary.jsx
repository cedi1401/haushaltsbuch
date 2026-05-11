import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 48, textAlign: "center" }}>
          <h2 style={{ marginBottom: 8 }}>Etwas ist schiefgelaufen</h2>
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
