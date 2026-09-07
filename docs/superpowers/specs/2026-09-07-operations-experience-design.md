# Operations and Frontend Experience — Design Specification

**Date:** 2026-09-07
**Status:** Draft for written-spec review
**Parent:** `2026-09-07-sih26034-complete-solution-design.md`

## 1. Purpose and boundary

Turn the scanner into a usable inspection workspace with local authentication, role-based permissions, review history, repository search, filtered dashboards, editable exports, and one consistent Next.js interface.

This workstream consumes the analysis contract from the inspection-intelligence workstream. It does not own OCR algorithms or ground-truth evaluation.

## 2. Roles and permissions

### 2.1 Inspector

- sign in and sign out;
- create retail-photo and listing-screenshot scans;
- view, search, filter, review, and export their own scans;
- append review decisions and notes to their own scans;
- view dashboard aggregates limited to data they may access.

### 2.2 Administrator

- all inspector capabilities across all scans;
- filter by inspector;
- create, deactivate, and reset local users;
- view audit history;
- export organization-wide filtered data.

The backend enforces ownership and role checks for every protected resource. Hiding a control in the frontend is never the authorization mechanism.

## 3. Authentication design

The application uses local username/password accounts and opaque server-side sessions.

- The initial administrator is created by an explicit CLI command using an interactive password prompt or environment-provided one-time secret.
- Passwords are hashed with Argon2 and never logged.
- Login rotates the session token and returns it in an `HttpOnly` cookie.
- Logout revokes the active session server-side.
- Inactive users cannot create sessions; deactivating a user revokes existing sessions.
- Development cookies permit local HTTP; production cookies require TLS.
- Next.js proxies `/api` to FastAPI so browser requests are same-origin.

There is no self-registration, email recovery, OAuth, or remote identity provider in the SIH build.

## 4. Data model

### 4.1 `users`

`id`, `username_normalized`, `display_name`, `password_hash`, `role`, `is_active`, `created_at`, `updated_at`, `last_login_at`.

Usernames are case-insensitively unique. Roles are `inspector` or `admin`.

### 4.2 `sessions`

`id`, `user_id`, `token_hash`, `created_at`, `expires_at`, `revoked_at`, `last_seen_at`.

Only a hash of the random cookie token is stored.

### 4.3 Scan extensions

Add nullable `owner_user_id`, `schema_version`, `processing_status`, `product_name`, `quality_summary`, `analysis_version`, and `updated_at`. Existing rows remain unowned legacy records after migration, are visible only to administrators, and may be explicitly assigned later. New scans always require an owner.

### 4.4 Verdict extensions

Add `confidence`, `reasoning`, `measurement_method`, and `review_state`. Existing verdicts receive deterministic compatibility defaults.

### 4.5 `review_actions`

`id`, `scan_id`, `verdict_id` nullable, `actor_user_id`, `action`, `note`, `created_at`.

Actions are `confirmed`, `false_positive`, `resolved`, or `needs_follow_up`. Review actions are appended rather than overwritten, preserving the audit trail.

## 5. API surface

### 5.1 Authentication and users

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Create a session |
| POST | `/api/auth/logout` | Revoke the current session |
| GET | `/api/auth/me` | Return current user and role |
| GET | `/api/users` | List users; admin only |
| POST | `/api/users` | Create a user; admin only |
| PATCH | `/api/users/{id}` | Rename, reset password, change role, or deactivate; admin only |

### 5.2 Scans, reviews, and search

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/scan` | Create an owned scan |
| GET | `/api/scan/{id}` | Retrieve an authorized scan |
| POST | `/api/scan/{id}/reviews` | Append a scan or verdict review action |
| GET | `/api/history` | Paginated repository search |
| GET | `/api/dashboard` | Filtered aggregates |

History and dashboard accept the relevant subset of `q`, `mode`, `category`, `overall_status`, `rule_id`, `verdict_status`, `owner_id`, `created_from`, and `created_to`. Text search covers product name, recognized text, rule ID, and evidence. Queries are parameterized, sorted deterministically, and limited to authorized rows.

### 5.3 Exports

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/report/{id}` | Existing PDF compatibility endpoint |
| GET | `/api/exports/scans/{id}.pdf` | PDF inspection report |
| GET | `/api/exports/scans/{id}.docx` | Editable inspection report |
| GET | `/api/exports/scans.csv` | CSV of authorized scans matching active filters |

PDF and DOCX consume one report-view model containing source evidence, analysis metadata, verdicts, review history, actor, timestamps, and rule versions. CSV exports the active repository result set and includes filter metadata in response headers.

## 6. Frontend application structure

The application remains Next.js App Router with React, TypeScript, and Tailwind. Route groups separate public authentication from the protected workspace:

```text
app/
  (public)/login/page.tsx
  (workspace)/layout.tsx
  (workspace)/page.tsx
  (workspace)/scan/[id]/page.tsx
  (workspace)/history/page.tsx
  (workspace)/dashboard/page.tsx
  (workspace)/admin/users/page.tsx
components/
  ui/                 shared primitives and normalized copied source
  inspection/         upload, progress, overlay, quality, verdicts
  repository/         search, filters, table, pagination
  dashboard/          metrics and accessible charts
  auth/               login and user-management forms
```

The workspace layout provides one adaptive navigation hierarchy: sidebar at desktop widths and a compact sheet/menu on small screens. It preserves filter and scroll state when returning from scan details.

## 7. UI component strategy

### 7.1 Foundation

Use free, open-code shadcn/ui components as the component foundation because they align with the existing Tailwind stack and place editable source in the repository. Core buttons, forms, dialogs, tables, tabs, dropdowns, badges, tooltips, skeletons, toasts, and accessible primitives come from this layer.

Chakra UI is not installed. Although its accessibility approach informs the design, combining its Emotion-based runtime styling with the existing Tailwind stack would create two styling systems. Chakra Pro and all paid blocks are excluded.

### 7.2 Selective visual sources

Free components may be adapted from Rare UI, Magic UI, Aceternity UI, React Bits, and 21st.dev only when they fill a defined interaction need. The initial mix is deliberately small:

- shadcn/ui supplies every core control and layout primitive;
- Magic UI supplies the free number-ticker treatment for dashboard metrics;
- React Bits supplies a free step/progress treatment for OCR and analysis;
- Aceternity UI supplies one free, subtle spotlight or grid accent on login/upload empty states.

Rare UI and 21st.dev remain vetted secondary catalogs for a specific gap, not quotas that force extra components into the product. No full kit or template is installed. Paid, Pro, all-access, subscription-only, and license-unclear assets are skipped. Every copied component is reviewed for dependencies, keyboard behavior, reduced motion, bundle cost, and license; its source and license are recorded in `THIRD_PARTY_NOTICES.md`.

All copied components are rewritten to consume the local tokens and primitives. Source origin does not create a visible design boundary.

## 8. Visual system

The product uses a trustworthy, data-dense inspection style rather than a decorative marketing style.

### 8.1 Tokens

- Primary: deep navy/blue.
- Accent: restrained saffron for primary attention; teal for secondary emphasis.
- Surfaces: white and cool slate with clear borders.
- Semantic statuses: pass green, fail red, warning amber, manual-review violet, not-applicable grey.
- Spacing: 4px base with an 8px primary rhythm.
- Radius and elevation: one restrained scale shared across every page.
- Icons: one Lucide outline family; no emoji as structural icons.

### 8.2 Typography

Use a locally bundled readable sans-serif system: Lexend for headings and Source Sans 3 for body/data, with system-font fallbacks. Responsive sizes use `clamp()` and semantic type tokens. Body text does not fall below 16px on mobile. Browser zoom and operating-system text scaling remain functional; the user does not manage an application font-size setting.

### 8.3 Motion

Animation communicates upload, OCR, analysis, expansion, and successful completion. Micro-interactions use shared 150–300ms tokens, transform/opacity only, and at most one or two animated focal elements per view. `prefers-reduced-motion` disables nonessential motion. Heavy visual effects are dynamically loaded and never block inspection controls.

## 9. Core user flows

### 9.1 Sign in

The login form uses visible labels, password reveal, inline validation after blur, disabled/loading submit states, and an actionable generic credential error. On success it returns to the originally requested protected route when safe.

### 9.2 Start inspection

The workspace begins with a clear mode choice: `Retail package` or `E-commerce screenshot`. The user captures or uploads evidence, sees a preview, selects only required context, and starts the scan. OCR and analysis stages show progress with cancellation/retry behavior. The user never configures font size.

### 9.3 Review results

The results page prioritizes overall status, retake guidance, and the annotated evidence. Verdict cards expose citation, evidence, confidence, reasoning, measurement method, and review state. Selecting a verdict highlights its boxes. Manual-review items explain what a human must check.

### 9.4 Search repository

Search and common filters are immediately reachable. Advanced filters use progressive disclosure. Results are paginated, sortable, URL-addressable, and usable on mobile as stacked records. Empty results explain how to broaden filters.

### 9.5 Dashboard

Dashboard filters match repository semantics. KPI cards show total scans, pass/fail/review distribution, pass rate, and top failed rules. Trend and rule-frequency charts include tabular alternatives, exact values, legends, and non-color status cues.

### 9.6 Administration

The user table supports creation, deactivation, role changes, and password reset with explicit confirmation for sensitive actions. The current administrator cannot remove the final active admin capability.

## 10. State, feedback, and responsive behavior

Every data surface defines loading, empty, success, retryable error, offline, unauthorized, and forbidden states. Toasts supplement rather than replace inline errors. Route changes move focus to the main heading; dialogs restore focus to their trigger.

The UI is verified at 375px, 768px, 1024px, and 1440px and in phone landscape. Interactive targets are at least 44px, page zoom is never disabled, tables have responsive alternatives, and no critical action depends on hover.

## 11. Export behavior

- PDF is the immutable presentation report and includes the annotated evidence image.
- DOCX is editable but carries the same scan ID, generated-at time, evidence, rule version, and review state.
- CSV is for repository analysis, neutralizes spreadsheet formulas, and respects active permissions and filters.
- Failed generation returns a structured error and leaves the underlying scan unchanged.

## 12. Testing

- Password hashing, login/logout, expiry, revocation, inactive users, and cookie settings.
- Inspector ownership and administrator access for every protected endpoint.
- Pagination, deterministic sorting, each filter, combined filters, and search authorization.
- Review-action validation and append-only audit behavior.
- PDF/DOCX report-model parity and CSV injection protection.
- Component tests for forms, filters, progress, verdict selection, and responsive navigation.
- Keyboard-only and accessible-name checks for critical flows.
- Reduced-motion behavior and semantic status cues.
- Next.js type checking and production build with offline assets.

## 13. Acceptance criteria

- No protected scan or export is accessible without a valid session.
- Inspectors cannot access another inspector's scans; administrators can.
- Search/filter/pagination are server-backed and URL-preserving.
- PDF and DOCX contain equivalent conclusions and evidence metadata.
- The frontend uses one token system despite selectively sourced free components.
- No paid component or runtime-remote asset is required.
- All critical flows are keyboard accessible, responsive, and understandable without color or animation.
