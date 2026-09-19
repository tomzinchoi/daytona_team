import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

class AppBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <h1>The workbench needs a restart.</h1>
        <p>Your source data has not been changed.</p>
        <button onClick={() => location.reload()}>Reload Atlas</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </React.StrictMode>,
);
