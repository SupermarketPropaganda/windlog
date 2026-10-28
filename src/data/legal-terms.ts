export const CURRENT_LEGAL_VERSION = '2026.10.11';
export const LEGAL_UPDATED_DATE = '11 October 2026';
export const LEGAL_REVIEW_STATUS = 'Review draft — operator identity, service address and contact activation must be completed before public release.';
export interface LegalSection { id: string; title: string; content: string[]; isCallout?: boolean; isUccCaps?: boolean; }
export const LEGAL_DOCUMENT_TITLE = 'GUSTLOG — AVIATION LEGAL DISCLAIMER, TERMS OF SERVICE & USER AGREEMENT';
export const LEGAL_DOCUMENT_SUBTITLE = 'Supplemental planning software • Updated ' + LEGAL_UPDATED_DATE;
export const AVIATION_NOTICE = 'Supplemental planning aid only. Not for primary navigation, operational dispatch or emergency guidance. Independently verify weather, NOTAMs, aircraft limitations, fuel, airspace and runway conditions using current authoritative sources.';
export const LEGAL_SUMMARY = [
  AVIATION_NOTICE,
  'The pilot in command retains operational responsibility. Students must comply with their instructor’s and training organisation’s requirements. No user is asked to claim they are a pilot in command merely to use this app.',
  'Aircraft presets, fuel reserves, runway rankings and status colours are estimates, not approvals. Verify the specific aircraft’s AFM/POH, loading report and applicable operating rules.',
  'Weather, charts, databases, GPS and offline information can be incomplete, delayed or wrong. Keep suitable independent information and backups.',
  'Profiles and saved flights are stored in this browser. Online weather, map and optional identity services receive network requests and associated data. Shared links disclose their contents.',
  'The service is currently free. Pro is a demonstration, not a paid subscription. Mandatory consumer rights remain unaffected by warranty and liability provisions.',
];
export const LEGAL_SECTIONS: LegalSection[] = [
  { id: 'critical-notice', title: 'Critical aviation safety notice', isCallout: true, content: [AVIATION_NOTICE, 'Gustlog provides supplemental VFR planning calculations and information. It is not an air traffic service, flight briefing provider, flight plan filing service, aircraft instrument, obstacle-warning system or substitute for professional flight instruction. A displayed route or printed navigation log is not a filed flight plan, clearance, release or authorisation to fly.'] },
  { id: 'operator', title: '1. Operator, scope and agreement', content: [
    'Gustlog is an independently operated project and is not currently a registered company. The contracting individual’s full legal name and service address remain to be supplied before public release. “Operator”, “we” and “us” mean that individual, not a separate company called Gustlog. Proposed legal, support and privacy contact: gustlog@outlook.com (pending creation and verification; not yet an active support channel).',
    'These terms cover the Gustlog website, installed web app, mobile builds, calculators, local profiles, saved flights, shared routes and generated outputs. The separate Privacy Notice explains data practices; acknowledging it is not consent to optional data processing.',
    'By checking the agreement box and selecting the acceptance button, you agree to this version. If you disagree, choose Leave without accepting and do not use the planning tools. You can read these documents before registration and reopen them in the cockpit. Local records of acceptance are not independently verified identity records.',
  ] },
  { id: 'eligibility', title: '2. Eligibility and permitted use', content: [
    'You must have legal capacity to enter this agreement under the law applicable to you. A user who lacks that capacity must have a parent or legal guardian arrange valid authorisation where permitted by law; otherwise do not use the service. Organisational users must have authority to act for their organisation.',
    'Subject to these terms, you may use the provided service and retain and share your own generated outputs for lawful personal, training or organisational planning. This permission is non-exclusive and does not transfer ownership of the service. Separately distributed open-source software remains governed by its own licence, including any applicable MIT licence; these terms do not remove those rights.',
    'Do not interfere with the service, bypass access restrictions, misuse another person’s information, distribute malicious content, overload third-party services, or misrepresent Gustlog outputs as official or certified. Reverse engineering and interoperability rights protected by applicable law remain unaffected.',
  ] },
  { id: 'pic', title: '3. Pilot responsibility and verification', content: [
    'The pilot in command remains responsible for the safe and lawful conduct of the flight. Before flight, independently review the information required for the operation, including weather, NOTAMs, airspace, aerodrome information, performance, loading, fuel, alternatives and applicable clearances. For US Part 91 operations, see 14 CFR §§ 91.3 and 91.103; other jurisdictions and operation types have their own requirements.',
    'Check each input, unit, coordinate, waypoint, date, time zone, altitude reference, true/magnetic reference, aircraft selection and result. Resolve discrepancies against current authoritative sources before relying on any independently verified planning output. A green indicator, absence of a warning or suggested value does not establish safety or compliance.',
    'Students and instructors must follow applicable training, supervision, endorsement and organisational requirements. Gustlog does not grant qualifications, approve solo flights or replace instructor review. Do not interact with the app when doing so would distract from safe aircraft operation.',
  ] },
  { id: 'efb', title: '4. No certification or operational approval', content: [
    'Gustlog makes no claim of FAA, EASA or other aviation-authority certification, TSO/ETSO authorisation, airworthiness approval or operator-specific EFB approval. Installing the app does not authorise replacing equipment or documents required for your operation.',
    'EFB eligibility and approval depend on the application, equipment, operator and applicable rules. “Type B” is not a universal product certification. FAA advisory circulars provide guidance; they do not by themselves certify Gustlog. Assess the requirements for your operation with your operator and competent authority.',
  ] },
  { id: 'data', title: '5. Maps, databases, terrain and positioning', content: [
    'Airport, runway, navaid, reporting-point, magnetic-variation, map and other datasets can be incomplete, incorrect or obsolete. A displayed cycle or validity label does not prove that every underlying record is current. Consumer basemaps and schematic route or altitude views are not official aeronautical charts.',
    'Gustlog does not provide assured terrain or obstacle clearance, airspace containment, traffic avoidance, instrument procedure guidance or a complete NOTAM/TFR service. Missing hazards or restrictions must never be interpreted as their absence. GPS positions may be inaccurate, delayed or unavailable; the service is not an emergency locator or rescue service.',
  ] },
  { id: 'weather', title: '6. Weather and external information', content: [
    'Observations, forecasts and winds obtained from external services, including NOAA Aviation Weather Center and Open-Meteo, may be delayed, cached, interpolated, modelled or unavailable. Check source, observation/forecast time, units, validity period and location. Forecasts and observations are different products; surface observations do not establish conditions along a route or at altitude.',
    'Gustlog is not a complete or official flight weather briefing. Information may omit icing, convection, wind shear, turbulence and local conditions. Obtain the meteorological and aeronautical information required for your operation through appropriate authoritative channels. Network failure or a successful refresh does not establish completeness.',
  ] },
  { id: 'aircraft', title: '7. Aircraft performance, mass and balance', content: [
    'Aircraft presets and example envelopes are starting values, not verified data for any particular registration. Use the current approved Aircraft Flight Manual (AFM), Pilot’s Operating Handbook (POH), supplements and aircraft-specific weight and balance records, including modifications and equipment changes.',
    'Independently verify empty mass, arms, moments, fuel density, usable fuel, station limits and the complete permitted centre-of-gravity envelope throughout the flight. Check takeoff and landing performance separately. A calculation inside the entered envelope only compares your inputs against that entered model; it does not certify loading, airworthiness or performance.',
  ] },
  { id: 'fuel', title: '8. Navigation calculations, fuel and reserves', content: [
    'Headings, groundspeed, time, range, fuel and altitude suggestions use simplified models and supplied inputs. They may omit or approximate taxi, climb, descent, routing changes, delay, alternate requirements, contingency, weather effects and aircraft-specific performance. Reserve defaults are configurable examples, not a determination of the law applicable to your flight.',
    'Independently determine the required fuel and reserves for the aircraft, flight rules, operation, jurisdiction and conditions; confirm actual usable fuel onboard and monitor consumption in flight. No displayed endurance, range or cruising level guarantees that a flight is permissible or achievable.',
  ] },
  { id: 'runway', title: '9. Runway wind and suitability', content: [
    'Runway rankings and wind components compare entered or reported wind with runway geometry. They are not runway assignments, ATC clearances, takeoff/landing performance assessments or declarations that a runway is suitable.',
    'Check wind variability and gusts, true versus magnetic references, runway availability, slope, declared distances, obstacles, surface condition, braking action, aircraft limitations and pilot proficiency. A maximum demonstrated crosswind value is not necessarily a certified operating limitation; use the applicable AFM/POH and operational limits. Wind component calculations do not model braking or contaminated-runway performance.',
  ] },
  { id: 'availability', title: '10. Device failure, offline use and outputs', content: [
    'Devices, batteries, browsers, storage, networks and location services can fail. Offline and cached information can become stale. Maintain independent information and backups suitable for your operation. Do not treat availability of this app as a condition that makes a flight safe.',
    'Printed logs, downloads and shared routes are snapshots. Check the data and generation context, identify later changes, and provide recipients with the safety notice. Do not remove a safety notice in a way that makes an output misleading. You are responsible for your decision to share information and for obtaining any necessary permissions from others.',
  ] },
  { id: 'profiles', title: '11. Local profiles, security and user information', content: [
    'The current profile system stores account details, password hashes, settings and saved flights in the browser/device. It is not a server-backed identity verification, secure multi-user access-control or cloud synchronisation service. Someone with access to the device or its browser storage may access or alter local data. Use a unique password and secure your device.',
    'Clearing site data, changing browser or device, or losing the device can remove access to local profiles and flights. Keep independent copies of important records. Optional Google sign-in depends on configuration and Google’s service. Email recovery and magic links are unavailable with the current local adapter.',
    'You retain rights in your own data. The service uses your inputs to perform the functions you request. This agreement does not grant a right to sell your flight plans or publicly publish private information. The Privacy Notice describes local storage, network requests and sharing.',
  ] },
  { id: 'pricing', title: '12. Free service, future paid plans and third parties', content: [
    'The current service is free. The Pro switch is a free demonstration and does not create a paid subscription, recurring charge or payment authorisation. No future price, lifetime entitlement or paid feature availability is promised by that demonstration.',
    'Any future paid offering will require clear pricing, taxes, billing period, renewal, cancellation, refund and applicable withdrawal information before a separate purchase decision. These terms do not authorise charging you later. Mandatory consumer remedies remain available.',
    'External maps, data, software and linked services have their own licences and terms. Attribution is not endorsement. Sponsor cards and outbound commercial links do not establish product suitability, aviation approval or a guarantee by Gustlog. Applicable open-source and data licence rights remain intact.',
  ] },
  { id: 'warranties', title: '13. Warranties and statutory rights', isUccCaps: true, content: [
    'TO THE EXTENT PERMITTED BY APPLICABLE LAW, GUSTLOG AND ITS DATA ARE PROVIDED “AS IS” AND “AS AVAILABLE”. THE OPERATOR DISCLAIMS IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT TO THE EXTENT THOSE WARRANTIES MAY LAWFULLY BE DISCLAIMED. NO GUARANTEE IS GIVEN OF UNINTERRUPTED AVAILABILITY, ACCURACY OR FITNESS FOR SAFETY-CRITICAL USE.',
    'These provisions do not remove mandatory rights relating to digital content, conformity, reasonable care and skill, remedies or express commitments that the law requires us to honour. They do not excuse the Operator from obligations that cannot lawfully be excluded.',
  ] },
  { id: 'liability', title: '14. Allocation of liability', isUccCaps: true, content: [
    'NOTHING IN THIS AGREEMENT EXCLUDES OR LIMITS LIABILITY FOR FRAUD, FRAUDULENT MISREPRESENTATION, WILFUL MISCONDUCT, DEATH OR PERSONAL INJURY CAUSED BY NEGLIGENCE WHERE SUCH EXCLUSION IS PROHIBITED, GROSS NEGLIGENCE WHERE PROTECTED BY LAW, OR ANY OTHER LIABILITY OR CONSUMER RIGHT THAT CANNOT LAWFULLY BE EXCLUDED OR LIMITED. THESE EXCEPTIONS APPLY TO EVERY DISCLAIMER, EXCLUSION AND LIMIT IN THIS AGREEMENT.',
    'Subject to those exceptions, the Operator is responsible to consumers for losses for which applicable law makes the Operator responsible. This agreement does not impose an arbitrary monetary cap on consumer claims or require consumers to indemnify the Operator for the Operator’s own acts or omissions.',
    'For users acting wholly for business purposes only, and only to the extent lawful, the Operator excludes liability for indirect or consequential loss, lost profits, revenue, business opportunity or business interruption. Subject to the exceptions above, aggregate liability to a business user arising from the service in any twelve-month period is limited to the greater of EUR 100 or the fees that user paid for the service during that period. This business limitation does not apply to a user acting as a consumer.',
    'Responsibility for loss depends on applicable law, causation and the circumstances. The pilot’s operational duties do not erase the Operator’s own legal duties, and acceptance is not a blanket waiver of aviation injury claims.',
  ] },
  { id: 'changes', title: '15. Changes, suspension and termination', content: [
    'Features may change or be withdrawn for maintenance, security, legal compliance or product development, subject to applicable law and any commitments already made. Where practicable, material changes will be explained in advance. Required security changes may take effect sooner.',
    'Access may be restricted for material misuse, security risks or legal requirements, proportionately and with notice and an opportunity to address the issue where practicable. You may stop using the service at any time. Export records you need before clearing local data. No contractual right to paid-service refunds is decided by this free-service provision.',
    'Material revisions will carry a new version and be presented for fresh acceptance before further planning use. They do not retroactively waive accrued claims. If you decline, stop using the planning tools; your mandatory rights and claims already accrued remain unaffected.',
  ] },
  { id: 'disputes', title: '16. Disputes, applicable law and general provisions', content: [
    'No exclusive foreign court, compulsory arbitration or class-action waiver is imposed by this draft. Applicable law and jurisdiction are determined by the relevant conflict-of-laws and jurisdiction rules. Consumers retain all mandatory protections and rights to bring proceedings in courts available to them by law, including their home courts where applicable. Worldwide availability is not a representation that the service meets every local aviation or consumer requirement.',
    'Once the contact address has been activated, concerns may be sent to gustlog@outlook.com. Informal contact is optional and does not restrict court access, regulatory complaints, urgent relief or statutory deadlines. Do not use the contact address for emergencies or time-critical flight advice.',
    'If a provision is invalid, it is ineffective to the extent required by law; remaining provisions apply only where the agreement can lawfully continue. Failure to enforce a right is not a waiver. These terms govern use of the service together with separately agreed purchase terms, if any, without overriding mandatory law or applicable third-party licences.',
  ] },
];
export const PRIVACY_DOCUMENT_TITLE = 'GUSTLOG — PRIVACY NOTICE';
export const PRIVACY_SECTIONS: LegalSection[] = [
  { id: 'privacy-controller', title: '1. Who is responsible', content: [
    'Gustlog is an independently operated project, not a registered company. The responsible individual’s legal name and service address must be added before public release. The intended privacy contact, gustlog@outlook.com, is pending creation and verification. This notice is a review draft, not a completed controller disclosure.',
  ] },
  { id: 'privacy-local', title: '2. Information stored on your device', content: [
    'The current app stores profile information such as email, display name, optional pilot details, password hashes, preferences, sessions, aircraft inputs, routes, saved flights, notes, cached data and legal acceptance records in browser storage, including localStorage, sessionStorage and IndexedDB. These functions let you maintain a local profile, plan flights and retain your work. There is no server-backed account synchronisation in the current implementation.',
    'Remember-me sessions use a 30-day local session; other sessions use tab session storage. Other local records remain until you remove them, storage is cleared or the browser evicts them. Signing out removes the session, not necessarily saved profile or flight data. Browser storage is not a secure vault. Export important records before clearing site data.',
  ] },
  { id: 'privacy-network', title: '3. Online requests and recipients', content: [
    'Local-first does not mean that no information leaves your device. Weather requests can send airport identifiers, coordinates, altitude-related selections and forecast parameters to NOAA Aviation Weather Center or Open-Meteo. Reporting-point lookups send geographic queries to OpenStreetMap Overpass services. Map requests to Esri or OpenStreetMap tile services identify the viewed map areas. These requests expose your IP address and normal network/browser metadata to their recipients.',
    'The hosting provider also receives requests for the app and its resources and may keep access or security logs. Optional Google sign-in exchanges authentication information with Google and retrieves profile information such as email and name. Clicking a sponsor or other external link sends a request to the destination, whose own privacy notice applies. Relevant providers include aviationweather.gov, open-meteo.com, overpass-api.de, arcgisonline.com, openstreetmap.org and google.com.',
    'The current source implementation does not include a remote flight-plan account database or advertising analytics SDK. This does not establish that hosting infrastructure or third-party providers collect no logs. Their retention and processing practices must be verified for the actual deployment before release.',
  ] },
  { id: 'privacy-location', title: '4. Location, links and permissions', content: [
    'Where you request a location feature, device/browser permission controls access to position information. You may deny or revoke that permission through device or browser settings. Geographic information used in online queries can be disclosed to the corresponding provider.',
    'Shared routes encode route and aircraft parameters in the URL fragment. Anyone who receives or copies the full link can inspect or reshare those details. A URL fragment is normally excluded from the HTTP request to the hosting server, but page scripts, browser extensions and recipients can access it. Generated files may contain route, aircraft and pilot information. Check before sharing; deleting your local copy does not recall copies already shared.',
  ] },
  { id: 'privacy-basis', title: '5. Purposes, legal bases and choices', content: [
    'Where data-protection law requires a legal basis, processing necessary to provide requested profile and planning functions is intended to rely on performance of the requested service; proportionate security and reliability processing may rely on legitimate interests, subject to the required assessment and your rights. Processing required by law relies on the relevant legal obligation. Optional processing that requires consent must use a separate, informed choice. Accepting the terms does not authorise unrelated marketing or tracking.',
    'Storage needed for requested functions and preferences is used to deliver those functions. Optional analytics or advertising tracking must not be introduced under this notice without assessing applicable consent requirements and updating the notice. A future paid service will need additional payment and retention disclosures.',
  ] },
  { id: 'privacy-rights', title: '6. Your rights and retention', content: [
    'Depending on applicable law, you may request access, correction, deletion, restriction, portability, or object to certain processing; you may withdraw consent where processing relies on it without affecting earlier lawful processing. You may complain to your competent data-protection authority. These rights are subject to the conditions and exceptions in applicable law.',
    'You can edit available profile settings, export supported records and clear local data using browser/device controls. Clearing all site data removes local profiles and saved work and may prevent recovery. The Operator cannot remotely retrieve or erase browser-only records through a central account service. Rights concerning provider-held records may also need to be exercised with the relevant provider.',
    'The Operator’s actual hosting log retention, service providers, international transfer mechanisms and rights-request process remain to be documented before public release. Providers may process information outside your country; where required, lawful transfer safeguards must be established. This notice does not itself establish such safeguards.',
  ] },
  { id: 'privacy-updates', title: '7. Updates', content: ['This notice describes the current local-profile implementation as of 11 October 2026. Material changes to data practices require an updated notice and any legally required consent before the new processing begins. The service does not currently operate a dedicated children’s account or parental verification programme. Age-related requirements must be assessed for the countries served.'] },
];
export function legalDocumentText(privacy = false): string {
  return [privacy ? PRIVACY_DOCUMENT_TITLE : LEGAL_DOCUMENT_TITLE, `Version ${CURRENT_LEGAL_VERSION} • ${LEGAL_UPDATED_DATE}`, LEGAL_REVIEW_STATUS, ...(privacy ? PRIVACY_SECTIONS : LEGAL_SECTIONS).flatMap(s => [s.title, ...s.content])].join('\n\n');
}
export function downloadLegalDocument(privacy = false): void {
  const url = URL.createObjectURL(new Blob([legalDocumentText(privacy)], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `gustlog-${privacy ? 'privacy' : 'terms'}-${CURRENT_LEGAL_VERSION}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
