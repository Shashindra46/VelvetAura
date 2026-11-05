# Dispatch Log

## 2026-11-04T10:46:59Z

Sender: 4087cf5e-e942-4f91-be24-5cdcd1e6dfc1 (Sentinel)

Build a production-ready full-stack e-commerce web application named VelvetAura for imported beauty products, with a Node.js, Express, and MongoDB backend and a modern dark-mode glassmorphism frontend.

Working directory: g:\VelvetAura
Integrity mode: development

## Requirements

### R1. Backend API and Data Persistence
Build a Node.js and Express backend service backed by MongoDB. Provide RESTful endpoints for:
- User authentication: registration, login, and session/token validation with secure password hashing.
- Product catalog: listing, filtering by category/brand, searching by keyword, and viewing individual product details.
- Cart management: adding items, updating quantities, removing items, and fetching the current cart.
- Orders and checkout: submitting orders, simulating payment authorization/processing, and retrieving user order history.

### R2. Dark-Mode Glassmorphism Frontend
Implement a responsive web interface using a modern dark-mode glassmorphism aesthetic (translucent glass cards, backdrop blur effects, frosted glass styling, and glowing accents). The frontend must provide:
- Navigation bar with branding, search bar, category navigation, cart badge with item count, and auth status.
- Catalog view with product cards showing image, title, imported brand/origin, price, rating, and add-to-cart action.
- Product detail view with full descriptions, specifications, stock status, and quantity selection.
- Interactive cart drawer or page with line-item management and order total calculation.
- Checkout workflow capturing shipping information and mock payment details, followed by an order confirmation screen.
- User account view showing profile details and previous order history.

### R3. Sample Catalog Seed Data
Provide a seed script that populates MongoDB with realistic sample catalog items for imported beauty products (skincare, cosmetics, fragrances, haircare), including names, imported origins/brands, prices, descriptions, stock quantities, and image assets or placeholders.

### R4. Database Environment Support
Support local execution using either a running local MongoDB instance or an automated in-memory MongoDB instance (such as mongodb-memory-server) when an external MongoDB connection is not provided, ensuring seamless setup and testing.

### R5. Automated Verification Test Suite
Implement an automated test suite verifying core backend API endpoints (auth, catalog search/filter, cart operations, order creation, and payment mock) and verifying that the application starts up and functions as expected.

## Acceptance Criteria

### Backend & Database Operations
- [ ] User registration, authentication, and credential validation succeed with properly hashed passwords and authorized access tokens or sessions.
- [ ] Product catalog endpoints return seeded imported beauty items and support filtering by category and search queries.
- [ ] Cart API accurately calculates item subtotals, taxes/shipping, and grand total based on quantity modifications.
- [ ] Checkout API creates an order record in MongoDB, verifies stock, returns a mock payment transaction ID, and marks the order as completed.
- [ ] Order history endpoint returns orders associated with the authenticated user.
- [ ] Application connects successfully using a local MongoDB connection string or falls back to an in-memory MongoDB instance when configured.

### Frontend & User Experience
- [ ] Dark-mode glassmorphism styling is applied consistently across all views (translucent backdrop filters, dark backgrounds, high-contrast typography, and styled interactive elements).
- [ ] Product catalog displays items with filtering controls and responsive layout.
- [ ] Adding products to cart updates the cart badge count and cart item list without requiring a full page refresh.
- [ ] Completing the mock checkout flow creates an order, displays an order confirmation receipt with summary details, and clears the active cart.
- [ ] User account view correctly lists previously placed orders and their statuses.

### Verification Suite
- [ ] An automated test command (e.g., `npm test`) executes and passes all API and integration tests without errors.
- [ ] A seed command (e.g., `npm run seed`) populates the database with imported beauty product records.
