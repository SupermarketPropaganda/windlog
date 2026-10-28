# GUSTLOG — PRIVACY NOTICE

Version 2026.10.11 · 11 October 2026

**Review draft — operator identity, service address and contact activation must be completed before public release.**

## 1. Who is responsible

Gustlog is an independently operated project, not a registered company. The responsible individual’s legal name and service address must be added before public release. The intended privacy contact, gustlog@outlook.com, is pending creation and verification. This notice is a review draft, not a completed controller disclosure.

## 2. Information stored on your device

The current app stores profile information such as email, display name, optional pilot details, password hashes, preferences, sessions, aircraft inputs, routes, saved flights, notes, cached data and legal acceptance records in browser storage, including localStorage, sessionStorage and IndexedDB. These functions let you maintain a local profile, plan flights and retain your work. There is no server-backed account synchronisation in the current implementation.

Remember-me sessions use a 30-day local session; other sessions use tab session storage. Other local records remain until you remove them, storage is cleared or the browser evicts them. Signing out removes the session, not necessarily saved profile or flight data. Browser storage is not a secure vault. Export important records before clearing site data.

## 3. Online requests and recipients

Local-first does not mean that no information leaves your device. Weather requests can send airport identifiers, coordinates, altitude-related selections and forecast parameters to NOAA Aviation Weather Center or Open-Meteo. Reporting-point lookups send geographic queries to OpenStreetMap Overpass services. Map requests to Esri or OpenStreetMap tile services identify the viewed map areas. These requests expose your IP address and normal network/browser metadata to their recipients.

The hosting provider also receives requests for the app and its resources and may keep access or security logs. Optional Google sign-in exchanges authentication information with Google and retrieves profile information such as email and name. Clicking a sponsor or other external link sends a request to the destination, whose own privacy notice applies. Relevant providers include aviationweather.gov, open-meteo.com, overpass-api.de, arcgisonline.com, openstreetmap.org and google.com.

The current source implementation does not include a remote flight-plan account database or advertising analytics SDK. This does not establish that hosting infrastructure or third-party providers collect no logs. Their retention and processing practices must be verified for the actual deployment before release.

## 4. Location, links and permissions

Where you request a location feature, device/browser permission controls access to position information. You may deny or revoke that permission through device or browser settings. Geographic information used in online queries can be disclosed to the corresponding provider.

Shared routes encode route and aircraft parameters in the URL fragment. Anyone who receives or copies the full link can inspect or reshare those details. A URL fragment is normally excluded from the HTTP request to the hosting server, but page scripts, browser extensions and recipients can access it. Generated files may contain route, aircraft and pilot information. Check before sharing; deleting your local copy does not recall copies already shared.

## 5. Purposes, legal bases and choices

Where data-protection law requires a legal basis, processing necessary to provide requested profile and planning functions is intended to rely on performance of the requested service; proportionate security and reliability processing may rely on legitimate interests, subject to the required assessment and your rights. Processing required by law relies on the relevant legal obligation. Optional processing that requires consent must use a separate, informed choice. Accepting the terms does not authorise unrelated marketing or tracking.

Storage needed for requested functions and preferences is used to deliver those functions. Optional analytics or advertising tracking must not be introduced under this notice without assessing applicable consent requirements and updating the notice. A future paid service will need additional payment and retention disclosures.

## 6. Your rights and retention

Depending on applicable law, you may request access, correction, deletion, restriction, portability, or object to certain processing; you may withdraw consent where processing relies on it without affecting earlier lawful processing. You may complain to your competent data-protection authority. These rights are subject to the conditions and exceptions in applicable law.

You can edit available profile settings, export supported records and clear local data using browser/device controls. Clearing all site data removes local profiles and saved work and may prevent recovery. The Operator cannot remotely retrieve or erase browser-only records through a central account service. Rights concerning provider-held records may also need to be exercised with the relevant provider.

The Operator’s actual hosting log retention, service providers, international transfer mechanisms and rights-request process remain to be documented before public release. Providers may process information outside your country; where required, lawful transfer safeguards must be established. This notice does not itself establish such safeguards.

## 7. Updates

This notice describes the current local-profile implementation as of 11 October 2026. Material changes to data practices require an updated notice and any legally required consent before the new processing begins. The service does not currently operate a dedicated children’s account or parental verification programme. Age-related requirements must be assessed for the countries served.
