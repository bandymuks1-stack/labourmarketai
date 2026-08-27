"use client";

import React from "react";

/** Renders the failure instead of a silent black rectangle. A WebGL scene
 *  that throws inside the reconciler otherwise leaves an unsized canvas and
 *  no visible reason. */
export class LabErrorBoundary extends React.Component<
  { readonly children: React.ReactNode },
  { readonly message: string | null }
> {
  constructor(props: { readonly children: React.ReactNode }) {
    super(props);
    this.state = { message: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? `${error.message}` : String(error) };
  }

  render() {
    if (this.state.message) {
      return (
        <pre
          data-lab-error="1"
          style={{
            position: "absolute",
            inset: 0,
            padding: 24,
            color: "#ff8a6a",
            font: "12px ui-monospace, monospace",
            whiteSpace: "pre-wrap",
            zIndex: 90,
          }}
        >
          {this.state.message}
        </pre>
      );
    }
    return this.props.children;
  }
}
