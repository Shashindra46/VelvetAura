/**
 * VelvetAura - Authentication Modal Component
 * Smooth tabbed Sign In / Create Account modal with validation and 1-click test credentials.
 */

import { BaseComponent, escapeHtml } from './base.js';
import store from '../store.js';

export class AuthModalComponent extends BaseComponent {
  constructor(containerSelector = '#auth-modal-container', options = {}) {
    super(containerSelector, options);
    this.currentTab = 'login';
    this.errorMessage = null;
  }

  init() {
    super.init();

    // Subscribe to ui slice for authModal state
    this.unsubscribers.push(
      store.subscribe('ui', (ui) => {
        if (ui.authModal) {
          this.currentTab = ui.authModal.mode || 'login';
          this.render();
        }
      })
    );
  }

  render() {
    if (!this.container) return;

    const uiState = store.getState('ui') || {};
    const authModalState = uiState.authModal || {};
    const authState = store.getState('auth') || {};

    if (!authModalState.isOpen) {
      this.container.innerHTML = '';
      return;
    }

    const isLogin = this.currentTab === 'login';
    const isLoading = authState.loading || false;

    this.container.innerHTML = `
      <div id="auth-modal" class="modal-overlay glass-backdrop is-open" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div class="modal-dialog auth-dialog glass-elevated">
          <!-- Close Button -->
          <button type="button" id="auth-close-btn" class="modal-close-btn" aria-label="Close Authentication Dialog">✕</button>

          <div class="auth-header">
            <h2 id="auth-modal-title" class="auth-title">Velvet<span class="text-gold">Aura</span> Luxe Club</h2>
            <p class="auth-subtitle">Sign in to manage your bonded shipments, order history, and exclusive imports.</p>
          </div>

          <!-- Tabs: Sign In vs Register -->
          <div class="auth-tabs glass-card">
            <button type="button" id="tab-login" class="auth-tab-btn ${isLogin ? 'active' : ''}" data-tab="login">Sign In</button>
            <button type="button" id="tab-register" class="auth-tab-btn ${!isLogin ? 'active' : ''}" data-tab="register">Create Account</button>
          </div>

          <!-- Quick-Fill Sandbox Customer Button -->
          <div class="auth-demo-action">
            <button type="button" id="btn-fill-demo-user" class="btn-demo-pill">
              ✨ Fill Demo Customer (camille@velvetaura.test)
            </button>
          </div>

          <!-- Error Alert Container -->
          ${
            this.errorMessage
              ? `<div class="auth-error-alert" role="alert">⚠ ${escapeHtml(this.errorMessage)}</div>`
              : ''
          }

          <!-- Sign In Form -->
          <form id="form-login" class="auth-form ${isLogin ? '' : 'hidden'}" novalidate>
            <div class="form-group">
              <label for="login-email">Email Address</label>
              <input type="email" id="login-email" class="glass-input" required autocomplete="email" placeholder="camille@velvetaura.test" />
            </div>

            <div class="form-group">
              <label for="login-password">Password</label>
              <input type="password" id="login-password" class="glass-input" required autocomplete="current-password" placeholder="••••••••" />
            </div>

            <button type="submit" id="btn-submit-login" class="btn-primary-gold btn-block" ${isLoading ? 'disabled' : ''}>
              ${isLoading ? '<span>Authenticating...</span>' : '<span>Sign In to VelvetAura</span>'}
            </button>
          </form>

          <!-- Register Form -->
          <form id="form-register" class="auth-form ${!isLogin ? '' : 'hidden'}" novalidate>
            <div class="form-group">
              <label for="reg-name">Full Name</label>
              <input type="text" id="reg-name" class="glass-input" required autocomplete="name" placeholder="Camille Dupont" />
            </div>

            <div class="form-group">
              <label for="reg-email">Email Address</label>
              <input type="email" id="reg-email" class="glass-input" required autocomplete="email" placeholder="camille@velvetaura.test" />
            </div>

            <div class="form-group">
              <label for="reg-password">Password (min. 6 characters)</label>
              <input type="password" id="reg-password" class="glass-input" required minlength="6" autocomplete="new-password" placeholder="••••••••" />
            </div>

            <button type="submit" id="btn-submit-register" class="btn-primary-gold btn-block" ${isLoading ? 'disabled' : ''}>
              ${isLoading ? '<span>Creating Account...</span>' : '<span>Create Luxury Account</span>'}
            </button>
          </form>
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    this.container.addEventListener('click', (e) => {
      // Close button
      if (e.target.closest('#auth-close-btn')) {
        this.errorMessage = null;
        store.closeAuthModal();
        return;
      }

      // Backdrop overlay click
      if (e.target.classList.contains('modal-overlay')) {
        this.errorMessage = null;
        store.closeAuthModal();
        return;
      }

      // Tab switcher
      const tabBtn = e.target.closest('.auth-tab-btn');
      if (tabBtn) {
        this.currentTab = tabBtn.dataset.tab;
        this.errorMessage = null;
        this.render();
        return;
      }

      // Fill Demo User button
      if (e.target.closest('#btn-fill-demo-user')) {
        const emailInput = this.container.querySelector('#login-email') || this.container.querySelector('#reg-email');
        const passInput = this.container.querySelector('#login-password') || this.container.querySelector('#reg-password');
        const nameInput = this.container.querySelector('#reg-name');

        if (emailInput) emailInput.value = 'camille@velvetaura.test';
        if (passInput) passInput.value = 'Password123!';
        if (nameInput) nameInput.value = 'Camille Dupont';

        store.showToast('Autofilled demo customer credentials', 'info');
        return;
      }
    });

    // Form Submissions
    this.container.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (e.target.id === 'form-login') {
        const email = this.container.querySelector('#login-email')?.value.trim();
        const password = this.container.querySelector('#login-password')?.value;

        if (!email || !password) {
          this.errorMessage = 'Please provide both email and password';
          this.render();
          return;
        }

        this.errorMessage = null;
        const res = await store.login({ email, password });
        if (!res.success) {
          this.errorMessage = res.error || 'Invalid email or password';
          this.render();
        }
      } else if (e.target.id === 'form-register') {
        const name = this.container.querySelector('#reg-name')?.value.trim();
        const email = this.container.querySelector('#reg-email')?.value.trim();
        const password = this.container.querySelector('#reg-password')?.value;

        if (!name || !email || !password) {
          this.errorMessage = 'Please provide name, email, and password';
          this.render();
          return;
        }

        if (password.length < 6) {
          this.errorMessage = 'Password must be at least 6 characters';
          this.render();
          return;
        }

        this.errorMessage = null;
        const res = await store.register({ name, email, password });
        if (!res.success) {
          this.errorMessage = res.error || 'Registration failed';
          this.render();
        }
      }
    });
  }
}

export default AuthModalComponent;
