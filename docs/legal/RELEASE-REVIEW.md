# Gustlog legal implementation review

Prepared 11 October 2026. Review draft; not a legal opinion or assurance of enforceability worldwide.

## Confirmed product and owner instructions

Gustlog is not incorporated. The owner intends worldwide availability, proposed contact gustlog@outlook.com (not yet created), and a future freemium model to be designed later. Current Pro is a free browser-local demonstration. No future billing terms or payment authorisation have been introduced.

The implementation provides supplemental planning, weather and map requests, local profiles, saved flights, sharing, mass and balance, runway wind calculations, and printed logs. The old zero-network-data promise, universal certification claims, Delaware-only forum, blanket injury waiver and zero-effective consumer damages cap have been removed. Business-only limits are proposed drafting choices for counsel to assess, not guarantees of validity.

## Required before public release

- Supply the individual operator's full legal name and legally sufficient service address; formation of a company is not assumed or required by this draft.
- Create and verify gustlog@outlook.com, then remove pending-contact language from both documents.
- Identify actual hosting providers, logs, recipients, retention schedules, lawful bases, international transfer safeguards and a workable privacy-rights process. Source inspection cannot verify deployment-level logging or provider contracts.
- Have qualified counsel assess launch jurisdictions, consumer and digital-content duties, eligibility/minors, the business liability cap, data licensing and aviation representations. Worldwide reach cannot be made compliant by one disclaimer alone.
- Define checkout, renewal, cancellation, withdrawal/refund and payment privacy terms before launching paid plans. Do not assume acceptance of this free-service agreement authorises future charges.
- Complete desktop/mobile interaction and printed A4 visual review. The connected browser timed out reaching localhost; Chrome was unavailable in this session.

## Integration

Canonical text: src/data/legal-terms.ts. Review copies: GUSTLOG-AGREEMENT.md and PRIVACY-NOTICE.md in this directory. Update review copies when changing the canonical source.

Landing footer and registration expose distinct terms/privacy documents. Both are downloadable. #terms and #privacy provide direct access from either web entry point. The cockpit requires unchecked safety and agreement acknowledgements, allows leaving without accepting, and offers persistent read-only access. All cockpit views share a safety notice, and exported kneeboards carry the notice and version. Pro marketing no longer promises cloud synchronisation or radar.

Acceptance is versioned per local user ID, with timestamp and explicit acknowledgements. Legacy device-wide acceptance does not satisfy the new agreement. Local records are editable/deletable and are NOT proof of identity or a tamper-resistant legal audit trail. Clearing/importing browser storage can affect records. Consider authenticated server-side evidence and document retention if a backend is introduced. Registration has its existing checkbox; the separate cockpit gate records the full safety and agreement acceptance, including after OAuth sign-in.

The browser currently renders the documents as review drafts. Nothing was deployed or published during this change.

## Primary references checked

- [14 CFR 91.103: preflight action](https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-91/subpart-B/subject-group-ECFRe4c59b5f5506932/section-91.103): operation-specific preflight obligations; avoid presenting a single universal briefing rule.
- [FAA AC 91-78A](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_91-78A.pdf): operational EFB guidance; an advisory circular is not product certification or a regulation.
- [European Commission: unfair contract terms](https://commission.europa.eu/law/law-topic/consumer-protection-law/consumer-contract-law/unfair-contract-terms-directive_en): unfair standard terms are not made enforceable by assent.
- [UK Consumer Rights Act 2015, section 65](https://www.legislation.gov.uk/ukpga/2015/15/section/65): protected negligence liability.
- [CJEU C-191/15](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A62015CJ0191): choice-of-law terms must not mislead consumers about mandatory protections.

These references support drafting choices, not a comprehensive jurisdictional review.
