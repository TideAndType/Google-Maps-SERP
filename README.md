# GBP Rank Tracker — Free Google Maps Rank Checker & Local SEO Grid Tool

**The #1 free, open-source Google Maps rank tracker for local SEO professionals.**
Track your Google Business Profile rankings across a geographic grid — see exactly where you rank #1 and where you disappear from every location in your service area.

[![Download for macOS](https://img.shields.io/badge/Download-macOS%20DMG-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/danishfareed/Google-Maps-SERP/releases/latest)
[![Download for Windows](https://img.shields.io/badge/Download-Windows%20Installer-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/danishfareed/Google-Maps-SERP/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/github/v/release/danishfareed/Google-Maps-SERP?style=for-the-badge&color=green&label=Version)](https://github.com/danishfareed/Google-Maps-SERP/releases/latest)

![GBP Rank Tracker — Google Maps Rank Grid Dashboard](https://github.com/danishfareed/Google-Maps-SERP/blob/main/public/preview.png?raw=true)

---

## Download Desktop App

No terminal. No Node.js. No setup. **One click to install and start tracking.**

| Platform | Download | Requirements |
|----------|----------|-------------|
| **macOS** (Apple Silicon + Intel) | [Download DMG →](https://github.com/danishfareed/Google-Maps-SERP/releases/latest) | macOS 11+ |
| **Windows** (64-bit) | [Download Installer →](https://github.com/danishfareed/Google-Maps-SERP/releases/latest) | Windows 10/11 |

> **Windows users:** SmartScreen may show a security warning because the app is not yet code-signed. Click **"More info"** → **"Run anyway"**. The app is 100% open-source — inspect every line of code in this repository.

> **macOS users:** If you see "app is damaged" or "unidentified developer", right-click the app → **Open** → click **Open** in the dialog. This is a Gatekeeper prompt for unsigned apps.

**Auto-updates included** — the app checks GitHub Releases for new versions and notifies you in-app when an update is available.

---

## What Is GBP Rank Tracker?

Google Maps rankings are **hyperlocal**. A business might rank #1 when someone searches from 2 blocks away but rank #15 from 5 miles out. Standard rank checkers only check from a single location and miss this entirely.

**GBP Rank Tracker solves this** by creating a grid of geographic checkpoints around your target area, running real Google Maps searches from each point using browser automation, and mapping every result into a color-coded ranking heatmap.

```
  Green (#1-3)   Orange (#4-10)   Red (#11-20)   Black (not found)
```

Every grid point captures the full top-20 SERP — complete competitive intelligence, not just your own position.

**Private by default. 100% free. No third-party SERP API required. Scan data stays on your machine unless you explicitly enable an integration such as the optional TideOrbit Browser Bridge.**

---

## Features

### Google Maps Rank Tracking Grid
- **Geo-grid rank tracking** — 3×3 up to 13×13 grids with square, circle, ZIP code, or smart grid modes
- **Real browser-based checks** — uses actual Google Maps via browser automation, not third-party APIs
- **Track any keyword** — "plumber near me", "best pizza", "dentist", any Google Maps search
- **Multi-run history** — track ranking changes over time with timeline comparisons
- **Scheduled scans** — daily or weekly automated rank checks running in the background
- **Full competitor analysis** — see which businesses dominate each zone of the map

### Google Reviews Analyzer
- **Scrape all Google reviews** for any business — hundreds or thousands of reviews
- **AI-powered sentiment analysis** — understand exactly what customers love and hate
- **Fake review detection** — flag suspicious patterns, velocity spikes, and low-effort reviews
- **150+ metrics** — rating trends, response rates, seasonal patterns, keyword extraction
- **Export everything** — XLSX, PDF, JSON, CSV formats

### Intelligence Dashboard
- **Market share analysis** — Herfindahl-Hirschman Index (HHI) for competitive concentration scoring
- **Share of Voice** — which businesses dominate search results across your entire service area
- **Geographic heatmaps** — color-coded grid pins showing strength and blind spots at a glance
- **Competitor threat scoring** — automatic identification of your biggest ranking threats
- **Rank change alerts** — notifications when your rankings move up or down

### Enterprise-Grade Features
- **Proxy support** — configure proxy pools with automatic failover and dead proxy detection
- **Bulk proxy import** — fetch free proxies from 4 sources and auto-test them
- **Grid presets** — save and reuse grid configurations for recurring audits
- **Business profiles** — save frequently tracked businesses for quick access
- **Offline postal code database** — 1.8M+ postal codes across 121 countries for ZIP-based grids
- **System logging** — full diagnostic telemetry for troubleshooting

---

## How It Works

```
1. Open the desktop app
2. Enter your business name or paste your Google Maps URL
3. Choose a keyword (e.g., "plumber near me")
4. Configure your grid (size, shape, radius)
5. Click "Run Scan"
```

The app creates virtual search points across your service area, performs real Google Maps searches from each location using a headless browser, captures the full top-20 results, and maps everything into an interactive heatmap.

---

## Screenshots

| Rank Grid Map | Review Analysis | Intelligence Dashboard |
|:---:|:---:|:---:|
| Geographic ranking heatmap | AI sentiment & fake review detection | HHI, Share of Voice, threat scores |

---

## TideOrbit Browser Bridge (Optional)

The desktop app can act as TideOrbit's local Chromium worker. It starts a **localhost-only bridge on port 4317** that exposes only authenticated TideOrbit health, scan-create, and scan-result routes. The rest of the dashboard and local APIs are not proxied through this bridge.

1. Open **Settings → TideOrbit** in the desktop app and copy the generated pairing key.
2. Start a Cloudflare tunnel that points only to the bridge:

```bash
cloudflared tunnel --url http://127.0.0.1:4317
```

3. In WordPress open **TideOrbit → Opportunities → Growth Lab**, choose **Automatic: Browser → DataForSEO**, paste the public HTTPS tunnel URL and pairing key, then click **Test Browser Bridge**.
4. Local Grid scans will run in this app's Playwright/Chromium queue. If the tunnel is offline and TideOrbit has DataForSEO configured, Automatic mode falls back without changing the user's workflow.

The pairing key is randomly generated and stored locally. It can only be viewed or regenerated from the app loaded on localhost, is excluded from the generic settings API, and every public bridge request must provide it.

---

## Run from Source (Developer Setup)

If you prefer running from source rather than the desktop app:

### Prerequisites
- Node.js v18+ — [nodejs.org](https://nodejs.org/)
- Git — [git-scm.com](https://git-scm.com/)

### Quick Start

```bash
git clone https://github.com/danishfareed/Google-Maps-SERP.git
cd Google-Maps-SERP
npm install
npx playwright install chromium
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Privacy & Data Ownership

GBP Rank Tracker runs **100% locally on your machine**:

- All data stored in a local SQLite database on your device
- No external APIs see your keywords, rankings, or business names
- No telemetry, analytics, or tracking of any kind
- No account, login, or subscription required
- No API keys needed
- Your competitive intelligence stays completely private

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop Shell | Electron |
| Framework | Next.js (App Router) |
| Frontend | React, Tailwind CSS 4, Framer Motion |
| Maps | Leaflet + OpenStreetMap |
| Charts | Recharts |
| Database | SQLite (Prisma ORM) |
| Browser Automation | Playwright (Chromium) |
| NLP / Sentiment | wink-nlp, VADER hybrid |
| Auto-Updates | electron-updater + GitHub Releases |
| Export | ExcelJS, jsPDF |

---

## Changelog

### v1.9.4 — 2026-03-22
**Crash Reporting**
- Automatic crash detection: unhandled exceptions, promise rejections, and renderer process crashes are written to a local report in `userData/crash-reports/`
- On the next launch after a crash, a dialog appears offering to report the issue — clicking "Report on GitHub" opens a pre-filled issue in the browser with error, stack trace, and recent logs attached
- User paths and system usernames are scrubbed from all reports before they are shown
- Nothing is sent automatically — user reviews and submits via their own GitHub account

---

### v1.9.3 — 2026-03-22
**Security & Stability**
- Content Security Policy applied to all renderer responses — restricts connections to only trusted origins
- Renderer process runs in OS-level sandbox (`sandbox: true`)
- DevTools inaccessible in production builds
- Window state corruption no longer prevents app from launching
- Windows: Next.js server killed synchronously on quit (prevents orphaned processes)
- Server crash loop capped at 3 restarts before showing an error dialog
- Playwright Chromium download timeout increased to 10 minutes

---

### v1.9.2 — 2026-03-22
**macOS Signing**
- Ad-hoc code signing via `afterSign` hook eliminates the "app is damaged" Gatekeeper error on macOS 13+ without requiring an Apple Developer account

---

### v1.9.1 — 2026-03-22
**Bug Fixes**
- Fixed macOS CI build: removed duplicate `extraResources` entry that caused EEXIST hardlink conflict during packaging
- Fixed Windows CI build: regenerated `icon.ico` as proper ICO format (was a PNG file with incorrect extension, causing rcedit to reject it)
- Fixed GitHub Release workflow: releases now automatically publish after both Mac and Windows builds complete (previously created as drafts)

---

### v1.9.0 — 2026-03-22
**Desktop App Launch**
- Packaged as a native Electron desktop app for macOS and Windows — no Node.js, no terminal, no localhost required
- GitHub Actions CI/CD pipeline builds and publishes Mac DMG + Windows NSIS installer on every release tag
- Auto-update system via `electron-updater` — app checks GitHub Releases on launch and shows in-app notification
- Database stored in OS user data directory (`~/Library/Application Support` on macOS, `%APPDATA%` on Windows) — survives app updates
- Chromium browser downloaded to user data directory on first scan (not bundled, keeps installer size manageable)
- Splash screen shown during app startup while Next.js server initializes
- Single-instance lock prevents multiple app windows opening simultaneously

---

### v1.8.0 — 2026-03-22
**Rebrand: GeoRanker → GBP Rank Tracker**
- Renamed product from GeoRanker to GBP Rank Tracker across entire codebase, UI, and documentation
- Updated all user-facing strings, page titles, sidebar labels, and export filenames
- App version now auto-synced from `package.json` at build time — single source of truth

---

### v1.7.0 — 2026-03-03
**Intelligence Tab Overhaul**
- Replaced Competitors tab with a full Intelligence dashboard
- Added Herfindahl-Hirschman Index (HHI) — market concentration score showing how competitive your local market is
- Added Share of Voice analysis — percentage of grid-point appearances per business
- Added geographic distribution analysis — which quadrants of the grid each competitor dominates
- Added automatic competitor threat scoring based on proximity, frequency, and ranking depth
- Replaced basic competitor list with a comprehensive All Listings table showing every business across all grid points

---

### v1.6.1 — 2026-02-27
**Reliability Fix**
- Fixed address resolver reliability by proxying reverse geocoding through the server instead of the browser (resolved CORS issues with Nominatim)

---

### v1.6.0 — 2026-02-27
**Map Improvements**
- Added MiniMap per grid row for at-a-glance geographic context
- Added address resolution overlay showing street-level location for each grid point
- Added enlarged map modal for detailed inspection of individual grid points

---

### v1.5.0 — 2026-02-27
**History & Scheduling**
- Added timeline bar showing all historical runs for a scan — visualize rank changes over time
- Added one-click in-app update system with auto-restart
- Added schedule management page — view, edit, and cancel all scheduled scans from one place

---

### v1.4.0 — 2026-02-27
**Accuracy Improvements**
- CID-first matching — uses Google's internal Customer ID for business matching instead of name matching (critical accuracy fix)
- Added numbered map markers (1–20) showing exact rank position at each grid point
- Auto-saves CID on first name match so future runs are CID-matched

---

### v1.3.0 — 2026-02-12
**Review Deep Scraping**
- Added source attribution per review (Google Maps direct URL)
- Added CSV export for raw review data
- Improved scroll reliability for businesses with 1000+ reviews

---

### v1.2.0 — 2026-02-11
**Browser Isolation & Accuracy**
- Each grid point now uses a fully isolated browser context (zero cookies, randomized user agent)
- Prevents Google personalization from affecting rank results
- Added one-click install scripts for macOS and Windows

---

### v1.1.0 — 2026-02-10
**Matching & Stability**
- Improved business name normalization — handles abbreviations, punctuation, and suffix variations
- Added accuracy audit mode for debugging match failures
- Isolated browser contexts prevent cross-contamination between grid points

---

## Use Cases

- **Local SEO agencies** — audit client rankings across their entire service area and show geographic blind spots
- **Multi-location businesses** — compare ranking performance across locations and identify underperforming zones
- **Service area businesses (SABs)** — understand exactly where you're visible vs. invisible to potential customers
- **Competitive research** — map out which competitors own which neighborhoods and by how much
- **Before/after SEO audits** — measure the geographic impact of optimization campaigns with hard data
- **Google Business Profile optimization** — identify which areas need more reviews, posts, or citations

---

## Contributing

Contributions are welcome. This is an open-source project and community improvements make it better for everyone.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

**Author:** [Danish Mohammed](https://github.com/danishfareed)
**Website:** [vdesignu.com](https://vdesignu.com)

---

## Related Keywords

Google Maps rank tracker, local SEO tool, GBP rank checker, Google Business Profile ranking, local rank grid, geo-grid rank tracker, Google Maps SERP checker, local search rank tracking, hyperlocal SEO tool, Google Maps position checker, GMB ranking tool, local pack tracker, map pack rank checker, Google Maps competitor analysis, local SEO audit tool, Google reviews analyzer, review sentiment analysis, fake review detector, free local SEO software, open source rank tracker, Electron desktop app local SEO, offline rank tracker, Google Maps heatmap tool
