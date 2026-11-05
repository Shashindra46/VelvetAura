# Modal CSS & DOM Layout Investigation Report: VelvetAura Admin Product Modals

## 1. Observation

### 1.1 Modal Rendering in `public/js/components/adminDashboard.js`
In `public/js/components/adminDashboard.js` (lines 479–568), the Edit and Add Product modal template is defined verbatim as:

```javascript
    return `
      <div class="admin-modal-overlay">
        <div class="admin-modal-dialog admin-modal-lg glass-elevated" role="dialog" aria-modal="true" aria-labelledby="prod-modal-title">
          <div class="admin-modal-header">
            <h3 id="prod-modal-title" style="color: var(--text-high); display: flex; align-items: center; gap: 8px;">
              <span>${isEdit ? '✏️' : '✨'}</span> ${title}
            </h3>
            <button type="button" class="admin-modal-close" id="btn-cancel-modal">✕</button>
          </div>

          <form id="admin-product-form" class="admin-modal-body admin-form-grid">
            <!-- Row 1: Name & Brand -->
            <div class="form-group col-span-2">
              <label for="form-prod-name">Product Name *</label>
              <input type="text" id="form-prod-name" name="name" class="glass-input" required minlength="2" placeholder="e.g. Absolue Revitalizing Soft Cream" value="${escapeHtml(prod.name || '')}" />
            </div>

            <div class="form-group">
              <label for="form-prod-brand">Brand Name *</label>
              <input type="text" id="form-prod-brand" name="brand" class="glass-input" required placeholder="e.g. Lancôme" value="${escapeHtml(prod.brand || '')}" />
            </div>

            <div class="form-group">
              <label for="form-prod-origin">Import Origin Country *</label>
              <input type="text" id="form-prod-origin" name="origin" class="glass-input" required placeholder="e.g. France, South Korea, Japan" value="${escapeHtml(prod.origin || '')}" />
            </div>

            <!-- Row 2: Category & Subcategory -->
            <div class="form-group">
              <label for="form-prod-category">Category *</label>
              <select id="form-prod-category" name="category" class="glass-select" required>
                <option value="" disabled ${!prod.category ? 'selected' : ''}>Select Category</option>
                <option value="skincare" ${prod.category === 'skincare' ? 'selected' : ''}>Skincare</option>
                <option value="cosmetics" ${prod.category === 'cosmetics' ? 'selected' : ''}>Cosmetics</option>
                <option value="fragrances" ${prod.category === 'fragrances' ? 'selected' : ''}>Fragrances</option>
                <option value="haircare" ${prod.category === 'haircare' ? 'selected' : ''}>Haircare</option>
              </select>
            </div>

            <div class="form-group">
              <label for="form-prod-subcategory">Subcategory</label>
              <input type="text" id="form-prod-subcategory" name="subcategory" class="glass-input" placeholder="e.g. Moisturizer, Eau de Parfum" value="${escapeHtml(prod.subcategory || '')}" />
            </div>

            <!-- Row 3: Price & Stock -->
            <div class="form-group">
              <label for="form-prod-price">Retail Price (USD) *</label>
              <input type="number" step="0.01" min="0" id="form-prod-price" name="price" class="glass-input" required placeholder="0.00" value="${prod.price !== undefined ? prod.price : ''}" />
            </div>

            <div class="form-group">
              <label for="form-prod-stock">Vault Stock Quantity *</label>
              <input type="number" step="1" min="0" id="form-prod-stock" name="stock" class="glass-input" required placeholder="0" value="${prod.stock !== undefined ? prod.stock : '15'}" />
            </div>

            <!-- Row 4: Image URL -->
            <div class="form-group col-span-2">
              <label for="form-prod-image">Hero Image URL</label>
              <input type="url" id="form-prod-image" name="image" class="glass-input" placeholder="https://..." value="${escapeHtml((prod.images && prod.images[0]) || prod.image || '')}" />
            </div>

            <!-- Row 5: Volume & Featured -->
            <div class="form-group">
              <label for="form-prod-volume">Volume / Size</label>
              <input type="text" id="form-prod-volume" name="volume" class="glass-input" placeholder="e.g. 50 ml / 1.7 oz" value="${escapeHtml(prod.volume || '')}" />
            </div>

            <div class="form-group" style="display: flex; align-items: center; gap: 8px; margin-top: 24px;">
              <input type="checkbox" id="form-prod-featured" name="featured" ${prod.featured ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent-gold);" />
              <label for="form-prod-featured" style="cursor: pointer; color: var(--text-high); font-size: 0.9rem;">Feature on Homepage Banner</label>
            </div>

            <!-- Row 6: Description -->
            <div class="form-group col-span-2">
              <label for="form-prod-description">Product Description * (min 10 characters)</label>
              <textarea id="form-prod-description" name="description" class="glass-input" rows="4" required minlength="10" placeholder="Detail the luxury formulation, artisanal extraction, and sensory benefits...">${escapeHtml(prod.description || '')}</textarea>
            </div>

            <div id="form-prod-error" class="form-error-msg col-span-2 hidden"></div>

            <div class="admin-modal-footer col-span-2">
              <button type="button" class="btn-secondary-glass" id="btn-cancel-modal">Cancel</button>
              <button type="submit" class="btn-primary-gold" id="btn-submit-product">
                ${isEdit ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
```

In the Delete modal template (`public/js/components/adminDashboard.js`, lines 448–471):
```javascript
      return `
        <div class="admin-modal-overlay">
          <div class="admin-modal-dialog glass-elevated" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
            <div class="admin-modal-header">
              <h3 id="delete-modal-title" style="color: var(--status-danger); display: flex; align-items: center; gap: 8px;">
                <span>⚠️</span> Confirm Permanent Deletion
              </h3>
              <button type="button" class="admin-modal-close" id="btn-cancel-modal">✕</button>
            </div>
            <div class="admin-modal-body">
              <p style="color: var(--text-high); margin-bottom: 12px;">
                Are you sure you want to permanently delete <strong style="color: var(--accent-gold);">${escapeHtml(prod.name || 'this item')}</strong> from the catalog?
              </p>
              <p style="color: var(--text-dim); font-size: 0.85rem;">
                This product will immediately be removed from client storefront listings and cannot be recovered.
              </p>
            </div>
            <div class="admin-modal-footer">
              <button type="button" class="btn-secondary-glass" id="btn-cancel-modal">Cancel</button>
              <button type="button" class="btn-danger-solid" id="btn-confirm-delete" data-product-id="${prod._id}">
                Delete Product
              </button>
            </div>
          </div>
        </div>
      `;
```

### 1.2 Current Modal CSS in `public/css/components.css`
In `public/css/components.css` (lines 2375–2445):
```css
/* Admin Modals */
.admin-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(11, 11, 19, 0.85);
  backdrop-filter: var(--blur-heavy);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-md);
  animation: fadeIn 0.25s ease-out;
}

.admin-modal-dialog {
  width: 100%;
  max-width: 520px;
  background: rgba(22, 19, 36, 0.95);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(157, 78, 221, 0.2);
}

.admin-modal-dialog.admin-modal-lg {
  max-width: 680px;
  max-height: 90vh;
  overflow-y: auto;
}

.admin-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--glass-border-subtle);
  padding-bottom: var(--space-md);
  margin-bottom: var(--space-lg);
}

.admin-modal-close {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px;
}

.admin-modal-close:hover {
  color: var(--text-high);
}

.admin-form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
}

.col-span-2 {
  grid-column: span 2;
}

.admin-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-md);
  border-top: 1px solid var(--glass-border-subtle);
  padding-top: var(--space-md);
  margin-top: var(--space-md);
}
```

Notice:
1. `.admin-modal-body` has **0 CSS rules** anywhere in `components.css` or the entire styles directory.
2. `.admin-modal-dialog` is `display: block` with `padding: var(--space-xl)` (32px).
3. `overflow-y: auto` is placed directly on `.admin-modal-dialog.admin-modal-lg` outer container, rather than on the body.
4. `.admin-modal-overlay` has `display: flex; align-items: center; justify-content: center;` with **no `overflow-y: auto`**.

### 1.3 Test Suite Status
Running `npm test` synchronously verifies that all 9 test suites and 141 tests pass (Jest test command: `jest --runInBand --detectOpenHandles --forceExit`).

---

## 2. Logic Chain

### Step 1: The Flexbox Centering Overflow ("Data Loss") Bug
- **Observation**: `.admin-modal-overlay` has `display: flex; align-items: center; justify-content: center;` and does not have `overflow-y: auto;` or `overscroll-behavior`.
- **Reasoning**:
  1. In the CSS Flexbox specification, when `align-items: center` is applied, the flex item is centered along the cross-axis. If the flex item's height exceeds the container's height (or viewport height minus padding), the browser computes:
     `offset_top = (viewport_height - item_height) / 2 < 0`.
  2. This pushes the top of `.admin-modal-dialog` above the top edge of the viewport into negative coordinate space (`top < 0`).
  3. Because `.admin-modal-overlay` has no scrollbar (`overflow-y: auto`), any element rendered in negative coordinate space cannot be reached by user scrolling.
  4. Even if `overflow-y: auto` is placed on the overlay, `align-items: center` without `margin: auto` locks the scroll origin at `top: 0`, leaving content in negative coordinates clipped permanently.
  5. On smaller viewports (e.g. laptop 768px screens with browser chrome where visible viewport is ~600px, tablets, or mobile landscape 375px–500px), a dialog with 950px+ of content easily overflows.

### Step 2: Monolithic Scrolling Container Displaces Header and Top Inputs
- **Observation**: `overflow-y: auto` is declared on `.admin-modal-dialog.admin-modal-lg` (line 2402), which wraps both `.admin-modal-header` and `<form id="admin-product-form">`.
- **Reasoning**:
  1. Because the entire dialog is the scroll container, `.admin-modal-header` is placed inside the scrollable flow.
  2. The form contains 11 distinct input controls spanning 6 grid rows plus description and footer. Combined content height exceeds 900px (and > 1200px on mobile).
  3. Whenever a user interacts with the form or focuses an input below the fold, or when scrolling down to inspect price, stock, image, or description:
     The entire inner content shifts upward.
  4. The `.admin-modal-header` (the modal title and "✕" close button) scrolls **completely out of the viewport**, leaving the user without any visible context or immediate dismiss button.
  5. The top inputs (`Product Name`, `Brand Name`, `Import Origin`) get pushed past the top scroll boundary and clipped against the dialog's top padding.

### Step 3: Missing Flex-Column Layout and Unstyled `.admin-modal-body`
- **Observation**: `.admin-modal-body` is written as a class in `adminDashboard.js` line 489, but searching `public/css/components.css` yields 0 rules for `.admin-modal-body`.
- **Reasoning**:
  1. To create a modern, non-clipping modal window, the dialog must act as a `display: flex; flex-direction: column;` frame.
  2. Within this frame:
     - `.admin-modal-header` must be `flex-shrink: 0;` (pinned at the top, permanently visible).
     - `.admin-modal-body` must be `flex: 1 1 auto; overflow-y: auto; min-height: 0;` (the only part that scrolls).
     - `.admin-modal-footer` must be `flex-shrink: 0;` (pinned at the bottom, permanently visible).
  3. Right now, because `.admin-modal-dialog` is a plain block and `.admin-modal-body` has no styles, this 3-tier hierarchy does not exist.

### Step 4: Padding Collision on Dialog Shell
- **Observation**: `.admin-modal-dialog` has `padding: var(--space-xl)` (32px), while `.admin-modal-dialog.admin-modal-lg` adds `overflow-y: auto`.
- **Reasoning**:
  1. When padding is set on a scrolling container, standard browser rendering draws the scrollbar inside the padding box.
  2. When content scrolls, the top padding scrolls away, causing the top elements to collide directly against the upper edge of the dialog frame.
  3. Padding should instead be removed from `.admin-modal-dialog` (`padding: 0;`) and applied cleanly inside `.admin-modal-header`, `.admin-modal-body`, and `.admin-modal-footer`.

---

## 3. Caveats

1. **DOM Structure Variations**:
   - In `adminDashboard.js`, the `<form id="admin-product-form" class="admin-modal-body admin-form-grid">` currently wraps all input fields AND `.admin-modal-footer`.
   - If the worker restructures the DOM so `<form id="admin-product-form" class="admin-modal-form">` wraps the dialog internals (`header`, `body`, `footer`), native form submission and button scoping will work seamlessly.
   - If the worker chooses NOT to change the DOM in `adminDashboard.js`, a pure CSS backward-compatible solution using `position: sticky; bottom: 0;` on `.admin-modal-footer` can also achieve pinned-footer behavior. Both options are documented below.
2. **Multipart Image Upload Work**:
   - Parallel work for Milestone 5 Refinement Issue 2 (replacing Hero Image URL with file upload) will add image preview and upload controls to the form body. With the scrollable body architecture, adding file upload controls will naturally fit without affecting modal layout or clipping the top.

---

## 4. Conclusion & Proposed Changes

To eliminate the top cutoff across all viewport heights and ensure smooth, non-clipping modal behavior:
1. Add `overflow-y: auto;` and `overscroll-behavior: contain;` to `.admin-modal-overlay`.
2. Apply `margin: auto;` to `.admin-modal-dialog` inside the flex overlay, which prevents negative coordinate clipping when dialog height approaches or exceeds viewport height.
3. Convert `.admin-modal-dialog` into a flex column: `display: flex; flex-direction: column; overflow: hidden; max-height: min(90vh, 880px);`.
4. Pin `.admin-modal-header` with `flex-shrink: 0;` and move its padding internally.
5. Create `.admin-modal-body` as the dedicated scroll container: `flex: 1 1 auto; overflow-y: auto; min-height: 0;` with smooth custom scrollbars.
6. Pin `.admin-modal-footer` with `flex-shrink: 0;` so action buttons remain accessible at all times without scrolling.
7. Add mobile media query adjustments for viewports under 640px.

### Exact Code Recommendations

#### Recommendation A: CSS Changes for `public/css/components.css`
Replace lines 2375–2446 in `public/css/components.css` with:

```css
/* =========================================================================
   Admin Modals (Fixed-Header, Pinned-Footer, Scrollable-Body Architecture)
   ========================================================================= */

.admin-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(11, 11, 19, 0.85);
  backdrop-filter: var(--blur-heavy);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-md);
  overflow-y: auto;
  overscroll-behavior: contain;
  animation: fadeIn 0.25s ease-out;
}

.admin-modal-dialog {
  width: 100%;
  max-width: 520px;
  max-height: min(90vh, 880px);
  margin: auto;
  background: rgba(22, 19, 36, 0.95);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(157, 78, 221, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding: 0;
}

.admin-modal-dialog.admin-modal-lg {
  max-width: 720px;
  max-height: 90vh;
}

/* Modal Form Wrapper (when <form> wraps header, body, footer) */
.admin-modal-form {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 90vh;
  min-height: 0;
  overflow: hidden;
}

/* 1. Pinned Header: Never scrolls, always visible at top */
.admin-modal-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--glass-border-subtle);
  padding: var(--space-lg) var(--space-xl) var(--space-md);
  background: rgba(22, 19, 36, 0.98);
  z-index: 10;
}

.admin-modal-close {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.admin-modal-close:hover {
  color: var(--text-high);
  background: rgba(255, 255, 255, 0.08);
}

/* 2. Scrollable Body: Houses inputs, smoothly scrolls, never clips top */
.admin-modal-body {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
  padding: var(--space-lg) var(--space-xl);
  scrollbar-width: thin;
  scrollbar-color: rgba(224, 169, 109, 0.35) transparent;
  -webkit-overflow-scrolling: touch;
}

.admin-modal-body::-webkit-scrollbar {
  width: 6px;
}

.admin-modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.admin-modal-body::-webkit-scrollbar-thumb {
  background: rgba(224, 169, 109, 0.3);
  border-radius: var(--radius-full);
}

.admin-modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(224, 169, 109, 0.55);
}

/* Form Grid */
.admin-form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
}

.col-span-2 {
  grid-column: span 2;
}

/* 3. Pinned Footer: Action buttons always visible and accessible */
.admin-modal-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-md);
  border-top: 1px solid var(--glass-border-subtle);
  padding: var(--space-md) var(--space-xl) var(--space-lg);
  background: rgba(22, 19, 36, 0.98);
  z-index: 10;
}

/* Backwards-compatibility fallback if footer remains inside form-grid: */
.admin-form-grid .admin-modal-footer {
  position: sticky;
  bottom: 0;
  margin-top: var(--space-md);
  margin-left: calc(-1 * var(--space-xl));
  margin-right: calc(-1 * var(--space-xl));
  margin-bottom: calc(-1 * var(--space-lg));
  padding: var(--space-md) var(--space-xl);
}
```

And in the responsive media queries section of `public/css/components.css` (lines 2497–2514):
```css
@media (max-width: 639px) {
  .admin-modal-overlay {
    padding: var(--space-xs);
    align-items: flex-start;
  }
  .admin-modal-dialog {
    max-height: 94vh;
    border-radius: var(--radius-lg);
    margin: var(--space-xs) auto;
  }
  .admin-modal-header {
    padding: var(--space-md) var(--space-lg);
  }
  .admin-modal-body {
    padding: var(--space-md) var(--space-lg);
  }
  .admin-modal-footer {
    padding: var(--space-md) var(--space-lg);
  }
  .admin-kpi-grid {
    grid-template-columns: 1fr;
  }
  .admin-form-grid {
    grid-template-columns: 1fr;
    gap: var(--space-sm);
  }
  .col-span-2 {
    grid-column: span 1;
  }
  .admin-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .admin-search-wrap {
    min-width: 100%;
  }
}
```

---

#### Recommendation B: DOM Structure in `public/js/components/adminDashboard.js`
In `public/js/components/adminDashboard.js`, restructure the `renderModal` method for Add/Edit (lines 480–568) so `<form>` wraps the header, scrollable body, and footer:

```javascript
    return `
      <div class="admin-modal-overlay">
        <div class="admin-modal-dialog admin-modal-lg glass-elevated" role="dialog" aria-modal="true" aria-labelledby="prod-modal-title">
          <form id="admin-product-form" class="admin-modal-form">
            <!-- Non-shrinking pinned header -->
            <div class="admin-modal-header">
              <h3 id="prod-modal-title" style="color: var(--text-high); display: flex; align-items: center; gap: 8px;">
                <span>${isEdit ? '✏️' : '✨'}</span> ${title}
              </h3>
              <button type="button" class="admin-modal-close" id="btn-cancel-modal" aria-label="Close dialog">✕</button>
            </div>

            <!-- Scrollable body: inputs only -->
            <div class="admin-modal-body">
              <div class="admin-form-grid">
                <!-- Row 1: Name & Brand -->
                <div class="form-group col-span-2">
                  <label for="form-prod-name">Product Name *</label>
                  <input type="text" id="form-prod-name" name="name" class="glass-input" required minlength="2" placeholder="e.g. Absolue Revitalizing Soft Cream" value="${escapeHtml(prod.name || '')}" />
                </div>

                <div class="form-group">
                  <label for="form-prod-brand">Brand Name *</label>
                  <input type="text" id="form-prod-brand" name="brand" class="glass-input" required placeholder="e.g. Lancôme" value="${escapeHtml(prod.brand || '')}" />
                </div>

                <div class="form-group">
                  <label for="form-prod-origin">Import Origin Country *</label>
                  <input type="text" id="form-prod-origin" name="origin" class="glass-input" required placeholder="e.g. France, South Korea, Japan" value="${escapeHtml(prod.origin || '')}" />
                </div>

                <!-- Row 2: Category & Subcategory -->
                <div class="form-group">
                  <label for="form-prod-category">Category *</label>
                  <select id="form-prod-category" name="category" class="glass-select" required>
                    <option value="" disabled ${!prod.category ? 'selected' : ''}>Select Category</option>
                    <option value="skincare" ${prod.category === 'skincare' ? 'selected' : ''}>Skincare</option>
                    <option value="cosmetics" ${prod.category === 'cosmetics' ? 'selected' : ''}>Cosmetics</option>
                    <option value="fragrances" ${prod.category === 'fragrances' ? 'selected' : ''}>Fragrances</option>
                    <option value="haircare" ${prod.category === 'haircare' ? 'selected' : ''}>Haircare</option>
                  </select>
                </div>

                <div class="form-group">
                  <label for="form-prod-subcategory">Subcategory</label>
                  <input type="text" id="form-prod-subcategory" name="subcategory" class="glass-input" placeholder="e.g. Moisturizer, Eau de Parfum" value="${escapeHtml(prod.subcategory || '')}" />
                </div>

                <!-- Row 3: Price & Stock -->
                <div class="form-group">
                  <label for="form-prod-price">Retail Price (USD) *</label>
                  <input type="number" step="0.01" min="0" id="form-prod-price" name="price" class="glass-input" required placeholder="0.00" value="${prod.price !== undefined ? prod.price : ''}" />
                </div>

                <div class="form-group">
                  <label for="form-prod-stock">Vault Stock Quantity *</label>
                  <input type="number" step="1" min="0" id="form-prod-stock" name="stock" class="glass-input" required placeholder="0" value="${prod.stock !== undefined ? prod.stock : '15'}" />
                </div>

                <!-- Row 4: Image Upload / Hero Image URL -->
                <div class="form-group col-span-2">
                  <label for="form-prod-image">Hero Image URL</label>
                  <input type="url" id="form-prod-image" name="image" class="glass-input" placeholder="https://..." value="${escapeHtml((prod.images && prod.images[0]) || prod.image || '')}" />
                </div>

                <!-- Row 5: Volume & Featured -->
                <div class="form-group">
                  <label for="form-prod-volume">Volume / Size</label>
                  <input type="text" id="form-prod-volume" name="volume" class="glass-input" placeholder="e.g. 50 ml / 1.7 oz" value="${escapeHtml(prod.volume || '')}" />
                </div>

                <div class="form-group" style="display: flex; align-items: center; gap: 8px; margin-top: 24px;">
                  <input type="checkbox" id="form-prod-featured" name="featured" ${prod.featured ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent-gold);" />
                  <label for="form-prod-featured" style="cursor: pointer; color: var(--text-high); font-size: 0.9rem;">Feature on Homepage Banner</label>
                </div>

                <!-- Row 6: Description -->
                <div class="form-group col-span-2">
                  <label for="form-prod-description">Product Description * (min 10 characters)</label>
                  <textarea id="form-prod-description" name="description" class="glass-input" rows="4" required minlength="10" placeholder="Detail the luxury formulation, artisanal extraction, and sensory benefits...">${escapeHtml(prod.description || '')}</textarea>
                </div>

                <div id="form-prod-error" class="form-error-msg col-span-2 hidden"></div>
              </div>
            </div>

            <!-- Non-shrinking pinned footer -->
            <div class="admin-modal-footer">
              <button type="button" class="btn-secondary-glass" id="btn-cancel-modal">Cancel</button>
              <button type="submit" class="btn-primary-gold" id="btn-submit-product">
                ${isEdit ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
```

---

## 5. Verification Method

To independently verify the fix:

1. **Automated Test Suite**:
   Execute `npm test`. All 9 test suites and 141 tests must pass:
   ```bash
   npm test
   ```
2. **Visual & Responsive Verification across Viewport Heights**:
   - **Height = 600px (standard laptop with toolbars)**: Open Edit Product modal. Verify modal header ("✏️ Edit Luxury Product" and "✕") is 100% visible at the top. Verify Product Name, Brand Name, and Origin inputs are fully visible immediately without clipping.
   - **Height = 480px / 400px (mobile landscape or tight window)**: Open modal. Verify modal dialog does not get clipped off the top; the overlay scrolls smoothly, and the header remains visible and pinned.
   - **Height = 844px (mobile portrait, 390px width)**: Verify form grid collapses cleanly to a single column, dialog padding adjusts to 16px, body scrolls effortlessly via touch, and action buttons ("Cancel", "Save Changes") stay pinned at the bottom.
3. **Scroll Test**:
   - Scroll within the modal body to the Description field.
   - Confirm that `.admin-modal-header` stays pinned at the top and does not move.
   - Confirm that `.admin-modal-footer` stays pinned at the bottom and does not move.
4. **Invalidation Conditions**:
   - If the modal header or close button scrolls out of view when scrolling the form, the non-shrinking flex-column architecture was not properly applied.
   - If the top edge of the modal appears cut off at negative coordinates on 600px viewport heights, the overlay `overflow-y: auto` or dialog `margin: auto` is missing.
