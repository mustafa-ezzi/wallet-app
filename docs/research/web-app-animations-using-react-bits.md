# Web animations for WalletTrails (React Bits + what fits)

**Question:** Can we add transitions / animations to the WalletTrails **web app**?  
**Short answer:** Yes. The web frontend already uses light motion (`animejs` + CSS). [React Bits](https://reactbits.dev/) is a good source of polished React components, but we should pick **calm, finance-app** motion — not marketing-site fireworks.

---

## What React Bits is

[React Bits](https://reactbits.dev/) is an open-source library of **copy-paste / CLI-installable** animated React pieces:

- Text animations, UI components, backgrounds, interaction effects  
- **165+** free components (growing)  
- Variants: JS/TS × CSS/Tailwind  
- Mostly **CSS** under the hood; heavier pieces optionally pull **GSAP**, **Motion**, **Three.js**, etc. only when that component needs them  
- Works with Vite + React (WalletTrails web is Vite) — no Next.js requirement  

Docs / install: [reactbits.dev](https://reactbits.dev/) · GitHub: [DavidHDev/react-bits](https://github.com/davidhdev/react-bits)

There is also a paid **React Bits Pro** ([pro.reactbits.dev](https://pro.reactbits.dev/)) with page blocks and app UI kits. We do **not** need Pro to start.

---

## What WalletTrails already has (web)

| Area | Today |
|------|--------|
| Engine | `animejs` (theme pixel dissolve, layout / onboarding tweens, balance count-up) |
| CSS | Short hover / press / progress transitions; list `Reveal`; modal enter; `prefers-reduced-motion` |
| Theme | **Pixel dissolve** overlay (`ThemeRevealOverlay`) — React Bits–inspired, no GSAP |
| Helpers | `components/motion/Reveal.tsx`, `components/motion/CountUp.tsx` |
| Charts | Category donut / progress bars with CSS width transitions |

Prefer **extend** what we have. Do not add GSAP or Framer Motion unless a specific piece truly needs them.

---

## Implemented (on-brand)

| Motion | Where | Notes |
|--------|--------|--------|
| **Pixel theme transition** | Settings theme swatches | Full-screen grid dissolve in new theme colors via `animejs`; skips if reduced motion |
| **Stagger reveal** | Dashboard cards / wallets / recent txs; Accounts wallets & people | Fade + 8px rise, ~40ms stagger, IntersectionObserver |
| **Balance count-up** | Dashboard “What you have”; Accounts combined balance | ~0.6s `easeOutExpo`; instant if reduced motion |
| **Modal present** | `.modal-overlay` / `.modal-sheet` | Backdrop fade + sheet slide (~16px), soft easing |

---

## What looks good on WalletTrails

WalletTrails is a **money app** (wallets, bills, people, family). Motion should feel:

- Fast (150–400ms), soft easing  
- Useful (feedback, hierarchy, orientation)  
- Quiet on data-heavy screens (tables, ledgers, history lists)  
- Respectful of `prefers-reduced-motion: reduce`

### Still good fits (optional later)

| Idea | Where | Why |
|------|--------|-----|
| Nav / tab **active indicator** | Layout island / sidebar | Orientation |
| Subtle **press scale** on primary buttons | Forms, CTAs | Already partly in CSS |
| **Success pulse** | After Save | Soft scale, then settle |
| **Empty state** icon fade | Empty lists | Gentle, not looping particles |

### Avoid on product screens (no / landing-only)

| Effect | Why it clashes |
|--------|----------------|
| Particle / plasma / aurora **full-page backgrounds** | Distracts from balances; hurts readability |
| Cursor trails, magnetic globs, 3D blobs | Toys, not money UI |
| Infinite scroll-jacking / heavy parallax | Frustrating on long ledgers |
| Glitch / scramble text on amounts | Undermines trust |
| Purple neon / glow stacks | Conflicts with WalletTrails emerald / glass language |
| Auto-playing loud text loops on Home | Noise next to real balances |

Use flashy React Bits backgrounds only on **marketing / signup** if we ever want a splash — not inside Dashboard / Accounts / Reports.

---

## Can we use React Bits here?

| Check | WalletTrails web |
|-------|----------------|
| React + Vite | Yes |
| TypeScript | Yes — pick **TS + CSS** variants (we don’t use Tailwind in `frontend/`) |
| Copy into repo | Yes — components become ours (edit colors to CSS variables) |
| Extra deps | Only if the chosen component needs GSAP / Motion / Three — install per component |
| Bundle size | Fine if we copy **1–3** small pieces; bad if we dump 20 WebGL backgrounds |

**Recommendation:** Treat React Bits as a **catalog**, not a dependency of the whole app. Copy one component at a time into e.g. `frontend/src/components/motion/`.

---

## Practical stack choice

1. **Default:** CSS transitions + existing `animejs` (already in `package.json`).  
2. **Optional:** Copy a React Bits **TS + CSS** component when CSS alone is awkward.  
3. **Avoid for now:** Adding Framer Motion *and* GSAP *and* Three “just because.”  
4. **Mobile:** Separate codebase (Expo). React Bits is for **web**; mobile already has Reanimated / Reveal.

---

## Decision

| | |
|--|--|
| **Can we add animations on the web app?** | **Yes — several are live.** |
| **Should we paste half of React Bits?** | **No.** |
| **Best path** | Keep glass + emerald calm; use CSS / `animejs`; cherry-pick ideas (e.g. pixel theme) without pulling GSAP. |
