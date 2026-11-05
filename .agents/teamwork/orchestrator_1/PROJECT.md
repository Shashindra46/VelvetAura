# Project: VelvetAura

## Architecture
VelvetAura is a full-stack luxury imported beauty e-commerce platform built with Node.js, Express, MongoDB (with transparent in-memory fallback), and a modern dark-mode glassmorphism frontend.

### System Overview
- **Runtime**: Node.js (>= 18.x) with Express.js REST API
- **Persistence**: MongoDB via Mongoose. Transparent dual-mode connection: connects to `MONGODB_URI` if accessible, or automatically falls back to `mongodb-memory-server` within 3000ms. Auto-seeds catalog on startup if collection is empty.
- **Authentication**: Stateless JWT token authentication with `bcryptjs` password hashing and `protect` middleware.
- **Frontend**: Single-Page Application with custom CSS glassmorphism design system (translucent glass cards, `backdrop-filter: blur(16px)`, frosted glass layers, obsidian `#0B0B13` background, glowing accents `#E0A96D` champagne gold and `#9D4EDD` royal velvet). Real-time zero-reload cart updates, slide-over cart drawer, mock checkout with test card autofill, and user order history.
- **Testing**: Jest + Supertest automated verification suite for `npm test`, plus dual-track opaque-box E2E testing.

## Code Layout
```
g:\VelvetAura\
├── package.json
├── .env.example
├── server.js                        # App entry point (HTTP listen)
├── src/
│   ├── app.js                       # Express app configuration & middleware
│   ├── config/
│   │   └── db.js                    # Dual-mode DB connection (URI or MongoMemoryServer)
│   ├── models/
│   │   ├── User.js                  # User schema & password hashing
│   │   ├── Product.js               # Product schema & text search indexes
│   │   ├── Cart.js                  # Cart schema & calculation methods
│   │   └── Order.js                 # Order schema & status tracking
│   ├── routes/
│   │   ├── authRoutes.js            # /api/auth endpoints
│   │   ├── productRoutes.js         # /api/products endpoints
│   │   ├── cartRoutes.js            # /api/cart endpoints
│   │   ├── orderRoutes.js           # /api/orders endpoints
│   │   └── healthRoutes.js          # /api/health endpoint
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── productController.js
│   │   ├── cartController.js
│   │   └── orderController.js
│   ├── middleware/
│   │   ├── authMiddleware.js        # JWT verify & attach req.user
│   │   └── errorMiddleware.js       # Global error handler
│   ├── services/
│   │   ├── paymentService.js        # Mock payment authorization simulation
│   │   └── cartService.js           # Subtotal, 8% tax, shipping calculation
│   └── data/
│       ├── seedProducts.js          # 20+ imported luxury beauty items
│       └── seed.js                  # Standalone seed script (npm run seed)
├── public/                          # Frontend Static Assets & SPA
│   ├── index.html                   # Shell with meta tags and mounting points
│   ├── css/
│   │   ├── variables.css            # Dark-mode glassmorphism tokens
│   │   ├── base.css                 # Reset, typography, layout
│   │   ├── glassmorphism.css        # Glass cards, frosted layers, blur effects
│   │   └── components.css           # Navbar, catalog, drawer, modal, toast
│   ├── js/
│   │   ├── api.js                   # Client REST API wrapper (fetch + JWT header)
│   │   ├── store.js                 # Reactive state (Auth, Cart, Catalog, Orders)
│   │   ├── components/
│   │   │   ├── navbar.js            # Header, search, categories, cart badge
│   │   │   ├── catalog.js           # Product grid, filter chips, origin tags
│   │   │   ├── productDetail.js     # Modal/view with specs and quantity
│   │   │   ├── cartDrawer.js        # Slide-over cart with live calculation
│   │   │   ├── checkoutModal.js     # Shipping form & mock payment helper
│   │   │   ├── orderConfirmation.js # Receipt screen
│   │   │   └── accountView.js       # Customer profile & order history
│   │   └── app.js                   # SPA router and initialization
│   └── assets/
│       └── images/                  # Placeholders & product visuals
└── tests/                           # Verification Suite (npm test)
    ├── setup.js                     # Test environment & in-memory DB hooks
    ├── auth.test.js                 # Register, login, profile validation, hardening
    ├── catalog.test.js              # List, search, category/origin filter
    ├── cart.test.js                 # Add, update, remove, price calculation
    ├── order.test.js                # Stock decrement, mock payment, order history
    ├── health.test.js               # Server health and DB mode check
    └── e2e/                         # Opaque-box E2E testing suite (Tiers 1-4)
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Express Server & App Config | Modular Express setup with CORS, JSON body parser, error handling | M1 (DONE) | Survey |
| 2 | Dual-Mode MongoDB Connection | Auto-connect to URI or fallback to mongodb-memory-server within 3s | M1 (DONE) | Survey |
| 3 | Mongoose Schemas | Schemas for User, Product, Cart, Order with validation | M1 (DONE) | Survey |
| 4 | User Registration API | Register new user with bcrypt password hashing | M1 (DONE) | Survey |
| 5 | User Login API | Authenticate credentials and return JWT token | M1 (DONE) | Survey |
| 6 | JWT Auth Middleware | Protect routes and extract authenticated user | M1 (DONE) | Survey |
| 7 | Health Check API | `/api/health` returning server status and DB connection mode | M1 (DONE) | Survey |
| 8 | Curated Seed Dataset | 20+ luxury imported beauty products across 4 categories | M2 (DONE) | Survey |
| 9 | Seed Script Command | `npm run seed` command populating catalog in database | M2 (DONE) | Survey |
| 10 | Auto-Seed on Memory Boot | Auto-seed catalog if DB empty when running in-memory | M2 (DONE) | Survey |
| 11 | Product Listing API | `/api/products` with pagination and sorting | M2 (DONE) | Survey |
| 12 | Product Category/Origin Filter | Filter by category, imported origin, and brand | M2 (DONE) | Survey |
| 13 | Product Search API | Keyword search across name, brand, description | M2 (DONE) | Survey |
| 14 | Product Detail API | `/api/products/:id` with stock and specifications | M2 (DONE) | Survey |
| 15 | Cart Management API | Add items, update quantities, delete items, clear cart | M2 (DONE) | Survey |
| 16 | Cart Pricing Engine | Subtotal, 8% tax, free shipping over $50 ($5.99 below) | M2 (DONE) | Survey |
| 17 | Order Creation API | Validate stock, decrement quantity, snapshot items | M2 (DONE) | Survey |
| 18 | Mock Payment Simulation | Simulate card authorization, return mock txn ID | M2 (DONE) | Survey |
| 19 | Order History API | `/api/orders/my-orders` for authenticated customer | M2 (DONE) | Survey |
| 20 | Dark-Mode Glassmorphism Design System | Deep dark background, backdrop-blur, frosted glass cards | M3 (DONE) | Survey |
| 21 | Responsive Glass Navigation Bar | Brand logo, search input, category tabs, pulsing cart badge | M3 (DONE) | Survey |
| 22 | Catalog View UI | Multi-filter sidebar/chips, sorting, product cards | M3 (DONE) | Survey |
| 23 | Product Detail View/Modal | Full description, origin info, stock status, quantity picker | M3 (DONE) | Survey |
| 24 | Slide-Over Cart Drawer | Line-item manager, live totals breakdown, zero-reload updates | M3 (DONE) | Survey |
| 25 | Mock Checkout Workflow | Shipping form, mock card input with demo card autofill | M3 (DONE) | Survey |
| 26 | Order Confirmation Receipt | Order summary, mock transaction ID, cart reset | M3 (DONE) | Survey |
| 27 | Customer Account View | Profile details, order history cards with status tags | M3 (DONE) | Survey |
| 28 | Backend Integration Test Suite | Automated Jest + Supertest verification for `npm test` | M4 (DONE) | Survey |
| 29 | Opaque-Box E2E Testing Suite | Tiers 1-4 requirement-driven opaque-box test runner | E2E Track (DONE) | Survey |
| 30 | Adversarial Hardening (Tier 5) | White-box stress testing, edge-case hardening, audit pass | M4 (DONE) | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Foundation & Data Persistence | Express setup, dual-mode DB fallback, User/Product/Cart/Order schemas, JWT auth & password hashing, health route, hardening | none | DONE |
| M2 | Catalog, Seed Data & Core E-Commerce Services | Seed script (`npm run seed`), 20+ imported beauty items, auto-seed on memory boot, catalog search/filter, cart management & pricing engine, order checkout & mock payment simulation | M1 | DONE |
| M3 | Dark-Mode Glassmorphism Frontend | Responsive SPA, glassmorphism CSS design system, Navbar with live cart badge, Catalog with filters/search, Product detail, Slide-over Cart drawer, Mock Checkout & Receipt, Account view | M1, M2 | DONE |
| M4 | Full-Stack Integration, E2E Test Suite Pass & Adversarial Hardening | Phase 1: 100% pass on E2E test suite (Tiers 1-4) & `npm test`. Phase 2: Adversarial coverage hardening (Tier 5) & forensic audit cleanliness | M1, M2, M3, E2E Track | DONE |
| E2E | E2E Testing Track | Requirement-driven opaque-box test runner and test cases (Tiers 1-4) published via TEST_READY.md | none | DONE |

## Key Milestone 1 Outputs
- `package.json`, `.env.example`, `server.js`, `src/app.js`
- `src/config/db.js` (dual-mode DB fallback with in-memory MongoMemoryServer and 3000ms timeout)
- Models: `src/models/User.js`, `src/models/Product.js`, `src/models/Cart.js`, `src/models/Order.js`
- Middleware: `src/middleware/authMiddleware.js`, `src/middleware/errorMiddleware.js`
- Routes: `src/routes/authRoutes.js`, `src/routes/healthRoutes.js`
- Controllers: `src/controllers/authController.js`
- Tests: `tests/setup.js`, `tests/health.test.js`, `tests/auth.test.js` (26 test assertions passing)
- Gate Result: PASS (Audit CLEAN, Reviewers APPROVE, Challengers APPROVE)

## Key Milestone 2 Outputs
- `src/data/seedProducts.js` (24 curated luxury imported items across 4 categories and 8 origins, embedding all fixture items)
- `src/data/seed.js` (CLI `npm run seed` and programmatic seeding with bcrypt password hashing)
- `src/controllers/productController.js` & `src/routes/productRoutes.js` (catalog search, category/origin filtering, sorting, ReDoS-safe regex)
- `src/services/cartService.js`, `src/controllers/cartController.js`, & `src/routes/cartRoutes.js` (cart management, exact 8% tax and $50 shipping threshold arithmetic)
- `src/services/paymentService.js`, `src/controllers/orderController.js`, & `src/routes/orderRoutes.js` (atomic inventory decrement, compensation rollback, mock card processing and deterministic decline simulation)
- Tests: `tests/catalog.test.js`, `tests/cart.test.js`, `tests/order.test.js` (33 integration tests passing)
- Gate Result: PASS (Audit CLEAN, Reviewers APPROVE, Challengers APPROVE)

## Key Milestone 3 Outputs
- `public/index.html` (Obsidian canvas, ambient glowing background orbs, semantic mounting points, SVG icon sprite)
- `public/css/variables.css`, `public/css/base.css`, `public/css/glassmorphism.css`, `public/css/components.css` (Complete dark glassmorphism design system)
- `public/js/api.js` (REST client wrapper with automatic JWT Bearer injection and standardized responses)
- `public/js/store.js` (Reactive observer state store with auth, catalog, cart, checkout, orders, and mathematical pricing parity)
- `public/js/components/`: `navbar.js`, `catalog.js`, `productDetail.js`, `cartDrawer.js`, `checkoutModal.js`, `orderConfirmation.js`, `accountView.js`, `authModal.js`, `base.js`
- `public/js/app.js` (SPA hash router, toast notification engine, modal keyboard management)
- `public/assets/images/placeholder.svg` (Fallback artwork)
- Gate Result: PASS (Audit CLEAN, Reviewers APPROVE, Challengers APPROVE)

## Key Milestone 4 Outputs
- `tests/concurrency.test.js` (Binary and 5-way stampede race testing on single-unit inventory and multi-item partial decrement rollback compensation)
- `tests/tier5_adversarial.test.js` & `tests/stress/tier5_adversarial.test.js` (Tier 5 white-box stress suite: boundary fuzzing, malformed auth token attacks, payment edge conditions)
- `tests/stress/empirical_challenge.js` (86 empirical challenge assertions, 1,000 Monte-Carlo randomized baskets for client/server pricing parity, card decline stock rollback)
- Full verification execution:
  - `npm test`: 7/7 suites passed, 97/97 tests passed (100%)
  - `npm run test:e2e`: 8/8 suites passed, 56/56 tests passed across Tiers 1-4 (100%)
- Gate Result: PASS (Audit CLEAN, Reviewers APPROVE, Challengers APPROVE)




## Interface Contracts
### M1 ↔ M2 (Backend Foundation ↔ Catalog & E-Commerce Services)
- Database connection helper `connectDB()` exports active Mongoose connection.
- Models:
  - `User`: `{ _id, name, email, password, address: { street, city, state, zip, country } }`
  - `Product`: `{ _id, name, brand, origin, category, price, description, stock, rating, image, specs }`
  - `Cart`: `{ user, items: [{ product: ObjectId, quantity, price }], subtotal, tax, shipping, grandTotal }`
  - `Order`: `{ orderNumber, user, items, shippingAddress, payment: { transactionId, status, method }, subtotal, tax, shipping, grandTotal, status }`
- Middleware: `protect(req, res, next)` validates Bearer JWT and sets `req.user`.

### M2 ↔ M3 (Backend API ↔ Frontend Client)
- REST Endpoints:
  - `POST /api/auth/register` -> `{ user, token }`
  - `POST /api/auth/login` -> `{ user, token }`
  - `GET /api/auth/me` -> `{ user }`
  - `GET /api/products?category=...&origin=...&q=...&sort=...` -> `{ products, count, total }`
  - `GET /api/products/:id` -> `{ product }`
  - `GET /api/cart` -> `{ cart }`
  - `POST /api/cart/items` `{ productId, quantity }` -> `{ cart }`
  - `PUT /api/cart/items/:productId` `{ quantity }` -> `{ cart }`
  - `DELETE /api/cart/items/:productId` -> `{ cart }`
  - `DELETE /api/cart` -> `{ message }`
  - `POST /api/orders/checkout` `{ shippingAddress, paymentDetails }` -> `{ order, transactionId }`
  - `GET /api/orders/my-orders` -> `{ orders }`
  - `GET /api/health` -> `{ status: "ok", database: "connected", mode: "memory" | "external" }`
