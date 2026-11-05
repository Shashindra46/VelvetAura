# Technical Specification & Requirement Mining Report: VelvetAura

**Author**: `teamwork_spec_miner_survey_3`  
**Workspace**: `g:\VelvetAura`  
**Target Application**: VelvetAura — Production-ready Full-stack Imported Beauty E-Commerce Application  
**Authoritative Reference**: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md`  
**Date**: 2026-11-04  

---

## 1. Executive Summary & Specification Scope

VelvetAura is a full-stack e-commerce web platform specializing in imported, luxury beauty products across four core categories: **Skincare, Cosmetics, Fragrances, and Haircare**. The system architecture comprises:
1. **Backend**: Node.js and Express REST API service with JSON serialization, robust error handling, JWT/token-based session management, and password hashing (bcrypt).
2. **Database & Persistence**: MongoDB ODM (Mongoose) backing four core domain entities: `User`, `Product`, `Cart`, and `Order`.
3. **Database Environment Support**: Dual-mode database connectivity supporting local MongoDB instances (`mongodb://localhost:27017/velvetaura`) with zero-configuration fallback to an in-memory MongoDB instance (`mongodb-memory-server`) if external connection fails or in automated test environments.
4. **Seed Catalog Taxonomy**: Realistic imported beauty products from premier global beauty capitals (South Korea, France, Japan, Italy, Sweden, United Kingdom, Switzerland, USA).
5. **Frontend**: Dark-mode glassmorphism user interface with translucent frosted glass cards, `backdrop-filter: blur()`, soft neon/glow accents, responsive layout, real-time cart state synchronization, and mock checkout flow.
6. **Automated Verification Test Suite**: Comprehensive testing suite executed via `npm test` verifying authentication, catalog search/filter, cart line-item calculations, order creation, payment simulation, and database fallback.

---

## 2. Formal Data Models & Schemas

### 2.1 User Model (`User`)

Represents authenticated customers and administrators.

| Field Name | Type | Required | Constraints & Validation | Default | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto-generated MongoDB primary key | Generated | Unique user identifier |
| `name` | `String` | Yes | Trimmed, min: 2 chars, max: 60 chars | None | Full display name of the user |
| `email` | `String` | Yes | Unique index, lowercase, trimmed, RFC 5322 regex validation | None | Login identifier & notification target |
| `password` | `String` | Yes | Min length: 6 chars, hashed via bcrypt (salt rounds: 10), hidden from queries (`select: false`) | None | Hashed user credential |
| `role` | `String` | Yes | Enum: `['customer', 'admin']` | `'customer'` | Authorization access level |
| `shippingAddress` | `Object` | No | Nested address schema (see sub-table below) | `{}` | Saved default shipping destination |
| `createdAt` | `Date` | Yes | Mongoose timestamps | Current Date | Record creation timestamp |
| `updatedAt` | `Date` | Yes | Mongoose timestamps | Current Date | Record modification timestamp |

#### Subdocument: `shippingAddress`
- `fullName`: `String`, optional (defaults to `user.name` if blank)
- `addressLine1`: `String`, optional
- `addressLine2`: `String`, optional
- `city`: `String`, optional
- `state`: `String`, optional
- `postalCode`: `String`, optional
- `country`: `String`, optional
- `phone`: `String`, optional

#### Hooks & Methods
- `pre('save')`: Hashes `password` using bcrypt before saving if modified.
- `comparePassword(candidatePassword)`: Instance method returning Promise boolean via `bcrypt.compare`.
- `toJSON()`: Strips `password` field from serialized output.

---

### 2.2 Product Model (`Product`)

Represents imported beauty catalog items.

| Field Name | Type | Required | Constraints & Validation | Default | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto-generated | Generated | Unique product identifier |
| `name` | `String` | Yes | Trimmed, min: 3 chars, max: 150 chars | None | Product title / commercial name |
| `brand` | `String` | Yes | Trimmed, indexed | None | Luxury/Artisanal brand name (e.g., Byredo, Sulwhasoo) |
| `origin` | `String` | Yes | Trimmed, country of manufacture | None | Imported origin country (e.g., South Korea, France, Japan) |
| `category` | `String` | Yes | Enum: `['skincare', 'cosmetics', 'fragrances', 'haircare']`, indexed | None | Top-level catalog category |
| `subcategory` | `String` | No | Trimmed (e.g., "Serum", "Eau de Parfum", "Face Oil") | None | Fine-grained classification |
| `description` | `String` | Yes | Min: 10 chars, max: 2000 chars | None | Comprehensive marketing & formula description |
| `price` | `Number` | Yes | Min: 0.01, rounded to 2 decimal places | None | Retail price in USD |
| `currency` | `String` | Yes | ISO 4217 currency code | `'USD'` | Transaction currency |
| `stock` | `Number` | Yes | Integer, min: 0 | 0 | Available inventory count |
| `volume` | `String` | No | E.g. "50 ml / 1.7 fl oz", "100 ml", "30 g" | None | Physical unit size or net weight |
| `rating` | `Number` | Yes | Range: 0.0 – 5.0 | 4.8 | Aggregated customer satisfaction score |
| `numReviews` | `Number` | Yes | Integer, min: 0 | 0 | Count of customer reviews |
| `images` | `[String]` | Yes | Array of valid URIs / asset paths, min 1 item | None | Hero and gallery product imagery |
| `featured` | `Boolean`| Yes | Boolean flag | `false` | Highlighted on home page hero carousel |
| `tags` | `[String]` | No | Array of strings (e.g., "clean beauty", "vegan", "award-winner") | `[]` | Search and badge tags |
| `createdAt` | `Date` | Yes | Mongoose timestamps | Current Date | Creation timestamp |
| `updatedAt` | `Date` | Yes | Mongoose timestamps | Current Date | Modification timestamp |

#### Indexes
- Compound text index: `{ name: 'text', brand: 'text', description: 'text', origin: 'text' }`
- Single field indexes: `{ category: 1 }`, `{ brand: 1 }`, `{ price: 1 }`, `{ featured: 1 }`

---

### 2.3 Cart Model (`Cart`)

Represents a user's persistent active shopping basket.

| Field Name | Type | Required | Constraints & Validation | Default | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto-generated | Generated | Unique cart identifier |
| `user` | `ObjectId` | Yes | Ref: `'User'`, unique index | None | Owner user reference |
| `items` | `[CartItem]` | Yes | Array of subdocuments (see below) | `[]` | Line items added to cart |
| `subtotal` | `Number` | Yes | Min: 0.00, 2 decimals | `0.00` | Sum of `(item.price * item.quantity)` |
| `tax` | `Number` | Yes | Min: 0.00, 2 decimals (8% standard estimate) | `0.00` | Estimated sales tax |
| `shipping` | `Number` | Yes | Min: 0.00 (Free if subtotal >= $100, else $10 flat) | `0.00` | Calculated shipping fee |
| `grandTotal` | `Number` | Yes | Min: 0.00, `subtotal + tax + shipping` | `0.00` | Total payable amount |
| `itemCount` | `Number` | Yes | Integer, min: 0, sum of item quantities | `0` | Total units in basket (cart badge count) |
| `updatedAt` | `Date` | Yes | Mongoose timestamps | Current Date | Last modified timestamp |

#### Subdocument: `CartItem`
- `product`: `ObjectId`, ref: `'Product'`, required
- `name`: `String`, required (denormalized snapshot)
- `brand`: `String`, required (denormalized snapshot)
- `price`: `Number`, required, unit price in USD
- `image`: `String`, required
- `quantity`: `Number`, required, integer, min: 1, max: 99

#### Recalculation Middleware
- Pre-save middleware automatically calculates `subtotal`, `tax = Number((subtotal * 0.08).toFixed(2))`, `shipping = subtotal >= 100 || subtotal === 0 ? 0 : 10`, `grandTotal = Number((subtotal + tax + shipping).toFixed(2))`, and `itemCount = items.reduce((acc, i) => acc + i.quantity, 0)`.

---

### 2.4 Order Model (`Order`)

Represents finalized checkout orders with mock payment records.

| Field Name | Type | Required | Constraints & Validation | Default | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto-generated | Generated | Unique order identifier |
| `orderNumber` | `String` | Yes | Unique index, format: `VA-YYYYMMDD-XXXX` | Generated | Human-readable tracking number |
| `user` | `ObjectId` | Yes | Ref: `'User'`, indexed | None | Placing user reference |
| `orderItems` | `[OrderItem]` | Yes | Min: 1 item | None | Frozen snapshot of purchased products |
| `shippingAddress` | `Object` | Yes | Validated address schema (fullName, addressLine1, city, state, postalCode, country, phone) | None | Destination shipping address |
| `paymentDetails` | `Object` | Yes | Payment simulation metadata | None | Payment authorization details |
| `pricing` | `Object` | Yes | Subtotal, tax, shipping, grandTotal | None | Price breakdown at transaction time |
| `orderStatus` | `String` | Yes | Enum: `['processing', 'confirmed', 'shipped', 'delivered', 'cancelled']` | `'confirmed'` | Fulfillment tracking status |
| `createdAt` | `Date` | Yes | Mongoose timestamps | Current Date | Order placement timestamp |
| `updatedAt` | `Date` | Yes | Mongoose timestamps | Current Date | Order modification timestamp |

#### Subdocument: `OrderItem`
- `product`: `ObjectId`, ref: `'Product'`, required
- `name`: `String`, required
- `brand`: `String`, required
- `origin`: `String`, required
- `price`: `Number`, required (unit price at purchase)
- `quantity`: `Number`, required, integer min: 1
- `image`: `String`, required

#### Subdocument: `paymentDetails`
- `method`: `String`, default `'mock_credit_card'`
- `transactionId`: `String`, required (e.g., `TXN_MOCK_1730717400_9482`)
- `status`: `String`, enum: `['captured', 'authorized', 'failed']`, default `'captured'`
- `paidAt`: `Date`, default `Date.now`
- `cardLast4`: `String`, length: 4 (e.g. `'4242'`)

#### Subdocument: `pricing`
- `subtotal`: `Number`, required
- `tax`: `Number`, required
- `shipping`: `Number`, required
- `grandTotal`: `Number`, required

---

## 3. RESTful API Endpoint Contracts & HTTP Specifications

Base URL Prefix: `/api`  
Standard Response Format: `application/json`  
Authentication Mechanism: `Authorization: Bearer <jwt_token>`

### 3.1 Authentication & User Endpoints (`/api/auth`)

#### 1. Register User
- **Route**: `POST /api/auth/register`
- **Auth**: Public
- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "name": "Evelyn Vance",
    "email": "evelyn@velvetaura.luxury",
    "password": "SecretPassword123"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "6728a0f912c9a1b02c34d567",
      "name": "Evelyn Vance",
      "email": "evelyn@velvetaura.luxury",
      "role": "customer"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: `{ "success": false, "message": "Email and password (min 6 characters) are required" }`
  - `409 Conflict`: `{ "success": false, "message": "User with this email already exists" }`

#### 2. Login User
- **Route**: `POST /api/auth/login`
- **Auth**: Public
- **Request Body**:
  ```json
  {
    "email": "evelyn@velvetaura.luxury",
    "password": "SecretPassword123"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "6728a0f912c9a1b02c34d567",
      "name": "Evelyn Vance",
      "email": "evelyn@velvetaura.luxury",
      "role": "customer"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: `{ "success": false, "message": "Email and password are required" }`
  - `401 Unauthorized`: `{ "success": false, "message": "Invalid email or password" }`

#### 3. Current User Profile
- **Route**: `GET /api/auth/me`
- **Auth**: Authenticated (`Bearer <token>`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "6728a0f912c9a1b02c34d567",
      "name": "Evelyn Vance",
      "email": "evelyn@velvetaura.luxury",
      "role": "customer",
      "shippingAddress": {
        "fullName": "Evelyn Vance",
        "addressLine1": "742 Evergreen Terrace",
        "city": "Beverly Hills",
        "state": "CA",
        "postalCode": "90210",
        "country": "USA",
        "phone": "+1-310-555-0144"
      }
    }
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: `{ "success": false, "message": "Access denied. No token provided or token expired" }`

#### 4. Update Profile & Default Shipping
- **Route**: `PUT /api/auth/profile`
- **Auth**: Authenticated (`Bearer <token>`)
- **Request Body**:
  ```json
  {
    "name": "Evelyn Vance-Laurent",
    "shippingAddress": {
      "fullName": "Evelyn Vance-Laurent",
      "addressLine1": "100 Luxury Way",
      "city": "New York",
      "state": "NY",
      "postalCode": "10021",
      "country": "USA",
      "phone": "+1-212-555-0188"
    }
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Profile updated successfully",
    "user": { "..." }
  }
  ```

---

### 3.2 Product Catalog Endpoints (`/api/products`)

#### 1. List & Search Products
- **Route**: `GET /api/products`
- **Auth**: Public
- **Query Parameters**:
  - `category`: Filter by category (`skincare`, `cosmetics`, `fragrances`, `haircare`)
  - `brand`: Filter by specific brand name
  - `origin`: Filter by country of origin
  - `search` / `q`: Keyword match across product name, brand, description, and origin
  - `sort`: `price-asc`, `price-desc`, `rating`, `newest` (default: `newest`)
  - `page`: Page number (default: `1`)
  - `limit`: Items per page (default: `12`, max: `100`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "count": 12,
    "total": 24,
    "page": 1,
    "pages": 2,
    "products": [
      {
        "_id": "6728a0f912c9a1b02c34d588",
        "name": "Gypsy Water Eau de Parfum",
        "brand": "Byredo",
        "origin": "Sweden",
        "category": "fragrances",
        "subcategory": "Eau de Parfum",
        "description": "An ode to the beauty of Romani culture, its unique customs, intimate beliefs and distinguished way of living.",
        "price": 290.00,
        "currency": "USD",
        "stock": 25,
        "volume": "100 ml / 3.4 fl oz",
        "rating": 4.9,
        "numReviews": 142,
        "images": ["/assets/products/byredo-gypsy-water.webp"],
        "featured": true
      }
    ]
  }
  ```

#### 2. Get Product Categories & Metadata
- **Route**: `GET /api/products/categories`
- **Auth**: Public
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "categories": [
      { "id": "skincare", "name": "Skincare", "count": 6, "icon": "sparkles" },
      { "id": "cosmetics", "name": "Cosmetics", "count": 6, "icon": "palette" },
      { "id": "fragrances", "name": "Fragrances", "count": 6, "icon": "droplet" },
      { "id": "haircare", "name": "Haircare", "count": 6, "icon": "wind" }
    ],
    "origins": ["South Korea", "France", "Japan", "Sweden", "United Kingdom", "Germany", "Italy", "USA"]
  }
  ```

#### 3. Get Single Product by ID
- **Route**: `GET /api/products/:id`
- **Auth**: Public
- **URL Parameter**: `id` (valid 24-character hexadecimal MongoDB `ObjectId`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "product": {
      "_id": "6728a0f912c9a1b02c34d588",
      "name": "Gypsy Water Eau de Parfum",
      "brand": "Byredo",
      "origin": "Sweden",
      "category": "fragrances",
      "description": "...",
      "price": 290.00,
      "stock": 25,
      "volume": "100 ml",
      "rating": 4.9,
      "numReviews": 142,
      "images": ["/assets/products/byredo-gypsy-water.webp"],
      "featured": true
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: `{ "success": false, "message": "Invalid product ID format" }`
  - `404 Not Found`: `{ "success": false, "message": "Product not found" }`

---

### 3.3 Cart Management Endpoints (`/api/cart`)

#### 1. Get Current User Cart
- **Route**: `GET /api/cart`
- **Auth**: Authenticated (`Bearer <token>`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "cart": {
      "_id": "6728a11112c9a1b02c34d599",
      "items": [
        {
          "product": "6728a0f912c9a1b02c34d588",
          "name": "Gypsy Water Eau de Parfum",
          "brand": "Byredo",
          "price": 290.00,
          "image": "/assets/products/byredo-gypsy-water.webp",
          "quantity": 1
        }
      ],
      "itemCount": 1,
      "subtotal": 290.00,
      "tax": 23.20,
      "shipping": 0.00,
      "grandTotal": 313.20
    }
  }
  ```

#### 2. Add Item to Cart
- **Route**: `POST /api/cart/items`
- **Auth**: Authenticated (`Bearer <token>`)
- **Request Body**:
  ```json
  {
    "productId": "6728a0f912c9a1b02c34d588",
    "quantity": 1
  }
  ```
- **Success Response (200 OK or 201 Created)**:
  ```json
  {
    "success": true,
    "message": "Item added to cart",
    "cart": { "..." }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: `{ "success": false, "message": "Valid productId and positive integer quantity required" }`
  - `404 Not Found`: `{ "success": false, "message": "Product not found" }`
  - `409 Conflict`: `{ "success": false, "message": "Requested quantity exceeds available stock (Current stock: 5)" }`

#### 3. Update Item Quantity in Cart
- **Route**: `PUT /api/cart/items/:productId`
- **Auth**: Authenticated (`Bearer <token>`)
- **URL Parameter**: `productId`
- **Request Body**:
  ```json
  {
    "quantity": 3
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Cart quantity updated",
    "cart": { "..." }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: `{ "success": false, "message": "Quantity must be at least 1 (use DELETE to remove)" }`
  - `404 Not Found`: `{ "success": false, "message": "Item not in cart" }`
  - `409 Conflict`: `{ "success": false, "message": "Requested quantity exceeds available stock" }`

#### 4. Remove Item from Cart
- **Route**: `DELETE /api/cart/items/:productId`
- **Auth**: Authenticated (`Bearer <token>`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Item removed from cart",
    "cart": { "..." }
  }
  ```

#### 5. Clear Entire Cart
- **Route**: `DELETE /api/cart`
- **Auth**: Authenticated (`Bearer <token>`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Cart cleared",
    "cart": {
      "items": [],
      "itemCount": 0,
      "subtotal": 0.00,
      "tax": 0.00,
      "shipping": 0.00,
      "grandTotal": 0.00
    }
  }
  ```

---

### 3.4 Orders & Checkout Endpoints (`/api/orders`)

#### 1. Process Checkout & Place Order
- **Route**: `POST /api/orders/checkout`
- **Auth**: Authenticated (`Bearer <token>`)
- **Request Body**:
  ```json
  {
    "shippingAddress": {
      "fullName": "Evelyn Vance",
      "addressLine1": "742 Evergreen Terrace",
      "addressLine2": "Suite 100",
      "city": "Beverly Hills",
      "state": "CA",
      "postalCode": "90210",
      "country": "USA",
      "phone": "+1-310-555-0144"
    },
    "paymentDetails": {
      "method": "mock_credit_card",
      "cardNumber": "4242424242424242",
      "cardExpiry": "12/28",
      "cardCvc": "123",
      "simulateFailure": false
    }
  }
  ```
- **Processing Logic**:
  1. Retrieve active user cart. Fail with `400 Bad Request` if cart is empty.
  2. For each cart item, verify live inventory in `Product` collection. Fail with `409 Conflict` if `item.quantity > product.stock`.
  3. Validate mock payment: Check card number format (standard 16-digit test card or mock format) and ensure `simulateFailure !== true`.
  4. Generate simulated transaction ID: `TXN_MOCK_<timestamp>_<randomHex>`.
  5. Atomically decrement `product.stock` by `item.quantity` for each item.
  6. Generate order tracking number: `VA-<YYYYMMDD>-<4RandomDigits>`.
  7. Create and persist `Order` document with status `'confirmed'`.
  8. Clear user cart items and reset totals to 0.
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Order created and payment authorized successfully",
    "order": {
      "_id": "6728a20212c9a1b02c34d611",
      "orderNumber": "VA-20261104-5821",
      "user": "6728a0f912c9a1b02c34d567",
      "orderItems": [
        {
          "product": "6728a0f912c9a1b02c34d588",
          "name": "Gypsy Water Eau de Parfum",
          "brand": "Byredo",
          "origin": "Sweden",
          "price": 290.00,
          "quantity": 1,
          "image": "/assets/products/byredo-gypsy-water.webp"
        }
      ],
      "shippingAddress": {
        "fullName": "Evelyn Vance",
        "addressLine1": "742 Evergreen Terrace",
        "city": "Beverly Hills",
        "state": "CA",
        "postalCode": "90210",
        "country": "USA"
      },
      "paymentDetails": {
        "method": "mock_credit_card",
        "transactionId": "TXN_MOCK_1730717400_8921",
        "status": "captured",
        "paidAt": "2026-11-04T10:55:00.000Z",
        "cardLast4": "4242"
      },
      "pricing": {
        "subtotal": 290.00,
        "tax": 23.20,
        "shipping": 0.00,
        "grandTotal": 313.20
      },
      "orderStatus": "confirmed",
      "createdAt": "2026-11-04T10:55:00.000Z"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: `{ "success": false, "message": "Cannot checkout an empty cart" }`
  - `400 Bad Request`: `{ "success": false, "message": "Incomplete shipping address: addressLine1, city, postalCode, country required" }`
  - `402 Payment Required`: `{ "success": false, "message": "Simulated payment authorization failed" }`
  - `409 Conflict`: `{ "success": false, "message": "Product 'Gypsy Water' does not have sufficient stock (available: 0)" }`

#### 2. Get User Order History
- **Route**: `GET /api/orders/my-orders`
- **Auth**: Authenticated (`Bearer <token>`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "count": 2,
    "orders": [
      {
        "_id": "6728a20212c9a1b02c34d611",
        "orderNumber": "VA-20261104-5821",
        "pricing": { "grandTotal": 313.20 },
        "orderStatus": "confirmed",
        "createdAt": "2026-11-04T10:55:00.000Z",
        "itemCount": 1
      }
    ]
  }
  ```

#### 3. Get Order Details by ID
- **Route**: `GET /api/orders/:id`
- **Auth**: Authenticated (`Bearer <token>`)
- **Success Response (200 OK)**: Full order document matching the requested ID.
- **Error Responses**:
  - `401 Unauthorized` / `403 Forbidden` (if user does not own the order and is not admin)
  - `404 Not Found`

---

### 3.5 System & Diagnostic Endpoints (`/api/health`)

#### 1. Health Status
- **Route**: `GET /api/health`
- **Auth**: Public
- **Success Response (200 OK)**:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-11-04T10:55:00.000Z",
    "service": "VelvetAura E-Commerce API",
    "database": {
      "connected": true,
      "type": "mongodb-memory-server" // or "mongodb-local"
    },
    "version": "1.0.0"
  }
  ```

---

## 4. Sample Seed Data Taxonomy for Imported Beauty Products

The catalog represents prestigious, authentic imported beauty products covering all four mandated categories: **Skincare, Cosmetics, Fragrances, and Haircare**.

### 4.1 Taxonomy Matrix (24 Curated Imported Luxury Items)

| # | Name | Brand | Origin | Category | Subcategory | Price ($) | Stock | Rating | Volume |
|---|---|---|---|---|---|---|---|---|---|
| 1 | First Care Activating Serum VI | Sulwhasoo | South Korea | Skincare | Serum | $89.00 | 45 | 4.9 | 60 ml |
| 2 | The Rich Cream with TFC8® | Augustinus Bader | Germany | Skincare | Moisturizer | $290.00 | 25 | 4.8 | 50 ml |
| 3 | Facial Treatment Essence (Pitera) | SK-II | Japan | Skincare | Essence | $245.00 | 30 | 4.9 | 160 ml |
| 4 | Lotion P50 Exfoliating Toner | Biologique Recherche | France | Skincare | Toner | $110.00 | 35 | 4.9 | 150 ml |
| 5 | Hyalu B5 Pure Hyaluronic Acid | La Roche-Posay | France | Skincare | Serum | $42.00 | 80 | 4.7 | 30 ml |
| 6 | The Eye Concentrate | La Mer | USA | Skincare | Eye Cream | $260.00 | 20 | 4.8 | 15 ml |
| 7 | Hollywood Flawless Filter | Charlotte Tilbury | United Kingdom | Cosmetics | Complexion | $49.00 | 60 | 4.8 | 30 ml |
| 8 | Radiant Fluid Foundation Matte | Clé de Peau Beauté | Japan | Cosmetics | Foundation | $135.00 | 28 | 4.9 | 35 ml |
| 9 | Signature Color Eyes Palette | SUQQU | Japan | Cosmetics | Eye Shadow | $72.00 | 32 | 4.8 | 6.2 g |
| 10| Baby Cheeks Blush Stick | Westman Atelier | USA/France | Cosmetics | Blush | $48.00 | 50 | 4.7 | 6 g |
| 11| True Velvet Lip Colour | Lisa Eldridge | United Kingdom | Cosmetics | Lipstick | $38.00 | 55 | 4.9 | 3.5 g |
| 12| Rouge Allure Velvet Luminous Matte | CHANEL | France | Cosmetics | Lipstick | $45.00 | 65 | 4.8 | 3.5 g |
| 13| Gypsy Water Eau de Parfum | Byredo | Sweden | Fragrances | EDP | $290.00 | 25 | 4.9 | 100 ml |
| 14| Baccarat Rouge 540 | Maison Francis Kurkdjian | France | Fragrances | Extrait | $345.00 | 18 | 4.9 | 70 ml |
| 15| Philosykos Eau de Parfum | Diptyque | France | Fragrances | EDP | $230.00 | 30 | 4.8 | 75 ml |
| 16| Santal 33 Eau de Parfum | Le Labo | USA/France | Fragrances | EDP | $320.00 | 22 | 4.8 | 100 ml |
| 17| Colonia Eau de Cologne | Acqua di Parma | Italy | Fragrances | EDC | $195.00 | 35 | 4.7 | 100 ml |
| 18| Replica Jazz Club | Maison Margiela | France | Fragrances | EDT | $160.00 | 40 | 4.8 | 100 ml |
| 19| Gold Lust Repair & Restore Shampoo | Oribe | USA/France | Haircare | Shampoo | $49.00 | 50 | 4.9 | 250 ml |
| 20| Chronologiste Huile de Parfum | Kérastase | France | Haircare | Hair Oil | $72.00 | 45 | 4.9 | 100 ml |
| 21| OI All In One Milk | Davines | Italy | Haircare | Leave-In | $42.00 | 60 | 4.8 | 135 ml |
| 22| Honey Infused Hair Oil | Gisou | Netherlands | Haircare | Hair Oil | $88.00 | 38 | 4.7 | 100 ml |
| 23| Cleansing Purifying Sea Salt Scrub | Christophe Robin | France | Haircare | Scalp Scrub | $54.00 | 40 | 4.8 | 250 ml |
| 24| Sublimic Fuente Forte Scalp Serum | Shiseido Professional | Japan | Haircare | Scalp Treatment | $68.00 | 30 | 4.7 | 125 ml |

### 4.2 Seed Script Specification (`npm run seed`)
- The seed script (`scripts/seed.js` or `src/seed.js`) must:
  1. Initialize database connection (using the unified DB connection utility with fallback).
  2. Clear existing collections (`Product.deleteMany({})`, `User.deleteMany({})`, `Cart.deleteMany({})`, `Order.deleteMany({})`).
  3. Seed at least one default test customer account (`evelyn@velvetaura.luxury` / `VelvetAura2026!`) and one admin account (`concierge@velvetaura.luxury` / `VelvetAdmin2026!`).
  4. Insert all 24 curated imported beauty product records with accurate categories, origins, prices, descriptions, and stock.
  5. Log successful insertion counts to console and terminate cleanly with exit code 0.

---

## 5. Database Environment & Fallback Mechanics

The application must support immediate, zero-friction startup in both standard production/local environments and sandboxed or unconfigured developer environments.

```
+-----------------------------------------------------------+
|               Unified Database Connect Handler            |
+-----------------------------------------------------------+
                             |
              Check process.env.USE_MEMORY_DB === 'true'
              or process.env.NODE_ENV === 'test'?
                             |
              +--------------+---------------+
              | YES                          | NO
              v                              v
    +-------------------+          +-------------------+
    | MongoMemoryServer |          | Attempt Connect   |
    | .create()         |          | to MONGODB_URI    |
    |                   |          | (timeout: 3000ms) |
    +-------------------+          +-------------------+
              |                              |
              |                              | Succeeded?
              |                     +--------+--------+
              |                     | YES             | NO (Timeout/Refused)
              |                     v                 v
              |             +---------------+   +-------------------+
              |             | Connected to  |   | Log Fallback Warn |
              |             | Local MongoDB |   | MongoMemoryServer |
              |             +---------------+   | .create()         |
              |                                 +-------------------+
              +-----------------------+                   |
                                      v                   v
                        +---------------------------------------+
                        | Connected: Check if Product count = 0 |
                        | If 0 & in-memory: Auto-seed catalog   |
                        +---------------------------------------+
```

### 5.1 Fallback Specification Rules
1. **URI Resolution**: Defaults to `process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/velvetaura'`.
2. **Connection Timeout**: The initial connection attempt to external MongoDB must configure `serverSelectionTimeoutMS: 3000`.
3. **Graceful Fallback**: If external connection fails with `MongooseServerSelectionError` or ECONNREFUSED:
   - Log: `"[Database] External MongoDB connection failed. Falling back to automated in-memory MongoDB instance..."`
   - Dynamically spin up `mongodb-memory-server` via `MongoMemoryServer.create()`.
   - Connect Mongoose to the in-memory URI (`mongoServer.getUri()`).
4. **Auto-Seed on In-Memory Fallback**: When running in-memory, if the `Product` collection count is 0, the server should automatically populate the sample catalog so the application is instantly functional without manual commands.
5. **Clean Shutdown**: Register handlers for `SIGINT` and `SIGTERM` to call `mongoose.disconnect()` and `mongoServer.stop()`.

---

## 6. Automated Verification Test Suite Specifications

Test Runner: **Jest** (or **Mocha + Chai**) with **Supertest**.  
Execution Command: `npm test`

### 6.1 Test Suites Structure

| Test Suite File | Domain | Test Cases Required |
|---|---|---|
| `auth.test.js` | Authentication & Security | 1. User registration with valid credentials succeeds (HTTP 201) and returns token.<br>2. Registration fails on duplicate email (HTTP 409).<br>3. Registration fails on short password or invalid email format (HTTP 400).<br>4. User login with valid credentials succeeds (HTTP 200).<br>5. User login with wrong password fails (HTTP 401).<br>6. Accessing protected `/api/auth/me` with valid Bearer token returns profile.<br>7. Accessing `/api/auth/me` without token fails (HTTP 401). |
| `products.test.js` | Catalog Search & Filtering | 1. `GET /api/products` returns array of seeded products.<br>2. Filter by category `skincare` returns only skincare items.<br>3. Search by keyword (e.g. "Byredo" or "Serum") returns matching products.<br>4. `GET /api/products/:id` with valid ID returns single product.<br>5. `GET /api/products/:id` with invalid ObjectId returns HTTP 400 or 404.<br>6. `GET /api/products/categories` returns valid category taxonomy. |
| `cart.test.js` | Cart Calculation & Line-Items | 1. `GET /api/cart` for authenticated user returns cart object.<br>2. `POST /api/cart/items` adds product and recalculates subtotal, tax, and shipping.<br>3. Updating quantity via `PUT /api/cart/items/:id` recalculates grand total correctly.<br>4. Removing item via `DELETE /api/cart/items/:id` updates item count and totals.<br>5. Adding quantity exceeding product stock returns HTTP 409 Conflict.<br>6. `DELETE /api/cart` empties cart. |
| `orders.test.js` | Checkout & Payment Simulation | 1. Checkout with valid cart, shipping address, and mock payment succeeds (HTTP 201).<br>2. Returns valid generated `orderNumber` and mock `transactionId`.<br>3. Verifies that cart is automatically cleared upon successful order placement.<br>4. Verifies product inventory stock is decremented by purchased quantity.<br>5. `GET /api/orders/my-orders` returns the newly placed order for that user.<br>6. Checkout fails with HTTP 400 if cart is empty.<br>7. Checkout fails with HTTP 402 if payment simulation triggers failure. |
| `health.test.js` | Database & App Lifecycle | 1. App starts up cleanly using in-memory MongoDB runner.<br>2. `GET /api/health` returns status `healthy` and HTTP 200. |

---

## 7. Frontend Dark-Mode Glassmorphism Design System

The frontend aesthetic must strictly adhere to the modern dark-mode glassmorphism guidelines specified in R2:

### 7.1 Styling Tokens & Glassmorphism Properties
- **Backgrounds**: Deep obsidian and cosmic slate palette:
  - Base Body: `#0a0b10` to `#121420` (radial ambient glow)
  - Glass Card Background: `rgba(22, 27, 46, 0.65)` to `rgba(30, 36, 60, 0.45)`
  - Frosted Glass Blur: `backdrop-filter: blur(16px) saturate(180%)`
  - Glass Borders: `1px solid rgba(255, 255, 255, 0.08)` to `1px solid rgba(255, 255, 255, 0.16)`
- **Accents & Glows**:
  - Velvet Aura Primary Accent: Violet/Amethyst glow (`#9d4edd`, `rgba(157, 78, 221, 0.35)`)
  - Secondary Accent: Champagne/Rose Gold (`#f7c59f`, `#e0a96d`)
  - Success: Mint Glow (`#06d6a0`)
  - Glass Shadow: `0 8px 32px 0 rgba(0, 0, 0, 0.37)`
- **Typography**: Clean, high-contrast luxury serif/sans pairing (e.g. Playfair Display / Cormorant Garamond for titles and Inter / Plus Jakarta Sans for UI text).

### 7.2 Core User Experience Views & Behaviors
1. **Global Navigation Bar**:
   - VelvetAura branding with subtle glowing aura logo.
   - Live Search input with debounced keyword filtering.
   - Category navigation pills (`All`, `Skincare`, `Cosmetics`, `Fragrances`, `Haircare`).
   - Dynamic Cart Icon with real-time numeric badge badge (reflects `itemCount`).
   - Auth trigger (Sign In / Register modal or User Account Avatar dropdown).
2. **Product Catalog Grid**:
   - Translucent glass cards featuring product image, luxury brand badge, origin flag/text, title, star rating, price, and instant "Add to Cart" button with glowing hover state.
3. **Product Detail Modal / View**:
   - High-res image display, origin provenance, detailed formulation and notes, stock indicator ("In Stock (25 units)" or "Low Stock"), quantity selector, and primary CTA.
4. **Interactive Cart Drawer / Flyout**:
   - Slides smoothly over page without reload.
   - Shows line items with thumbnail, title, unit price, quantity increment/decrement controls, and remove button.
   - Live summary: Subtotal, Estimated Tax (8%), Shipping (Free over $100), and Grand Total.
   - Primary "Proceed to Checkout" button.
5. **Checkout Workflow & Mock Payment**:
   - Multi-step or accordion form: Shipping address input -> Mock payment card form (pre-filled test card with toggle for simulate failure).
   - Instant order processing with loading spinner.
   - Order Confirmation Screen displaying `orderNumber`, mock `transactionId`, itemized receipt, and shipping destination.
6. **User Account & Order History**:
   - Profile summary with shipping addresses.
   - Historical orders list showing order date, status badge, items preview, and total paid.

---

## 8. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| 1 | Auth | User Registration | Creates customer account with bcrypt password hashing | `{ name, email, password }` | HTTP 201 + JWT token + user obj | 400 (validation), 409 (duplicate email) | ORIGINAL_REQUEST R1, AC |
| 2 | Auth | User Login | Authenticates credentials and returns JWT session token | `{ email, password }` | HTTP 200 + JWT token + user obj | 400 (missing fields), 401 (bad credentials) | ORIGINAL_REQUEST R1, AC |
| 3 | Auth | Token Verification / Profile | Validates JWT token and fetches current user details | `Bearer <token>` | HTTP 200 + user profile + shipping | 401 (invalid/expired/missing token) | ORIGINAL_REQUEST R1, AC |
| 4 | Auth | Profile Update | Updates customer profile and saved shipping destination | `Bearer <token>`, `{ name, shippingAddress }`| HTTP 200 + updated user obj | 400 (invalid data), 401 (unauthorized) | ORIGINAL_REQUEST R1, R2 |
| 5 | Catalog | Product Listing & Pagination | Retrieves paginated luxury imported beauty items | `page`, `limit`, `sort` | HTTP 200 + array of products + pagination meta | 500 (internal error) | ORIGINAL_REQUEST R1, AC |
| 6 | Catalog | Category Filtering | Filters products by skincare, cosmetics, fragrances, haircare | `?category=skincare` | HTTP 200 + filtered products | 200 with empty array if no match | ORIGINAL_REQUEST R1, AC |
| 7 | Catalog | Brand & Origin Filtering | Filters products by imported origin (e.g. South Korea) or brand | `?origin=France&brand=Diptyque` | HTTP 200 + filtered products | 200 with empty array if no match | ORIGINAL_REQUEST R1, R3 |
| 8 | Catalog | Keyword Search | Full-text search across product name, brand, notes, description | `?q=hyaluronic` or `?search=Byredo` | HTTP 200 + matching products | 200 with empty array if no match | ORIGINAL_REQUEST R1, AC |
| 9 | Catalog | Product Details | Retrieves full product specification, stock, and descriptions | `GET /api/products/:id` | HTTP 200 + detailed product object | 400 (bad ObjectId), 404 (not found) | ORIGINAL_REQUEST R1, R2 |
| 10 | Catalog | Category Taxonomy List | Lists all 4 categories with count and metadata | `GET /api/products/categories` | HTTP 200 + category array | 500 (internal error) | ORIGINAL_REQUEST R1, R3 |
| 11 | Cart | Fetch Active Cart | Returns authenticated user's line items and calculations | `Bearer <token>` | HTTP 200 + cart object with totals | 401 (unauthorized) | ORIGINAL_REQUEST R1, AC |
| 12 | Cart | Add Line Item | Adds product to cart or increments existing line item | `productId`, `quantity` | HTTP 200/201 + updated cart | 400 (bad qty), 404 (product not found), 409 (out of stock) | ORIGINAL_REQUEST R1, AC |
| 13 | Cart | Update Item Quantity | Updates quantity of an item in cart and recalculates totals | `productId`, `{ quantity }` | HTTP 200 + updated cart | 400 (qty < 1), 404 (item not in cart), 409 (stock exceeded) | ORIGINAL_REQUEST R1, AC |
| 14 | Cart | Remove Line Item | Removes specific item from user cart | `DELETE /api/cart/items/:productId` | HTTP 200 + updated cart | 404 (item not found) | ORIGINAL_REQUEST R1, AC |
| 15 | Cart | Clear Cart | Empties all items from active cart | `DELETE /api/cart` | HTTP 200 + empty cart totals | 401 (unauthorized) | ORIGINAL_REQUEST R1, AC |
| 16 | Cart | Dynamic Pricing Math | Calculates subtotal, tax (8%), shipping ($0 over $100, else $10) | Cart line items | `subtotal`, `tax`, `shipping`, `grandTotal` | Negative inputs clamped/rejected | ORIGINAL_REQUEST R1, AC |
| 17 | Checkout | Order Submission | Validates cart, stock, and processes checkout | `shippingAddress`, `paymentDetails` | HTTP 201 + Order record + txn ID | 400 (empty cart), 409 (stock conflict), 402 (payment fail) | ORIGINAL_REQUEST R1, AC |
| 18 | Checkout | Mock Payment Gateway | Simulates credit card authorization and generates mock txn ID | `cardNumber`, `cardExpiry`, `cardCvc` | `{ transactionId, status: 'captured' }` | 402 (simulated failure or bad card) | ORIGINAL_REQUEST R1, AC |
| 19 | Checkout | Inventory Deduction | Atomically reduces product stock upon successful order | Cart items and quantities | Updated product stock in DB | 409 (insufficient stock at checkout) | ORIGINAL_REQUEST R1, AC |
| 20 | Orders | User Order History | Fetches previous orders placed by the authenticated user | `Bearer <token>` | HTTP 200 + array of order summaries | 401 (unauthorized) | ORIGINAL_REQUEST R1, AC |
| 21 | Orders | Order Details View | Fetches detailed receipt for a specific order | `GET /api/orders/:id` | HTTP 200 + complete order record | 401 (unauthorized), 403 (wrong user), 404 (not found) | ORIGINAL_REQUEST R1, R2 |
| 22 | Database | MongoDB Memory Fallback | Automatic fallback to mongodb-memory-server if local DB absent | Database connection initialization | Working in-memory Mongo connection | Logs fallback warning and continues | ORIGINAL_REQUEST R4, AC |
| 23 | Database | Auto-Catalog Seeding | Auto-seeds 24 imported products on in-memory startup | Server bootstrap when DB empty | Seeded catalog collection | Error logged, server remains up | ORIGINAL_REQUEST R3, R4 |
| 24 | Seed | Standalone Seed Command | Populates DB with 24 luxury imported products and demo users | `npm run seed` | Seed summary logged, exit code 0 | Non-zero exit code on failure | ORIGINAL_REQUEST R3, AC |
| 25 | Frontend | Dark Glassmorphism Theme | Obsidian dark background, frosted glass cards, neon violet aura | CSS backdrop-filter, border tokens | Translucent responsive visual styling | Fallback CSS if backdrop-filter unsupported | ORIGINAL_REQUEST R2, AC |
| 26 | Frontend | Live Cart Badge | Real-time item count badge on navbar without page reload | State changes in cart | Badge shows total units in cart | Disappears/shows 0 when empty | ORIGINAL_REQUEST R2, AC |
| 27 | Frontend | Interactive Cart Drawer | Slide-over drawer with item management and real-time totals | User click on cart icon | Dynamic drawer overlay | Auto-closes on ESC or click outside | ORIGINAL_REQUEST R2, AC |
| 28 | Frontend | Checkout Modal & Receipt | Interactive checkout workflow with mock payment and receipt | User submit checkout | Order confirmation receipt card | Shows inline error on validation/payment fail | ORIGINAL_REQUEST R2, AC |
| 29 | Frontend | Responsive Catalog Grid | Adaptive grid for desktop, tablet, and mobile devices | Viewport dimensions | 1 to 4 columns grid of glass cards | Graceful wrapping on small screens | ORIGINAL_REQUEST R2, AC |
| 30 | Verification | Automated Test Suite | Automated verification of core endpoints via supertest | `npm test` | Test suite report with 100% pass | Non-zero exit code if tests fail | ORIGINAL_REQUEST R5, AC |

---

## 9. Edge Cases & Boundary Conditions

| # | Feature | Input / Condition | Observed / Specified Behavior |
|---|---|---|---|
| 1 | User Registration | Registration with uppercase/mixed email (e.g. `User@EXAMPLE.com`) | Normalized to lowercase `user@example.com` before query and storage; prevents case-sensitive duplicates |
| 2 | User Registration | Password with leading/trailing whitespace or length < 6 chars | Trimming policy or strict length enforcement rejecting passwords shorter than 6 characters with HTTP 400 |
| 3 | Product Search | Search query with special regex characters (e.g. `C++`, `*`, `(Serum)`) | Escaped safely before Mongoose regex/text query; does not crash server or cause ReDoS |
| 4 | Product Filtering | Filter by non-existent category or brand (e.g. `category=electronics`) | Returns HTTP 200 with `{ success: true, count: 0, products: [] }` rather than error |
| 5 | Product ID Lookup | Invalid 24-character hexadecimal string (e.g. `12345` or `xyz`) | Express validator catches invalid ObjectId and responds HTTP 400 Bad Request instead of throwing unhandled CastError |
| 6 | Cart Management | Adding product with quantity = 0 or negative number | Responds HTTP 400 Bad Request with validation error message |
| 7 | Cart Management | Adding quantity exceeding available stock (e.g. stock=5, requested=10) | Responds HTTP 409 Conflict with message indicating maximum available stock |
| 8 | Cart Pricing | Floating point precision issues (e.g. `0.1 + 0.2 = 0.30000000000000004`) | All price calculations use `Number(val.toFixed(2))` or integer cent math to guarantee exact financial precision |
| 9 | Cart Free Shipping | Cart subtotal exactly equal to $99.99 vs $100.00 | Subtotal of $99.99 incurs $10.00 shipping; $100.00 qualifies for $0.00 free shipping |
| 10 | Checkout | Checkout attempted when active cart contains 0 items | Responds HTTP 400 Bad Request: "Cannot checkout an empty cart" |
| 11 | Checkout | Race condition: another user purchases the last unit before checkout | Live stock re-verification during checkout transaction catches stock deficiency and rejects order with HTTP 409 |
| 12 | Payment Simulation | Card details with `simulateFailure: true` | Payment simulator returns authorization decline; checkout returns HTTP 402 Payment Required; cart remains intact |
| 13 | Database Startup | External MongoDB instance offline or unreachable | Server connection attempts with 3000ms timeout, logs warning, spins up `mongodb-memory-server`, and continues seamlessly |
| 14 | Database Shutdown | SIGINT/SIGTERM received during server execution | Gracefully shuts down HTTP server, terminates Mongoose connection, and stops MongoMemoryServer cleanly |
| 15 | Test Execution | `npm test` executed on a machine without MongoDB installed | Automatically switches to `mongodb-memory-server`, runs all integration tests, and exits cleanly with 0 |
| 16 | Order History | User A requests Order belonging to User B (`/api/orders/:id`) | Returns HTTP 403 Forbidden or HTTP 404 Not Found to prevent unauthorized data exposure |
| 17 | Frontend Glass UI | Browser without CSS `backdrop-filter` support | Fallback background with higher opacity `rgba(18, 22, 38, 0.92)` ensuring full text readability |
| 18 | Stock Depletion | Product stock reaches 0 after successful checkout | Product card displays "Out of Stock" badge; "Add to Cart" button is disabled |
