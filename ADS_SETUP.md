# DocSpot Ads Setup (AdSense + Rewarded)

This repo already contains an **ads module** in `frontend/src/shared/ads/` that:

- Shows ads to **visitors (not logged in)**
- Shows ads to **logged-in Free** users
- Hides ads for **Pro** users (`users.user_type = paid`)

## 1) What you need to provide

### A) AdSense (responsive display slots)

You already gave the AdSense client script:

```html
<script
  async
  src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5655725305930432"
  crossorigin="anonymous"
></script>
```

In this codebase, you provide the same value via env:

- **AdSense client (publisher id)**: `VITE_ADSENSE_CLIENT=ca-pub-5655725305930432`

Then you must create ad units in AdSense and provide their **slot ids** (numeric).

Ad unit type guidance (simple + matches the current code):

- Create **Display ads** (aka “Display”) ad units
- Set them to **Responsive** sizing

DocSpot renders them inside a “native-like card” UI, but technically they are still standard **responsive display** ad units.

Create one ad unit per placement and copy the numeric slot id:

- `VITE_ADSENSE_SLOT_FOOTER` (global footer placement)
- `VITE_ADSENSE_SLOT_SHARE` (native-style placement inside share flow)
- `VITE_ADSENSE_SLOT_FEED` (in-feed placement for list pages like Invoices/Prescriptions/Medicines)
- `VITE_ADSENSE_SLOT_GATE` (popup placement shown before generating a share link; 14s lock then Close)

Policy note: “gating” actions behind an ad/timer can be sensitive for AdSense policy. Make sure this flow is compliant for your account/site.

If you don’t want multiple ad units yet, you can start with only footer+share.

### B) Rewarded ads (REAL rewarded)

Important: **Real rewarded ads on the web are not an AdSense feature.**

For “real rewarded” (user watches an ad, then you get a “reward granted” event), you typically need:

- **Google Ad Manager (GAM)**
- The **Google Publisher Tag (GPT)** library
- A **rewarded ad unit** created in GAM

To implement this, I will need:

- Your GAM **rewarded ad unit path**, e.g. `/1234567/docspot_rewarded`
- Confirmation of the **reward logic** in DocSpot. Pick one default:
  - Option 1 (recommended default): show rewarded ad when user taps “Generate share link”, but **do not block** sharing if the ad fails/gets blocked.
  - Option 2: sharing requires rewarded completion (can be annoying; higher drop-off).
  - Option 3: sharing works normally, but rewarded gives extra benefits (longer TTL / higher share limits).

## 2) Frontend env vars

Copy from `frontend/.env.example` into `frontend/.env`:

```bash
# AdSense
VITE_ADSENSE_CLIENT=ca-pub-5655725305930432
VITE_ADSENSE_SLOT_FOOTER=
VITE_ADSENSE_SLOT_SHARE=
VITE_ADSENSE_SLOT_FEED=
VITE_ADSENSE_SLOT_GATE=

# Real rewarded ads (Google Ad Manager / GPT)
VITE_GAM_REWARDED_AD_UNIT_PATH=

# Dev/testing safety
# When true, we mark ad slots as "test" to reduce policy risk during dev.
VITE_ADSENSE_TEST_MODE=true
```

Notes:

- Ads may show as blank on `localhost` until the domain is approved / the account is ready.
- In production, set `VITE_ADSENSE_TEST_MODE=false`.

## 3) Recommended placements (smooth UI, not too much)

These are the placements that fit DocSpot’s UI patterns without feeling spammy.

### Always-on baseline

- **Footer**: 1 responsive native slot

This is already implemented in the footer, so it appears across most screens.

### List pages (one in-feed ad)

List pages are where a native ad feels most “in context”:

- Invoices list
- Prescription groups list
- Object groups list (Other docs)
- Reminder medicines list

Recommendation:

- Show **1** native in-feed ad after ~3 items.

### Share moment

When a free user is actively sharing, it’s a high-intent moment:

- Show a native ad inside the share sheet (already implemented)
- Add a **rewarded** ad option for share (requires GAM/GPT)

### Public shared pages

Public shared pages already include the global footer ad. If you want to increase revenue slightly without making it feel heavy:

- Add **one** inline ad near the bottom of the page (optional)

## 4) Testing / “dummy ads” in development

Yes, it’s OK to test ad UI, but you must avoid invalid traffic.

Recommended approach:

- Use `VITE_ADSENSE_TEST_MODE=true` while developing
- Do **not** click your own ads
- Prefer testing on a staging domain that you own (ads often won’t render on `localhost`)

If you want, I can also add a dedicated “placeholder ad” component for local-only UI testing (not AdSense), but that would be purely visual and would not validate real ad rendering.

## 5) Quick checklist

- [ ] Create AdSense ad units and provide slot ids (footer/share/feed)
- [ ] Confirm whether anonymous visitors should see ads (current behavior: yes)
- [ ] Create GAM rewarded ad unit (if you want real rewarded)
- [ ] Tell me the rewarded ad unit path + your preferred reward behavior
