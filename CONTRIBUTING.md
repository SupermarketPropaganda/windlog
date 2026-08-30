# Contributing to WindLog ✈️

Thank you for your interest in contributing to **WindLog**! We welcome contributions from pilots, software engineers, and aviation enthusiasts.

---

## 🛠️ Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/windlog.git
   cd windlog
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start local development server:**
   ```bash
   npm run dev
   ```

4. **Run the test suite:**
   ```bash
   npm test
   ```

---

## 📐 Aeronautical Math & Physics Standards

WindLog adheres to strict aviation industry standards:
* **Magnetic Declination**: Evaluated against NOAA WMM2025 ground truths.
* **Wind Triangles**: Uses exact spherical trigonometry and E6B vector equations.
* **Semicircular Rules**: Standard ICAO VFR cruising levels ($000^\circ-179^\circ$ Odd+500, $180^\circ-359^\circ$ Even+500).

When modifying any calculation under `src/engine/`, you **must** add corresponding test cases to `src/engine/engine.stress.test.ts` and verify that all tests pass (`npm test`).

---

## 🧪 Testing Checklist

Before submitting a Pull Request:
- [ ] Run `npm test` to ensure all 62+ unit and stress tests pass.
- [ ] Run `npm run build` to verify that TypeScript compilation and Vite bundling succeed without errors.
- [ ] Test the UI locally on desktop and mobile viewports.

---

## 📄 License

By contributing to WindLog, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
