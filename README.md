# ✈️ WindLog — Tactile VFR Flight Planning & Navigation Log Engine

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen?style=flat-square&logo=github)](https://supermarketpropaganda.github.io/windlog/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Build & Test](https://img.shields.io/badge/tests-62%20passed-success?style=flat-square)](https://github.com/SupermarketPropaganda/windlog/actions)
[![Magnetic Model](https://img.shields.io/badge/magnetic%20model-WMM2025%20(NOAA)-blue?style=flat-square)](https://www.ngdc.noaa.gov/geomag/WMM/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb?style=flat-square&logo=react)](https://reactjs.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20Cockpit%20Ready-emerald?style=flat-square)](https://github.com/SupermarketPropaganda/windlog)

**WindLog** is an open-source, tactile VFR flight planning scratchpad and navigation log generator built for general aviation pilots, flight instructors, and aviation enthusiasts. It combines natural language route parsing, live altitude-dependent winds aloft, real-time magnetic declination calculations via **WMM2025**, an interactive tactical map with satellite and terrain views, a 2D vertical flight cross-section profile, and aircraft fuel management.

🌐 **Live Application:** [https://supermarketpropaganda.github.io/windlog/](https://supermarketpropaganda.github.io/windlog/)

---

## 🌟 Key Features

* **⚡ Instant Natural-Language Scratchpad:**
  Type route strings freely in real time (e.g. `LPCS/4500 COIMB/3500 LPCS` or `LPEV ARRAI LPSO LPCS LPEV`). Supports standard flight levels (`FL045`), thousands (`4.5K`), explicit altitudes (`4500FT`), and `@` / `/` delimiters.
* **🌍 84,000+ Global Waypoints SQLite Engine:**
  Bundled client-side SQLite database running via WebAssembly (WASM) for instant (<1ms) offline lookups of international ICAO airports, VORs, NDBs, and NAV Portugal VFR reporting points.
* **💨 Live Altitude-Specific Winds Aloft:**
  Automatic real-time wind interpolation (Open-Meteo ECMWF / NOAA AWC) evaluated at your cruise altitude and leg midpoint, with instant manual override (`270/15`).
* **🧭 NOAA WMM2025 Magnetic Declination Model:**
  Computes continuous UTC decimal-year magnetic variation directly in the browser with full spherical harmonic expansion matching NOAA ground truth.
* **📐 ICAO Semicircular Cruising Level Guidance:**
  Recommends legal VFR cruising altitudes based on magnetic track ($000^\circ - 179^\circ$: Odd thousands $+ 500\text{ ft}$; $180^\circ - 359^\circ$: Even thousands $+ 500\text{ ft}$).
* **🗺️ Tactical Interactive Map (Leaflet):**
  Aviation markers (Airports ✈, VRPs ◆, Custom waypoints ★), dashed flight paths with active leg highlights, midpoint wind vector pills (`↘ 8kt`), and 1-click layer switching (**Dark Tactical**, **Satellite Imagery**, **Terrain / Topo**, and **Street**).
* **📈 2D Vertical Altitude Profile:**
  Interactive side-view cross-section displaying step climbs, step descents, MSL gridlines, and cumulative nautical mile waypoints.
* **⛽ Aircraft Presets & Fuel Calculations:**
  Built-in performance models for **Cessna 172**, **Piper PA-28**, **Diamond DA40**, and **Rotax 912 (ULM/LSA)** with `GPH` $\leftrightarrow$ `L/h` unit switching and trip fuel burn.
* **🔗 Zero-Backend URL Route Sharing:**
  Encodes complete route waypoints, altitudes, aircraft presets, and fuel flow into a shareable URL hash for instant 1-click flight plan distribution.
* **📱 Responsive iPad / Desktop Dashboard:**
  Side-by-side cockpit layout on desktop/tablet (NavLog on left, Map & Profile on right) and clean vertical stacking on mobile devices.

---

## 📐 Aeronautical Math Specifications

1. **Wind Triangle Vector Equation (E6B Solver):**
   $$\text{Wind Correction Angle (WCA)} = \arcsin\left(\frac{V_w \cdot \sin(\theta_w - \text{TC})}{\text{TAS}}\right)$$
   $$\text{Ground Speed (GS)} = \text{TAS} \cdot \cos(\text{WCA}) - V_w \cdot \cos(\theta_w - \text{TC})$$
   $$\text{True Heading (TH)} = \text{TC} + \text{WCA}$$
   $$\text{Magnetic Heading (MH)} = \text{TH} - \text{Var}$$

2. **Great Circle Distance & Initial Bearing (Haversine & Spherical Trigonometry):**
   $$d = 2R \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
   $$\theta = \text{atan2}\left(\sin(\Delta \lambda)\cos(\phi_2), \; \cos(\phi_1)\sin(\phi_2) - \sin(\phi_1)\cos(\phi_2)\cos(\Delta \lambda)\right)$$

3. **Continuous Magnetic Variation (WMM2025):**
   $$T = 2025.0 + \frac{\text{DayOfYear} + \frac{\text{Hour}}{24}}{365.25}$$

---

## 🚀 Quick Start & Local Development

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher

### Installation & Run

```bash
# 1. Clone the repository
git clone https://github.com/SupermarketPropaganda/windlog.git
cd windlog

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing

WindLog includes a comprehensive unit, integration, and mathematical stress-testing suite powered by Vitest:

```bash
# Run all 62 test suites
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

## 🌐 GitHub Pages Deployment

The repository includes a pre-configured **GitHub Actions CI/CD pipeline** in `.github/workflows/deploy.yml`.

1. In your GitHub repository at [SupermarketPropaganda/windlog](https://github.com/SupermarketPropaganda/windlog), go to **Settings** ➔ **Pages**.
2. Under **Build and deployment** ➔ **Source**, select **GitHub Actions**.
3. Every push to `main` automatically runs all 62 tests, builds the bundle, and deploys live to:
   `https://supermarketpropaganda.github.io/windlog/`

---

## 🤝 Contributing

Contributions are warmly welcomed! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on code style, mathematical validation, and pull request workflows.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
