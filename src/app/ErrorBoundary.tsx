import { Component, type ReactNode } from "react";
import { HELP_URL } from "./help.ts";

/** Shows a way out instead of a blank page if a screen crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main>
        <h1>Kovrune</h1>
        <section className="error" role="alert">
          <h2>Something went wrong</h2>
          <p>
            The page hit an unexpected error: <code>{this.state.error.message}</code>
          </p>
          <p>
            Reloading usually fixes it. Your setup is kept; documents you added need adding again. If it keeps happening,
            please report it with the message above (see the <a href={HELP_URL}>user guide</a>).
          </p>
          <div className="actions">
            <button className="primary" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </section>
      </main>
    );
  }
}
