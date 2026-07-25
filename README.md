# CWA Target Calculator

Static, no-backend site (per `website_build_plan.md`) that tells a student what
score they need in each course this semester to hit a target cumulative CWA.

## Run locally

No build step. Any static file server works, since the browser's `fetch()`
can't read `data/courses.csv` over `file://`.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Project structure

```
CWA Calculator/
├── index.html
├── css/styles.css
├── js/
│   ├── app.js               DOM wiring (incl. plan tabs)
│   ├── catalog.js           loads + filters data/courses.csv (dependency-free CSV parser)
│   ├── calculator.js        CWA math + per-course target splitting (3 plans)
│   ├── plan-export.js       PNG (canvas) / PDF (jsPDF) export
│   └── vendor/jspdf.umd.min.js
└── data/courses.csv    course catalog (copy from Tool 1's master export)
```

## Data scope (as of 2026-07-25)

`data/courses.csv` currently only contains **Year 1** data, and not even
completely — Biomedical Eng. and Computer Eng. are missing Semester 2.
Programmes/years/semesters in the UI are derived dynamically from whatever
rows exist in the CSV, so the site will automatically pick up more programmes
and years as Tool 1's extraction is expanded — just overwrite
`data/courses.csv` with the new export, no code changes needed.

There is no "Computer Science" programme in the catalog; the closest is
"Computer Eng." The build plan's MVP scope assumed a "Computer Science"
programme that doesn't exist in the extracted data.

## Calculation logic

See `js/calculator.js`. Answers to the open questions in the build plan
(section 7), as confirmed for this build:

1. **Per-course split formula:** inverse-credit weighting for the Balanced
   plan. Lower-credit courses swing further from the required semester
   average; higher-credit courses stay closer to it. The credit-weighted mean
   of the unclamped targets is always exactly the required average (proof is
   in the `splitTargets` comment).
2. **"Unrealistic" threshold:** a target that is either over 100 (impossible)
   or 90+ (technically possible but unlikely) is flagged red in the Balanced
   and Equal Split plans.
3. **If even the safety-capped plan is impossible:** the UI shows a warning
   and the closest achievable outcome (every remaining course capped).
4. **Editable course list:** students can untick a catalog course they're not
   taking, or add one manually (name + credits) if their registration differs.
5. **Rounding:** CWA to 2 decimals, per-course targets to whole numbers.

### The 3 plans

Generated every time, switchable via the tab bar above the results table:

1. **Balanced Plan** — inverse-credit-weighted split (see above). Targets over
   100 are capped and shown in red as "N+"; targets ≥90 are flagged red.
2. **Equal Split Plan** — the same target score in every course. Simplest to
   reason about, but ignores that some courses are worth more credits.
3. **Safety Plan** — iteratively caps any course at `SAFETY_CAP` (85 by
   default) and redistributes the shortfall across the rest, so no single
   course is ever asked for more than that ceiling. If the required average
   can't be reached while respecting the cap, the plan shows every course at
   the cap and warns that it's the closest achievable outcome.

## Downloading a plan

Each plan has "Download as PNG" and "Download as PDF" buttons — both save a
file directly, no dialogs or new tabs:

- Both reuse the same off-screen `<canvas>` render (2x scale) of the currently
  active plan.
- **PNG** saves that canvas straight to a Blob download.
- **PDF** embeds the canvas as a JPEG (not PNG — jsPDF stores alpha-channel
  PNGs as an uncompressed raw bitmap, which bloated a 150KB image into a
  4.6MB PDF during testing) into a page sized to match it exactly, via
  [jsPDF](https://github.com/parallax/jsPDF) (`js/vendor/jspdf.umd.min.js`,
  the one external dependency in this project).

## Known limitations

The inverse-credit-weighting "spread" (`SPREAD_STRENGTH` in `calculator.js`)
and the Safety plan's ceiling (`SAFETY_CAP`) are tunable constants, not
derived from a KNUST-specified formula — there isn't one. Adjust them if the
per-course spread feels too aggressive, too flat, or too strict once tested
against real student expectations.

## Deployment

Deployed on [Vercel](https://vercel.com) as a static site — no build step, no
environment variables. Every push to `main` on GitHub redeploys automatically.
