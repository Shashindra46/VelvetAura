# Backend Architecture & System Analysis — VelvetAura

**Author**: `teamwork_explorer_survey_1`  
**Date**: 2026-11-04  
**Workspace**: `g:\VelvetAura`  
**Status**: Complete  

---

## 1. Executive Summary & Workspace Environment Audit

### 1.1 Workspace State
- **Filesystem Status**: Greenfield project. An audit of `g:\VelvetAura` confirms zero pre-existing application files, source code, configuration files, or package definitions outside `.agents/teamwork/`.
- **Target Application**: VelvetAura — a full-stack, production-ready e-commerce platform for imported luxury beauty products (skincare, cosmetics, fragrances, haircare), featuring a Node.js + Express + MongoDB backend and a dark-mode glassmorphism frontend.
- **Key Constraints**:
  - Zero external database dependency required: must run out-of-the-box using either a local/remote MongoDB instance or transparently fall back to an in-memory MongoDB instance (`mongodb-memory-server`).
  - Automated verification suite required: full testing of auth, catalog filtering/search, cart operations, order processing, and payment simulation.
  - Seed dataset required: realistic international luxury beauty items with origins (France, South Korea, Japan, Italy, Sweden, etc.).

---

## 2. Technology Stack & Backend Architectural Layout

### 2.1 Core Backend Stack
| Layer | Technology | Version Recommendation | Justification |
|---|---|---|---|
| Runtime | Node.js | >= 18.x / 20.x LTS | Native Fetch, stable crypto, LTS stability |
| Web Framework | Express.js | ^4.19.2 or ^4.21.0 | Mature, battle-tested, standard ecosystem compatibility |
| ODM | Mongoose | ^8.3.0 | Schema enforcement, validation, indexing, hooks |
| In-Memory DB | mongodb-memory-server | ^9.1.8 | Zero-config fallback when no external MongoDB URI is provided |
| Auth & Crypto | jsonwebtoken + bcryptjs | ^9.0.2 / ^2.4.3 | Stateless JWT tokens + native pure JS bcrypt (no node-gyp build issues on Windows) |
| Validation | express-validator or Joi | ^7.0.0 | Input sanitization, strict parameter checking |
| Security & Utilities | cors, dotenv, morgan | ^2.8.5, ^16.4.5, ^1.10.0 | CORS headers for frontend integration, env configuration, HTTP request logging |
| Testing | Jest + Supertest | ^29.7.0 / ^6.3.4 | Comprehensive assertions, HTTP API testing, in-memory lifecycle hooks |

### 2.2 Recommended Directory Structure
```
g:\VelvetAura\
├── .env.example                     # Environment template
├── package.json                     # Root package definition & scripts
├── server.js                        # HTTP listener entrypoint & graceful shutdown
├── src/
│   ├── app.js                       # Express app configuration & middleware pipeline
│   ├── config/
│   │   ├── db.js                    # Dual-mode database connection manager
│   │   └── env.js                   # Typed environment loader & default fallbacks
│   ├── models/
│   │   ├── User.js                  # User schema with bcrypt password hashing
│   │   ├── Product.js               # Beauty catalog schema with text indexes
│   │   ├── Cart.js                  # Persistent cart schema with computed totals
│   │   └── Order.js                 # Order schema with shipping, items & payment receipt
│   ├── controllers/
│   │   ├── authController.js        # Register, login, session check, profile
│   │   ├── productController.js     # Catalog search, filtering, detail retrieval
│   │   ├── cartController.js        # Add, update quantity, remove, clear cart
│   │   ├── orderController.js       # Checkout, order creation, order history
│   │   └── healthController.js      # System health and DB readiness probe
│   ├── routes/
│   │   ├── authRoutes.js            # /api/auth
│   │   ├── productRoutes.js         # /api/products
│   │   ├── cartRoutes.js            # /api/cart
│   │   ├── orderRoutes.js           # /api/orders
│   │   └── healthRoutes.js          # /api/health
│   ├── middleware/
│   │   ├── authMiddleware.js        # JWT verification & user attachment (`protect`, `optionalAuth`)
│   │   ├── errorMiddleware.js       # Centralized 404 & 500 error handler
│   │   └── validateMiddleware.js    # Request body and query validation helpers
│   ├── services/
│   │   ├── paymentService.js        # Mock payment gateway simulation
│   │   └── pricingService.js        # Subtotal, shipping ($0 over $50, else $5.99), tax (8%)
│   ├── data/
│   │   ├── seedProducts.js          # Realistic imported beauty catalog dataset
│   │   └── seeder.js                # Standalone & programmatic seeder utility
│   └── utils/
│       └── logger.js                # Formatted console logger
├── client/                          # Frontend Dark-Mode Glassmorphism SPA
│   ├── index.html
│   ├── src/
│   │   ├── main.jsx (or main.js)
│   │   ├── App.jsx
│   │   ├── styles/                  # Glassmorphism CSS variables and backdrop filters
│   │   ├── components/              # Navbar, ProductCard, CartDrawer, CheckoutModal, etc.
│   │   └── services/api.js          # Fetch client communicating with /api
├── tests/
│   ├── setup.js                     # Global test setup (MongoMemoryServer startup/teardown)
│   ├── auth.test.js                 # User registration, login, auth protection
│   ├── catalog.test.js              # Product listing, filtering, search, detail
│   ├── cart.test.js                 # Cart line-item operations & calculations
│   └── order.test.js                # Checkout flow, stock reduction, payment mock
└── README.md
```

---

## 3. Database Connection & Dual-Mode Fallback Strategy

### 3.1 Requirement Analysis
Requirement R4 mandates seamless local execution whether or not the developer has a MongoDB server running locally or externally. The application must:
1. Attempt connection to `process.env.MONGODB_URI` if provided.
2. If `MONGODB_URI` is unset, invalid, or fails to connect, gracefully fall back to an in-memory MongoDB instance via `mongodb-memory-server`.
3. In in-memory mode, automatically seed the database on initial startup so the catalog is immediately populated without requiring manual intervention.
4. Support clean shutdown (`SIGINT`, `SIGTERM`) stopping the in-memory daemon.

### 3.2 Dual-Mode Connection Logic (`src/config/db.js`)
```javascript
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { seedInitialData } from '../data/seeder.js';

let mongod = null;

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  // Mode 1: External MongoDB URI explicitly configured
  if (uri && uri.trim() !== '') {
    try {
      console.log(`[Database] Attempting connection to external MongoDB: ${uri.replace(/:\/\/.*@/, '://***:***@')}`);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('[Database] Connected successfully to external MongoDB');
      return;
    } catch (err) {
      console.warn(`[Database] External MongoDB connection failed (${err.message}). Falling back to in-memory MongoDB...`);
    }
  } else {
    console.log('[Database] No MONGODB_URI provided. Initializing in-memory MongoDB instance...');
  }

  // Mode 2: In-Memory Fallback
  try {
    mongod = await MongoMemoryServer.create({
      instance: {
        dbName: 'velvetaura_dev',
      },
    });
    const memoryUri = mongod.getUri();
    await mongoose.connect(memoryUri);
    console.log(`[Database] In-memory MongoDB running at: ${memoryUri}`);

    // Auto-seed in-memory database on startup if empty
    await seedInitialData({ silent: true });
    console.log('[Database] In-memory database auto-seeded with sample imported beauty catalog.');
  } catch (error) {
    console.error('[Database] Critical error starting in-memory database:', error);
    throw error;
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
  console.log('[Database] Disconnected and cleaned up.');
}
```

### 3.3 Test Environment Handling (`tests/setup.js`)
For automated unit and integration tests (Jest / Supertest), each test run:
1. Starts a dedicated `MongoMemoryServer` instance before tests execute (`beforeAll`).
2. Clears collections between test suites (`afterEach`).
3. Disconnects and stops the in-memory server after all tests conclude (`afterAll`).
This ensures 100% test isolation and zero pollution between test runs.

---

## 4. Data Models & Schemas

### 4.1 User Model (`src/models/User.js`)
- **Fields**:
  - `name`: `{ type: String, required: true, trim: true }`
  - `email`: `{ type: String, required: true, unique: true, lowercase: true, trim: true, index: true }`
  - `password`: `{ type: String, required: true, minlength: 6, select: false }`
  - `role`: `{ type: String, enum: ['customer', 'admin'], default: 'customer' }`
  - `shippingAddress`:
    - `fullName`: String
    - `addressLine1`: String
    - `addressLine2`: String
    - `city`: String
    - `state`: String
    - `postalCode`: String
    - `country`: String
  - `timestamps`: `true`
- **Mongoose Hooks & Methods**:
  - `pre('save')`: Hash password with `bcryptjs.hash(password, 10)` if modified.
  - `methods.matchPassword(enteredPassword)`: Return `bcryptjs.compare(enteredPassword, this.password)`.

### 4.2 Product Model (`src/models/Product.js`)
- **Fields**:
  - `name`: `{ type: String, required: true, trim: true, index: true }`
  - `brand`: `{ type: String, required: true, trim: true, index: true }`
  - `origin`: `{ type: String, required: true, trim: true, index: true }` (e.g., 'South Korea', 'Japan', 'France', 'Italy', 'Sweden', 'United Kingdom')
  - `category`: `{ type: String, required: true, enum: ['skincare', 'cosmetics', 'fragrances', 'haircare'], index: true }`
  - `subcategory`: `{ type: String, trim: true }` (e.g., 'serums', 'sunscreen', 'lip-tint', 'eau-de-parfum')
  - `description`: `{ type: String, required: true }`
  - `price`: `{ type: Number, required: true, min: 0 }`
  - `originalPrice`: `{ type: Number, min: 0 }` (optional original price for strikethrough/discount badges)
  - `rating`: `{ type: Number, default: 4.5, min: 0, max: 5 }`
  - `numReviews`: `{ type: Number, default: 0 }`
  - `stock`: `{ type: Number, required: true, default: 20, min: 0 }`
  - `images`: `[{ type: String }]` (URLs or SVG placeholders)
  - `isFeatured`: `{ type: Boolean, default: false, index: true }`
  - `tags`: `[{ type: String }]` (e.g., 'bestseller', 'award-winner', 'vegan', 'gentle-formula')
  - `specifications`:
    - `volume`: String (e.g., '50ml / 1.69 fl. oz.')
    - `skinType`: String (e.g., 'All skin types, Sensitive')
    - `keyIngredients`: `[{ type: String }]`
    - `scentProfile`: String
  - `timestamps`: `true`
- **Indexes**:
  - Text search index: `Product.index({ name: 'text', brand: 'text', description: 'text', tags: 'text' })`

### 4.3 Cart Model (`src/models/Cart.js`)
- **Fields**:
  - `user`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, unique: true, sparse: true }`
  - `sessionId`: `{ type: String, index: true, sparse: true }` (for guest/unauthenticated carts)
  - `items`: `[
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, required: true, min: 1, default: 1 },
        priceSnapshot: { type: Number, required: true }
      }
    ]`
  - `timestamps`: `true`
- **Computed Virtuals / Helpers**:
  - Dynamic recalculation helper ensures current product prices and stock availability are validated when fetching the cart.
  - Calculation formula:
    - `subtotal = items.reduce((acc, item) => acc + item.quantity * item.price, 0)`
    - `shipping = subtotal >= 50.00 ? 0.00 : 5.99` (Free luxury shipping over $50)
    - `estimatedTax = Math.round(subtotal * 0.08 * 100) / 100` (8% standard tax)
    - `grandTotal = subtotal + shipping + estimatedTax`

### 4.4 Order Model (`src/models/Order.js`)
- **Fields**:
  - `orderNumber`: `{ type: String, required: true, unique: true, index: true }` (e.g. `VA-2026-94812`)
  - `user`: `{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }`
  - `items`: `[
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: { type: String, required: true },
        brand: { type: String, required: true },
        origin: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true, min: 1 },
        image: { type: String }
      }
    ]`
  - `shippingAddress`:
    - `fullName`: `{ type: String, required: true }`
    - `addressLine1`: `{ type: String, required: true }`
    - `addressLine2`: String
    - `city`: `{ type: String, required: true }`
    - `state`: `{ type: String, required: true }`
    - `postalCode`: `{ type: String, required: true }`
    - `country`: `{ type: String, required: true }`
  - `pricing`:
    - `subtotal`: `{ type: Number, required: true }`
    - `shipping`: `{ type: Number, required: true }`
    - `tax`: `{ type: Number, required: true }`
    - `total`: `{ type: Number, required: true }`
  - `paymentResult`:
    - `transactionId`: `{ type: String, required: true }`
    - `paymentMethod`: `{ type: String, default: 'credit_card' }`
    - `status`: `{ type: String, enum: ['succeeded', 'failed', 'pending'], default: 'succeeded' }`
    - `cardLast4`: `{ type: String, default: '4242' }`
    - `paidAt`: `{ type: Date, default: Date.now }`
  - `orderStatus`: `{ type: String, enum: ['pending', 'processing', 'completed', 'shipped', 'cancelled'], default: 'completed' }`
  - `timestamps`: `true`

---

## 5. RESTful API Specification & Contracts

All endpoints return JSON and use standard HTTP response codes (`200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `404 Not Found`, `409 Conflict`, `500 Internal Server Error`). Standard envelope format:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```
Errors return:
```json
{
  "success": false,
  "error": "Descriptive error message",
  "details": [ ... ]
}
```

### 5.1 Authentication API (`/api/auth`)
| Method | Endpoint | Access | Request Body | Response (200/201) | Description |
|---|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | `{ name, email, password }` | `{ success: true, token, user: { id, name, email, role } }` | Register new user account; validates email uniqueness and hashes password. |
| `POST` | `/api/auth/login` | Public | `{ email, password }` | `{ success: true, token, user: { id, name, email, role } }` | Authenticate credentials; returns signed JWT token (expires in 7 days). |
| `GET` | `/api/auth/me` | Protected | None (Bearer token) | `{ success: true, user: { id, name, email, role, shippingAddress } }` | Validate token and retrieve active user profile. |
| `PUT` | `/api/auth/profile` | Protected | `{ name, shippingAddress }` | `{ success: true, user }` | Update user profile and default shipping address. |

### 5.2 Product Catalog API (`/api/products`)
| Method | Endpoint | Access | Query Parameters | Response | Description |
|---|---|---|---|---|---|
| `GET` | `/api/products` | Public | `category`, `brand`, `origin`, `search`, `minPrice`, `maxPrice`, `sort`, `page`, `limit` | `{ success: true, count, totalPages, currentPage, products: [...] }` | Fetch catalog with multi-facet filtering, text search, price filtering, sorting, and pagination. |
| `GET` | `/api/products/:id` | Public | None | `{ success: true, product: { ... } }` | Retrieve full product details, specifications, and stock status. |
| `GET` | `/api/products/meta/categories` | Public | None | `{ success: true, categories: [{ name, count, image }] }` | Retrieve list of available categories and product counts for navigation. |
| `GET` | `/api/products/meta/featured` | Public | None | `{ success: true, products: [...] }` | Retrieve top featured and curated beauty products for hero banner/carousel. |

### 5.3 Cart API (`/api/cart`)
| Method | Endpoint | Access | Request Body | Response | Description |
|---|---|---|---|---|---|
| `GET` | `/api/cart` | Protected / Session | None | `{ success: true, cart: { items, subtotal, shipping, tax, total, itemCount } }` | Fetch current active cart with populated product records and calculated totals. |
| `POST` | `/api/cart/items` | Protected / Session | `{ productId, quantity }` | `{ success: true, cart: { ... } }` | Add item or increment quantity. Validates product existence and stock limit. |
| `PUT` | `/api/cart/items/:productId` | Protected / Session | `{ quantity }` | `{ success: true, cart: { ... } }` | Update item quantity. If `quantity === 0`, removes item. Checks stock. |
| `DELETE` | `/api/cart/items/:productId` | Protected / Session | None | `{ success: true, cart: { ... } }` | Remove specific product line item from the cart. |
| `DELETE` | `/api/cart` | Protected / Session | None | `{ success: true, message: "Cart cleared", cart: { items: [], total: 0 } }` | Remove all items from active cart. |

### 5.4 Orders & Checkout API (`/api/orders`)
| Method | Endpoint | Access | Request Body | Response | Description |
|---|---|---|---|---|---|
| `POST` | `/api/orders/checkout` | Protected | `{ shippingAddress, paymentMethod, paymentDetails }` | `{ success: true, order: { orderNumber, items, pricing, paymentResult, status } }` | Execute checkout: verifies stock, processes mock payment, creates order, decrements stock, and empties cart. |
| `GET` | `/api/orders` | Protected | None | `{ success: true, count, orders: [...] }` | Retrieve authenticated user's order history, ordered by createdAt descending. |
| `GET` | `/api/orders/:id` | Protected | None | `{ success: true, order: { ... } }` | Retrieve detailed order receipt by ID (verifies ownership). |

### 5.5 System & Health API (`/api/health`)
| Method | Endpoint | Access | Response | Description |
|---|---|---|---|---|
| `GET` | `/api/health` | Public | `{ status: "ok", db: { status: "connected", mode: "in-memory"|"external" }, uptime, timestamp }` | Operational readiness probe. |

---

## 6. Business Logic & Processing Workflows

### 6.1 Authentication & Authorization
- **Password Hashing**: 10 rounds of salt using `bcryptjs`. Passwords must be at least 6 characters.
- **Token Signing**: `jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'velvetaura_secret_fallback', { expiresIn: '7d' })`.
- **Protection Middleware**: Extracts token from `Authorization: Bearer <token>`. Validates via `jwt.verify`. Rejects missing/expired tokens with `401 Unauthorized`. Populates `req.user` without the `password` field.

### 6.2 Cart Mathematical Logic
- **Subtotal**: Sum of `quantity * currentPrice` across all line items.
- **Free Shipping Threshold**:
  - If `subtotal >= 50.00`: `shipping = 0.00` ("Complimentary Luxury Shipping").
  - Else: `shipping = 5.99` standard flat rate.
- **Estimated Tax**: `subtotal * 0.08` (rounded to 2 decimal places).
- **Grand Total**: `subtotal + shipping + estimatedTax`.

### 6.3 Payment Simulation & Checkout Workflow
The checkout process in `orderController.js` and `paymentService.js` executes the following sequence:
1. **Validate Cart**: Ensure cart has at least 1 item.
2. **Stock Verification**: For every item in the cart:
   - Find product in MongoDB.
   - If `product.stock < item.quantity`, abort with `400 Bad Request` ("Insufficient stock for [Product Name]. Available: [stock]").
3. **Price Lock**: Freeze snapshot prices into the order items.
4. **Mock Payment Authorization**:
   - `paymentService.processPayment({ amount, paymentMethod, paymentDetails })`.
   - Generates simulated transaction ID: `txn_va_` + hex timestamp + random bytes (e.g. `txn_va_7a9f821b0e`).
   - If payment details indicate deliberate failure (e.g., test card ending in `0000`), simulates card declined (`400 Payment Failed`).
   - Standard mock cards (e.g., `4242...`) succeed automatically, returning `{ status: 'succeeded', transactionId, cardLast4: '4242' }`.
5. **Stock Deduction**:
   - For each item, execute `Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } })`.
6. **Order Creation**:
   - Generate unique order number `VA-` + Date.now().toString(36).toUpperCase() + random 4-digit code (e.g., `VA-LX8Q2K-9241`).
   - Save `Order` document with status `'completed'`.
7. **Cart Cleanup**:
   - Empty user's cart: `Cart.findOneAndUpdate({ user: req.user._id }, { items: [] })`.
8. **Return Receipt**: Return created order with full receipt metadata.

---

## 7. Sample Catalog Seed Data Specification

### 7.1 Category & Origin Distribution (Minimum 16 Curated Products)
To provide an authentic luxury imported beauty experience, the seed catalog covers 4 primary categories across diverse global beauty capitals:

#### 1. Skincare (K-Beauty, J-Beauty, French Dermocosmetics)
- **Sulwhasoo First Care Activating Serum VI** (South Korea) — $89.00 — Ginseng-infused prestige activating serum.
- **Beauty of Joseon Relief Sun: Rice + Probiotics SPF50+** (South Korea) — $18.00 — Organic chemical sunscreen with rice bran water.
- **COSRX Advanced Snail 96 Mucin Power Essence** (South Korea) — $25.00 — Repairing lightweight snail secretion filtrate.
- **SK-II Facial Treatment Essence** (Japan) — $199.00 — Iconic Pitera-rich miracle treatment essence.
- **Hada Labo Gokujyun Premium Hyaluronic Acid Lotion** (Japan) — $16.50 — 7-molecular-weight intensive hydrating lotion.
- **La Roche-Posay Cicaplast Baume B5+** (France) — $19.00 — Soothing multi-purpose barrier repair balm with madecassoside.

#### 2. Cosmetics (K-Beauty & European Luxury)
- **Rom&nd Juicy Lasting Tint (#25 Bare Grape)** (South Korea) — $13.50 — High-gloss cool-toned mlbb syrup lip tint.
- **CLIO Kill Cover The New Founwear Cushion** (South Korea) — $32.00 — 72-hour semi-matte velvety cushion foundation.
- **Shiseido Synchro Skin Radiant Lifting Foundation** (Japan) — $48.00 — Light-adjusting technology radiant liquid foundation.
- **Chanel Les Beiges Healthy Glow Bronzing Cream** (France) — $58.00 — Cult cream-gel lightweight bronzer.

#### 3. Fragrances (French Niche & Nordic Minimalism)
- **Byredo Gypsy Water Eau de Parfum** (Sweden) — $225.00 — Bergamot, lemon, pepper, pine needles, amber, sandalwood.
- **Diptyque Philosykos Eau de Toilette** (France) — $175.00 — Sun-drenched fig leaf, wood sap, white cedar.
- **Maison Margiela REPLICA Jazz Club** (France) — $160.00 — Pink pepper, rum absolute, tobacco leaf, vanilla bean.
- **Le Labo Santal 33 Eau de Parfum** (United States / Grasse Formulation) — $230.00 — Cardamom, iris, violet, Australian sandalwood.

#### 4. Haircare (Japanese Salon & French Luxury)
- **Shiseido Fino Premium Touch Hair Mask** (Japan) — $14.50 — Royal jelly and trehalose deep conditioning hair mask.
- **Kérastase Elixir Ultime L'Huile Originale Hair Oil** (France) — $54.00 — Camellia and argan leave-in hair beautifying oil.
- **Olaplex No. 3 Hair Perfector** (United States) — $30.00 — Patented bond-building reparative treatment.
- **Tsubaki Premium Moist Treatment Mask** (Japan) — $15.00 — Fast-penetrating camellia seed oil gloss treatment.

### 7.2 Seeder Execution
- Executable via npm script: `npm run seed`
- Also auto-invoked programmatically when `connectDB()` detects zero products in an in-memory database, guaranteeing that the application is immediately interactive on first launch.

---

## 8. Automated Verification & Test Strategy

### 8.1 Test Runner & Framework
- **Test Runner**: Jest (`jest --runInBand --detectOpenHandles --forceExit`)
- **HTTP Assertions**: Supertest (`supertest(app)`)
- **DB Mocking**: `mongodb-memory-server` in `tests/setup.js`

### 8.2 Test Suite Architecture
1. **`auth.test.js`**:
   - Register a new user with valid data -> Expect `201 Created`, token returned, password omitted.
   - Attempt registration with duplicate email -> Expect `400 / 409 Conflict`.
   - Login with valid credentials -> Expect `200 OK`, valid JWT token.
   - Login with invalid password -> Expect `401 Unauthorized`.
   - Query `/api/auth/me` with Bearer token -> Expect `200 OK` and user details.
   - Query `/api/auth/me` without token -> Expect `401 Unauthorized`.
2. **`catalog.test.js`**:
   - Seed products into test in-memory DB.
   - `GET /api/products` -> Expect `200 OK`, array of products.
   - `GET /api/products?category=skincare` -> Expect all returned products to have `category: 'skincare'`.
   - `GET /api/products?search=Ginseng` -> Expect matching search results.
   - `GET /api/products?minPrice=50&maxPrice=100` -> Expect products within price range.
   - `GET /api/products/:validId` -> Expect `200 OK` with full specs.
   - `GET /api/products/:invalidId` -> Expect `404 Not Found`.
3. **`cart.test.js`**:
   - Authenticate test user and fetch cart -> Expect empty items array and 0 total.
   - Add product to cart with quantity 2 -> Expect `200 OK`, item added, subtotal calculated.
   - Update quantity to 3 -> Expect updated quantity and recalculated total.
   - Verify free shipping calculation (subtotal >= $50 has shipping = $0; < $50 has shipping = $5.99).
   - Remove item from cart -> Expect item removed.
   - Clear cart -> Expect empty cart.
4. **`order.test.js`**:
   - Add product to cart.
   - Execute checkout with shipping address and mock payment card -> Expect `201 Created`, order created with orderNumber and transactionId.
   - Verify product stock was decremented in database by purchased quantity.
   - Verify cart was cleared after checkout.
   - `GET /api/orders` -> Expect order list containing the newly placed order.
   - Access order without auth -> Expect `401 Unauthorized`.
5. **`health.test.js`**:
   - `GET /api/health` -> Expect `200 OK` with status "ok" and database connected.

---

## 9. Recommendations & Implementation Roadmap

### 9.1 Recommended Milestones for Orchestrator
1. **Milestone 1: Backend Foundation, Data Models & DB Fallback**
   - Setup `package.json`, environment configurations, and Express app structure.
   - Implement `src/config/db.js` with dual-mode connection and automatic `mongodb-memory-server` fallback.
   - Implement Mongoose models (`User`, `Product`, `Cart`, `Order`).
   - Implement seed script (`src/data/seeder.js`) with 16+ imported luxury beauty items.
2. **Milestone 2: REST API Controllers, Security & Business Logic**
   - Implement `authController` and JWT auth middleware.
   - Implement `productController` with multi-filter query builder and text search.
   - Implement `cartController` with pricing calculations.
   - Implement `orderController` with payment simulation and stock decrementing.
   - Implement centralized error handling middleware.
3. **Milestone 3: Automated Test Suite Execution**
   - Configure Jest and Supertest.
   - Write comprehensive test suites for auth, catalog, cart, orders, and health.
   - Verify test suite passes 100% using `npm test`.
4. **Milestone 4: Dark-Mode Glassmorphism Frontend Integration**
   - Build responsive frontend SPA with translucent glass cards, backdrop-filter blur, luminous glowing accents, and intuitive e-commerce shopping experience.
5. **Milestone 5: End-to-End Verification & Production Readiness**
   - Full integration test, seed verification, and production build checks.
