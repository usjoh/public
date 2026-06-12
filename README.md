# usjoh/public

**Repo contract: everything in this repo is intentionally world-readable.**

This is the durable home for artifacts that are meant to be shared publicly — demo apps, gifts, reference pages, anything safe to live on the open web.

A push to this repo is a deliberate publishing act. If something might be sensitive, it does not belong here.

## Live site

<https://usjoh.github.io/public/>

## Layout

Each artifact is a top-level subdirectory served at its own subpath:

| Path | URL | Description |
|---|---|---|
| `escher/` | `/public/escher/` | The Wonder World of M.C. Escher — interactive kid-friendly tour |
| `disney-trip-alerts/` | `/public/disney-trip-alerts/` | Privacy policy + SMS terms for the family trip board's text alerts (on file with the carrier registration) |

Add a new artifact by dropping its directory at the repo root and adding a row above plus a link in `index.html`.

## Analytics

All pages use [GoatCounter](https://usjoh.goatcounter.com) (no cookies, no PII). The tracking snippet sits before `</body>` in each page's HTML; GoatCounter auto-segments by URL path.

## Deployment

GitHub Pages, deployed from `main` via `.github/workflows/pages.yml`.
