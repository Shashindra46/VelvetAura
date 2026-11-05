# Architecture & Implementation Analysis: Luxury Catalog, Seed Data & Product APIs

**Author**: `teamwork_explorer_m2_1`  
**Milestone**: Milestone 2 (Catalog, Seed Data & Core E-Commerce Services)  
**Workspace**: `g:\VelvetAura`  
**Date**: 2026-11-04  

---

## 1. Executive Summary & Scope Boundary

This analysis provides the comprehensive blueprint and reference implementation specifications for the core catalog foundation of VelvetAura. The deliverables analyzed within this scope comprise:

1. **Curated Luxury Beauty Dataset (`src/data/seedProducts.js`)**:
   - Exactly 24 realistic, authentic imported luxury beauty products.
   - Even distribution across 4 core categories: **Skincare (6)**, **Cosmetics (6)**, **Fragrances (6)**, and **Haircare (6)**.
   - Comprehensive provenance across 8 premier beauty capitals: **France, South Korea, Japan, Italy, United Kingdom, Sweden, USA, and Germany**.
   - Rich luxury attributes including sensory descriptions, volume, stock, ratings, review counts, tags, and category-specific specifications (`specs`).
   - 100% backward-compatibility with all test fixtures defined in `tests/e2e/helpers/fixtures.js`.

2. **Standalone Database Seed Script (`src/data/seed.js`)**:
   - Executable via `npm run seed` (`node src/data/seed.js`).
   - Programmatically callable via `seedInitialData(options)` and `seedCatalog(options)`.
   - Idempotent execution: optionally clears stale data and seeds demo customer and administrator personas using `User.create()` (triggering bcrypt password hashing) along with the full 24-product catalog.
   - Formatted console logging and graceful process teardown using `disconnectDB()`.

3. **In-Memory Auto-Seeding Integration (`src/config/db.js`)**:
   - Verified seamless interoperation with `triggerAutoSeed()` in `src/config/db.js`.
   - Guarantees zero-configuration startup: upon booting with `mongodb-memory-server`, an empty database is automatically populated with the 24-product catalog.

4. **Product Catalog REST APIs (`src/controllers/productController.js` and `src/routes/productRoutes.js`)**:
   - `GET /api/products`: Full-featured query engine supporting multi-facet filtering (`category`, `origin`, `brand`, `featured`, price bounds), keyword search (`q` / `search`), dynamic sorting (`price-asc`, `price-desc`, `rating`, `name`, `newest`), and pagination (`page`, `limit`).
   - `GET /api/products/categories`: Dynamic taxonomy and origins list.
   - `GET /api/products/:id`: Single product retrieval with robust ObjectId format validation and 400/404 status handling.
   - Hardened against ReDoS, NoSQL object injection, and adversarial payloads (`<script>`, SQL snippets, unmatched regex tokens).

---

## 2. Current Codebase State & Architectural Baseline

### 2.1 Existing Product Model (`src/models/Product.js`)
Inspection of `src/models/Product.js` confirms the following schema properties:
- **Category Enum**: Strictly constrained to `['skincare', 'cosmetics', 'fragrances', 'haircare']` (all lowercase).
- **Virtual Image Accessor**: `product.image` returns `images[0]`. Setting `product.image` modifies `images[0]`.
- **Specs Synchronization**: A `pre('validate')` hook automatically synchronizes `specs` with `specifications`.
- **Text & Compound Indexes**:
  - Full-text index on `{ name: 'text', brand: 'text', origin: 'text', description: 'text', tags: 'text' }`.
  - Compound indexes on `{ category: 1, price: 1 }` and `{ origin: 1, category: 1 }`.
- **Virtuals in Serialization**: Schema options `{ toJSON: { virtuals: true }, toObject: { virtuals: true } }` guarantee that virtual fields (such as `image`) are included in JSON responses.

### 2.2 Database Connection & Auto-Seed Mechanics (`src/config/db.js`)
Inspection of `src/config/db.js` lines 35–82 reveals:
- When running in in-memory mode (`MongoMemoryServer`), `connectDB()` executes `triggerAutoSeed()`.
- `triggerAutoSeed()` queries `Product.countDocuments()`. If count is 0:
  1. It attempts to load `src/data/seed.js` and call `seedInitialData({ silent: true })` or `seedCatalog({ silent: true })`.
  2. If that fails or is missing, it attempts to load `src/data/seedProducts.js` and run `Product.insertMany(items)`.
  3. If both are missing, it falls back to 4 hardcoded baseline products.
- **Architectural Conclusion**: When `src/data/seedProducts.js` and `src/data/seed.js` are created according to this specification, `db.js` will immediately and automatically utilize the complete 24-item dataset without any required changes to `db.js`.

### 2.3 Express Application Router Pipeline (`src/app.js`)
Inspection of `src/app.js` lines 19–24 and line 69 shows:
- `productRoutes` is imported with a try/catch fallback to an empty `express.Router()`.
- Mounted at `app.use('/api/products', productRoutes)`.
- Global error handling middleware (`src/middleware/errorMiddleware.js`) intercepts `CastError` (bad ObjectId) and converts it to HTTP 404, but explicit controller-level validation with HTTP 400 is also required to satisfy boundary test expectations.

### 2.4 E2E Test Suite Expectations
Analysis of `tests/e2e/tier1_catalog.test.js`, `tier2_boundary.test.js`, `tier3_interactions.test.js`, and `tier4_scenarios.test.js` identifies specific contracts:
- **Response Format**: Tests inspect `Array.isArray(res.body) ? res.body : (res.body.products || [])`. Therefore, returning `{ success: true, count: N, total: M, page: P, pages: X, products: [...] }` allows both the array extraction and object metadata extraction to succeed.
- **Filtering**:
  - `GET /api/products?category=skincare` -> all returned items have `category.toLowerCase() === 'skincare'`.
  - `GET /api/products?origin=France` -> all returned items have `origin.toLowerCase() === 'france'`.
  - `GET /api/products?category=non_existent_cosmic_category` -> returns HTTP 200 with `products: []`.
  - `GET /api/products?origin=Atlantis` -> returns HTTP 200 with `products: []`.
- **Keyword Search**:
  - `GET /api/products?q=Serum` -> all returned items match "serum" in `name`, `brand`, or `description`.
  - Adversarial inputs (`<script>alert("xss")</script>`, `' OR '1'='1' --`, `'{"$gt": ""}'`) must return HTTP 200 with an array and never trigger 500 crashes or regex syntax errors.
- **Detail Retrieval**:
  - `GET /api/products/:id` with valid existing ID -> HTTP 200 with `product` object containing `name`, `price`, `stock`, `specs`.
  - `GET /api/products/:id` with non-existent valid ObjectId -> HTTP 404.
  - `GET /api/products/:id` with invalid ObjectId string (e.g. `'not-an-object-id-string'`) -> HTTP 400 (or 404) with an error/message property.
- **Category Taxonomy**:
  - `GET /api/products/categories` -> HTTP 200 with categories and origins lists. Must be mounted before `/:id` in `productRoutes.js` to prevent route collision.

---

## 3. Curated Luxury Beauty Dataset Specification (`src/data/seedProducts.js`)

### 3.1 Taxonomy Matrix (24 Curated Imported Luxury Items)

| # | Name | Brand | Origin | Category | Subcategory | Price ($) | Stock | Rating | Volume / Size | Key Benefit / Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **Skincare (6 Items)** |
| 1 | First Care Activating Serum VI | Sulwhasoo | South Korea | skincare | Serum | 89.00 | 45 | 4.9 | 60 ml / 2.0 fl oz | Boosting serum with JAUM Activator™ for radiant hydration |
| 2 | The Rich Cream with TFC8® | Augustinus Bader | Germany | skincare | Moisturizer | 290.00 | 25 | 4.8 | 50 ml / 1.7 fl oz | Cellular renewal cream powered by patented TFC8® complex |
| 3 | Facial Treatment Essence (Pitera™) | SK-II | Japan | skincare | Essence | 245.00 | 30 | 4.9 | 160 ml / 5.4 fl oz | Miracle water essence formulated with over 90% pure Pitera™ |
| 4 | Hyalu B5 Pure Hyaluronic Acid Serum | La Roche-Posay | France | skincare | Serum | 39.99 | 80 | 4.8 | 30 ml / 1.0 fl oz | Anti-aging concentrate with pure hyaluronic acid and vitamin B5 |
| 5 | Vinoperfect Radiance Dark Spot Serum | Caudalie | France | skincare | Serum | 82.00 | 35 | 4.9 | 30 ml / 1.0 fl oz | Patented grapevine Viniferine to visibly brighten hyperpigmentation |
| 6 | Advanced Snail 96 Mucin Power Essence | COSRX | South Korea | skincare | Essence | 25.00 | 100 | 4.7 | 100 ml / 3.38 fl oz | 96% snail secretion filtrate to deeply repair moisture barrier |
| **Cosmetics (6 Items)** |
| 7 | Hollywood Flawless Filter | Charlotte Tilbury | United Kingdom | cosmetics | Complexion | 49.00 | 60 | 4.8 | 30 ml / 1.0 fl oz | Customizable complexion booster for a red-carpet glossy glow |
| 8 | Radiant Concealer SPF 27 | Clé de Peau Beauté | Japan | cosmetics | Concealer | 75.00 | 35 | 4.9 | 5 g / 0.17 oz | Legendary creamy stick concealer with undetectable high coverage |
| 9 | Signature Color Eyes Palette | SUQQU | Japan | cosmetics | Eye Shadow | 72.00 | 32 | 4.8 | 6.2 g / 0.21 oz | Ultra-refined silken eyeshadow quad inspired by Japanese natural light |
| 10 | Baby Cheeks Blush Stick | Westman Atelier | USA | cosmetics | Blush | 48.00 | 50 | 4.7 | 6 g / 0.21 oz | Clean cream blush stick with jojoba oil and Berryflux Vita |
| 11 | True Velvet Lip Colour | Lisa Eldridge | United Kingdom | cosmetics | Lipstick | 38.00 | 55 | 4.9 | 3.5 g / 0.12 oz | Highly saturated, hydrating matte lipstick with woven velvet finish |
| 12 | Zero Velvet Tint #06 Deepsoul | Rom&nd | South Korea | cosmetics | Lip Tint | 13.00 | 80 | 4.6 | 5.5 g / 0.19 oz | Airy weightless velvet lip tint in vintage deep brick red |
| **Fragrances (6 Items)** |
| 13 | Gypsy Water Eau de Parfum | Byredo | Sweden | fragrances | Eau de Parfum | 290.00 | 25 | 4.9 | 100 ml / 3.4 fl oz | Woody aromatic tribute with pine needle, sandalwood, and amber |
| 14 | Baccarat Rouge 540 Extrait de Parfum | Maison Francis Kurkdjian | France | fragrances | Extrait de Parfum | 345.00 | 18 | 4.9 | 70 ml / 2.4 fl oz | Luminous amber woody floral with Grandiflorum jasmine and ambergris |
| 15 | Philosykos Eau de Parfum | Diptyque | France | fragrances | Eau de Parfum | 230.00 | 30 | 4.8 | 75 ml / 2.5 fl oz | Ode to Greek fig groves with green leaf, milky sap, and white cedar |
| 16 | Santal 33 Eau de Parfum | Le Labo | USA | fragrances | Eau de Parfum | 320.00 | 22 | 4.8 | 100 ml / 3.4 fl oz | Cult woody fragrance with Australian sandalwood, cardamom, and leather |
| 17 | Blu Mediterraneo Fico di Amalfi | Acqua di Parma | Italy | fragrances | Eau de Toilette | 145.00 | 35 | 4.7 | 75 ml / 2.5 fl oz | Sun-drenched Italian citrus and fig nectar along the Amalfi cliffs |
| 18 | REPLICA Jazz Club Eau de Toilette | Maison Margiela | France | fragrances | Eau de Toilette | 160.00 | 40 | 4.8 | 100 ml / 3.4 fl oz | Intimate cocktail bar ambiance with rum absolute and tobacco leaf |
| **Haircare (6 Items)** |
| 19 | Gold Lust Repair & Restore Shampoo | Oribe | USA | haircare | Shampoo | 49.00 | 50 | 4.9 | 250 ml / 8.5 fl oz | Rejuvenating cleanser with bio-restorative complex and argan oil |
| 20 | Elixir Ultime L'Huile Original Hair Oil | Kérastase | France | haircare | Hair Oil | 58.00 | 40 | 4.8 | 100 ml / 3.4 fl oz | Sublimating leave-in hair oil with French wild camellia extract |
| 21 | OI All In One Milk Multi-Benefit Treatment | Davines | Italy | haircare | Leave-In | 42.00 | 60 | 4.8 | 135 ml / 4.56 fl oz | Roucou oil leave-in spray providing detangling, shine, and heat protection |
| 22 | Ocean Mist Texturizing Spray | Sachajuan | Sweden | haircare | Texturizing Spray | 36.00 | 45 | 4.7 | 150 ml / 5.1 fl oz | Marine mineral spray with Ocean Silk Technology for effortless beach texture |
| 23 | Cleansing Purifying Sea Salt Scrub | Christophe Robin | France | haircare | Scalp Scrub | 54.00 | 40 | 4.8 | 250 ml / 8.4 fl oz | Clarifying scalp detox scrub with natural sea salt to remove buildup |
| 24 | Fino Premium Touch Hair Mask | Shiseido | Japan | haircare | Hair Mask | 18.50 | 60 | 4.9 | 230 g / 8.1 oz | Intensive Japanese salon repair treatment with royal jelly EX and squalane |

### 3.2 Origin Breakdown Verification
- **France**: 6 items (La Roche-Posay, Caudalie, MFK, Diptyque, Maison Margiela, Kérastase, Christophe Robin)
- **South Korea**: 3 items (Sulwhasoo, COSRX, Rom&nd)
- **Japan**: 4 items (SK-II, Clé de Peau Beauté, SUQQU, Shiseido)
- **Italy**: 2 items (Acqua di Parma, Davines)
- **United Kingdom**: 2 items (Charlotte Tilbury, Lisa Eldridge)
- **Sweden**: 2 items (Byredo, Sachajuan)
- **USA**: 3 items (Westman Atelier, Le Labo, Oribe)
- **Germany**: 1 item (Augustinus Bader)
**Total: 24 items, exactly 4 categories of 6 items each, spanning all 8 target nations.**

### 3.3 Proposed Code Template: `src/data/seedProducts.js`

```javascript
/**
 * VelvetAura - Curated Luxury Imported Beauty Seed Dataset
 * 24 authentic items across 4 categories and 8 global origins.
 */

const seedProducts = [
  // =========================================================================
  // CATEGORY 1: SKINCARE (6 Items)
  // =========================================================================
  {
    name: 'First Care Activating Serum VI',
    brand: 'Sulwhasoo',
    origin: 'South Korea',
    category: 'skincare',
    subcategory: 'Serum',
    price: 89.00,
    originalPrice: 95.00,
    currency: 'USD',
    description: 'An iconic Korean post-cleanse boosting serum formulated with patented JAUM Activator™ and ginseng extract to awaken youthful radiance, strengthen skin barriers, and enhance subsequent skincare absorption.',
    stock: 45,
    rating: 4.9,
    numReviews: 128,
    images: ['/assets/images/sulwhasoo-first-care.webp'],
    featured: true,
    volume: '60 ml / 2.0 fl oz',
    tags: ['k-beauty', 'anti-aging', 'radiance', 'bestseller'],
    specs: {
      volume: '60 ml',
      skinType: 'All skin types, especially dry or mature',
      keyBenefit: 'Strengthens moisture barrier and restores glow',
      formulation: 'Lightweight water-gel serum',
      ingredients: 'JAUM Activator™, Korean Red Ginseng, Licorice Root Extract'
    }
  },
  {
    name: 'The Rich Cream with TFC8®',
    brand: 'Augustinus Bader',
    origin: 'Germany',
    category: 'skincare',
    subcategory: 'Moisturizer',
    price: 290.00,
    originalPrice: null,
    currency: 'USD',
    description: 'An intensely luxurious, deeply restorative cream powered by Professor Bader’s proprietary TFC8® (Trigger Factor Complex) to stimulate cellular rejuvenation, visibly diminish fine lines, and soothe deep dryness.',
    stock: 25,
    rating: 4.8,
    numReviews: 94,
    images: ['/assets/images/augustinus-bader-rich-cream.webp'],
    featured: true,
    volume: '50 ml / 1.7 fl oz',
    tags: ['german-engineering', 'clean-science', 'cellular-renewal', 'luxury'],
    specs: {
      volume: '50 ml',
      skinType: 'Normal to dry, mature skin',
      keyBenefit: 'Deep cellular regeneration and intense hydration',
      formulation: 'Rich lipid-replenishing emulsion',
      ingredients: 'TFC8®, Evening Primrose Oil, Squalane, Hyaluronic Acid'
    }
  },
  {
    name: 'Facial Treatment Essence (Pitera™)',
    brand: 'SK-II',
    origin: 'Japan',
    category: 'skincare',
    subcategory: 'Essence',
    price: 245.00,
    originalPrice: 260.00,
    currency: 'USD',
    description: 'Celebrated as miracle water in J-beauty, this powerhouse essence contains over 90% Pitera™—a bio-ingredient derived from yeast fermentation rich in vitamins, amino acids, and minerals for crystal clear skin.',
    stock: 30,
    rating: 4.9,
    numReviews: 210,
    images: ['/assets/images/sk-ii-essence.webp'],
    featured: true,
    volume: '160 ml / 5.4 fl oz',
    tags: ['j-beauty', 'miracle-water', 'pitera', 'anti-aging', 'award-winner'],
    specs: {
      volume: '160 ml',
      skinType: 'All skin types',
      keyBenefit: 'Refines texture, reduces wrinkles, improves firmness',
      formulation: 'Weightless liquid essence',
      ingredients: 'Galactomyces Ferment Filtrate (Pitera™), Butylene Glycol, Sodium Benzoate'
    }
  },
  {
    name: 'Hyalu B5 Pure Hyaluronic Acid Serum',
    brand: 'La Roche-Posay',
    origin: 'France',
    category: 'skincare',
    subcategory: 'Serum',
    price: 39.99,
    originalPrice: 44.99,
    currency: 'USD',
    description: 'Dermatological anti-aging serum with pure hyaluronic acid, madecassoside, and vitamin B5. Visibly plumps skin, repairs the moisture barrier, and smooths fine lines with high dermatological tolerance.',
    stock: 80,
    rating: 4.8,
    numReviews: 185,
    images: ['/assets/images/laroche-hyalu-b5.webp'],
    featured: false,
    volume: '30 ml / 1.0 fl oz',
    tags: ['french-pharmacy', 'hyaluronic-acid', 'barrier-repair', 'sensitive-skin'],
    specs: {
      volume: '30 ml',
      skinType: 'Sensitive and dehydrated skin',
      keyBenefit: 'Plumps skin and restores moisture barrier',
      formulation: 'Hydrating gel serum',
      ingredients: 'Hyaluronic Acid, Vitamin B5, Madecassoside, Thermal Spring Water'
    }
  },
  {
    name: 'Vinoperfect Radiance Dark Spot Serum',
    brand: 'Caudalie',
    origin: 'France',
    category: 'skincare',
    subcategory: 'Serum',
    price: 82.00,
    originalPrice: null,
    currency: 'USD',
    description: 'Cult-favorite brightening serum powered by patented vine sap Viniferine, proven to be 62 times more effective than Vitamin C in diminishing dark spots and imparting an even, radiant complexion.',
    stock: 35,
    rating: 4.9,
    numReviews: 160,
    images: ['/assets/images/caudalie-vinoperfect.webp'],
    featured: false,
    volume: '30 ml / 1.0 fl oz',
    tags: ['clean-beauty', 'french-skincare', 'brightening', 'dark-spots'],
    specs: {
      volume: '30 ml',
      skinType: 'Dull, uneven, hyperpigmented skin',
      keyBenefit: 'Visibly reduces dark spots and evens tone',
      formulation: 'Milky oil-free serum',
      ingredients: 'Olive Squalane, Grapevine Sap Viniferine, Organic Mint Extract'
    }
  },
  {
    name: 'Advanced Snail 96 Mucin Power Essence',
    brand: 'COSRX',
    origin: 'South Korea',
    category: 'skincare',
    subcategory: 'Essence',
    price: 25.00,
    originalPrice: 28.00,
    currency: 'USD',
    description: 'A global sensation formulated with 96.3% snail secretion filtrate to deeply replenish hydration, repair redness and post-breakout damage, and revitalize skin elasticity without any heaviness.',
    stock: 100,
    rating: 4.7,
    numReviews: 240,
    images: ['/assets/images/cosrx-snail-96.webp'],
    featured: false,
    volume: '100 ml / 3.38 fl oz',
    tags: ['k-beauty', 'snail-mucin', 'hydrating', 'cruelty-free'],
    specs: {
      volume: '100 ml',
      skinType: 'Dry, sensitive, acne-prone',
      keyBenefit: 'Intense soothing and barrier repair',
      formulation: 'Silky mucin essence',
      ingredients: 'Snail Secretion Filtrate, Betaine, Sodium Hyaluronate, Panthenol'
    }
  },

  // =========================================================================
  // CATEGORY 2: COSMETICS (6 Items)
  // =========================================================================
  {
    name: 'Hollywood Flawless Filter',
    brand: 'Charlotte Tilbury',
    origin: 'United Kingdom',
    category: 'cosmetics',
    subcategory: 'Complexion',
    price: 49.00,
    originalPrice: null,
    currency: 'USD',
    description: 'A revolutionary complexion booster that blurs, smooths, and illuminates. Inspired by social media filters and Hollywood red-carpet lighting, it provides high-gloss glow with lightweight smoothing polymers.',
    stock: 60,
    rating: 4.8,
    numReviews: 175,
    images: ['/assets/images/tilbury-flawless-filter.webp'],
    featured: true,
    volume: '30 ml / 1.0 fl oz',
    tags: ['complexion', 'glow', 'red-carpet', 'uk-luxury'],
    specs: {
      volume: '30 ml',
      coverage: 'Sheer to light customizable',
      finish: 'Dewy radiant glow',
      formulation: 'Liquid glow booster',
      ingredients: 'Finely milled powders, Porcelain Flower Extract, Glossy Oil'
    }
  },
  {
    name: 'Radiant Concealer SPF 27',
    brand: 'Clé de Peau Beauté',
    origin: 'Japan',
    category: 'cosmetics',
    subcategory: 'Concealer',
    price: 75.00,
    originalPrice: null,
    currency: 'USD',
    description: 'The definitive gold standard in luxury concealing. Seamlessly covers discoloration, dark circles, and imperfections while infusing the skin with botanical moisture and SPF 27 defense.',
    stock: 35,
    rating: 4.9,
    numReviews: 110,
    images: ['/assets/images/cle-de-peau-concealer.webp'],
    featured: false,
    volume: '5 g / 0.17 oz',
    tags: ['j-beauty', 'full-coverage', 'creamy', 'spf'],
    specs: {
      volume: '5 g',
      coverage: 'Full buildable coverage',
      finish: 'Radiant natural skin-like',
      formulation: 'Hydrating solid stick',
      ingredients: 'Illuminating Complex EX, Chestnut Rosa Fruit Extract, Green Tea Extract'
    }
  },
  {
    name: 'Signature Color Eyes Palette',
    brand: 'SUQQU',
    origin: 'Japan',
    category: 'cosmetics',
    subcategory: 'Eye Shadow',
    price: 72.00,
    originalPrice: null,
    currency: 'USD',
    description: 'Crafted with peerless Japanese craftsmanship, this 4-shade eyeshadow quad fuses translucent clarity with rich pigment adherence, layering effortlessly like fine silk kimono fabrics.',
    stock: 32,
    rating: 4.8,
    numReviews: 68,
    images: ['/assets/images/suqqu-signature-eyes.webp'],
    featured: false,
    volume: '6.2 g / 0.21 oz',
    tags: ['j-beauty', 'artisan', 'eyeshadow', 'silk-texture'],
    specs: {
      volume: '6.2 g',
      coverage: 'Buildable silky pigment',
      finish: 'Satin, shimmer, and soft matte',
      formulation: 'Pressed powder with coated spherical pigments',
      ingredients: 'Synthetic Fluorphlogopite, Talc, Silk Powder, Squalane'
    }
  },
  {
    name: 'Baby Cheeks Blush Stick',
    brand: 'Westman Atelier',
    origin: 'USA',
    category: 'cosmetics',
    subcategory: 'Blush',
    price: 48.00,
    originalPrice: null,
    currency: 'USD',
    description: 'A multi-use cream color stick formulated by master makeup artist Gucci Westman. Melts into cheeks and lips with antioxidant-rich Ayurvedic oils, providing a fresh, healthy flushed radiance.',
    stock: 50,
    rating: 4.7,
    numReviews: 92,
    images: ['/assets/images/westman-baby-cheeks.webp'],
    featured: false,
    volume: '6 g / 0.21 oz',
    tags: ['clean-luxury', 'cream-blush', 'multi-use', 'vegan'],
    specs: {
      volume: '6 g',
      coverage: 'Sheer to medium flush',
      finish: 'Natural fresh velvet',
      formulation: 'Cream twist stick',
      ingredients: 'Berryflux Vita, Jojoba Seed Oil, Biomimicry Pigments'
    }
  },
  {
    name: 'True Velvet Lip Colour',
    brand: 'Lisa Eldridge',
    origin: 'United Kingdom',
    category: 'cosmetics',
    subcategory: 'Lipstick',
    price: 38.00,
    originalPrice: null,
    currency: 'USD',
    description: 'A groundbreaking lipstick formulation with a visual texture of woven velvet fabric. Delivers intensely saturated, non-drying matte color that feels weightless and stays vibrant for hours.',
    stock: 55,
    rating: 4.9,
    numReviews: 145,
    images: ['/assets/images/lisa-eldridge-true-velvet.webp'],
    featured: true,
    volume: '3.5 g / 0.12 oz',
    tags: ['uk-luxury', 'matte-lipstick', 'velvet', 'cruelty-free'],
    specs: {
      volume: '3.5 g',
      coverage: 'Full opaque one-swipe color',
      finish: 'True velvet demi-matte',
      formulation: 'Cushioned pigment stick',
      ingredients: 'Castor Seed Oil, Candelilla Wax, Vitamin E, Saturated Iron Oxides'
    }
  },
  {
    name: 'Zero Velvet Tint #06 Deepsoul',
    brand: 'Rom&nd',
    origin: 'South Korea',
    category: 'cosmetics',
    subcategory: 'Lip Tint',
    price: 13.00,
    originalPrice: 15.00,
    currency: 'USD',
    description: 'A lightweight blur velvet tint that glides like a feather, soft-focusing lip texture into a smooth, romantic deep burgundy pout without drying out lip contours.',
    stock: 80,
    rating: 4.6,
    numReviews: 190,
    images: ['/assets/images/romand-zero-velvet.webp'],
    featured: false,
    volume: '5.5 g / 0.19 oz',
    tags: ['k-beauty', 'velvet-tint', 'blur-lip', 'affordable-luxury'],
    specs: {
      volume: '5.5 g',
      coverage: 'Medium buildable matte stain',
      finish: 'Blurred matte velvet',
      formulation: 'Airy silicone mousse tint',
      ingredients: 'Dimethicone, Polyglyceryl-2 Triisostearate, Macadamia Seed Oil'
    }
  },

  // =========================================================================
  // CATEGORY 3: FRAGRANCES (6 Items)
  // =========================================================================
  {
    name: 'Gypsy Water Eau de Parfum',
    brand: 'Byredo',
    origin: 'Sweden',
    category: 'fragrances',
    subcategory: 'Eau de Parfum',
    price: 290.00,
    originalPrice: null,
    currency: 'USD',
    description: 'A modern olfactory masterpiece inspired by Romani culture. Crisp juniper berries and fresh bergamot evolve into a warm heart of pine needles and orris, resting on a base of amber and vanilla.',
    stock: 25,
    rating: 4.9,
    numReviews: 142,
    images: ['/assets/images/byredo-gypsy-water.webp'],
    featured: true,
    volume: '100 ml / 3.4 fl oz',
    tags: ['niche-perfume', 'scandinavian', 'woody-aromatic', 'cult-classic'],
    specs: {
      volume: '100 ml',
      scentType: 'Woody Aromatic',
      notes: 'Top: Bergamot, Lemon, Pepper, Juniper | Heart: Pine Needles, Orris | Base: Amber, Vanilla, Sandalwood',
      concentration: 'Eau de Parfum (15-20% oils)',
      gender: 'Genderless / Unisex'
    }
  },
  {
    name: 'Baccarat Rouge 540 Extrait de Parfum',
    brand: 'Maison Francis Kurkdjian',
    origin: 'France',
    category: 'fragrances',
    subcategory: 'Extrait de Parfum',
    price: 345.00,
    originalPrice: null,
    currency: 'USD',
    description: 'The pinnacle of French haute perfumery. Francis Kurkdjian enhances the radiance of the original with Grandiflorum jasmine from Egypt, bitter almond from Morocco, and a crystalline ambergris accord.',
    stock: 18,
    rating: 4.9,
    numReviews: 230,
    images: ['/assets/images/mfk-baccarat-rouge-540.webp'],
    featured: true,
    volume: '70 ml / 2.4 fl oz',
    tags: ['haute-perfumerie', 'french-luxury', 'ambergris', 'ultra-prestige'],
    specs: {
      volume: '70 ml',
      scentType: 'Amber Woody Floral',
      notes: 'Top: Bitter Almond, Saffron | Heart: Egyptian Jasmine Grandiflorum, Cedarwood | Base: Ambergris, Woody Musk',
      concentration: 'Extrait de Parfum (40% oils)',
      gender: 'Genderless / Unisex'
    }
  },
  {
    name: 'Philosykos Eau de Parfum',
    brand: 'Diptyque',
    origin: 'France',
    category: 'fragrances',
    subcategory: 'Eau de Parfum',
    price: 230.00,
    originalPrice: null,
    currency: 'USD',
    description: 'An ode to the whole fig tree bathed in Mediterranean sunlight: green freshness of the leaves, milky flavor of the ripe fruit, and the warm density of white cedar wood.',
    stock: 30,
    rating: 4.8,
    numReviews: 115,
    images: ['/assets/images/diptyque-philosykos.webp'],
    featured: false,
    volume: '75 ml / 2.5 fl oz',
    tags: ['parisian', 'fig-scent', 'green-woody', 'artisan-fragrance'],
    specs: {
      volume: '75 ml',
      scentType: 'Green Woody Fresh',
      notes: 'Top: Fig Leaf, Fig | Heart: Coconut, Green Accords | Base: Cedar, Woody Notes, Fig Tree Bark',
      concentration: 'Eau de Parfum',
      gender: 'Genderless / Unisex'
    }
  },
  {
    name: 'Santal 33 Eau de Parfum',
    brand: 'Le Labo',
    origin: 'USA',
    category: 'fragrances',
    subcategory: 'Eau de Parfum',
    price: 320.00,
    originalPrice: null,
    currency: 'USD',
    description: 'The intoxicating fragrance that redefined artisanal American perfumery. Blends smoking Australian sandalwood and cedarwood with piquant cardamom, iris, and leathery undertones.',
    stock: 22,
    rating: 4.8,
    numReviews: 195,
    images: ['/assets/images/le-labo-santal-33.webp'],
    featured: false,
    volume: '100 ml / 3.4 fl oz',
    tags: ['cult-fragrance', 'sandalwood', 'artisanal', 'unisex'],
    specs: {
      volume: '100 ml',
      scentType: 'Rich Woody Leather',
      notes: 'Top: Cardamom, Iris, Violet | Heart: Australian Sandalwood, Papyrus | Base: Cedarwood, Leather, Amber',
      concentration: 'Eau de Parfum',
      gender: 'Genderless / Unisex'
    }
  },
  {
    name: 'Blu Mediterraneo Fico di Amalfi',
    brand: 'Acqua di Parma',
    origin: 'Italy',
    category: 'fragrances',
    subcategory: 'Eau de Toilette',
    price: 145.00,
    originalPrice: 165.00,
    currency: 'USD',
    description: 'Captures the breathtaking vitality of the Amalfi Coast. An enlivening Italian cocktail of bergamot, citron, and pink pepper intertwined with sweet fig nectar and cedarwood.',
    stock: 35,
    rating: 4.7,
    numReviews: 88,
    images: ['/assets/images/acqua-di-parma-fico.webp'],
    featured: false,
    volume: '75 ml / 2.5 fl oz',
    tags: ['italian-luxury', 'mediterranean', 'citrus-fig', 'summer-scent'],
    specs: {
      volume: '75 ml',
      scentType: 'Citrus Woody',
      notes: 'Top: Italian Citron, Bergamot, Grapefruit | Heart: Fig Nectar, Pink Pepper, Jasmine | Base: Fig Wood, Cedarwood, Benzoin',
      concentration: 'Eau de Toilette',
      gender: 'Genderless / Unisex'
    }
  },
  {
    name: 'REPLICA Jazz Club Eau de Toilette',
    brand: 'Maison Margiela',
    origin: 'France',
    category: 'fragrances',
    subcategory: 'Eau de Toilette',
    price: 160.00,
    originalPrice: null,
    currency: 'USD',
    description: 'An evocative olfactory memory of a dimly lit jazz club in Brooklyn: clinking amber cocktails, spicy pink pepper, warm acoustic wooden melodies, and aged tobacco leaves.',
    stock: 40,
    rating: 4.8,
    numReviews: 165,
    images: ['/assets/images/margiela-jazz-club.webp'],
    featured: false,
    volume: '100 ml / 3.4 fl oz',
    tags: ['parisian-fashion', 'warm-spicy', 'boozy-tobacco', 'memory-scent'],
    specs: {
      volume: '100 ml',
      scentType: 'Warm & Spicy Oriental',
      notes: 'Top: Pink Pepper, Neroli, Lemon | Heart: Rum Absolute, Clary Sage, Vetiver | Base: Tobacco Leaf, Vanilla Bean, Styrax',
      concentration: 'Eau de Toilette',
      gender: 'Genderless / Unisex'
    }
  },

  // =========================================================================
  // CATEGORY 4: HAIRCARE (6 Items)
  // =========================================================================
  {
    name: 'Gold Lust Repair & Restore Shampoo',
    brand: 'Oribe',
    origin: 'USA',
    category: 'haircare',
    subcategory: 'Shampoo',
    price: 49.00,
    originalPrice: null,
    currency: 'USD',
    description: 'The fountain of youth for stressed tresses. Combines centuries-old healing oils like argan and maracuja with modern bio-restorative complexes to balance the scalp and reinforce inner strand integrity.',
    stock: 50,
    rating: 4.9,
    numReviews: 152,
    images: ['/assets/images/oribe-gold-lust.webp'],
    featured: true,
    volume: '250 ml / 8.5 fl oz',
    tags: ['luxury-haircare', 'sulfate-free', 'repair', 'argan-oil'],
    specs: {
      volume: '250 ml',
      hairType: 'Damaged, color-treated, or aging hair',
      keyBenefit: 'Rejuvenates strands, restores elasticity, and prevents breakage',
      formulation: 'Sulfate-free ultra-rich shampoo',
      ingredients: 'Oribe Signature Complex, Bio-Restorative Complex, Argan Oil, Maracuja Oil'
    }
  },
  {
    name: 'Elixir Ultime L\'Huile Original Hair Oil',
    brand: 'Kérastase',
    origin: 'France',
    category: 'haircare',
    subcategory: 'Hair Oil',
    price: 58.00,
    originalPrice: null,
    currency: 'USD',
    description: 'The legendary Parisian hair beautifier infused with wild French camellia and sacred marula oil. Delivers 96 hours of frizz control, radiant mirror-like shine, and heat protection up to 230°C.',
    stock: 40,
    rating: 4.8,
    numReviews: 178,
    images: ['/assets/images/kerastase-elixir.webp'],
    featured: false,
    volume: '100 ml / 3.4 fl oz',
    tags: ['french-salon', 'camellia-oil', 'glass-hair', 'heat-protectant'],
    specs: {
      volume: '100 ml',
      hairType: 'All hair types, dull or frizzy hair',
      keyBenefit: 'Mirror shine, anti-frizz, thermal protection',
      formulation: 'Weightless nourishing oil elixir',
      ingredients: 'French Wild Camellia, Marula Oil, Argan Oil, Maize Germ Oil'
    }
  },
  {
    name: 'OI All In One Milk Multi-Benefit Treatment',
    brand: 'Davines',
    origin: 'Italy',
    category: 'haircare',
    subcategory: 'Leave-In',
    price: 42.00,
    originalPrice: null,
    currency: 'USD',
    description: 'Artisanal Italian leave-in treatment enriched with antioxidant Roucou oil from the Amazon. Detangles effortlessly, controls frizz, hydrates, shields against heat styling, and imparts exceptional body.',
    stock: 60,
    rating: 4.8,
    numReviews: 135,
    images: ['/assets/images/davines-oi-milk.webp'],
    featured: false,
    volume: '135 ml / 4.56 fl oz',
    tags: ['italian-sustainable', 'roucou-oil', 'leave-in', 'all-in-one'],
    specs: {
      volume: '135 ml',
      hairType: 'All hair types',
      keyBenefit: 'Instant detangling, softening, thermal defense',
      formulation: 'Lightweight conditioning spray milk',
      ingredients: 'Roucou Oil, Provitamin B5, Functional Amino Complex'
    }
  },
  {
    name: 'Ocean Mist Texturizing Spray',
    brand: 'Sachajuan',
    origin: 'Sweden',
    category: 'haircare',
    subcategory: 'Texturizing Spray',
    price: 36.00,
    originalPrice: null,
    currency: 'USD',
    description: 'A cult Scandinavian styling mist engineered with Ocean Silk Technology. Harnesses natural sea salts and marine algae minerals to grant weightless volume, matte beach texture, and natural grip.',
    stock: 45,
    rating: 4.7,
    numReviews: 80,
    images: ['/assets/images/sachajuan-ocean-mist.webp'],
    featured: false,
    volume: '150 ml / 5.1 fl oz',
    tags: ['scandinavian-minimalism', 'beach-waves', 'sea-salt', 'volume'],
    specs: {
      volume: '150 ml',
      hairType: 'Fine, flat, or wavy hair',
      keyBenefit: 'Matte texture, volume, and effortless beach waves',
      formulation: 'Aqueous sea mineral mist',
      ingredients: 'Ocean Silk Technology, Sea Salts, Castor Oil, Marine Algae Extracts'
    }
  },
  {
    name: 'Cleansing Purifying Sea Salt Scrub',
    brand: 'Christophe Robin',
    origin: 'France',
    category: 'haircare',
    subcategory: 'Scalp Scrub',
    price: 54.00,
    originalPrice: null,
    currency: 'USD',
    description: 'The world-famous Parisian detox treatment for sensitive or oily scalps. Natural sea salt crystals exfoliate impurities, dissolve styling product buildup, and soothe post-coloring scalp stinging.',
    stock: 40,
    rating: 4.8,
    numReviews: 122,
    images: ['/assets/images/christophe-robin-salt-scrub.webp'],
    featured: false,
    volume: '250 ml / 8.4 fl oz',
    tags: ['scalp-care', 'french-expert', 'detox', 'sea-salt'],
    specs: {
      volume: '250 ml',
      hairType: 'Oily, flaky, or product-heavy scalps',
      keyBenefit: 'Deep detox cleansing, balances scalp microbiome',
      formulation: 'Exfoliating salt paste',
      ingredients: 'Natural Sea Salt Crystals, Sweet Almond Oil, Chamomile Extract'
    }
  },
  {
    name: 'Fino Premium Touch Hair Mask',
    brand: 'Shiseido',
    origin: 'Japan',
    category: 'haircare',
    subcategory: 'Hair Mask',
    price: 18.50,
    originalPrice: 22.00,
    currency: 'USD',
    description: 'Japan’s premier intensive salon rinse-off mask. Formulated with 7 beauty serum essences including royal jelly EX, trehalose, and lipidure to melt into severely damaged or bleached cuticles for glassy softness.',
    stock: 60,
    rating: 4.9,
    numReviews: 225,
    images: ['/assets/images/shiseido-fino-mask.webp'],
    featured: true,
    volume: '230 g / 8.1 oz',
    tags: ['j-beauty', 'deep-conditioner', 'royal-jelly', 'damaged-hair-repair'],
    specs: {
      volume: '230 g',
      hairType: 'Dry, bleached, damaged hair',
      keyBenefit: 'Instant cuticle sealing, glassy softness and bounce',
      formulation: 'Intensive butter cream mask',
      ingredients: 'Royal Jelly EX, Trehalose, Squalane, Hydrolyzed Wheat Protein, Lipidure'
    }
  }
];

module.exports = seedProducts;
module.exports.seedProducts = seedProducts;
```

---

## 4. Standalone Seed Script Specification (`src/data/seed.js`)

### 4.1 Requirements & Execution Modes
1. **CLI Execution (`npm run seed`)**:
   - Executed via `node src/data/seed.js`.
   - Connects to database using `connectDB({ autoSeed: false })`.
   - Clears existing records across `Product`, `User`, `Cart`, `Order`.
   - Populates default users (`evelyn@velvetaura.luxury`, `concierge@velvetaura.luxury`, `customer@velvetaura.com`). Uses `User.create()` so that Mongoose `pre('save')` hooks correctly hash passwords with bcrypt.
   - Populates 24 luxury products via `Product.insertMany(seedProducts)`.
   - Prints a formatted summary table to console.
   - Disconnects database cleanly with `disconnectDB()`.
   - Exits with `process.exit(0)` on success or `process.exit(1)` on error.
2. **Programmatic Execution (`seedInitialData(options)` / `seedCatalog(options)`)**:
   - Required by `src/config/db.js` auto-seed hook.
   - Accepts `{ silent: true, reset: false }`.
   - Returns `{ success: true, count: products.length }`.
   - **Does NOT** call `process.exit()` or `disconnectDB()`, preserving the server connection.

### 4.2 Proposed Code Template: `src/data/seed.js`

```javascript
/**
 * VelvetAura - Standalone & Programmatic Database Seeder
 * Populates 24 curated luxury imported products and default demo personas.
 * CLI: npm run seed
 * Module: require('./seed').seedInitialData()
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const seedProducts = require('./seedProducts');

const demoUsers = [
  {
    name: 'Evelyn Vance',
    email: 'evelyn@velvetaura.luxury',
    password: 'VelvetAura2026!',
    role: 'customer',
    address: {
      street: '742 Evergreen Terrace',
      city: 'Beverly Hills',
      state: 'CA',
      zip: '90210',
      country: 'USA'
    }
  },
  {
    name: 'Velvet Concierge',
    email: 'concierge@velvetaura.luxury',
    password: 'VelvetAdmin2026!',
    role: 'admin',
    address: {
      street: '100 Luxury Way',
      city: 'New York',
      state: 'NY',
      zip: '10021',
      country: 'USA'
    }
  },
  {
    name: 'Standard Customer',
    email: 'customer@velvetaura.com',
    password: 'Password123!',
    role: 'customer',
    address: {
      street: '14 Rue de Rivoli',
      city: 'Paris',
      state: 'Ile-de-France',
      zip: '75001',
      country: 'France'
    }
  }
];

/**
 * Programmatic seeding function used by both CLI and db.js auto-seed
 * @param {Object} [options={}]
 * @param {boolean} [options.silent=false]
 * @param {boolean} [options.reset=true]
 */
async function seedInitialData(options = {}) {
  const silent = options.silent || false;
  const reset = options.reset !== false;

  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  try {
    if (reset) {
      log('[Seeder] Resetting collections: Product, User, Cart, Order...');
      await Product.deleteMany({});
      await User.deleteMany({});
      await Cart.deleteMany({});
      await Order.deleteMany({});
    }

    // 1. Seed demo users using User.create to ensure pre('save') bcrypt hashing runs
    log('[Seeder] Seeding default demo customer and admin accounts...');
    const users = await User.create(demoUsers);
    log(`[Seeder] Successfully created ${users.length} demo users.`);

    // 2. Seed luxury products catalog
    log(`[Seeder] Seeding ${seedProducts.length} curated luxury beauty products...`);
    const products = await Product.insertMany(seedProducts);
    log(`[Seeder] Successfully seeded ${products.length} luxury products into catalog.`);

    if (!silent) {
      const summary = {};
      products.forEach(p => {
        summary[p.category] = (summary[p.category] || 0) + 1;
      });
      console.log('\n--- VelvetAura Catalog Breakdown ---');
      console.table(summary);
      console.log('Demo Credentials:');
      console.log('  Customer: evelyn@velvetaura.luxury / VelvetAura2026!');
      console.log('  Admin:    concierge@velvetaura.luxury / VelvetAdmin2026!');
      console.log('  Test:     customer@velvetaura.com / Password123!\n');
    }

    return {
      success: true,
      userCount: users.length,
      productCount: products.length
    };
  } catch (error) {
    if (!silent) {
      console.error('[Seeder] Critical failure during seeding process:', error);
    }
    throw error;
  }
}

/**
 * Compatibility alias for db.js
 */
async function seedCatalog(options = {}) {
  return seedInitialData(options);
}

/**
 * CLI Runner
 */
async function runCli() {
  console.log('====================================================');
  console.log(' VelvetAura - Luxury Beauty Database Seeder (CLI)  ');
  console.log('====================================================');

  try {
    await connectDB({ autoSeed: false });
    await seedInitialData({ silent: false, reset: true });
    console.log('[Seeder] Database seeding completed successfully.');
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    console.error('[Seeder] Seed failed:', err);
    try {
      await disconnectDB();
    } catch (_) {}
    process.exit(1);
  }
}

// Execute CLI only when run directly from command line
if (require.main === module) {
  runCli();
}

module.exports = {
  seedInitialData,
  seedCatalog,
  demoUsers,
  seedProducts
};
```

---

## 5. Database Auto-Seeding Integration Blueprint (`src/config/db.js`)

Inspection confirms that `src/config/db.js` contains the following logic:
```javascript
    // Attempt 1: Check if standalone seeder script exports a programmatic seeder
    const seedScriptPath = path.join(__dirname, '../data/seed.js');
    if (fs.existsSync(seedScriptPath)) {
      try {
        const seeder = require(seedScriptPath);
        if (typeof seeder.seedInitialData === 'function') {
          await seeder.seedInitialData({ silent: true });
          console.log('[DB] Catalog auto-seeded successfully via seedInitialData().');
          return;
        } else if (typeof seeder.seedCatalog === 'function') {
          await seeder.seedCatalog({ silent: true });
          console.log('[DB] Catalog auto-seeded successfully via seedCatalog().');
          return;
        }
      } catch (err) {
        console.warn(`[DB] Error invoking seed script (${err.message}). Trying direct product seed...`);
      }
    }
```
### Integration Verification:
- When `src/data/seed.js` exports `seedInitialData(options)` and `seedCatalog(options)`, `db.js` will seamlessly invoke `seedInitialData({ silent: true })`.
- If `src/data/seed.js` encountered any problem, Attempt 2 in `db.js` directly requires `src/data/seedProducts.js` and calls `Product.insertMany(items)`.
- Because our blueprint exports both `seedInitialData` and `seedProducts`, both paths are covered. Zero modifications to `src/config/db.js` are required.

---

## 6. Product Catalog REST Controllers Specification (`src/controllers/productController.js`)

### 6.1 Requirements & Query Mechanics

#### 1. Search Query & Regex Escaping
Adversarial inputs such as `<script>alert("xss")</script>`, `' OR '1'='1' --`, and `{"$gt": ""}` must be handled without throwing errors:
```javascript
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}
```
If `req.query.q` is passed as an object (e.g. `q={"$gt": ""}` from parameter pollution), it must be converted to a string or ignored:
```javascript
const rawQ = typeof req.query.q === 'string' ? req.query.q.trim() : (typeof req.query.search === 'string' ? req.query.search.trim() : '');
```

#### 2. Multi-Facet Filtering
- `category`: If passed, match case-insensitively. If non-existent category is queried, return an empty array with HTTP 200.
- `origin`: Case-insensitive regex. If non-existent origin is queried, return an empty array with HTTP 200.
- `brand`: Case-insensitive regex.
- `featured`: Convert string `'true'` / `'false'` to boolean.
- Price filtering: `minPrice` (`$gte`) and `maxPrice` (`$lte`).

#### 3. Sorting Engine
- `price-asc`: `{ price: 1 }`
- `price-desc`: `{ price: -1 }`
- `rating`: `{ rating: -1, numReviews: -1 }`
- `name`: `{ name: 1 }`
- `newest` (default): `{ createdAt: -1 }`

#### 4. Pagination
- Default `limit = 24` (or `limit = 12` when requested; max `100`).
- Default `page = 1`.
- Total count: `Product.countDocuments(filter)`.
- Computed `pages = Math.ceil(total / limit) || 1`.

#### 5. Categories & Metadata (`GET /api/products/categories`)
- Provides distinct categories with metadata (icon, count) and all available imported origins.

#### 6. Product Detail (`GET /api/products/:id`)
- Validates ID via `mongoose.Types.ObjectId.isValid(id)`. Returns HTTP 400 Bad Request with `{ success: false, message: 'Invalid product ID format' }` if invalid.
- Queries product. If null, returns HTTP 404 with `{ success: false, message: 'Product not found' }`.
- Returns HTTP 200 with `{ success: true, product }`.

### 6.2 Proposed Code Template: `src/controllers/productController.js`

```javascript
/**
 * VelvetAura - Product Catalog Controller
 * Implements catalog discovery, multi-facet filtering, safe keyword search,
 * sorting, pagination, category taxonomy, and product detail retrieval.
 */

const mongoose = require('mongoose');
const Product = require('../models/Product');

/**
 * Escapes regex special characters to prevent ReDoS and regex syntax errors
 * @param {string} text - Raw input string
 * @returns {string} Escaped string safe for RegExp
 */
function escapeRegex(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * @desc    Get all products with search, multi-facet filters, sorting, and pagination
 * @route   GET /api/products
 * @access  Public
 */
const getProducts = async (req, res, next) => {
  try {
    const {
      category,
      origin,
      brand,
      featured,
      minPrice,
      maxPrice,
      sort,
      page = 1,
      limit = 24,
    } = req.query;

    const filter = {};

    // 1. Category Filter (case-insensitive)
    if (category && typeof category === 'string' && category.trim() !== '') {
      const catTrimmed = category.trim();
      if (catTrimmed.includes(',')) {
        const categories = catTrimmed.split(',').map(c => new RegExp(`^${escapeRegex(c.trim())}$`, 'i'));
        filter.category = { $in: categories };
      } else {
        filter.category = { $regex: new RegExp(`^${escapeRegex(catTrimmed)}$`, 'i') };
      }
    }

    // 2. Origin Filter (case-insensitive)
    if (origin && typeof origin === 'string' && origin.trim() !== '') {
      const originTrimmed = origin.trim();
      if (originTrimmed.includes(',')) {
        const origins = originTrimmed.split(',').map(o => new RegExp(`^${escapeRegex(o.trim())}$`, 'i'));
        filter.origin = { $in: origins };
      } else {
        filter.origin = { $regex: new RegExp(`^${escapeRegex(originTrimmed)}$`, 'i') };
      }
    }

    // 3. Brand Filter (case-insensitive)
    if (brand && typeof brand === 'string' && brand.trim() !== '') {
      const brandTrimmed = brand.trim();
      if (brandTrimmed.includes(',')) {
        const brands = brandTrimmed.split(',').map(b => new RegExp(`^${escapeRegex(b.trim())}$`, 'i'));
        filter.brand = { $in: brands };
      } else {
        filter.brand = { $regex: new RegExp(`^${escapeRegex(brandTrimmed)}$`, 'i') };
      }
    }

    // 4. Featured Flag
    if (featured !== undefined) {
      filter.featured = featured === 'true' || featured === true;
    }

    // 5. Price Range Filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined && !isNaN(Number(minPrice))) {
        filter.price.$gte = Number(minPrice);
      }
      if (maxPrice !== undefined && !isNaN(Number(maxPrice))) {
        filter.price.$lte = Number(maxPrice);
      }
    }

    // 6. Safe Keyword Search across name, brand, description, origin, tags
    const rawSearch = typeof req.query.q === 'string' 
      ? req.query.q 
      : (typeof req.query.search === 'string' ? req.query.search : '');

    const sanitizedTerm = rawSearch.trim();
    if (sanitizedTerm) {
      const safeRegex = new RegExp(escapeRegex(sanitizedTerm), 'i');
      filter.$or = [
        { name: safeRegex },
        { brand: safeRegex },
        { description: safeRegex },
        { origin: safeRegex },
        { tags: safeRegex },
        { subcategory: safeRegex },
      ];
    }

    // 7. Sorting Strategy
    let sortOptions = { createdAt: -1 };
    switch (sort) {
      case 'price-asc':
      case 'price_asc':
      case 'price:asc':
        sortOptions = { price: 1, _id: 1 };
        break;
      case 'price-desc':
      case 'price_desc':
      case 'price:desc':
        sortOptions = { price: -1, _id: 1 };
        break;
      case 'rating':
      case 'rating-desc':
        sortOptions = { rating: -1, numReviews: -1, _id: 1 };
        break;
      case 'name':
      case 'name-asc':
        sortOptions = { name: 1, _id: 1 };
        break;
      case 'name-desc':
        sortOptions = { name: -1, _id: 1 };
        break;
      case 'newest':
      default:
        sortOptions = { createdAt: -1, _id: 1 };
        break;
    }

    // 8. Pagination Mechanics
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
    const skip = (pageNum - 1) * limitNum;

    // 9. Database Execution
    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    const pages = Math.ceil(total / limitNum) || 1;

    res.status(200).json({
      success: true,
      count: products.length,
      total,
      page: pageNum,
      pages,
      products,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get categories taxonomy and available origins
 * @route   GET /api/products/categories
 * @access  Public
 */
const getProductCategories = async (req, res, next) => {
  try {
    const defaultCategories = [
      { id: 'skincare', name: 'Skincare', icon: 'sparkles' },
      { id: 'cosmetics', name: 'Cosmetics', icon: 'palette' },
      { id: 'fragrances', name: 'Fragrances', icon: 'droplet' },
      { id: 'haircare', name: 'Haircare', icon: 'wind' },
    ];

    // Compute live counts per category
    const categoryCounts = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    const countMap = {};
    categoryCounts.forEach(c => {
      if (c._id) countMap[c._id.toLowerCase()] = c.count;
    });

    const categories = defaultCategories.map(cat => ({
      ...cat,
      count: countMap[cat.id] || 0
    }));

    // Retrieve unique origins and brands currently in catalog
    const [origins, brands] = await Promise.all([
      Product.distinct('origin'),
      Product.distinct('brand')
    ]);

    res.status(200).json({
      success: true,
      categories,
      origins: origins.length > 0 ? origins.sort() : [
        'France', 'South Korea', 'Japan', 'Italy', 'United Kingdom', 'Sweden', 'USA', 'Germany'
      ],
      brands: brands.sort(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single product by ID
 * @route   GET /api/products/:id
 * @access  Public
 */
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Strict validation of MongoDB ObjectId format
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
        error: 'Invalid product ID format',
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error: 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProducts,
  getProductCategories,
  getProductById,
  escapeRegex,
};
```

---

## 7. Router Mounting Specification (`src/routes/productRoutes.js`)

### Route Order Constraint:
The `/categories` route must be registered before the `/:id` route; otherwise, requests to `/api/products/categories` will match `/:id` with `id="categories"`, triggering a 400 Bad Request error.

### Proposed Code Template: `src/routes/productRoutes.js`

```javascript
/**
 * VelvetAura - Product Catalog Route Definitions
 * Maps endpoints for catalog listing, category metadata, and single product views.
 */

const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductCategories,
  getProductById,
} = require('../controllers/productController');

// 1. Listing, filtering, search, and pagination
router.get('/', getProducts);

// 2. Category taxonomy & available origins (MUST be declared before /:id)
router.get('/categories', getProductCategories);

// 3. Single product details by ObjectId
router.get('/:id', getProductById);

module.exports = router;
```

---

## 8. Threat Modeling & Adversarial Hardening

| Threat Vector | Vulnerability Description | Mitigation Implemented |
|---|---|---|
| **ReDoS & Regex Crash** | User supplies unmatched braces or quantifier metacharacters (`q='['`, `q='*'`, `q='(+'`). | `escapeRegex()` escapes all 14 regex metacharacters, converting literal symbols to safe pattern matches. |
| **NoSQL Query Object Injection** | Client sends query params as parsed objects (e.g., `?q[$gt]=`, `?category[$ne]=null`). | Explicit type check: `typeof rawQuery === 'string'`. Non-string inputs are rejected or discarded. |
| **Invalid ObjectId Format Crash** | Client requests `/api/products/not-an-id` or `/api/products/123`. | `mongoose.Types.ObjectId.isValid(id)` pre-validation immediately returns HTTP 400 with structured JSON before passing to Mongoose. |
| **Non-Existent Query Handling** | Client queries non-existent category or country (`category=non_existent_cosmic_category`, `origin=Atlantis`). | Returns HTTP 200 with an empty list `products: []` instead of throwing errors or returning 404/500. |
| **Route Param Collision** | Requesting `/api/products/categories` matches `/:id` route parameter. | Route declaration order strictly enforces `/categories` before `/:id`. |
| **Stale State in Seeding** | Standalone seeding appending duplicate products or leaking test sessions. | `seed.js` issues `deleteMany({})` across `Product`, `User`, `Cart`, `Order` in clean reset mode. |
| **Cleartext Password Seeding** | Direct insertion of seed users via `User.insertMany()` bypassing bcrypt. | `seed.js` uses `User.create(demoUsers)` ensuring Mongoose `pre('save')` hooks hash passwords with bcrypt. |

---

## 9. Implementation Checklist for Milestone 2 Workers

- [ ] Create `src/data/seedProducts.js` containing the 24 curated luxury items with complete specs, ratings, and tags.
- [ ] Create `src/data/seed.js` providing both CLI execution (`npm run seed`) and module exports (`seedInitialData`, `seedCatalog`).
- [ ] Create `src/controllers/productController.js` implementing `getProducts`, `getProductCategories`, `getProductById`, and `escapeRegex`.
- [ ] Create `src/routes/productRoutes.js` mounting the endpoints with `/categories` declared before `/:id`.
- [ ] Verify `npm run seed` executes and exits with code 0.
- [ ] Verify `tests/e2e/tier1_catalog.test.js` passes completely.
- [ ] Verify `tests/e2e/tier2_boundary.test.js` Catalog & Search Boundaries (B2-1 to B2-4) pass completely.
