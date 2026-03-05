/* ══════════════════════════════════════════════════════════
   EASY TEACH — Global Utilities (app.js)
   Shared across all pages: auth helpers, toast, API config
   ══════════════════════════════════════════════════════════ */

window.EasyTeach = (() => {
    // In production, set window.__API_URL__ before loading app.js
    const API_URL = window.__API_URL__ || 'http://localhost:3000';

    // ── Auth helpers ─────────────────────────────────────────
    function getToken() {
        return localStorage.getItem('token');
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem('user') || 'null');
        } catch { return null; }
    }

    function logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }

    function requireAuth(requiredRole = null) {
        const token = getToken();
        const user = getUser();
        if (!token || !user) {
            window.location.href = 'login.html';
            return false;
        }
        if (requiredRole && user.role !== requiredRole) {
            window.location.href = user.role === 'admin' ? 'admin.html' : 'dashboard.html';
            return false;
        }
        return true;
    }

    // ── API Fetch helper ─────────────────────────────────────
    async function api(endpoint, options = {}) {
        const token = getToken();
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Remove Content-Type for FormData
        if (options.body instanceof FormData) {
            delete headers['Content-Type'];
        }

        const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
        const data = await res.json();

        if (res.status === 401) {
            logout();
            throw new Error('Sessão expirada');
        }

        if (!data.success) throw new Error(data.error || 'Erro desconhecido');
        return data.data;
    }

    // ── Toast notifications ──────────────────────────────────
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>${message}</span>
    `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // ── Logout button binding ────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }
    });

    return { API_URL, getToken, getUser, logout, requireAuth, api, showToast };
})();
