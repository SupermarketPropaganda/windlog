# ✈️ GustLog — Tactile VFR Flight Planning & Navigation Log Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Build & Test](https://img.shields.io/badge/tests-81%20passed-success?style=flat-square)](https://github.com/SupermarketPropaganda/gustlog/actions)
[![Magnetic Model](https://img.shields.io/badge/magnetic%20model-WMM2025%20(NOAA)-blue?style=flat-square)](https://www.ngdc.noaa.gov/geomag/WMM/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb?style=flat-square&logo=react)](https://reactjs.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20Cockpit%20Ready-emerald?style=flat-square)](https://github.com/SupermarketPropaganda/gustlog)

**GustLog** is an open-source, tactile VFR flight planning scratchpad, navigation log generator, and weight-and-balance cockpit suite built for general aviation pilots, flight instructors, and aviation enthusiasts. It combines natural language route parsing, live altitude-dependent winds aloft, real-time magnetic declination calculations via **WMM2025**, an interactive tactical map with satellite and terrain views, a 2D vertical flight cross-section profile, a full **Mass & Balance (Weight & Balance)** calculator with CG envelopes, a dedicated **Runway Wind & Crosswind** tool, and printable **Aviation SOP Form 002 Kneeboard (PDF)** export.

---

## 🌟 Key Features

* **⚡ Instant Natural-Language Scratchpad:**
  Type route strings freely in real time (e.g. `LPCS/4500 COIMB/3500 LPCS` or `LPEV ARRAI LPSO LPCS LPEV`). Supports standard flight levels (`FL045`), thousands (`4.5K`), explicit altitudes (`4500FT`), and `@` / `/` delimiters.
* **📂 Responsive Cockpit Navigation Drawer (Side Menu):**
  One-tap side navigation drawer providing instant access between **Flight Planner**, **Mass & Balance**, **Runway Wind Calculator**, and **SOP Form 002 Kneeboard**.
* **⚖️ Mass & Balance (Weight & Balance) Engine:**
  * Interactive station loading sliders for Pilot, Passengers, Baggage, and Fuel.
  * Factory POH/AFM presets for **Cessna 172S**, **Piper PA-28 Archer III**, **Diamond DA40 Star**, **Tecnam P2002-JF Sierra**, and **Rotax 912 ULM / LSA**.
  * Custom aircraft profile creator with persistent local storage saving.
  * Interactive **2D SVG Center of Gravity (CG) Envelope Graph** plotting Zero Fuel Weight (ZFW), Takeoff Weight (TOW), and Landing Weight (LW) with real-time envelope containment checks and MTOW margin warnings.
  * One-click fuel sync with your active NavLog flight plan.
* **🛫 Runway Wind Components & Crosswind Calculator:**
  * Real-time Headwind, Tailwind, and Crosswind component calculations with crosswind side indicators ($\leftarrow$ Left / $\rightarrow$ Right).
  * Interactive **Visual Runway Compass Rose** displaying runway alignment, centerline markings, aircraft heading, and wind vectors.
  * Maximum Demonstrated Crosswind safety limits with green/amber/red warning thresholds.
  * Reciprocal runway analysis recommending the best runway for takeoff and landing.
* **📄 Printable Pilot Kneeboard / PDF Mode (SOP Form 002):**
  Generates a supplemental navigation log and fuel management kneeboard sheet formatted for **A4 Landscape** printing and iPad saving.
* **🌍 84,000+ Global Waypoints SQLite Engine:**
  Bundled client-side SQLite database running via WebAssembly (WASM) for instant (<1ms) offline lookups of international ICAO airports, VORs, NDBs, and NAV Portugal VFR reporting points.
* **💨 Live Altitude-Specific Winds Aloft:**
  Automatic real-time wind interpolation (Open-Meteo ECMWF / NOAA AWC) evaluated at your cruise altitude and leg midpoint, with instant manual override (`270/15`).
* **🧭 NOAA WMM2025 Magnetic Declination Model:**
  Computes continuous UTC decimal-year magnetic variation directly in the browser with full spherical harmonic expansion matching NOAA ground truth.
* **📐 ICAO Semicircular Cruising Level Guidance:**
  Suggests example VFR cruising altitudes for independent verification based on magnetic track ($000^\circ - 179^\circ$: Odd thousands $+ 500\text{ ft}$; $180^\circ - 359^\circ$: Even thousands $+ 500\text{ ft}$).
* **🗺️ Tactical Interactive Map (Leaflet):**
  Aviation markers (Airports ✈, VRPs ◆, Custom waypoints ★), dashed flight paths with active leg highlights, midpoint wind vector pills (`↘ 8kt`), and 1-click layer switching (**Dark Tactical**, **Satellite Imagery**, **Terrain / Topo**, and **Street**).
* **📈 2D Vertical Altitude Profile:**
  Interactive side-view cross-section displaying step climbs, step descents, MSL gridlines, and cumulative nautical mile waypoints.
* **🔗 Zero-Backend URL Route Sharing:**
  Encodes complete route waypoints, altitudes, aircraft presets, and fuel flow into a shareable URL hash for instant 1-click flight plan distribution.
* **📱 Responsive iPad / Desktop Dashboard:**
  Side-by-side cockpit layout on desktop/tablet and full-screen standalone Progressive Web App (PWA) on iPad.

---

## 📐 Aeronautical Math Specifications

1. **Wind Triangle Vector Equation (E6B Solver):**
   $$\text{Wind Correction Angle (WCA)} = \arcsin\left(\frac{V_w \cdot \sin(\theta_w - \text{TC})}{\text{TAS}}\right)$$
   $$\text{Ground Speed (GS)} = \text{TAS} \cdot \cos(\text{WCA}) - V_w \cdot \cos(\theta_w - \text{TC})$$
   $$\text{True Heading (TH)} = \text{TC} + \text{WCA}$$
   $$\text{Magnetic Heading (MH)} = \text{TH} - \text{Var}$$

2. **Runway Wind Components:**
   $$\Delta \theta = (\theta_{\text{wind}} - \theta_{\text{runway}}) \pmod{360}$$
   $$V_{\text{head}} = V_{\text{wind}} \cdot \cos(\Delta \theta)$$
   $$V_{\text{cross}} = |V_{\text{wind}} \cdot \sin(\Delta \theta)|$$

3. **Center of Gravity (CG) Moment Equation:**
   $$\text{Moment}_{\text{total}} = \text{BEW} \cdot \text{Arm}_{\text{empty}} + \sum (\text{Weight}_i \cdot \text{Arm}_i)$$
   $$\text{CG} = \frac{\text{Moment}_{\text{total}}}{\text{Weight}_{\text{total}}}$$

---

## 🚀 Quick Start & Local Development

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher

### Installation & Run

```bash
# 1. Clone the repository
git clone https://github.com/SupermarketPropaganda/gustlog.git
cd gustlog

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing

GustLog includes a comprehensive unit, integration, and mathematical stress-testing suite powered by Vitest:

```bash
# Run all test suites
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 📦 Production Build

```bash
# Compile TypeScript and bundle with Vite
npm run build

# Preview production bundle locally
npm run preview
```

---

## Landing Page and Pilot Accounts

The landing page combines an original procedural WebGL cloud background with a scroll-driven LPCS–LPSO–LPEV route demonstration. The demonstration uses Gustlog's navigation engine with illustrative winds (270° true at 15 kt), a C172 at 105 kt TAS, 3,500 ft, and 8.5 US gal/h. The chart is schematic; the displayed cruise totals exclude taxi, climb, descent, alternate fuel, and reserves. These example conditions are not a live forecast.

The sky has a pause control, pauses rendering offscreen, and falls back to a static sky when WebGL is unavailable. Reduced-motion preferences and short viewports use a static completed route. Both layouts preserve sign-in and registration and open the dashboard at the top of the page.


The production build includes both `gustlog.html` and `index.html`, which share the same React landing experience and authentication forms. Serve both from the same directory and origin. Registration and sign-in use the same authentication service and open `index.html#navlog`. The React landing page also supports `#signin` and `#register`.

Accounts, password hashes, and saved flights are stored in the current browser. This is a local pilot profile system, not a server-backed identity or access-control service. Accounts do not synchronize between browsers or devices. Clearing site data removes them. Checked **Remember this flight bag** stores a 30-day session in local storage; unchecked keeps the session in the current tab across navigation and refresh. Signing out removes the session from both page entry points.

Email password recovery and magic links require a connected account provider and are unavailable with the local adapter. Change Password requires the current password. Google sign-in requires a configured `VITE_GOOGLE_CLIENT_ID` and an authorized origin; without configuration, the UI directs pilots to email/password. Live Google consent has not been validated with production credentials.

Authentication regression tests cover session handoff, remember-me, sign-out, stale sessions, duplicate registration, browser storage failure, and URL routing. Run `npm test` and `npm run build` before deployment. Browser verification also covers both registration forms, failed and successful sign-in, cross-tab sign-out, profile updates, dashboard refresh, shared routes, and mobile layout.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.


## Legal documents

The current review draft is version 2026.10.11. The canonical terms, aviation notice and separate privacy notice live in `src/data/legal-terms.ts`; reviewable Markdown copies and release requirements are in `docs/legal/`. They are accessible from the landing footer, registration and cockpit, with downloads and direct `#terms` / `#privacy` links. Kneeboard outputs carry the safety notice and version.

The cockpit requires affirmative safety and agreement acknowledgements for each local profile and document version. These browser-local records are not a tamper-resistant legal audit trail. Operator identity, service address, contact activation and deployment-specific privacy disclosures remain unresolved; this draft is not ready for public release. Paid-plan terms are intentionally deferred until the business model is defined.
