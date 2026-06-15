# GARVIS Production State — Final Verified

**Date:** 2026-06-15
**Commit:** `cb8fa2d`
**Production URL:** https://jarvis-command-center-1-0.onrender.com
**Repo:** sportiviforyou-netizen/jarvis-command-center (branch: main)

---

## Smoke Test Result: PASS

All checks verified post-deploy.

| Page | Status |
|---|---|
| `/jarvis` (GARVIS Command Center) | PASS |
| `/dashboard` (SPORTIVI Analytics) | PASS |
| Console errors | NONE |
| Mobile overflow (390px) | NONE |
| Mobile touch targets (≥44px) | PASS |
| Dashboard tab switching | PASS |
| `מקור חסר` in KPI values | NO |
| `$` in KPI values | NO |

---

## Dashboard KPI Values (2026-06-15, AE cache warm)

| KPI | היום | 7 ימים | 30 ימים |
|---|---|---|---|
| עמלה | ₪0 | ₪0 | ₪14.1 |
| הזמנות | 0 | 0 | 6 |
| quality label | נתון אמיתי | נתון אמיתי | נתון אמיתי |

> AliExpress API currently in Test status — today/week orders return 0 ("The result is empty" is a valid zero, not an error).

---

## Fix History (this session)

| Commit | Fix | Files |
|---|---|---|
| `3a46e75` | `API_BASE` env-aware (was `localhost:8000` hardcoded on prod) | jarvis.html |
| `3a46e75` | Commission label ₪ (was $) | sportivi_v2.html |
| `3a46e75` | Mobile touch targets 44px (`.input-action-btn`, `.state-btn`, `.run-pipeline-btn`) | jarvis.html |
| `de4c75f` | Tab switching updates clicks + orders per period; tab-aware commission display | sportivi_v2.html |
| `f0b02ca` | Per-period `commission_ils` from AE cache in `kpi_today/7d/30d`; removed `מקור חסר` | app.py, sportivi_v2.html |
| `cb8fa2d` | `.icon-btn` mobile touch target 42px → 44px (Settings + Dashboard header buttons) | jarvis.html |

---

## Architecture Notes

- **Flask app** (`app.py`, ~4200 lines) — single file, all routes
- **`_ae_cache`** (30-min TTL): populated by `GET /ae-analytics`; consumed by `vault_daily_summary`
- **`_ds_cache`** (15-min TTL): daily-summary cache; bust with `?refresh=1`
- **ILS conversion**: AliExpress provides `revenue_today_ils`, `revenue_week_ils`, `revenue_month_ils` directly — no manual USD × 3.7 needed for real AE data
- **Bitly clicks**: 0 on Render (BITLY_TOKEN not configured); vault `Click_Events` used for today's clicks instead
- **`/api/sportivi/portal-balance`**: does NOT exist in garvis-live (local FastAPI only) — portal balance KPI not shown on dashboard by design

---

## Remaining Known Gaps

| Gap | Impact | Action Required |
|---|---|---|
| `BITLY_TOKEN` not configured on Render | Bitly click tracking = 0; vault Click_Events used as fallback | Add `BITLY_TOKEN` in Render env vars |
| AliExpress API still in Test status | today/week orders = 0 (valid); month data real | Request AliExpress API production approval |
| Portal balance (`יתרה זמינה`) not on dashboard | KPI missing | Requires secure cookie/env flow — not implemented by design |
