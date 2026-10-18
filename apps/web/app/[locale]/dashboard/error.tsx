"use client";

/**
 * DASHBOARD ERROR BOUNDARY — a failing page keeps the product shell.
 *
 * Owner walk (2026-10-01): a company owner once saw the bare "Įvyko klaida.
 * Bandykite dar kartą." screen. Before this file the ONLY boundary was the
 * locale-level one, which replaces the whole page — header, workspace chip
 * and navigation included — so one failing read under /dashboard left the
 * person with no way to switch workspace or go home. This segment boundary
 * renders the SAME honest copy and retry (one implementation, re-exported)
 * INSIDE the dashboard layout: the shell stays, only the page body is
 * replaced, and chunk-reload recovery and error logging behave identically.
 */
export { default } from "../error";
