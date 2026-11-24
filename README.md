# Evidence for #3773 (company history display)

Evidence branch only: never merged. Synthetic data only, on a throwaway local Supabase stack
(every migration replayed). Chromium (Playwright), `lt` locale. `before` = main at capture time;
`after` = #3773. Screens at 390 and 1440 px, full page. `shots/overflow.txt`: document
scrollWidth minus viewport (0 = no sideways scrolling).

- `no-period-org`: an organization with no period statement.
- `two-statements-org`: two statements about the same earlier entity plus its own period; its records name one client.
- `person-card`: one historical person's card in the no-period organization.
