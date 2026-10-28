# Gustlog: individual planning and school / aeroclub preparation review

Product and engineering proposal · 11 October 2026

Status: proposed implementation brief for developer discussion. Existing capabilities below were inspected in the repository. Proposed capabilities are not implemented by this document. Prices and commercial commitments remain undecided.

## 1. Product proposition

Gustlog helps a pilot prepare a VFR route, understand the assumptions behind the plan, and present that preparation for review. For schools and aeroclubs, it creates a shared process around the tools already in Gustlog: aircraft configuration, route planning, fuel, mass and balance, runway wind, and the SOP/kneeboard.

The central promise is: **Prepare your flight. Demonstrate your preparation. Make the briefing easier.**

The pilot should enter information once. The reviewer should see a coherent preparation pack, missing information, the pilot's reasoning, and changes since the previous submission. A school can include access in a lesson or aircraft rental; an aeroclub can include it in membership or booking benefits.

Gustlog must distinguish preparation completeness, a human review, and any separate organizational authorization. A completed checklist is not proof of competence or a declaration that a flight is safe. The first release records preparation and review; it does not implement operational dispatch, solo authorization, or an automatic go/no-go decision.

Schools benefit from structured assignments and instructor feedback. Clubs benefit from maintained aircraft profiles, consistent preparation, and review where their own procedures require it. Do not require instructor review for every club flight by default: the organization chooses a review-required or self-preparation template. Self-preparation never displays a human-review badge.

## 2. Proposed product packages

These boundaries are recommended defaults for the pilot launch, subject to owner approval before commercial release.

| Capability | Free | Pro individual | School / aeroclub |
|---|---|---|---|
| Basic route planner and on-screen SOP/navlog | Yes | Yes | Yes |
| Essential warnings and source/age labels for available calculations | Yes | Yes | Yes |
| Recover the current draft after refresh | Yes, on current device | Yes | Yes |
| Saved flight library and reusable personal aircraft profiles | No | Yes | Yes, within access scope |
| Dedicated mass/balance and runway-wind workflows | No standalone access | Yes | Yes |
| Product-provided PDF/print export | No initially; test a sample export separately | Yes | Yes |
| Cloud synchronization | No | Yes | Yes |
| Supported offline saved material | Current cached resources only, clearly labeled | Yes, after offline validation | Yes, after offline validation |
| Shared aircraft, templates, membership and review queue | No | No | Yes |
| Reviewer comments and immutable submitted versions | No | No | Yes |
| Booking-linked access | No | No | Yes |
| Scenario comparison | Later | Later Pro feature | Included when released |

Free is a useful single-session planner, not a deliberately broken experience. Keep one recoverable working draft, without a named library or flight history. Do not erase work on refresh, hide warnings behind payment, or delay a weather refresh with an advertisement. Browser print and screenshots cannot realistically be prevented; the export restriction refers to Gustlog's dedicated document feature.

Pro means all individual capabilities, not all organizational capabilities. Replace the demonstration Pro toggle with actual entitlements before charging. Remove countdown ads from preparation, review, and export flows; offer upgrades at a feature boundary without discarding the draft.

An organization can sponsor either membership-wide Pro capabilities or capabilities limited to its bookings/preparation records. Make the scope explicit in the contract and UI. A personal Pro subscription does not grant access to an organization's data. Organization sponsorship does not expose the pilot's personal flight library to the school.

## 3. Access included with a lesson or rental

Interpret “an hour of flying includes Gustlog” as a distribution and sponsorship model, not a sixty-minute software timer.

Example: a school creates a booking for a named pilot and aircraft. The pilot receives access early enough to prepare, opens a workspace with the aircraft already selected, completes the preparation, submits it if required, and retains access through the debrief.

For the MVP, an administrator enters the booking manually or creates an assignment without a booking. Do not build scheduling, payments for aircraft rental, or external booking integrations yet.

Each sponsored grant needs a user, organization, scope, start time, end time, and status. Store explicit timestamps rather than calculating access from a hard-coded one-hour duration. Configure preparation/debrief windows at organization level and show the actual expiry to the user. The commercial owner must select launch defaults.

Cancellation or expiry removes sponsored editing capabilities, not historical records. Permit the pilot to read and download their own previously submitted preparation and feedback within the documented retention policy. Other pilots' records remain inaccessible. Retention and access removal must be separate operations.

When a booking is rescheduled, update the grant explicitly and log the change. A departure-time or aircraft change also makes the existing review inapplicable to the new plan. A personal Pro subscription can preserve personal features after sponsorship expires, but cannot bypass a revoked organization membership or gain organization editing rights.

Start commercial testing with a base organization fee and an included active-pilot allowance. Keep billing metrics separate from access permissions. Do not meter aircraft flight hours in the first version. Pricing, allowances, cancellation rules and tax treatment need a separate commercial decision.

## 4. End-to-end workflow

### A. Set up the organization

An administrator creates the organization, invites named members, assigns permissions, publishes aircraft profiles, and creates a versioned preparation template. A template contains required sections, reasoning questions, review requirements, and explicitly configured data-age rules.

### B. Create a preparation

The pilot opens a booking or assignment and sees the aircraft, planned departure, task, required sections and reviewer. A preparation can also be created without a booking. Existing personal routes may be copied into the workspace; this creates a new organization record rather than sharing the whole personal library.

### C. Prepare and explain

Reuse the current planner. Add a preparation panel with route, aircraft/loading, fuel/alternate, weather, route considerations, pilot reasoning, and unresolved items. Each section shows its actual status and any missing input.

Example prompts: “Why did you select this altitude?”, “What is your diversion plan?”, “Which change in conditions would make you reconsider?” Organizations write and maintain their questions. The MVP stores answers for human review; it does not use an AI score to certify preparedness.

Provide a manual evidence field for information not integrated, such as an external briefing reference, source URL, checked-at time and pilot note. Label this “pilot-reported check,” not “verified by Gustlog.” File uploads can follow later; they are not necessary for the first pilot.

### D. Submit an exact version

Submission creates an immutable snapshot of the inputs, outputs, evidence, answers, aircraft version, template version and calculation version. The server validates required fields, permitted actor, organization and optimistic-lock revision before accepting it.

Required missing fields block submission. Reported concerns may be submitted for instructor discussion, visibly unresolved. They block a satisfactory-review decision until resolved or explicitly addressed under a permitted, recorded policy. Invalid calculations and missing mandatory sections cannot be converted into a pass by entering a comment.

### E. Review

The reviewer sees the snapshot, calculated findings, source age, reasoning answers, and a comparison with the previous submission. They can request changes or record “Preparation reviewed” with an outcome and comment. Reviewers cannot silently edit pilot answers or calculations. Feedback is attributable to a named user and timestamp.

### F. Revise, refresh and debrief

Editing creates a new draft revision. Prior submissions and reviews remain intact. A previous review never automatically applies to changed preparation. The pilot resubmits the new version; the reviewer sees what changed.

After the flight, add an optional debrief note: what changed, which assumptions differed, and learning points. Actual-versus-planned analytics can be added later when actual measurements and their sources are available.

## 5. Existing code: reuse and required changes

| Existing area | What exists | Developer instruction |
|---|---|---|
| `src/App.tsx` | Route/profile, departure, per-leg winds, alternate and fuel state; save/load orchestration | Extract a canonical preparation state and serialization boundary. Avoid a second planner implementation for schools. |
| `src/engine/navlog-engine.ts`, `wind-triangle.ts`, `mass-balance.ts`, `runway-wind.ts` | Calculation engines | Reuse as pure calculations. Record engine/build version with each snapshot. Keep organization policy evaluation separate from physics/math. |
| `src/types.ts` | `SavedFlight`, aircraft, fuel, wind, mass/balance and runway types | Add explicit preparation/snapshot types; retain legacy saved-flight compatibility during migration. |
| `src/data/saved-flights.ts` | Browser-local route/profile saves, altitude overrides and summary | Introduce an asynchronous repository interface and authenticated remote implementation. Current saves are not complete preparation records. |
| `src/components/MassBalanceView.tsx` | Component-owned loading/profile state | Make selected aircraft/loading controlled by the canonical preparation state. Persist exact station loads and results. |
| `src/components/RunwayWindView.tsx` | Route-based runway tool with result callback | Persist chosen runway, input weather and provenance alongside results; results alone are insufficient. |
| `src/components/KneeboardModal.tsx` | SOP/fuel UI and document output | Render both editable drafts and immutable snapshots explicitly. Export must show preparation ID, snapshot version, sources and review information. |
| `src/services/auth-service.ts`, `src/types/auth.ts`, `src/context/AuthContext.tsx` | Local authentication/profile adapter and session coordinator | Replace production identity with server-backed authentication. Refactor session coordinator too: merely swapping the adapter leaves locally generated tokens in place. |
| `src/services/ad-service.ts`, `src/context/AdContext.tsx`, `src/components/ads/` | Browser-local demonstration Pro state and countdown advertising | Replace plan checks with an entitlement service. A local Pro flag must never authorize server access or payment status. |
| `src/utils/url-route.ts` | URL-encoded route sharing | Keep for non-sensitive route sharing. Use authenticated IDs for organization preparations; never put answers, reviews or membership data in URL payloads. |
| `src/data/storage-manager.ts`, `tile-cache.ts`, `public/sw.js` | Local storage/caching and broad network-first service worker | Separate private draft cache from public assets. Exclude auth/API/private responses from generic service-worker caching. Partition private caches by user and organization. |
| `src/data/airac-meta.ts`, weather and airspace modules | Metadata, weather integrations and local checks | Persist provenance and validity. Do not infer complete coverage from absence of warnings. |
| `src/components/SideMenu.tsx`, `src/utils/app-navigation.ts`, `ActiveView` | Existing cockpit navigation | Add organization switcher, preparations, review queue and aircraft/templates views using the existing navigation model. |

Important gaps found in the inspection:

- `SavedFlight` does not preserve resolved coordinates, per-leg weather, loading, detailed fuel overrides, alternate details, source records or reviewer evidence. Reopening a route string later can produce different results. A review must use a full snapshot.
- `MassBalanceView` maintains its own working profile; it must join the same saved preparation as the navlog and SOP.
- Local user filtering is not access control. Existing guest migration automatically claims local guest records; do not automatically upload or assign those records to a new cloud identity.
- `AircraftProfile.fuelUnit` is a flow-rate unit while some fields represent quantities. The new schema must distinguish fuel volume (`l`/`US_gal`) from flow (`l/h`/`US_gal/h`) and explicitly convert between them.
- The checked-in database metadata states an expiration of 23 September 2026, before this brief's date. This is a metadata observation, not independent verification of the underlying data. Establish an actual data update and provenance process before a live pilot; changing the label alone is insufficient.
- Existing comments/defaults about reserve fuel and crosswind statuses are not an organization policy framework. Do not turn generic defaults or a “safe” calculator label into a global readiness decision.

## 6. Canonical preparation record

Create a versioned schema with explicit units and UTC timestamps. Display local time with timezone context. Resolve “Now” into a concrete planned departure time on submission.

Each snapshot must include:

1. Route input plus resolved waypoints, coordinates, per-leg altitude and custom points.
2. Aircraft registration/reference and immutable aircraft-profile version; performance assumptions and sources.
3. Departure timestamp; destination, alternate and diversion assumptions.
4. Per-leg wind inputs, mode, source, retrieval/issue/observation times where provided, and forecast validity.
5. Fuel quantities, all overrides, reserve settings, units and outputs.
6. Mass/balance profile version, station loads, fuel density assumptions, units and results.
7. Selected runway, heading reference, wind reference, gust inputs and results.
8. External-check evidence, template answers, unresolved findings and reviewer-visible notes.
9. Data versions/coverage, template version, rule version, schema version and engine/build version.
10. Calculated outputs exactly as submitted, server receipt time and snapshot identifier.

Store inputs and outputs. Reject non-finite numbers and invalid units. Preserve original snapshots when an engine or dataset changes. A “recalculate with current data” action produces a new draft and an explicit comparison; it never overwrites the record.

Do not treat retrieval time as observation time. Missing validity information remains unknown. Distinguish aircraft limitations, demonstrated values, organization policy thresholds and personal minima as separate fields with separate sources. Published organization aircraft profiles require a named maintainer and reference documentation; generic presets are a starting point, not verified data for a particular registration.

## 7. Data model and authorization

Recommended logical entities; the backend/database vendor can be selected by the development team.

| Entity | Required purpose/fields |
|---|---|
| Organization | Name, type, timezone, status and policy settings |
| Membership | Organization/user, permissions, invitation/active/revoked status |
| Aircraft + AircraftVersion | Organization ownership; immutable performance/loading/source versions and publication status |
| Template + TemplateVersion | Required sections, prompts, applicability, review requirement and rules |
| Booking/Assignment | Organization, pilot, aircraft, departure, task, optional external reference and cancellation status |
| AccessGrant | Subject, sponsor, scope, capabilities, starts/ends, status and provenance |
| Preparation | Personal owner or organization, pilot, optional booking, working revision and selected versions |
| PreparationSnapshot | Immutable numbered payload, server timestamps, schema/engine versions and integrity hash |
| Review | Snapshot, assigned reviewer, decision, comments and server timestamp |
| Comment | Snapshot/section reference, author and timestamp |
| AuditEvent | Actor, organization, entity, event, time and correlation identifier |
| Subscription/Entitlement | Provider reference, beneficiary, capabilities, effective dates and verified status |

Use server-generated IDs and database constraints. All organization references must belong to the same tenant, including aircraft, booking, snapshot and reviewer. A hash can detect changes but is not itself proof of pilot identity or competence.

Permissions:

- Pilot: work on own assigned preparation; submit; read own snapshots and feedback.
- Reviewer: read assigned preparations within their organization; comment and review, without editing pilot evidence.
- Aircraft maintainer: publish aircraft versions, without automatically becoming a reviewer.
- Administrator: manage membership, assignments and configuration. Reviewer permission must be separately granted; an admin label does not establish instructional qualification.

Disable self-review for review-required submissions. Review permission represents the organization's designation, not a credential independently certified by Gustlog. Avoid shared accounts. Revoke write access immediately when membership is revoked and recheck permissions at transaction time. A user may belong to multiple organizations; workspace selection is explicit and never substitutes for server authorization.

## 8. State transitions and review validity

Maintain separate concepts rather than one green “ready” boolean:

- Preparation lifecycle: `draft`, `submitted`, `changes_requested`, `reviewed`, `archived`, `cancelled`.
- Completeness: `incomplete` or `complete`, derived from the applicable template.
- Evidence freshness: `current`, `stale` or `unknown`, derived from captured evidence and configured rules.
- Review applicability: `not_reviewed`, `applies_to_current_version`, `new_version_needs_review`, or `evidence_needs_refresh`.

`reviewed` records the historical human action. It does not force freshness or completeness to green forever. When new evidence becomes necessary with passage of time, show that the historical review remains but a refreshed submission is needed. MVP may conservatively invalidate applicability on every preparation-content change; display preferences are outside the preparation payload and do not invalidate it.

Submission and decision operations must be atomic. Use expected revision/snapshot IDs and idempotency keys. If the pilot edits while an instructor is reviewing, the instructor may record a review of the old snapshot with explicit notice, but cannot mark the newer draft as reviewed. Concurrent decisions must not silently overwrite each other; require an explicit superseding decision with history.

For self-preparation templates, record submission/completion without generating a reviewer identity or “reviewed” status. Cancellation and archival preserve prior evidence. A new aircraft version does not rewrite old snapshots; flag affected current preparations for review against the replacement profile.

## 9. Service boundaries and API contract

Suggested new frontend boundaries:

```text
src/types/preparation.ts
src/types/organization.ts
src/context/PreparationContext.tsx
src/services/preparation-repository.ts
src/services/organization-service.ts
src/services/entitlement-service.ts
src/engine/preparation-validation.ts
src/engine/preparation-diff.ts
src/components/preparation/PreparationPanel.tsx
src/components/preparation/PreparationReview.tsx
src/components/organization/ReviewQueue.tsx
```

The remote service should support the following operations (route names illustrative):

| Operation | Contract |
|---|---|
| `POST /organizations/{id}/preparations` | Validate membership, assignment and aircraft/template references; return draft and revision |
| `PATCH /preparations/{id}` | Require expected revision; return conflict on stale edits |
| `POST /preparations/{id}/submissions` | Validate and snapshot atomically; require idempotency key and expected revision |
| `GET /preparations/{id}/snapshots/{version}` | Authorize before returning immutable payload |
| `POST /snapshots/{id}/reviews` | Validate assigned reviewer, tenant and state; record decision and audit event |
| `GET /organizations/{id}/review-queue` | Return only authorized records and current review applicability |
| `GET /me/entitlements` | Return effective capabilities and scopes; never trust a supplied user ID |
| `POST /organizations/{id}/bookings` | Create manual booking/assignment and explicitly scoped sponsorship |

Apply authorization to every read, write, export and download. Evaluate reviewable calculations using shared versioned code on the server where feasible, and record discrepancies. Do not accept client-supplied totals, timestamps, membership roles or review statuses as authoritative. Server validation must use captured inputs, not silently replace them with newly fetched weather.

Billing events must be verified, deduplicated and reflected in server-managed entitlements. Allow manually granted pilot-organization access before automated billing is built. Effective capabilities combine valid personal and sponsored grants within their respective scope; subscription expiry never deletes data. Do not implement a single global `isPro` boolean.

## 10. Offline behavior, migration and record handling

Allow local draft editing where supported, with “saved on this device” distinct from “synced.” Submission/review becomes official only after server acknowledgement. Queued operations must not display success before acknowledgement. On reconnection, detect revision conflicts and preserve both copies for resolution rather than silently using the last writer.

Cache only explicitly supported public resources and private draft/snapshot content. Show when data was cached and its validity. Do not promise all maps/weather are available offline based only on the current service worker. Clear private caches on sign-out and prevent the next user from seeing the previous user's content.

After verified cloud sign-in, offer an explicit preview/import of legacy local flights. Preserve the originals, make import idempotent, and label imported records incomplete until missing evidence is supplied. Do not migrate local password hashes, browser tokens or demo Pro status into cloud credentials/entitlements. Existing users should receive a clear transition policy before previously available features are restricted.

Organization and personal records remain separate. Define retention, pilot access after leaving, and deletion/export responsibilities before release. Audit events are append-only for normal application roles; privileged maintenance and retention deletion require controlled procedures. Do not market this initial log as a certified or tamper-proof audit system.

## 11. Implementation sequence

### Phase 1 — Complete preparation persistence

Extract canonical state; connect mass/balance, runway and SOP; serialize exact inputs/results; implement schema migration and read-only snapshot rendering. Keep existing individual workflows functional. Add source age/coverage indicators and distinguish unknown values from zero.

Deliverable: a preparation can be saved and reopened without losing or silently changing reviewed inputs. No organization rollout yet.

### Phase 2 — Shared workspace foundation

Implement server identity/session handling, tenant permissions, organization membership, aircraft/template versioning, remote storage and scoped entitlements. Fix generic private-response caching before real accounts are introduced.

Deliverable: two users can securely work in the same organization while a different organization cannot access their records.

### Phase 3 — Review pilot

Add manual assignments/bookings, preparation panel, immutable submission, review queue, feedback, changes comparison, review applicability and snapshot export. Use manual organization access grants. Include in-app review status; email notifications can follow separately.

Deliverable: one school and one aeroclub can complete the full preparation/review/debrief loop. Use an organization-selected current-data process and published aircraft profiles before live use.

### Phase 4 — Commercial packaging

Introduce Free/Pro gates, billing, sponsored windows, cancellation/expiry behavior and migration communications. Confirm prices and retention terms. Launch only capabilities verified in preceding phases.

### Later enhancements

Scenario comparison; student training exercises; external booking integrations; reminders; supported evidence attachments; aggregate learning trends. Defer full scheduling, instructor payroll, aircraft maintenance tracking, regulatory certification, automatic dispatch and AI readiness scoring.

## 12. Acceptance criteria for developers

1. Save/reopen preserves route coordinates, aircraft/version, loading, fuel overrides, alternate, departure, wind inputs and source times; submitted document matches the snapshot.
2. Switching mass/balance, navlog and SOP views does not reset or diverge shared values. Explicit conversions are tested for fuel volume/flow and weight units.
3. A pilot can submit a complete assigned preparation; missing required answers block submission with actionable field links.
4. Unknown or stale evidence never produces an unqualified current status. External pilot-reported checks remain labeled as such.
5. An authorized reviewer can request changes and record a review of a specific snapshot; a pilot cannot grant themselves reviewer privileges or review their own required submission.
6. Editing a reviewed preparation leaves its historical snapshot intact and marks the current version as needing review. Passage of time can independently make evidence stale.
7. Concurrent edits produce a recoverable conflict. Retrying submission or payment events does not duplicate snapshots, grants or charges.
8. Organization A cannot access organization B through guessed IDs, cross-tenant references, exports or API calls. School reviewers cannot browse a pilot's personal library.
9. Tampering with browser Pro flags, role values or tokens does not change server permissions. Revoked membership prevents new organization writes.
10. Sponsored access respects start/end/cancellation and scope. Personal Pro survives an unrelated sponsorship expiry; historical records are not deleted by downgrade.
11. Offline edits are labeled unsynced; no review/submission success is claimed before server acknowledgement. Signing out removes cached private material from subsequent-user access.
12. Legacy import requires an explicit selection and creates no duplicate on retry. A local guest record is not automatically uploaded to whichever user next signs in.
13. PDF/export includes preparation and snapshot identifiers, capture/source times, actual review status and the existing aviation notice. Draft output is explicitly marked draft.
14. Aircraft/template publication creates a new immutable version; old snapshots retain their original versions and affected active plans are flagged.
15. Existing engine/auth/navigation regression checks continue to pass after intentional updates. Run `npm test` and `npm run build`; add meaningful integration tests for tenant isolation, state transitions and persistence. Perform a browser walkthrough with pilot/reviewer accounts and a second organization.

## 13. Pilot evaluation and decisions before release

Establish a baseline for instructor review time and common missing preparation items. During the pilot measure submission completion, time to review, revisions required, unresolved items discovered, repeat use, support workload and organization willingness to pay. These measure workflow value, not accident reduction or proven competence.

Choose one school and one club with different review procedures. Agree measurable success thresholds with them before the trial. Start with a manual booking and shared aircraft profile rather than an integration project.

Commercial/product decisions still required: Free export policy; prices; sponsored scope and time windows; school versus club review defaults; supported datasets and update responsibilities; retention and post-membership access; pilot-launch success thresholds. Infrastructure selection is an engineering decision, but server-enforced identity, tenant isolation, scoped entitlements and immutable submissions are mandatory architectural requirements.

The immediate build priority is **one complete preparation record plus a trustworthy human-review workflow**. Packaging and integrations should support that workflow, rather than precede it.
