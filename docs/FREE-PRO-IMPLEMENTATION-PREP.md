# Free / Pro implementation preparation

Prepared 11 October 2026 from SCHOOL-CLUB-PRODUCT-BRIEF.md and the current codebase. Status: owner-approved package and beta scope; infrastructure recommended below, accounts not yet provisioned. This document does not activate restrictions, publish pricing or authorise charges.

## Confirmed launch decisions

Confirmed by the owner on 11 October 2026:

- Individual Free and Pro first; keep the architecture ready for school/club scopes.
- Use the feature split in the school/club brief: one recoverable Free draft and basic planning; Pro library, reusable aircraft, dedicated mass/balance and runway-wind workflows, dedicated exports and cloud sync. Essential warnings remain available to both.
- Private beta for up to 25 people; manually granted Pro. No payment integration in the first release.
- Price and billing currency/cadence remain undecided. There will be NO trial. Do not add trial copy, automatic trial grants or conversion logic.
- Existing users receive 30 days of Pro from the announced migration date, then retain historical read/download access. This is a migration entitlement, not a new-user trial. The migration date itself remains unset; do not start the clock during implementation.
- Google sign-in first, through verified backend authentication.
- Zero infrastructure budget. No existing backend, authentication or payment accounts. GitHub Pages is the current development hosting direction.

Remaining implementation details: define an explicit existing-user roster/cutoff (browser-only identities are not reliable evidence of eligibility); choose beta grant expiry/revocation policy; set a migration announcement date only when the new version is ready; settle retention/storage limits and whether historical records can be copied into the Free working draft. Free guest planning remains an open UX choice. Future paid cancellation/refund and tax decisions are deferred with billing.

Known owner instructions from the legal work: no incorporated company yet; gustlog@outlook.com is proposed but not activated; intended worldwide audience; freemium is planned but no commercial terms were settled. Do not treat a draft legal document as merchant onboarding approval or a completed privacy disclosure.

## Approved feature matrix

| Capability | Free | Pro individual |
|---|---|---|
| Basic route calculation and on-screen navlog/SOP | Included | Included |
| Existing warnings, data source/age and weather refresh | Included without advertising delay | Included |
| Recover current working draft on this device | Included | Included |
| Named saved-flight library/history | Not included | Included |
| Reusable personal aircraft profiles | No library; current-plan inputs remain usable | Included |
| Dedicated mass/balance workflow | Not included | Included |
| Dedicated runway-wind workflow | Not included | Included |
| Gustlog-generated print/PDF | Not included initially | Included |
| Cloud sync | Not included | Included only when implemented |
| Offline material | Existing cached resources, limitations shown | Explicitly supported resources after validation |
| School/club data and reviewer access | Requires a separate scoped grant | Requires a separate scoped grant |

A gate must not discard the draft, hide an existing calculation warning or block weather refresh. Browser screenshots/printing are not preventable; gating concerns the dedicated export feature. Historical data-access exports should be distinguished from generating a new planning document.

## Repository findings and change map

| Area | Current evidence | Required preparation/change |
|---|---|---|
| src/services/ad-service.ts | Pro reads a device-wide localStorage flag | Replace production authority with server capabilities; never import this flag as paid status |
| src/context/AdContext.tsx | Five-second countdown wraps actions; Pro toggle bypasses it | Retire countdown dependencies from save, preparation and export; use a separate upgrade UI at a capability boundary |
| src/components/SavedFlightsView.tsx | Copy advertises five Free slots; inspected save service has no corresponding limit | Apply the approved split and 30-day transition; use one approved catalogue for marketing and gating; protect existing records |
| src/App.tsx | Save orchestration, planner state, alternate/fuel/wind and navigation | Extract complete draft state; connect every entry point to capabilities rather than menu-only locks |
| src/components/MassBalanceView.tsx | Working aircraft/loading lives in component state | Lift into the canonical draft so switching views and saving do not lose inputs |
| src/components/RunwayWindView.tsx | Reports a result back to the app | Store input references, selected runway, weather provenance and results together |
| src/components/KneeboardModal.tsx | Export uses the ad-break wrapper | Replace with export capability; preserve legal notice, draft context and captured inputs |
| src/components/SideMenu.tsx | Tool navigation, Pro badge and export entry points | Show actual plan and scope; locked-feature explanation with a return to the unchanged draft |
| src/services/auth-service.ts | Local account adapter plus locally generated session tokens | Introduce verified server identity and session coordinator; swapping only the adapter is insufficient |
| src/data/saved-flights.ts | Local records omit full preparation details; automatic guest claiming exists | Async repository boundary; full schema; opt-in, idempotent import preserving local originals |
| public/sw.js | Broad network-first caching of successful GET responses | Public asset allowlist; exclude auth/private APIs; partition supported private caches and clear them on sign-out |
| .github/workflows/deploy.yml | Static GitHub Pages deployment configuration | Separate server API required for trusted identity, entitlements, persistence and billing callbacks; actual deployed setup unverified |
| src/data/legal-terms.ts | Free-service review draft and no authorised future charging | Update only when actual cloud processing, merchant, price, cancellation and retention details are known |

Current legal changes already in the working tree must be preserved. This preparation work does not rewrite them or change aircraft calculation engines.

## Entitlement design

Use capabilities and scope, not one global isPro boolean. Suggested capabilities: planner.use, draft.recover, library.create, aircraft.library.manage, mass_balance.use, runway_wind.use, document.generate, cloud.sync. Historical record read/download permissions are separate from paid feature creation. Existing warnings/source information remain part of the base planner.

A grant identifies its beneficiary, source (personal subscription, manual beta, organisation sponsorship), scope (personal or a specific organisation/booking), capability set, start/end timestamps and status. The server resolves effective access using the authenticated session. Organisation grants never expose a personal library or confer unrelated organisation membership.

The frontend consumes a server capability response to explain available actions; it is not the authority for server writes or downloads. Do not send an arbitrary user ID as proof of identity. Validate plan rules at every protected operation, including direct URLs and alternate save/export entry points. Scope manual beta grants to named authenticated users with explicit expiry and a revocation path.

Keep entitlement loading/error states distinct from Free. If the server cannot be reached, preserve the local draft and show that access cannot be verified. Offline use of previously granted capabilities needs an explicit, bounded policy; do not assume permanent Pro from cached state.

## Website behaviour to implement

1. Landing page: approved Free/Pro comparison, current availability and one clear CTA per plan. No invented price, trial, cloud capability or lifetime promise.
2. Registration: verified identity flow with reviewable current terms/privacy and a defined Free or beta entitlement after server acknowledgement.
3. Cockpit: account/plan status and feature-boundary upgrade dialog; dismiss returns to the same draft. No countdown ads or payment-driven delay on weather.
4. Library: distinguish current draft from named records; explain Free restrictions and historical read/download rights without deleting records.
5. Account: billing/manage-plan controls only once there is a real provider; show renewal or expiry from verified server state.
6. Upgrade return: payment redirect never grants access by itself; show confirmation pending until the server verifies the purchase.
7. Downgrade: preserve data and explain which new actions stop, when they stop, and how to retrieve existing work.

## Implementation increments and verification

### A. Catalogue and UI preparation

Use the confirmed scope above. Create one typed catalogue with approved capability names, feature descriptions and availability. Add plan comparison and locked-feature components against development fixtures. Keep fixtures explicitly non-production and do not silently activate gates for existing users.

Done when both plans render consistently, unavailable future features are labelled, dismissal preserves the draft, and no price is guessed.

### B. Complete draft persistence

Unify navlog, aircraft/loading, runway inputs, alternate, fuel overrides, wind provenance and units. Separate local working-draft recovery from library persistence. Add versioned serialisation and an async repository interface while preserving legacy compatibility.

Done when save/reopen reproduces inputs and outputs, view changes preserve loading/runway state, malformed records fail safely, and Free refresh recovery works.

### C. Verified accounts and cloud foundation

Provision the selected infrastructure after account setup; the zero-budget recommendation is below. Implement server-backed sessions, private API authorisation, user-scoped storage, manual grants and safe caching. Add explicit local-data import after verified sign-in. Do not upload password hashes, local tokens or demo plan flags.

Done when another user's IDs cannot grant read/write/download access, sign-out clears private caches, revoked grants cease authorising writes, and import retries do not duplicate records.

### D. Activate approved Free/Pro boundaries in beta

Replace ad-based Pro checks and remove countdown wrapping. Enforce capabilities on server operations and every frontend entry point. Implement the approved 30-day migration entitlement and subsequent historical read/download access; show local/synced/pending states accurately.

Done when direct URLs and altered browser flags cannot bypass protected server access, warnings/weather remain accessible, and upgrade prompts preserve work.

### E. Billing, only if selected

After offer and merchant details are settled: server checkout creation, verified/deduplicated provider events, subscription lifecycle, cancellation and payment failure policy. Store price identifiers and secrets server-side. Test checkout in provider test mode before any real charges; no account creation or purchases are implied by this document.

Done when duplicate/out-of-order events are handled, return URLs cannot fake access, cancellations use the chosen effective date, and downgrade preserves agreed record access.

### F. Release review

Run engine/auth/navigation regressions, meaningful new persistence/permission/payment tests, and the production build. Walk through desktop and mobile as Free, Pro, expired Pro and two separate users. Verify print output and offline behaviour. Complete merchant/privacy/terms disclosures and the data update process before paid release.

School/club implementation, if selected, adds tenant isolation, versioned aircraft/templates, manual assignments, immutable submissions and attributable human review before commercial school promises.

## Test cases that matter

- Free draft survives refresh, denied upgrades, sign-in redirects and temporary connectivity loss.
- Saved preparation round-trip retains resolved coordinates, station loads, fuel units/overrides and source times.
- Local Pro flag and locally generated tokens cannot authorise server APIs.
- User A cannot read, update, export or delete User B's records through guessed IDs.
- Personal Pro does not authorise a school workspace; scoped sponsored access does not unlock the personal library unless explicitly granted.
- Expiry/revocation removes writes at the correct timestamp, not historical records.
- Current entitlement fetch failure does not overwrite a saved draft or falsely label a paying user Free.
- Price, renewal and trial language match the actual configured offer.
- Billing webhook retries and reordering do not duplicate grants or incorrectly restore cancelled access.
- New server responses are excluded from generic service-worker caching.

## Preparation outcome

Codebase and brief reviewed; implementation boundaries and dependencies mapped. The owner has resolved release/package/beta scope and follow-up questions; see confirmed decisions above. No product gates, prices, payment integration, provider accounts or deployment changes have been activated by this preparation pass.


## Zero-budget infrastructure recommendation

Recommendation checked against provider documentation on 11 October 2026. This is an architecture recommendation, not a guarantee of permanent free service or evidence that accounts have been created.

| Component | Proposed service | Beta use |
|---|---|---|
| Source control | GitHub | Keep the existing repository and review workflow |
| Static website | Cloudflare Pages Free | Build from GitHub, serve the current Vite output on a provided pages.dev address; no domain purchase needed for beta |
| Identity | Supabase Auth + Google OAuth | Real sessions; beta allowlist checked server-side; Google login alone does not grant beta membership or Pro |
| Database | Supabase Free PostgreSQL | User-owned preparation records, immutable future snapshots and scoped entitlement grants; enforce row-level access policies |
| Manual Pro grants | Admin-only database operation initially | Named beneficiary, scope, explicit start/end and revocation; never editable by ordinary users |
| Exports | Existing browser document generation | No separate PDF server or stored PDF archive needed for first beta |
| Payments | None | No card collection, checkout, subscription or trial |

Why this combination: the project already produces a static Vite website, so it does not need a full-stack rewrite. A managed relational database and authentication service reduce custom infrastructure while fitting later organisations, memberships and review snapshots. Cloudflare Workers/D1 is a viable alternative but would require more application identity/session work; do not choose it just to reduce provider count.

GitHub Pages is not the recommended application host: its published limits prohibit using it to run an online business or commercial SaaS and advise against sensitive transactions such as passwords. Keep GitHub for the code and avoid launching the commercial app on Pages. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

Cloudflare Pages Free currently allows 500 builds per month and a 25 MiB maximum individual asset. The checked-in largest public asset, waypoints.sqlite, is about 8.9 MiB, so it fits that per-file limit. The deployment still needs validation; free hosting does not establish aviation-data suitability. [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)

Supabase Free currently includes a 500 MB database, 50,000 monthly active users, 1 GB file storage and 5 GB uncached egress, plus a separate 5 GB cached allowance. These are provider quotas, not a promise that Gustlog can serve that many users. Start with the selected 25-person beta, text/structured records, no attachments, and monitor database/egress growth. Free projects may pause after inactivity; this is not an always-available operational service. [Supabase pricing](https://supabase.com/pricing), [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

Google OAuth is included as a social auth option. Supabase's default email sender is restricted to project-team addresses and is not a production email-delivery solution. Do not add beta pilots as project administrators to bypass that restriction. The owner selected Google-first login, so public email/password and magic-link flows should not appear enabled in the beta. Custom SMTP can be considered later. [Google provider setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp)

The weather budget remains a separate dependency: Open-Meteo's hosted free API is for non-commercial use, while commercial access requires a subscription. Its data licence is distinct from permission to use the hosted free endpoint. Do not assume a free private beta qualifies simply because it does not charge pilots. Confirm evaluation eligibility, arrange permission/licensing or use a suitably licensed alternative/manual input before real beta use; do not quietly remove available safety information. [Open-Meteo pricing and permitted use](https://open-meteo.com/en/pricing)

No paid plan, domain, SMTP service, external account, secret or deployment was created by this recommendation. Keep service/admin keys out of browser builds and the repository. Verify provider terms, quotas and data handling again at actual setup.

## Next concrete implementation increment

Build the approved plan catalogue and full-draft persistence locally; prepare the Supabase schema, row-level policies and identity integration for the Google-first beta. Keep the current functioning app until configuration exists and migration is ready. Restrict server records to the beta allowlist and use manual grants rather than self-service Pro activation. Replace countdown upsells with feature-boundary messaging that says private beta, never trial. Prepare Cloudflare deployment configuration without publishing or starting the 30-day migration timer.
