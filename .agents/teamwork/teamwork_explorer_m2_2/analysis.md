# Milestone 2 Analysis — Cart Management APIs & Pricing Engine

**Explorer**: `teamwork_explorer_m2_2`  
**Mission**: Architectural blueprint and implementation plan for VelvetAura's Shopping Cart subsystem, Inventory Stock Validation, and Pricing Calculation Engine.  
**Target Files**:
- `src/services/cartService.js`
- `src/controllers/cartController.js`
- `src/routes/cartRoutes.js`
- `tests/cart.test.js`

---

## 1. Executive Summary

The VelvetAura Cart subsystem is the central state machine connecting product discovery (Milestone 2 Explorer 1) with order checkout and payment processing (Milestone 2 Explorer 3). It must provide high-performance, strictly isolated, and resilient cart management for authenticated customers, enforce inventory limits against the product catalog, and apply exact mathematical pricing calculations (8% sales tax, $50 free shipping threshold, and $5.99 base shipping fee).

This document specifies the complete architectural design, controller algorithms, routing contracts, stock validation guards, pricing engine formulation, and unit/integration verification specifications.

---

## 2. Existing Codebase Inspection & Baseline State

### 2.1 Model: `src/models/Cart.js`
The `Cart` model is already defined and provides:
1. **Subdocument Schema (`cartItemSchema`)**:
   - `product`: `ObjectId` referencing `Product` (required).
   - `name`: `String` (required, trimmed).
   - `brand`: `String` (required, trimmed).
   - `price`: `Number` (required, min: 0).
   - `quantity`: `Number` (required, min: 1, default: 1).
   - `image`: `String` (default: `''`).
2. **Cart Document Schema (`cartSchema`)**:
   - `user`: `ObjectId` referencing `User` (required, unique: true, indexed).
   - `items`: Array of `cartItemSchema` (default: `[]`).
   - `subtotal`: `Number` (default: 0.0).
   - `tax`: `Number` (default: 0.0).
   - `shipping`: `Number` (default: 0.0).
   - `grandTotal`: `Number` (default: 0.0).
   - `itemCount`: `Number` (default: 0).
3. **Recalculation Method (`cartSchema.methods.recalculateTotals`)**:
   - Recalculates subtotal, 8% tax, tiered shipping ($0 if empty, $0 if >= $50, $5.99 otherwise), grand total, and item count.
4. **Pre-Save Hook**: Automatically triggers `recalculateTotals()` before saving.

### 2.2 Express App Integration (`src/app.js`)
`src/app.js` is already pre-configured to mount `/api/cart`:
```javascript
let cartRoutes;
try {
  cartRoutes = require('./routes/cartRoutes');
} catch (e) {
  cartRoutes = express.Router();
}
...
app.use('/api/cart', cartRoutes);
```
Creating `src/routes/cartRoutes.js` immediately connects the endpoints into the active HTTP pipeline without requiring modifications to `app.js`.

### 2.3 Authentication Middleware (`src/middleware/authMiddleware.js`)
- The `protect` middleware extracts the Bearer token from the `Authorization` header, decodes the JWT, fetches the user, and attaches it to `req.user`.
- All cart routes must be guarded with `protect` to ensure multi-user isolation.

### 2.4 E2E Test Suite Contracts
Inspection of `tests/e2e/tier1_cart.test.js`, `tier2_boundary.test.js`, `tier3_interactions.test.js`, and `helpers/testClient.js` confirms the exact external contracts:
- `GET /api/cart`
- `POST /api/cart/items` with payload `{ productId, quantity }`
- `PUT /api/cart/items/:productId` with payload `{ quantity }`
- `DELETE /api/cart/items/:productId`
- `DELETE /api/cart`

---

## 3. Pricing Engine Formulation & Rules

The pricing engine must strictly match the project specifications and the test fixture helper (`calculateExpectedPricing`):

### 3.1 Mathematical Formulas
1. **Subtotal**:
   $$\text{Subtotal} = \frac{\text{round}\left( \sum_{i=1}^{n} (\text{price}_i \times \text{quantity}_i) \times 100 \right)}{100}$$
2. **Sales Tax (8%)**:
   $$\text{Tax} = \frac{\text{round}\left( \text{Subtotal} \times 0.08 \times 100 \right)}{100}$$
   *Rounding rule*: Standard half-up round to 2 decimal places.
3. **Shipping Fee**:
   $$\text{Shipping} = \begin{cases} 
   0.00 & \text{if } \text{Subtotal} = 0.00 \text{ (empty cart)} \\ 
   0.00 & \text{if } \text{Subtotal} \ge 50.00 \text{ (free shipping qualification)} \\ 
   5.99 & \text{if } 0 < \text{Subtotal} < 50.00 \text{ (standard flat shipping)} 
   \end{cases}$$
4. **Grand Total**:
   $$\text{GrandTotal} = \frac{\text{round}\left( (\text{Subtotal} + \text{Tax} + \text{Shipping}) \times 100 \right)}{100}$$
5. **Item Count**:
   $$\text{ItemCount} = \sum_{i=1}^{n} \text{quantity}_i$$

### 3.2 Key Threshold Boundaries
| Scenario | Subtotal | Tax (8%) | Shipping | Grand Total |
|---|---|---|---|---|
| Empty cart | $0.00 | $0.00 | $0.00 | $0.00 |
| Single cheap item (Rom&nd Tint $13.00) | $13.00 | $1.04 | $5.99 | $20.03 |
| Boundary just below threshold ($49.99) | $49.99 | $4.00 | $5.99 | $59.98 |
| Exact threshold boundary ($50.00) | $50.00 | $4.00 | $0.00 | $54.00 |
| High luxury item (Byredo Gypsy Water $290.00) | $290.00 | $23.20 | $0.00 | $313.20 |

---

## 4. Inventory Stock Validation Engine

To prevent overselling, race conditions, and corrupted cart states, stock validation must be enforced at multiple layers:

### 4.1 Addition Layer (`POST /api/cart/items`)
- Check catalog inventory: `const product = await Product.findById(productId);`
- Check current quantity of that product already in the customer's cart: `const existingQty = existingItem ? existingItem.quantity : 0;`
- Compute requested total: `const desiredTotal = existingQty + requestedQuantity;`
- **Validation Guard**:
  ```javascript
  if (product.stock === 0) {
    return res.status(400).json({
      success: false,
      message: 'Product is currently out of stock',
      error: 'Product is currently out of stock',
    });
  }
  if (desiredTotal > product.stock) {
    return res.status(400).json({
      success: false,
      message: `Requested quantity (${desiredTotal}) exceeds available inventory (${product.stock})`,
      error: `Requested quantity (${desiredTotal}) exceeds available inventory (${product.stock})`,
    });
  }
  ```

### 4.2 Modification Layer (`PUT /api/cart/items/:productId`)
- If `quantity === 0`: Item is cleanly removed from the cart; stock check is bypassed.
- If `quantity > 0`: Verify `product.stock >= quantity`. If requested quantity exceeds available stock, reject with `400 Bad Request`.

### 4.3 Checkout Preparation Layer (`validateCartStock`)
- A shared utility function in `src/services/cartService.js` to inspect all line items prior to checkout:
  - Verifies that every product still exists in the catalog.
  - Verifies that every line item quantity is `<= current product.stock`.
  - Returns `{ isValid: true }` or `{ isValid: false, issues: [...] }`.

---

## 5. API Route & Controller Specifications

### 5.1 Route Map (`src/routes/cartRoutes.js`)
All routes require `protect` middleware.

```javascript
const express = require('express');
const {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} = require('../controllers/cartController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply authentication to all cart endpoints
router.use(protect);

router.route('/')
  .get(getCart)
  .delete(clearCart);

router.route('/items')
  .post(addToCart);

router.route('/items/:productId')
  .put(updateCartItem)
  .delete(removeCartItem);

// Aliases for developer convenience & resilient routing
router.post('/', addToCart);
router.delete('/clear', clearCart);

module.exports = router;
```

### 5.2 Detailed Handler Specifications

#### Endpoint 1: `GET /api/cart`
- **Purpose**: Fetch active shopping cart for authenticated customer.
- **Workflow**:
  1. Find cart by `user: req.user._id`.
  2. If not found, auto-create a new empty cart document (`{ user: req.user._id, items: [] }`).
  3. Populate `items.product` with fields `name brand price stock image images category origin`.
  4. Ensure totals are calculated.
  5. Return HTTP 200 with `{ success: true, cart }`.

#### Endpoint 2: `POST /api/cart/items`
- **Purpose**: Add a product to the cart or increment its quantity.
- **Input Payload**: `{ productId: String, quantity: Number }`
- **Validation Rules**:
  1. `productId`: Must be present, non-empty, and a valid 24-character hexadecimal ObjectId (`mongoose.Types.ObjectId.isValid`). If invalid -> HTTP 400.
  2. `quantity`: If omitted, default to 1. If supplied, must be an integer > 0. Reject `0`, negative numbers, non-integers, and non-numeric strings with HTTP 400.
  3. Product Lookup: Search `Product.findById(productId)`. If not found -> HTTP 404 (with HTTP 400 fallback for boundary checks).
  4. Stock Validation: Check `(existingCartQty + quantity) <= product.stock`. If exceeded -> HTTP 400.
- **State Mutation**:
  1. If item already exists: Increment `item.quantity` by `quantity`; sync `item.price = product.price`.
  2. If item is new: Push new subdocument with `product: product._id`, `name: product.name`, `brand: product.brand`, `price: product.price`, `quantity`, `image: product.image || (product.images && product.images[0]) || ''`.
  3. Invoke `cart.recalculateTotals()`.
  4. Save `await cart.save()`.
  5. Populate `items.product`.
- **Response**: HTTP 200 (or 201) with `{ success: true, message: 'Item added to cart', cart }`.

#### Endpoint 3: `PUT /api/cart/items/:productId`
- **Purpose**: Update line item quantity.
- **URL Parameter**: `productId` (validate ObjectId -> 400).
- **Input Payload**: `{ quantity: Number }`
- **Validation Rules**:
  1. `quantity`: Must be a non-negative integer >= 0. Reject negative numbers, non-integers, non-numeric values -> HTTP 400.
  2. Cart Lookup: Find cart for user. If not found -> HTTP 404.
  3. Line Item Lookup: Find item in `cart.items` matching `productId` (compare `item.product.toString() === productId` or `item._id.toString() === productId`). If not found -> HTTP 404.
- **State Mutation**:
  1. If `quantity === 0`: Remove item from `cart.items`.
  2. If `quantity > 0`:
     - Lookup product in catalog to verify current stock.
     - If `quantity > product.stock`: Return HTTP 400.
     - Set `item.quantity = quantity`; sync `item.price = product.price`.
  3. Invoke `cart.recalculateTotals()`.
  4. Save `await cart.save()`.
  5. Populate `items.product`.
- **Response**: HTTP 200 with `{ success: true, message: 'Cart updated', cart }`.

#### Endpoint 4: `DELETE /api/cart/items/:productId`
- **Purpose**: Remove a specific line item from the cart.
- **URL Parameter**: `productId` (validate ObjectId -> 400).
- **Workflow**:
  1. Find cart for user. If not found -> HTTP 404.
  2. Find item in `cart.items`. If not found -> HTTP 404.
  3. Remove item from `cart.items` array.
  4. Invoke `cart.recalculateTotals()`.
  5. Save `await cart.save()`.
  6. Populate `items.product`.
- **Response**: HTTP 200 with `{ success: true, message: 'Item removed from cart', cart }`.

#### Endpoint 5: `DELETE /api/cart`
- **Purpose**: Clear all items and reset cart totals to zero.
- **Workflow**:
  1. Find cart for user (or create empty if none).
  2. Set `cart.items = []`.
  3. Reset all totals: `subtotal = 0`, `tax = 0`, `shipping = 0`, `grandTotal = 0`, `itemCount = 0`.
  4. Save `await cart.save()`.
- **Response**: HTTP 200 with `{ success: true, message: 'Cart cleared successfully', cart }`.

---

## 6. Architecture of `src/services/cartService.js`

To decouple mathematical calculation and business logic from HTTP controller concerns and enable reuse by the Order checkout engine (`orderController.js`), a dedicated `cartService.js` should be introduced:

```javascript
/**
 * src/services/cartService.js
 * VelvetAura - Shopping Cart Business Logic & Pricing Engine
 */

const Cart = require('../models/Cart');
const Product = require('../models/Product');

/**
 * Pure function: calculates cart financial totals from an array of items.
 * @param {Array<{ price: number, quantity: number }>} items
 * @returns {{ subtotal: number, tax: number, shipping: number, grandTotal: number, itemCount: number }}
 */
function calculatePricing(items = []) {
  const rawSubtotal = items.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const prc = Number(item.price) || 0;
    return acc + qty * prc;
  }, 0);

  const subtotal = Math.round(rawSubtotal * 100) / 100;
  const tax = Math.round(subtotal * 0.08 * 100) / 100;

  let shipping = 0.0;
  if (subtotal > 0) {
    shipping = subtotal >= 50.0 ? 0.0 : 5.99;
  }

  const grandTotal = Math.round((subtotal + tax + shipping) * 100) / 100;
  const itemCount = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

  return { subtotal, tax, shipping, grandTotal, itemCount };
}

/**
 * Retrieves existing active cart for a user or initializes a new one.
 * @param {string|ObjectId} userId
 * @returns {Promise<CartDocument>}
 */
async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({
      user: userId,
      items: [],
      subtotal: 0,
      tax: 0,
      shipping: 0,
      grandTotal: 0,
      itemCount: 0,
    });
  }
  return cart;
}

/**
 * Validates stock availability for all items in a cart against the live product catalog.
 * @param {CartDocument} cart
 * @returns {Promise<{ isValid: boolean, issues: Array<string> }>}
 */
async function validateCartStock(cart) {
  const issues = [];
  if (!cart || !cart.items || cart.items.length === 0) {
    return { isValid: false, issues: ['Cart is empty'] };
  }

  for (const item of cart.items) {
    const product = await Product.findById(item.product);
    if (!product) {
      issues.push(`Product "${item.name}" is no longer available in catalog.`);
    } else if (product.stock < item.quantity) {
      issues.push(
        `Insufficient stock for "${product.name}". Available: ${product.stock}, in cart: ${item.quantity}.`
      );
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Clears customer cart (used after successful order checkout).
 * @param {string|ObjectId} userId
 */
async function clearUserCart(userId) {
  return Cart.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        items: [],
        subtotal: 0,
        tax: 0,
        shipping: 0,
        grandTotal: 0,
        itemCount: 0,
      },
    },
    { new: true }
  );
}

module.exports = {
  calculatePricing,
  getOrCreateCart,
  validateCartStock,
  clearUserCart,
};
```

---

## 7. Complete Controller Blueprint (`src/controllers/cartController.js`)

```javascript
/**
 * src/controllers/cartController.js
 * VelvetAura - Shopping Cart Controller
 */

const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { getOrCreateCart } = require('../services/cartService');

/**
 * Helper to populate product references on cart items
 */
const populateCart = async (cartQuery) => {
  return cartQuery.populate('items.product', 'name brand price stock image images origin category');
};

/**
 * @desc    Fetch active customer cart
 * @route   GET /api/cart
 * @access  Private
 */
const getCart = async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = await getOrCreateCart(req.user._id);
    }

    cart = await populateCart(Cart.findById(cart._id));

    return res.status(200).json({
      success: true,
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add item to cart or increment quantity
 * @route   POST /api/cart/items
 * @access  Private
 */
const addToCart = async (req, res, next) => {
  try {
    const rawProductId = req.body.productId || req.body.product || req.body.id;
    const { quantity } = req.body;

    // 1. Validate Product ID
    if (!rawProductId || typeof rawProductId !== 'string' || !mongoose.Types.ObjectId.isValid(rawProductId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid product ID is required',
        error: 'A valid product ID is required',
      });
    }

    // 2. Validate Quantity
    let parsedQuantity = quantity === undefined ? 1 : Number(quantity);
    if (isNaN(parsedQuantity) || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive integer greater than zero',
        error: 'Quantity must be a positive integer greater than zero',
      });
    }

    // 3. Verify Product exists in database
    const product = await Product.findById(rawProductId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error: 'Product not found',
      });
    }

    // 4. Retrieve or create cart
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = await getOrCreateCart(req.user._id);
    }

    // 5. Check if item already exists in cart
    const existingIndex = cart.items.findIndex(
      (item) => item.product && item.product.toString() === product._id.toString()
    );

    const currentQty = existingIndex > -1 ? cart.items[existingIndex].quantity : 0;
    const totalDesiredQty = currentQty + parsedQuantity;

    // 6. Validate stock limit
    if (product.stock === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product is currently out of stock',
        error: 'Product is currently out of stock',
      });
    }

    if (totalDesiredQty > product.stock) {
      return res.status(400).json({
        success: false,
        message: `Requested quantity (${totalDesiredQty}) exceeds available inventory (${product.stock})`,
        error: `Requested quantity (${totalDesiredQty}) exceeds available inventory (${product.stock})`,
      });
    }

    // 7. Update existing or push new item
    if (existingIndex > -1) {
      cart.items[existingIndex].quantity = totalDesiredQty;
      cart.items[existingIndex].price = product.price; // keep synchronized with current catalog price
    } else {
      cart.items.push({
        product: product._id,
        name: product.name,
        brand: product.brand,
        price: product.price,
        quantity: parsedQuantity,
        image: product.image || (product.images && product.images[0]) || '',
      });
    }

    // 8. Recalculate totals and persist
    cart.recalculateTotals();
    await cart.save();

    cart = await populateCart(Cart.findById(cart._id));

    return res.status(200).json({
      success: true,
      message: 'Item added to cart',
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update line item quantity
 * @route   PUT /api/cart/items/:productId
 * @access  Private
 */
const updateCartItem = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    // 1. Validate Product ID parameter
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID parameter',
        error: 'Invalid product ID parameter',
      });
    }

    // 2. Validate Quantity
    if (quantity === undefined || quantity === null) {
      return res.status(400).json({
        success: false,
        message: 'Quantity is required',
        error: 'Quantity is required',
      });
    }

    const parsedQuantity = Number(quantity);
    if (isNaN(parsedQuantity) || !Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a non-negative integer (0 or greater)',
        error: 'Quantity must be a non-negative integer (0 or greater)',
      });
    }

    // 3. Find Cart
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found',
        error: 'Cart not found',
      });
    }

    // 4. Locate Item in Cart
    const itemIndex = cart.items.findIndex(
      (item) =>
        (item.product && item.product.toString() === productId) ||
        (item._id && item._id.toString() === productId)
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart',
        error: 'Item not found in cart',
      });
    }

    // 5. Quantity === 0: Remove Item
    if (parsedQuantity === 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      // 6. Quantity > 0: Validate catalog stock
      const product = await Product.findById(cart.items[itemIndex].product);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found in catalog',
          error: 'Product not found in catalog',
        });
      }

      if (parsedQuantity > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Requested quantity (${parsedQuantity}) exceeds available inventory (${product.stock})`,
          error: `Requested quantity (${parsedQuantity}) exceeds available inventory (${product.stock})`,
        });
      }

      cart.items[itemIndex].quantity = parsedQuantity;
      cart.items[itemIndex].price = product.price;
    }

    // 7. Recalculate totals and persist
    cart.recalculateTotals();
    await cart.save();

    cart = await populateCart(Cart.findById(cart._id));

    return res.status(200).json({
      success: true,
      message: 'Cart updated successfully',
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove specific line item from cart
 * @route   DELETE /api/cart/items/:productId
 * @access  Private
 */
const removeCartItem = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID parameter',
        error: 'Invalid product ID parameter',
      });
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found',
        error: 'Cart not found',
      });
    }

    const itemIndex = cart.items.findIndex(
      (item) =>
        (item.product && item.product.toString() === productId) ||
        (item._id && item._id.toString() === productId)
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart',
        error: 'Item not found in cart',
      });
    }

    cart.items.splice(itemIndex, 1);
    cart.recalculateTotals();
    await cart.save();

    cart = await populateCart(Cart.findById(cart._id));

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Clear entire cart
 * @route   DELETE /api/cart
 * @access  Private
 */
const clearCart = async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = await getOrCreateCart(req.user._id);
    }

    cart.items = [];
    cart.subtotal = 0;
    cart.tax = 0;
    cart.shipping = 0;
    cart.grandTotal = 0;
    cart.itemCount = 0;

    await cart.save();

    return res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      cart,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
};
```

---

## 8. Integration Test Plan (`tests/cart.test.js`)

To guarantee 100% test suite cleanliness for `npm test`, the following test suites should be placed in `tests/cart.test.js`:

1. **Authentication Enforcement**:
   - `GET /api/cart` without token -> 401
   - `POST /api/cart/items` without token -> 401
   - `PUT /api/cart/items/:id` without token -> 401
   - `DELETE /api/cart/items/:id` without token -> 401
   - `DELETE /api/cart` without token -> 401
2. **Cart Lifecycle Operations (F15)**:
   - Initial empty cart retrieval.
   - Add product to cart.
   - Increment product quantity by adding same product again.
   - Update quantity to 4 units.
   - Update quantity to 0 units (removes item).
   - Remove item explicitly via `DELETE /api/cart/items/:productId`.
   - Clear entire cart via `DELETE /api/cart`.
3. **Pricing Engine Precision (F16)**:
   - Verify subtotal = $\sum(\text{price} \times \text{qty})$.
   - Verify 8% tax calculation on fractional amounts (e.g. $39.99 $\to$ $3.20 tax).
   - Verify shipping fee is $5.99 when subtotal is $49.99 or below.
   - Verify shipping fee is $0.00 when subtotal is $50.00 or above.
   - Verify shipping fee is $0.00 when cart is empty ($0.00).
   - Verify grand total equals subtotal + tax + shipping.
4. **Adversarial & Boundary Hardening**:
   - Reject quantity 0 on add (`POST /api/cart/items`) -> 400.
   - Reject negative quantity -> 400.
   - Reject non-numeric quantity (`"five"`) -> 400.
   - Reject quantity exceeding catalog stock -> 400.
   - Reject invalid non-ObjectId product IDs -> 400.
   - Reject non-existent product IDs -> 404.
   - Reject update/delete for items not in the cart -> 404.
5. **Multi-User Isolation**:
   - User 1 adds item A; User 2 cart remains empty.
   - User 1 clears cart; User 2 cart remains untouched.

---

## 9. Downstream Hand-Off to Explorer 3 & Workers

1. **Explorer 3 (Orders & Checkout)**:
   - During `POST /api/orders/checkout`, `orderController` will:
     - Read the user's cart via `Cart.findOne({ user: req.user._id })`.
     - Reject if `cart.items.length === 0` with HTTP 400.
     - Call `validateCartStock(cart)` from `cartService.js`.
     - Decrement stock atomically: `Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } })`.
     - Create `Order` document snapshotting cart item fields and pricing totals.
     - Call `clearUserCart(req.user._id)` from `cartService.js` to empty the cart.
2. **Worker Implementation Plan**:
   - Worker can immediately create `src/services/cartService.js`, `src/controllers/cartController.js`, `src/routes/cartRoutes.js`, and `tests/cart.test.js`.
   - Run verification via `npm test tests/cart.test.js` and `npm run test:e2e`.
