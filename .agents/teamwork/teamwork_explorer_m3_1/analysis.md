# VelvetAura Design System, CSS Architecture & HTML Shell Blueprint

**Architect**: `teamwork_explorer_m3_1`  
**Milestone**: Milestone 3 — Dark-Mode Glassmorphism Frontend  
**Target Path**: `public/index.html`, `public/css/variables.css`, `public/css/base.css`, `public/css/glassmorphism.css`, `public/css/components.css`  
**Date**: 2026-11-04  
**Status**: Ready for Implementation  

---

## 1. Executive Summary & Design System Foundations

VelvetAura is a luxury digital boutique specializing in authentic, high-end imported beauty, skincare, cosmetics, and fragrances from world capitals (Paris, Seoul, Tokyo, Milan, London, Zurich). The frontend architecture requires an editorial, high-fashion aesthetic implemented via a **pure dark-mode glassmorphism design system**.

### 1.1 Core Aesthetic Pillars
1. **Obsidian Canvas (`#0B0B13`)**: A deep, pitch-dark obsidian night sky background that gives glass layers infinite depth.
2. **Multi-Tier Frosted Glass Materials**: Distinct depth tiers using `-webkit-backdrop-filter` and `backdrop-filter: blur(...)` combined with translucent rgba fills and light refraction borders (1px top-highlight).
3. **Luminous Metallic Accents**: Warm Champagne Gold (`#E0A96D`) for primary actions and badges, Royal Velvet Purple (`#9D4EDD`) for atmospheric glow and secondary highlights, and French Rose (`#F43F5E`) for emotional accents.
4. **Editorial Luxury Typography**: A refined pairing of **Cormorant Garamond** (editorial serif headings) with **Plus Jakarta Sans** (clean, modern geometric UI and body copy) and **Inter** (numeric and data tables).
5. **Fluid, Non-Blocking Interactions**: Zero full-page reloads, instant reactive cart badge pulse animations, slide-over drawer transitions, and live pricing calculations.

### 1.2 Performance & Rendering Constraints
- **GPU Acceleration**: All glass cards, sliding drawers, and floating orbs utilize `transform: translateZ(0)` and `will-change: transform` to trigger compositing layers and maintain 60 FPS scrolling.
- **Glass Fallback**: Graceful progressive enhancement via `@supports not (backdrop-filter: blur(1px))` utilizing high-opacity fallbacks (`rgba(18, 17, 29, 0.95)`).
- **Zero External Bundler Dependencies**: Written in standard, modern CSS3 (Custom Properties, Flexbox, CSS Grid) and semantic HTML5, ready to be served immediately by Express static middleware.

---

## 2. Document Shell Specification: `public/index.html`

The document shell acts as the mounting foundation for the Single-Page Application (SPA). It provides:
1. SEO & responsive viewport meta tags with dark theme configuration.
2. Preconnected Google Fonts typography.
3. Ambient glowing orbs background container.
4. Reusable inline SVG symbol definitions (defs sprite).
5. Explicit, semantic DOM mounting points with ARIA accessibility roles for all SPA components.
6. Clean ES Module bootstrap.

### 2.1 Complete Blueprint for `public/index.html`

```html
<!DOCTYPE html>
<html lang="en" class="dark-mode">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
  <meta http-equiv="X-UA-Compatible" content="ie=edge" />

  <!-- Primary Meta Tags -->
  <title>VelvetAura — Curated Luxury Imported Beauty & Fragrances</title>
  <meta name="title" content="VelvetAura — Curated Luxury Imported Beauty & Fragrances" />
  <meta name="description" content="Discover rare, authentic imported skincare, cosmetics, and haute parfumerie directly sourced from Paris, Seoul, Tokyo, and Milan." />
  <meta name="theme-color" content="#0B0B13" />
  <meta name="color-scheme" content="dark" />

  <!-- Open Graph / Social Sharing -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://velvetaura.luxury/" />
  <meta property="og:title" content="VelvetAura — Curated Luxury Imported Beauty" />
  <meta property="og:description" content="Luxury imported beauty products with guaranteed authenticity and direct global cargo fulfillment." />
  <meta property="og:image" content="/assets/images/og-preview.jpg" />

  <!-- Google Fonts Preconnect & Stylesheets -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,400;1,600&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />

  <!-- Core CSS Cascading Architecture -->
  <link rel="stylesheet" href="css/variables.css" />
  <link rel="stylesheet" href="css/base.css" />
  <link rel="stylesheet" href="css/glassmorphism.css" />
  <link rel="stylesheet" href="css/components.css" />

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✨</text></svg>" />
</head>

<body class="velvet-body">
  <!-- 1. Ambient Background Glow Orbs -->
  <div class="ambient-glow-wrapper" aria-hidden="true">
    <div class="glow-orb orb-purple"></div>
    <div class="glow-orb orb-gold"></div>
    <div class="glow-orb orb-rose"></div>
  </div>

  <!-- 2. Reusable SVG Symbols (Icon Defs) -->
  <svg style="display: none;" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Shopping Bag Icon -->
      <symbol id="icon-bag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 0 1-8 0"/>
      </symbol>

      <!-- Search Icon -->
      <symbol id="icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </symbol>

      <!-- Close (X) Icon -->
      <symbol id="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </symbol>

      <!-- Star Icon (Filled) -->
      <symbol id="icon-star" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </symbol>

      <!-- Checkmark Icon -->
      <symbol id="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </symbol>

      <!-- Trash Icon -->
      <symbol id="icon-trash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        <line x1="10" y1="11" x2="10" y2="17"/>
        <line x1="14" y1="11" x2="14" y2="17"/>
      </symbol>

      <!-- User / Profile Icon -->
      <symbol id="icon-user" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </symbol>

      <!-- Shield / Authenticity Icon -->
      <symbol id="icon-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </symbol>

      <!-- Airplane / Air Cargo Icon -->
      <symbol id="icon-plane" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3.5c-.5-.5-2.5 0-4 1.5L13.5 8.5 5.3 6.7c-.8-.2-1.6.2-2 1-.3.8-.1 1.7.5 2.2l4.6 3.6-2.9 2.9-2.4-.6c-.5-.1-1.1.1-1.4.5-.4.5-.3 1.2.2 1.6l2.3 1.8 1.8 2.3c.4.5 1.1.6 1.6.2.4-.3.6-.9.5-1.4l-.6-2.4 2.9-2.9 3.6 4.6c.5.6 1.4.8 2.2.5.8-.4 1.2-1.2 1-2z"/>
      </symbol>

      <!-- Sparkles / Luxury Icon -->
      <symbol id="icon-sparkles" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"/>
      </symbol>

      <!-- Credit Card Icon -->
      <symbol id="icon-card" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </symbol>

      <!-- Chevron Down Icon -->
      <symbol id="icon-chevron-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </symbol>

      <!-- Chevron Right Icon -->
      <symbol id="icon-chevron-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </symbol>
    </defs>
  </svg>

  <!-- 3. Global Sticky Navigation Mounting Point -->
  <header id="navbar-root" class="site-header" role="banner"></header>

  <!-- 4. Main Content Mounting Area -->
  <main id="app-root" class="main-layout" role="main">
    <!-- View A: Hero Banner -->
    <section id="hero-banner" class="hero-section" aria-label="VelvetAura Welcome"></section>

    <!-- View B: Catalog View -->
    <section id="catalog-section" class="catalog-section" aria-label="Curated Catalog">
      <!-- Filter & Search Toolbar Container -->
      <div id="catalog-filters" class="catalog-filters-bar"></div>
      
      <!-- Catalog Summary (Active count, active filter chips) -->
      <div id="catalog-summary" class="catalog-summary-bar"></div>

      <!-- Products Grid -->
      <div id="catalog-grid" class="product-grid" role="region" aria-live="polite"></div>

      <!-- Pagination / Load More -->
      <div id="catalog-pagination" class="pagination-bar"></div>
    </section>

    <!-- View C: User Account & Order History (SPA router toggled) -->
    <section id="account-section" class="account-section" style="display: none;" aria-label="Customer Account"></section>

    <!-- View D: Order Confirmation Receipt View (SPA router toggled) -->
    <section id="order-confirmation-section" class="confirmation-section" style="display: none;" aria-label="Order Confirmation"></section>
  </main>

  <!-- 5. Global Footer Mounting Point -->
  <footer id="footer-root" class="site-footer" role="contentinfo"></footer>

  <!-- 6. Modals & Portals Container -->
  <!-- Product Detail Modal Overlay -->
  <div id="product-modal-root" class="modal-portal" aria-hidden="true" role="dialog" aria-modal="true"></div>

  <!-- Slide-Over Shopping Cart Drawer Portal -->
  <div id="cart-drawer-root" class="drawer-portal" aria-hidden="true" role="dialog" aria-modal="true"></div>

  <!-- Checkout Modal Portal -->
  <div id="checkout-modal-root" class="modal-portal" aria-hidden="true" role="dialog" aria-modal="true"></div>

  <!-- Authentication Modal (Sign In / Register) Portal -->
  <div id="auth-modal-root" class="modal-portal" aria-hidden="true" role="dialog" aria-modal="true"></div>

  <!-- 7. Toast Notification Floating Container -->
  <div id="toast-container" class="toast-stack" aria-live="polite" aria-atomic="true"></div>

  <!-- 8. Client Application Bootstrap (ES Modules) -->
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

---

## 3. Design Tokens Architecture: `public/css/variables.css`

The variables file provides a centralized, single-source-of-truth design token system.

```css
/**
 * VelvetAura - Design Tokens & Custom Properties
 * Dark-Mode Glassmorphism Design System
 */

:root {
  /* =========================================================================
     1. COLOR PALETTE: SURFACES & CANVAS
     ========================================================================= */
  --bg-primary: #0B0B13;            /* Deep obsidian night (base canvas) */
  --bg-secondary: #12111D;          /* Midnight violet slate (sections/bars) */
  --bg-surface: #1A1829;            /* Elevated dark surface */
  --bg-elevated: #201D33;           /* Overlay surface (modals/drawers) */
  --bg-overlay: rgba(5, 5, 10, 0.75);/* Backdrop dimming layer */

  /* =========================================================================
     2. GLASS MATERIAL FILLS (Variable Translucency)
     ========================================================================= */
  --glass-subtle: rgba(255, 255, 255, 0.03);      /* Inputs, subtle chips */
  --glass-card: rgba(26, 24, 41, 0.65);           /* Catalog cards, filter bar */
  --glass-card-hover: rgba(34, 30, 54, 0.75);     /* Interactive card hover */
  --glass-elevated: rgba(28, 25, 46, 0.88);       /* Modals, popovers */
  --glass-drawer: rgba(18, 17, 29, 0.94);         /* Slide-over cart drawer */
  --glass-input: rgba(255, 255, 255, 0.045);     /* Form controls */
  --glass-input-focus: rgba(255, 255, 255, 0.08); /* Focused inputs */

  /* =========================================================================
     3. FROSTED GLASS BORDERS & LIGHT REFRACTION
     ========================================================================= */
  --glass-border-subtle: rgba(255, 255, 255, 0.08);       /* Default glass outline */
  --glass-border-mid: rgba(255, 255, 255, 0.14);          /* Card division & inputs */
  --glass-border-highlight: rgba(255, 255, 255, 0.22);    /* Top-edge light prism */
  --glass-border-gold: rgba(224, 169, 109, 0.45);        /* Champagne accent border */
  --glass-border-purple: rgba(157, 78, 221, 0.45);      /* Velvet accent border */

  /* =========================================================================
     4. LUMINOUS BRAND ACCENTS & METALLIC SHIMMERS
     ========================================================================= */
  /* Champagne Gold (Primary CTA, badges, ratings) */
  --accent-gold: #E0A96D;
  --accent-gold-hover: #F0BC83;
  --accent-gold-light: #FFF1D6;
  --accent-gold-muted: rgba(224, 169, 109, 0.16);
  --accent-gold-glow: rgba(224, 169, 109, 0.38);

  /* Royal Velvet Purple (Atmospheric glow, gradients) */
  --accent-purple: #9D4EDD;
  --accent-purple-hover: #B265F0;
  --accent-purple-light: #E0AAFF;
  --accent-purple-muted: rgba(157, 78, 221, 0.16);
  --accent-purple-glow: rgba(157, 78, 221, 0.38);

  /* French Rose (Wishlist, discounts, beauty highlights) */
  --accent-rose: #F43F5E;
  --accent-rose-hover: #FB7185;
  --accent-rose-muted: rgba(244, 63, 94, 0.16);
  --accent-rose-glow: rgba(244, 63, 94, 0.38);

  /* Active K-Beauty Moisture Cyan */
  --accent-cyan: #38BDF8;
  --accent-cyan-muted: rgba(56, 189, 248, 0.16);

  /* =========================================================================
     5. TYPOGRAPHY COLOR HIERARCHY (WCAG AA/AAA Compliant)
     ========================================================================= */
  --text-high: #F8FAFC;        /* 98% white for headings and primary titles */
  --text-medium: #CBD5E1;      /* 82% silver for body copy and descriptions */
  --text-muted: #94A3B8;       /* 60% slate for secondary tags, subtitles */
  --text-dim: #64748B;         /* 40% slate for subtle icons and placeholders */
  --text-on-gold: #0B0B13;     /* Deep dark text for contrast on gold buttons */
  --text-on-purple: #FFFFFF;   /* Crisp white text for contrast on purple buttons */

  /* =========================================================================
     6. SEMANTIC FEEDBACK & INVENTORY TOKENS
     ========================================================================= */
  --status-success: #10B981;         /* In-stock, order success */
  --status-success-bg: rgba(16, 185, 129, 0.14);
  --status-success-border: rgba(16, 185, 129, 0.35);

  --status-warning: #F59E0B;         /* Low stock ("Only X left") */
  --status-warning-bg: rgba(245, 158, 11, 0.14);
  --status-warning-border: rgba(245, 158, 11, 0.35);

  --status-danger: #EF4444;          /* Out of stock, payment error */
  --status-danger-bg: rgba(239, 68, 68, 0.14);
  --status-danger-border: rgba(239, 68, 68, 0.35);

  /* =========================================================================
     7. BACKDROP FILTER BLURS
     ========================================================================= */
  --blur-subtle: blur(8px);
  --blur-standard: blur(16px) saturate(180%);
  --blur-heavy: blur(24px) saturate(190%);
  --blur-modal: blur(28px) saturate(200%);

  /* =========================================================================
     8. BOX SHADOWS & LUMINOUS GLOWS
     ========================================================================= */
  --shadow-card: 0 8px 32px 0 rgba(0, 0, 0, 0.45);
  --shadow-card-hover: 0 16px 40px -8px rgba(0, 0, 0, 0.65), 0 0 24px -4px var(--accent-gold-glow);
  --shadow-elevated: 0 20px 50px rgba(0, 0, 0, 0.75), 0 0 40px rgba(157, 78, 221, 0.12);
  --shadow-drawer: -10px 0 50px rgba(0, 0, 0, 0.8), 0 0 40px rgba(157, 78, 221, 0.1);
  --shadow-glow-gold: 0 0 24px var(--accent-gold-glow);
  --shadow-glow-purple: 0 0 24px var(--accent-purple-glow);

  /* =========================================================================
     9. FONT FAMILIES & SCALING
     ========================================================================= */
  --font-serif: 'Cormorant Garamond', Georgia, serif;
  --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'Inter', SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Font Weights */
  --fw-light: 300;
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;

  /* =========================================================================
     10. SPACING & SIZING SCALE
     ========================================================================= */
  --space-2xs: 4px;
  --space-xs: 8px;
  --space-sm: 12px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;

  /* Max Widths */
  --container-max: 1380px;
  --drawer-width: 440px;
  --modal-max-width: 640px;
  --detail-modal-max-width: 960px;

  /* =========================================================================
     11. BORDER RADII
     ========================================================================= */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* =========================================================================
     12. TRANSITION TIMING CURVES
     ========================================================================= */
  --ease-smooth: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --transition-fast: 150ms ease;
  --transition-base: 250ms var(--ease-smooth);
  --transition-slow: 400ms var(--ease-smooth);

  /* =========================================================================
     13. Z-INDEX HIERARCHY
     ========================================================================= */
  --z-background: -1;
  --z-orbs: 0;
  --z-content: 10;
  --z-sticky-nav: 100;
  --z-drawer-backdrop: 200;
  --z-drawer: 210;
  --z-modal-backdrop: 300;
  --z-modal: 310;
  --z-toast: 400;
}
```

---

## 4. Reset, Typography & Layout Architecture: `public/css/base.css`

`base.css` establishes a baseline reset, typography rules, luxury gold/purple text gradient utilities, custom scrollbar styling, responsive grid systems, and accessibility utilities.

```css
/**
 * VelvetAura - Base Styles, Reset & Typography
 */

/* 1. Box Sizing & Document Reset */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  scroll-behavior: smooth;
  -webkit-text-size-adjust: 100%;
}

body.velvet-body {
  min-height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-medium);
  font-family: var(--font-sans);
  font-weight: var(--fw-regular);
  line-height: 1.6;
  overflow-x: hidden;
  position: relative;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 2. Editorial Typography Hierarchy */
h1, h2, h3, h4, h5, h6 {
  color: var(--text-high);
  font-family: var(--font-serif);
  font-weight: var(--fw-semibold);
  line-height: 1.25;
  letter-spacing: -0.015em;
}

h1 {
  font-size: clamp(2.25rem, 5vw, 3.75rem);
  font-weight: var(--fw-bold);
}

h2 {
  font-size: clamp(1.75rem, 3.5vw, 2.5rem);
}

h3 {
  font-size: clamp(1.35rem, 2.5vw, 1.85rem);
}

h4 {
  font-size: 1.25rem;
  font-family: var(--font-sans);
  font-weight: var(--fw-semibold);
}

p {
  margin-bottom: 0.75rem;
}

a {
  color: inherit;
  text-decoration: none;
  transition: color var(--transition-fast);
}

button {
  font-family: inherit;
  cursor: pointer;
  border: none;
  background: none;
  outline: none;
}

input, select, textarea {
  font-family: inherit;
  font-size: 0.95rem;
}

/* 3. Luxury Gradient Text Utilities */
.text-gold-gradient {
  background: linear-gradient(135deg, #FFF8EC 0%, #E0A96D 50%, #B87C3E 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: inline-block;
}

.text-purple-gradient {
  background: linear-gradient(135deg, #F5E8FF 0%, #9D4EDD 60%, #6A1B9A 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: inline-block;
}

/* 4. Luxury Dark Custom Scrollbars */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-primary);
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-full);
  border: 2px solid var(--bg-primary);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--accent-gold);
}

/* 5. Responsive Container & Grid Architecture */
.main-layout {
  position: relative;
  z-index: var(--z-content);
  max-width: var(--container-max);
  margin: 0 auto;
  padding: 0 var(--space-lg);
  min-height: calc(100vh - 80px);
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-top: var(--space-lg);
  margin-bottom: var(--space-3xl);
}

/* 6. Utility Helper Classes */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.flex { display: flex; }
.flex-col { display: flex; flex-direction: column; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.justify-center { justify-content: center; }
.gap-xs { gap: var(--space-xs); }
.gap-sm { gap: var(--space-sm); }
.gap-md { gap: var(--space-md); }
.gap-lg { gap: var(--space-lg); }

:focus-visible {
  outline: 2px solid var(--accent-gold);
  outline-offset: 3px;
}
```

---

## 5. Glassmorphism Engine & Keyframes: `public/css/glassmorphism.css`

`glassmorphism.css` defines the multi-tier glass materials, ambient glow orbs with subtle floating keyframe physics, and the button/input glass primitives.

```css
/**
 * VelvetAura - Glassmorphism System & Ambient Glow Engine
 */

/* =========================================================================
   1. AMBIENT BACKGROUND GLOW ENGINE
   ========================================================================= */
.ambient-glow-wrapper {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: var(--z-orbs);
}

.glow-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.8;
  will-change: transform;
}

/* Top-Left Velvet Royal Purple Orb */
.glow-orb.orb-purple {
  top: -15%;
  left: 10%;
  width: 550px;
  height: 550px;
  background: radial-gradient(circle, rgba(157, 78, 221, 0.22) 0%, rgba(157, 78, 221, 0) 70%);
  animation: float-orb-1 22s ease-in-out infinite alternate;
}

/* Bottom-Right Warm Champagne Gold Orb */
.glow-orb.orb-gold {
  bottom: 10%;
  right: 5%;
  width: 650px;
  height: 650px;
  background: radial-gradient(circle, rgba(224, 169, 109, 0.16) 0%, rgba(224, 169, 109, 0) 70%);
  animation: float-orb-2 26s ease-in-out infinite alternate;
}

/* Center-Floating Rose Accent Orb */
.glow-orb.orb-rose {
  top: 45%;
  left: 45%;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(244, 63, 94, 0.10) 0%, rgba(244, 63, 94, 0) 70%);
  animation: float-orb-3 18s ease-in-out infinite alternate;
}

@keyframes float-orb-1 {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(80px, 60px) scale(1.12); }
  100% { transform: translate(-60px, 100px) scale(0.92); }
}

@keyframes float-orb-2 {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-70px, -90px) scale(1.15); }
  100% { transform: translate(50px, -50px) scale(0.95); }
}

@keyframes float-orb-3 {
  0% { transform: translate(0, 0) scale(0.9); }
  100% { transform: translate(-100px, 80px) scale(1.2); }
}

/* =========================================================================
   2. MULTI-TIER GLASS SURFACES
   ========================================================================= */

/* Glass Tier 1: Baseline Glass Panel */
.glass-panel {
  background: var(--glass-card);
  backdrop-filter: var(--blur-standard);
  -webkit-backdrop-filter: var(--blur-standard);
  border: 1px solid var(--glass-border-subtle);
  border-top: 1px solid var(--glass-border-highlight);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

/* Glass Tier 2: Product & Feature Cards (with dynamic hover lift) */
.glass-card {
  background: var(--glass-card);
  backdrop-filter: var(--blur-standard);
  -webkit-backdrop-filter: var(--blur-standard);
  border: 1px solid var(--glass-border-subtle);
  border-top: 1px solid var(--glass-border-highlight);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition: transform var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base);
  will-change: transform;
}

.glass-card:hover {
  transform: translateY(-5px);
  border-color: var(--glass-border-gold);
  border-top-color: rgba(255, 255, 255, 0.35);
  box-shadow: var(--shadow-card-hover);
}

/* Glass Tier 3: Elevated Modals & Drawers */
.glass-elevated {
  background: var(--glass-elevated);
  backdrop-filter: var(--blur-heavy);
  -webkit-backdrop-filter: var(--blur-heavy);
  border: 1px solid var(--glass-border-mid);
  border-top: 1px solid var(--glass-border-highlight);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-elevated);
}

/* Glass Tier 4: Inputs & Interactive Form Controls */
.glass-input {
  background: var(--glass-input);
  backdrop-filter: var(--blur-subtle);
  -webkit-backdrop-filter: var(--blur-subtle);
  border: 1px solid var(--glass-border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-high);
  padding: 10px 16px;
  font-size: 0.95rem;
  transition: all var(--transition-fast);
}

.glass-input::placeholder {
  color: var(--text-dim);
}

.glass-input:focus {
  background: var(--glass-input-focus);
  border-color: var(--accent-gold);
  box-shadow: 0 0 16px var(--accent-gold-glow);
  outline: none;
}

/* Glass Tier 5: Pills, Origin Badges & Category Tabs */
.glass-pill {
  background: var(--glass-subtle);
  backdrop-filter: var(--blur-subtle);
  -webkit-backdrop-filter: var(--blur-subtle);
  border: 1px solid var(--glass-border-subtle);
  border-radius: var(--radius-full);
  padding: 6px 14px;
  font-size: 0.8rem;
  font-weight: var(--fw-medium);
  color: var(--text-medium);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.glass-pill:hover,
.glass-pill.active {
  background: var(--accent-gold-muted);
  border-color: var(--glass-border-gold);
  color: var(--accent-gold);
  box-shadow: 0 0 12px var(--accent-gold-glow);
}

/* =========================================================================
   3. GLASS BUTTON PRIMITIVES
   ========================================================================= */

/* Primary CTA: Champagne Gold Glow */
.btn-gold {
  background: linear-gradient(135deg, #F0BC83 0%, #E0A96D 100%);
  color: var(--text-on-gold);
  font-weight: var(--fw-semibold);
  font-size: 0.95rem;
  padding: 12px 24px;
  border-radius: var(--radius-full);
  box-shadow: 0 4px 16px var(--accent-gold-glow);
  transition: all var(--transition-base);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-gold:hover {
  background: linear-gradient(135deg, #FFF1D6 0%, #F0BC83 100%);
  box-shadow: 0 6px 24px rgba(224, 169, 109, 0.55);
  transform: translateY(-2px);
}

.btn-gold:active {
  transform: translateY(0);
}

/* Secondary CTA: Translucent Glass Button */
.btn-glass {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-high);
  border: 1px solid var(--glass-border-mid);
  backdrop-filter: var(--blur-subtle);
  -webkit-backdrop-filter: var(--blur-subtle);
  font-weight: var(--fw-medium);
  font-size: 0.9rem;
  padding: 10px 20px;
  border-radius: var(--radius-full);
  transition: all var(--transition-fast);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-glass:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--glass-border-highlight);
  color: var(--text-high);
  transform: translateY(-2px);
}

/* Icon Action Button (Circular Glass) */
.btn-icon-glass {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border-subtle);
  color: var(--text-medium);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.btn-icon-glass:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: var(--glass-border-highlight);
  color: var(--text-high);
}

/* =========================================================================
   4. INTERACTIVE KEYFRAME ANIMATIONS
   ========================================================================= */

/* Reactive Cart Badge Pulse Animation */
@keyframes badge-bump {
  0% { transform: scale(1); }
  40% { transform: scale(1.4); }
  75% { transform: scale(0.9); }
  100% { transform: scale(1); }
}

.badge-bump {
  animation: badge-bump 0.35s var(--ease-spring);
}

/* Shimmer Loading Skeleton */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.02) 25%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0.02) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.8s infinite;
  border-radius: var(--radius-md);
}

/* =========================================================================
   5. PROGRESSIVE ENHANCEMENT FALLBACK
   ========================================================================= */
@supports not (backdrop-filter: blur(1px)) {
  .glass-card,
  .glass-panel {
    background: rgba(18, 17, 29, 0.95);
  }
  .glass-elevated {
    background: rgba(24, 22, 38, 0.98);
  }
  .glass-input {
    background: #1A1829;
  }
}
```

---

## 6. Component Layout & Interactive Styling: `public/css/components.css`

`components.css` specifies layout and state rules for all 8 major UI component modules.

### 6.1 Sticky Frosted Navigation Bar (`#navbar-root`)
- **Container**: Sticky at `top: 0`, full width, height `76px`, z-index 100.
- **Glass Spec**: Background `rgba(11, 11, 19, 0.82)`, `backdrop-filter: blur(20px)`, bottom border `1px solid var(--glass-border-subtle)`.
- **Layout**: Flex container with 3 zones:
  - **Left**: Brand logo with serif wordmark ("VelvetAura"), gold shimmer tagline ("Luxe Importations").
  - **Center**: Expanded glass search input with inline search icon, clear button (`✕`), and quick category tabs.
  - **Right**: Origin filter pill, glowing shopping cart button with live count badge, and user auth button/menu.

```css
/* Navigation Bar Styles */
.site-header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky-nav);
  width: 100%;
  height: 76px;
  background: rgba(11, 11, 19, 0.82);
  backdrop-filter: var(--blur-heavy);
  -webkit-backdrop-filter: var(--blur-heavy);
  border-bottom: 1px solid var(--glass-border-subtle);
  display: flex;
  align-items: center;
}

.navbar-inner {
  width: 100%;
  max-width: var(--container-max);
  margin: 0 auto;
  padding: 0 var(--space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
}

/* Brand Logo */
.brand-wrapper {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-family: var(--font-serif);
  font-size: 1.75rem;
  font-weight: var(--fw-bold);
  letter-spacing: -0.02em;
}

.brand-subtitle {
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent-gold);
  margin-top: -3px;
}

/* Search Bar in Navbar */
.navbar-search {
  position: relative;
  flex: 1;
  max-width: 420px;
}

.navbar-search-input {
  width: 100%;
  padding-left: 42px;
  padding-right: 36px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.04);
}

.navbar-search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-dim);
  width: 18px;
  height: 18px;
}

.navbar-search-clear {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 4px;
}

/* Cart Button & Badge */
.cart-trigger-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border-subtle);
  border-radius: var(--radius-full);
  color: var(--text-high);
  transition: all var(--transition-fast);
}

.cart-trigger-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--glass-border-gold);
}

.cart-badge {
  background: linear-gradient(135deg, #F0BC83 0%, #E0A96D 100%);
  color: var(--text-on-gold);
  font-size: 0.75rem;
  font-weight: var(--fw-bold);
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 10px var(--accent-gold-glow);
}
```

---

### 6.2 Hero Banner Section (`#hero-banner`)
- **Visuals**: Luxury editorial headline, glass highlight card, and trust assurance badges (100% Verified Authentic, Bonded Warehouses, Temperature-Controlled Cargo).

```css
.hero-section {
  padding: var(--space-3xl) 0 var(--space-xl) 0;
  text-align: center;
}

.hero-tagline {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.25em;
  color: var(--accent-gold);
  margin-bottom: var(--space-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.hero-headline {
  font-family: var(--font-serif);
  font-size: clamp(2.5rem, 6vw, 4.25rem);
  font-weight: var(--fw-bold);
  line-height: 1.15;
  margin-bottom: var(--space-md);
}

.hero-description {
  max-width: 640px;
  margin: 0 auto var(--space-xl) auto;
  color: var(--text-muted);
  font-size: 1.1rem;
}

.hero-badges {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.hero-perk-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border-subtle);
  color: var(--text-medium);
  font-size: 0.85rem;
}
```

---

### 6.3 Filter Bar & Catalog Grid (`#catalog-section`)
- **Filter Bar**: Category selector chips (`All`, `Skincare`, `Cosmetics`, `Fragrances`, `Haircare`), Origin filter dropdown (`France`, `South Korea`, `Japan`, `Germany`, etc.), Sort selector (`Featured`, `Price: Low to High`, `Price: High to Low`, `Rating`), and In-Stock toggle.
- **Product Card (`.glass-card.product-card`)**:
  - Image container (1:1 aspect ratio) with zoom hover.
  - Floating Origin badge top-left (e.g. `🇫🇷 France`).
  - Stock badge top-right (`In Stock` / `Low Stock: Only X left`).
  - Brand name in muted gold (`--accent-gold`).
  - Product title (clamped to 2 lines).
  - Star rating with numeric review count.
  - Price display (current price + strikethrough originalPrice if on sale).
  - "Add to Bag" button with shopping bag icon.

```css
/* Filter Bar */
.catalog-filters-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-md);
  padding: var(--space-md);
  margin-top: var(--space-xl);
  background: var(--glass-card);
  backdrop-filter: var(--blur-standard);
  -webkit-backdrop-filter: var(--blur-standard);
  border: 1px solid var(--glass-border-subtle);
  border-radius: var(--radius-lg);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.filter-chip {
  padding: 8px 16px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--glass-border-subtle);
  color: var(--text-medium);
  font-size: 0.85rem;
  transition: all var(--transition-fast);
}

.filter-chip.active, .filter-chip:hover {
  background: var(--accent-gold-muted);
  border-color: var(--glass-border-gold);
  color: var(--accent-gold);
}

.glass-select {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--glass-border-subtle);
  color: var(--text-high);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 0.85rem;
  outline: none;
}

.glass-select option {
  background: #1A1829;
  color: var(--text-high);
}

/* Product Card */
.product-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.card-media {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.card-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s var(--ease-smooth);
}

.product-card:hover .card-media img {
  transform: scale(1.06);
}

.card-origin-pill {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(11, 11, 19, 0.75);
  backdrop-filter: var(--blur-subtle);
  -webkit-backdrop-filter: var(--blur-subtle);
  border: 1px solid var(--glass-border-subtle);
  border-radius: var(--radius-full);
  padding: 4px 10px;
  font-size: 0.72rem;
  font-weight: var(--fw-medium);
  color: var(--text-high);
}

.card-stock-pill {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 0.7rem;
  padding: 3px 8px;
  border-radius: var(--radius-full);
}

.stock-in {
  background: var(--status-success-bg);
  border: 1px solid var(--status-success-border);
  color: var(--status-success);
}

.stock-low {
  background: var(--status-warning-bg);
  border: 1px solid var(--status-warning-border);
  color: var(--status-warning);
}

.stock-out {
  background: var(--status-danger-bg);
  border: 1px solid var(--status-danger-border);
  color: var(--status-danger);
}

.card-content {
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  flex: 1;
}

.card-brand {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent-gold);
  margin-bottom: 4px;
}

.card-title {
  font-family: var(--font-sans);
  font-size: 0.95rem;
  font-weight: var(--fw-semibold);
  color: var(--text-high);
  line-height: 1.4;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: pointer;
}

.card-rating {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  color: var(--accent-gold);
  margin-bottom: var(--space-sm);
}

.card-rating-count {
  color: var(--text-dim);
  font-size: 0.75rem;
}

.card-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-sm);
  border-top: 1px solid var(--glass-border-subtle);
}

.price-box {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.price-current {
  font-family: var(--font-mono);
  font-size: 1.15rem;
  font-weight: var(--fw-bold);
  color: var(--text-high);
}

.price-original {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-dim);
  text-decoration: line-through;
}

.btn-card-add {
  padding: 8px 14px;
  font-size: 0.85rem;
  border-radius: var(--radius-full);
  background: rgba(224, 169, 109, 0.12);
  border: 1px solid var(--glass-border-gold);
  color: var(--accent-gold);
  transition: all var(--transition-fast);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-card-add:hover {
  background: var(--accent-gold);
  color: var(--text-on-gold);
  box-shadow: 0 0 16px var(--accent-gold-glow);
}
```

---

### 6.4 Slide-Over Shopping Cart Drawer (`#cart-drawer-root`)
- **Animation**: Right-to-left slide over (`transform: translateX(100%)` to `translateX(0)`).
- **Backdrop**: Translucent black overlay with blur (`rgba(0, 0, 0, 0.7)`).
- **Width**: `440px` on desktop, `100vw` on mobile.
- **Sections**:
  1. Header with title and close button.
  2. Free Shipping meter: Progress bar showing progress towards the $50 threshold.
  3. Scrollable list of cart items (`CartItemRow`): 64x64 thumbnail, title, brand, price, quantity stepper (`-`, qty, `+`), and delete icon.
  4. Pricing Summary Card: Subtotal, Estimated Tax (8%), Shipping ($5.99 or FREE), Grand Total.
  5. Primary CTA: "Proceed to Checkout" button.

```css
/* Cart Drawer Portal & Overlay */
.drawer-portal {
  position: fixed;
  inset: 0;
  z-index: var(--z-drawer-backdrop);
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s var(--ease-smooth), visibility 0.3s;
}

.drawer-portal.open {
  opacity: 1;
  visibility: visible;
}

.cart-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--drawer-width);
  max-width: 100vw;
  background: var(--glass-drawer);
  backdrop-filter: var(--blur-heavy);
  -webkit-backdrop-filter: var(--blur-heavy);
  border-left: 1px solid var(--glass-border-mid);
  box-shadow: var(--shadow-drawer);
  transform: translateX(100%);
  transition: transform 0.35s var(--ease-smooth);
  display: flex;
  flex-direction: column;
  z-index: var(--z-drawer);
}

.drawer-portal.open .cart-drawer {
  transform: translateX(0);
}

.drawer-header {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--glass-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.drawer-title {
  font-family: var(--font-serif);
  font-size: 1.5rem;
  color: var(--text-high);
}

/* Free Shipping Meter */
.shipping-meter-container {
  padding: var(--space-md) var(--space-lg);
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid var(--glass-border-subtle);
}

.shipping-meter-label {
  font-size: 0.82rem;
  color: var(--text-medium);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.shipping-meter-bar {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.shipping-meter-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-purple) 0%, var(--accent-gold) 100%);
  border-radius: var(--radius-full);
  transition: width 0.4s var(--ease-smooth);
}

/* Line Items List */
.cart-items-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md) var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.cart-item-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border-subtle);
  border-radius: var(--radius-md);
}

.cart-item-img {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: #000;
}

.cart-item-details {
  flex: 1;
}

.cart-item-title {
  font-size: 0.88rem;
  font-weight: var(--fw-medium);
  color: var(--text-high);
  margin-bottom: 2px;
}

.cart-item-price {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--accent-gold);
}

.cart-qty-control {
  display: flex;
  align-items: center;
  border: 1px solid var(--glass-border-subtle);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.cart-qty-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-medium);
  font-size: 0.9rem;
}

.cart-qty-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-high);
}

.cart-qty-display {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  padding: 0 8px;
}

/* Pricing Breakdown & Footer */
.drawer-footer {
  padding: var(--space-lg);
  border-top: 1px solid var(--glass-border-subtle);
  background: rgba(11, 11, 19, 0.6);
}

.pricing-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.88rem;
  color: var(--text-medium);
  margin-bottom: 6px;
}

.pricing-row.total {
  font-size: 1.15rem;
  font-weight: var(--fw-bold);
  color: var(--text-high);
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--glass-border-subtle);
}
```

---

### 6.5 Product Detail Modal (`#product-modal-root`)
- **Structure**: Two-column layout on desktop, single column on mobile.
- **Left Column**: High-resolution image showcase with frosted framing and origin flag.
- **Right Column**: Title, Brand, Origin, Rating, Price, Stock Indicator, Quantity Selector, Full Description, and Detailed Ingredients/Specs Table.

```css
.modal-portal {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop);
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: var(--blur-subtle);
  -webkit-backdrop-filter: var(--blur-subtle);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s var(--ease-smooth), visibility 0.25s;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-md);
}

.modal-portal.open {
  opacity: 1;
  visibility: visible;
}

.detail-modal-card {
  width: 100%;
  max-width: var(--detail-modal-max-width);
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
  padding: var(--space-xl);
}

.modal-close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
}
```

---

### 6.6 Checkout Modal & Mock Payment (`#checkout-modal-root`)
- **Structure**: Clean 2-step form (Shipping Details + Mock Payment Gateway).
- **Sandbox Test Card Helper**: Clear prominent button `"Use Demo Card"` that auto-fills valid card `4242 •••• •••• 4242`, exp `12/28`, CVV `888`.
- **Declined Test Card Helper**: Secondary button to test decline logic (`...0002`).

```css
.checkout-modal-card {
  width: 100%;
  max-width: var(--modal-max-width);
  max-height: 90vh;
  overflow-y: auto;
  padding: var(--space-xl);
}

.demo-card-banner {
  background: rgba(224, 169, 109, 0.08);
  border: 1px dashed var(--glass-border-gold);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin-bottom: var(--space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
}
```

---

### 6.7 Order Confirmation Receipt View (`#order-confirmation-section`)
- **Visuals**: Animated circular checkmark with radiant green/gold glow.
- **Data Display**: Order Number (`#VA-XXXXXX`), Mock Transaction ID (`TXN-VA-...`), Delivery Estimate, Snapshot of items purchased, and Total Paid.

```css
.confirmation-card {
  max-width: 680px;
  margin: var(--space-2xl) auto;
  padding: var(--space-2xl);
  text-align: center;
}

.success-check-wrapper {
  width: 80px;
  height: 80px;
  margin: 0 auto var(--space-lg) auto;
  border-radius: 50%;
  background: var(--status-success-bg);
  border: 2px solid var(--status-success);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--status-success);
  box-shadow: 0 0 30px var(--status-success-border);
}

.order-receipt-details {
  text-align: left;
  margin: var(--space-xl) 0;
  padding: var(--space-lg);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--glass-border-subtle);
  border-radius: var(--radius-md);
}
```

---

### 6.8 Toast Notification Stack (`#toast-container`)
- **Position**: Fixed bottom-right at `bottom: 24px`, `right: 24px`, z-index 400.
- **Glass Spec**: Frosted floating cards with animated slide-up entrance.

```css
.toast-stack {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  pointer-events: none;
}

.toast-item {
  pointer-events: auto;
  min-width: 300px;
  padding: 14px 20px;
  border-radius: var(--radius-md);
  background: rgba(26, 24, 41, 0.92);
  backdrop-filter: var(--blur-standard);
  -webkit-backdrop-filter: var(--blur-standard);
  border: 1px solid var(--glass-border-mid);
  box-shadow: var(--shadow-card);
  color: var(--text-high);
  display: flex;
  align-items: center;
  gap: 12px;
  animation: toast-slide-in 0.3s var(--ease-spring);
}

.toast-item.toast-success { border-left: 4px solid var(--status-success); }
.toast-item.toast-error { border-left: 4px solid var(--status-danger); }
.toast-item.toast-info { border-left: 4px solid var(--accent-gold); }

@keyframes toast-slide-in {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

---

## 7. Responsive Breakpoint Rules

```css
/* =========================================================================
   RESPONSIVE DESIGN RULES
   ========================================================================= */

/* Desktop Screens (> 1024px) */
@media (min-width: 1025px) {
  .product-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Tablet Screens (640px to 1024px) */
@media (max-width: 1024px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-md);
  }
  .cart-drawer {
    width: 380px;
  }
  .detail-modal-card {
    grid-template-columns: 1fr;
  }
}

/* Mobile Screens (< 640px) */
@media (max-width: 639px) {
  .product-grid {
    grid-template-columns: 1fr;
  }
  .navbar-inner {
    padding: 0 var(--space-sm);
  }
  .navbar-search {
    display: none; /* Accessible via toggle or hero */
  }
  .cart-drawer {
    width: 100vw;
  }
  .detail-modal-card,
  .checkout-modal-card {
    padding: var(--space-md);
  }
  .form-grid-2 {
    grid-template-columns: 1fr;
  }
  .toast-stack {
    bottom: 12px;
    right: 12px;
    left: 12px;
  }
  .toast-item {
    min-width: auto;
  }
}
```

---

## 8. Alignment with Backend API & Seed Fixtures

1. **Tax Arithmetic**: Fixed 8% calculation (`subtotal * 0.08`) matches `src/services/cartService.js`.
2. **Shipping Arithmetic**: Free for orders ≥ $50.00; exactly $5.99 for orders under $50.00.
3. **Demo Test Cards**:
   - Approved: `4242424242424242`, Exp `12/28`, CVV `888`.
   - Declined: `4000000000000002` (returns HTTP 402 CARD_DECLINED).
4. **Product Images**: Supported relative path `/assets/images/...` with graceful SVG fallback.
