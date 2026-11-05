## 2026-11-04T12:32:21Z
You are teamwork_explorer_m3_2. Your working directory is `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m3_2\`.

Your objective: Investigate and produce a detailed blueprint for the VelvetAura Client State Management (`store.js`), API Client Wrapper (`api.js`), and Real-Time Interaction Lifecycle.

Key inputs to read first:
1. `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md` (Mandatory - read user requirements)
2. `g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md` (Master architecture and interface contracts M2 <-> M3)
3. Backend route and controller implementations: `src/routes/`, `src/controllers/`, `src/services/` to know exact endpoints and JSON payloads.
4. E2E test client in `tests/e2e/helpers/testClient.js` and fixtures in `tests/e2e/helpers/fixtures.js` to align data contracts.

Specifically investigate and design:
1. `public/js/api.js`:
   - Unified API service wrapping `fetch` with base URL `/api`.
   - Automatic injection of JWT Bearer token from localStorage/store into `Authorization` header.
   - Standardized error handling extracting `data.error` or `data.message` and returning structured responses `{ success, data, error }`.
   - API methods for:
     - Auth: `register(userData)`, `login(credentials)`, `getMe()`
     - Products: `getProducts(params)`, `getProduct(id)`, `getCategories()`
     - Cart: `getCart()`, `addToCart(productId, quantity)`, `updateCartItem(productId, quantity)`, `removeCartItem(productId)`, `clearCart()`
     - Orders: `checkout(payload)`, `getMyOrders()`, `getOrder(id)`
     - Health: `getHealth()`
2. `public/js/store.js`:
   - Reactive state manager with subscribe/notify observer pattern.
   - State slices:
     - `auth`: `{ user, token, isAuthenticated }` (persisted in `localStorage` under `velvetaura_auth`)
     - `catalog`: `{ products: [], categories: [], origins: [], activeCategory: 'all', activeOrigin: 'all', searchQuery: '', sort: 'featured', page: 1, total: 0, loading: false }`
     - `cart`: `{ items: [], subtotal: 0, tax: 0, shipping: 0, grandTotal: 0, itemCount: 0, isOpen: false, loading: false }`
     - `activeProduct`: `{ product: null, isOpen: false }`
     - `checkout`: `{ isSubmitting: false, lastOrder: null, transactionId: null, error: null }`
     - `orders`: `{ list: [], loading: false }`
     - `ui`: `{ toasts: [] }`
   - Store actions:
     - `init()`: Load saved auth, fetch categories, fetch initial catalog, fetch active cart if logged in.
     - Zero-refresh reactive updates: When adding to cart, update badge count immediately with bounce/glow animation.
     - Cart drawer toggle and line item quantity modification without reloading the page.
     - Auth lifecycle: login, register, logout, auto-sync cart upon login.
3. Toast Notification Engine:
   - Floating glass toasts for success ("Added to bag", "Order #VA-XXXX confirmed"), error ("Insufficient stock", "Card declined"), and info.

Do NOT write code in `public/` directly. Write your complete analysis and design specifications to `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m3_2\analysis.md` and your 5-component handoff report to `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m3_2\handoff.md`. Notify the parent when complete.
