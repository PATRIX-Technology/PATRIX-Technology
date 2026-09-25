# Third-party assets and their licenses

## Fonts (vendored in `assets/fonts/`, used for both the web app and PDF
generation)

| File | Family | License | Source |
|---|---|---|---|
| `Inter-Variable.ttf` | Inter | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/inter |
| `Fraunces-Variable.ttf` | Fraunces | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/fraunces |
| `NotoNaskhArabic-Variable.ttf` | Noto Naskh Arabic | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/notonaskharabic |
| `NotoKufiArabic-Variable.ttf` | Noto Kufi Arabic | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/notokufiarabic |
| `Inter-Regular-Static.ttf` | Inter (static instance, wght=400 opsz=14) | SIL Open Font License 1.1 | Generated from `Inter-Variable.ttf` above via `fonttools varLib.instancer` |
| `Fraunces-Display-Static.ttf` | Fraunces (static instance, wght=600 opsz=72 SOFT=0 WONK=1) | SIL Open Font License 1.1 | Generated from `Fraunces-Variable.ttf` above via `fonttools varLib.instancer` |
| `NotoNaskhArabic-Regular-Static.ttf` | Noto Naskh Arabic (static instance, wght=400) | SIL Open Font License 1.1 | Generated from `NotoNaskhArabic-Variable.ttf` above via `fonttools varLib.instancer` |

All are redistributed under the OFL, which explicitly permits bundling,
embedding in documents (including PDFs), and modification — including the
static instancing above and subsetting, though PDF generation currently
embeds the static instances unsubset (`subset: false`; see
`src/lib/providers/pdf/fonts.ts` and docs/DECISIONS.md "PDF font
subsetting disabled"). No royalty or attribution requirement beyond
keeping the OFL license text available, which this file + the upstream
repository above satisfies.

The three `*-Static.ttf` files are what `src/lib/providers/pdf/fonts.ts`
actually embeds into generated PDFs — the `*-Variable.ttf` files are kept
as the editable source to regenerate them from if a different
weight/width/optical-size instance is ever needed:

```
python3 -m fontTools.varLib.instancer assets/fonts/Inter-Variable.ttf wght=400 opsz=14 -o assets/fonts/Inter-Regular-Static.ttf
python3 -m fontTools.varLib.instancer assets/fonts/Fraunces-Variable.ttf wght=600 opsz=72 SOFT=0 WONK=1 -o assets/fonts/Fraunces-Display-Static.ttf
python3 -m fontTools.varLib.instancer assets/fonts/NotoNaskhArabic-Variable.ttf wght=400 -o assets/fonts/NotoNaskhArabic-Regular-Static.ttf
```

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
