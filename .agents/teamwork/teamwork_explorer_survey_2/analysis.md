# VelvetAura Frontend UI/UX Architectural Analysis & Specification

**Author**: `teamwork_explorer_survey_2`  
**Date**: 2026-11-04  
**Project**: VelvetAura — Imported Beauty Products E-Commerce Web Application  
**Integrity Mode**: Development  

---

## 1. Executive Summary

VelvetAura is a specialized luxury e-commerce platform curating high-end imported beauty, skincare, fragrance, and cosmetic products from global beauty capitals (South Korea, Japan, France, Italy, Switzerland, UK). 

The frontend must provide an immersive, tactile, high-fashion aesthetic characterized by **modern dark-mode glassmorphism**: translucent frosted glass surfaces, multi-layered depth, glowing neon/metallic accents, ambient backdrop blur, and crisp typography. 

Crucially, the user experience must be fluid and responsive:
1. **Zero Full-Page Refreshes**: Real-time badge count updates, optimistic cart line-item manipulations, dynamic drawer toggles, and seamless checkout-to-confirmation transitions.
2. **Cohesive Dark Glassmorphic Design System**: Strict CSS design tokens for backdrop filters, subtle translucent borders, ambient glows, and dark obsidian/midnight palettes.
3. **Comprehensive View Coverage**:
   - Sticky Glass Navbar with search, category tabs, dynamic badge, and auth dropdown.
   - Catalog view with multi-faceted filtering (category, country of origin, price, search) and sort controls.
   - Rich Product Detail view with high-res gallery, ingredient/origin specifications, stock indicators, and quantity selector.
   - Slide-over Cart Drawer and/or Cart view with live calculation of subtotal, tax, shipping, and grand total.
   - Guided Checkout Workflow with shipping details, mock payment gateway simulation (with quick-fill sandbox test card helper), and order confirmation receipt.
   - User Account View with customer profile and historical order timeline.

---

## 2. Dark-Mode Glassmorphism Design System

### 2.1 Aesthetic Philosophy
The aesthetic combines **deep dark luxury** (obsidian, midnight slate, dark amethyst) with **frosted translucent glass** and **luminous metallic/neon accents** (warm champagne gold, rose gold, vibrant violet). This reflects the high-end imported cosmetics industry (reminiscent of luxury packaging like frosted glass serum bottles and polished metallic compacts).

### 2.2 Color Palette Tokens

```css
:root {
  /* Surface & Background Bases */
  --bg-primary: #0B0B13;        /* Deep obsidian night (page canvas) */
  --bg-secondary: #12111D;      /* Midnight violet slate (sections/containers) */
  --bg-surface: #1A1829;        /* Elevated dark surface */
  
  /* Glass Surface Tokens */
  --glass-bg-subtle: rgba(255, 255, 255, 0.03);      /* Subtle inputs, badges */
  --glass-bg-card: rgba(26, 24, 41, 0.65);           /* Product cards, panels */
  --glass-bg-elevated: rgba(32, 29, 51, 0.85);       /* Modals, drawers, dropdowns */
  --glass-border-subtle: rgba(255, 255, 255, 0.07);  /* Baseline glass borders */
  --glass-border-highlight: rgba(255, 255, 255, 0.16);/* Top-edge light refraction */
  --glass-border-accent: rgba(224, 169, 109, 0.35);  /* Gold border highlight */
  
  /* Luminous Accent Tokens */
  --accent-gold: #E0A96D;       /* Champagne luxury gold (primary CTA/badges) */
  --accent-gold-glow: rgba(224, 169, 109, 0.35);
  --accent-purple: #9D4EDD;     /* Velvet royal purple (gradients, highlights) */
  --accent-purple-glow: rgba(157, 78, 221, 0.35);
  --accent-rose: #F43F5E;       /* French rose / cosmetic pink (heart/discounts) */
  --accent-cyan: #38BDF8;       /* K-beauty moisture / active ingredient highlight */

  /* Text & Contrast Hierarchy */
  --text-high: #F8FAFC;         /* 98% white for headings, primary titles */
  --text-medium: #CBD5E1;       /* 80% silver for body text, descriptions */
  --text-muted: #94A3B8;        /* 60% slate for labels, metadata, placeholders */
  --text-dim: #64748B;          /* 40% dark slate for subtle icons, borders */

  /* Semantic Feedback Tokens */
  --color-success: #10B981;     /* In-stock, order confirmed */
  --color-success-glow: rgba(16, 185, 129, 0.3);
  --color-warning: #F59E0B;     /* Low stock ("Only 2 left") */
  --color-danger: #EF4444;      /* Out of stock, payment error */
}
```

### 2.3 Glassmorphic Material Specifications

Glassmorphism relies on the interplay of:
1. `backdrop-filter: blur(...) saturate(...)`
2. Semi-transparent background fills with alpha channels
3. Subtle semi-transparent borders with a 1px linear gradient simulating light hitting the top edge
4. Ambient box-shadows that diffuse softly on dark backgrounds

#### Glass Level 1: Standard Card (`.glass-card`)
Used for catalog product cards, filter bars, order summary boxes:
```css
.glass-card {
  background: var(--glass-bg-card);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid var(--glass-border-subtle);
  border-top: 1px solid var(--glass-border-highlight);
  border-radius: 16px;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.glass-card:hover {
  transform: translateY(-4px);
  border-color: rgba(224, 169, 109, 0.3);
  box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.5),
              0 0 24px -4px var(--accent-gold-glow);
}
```

#### Glass Level 2: Elevated Overlay (`.glass-elevated`)
Used for Cart Drawer, Navigation Bar, Checkout Modal, Dropdowns:
```css
.glass-elevated {
  background: var(--glass-bg-elevated);
  backdrop-filter: blur(24px) saturate(200%);
  -webkit-backdrop-filter: blur(24px) saturate(200%);
  border: 1px solid var(--glass-border-highlight);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6),
              0 0 40px rgba(157, 78, 221, 0.08);
}
```

#### Glass Level 3: Interactive Inputs & Badges (`.glass-input`, `.glass-pill`)
```css
.glass-input {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: var(--text-high);
  transition: all 0.2s ease;
}

.glass-input:focus {
  background: rgba(255, 255, 255, 0.07);
  border-color: var(--accent-gold);
  box-shadow: 0 0 16px var(--accent-gold-glow);
  outline: none;
}

.glass-pill {
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  padding: 4px 12px;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
```

### 2.4 Ambient Glow Background Orbs
To make glassmorphism truly stand out, the background canvas must not be flat black; it requires subtle, slowly floating blurred color orbs:
```css
.ambient-glow-wrapper {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.glow-orb-1 {
  position: absolute;
  top: -10%;
  left: 15%;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(157, 78, 221, 0.18) 0%, rgba(0, 0, 0, 0) 70%);
  filter: blur(80px);
}

.glow-orb-2 {
  position: absolute;
  bottom: 20%;
  right: 10%;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(224, 169, 109, 0.12) 0%, rgba(0, 0, 0, 0) 70%);
  filter: blur(100px);
}
```

---

## 3. Detailed View Specifications & Component Architecture

### 3.1 Global Header & Navigation (`Navbar`)
- **Structure**:
  - **Left**: VelvetAura brand identity. Luxury typography (e.g. Serif or stylized modern sans) with subtle gold/purple gradient text shimmer. Subtitle: *"Luxe Importations"*.
  - **Center**:
    - **Global Search Bar**: Glass input with search icon, clear button (`✕`), debounced query execution against the catalog API.
    - **Quick Category Links**: Horizontal pills for `All`, `Skincare`, `Cosmetics`, `Fragrances`, `Haircare`.
  - **Right**:
    - **Origin Selector**: Optional quick toggle for top origins (🇰🇷 Korea, 🇫🇷 France, 🇯🇵 Japan, 🇮🇹 Italy).
    - **Cart Button & Badge**:
      - Glass button with Shopping Bag icon.
      - **Live Count Badge**: Glowing pill indicator (e.g. `bg-amber-500` or gold gradient).
      - **Reactive Behavior**: When any product is added to cart, badge triggers a CSS scale/pulse keyframe animation (`keyframes badge-pop { 0%: scale(1); 50%: scale(1.35); 100%: scale(1); }`).
      - Clicking opens the Cart Drawer.
    - **Auth Status**:
      - If Unauthenticated: Glass button "Sign In / Register", opens Auth Modal.
      - If Authenticated: User avatar/pill displaying user name, with dropdown menu containing "My Account", "Order History", and "Logout".

### 3.2 Catalog View (`CatalogView`)
- **Hero Banner**:
  - Luxury tagline: *"Curated Luxury from Paris, Seoul, Tokyo & Milan"*.
  - Frosted glass banner featuring key imported beauty benefits: 100% Guaranteed Authenticity, Temperature-Controlled Air Cargo, Direct Import Pricing.
- **Filter & Sorting Toolbar**:
  - **Category Tabs**: Skincare, Cosmetics, Fragrances, Haircare.
  - **Country of Origin Filter**: Multi-select pills or dropdown (🇰🇷 South Korea, 🇫🇷 France, 🇯🇵 Japan, 🇮🇹 Italy, 🇨🇭 Switzerland, 🇬🇧 United Kingdom).
  - **Price Range Slider / Buttons**: Under $50, $50–$150, $150–$300, $300+.
  - **In-Stock Only Filter Toggle**: Switch to hide out-of-stock items.
  - **Sort Dropdown**:
    - Featured / Recommended
    - Price: Low to High
    - Price: High to Low
    - Highest Customer Rating
    - Brand A-Z
- **Product Card (`ProductCard`)**:
  - **Media Area**:
    - High-quality image container with dark glass framing.
    - Hover zoom effect (`transform: scale(1.05)`).
    - **Origin Pill Badge** pinned top-left: e.g. `🇫🇷 France · Skincare`.
    - **Stock Status Badge** pinned top-right: `Low Stock` (amber) or `Sold Out` (red).
  - **Content Area**:
    - Brand name in elegant muted gold (`--accent-gold`).
    - Product title in high-contrast pearl white (`--text-high`), 2 lines max with ellipsis.
    - Star Rating component (e.g. ★ 4.9 (128 reviews)).
    - Volume / Size info (e.g. `50ml / 1.7 fl oz` or `Eau de Parfum 100ml`).
    - Price display: `$145.00` with strike-through original MSRP if on sale.
  - **Action Area**:
    - Primary Button: "Add to Cart" with shopping bag icon.
    - Quick visual state switch upon click: Button temporarily turns to green checkmark *"Added!"* before restoring, while cart badge pulses.
    - Clicking the card body opens the **Product Detail View**.

### 3.3 Product Detail View (`ProductDetailModal` / `ProductDetailPage`)
- **Breadcrumb Navigation**: `Home > Skincare > Serum > Sulwhasoo First Care Activating Serum`.
- **Two-Column Responsive Layout**:
  - **Left (Gallery)**:
    - Primary high-resolution glass image showcase.
    - Thumbnail preview strip.
    - Authenticity badge: *"Directly imported from Seoul, South Korea"*.
  - **Right (Purchase Info & Specs)**:
    - Brand, Product Title, Country of Origin flag and description.
    - Star Rating and customer review breakdown.
    - Price, Tax, and Duty Information: *"Import duties & international handling included"*.
    - Stock Inventory Status:
      - `✓ In Stock (24 units available)`
      - `⚠ Low Stock: Only 3 left in our bonded warehouse`
      - `✕ Out of Stock`
    - Quantity Selector:
      - Stepper (`-` decrement, numeric input, `+` increment) clamped between 1 and available stock.
    - Action Buttons:
      - **Add to Cart** (adds selected quantity).
      - **Instant Checkout / Buy Now** (adds to cart and triggers checkout drawer immediately).
    - Detailed Specifications Accordion:
      - **Description & Provenance**: Background on the brand and why this formula is coveted worldwide.
      - **Key Ingredients & Active Actives**: Dermatological breakdown (e.g., Snail Secretion Filtrate, Hyaluronic Acid, Centella Asiatica, French Rose Water).
      - **How to Use**: Ritual instructions.
      - **Shipping & Authenticity Guarantee**: 100% verified batch numbers, temperature-controlled transit.

### 3.4 Interactive Cart Drawer & Page (`CartDrawer`)
The cart should exist as an instant slide-over drawer accessible from anywhere on the site, with seamless transition to full-screen on mobile:
- **Slide-over Animation**: Right-to-left drawer slide with backdrop blur overlay (`rgba(0, 0, 0, 0.7)`).
- **Header**:
  - Title: "Your Shopping Bag" with item count `(N items)`.
  - Close button (`✕`).
- **Empty State**:
  - Elegant empty cosmetic bottle illustration / icon.
  - Copy: *"Your luxury beauty bag is currently empty."*
  - CTA button: *"Explore Curated Imports"* (closes drawer and scrolls to catalog).
- **Line Items List** (`CartItem`):
  - Thumbnail preview (64x64px glass rounded frame).
  - Title, brand, and origin tag.
  - Unit price.
  - Interactive Quantity Controls:
    - Decrement (`-`) button (disables or prompts remove if 1).
    - Current quantity display.
    - Increment (`+`) button (disables if exceeding stock).
  - Line total: `unitPrice * quantity`.
  - Remove Item Action (Trash icon button with subtle red glow on hover).
- **Live Summary Calculations** (calculated instantly on client & verified against backend):
  - **Subtotal**: Sum of line items.
  - **Free Shipping Meter**:
    - Progress bar: e.g. *"Spend $25.00 more to unlock Free Global Air Cargo!"* (Threshold e.g. $100).
  - **Shipping**: Free (or $15.00 if below threshold).
  - **Estimated Import Tax & Duties**: Estimated 8% (calculated dynamically).
  - **Grand Total**: `Subtotal + Shipping + Tax`.
- **Checkout Action**:
  - "Proceed to Checkout" button with right arrow icon and grand total preview.
  - Clears guest/auth warnings and launches checkout.

### 3.5 Checkout Workflow & Mock Payment (`CheckoutModal` / `CheckoutView`)
The checkout flow must be clean, trustworthy, and frictionless.
- **Workflow Steps**:
  1. **Customer & Shipping Information**:
     - Full Name
     - Email Address (for order receipt)
     - Street Address
     - City, State/Province, Postal Code
     - Country of Delivery (dropdown)
     - Shipping Method:
       - *Standard International Air (5–7 Business Days)* — Free or $15
       - *Priority Temperature-Controlled Courier (2–3 Days)* — $25
  2. **Payment Authorization (Mock Gateway)**:
     - Clear sandbox disclaimer banner:
       - `🛡️ Sandbox Testing Mode — No real charges will be made to any credit card.`
     - **Quick-Fill Demo Card Helper Button**:
       - Clicking *"Use Demo Test Card"* automatically fills valid test card values:
         - Cardholder: `Valued Customer`
         - Card Number: `4242 •••• •••• 4242`
         - Expiry: `12/28`
         - CVV: `888`
     - Clean Card Input Form with automatic card brand detection (Visa, Mastercard, Amex icons).
     - Security badges: 256-Bit SSL Encrypted, PCI-DSS Compliant Mock Gateway.
  3. **Order Processing Simulation**:
     - On clicking *"Authorize & Place Order ($XXX.XX)"*:
       - Button transitions to disabled loading spinner state: *"Authorizing with Global Gateway..."*.
       - Emits API call to `/api/orders` (or `/api/checkout`).
       - Backend creates Order record in MongoDB, verifies stock, issues a mock transaction ID, and marks status as `Completed`.
  4. **Order Confirmation Screen (`OrderConfirmation`)**:
     - Celebration graphic with animated checkmark and green/gold radiant glow.
     - Confirmation Headline: *"Thank you for your order!"*
     - Order Details Card:
       - **Order Number**: e.g., `#VA-2026-94812`
       - **Mock Payment Transaction ID**: e.g., `TXN_MOCK_8f7b3e9a`
       - **Estimated Delivery**: `November 9 - November 12, 2026`
       - **Shipping To**: Customer Name & Address
       - **Items Purchased**: Summary list with quantities and prices
       - **Total Charged**: Grand Total
     - State reset: **Active shopping cart is cleared** automatically.
     - Actions:
       - *"View in Order History"* (navigates to Account view).
       - *"Continue Shopping"* (navigates back to catalog).

### 3.6 User Account & Order History (`AccountView`)
- **Profile Header**:
  - User avatar with initials or picture.
  - User Name, Email, Registration Date.
  - Member Tier Badge: *"Aura Luxe Member"*.
  - Logout action.
- **Order History Section**:
  - Filter tabs: `All Orders`, `Processing`, `Delivered`.
  - Order History Cards:
    - Header: Order ID, Date Placed, Status Badge (`Processing`, `Shipped`, `Delivered` in glowing green/blue/amber pills).
    - Summary of items in order with thumbnails, names, and quantities.
    - Financial breakdown: Subtotal, Shipping, Tax, Total Paid, and Mock Transaction ID.
    - Action button: *"View Invoice"* or *"Reorder Items"*.
  - **Empty History State**:
    - Helpful prompt for new users who haven't placed an order yet, linking to the Catalog.

---

## 4. Client-Side Architecture & State Management

### 4.1 Recommended Frontend Stack Options

| Criteria | Option A: React + Vite + Tailwind CSS | Option B: Modern Vanilla JS ES Modules + CSS3 |
|---|---|---|
| **Rendering** | Declarative Component Tree (Virtual DOM) | Direct Reactive DOM manipulation |
| **State Management** | Context API / Zustand / Custom Hooks | Custom Event-driven Store / Proxy state |
| **Glassmorphism CSS** | Tailwind utility classes + Custom glassmorphism config | Native CSS custom properties & utility classes |
| **Build Artifact** | Bundled by Vite into `dist/` | Directly served by Express static or bundled |
| **Development Ergonomics** | Standard for modern e-commerce apps; reusable components | Zero build tooling dependency; fast initial launch |
| **Recommendation** | **Strongly Recommended**: Clean React single-page app (or pre-bundled/Vite React frontend) served by Express backend | Highly viable alternative if single-package deployment without bundler is preferred |

Whether built with React or modular Vanilla JS, the application must follow strict modular separation of concerns.

### 4.2 State Architecture & Stores

#### 1. `AuthStore` / `AuthContext`
- **State**:
  - `user`: `{ id, name, email, role }` or `null`
  - `token`: JWT string or `null` (persisted in `localStorage.getItem('velvet_token')`)
  - `loading`: boolean
- **Actions**:
  - `login(email, password)`: sends POST to `/api/auth/login`, stores token, updates user state.
  - `register(name, email, password)`: sends POST to `/api/auth/register`, stores token.
  - `logout()`: clears token and user, resets cart ownership if needed.
  - `validateSession()`: verifies token validity on mount via `/api/auth/me`.

#### 2. `CartStore` / `CartContext`
- **State**:
  - `items`: Array of `{ product: ProductObject, quantity: number }`
  - `isOpen`: boolean (controls slide-over drawer visibility)
  - `isSyncing`: boolean
- **Derived Computed Values**:
  - `itemCount`: sum of quantities (`items.reduce((acc, item) => acc + item.quantity, 0)`)
  - `subtotal`: sum of `item.product.price * item.quantity`
  - `shipping`: `subtotal > 100 || items.length === 0 ? 0 : 15.00`
  - `tax`: `subtotal * 0.08`
  - `grandTotal`: `subtotal + shipping + tax`
- **Actions**:
  - `openCart()` / `closeCart()` / `toggleCart()`
  - `addToCart(product, quantity)`:
    - Optimistically updates client state.
    - Triggers pulse animation on navbar cart badge.
    - Sends sync request to backend `/api/cart`.
    - Persists guest cart to `localStorage.getItem('velvet_cart')` if unauthenticated.
  - `updateQuantity(productId, newQty)`:
    - If `newQty <= 0`, removes item.
    - Otherwise clamps to `product.stockQuantity`.
    - Re-computes live totals immediately.
  - `removeFromCart(productId)`:
    - Removes item and refreshes totals.
  - `clearCart()`:
    - Resets `items` to `[]` upon successful checkout.

#### 3. `CatalogStore` / Filter State
- **State**:
  - `products`: Product[]
  - `filteredProducts`: Product[]
  - `categories`: string[] (`['all', 'skincare', 'cosmetics', 'fragrances', 'haircare']`)
  - `selectedCategory`: string
  - `selectedOrigin`: string (`'all'` or specific country)
  - `searchQuery`: string
  - `sortBy`: `'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest'`
  - `priceRange`: `[min, max]`
  - `loading`: boolean
- **Actions**:
  - `fetchProducts()`: calls `/api/products` with query params.
  - `setCategory(cat)`
  - `setOrigin(origin)`
  - `setSearchQuery(query)` (debounced by 300ms)
  - `setSortBy(sortKey)`

#### 4. `CheckoutStore` / Order State
- **State**:
  - `shippingInfo`: `{ fullName, email, address, city, country, postalCode }`
  - `paymentInfo`: `{ cardholder, cardNumber, expiry, cvv }`
  - `orderStatus`: `'idle' | 'submitting' | 'confirmed' | 'error'`
  - `confirmedOrder`: Order details object or `null`
  - `errorMessage`: string | null
- **Actions**:
  - `fillDemoPayment()`: fills sandbox dummy values into payment form.
  - `submitOrder()`: validates shipping & payment, sends POST to `/api/orders`, receives confirmed order, triggers `clearCart()`, updates user order history.

---

## 5. Responsive Layout & Breakpoints

The UI must adapt gracefully across device form-factors:

```
Mobile Screen (< 640px)
├── Sticky Glass Top Bar (Logo, Compact Search Icon, Cart Badge)
├── Horizontal Scrolling Category Pills
├── 1-Column Product Grid (Full-width glass cards with 1:1 image and compact info)
├── Full-screen Cart Slide-up Sheet (bottom sheet modal)
└── Mobile Bottom Navigation Bar (Home, Search, Orders, Account)

Tablet Screen (640px - 1024px)
├── Standard Glass Navbar with inline search
├── 2-Column or 3-Column Product Grid
└── Slide-over Cart Drawer from right (400px width)

Desktop Screen (> 1024px)
├── Full Featured Glass Navbar (Brand, Category Nav, Expanded Search, Cart Badge, Auth Menu)
├── 3-Column or 4-Column Product Grid with rich hover interactions and glowing borders
├── Floating Cart Drawer (450px width) with glass backdrop blur
└── Split-view Checkout & Account History screens
```

### Mobile Performance Considerations for Glassmorphism
- Excessive stacking of `backdrop-filter: blur(...)` can cause frame drops on low-power mobile GPUs.
- **Remediation**:
  - Use `backdrop-filter: blur(12px)` on mobile instead of `30px`.
  - Add CSS `will-change: transform` and `transform: translateZ(0)` to trigger GPU compositing on animated cards and modals.
  - Provide a graceful fallback `background: rgba(18, 17, 29, 0.95)` when `@supports not (backdrop-filter: blur(1px))` is detected.

---

## 6. Seed Data & Asset Specifications for Imported Beauty

To present VelvetAura as a legitimate, high-fashion imported boutique, catalog items must have rich metadata, authentic origins, and high-fidelity visuals:

### 6.1 Category & Origin Matrix

| Category | Typical Imported Brands & Origins | Example Item Names |
|---|---|---|
| **Skincare** | 🇰🇷 South Korea (Seoul), 🇫🇷 France (Paris), 🇯🇵 Japan (Tokyo) | *Sulwhasoo First Care Activating Serum*, *La Roche-Posay Hyalu B5 Pure Hyaluronic*, *SK-II Facial Treatment Essence*, *Beauty of Joseon Dynasty Cream* |
| **Cosmetics** | 🇫🇷 France, 🇮🇹 Italy (Milan), 🇰🇷 South Korea | *Dior Rouge Forever Liquid Lipstick*, *Armani Luminous Silk Foundation*, *Rom&nd Glasting Water Tint*, *Clio Kill Cover Mesh Glow Cushion* |
| **Fragrances** | 🇫🇷 France (Grasse/Paris), 🇮🇹 Italy, 🇬🇧 United Kingdom | *Maison Margiela REPLICA Jazz Club*, *Diptyque Philosykos Eau de Parfum*, *Byredo Gypsy Water*, *Jo Malone London Wood Sage & Sea Salt* |
| **Haircare** | 🇯🇵 Japan, 🇫🇷 France, 🇨🇭 Switzerland | *Shiseido Fino Premium Touch Hair Mask*, *Kérastase Elixir Ultime L'Huile Originale*, *Oribe Gold Lust Repair & Restore Shampoo* |

### 6.2 Image Asset Strategy
- **Curated High-Res Unsplash CDN Images**: Directly targeted high-quality cosmetics, perfume flacons, frosted serum droppers, and skincare jars.
- **Embedded SVG Fallback Placeholders**: Each category can have an elegant vector silhouette placeholder with dark gradient backgrounds so images never break if offline.

---

## 7. Frontend Integration Points with Backend API

The frontend connects directly to the following REST endpoints:

| Endpoint | Method | Purpose | Frontend Consumer |
|---|---|---|---|
| `/api/auth/register` | POST | Register new customer account | Auth Modal |
| `/api/auth/login` | POST | Log in and receive JWT token | Auth Modal |
| `/api/auth/me` | GET | Fetch profile with bearer token | Navigation / Account View |
| `/api/products` | GET | List products with query params (`?category=...&search=...&origin=...&sort=...`) | Catalog View |
| `/api/products/:id` | GET | Fetch single product detail & stock | Product Detail Modal/Page |
| `/api/cart` | GET | Fetch user's active cart from DB | Cart Drawer / Page |
| `/api/cart` | POST | Add/Update cart line items | Product Card, Detail View, Cart Drawer |
| `/api/cart/items/:id` | DELETE | Remove item from cart | Cart Drawer |
| `/api/orders` | POST | Submit checkout, verify stock, process mock payment | Checkout Modal |
| `/api/orders/my-orders` | GET | Fetch authenticated user's order history | User Account View |
| `/api/health` | GET | Ping backend status | Health check & startup verification |

---

## 8. Verification Strategy for Frontend Requirements

To guarantee acceptance criteria are satisfied:
1. **Glassmorphism CSS Audit**:
   - Verify `backdrop-filter: blur(...)` and `-webkit-backdrop-filter` are declared.
   - Verify dark background contrast ratios meet WCAG AA standards (> 4.5:1 for body text, > 3:1 for headings).
2. **State Reactivity Verification**:
   - Adding product to cart updates badge count within < 50ms without page reload.
   - Incrementing/decrementing quantities in cart updates subtotal, tax, and grand total dynamically.
   - Completing checkout clears cart badge back to 0 and transitions directly to Order Confirmation.
3. **Mock Payment Verification**:
   - One-click demo card button fills test payment info.
   - Order submission creates order, shows mock transaction ID, and adds order to User Account history.
4. **Responsive Testing**:
   - Verify layout on 375px (mobile), 768px (tablet), and 1280px+ (desktop).
