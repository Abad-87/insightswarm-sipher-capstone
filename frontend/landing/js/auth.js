const AUTH_API = 'http://localhost:8000';
const TOKEN_KEY = 'insightswarm_token';
const USER_KEY = 'insightswarm_user';

/*  state  */

const Auth = {
    getToken() { return localStorage.getItem(TOKEN_KEY); },
    setToken(t) { localStorage.setItem(TOKEN_KEY, t); },
    clearToken() { localStorage.removeItem(TOKEN_KEY); },

    getUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); }
        catch { return null; }
    },
    setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); },
    clearUser() { localStorage.removeItem(USER_KEY); },

    isLoggedIn() { return !!this.getToken(); },

    login(token, user) {
        this.setToken(token);
        if (user) this.setUser(user);
        renderAuthUI();
        try {
            const bc = new BroadcastChannel('insightswarm_auth');
            bc.postMessage({ type: 'LOGIN', token, user });
        } catch {}
    },

    logout() {
        this.clearToken();
        this.clearUser();
        renderAuthUI();
        showToast('Signed out successfully', 'info');
        try {
            const bc = new BroadcastChannel('insightswarm_auth');
            bc.postMessage({ type: 'LOGOUT' });
        } catch {}
    }
};

/*  API helpers  */

async function apiRegister(email, password) {
    const res = await fetch(`${AUTH_API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
        const msg = data.detail;
        if (msg === 'REGISTER_USER_ALREADY_EXISTS') throw new Error('An account with this email already exists.');
        if (typeof msg === 'string') throw new Error(msg);
        if (Array.isArray(msg)) throw new Error(msg.map(e => e.msg || e).join(', '));
        throw new Error('Registration failed. Please try again.');
    }
    return data;
}

async function apiLogin(email, password) {
    const body = new URLSearchParams();
    body.append('username', email);
    body.append('password', password);
    const res = await fetch(`${AUTH_API}/auth/jwt/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    const data = await res.json();
    if (!res.ok) {
        const msg = data.detail;
        if (msg === 'LOGIN_BAD_CREDENTIALS') throw new Error('Invalid email or password.');
        if (msg === 'LOGIN_USER_NOT_VERIFIED') throw new Error('Please verify your email first.');
        if (typeof msg === 'string') throw new Error(msg);
        throw new Error('Login failed. Please try again.');
    }
    return data;
}

async function apiFetchMe(token) {
    const res = await fetch(`${AUTH_API}/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Session expired');
    return await res.json();
}

/* toast notifications  */

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M6 10.5l2.5 2.5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        error: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
        info: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="6.5" r="1" fill="currentColor"/></svg>'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-msg">${message}</span>
    `;

    container.appendChild(toast);

    
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3400);
}

/*  auth modal  */

function openAuthModal(mode = 'signup', contextMessage = '') {
    // Remove existing modal if any
    closeAuthModal(true);

    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.id = 'auth-overlay';

    overlay.innerHTML = `
        <div class="auth-modal" id="auth-modal">
            <button class="auth-modal-close" id="auth-close" aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
            </button>

            <div class="auth-modal-header">
                <div class="auth-modal-brand">
                    <img src="favicon.svg" alt="" width="22" height="22">
                    <span>InsightSwarm</span>
                </div>
                ${contextMessage ? `<p class="auth-context-msg">${contextMessage}</p>` : ''}
            </div>

            <div class="auth-tabs" id="auth-tabs">
                <button class="auth-tab ${mode === 'signup' ? 'active' : ''}" data-tab="signup" type="button">Sign Up</button>
                <button class="auth-tab ${mode === 'signin' ? 'active' : ''}" data-tab="signin" type="button">Sign In</button>
                <div class="auth-tab-indicator"></div>
            </div>

            <form class="auth-form" id="auth-form" novalidate>
                <div class="auth-fields" id="auth-fields">
                    ${buildFormFields(mode)}
                </div>

                <div class="auth-error" id="auth-error"></div>

                <button type="submit" class="auth-submit" id="auth-submit">
                    <span class="auth-submit-text">${mode === 'signup' ? 'Create Account' : 'Sign In'}</span>
                    <span class="auth-submit-loader"></span>
                </button>
            </form>

            <div class="auth-footer">
                ${mode === 'signup'
                    ? '<span>Already have an account? <a href="#" class="auth-switch" data-switch="signin">Sign in</a></span>'
                    : '<span>Don\'t have an account? <a href="#" class="auth-switch" data-switch="signup">Sign up</a></span>'
                }
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Set initial indicator position
    const indicator = overlay.querySelector('.auth-tab-indicator');
    if (mode === 'signin') {
        indicator.style.transform = 'translateX(100%)';
    }

    // Entrance animation
    requestAnimationFrame(() => {
        overlay.classList.add('auth-overlay-visible');
    });

    // Bind events
    overlay.querySelector('#auth-close').addEventListener('click', closeAuthModal);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeAuthModal();
    });

    // Tab switching
    overlay.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
    });

    // Footer switch link
    overlay.querySelectorAll('.auth-switch').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            switchAuthTab(link.dataset.switch);
        });
    });

    // Form submit
    overlay.querySelector('#auth-form').addEventListener('submit', handleAuthSubmit);

    // Focus first input
    setTimeout(() => {
        const firstInput = overlay.querySelector('.auth-input');
        if (firstInput) firstInput.focus();
    }, 350);

    // Close on Escape
    document.addEventListener('keydown', handleEscKey);
}

function handleEscKey(e) {
    if (e.key === 'Escape') closeAuthModal();
}

function closeAuthModal(instant = false) {
    const overlay = document.getElementById('auth-overlay');
    if (!overlay) return;

    document.removeEventListener('keydown', handleEscKey);

    if (instant) {
        overlay.remove();
        return;
    }

    overlay.classList.remove('auth-overlay-visible');
    overlay.classList.add('auth-overlay-exit');
    setTimeout(() => overlay.remove(), 350);
}

function buildFormFields(mode) {
    if (mode === 'signup') {
        return `
            <div class="auth-field">
                <label class="auth-label" for="auth-email">Email</label>
                <input class="auth-input" id="auth-email" type="email" placeholder="you@example.com" required autocomplete="email">
            </div>
            <div class="auth-field">
                <label class="auth-label" for="auth-password">Password</label>
                <input class="auth-input" id="auth-password" type="password" placeholder="Min 8 characters" required minlength="8" autocomplete="new-password">
            </div>
            <div class="auth-field">
                <label class="auth-label" for="auth-confirm">Confirm Password</label>
                <input class="auth-input" id="auth-confirm" type="password" placeholder="Re-enter password" required minlength="8" autocomplete="new-password">
            </div>
        `;
    }
    return `
        <div class="auth-field">
            <label class="auth-label" for="auth-email">Email</label>
            <input class="auth-input" id="auth-email" type="email" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div class="auth-field">
            <label class="auth-label" for="auth-password">Password</label>
            <input class="auth-input" id="auth-password" type="password" placeholder="Your password" required autocomplete="current-password">
        </div>
    `;
}

function switchAuthTab(tab) {
    const tabsContainer = document.getElementById('auth-tabs');
    const fieldsContainer = document.getElementById('auth-fields');
    const errorEl = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit');
    const footerEl = document.querySelector('.auth-footer');

    if (!tabsContainer || !fieldsContainer) return;

    // Update active tab
    tabsContainer.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });

    // Update indicator position
    const indicator = tabsContainer.querySelector('.auth-tab-indicator');
    if (tab === 'signin') {
        indicator.style.transform = 'translateX(100%)';
    } else {
        indicator.style.transform = 'translateX(0)';
    }

    // Animate fields out then in
    fieldsContainer.classList.add('auth-fields-switching');
    setTimeout(() => {
        fieldsContainer.innerHTML = buildFormFields(tab);
        fieldsContainer.classList.remove('auth-fields-switching');

        // Clear error
        if (errorEl) { errorEl.textContent = ''; errorEl.classList.remove('visible'); }

        // Update submit button text
        const submitText = submitBtn.querySelector('.auth-submit-text');
        if (submitText) submitText.textContent = tab === 'signup' ? 'Create Account' : 'Sign In';

        // Update footer
        if (footerEl) {
            footerEl.innerHTML = tab === 'signup'
                ? '<span>Already have an account? <a href="#" class="auth-switch" data-switch="signin">Sign in</a></span>'
                : '<span>Don\'t have an account? <a href="#" class="auth-switch" data-switch="signup">Sign up</a></span>';
            footerEl.querySelectorAll('.auth-switch').forEach(link => {
                link.addEventListener('click', e => { e.preventDefault(); switchAuthTab(link.dataset.switch); });
            });
        }

        // Focus first input
        const firstInput = fieldsContainer.querySelector('.auth-input');
        if (firstInput) firstInput.focus();
    }, 200);
}

async function handleAuthSubmit(e) {
    e.preventDefault();

    const activeTab = document.querySelector('.auth-tab.active')?.dataset.tab || 'signup';
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const confirmInput = document.getElementById('auth-confirm');
    const errorEl = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit');

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;

    // Clear previous error
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.remove('visible'); }

    // Validation
    if (!email || !password) {
        showAuthError('Please fill in all fields.');
        return;
    }

    if (activeTab === 'signup') {
        const confirm = confirmInput?.value;
        if (password !== confirm) {
            showAuthError('Passwords do not match.');
            return;
        }
        if (password.length < 8) {
            showAuthError('Password must be at least 8 characters.');
            return;
        }
    }

    // Loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        if (activeTab === 'signup') {
            await apiRegister(email, password);
            showToast('Account created! Please sign in.', 'success');
            switchAuthTab('signin');
            // Pre-fill email
            setTimeout(() => {
                const emailField = document.getElementById('auth-email');
                if (emailField) emailField.value = email;
            }, 300);
        } else {
            const data = await apiLogin(email, password);
            let profile = { email };
            try {
                profile = await apiFetchMe(data.access_token);
            } catch {
                profile = { email };
            }

            Auth.login(data.access_token, profile);
            closeAuthModal();
            showToast('Welcome back!', 'success');
        }
    } catch (err) {
        showAuthError(err.message);
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

function showAuthError(msg) {
    const errorEl = document.getElementById('auth-error');
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.classList.add('visible');

    
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.add('shake');
        setTimeout(() => modal.classList.remove('shake'), 500);
    }
}



function renderAuthUI() {
    const container = document.getElementById('topbar-actions');
    if (!container) return;

    if (Auth.isLoggedIn()) {
        const user = Auth.getUser();
        const email = user?.email || 'User';
        const initial = email.charAt(0).toUpperCase();

        container.innerHTML = `
            <div class="user-menu" id="user-menu">
                <button class="user-avatar" id="user-avatar-btn" aria-label="User menu" title="${email}">
                    <span class="user-avatar-letter">${initial}</span>
                    <span class="user-avatar-ring"></span>
                </button>
                <div class="user-dropdown" id="user-dropdown">
                    <div class="user-dropdown-header">
                        <div class="user-dropdown-avatar">${initial}</div>
                        <div class="user-dropdown-info">
                            <span class="user-dropdown-label">Signed in as</span>
                            <span class="user-dropdown-email">${email}</span>
                        </div>
                    </div>
                    <div class="user-dropdown-divider"></div>
                    <button class="user-dropdown-item user-dropdown-logout" id="logout-btn">
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                            <path d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h3M10 14l4-4m0 0l-4-4m4 4H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Log Out
                    </button>
                </div>
            </div>
        `;

        // Avatar click toggles dropdown
        const avatarBtn = container.querySelector('#user-avatar-btn');
        const dropdown = container.querySelector('#user-dropdown');

        avatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
            avatarBtn.classList.toggle('active');
        });

        // Close dropdown on outside click
        document.addEventListener('click', () => {
            dropdown.classList.remove('open');
            avatarBtn.classList.remove('active');
        });

        // Logout
        container.querySelector('#logout-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.remove('open');
            Auth.logout();
        });

    } else {
        container.innerHTML = `
            <button class="get-started-btn" id="get-started-btn">
                <span class="get-started-glow"></span>
                <span class="get-started-text">Get Started</span>
                <svg class="get-started-arrow" width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        `;

        container.querySelector('#get-started-btn').addEventListener('click', () => {
            openAuthModal('signup');
        });
    }

    // Update dashboard lock state
    updateDashboardLock();
}



function updateDashboardLock() {
    const dashboardCard = document.getElementById('card-dashboard');
    if (!dashboardCard) return;

    let lockOverlay = dashboardCard.querySelector('.dashboard-lock');

    if (Auth.isLoggedIn()) {
        if (lockOverlay) {
            lockOverlay.classList.add('unlocking');
            lockOverlay.addEventListener('animationend', () => lockOverlay.remove());
        }
        dashboardCard.classList.remove('card-locked');
    } else {
        if (!lockOverlay) {
            lockOverlay = document.createElement('div');
            lockOverlay.className = 'dashboard-lock';
            lockOverlay.innerHTML = `
                <div class="lock-content">
                    <div class="lock-icon-wrap">
                        <svg class="lock-icon" width="28" height="28" viewBox="0 0 24 24" fill="none">
                            <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M8 11V7a4 4 0 118 0v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            <circle cx="12" cy="16" r="1.5" fill="currentColor"/>
                        </svg>
                    </div>
                    <span class="lock-text">Sign in to unlock</span>
                </div>
            `;
            dashboardCard.appendChild(lockOverlay);

            lockOverlay.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openAuthModal('signin', 'Sign in to access your Activity Dashboard');
            });
        }
        dashboardCard.classList.add('card-locked');
    }
}

/*  intercept card navigation for auth gating  */

function setupAuthGatedNavigation() {
    const dashboardCard = document.getElementById('card-dashboard');

    // Dashboard card: block if not signed in
    if (dashboardCard) {
        dashboardCard.addEventListener('click', (e) => {
            if (!Auth.isLoggedIn()) {
                e.preventDefault();
                e.stopPropagation();
                openAuthModal('signin', 'Sign in to access your Activity Dashboard');
            }
        }, true); // capture phase to intercept before existing handler
    }
}

/*  validate session on load  */

async function validateSession() {
    if (!Auth.isLoggedIn()) return;

    try {
        const user = await apiFetchMe(Auth.getToken());
        Auth.setUser(user);
    } catch {
        // Token expired / invalid
        Auth.clearToken();
        Auth.clearUser();
        showToast('Session expired. Please sign in again.', 'info');
    }

    renderAuthUI();
}

/*  init  */

function initAuth() {
    renderAuthUI();
    setupAuthGatedNavigation();
    validateSession();
}

document.addEventListener('DOMContentLoaded', initAuth);
