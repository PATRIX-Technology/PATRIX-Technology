# Third-party assets and their licenses

## Fonts (vendored in `assets/fonts/`, used for both the web app and PDF
generation)

| File | Family | License | Source |
|---|---|---|---|
| `Inter-Variable.ttf` | Inter | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/inter |
| `Fraunces-Variable.ttf` | Fraunces | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/fraunces |
| `NotoNaskhArabic-Variable.ttf` | Noto Naskh Arabic | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/notonaskharabic |
| `NotoKufiArabic-Variable.ttf` | Noto Kufi Arabic | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/notokufiarabic |

All four are redistributed under the OFL, which explicitly permits
bundling, embedding in documents (including PDFs), and modification
(including subsetting, which `src/lib/providers/pdf/fonts.ts` does via
`pdf-lib`'s `subset: true`). No royalty or attribution requirement beyond
keeping the OFL license text available, which this file + the upstream
repository above satisfies.

## Icons / illustrations

- `public/icons/icon.svg` — original artwork created for this project
  (simple geometric mark), not derived from any third-party asset.
- Avatar illustrations (`src/components/children/AvatarPreview.tsx`) are
  original inline SVG generated from structured data, not third-party
  artwork.

## Key open-source packages (see `package.json` for full list + versions)

| Package | License |
|---|---|
| Next.js | MIT |
| React | MIT |
| Supabase JS / SSR clients | MIT |
| pdf-lib | MIT |
| @pdf-lib/fontkit | MIT |
| arabic-reshaper | MIT |
| bidi-js | MIT |
| archiver | MIT |
| qrcode | MIT |
| zod | MIT |
| Tailwind CSS | MIT |
| next-intl | MIT |
| Vitest / Playwright | MIT |

No package with a copyleft (GPL/AGPL) or otherwise restrictive license
was intentionally selected. Run `npm ls --all` and a license-checker tool
as part of the Phase 5 dependency audit to catch anything pulled in
transitively before a production launch.
