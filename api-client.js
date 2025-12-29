// api-client.js
class ApiClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl || 'https://your-worker.workers.dev';
        this.token = localStorage.getItem('auth_token');
        this.userId = localStorage.getItem('user_id');
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;

        const response = await fetch(url, {
            ...options,
            headers: this.getHeaders()
        });

        if (response.status === 401) {
            // Token expired or invalid
            localStorage.clear();
            window.location.href = 'login.html';
            throw new Error('Session expired. Please login again.');
        }

        return response.json();
    }

    // User methods
    async login(username, password) {
        const data = await this.request('/api/v1/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (data.success) {
            this.token = data.token;
            this.userId = data.user_id;
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('user_id', data.user_id);
            localStorage.setItem('token_expires', data.expires_at);
        }

        return data;
    }

    async logout() {
        await this.request('/api/v1/logout', { method: 'POST' });
        localStorage.clear();
        this.token = null;
        this.userId = null;
    }

    async getProfile() {
        return this.request('/api/v1/profile');
    }

    // Config methods
    async getConfig() {
        return this.request(`/api/v1/user/${this.userId}/config`);
    }

    async saveConfig(config) {
        return this.request(`/api/v1/user/${this.userId}/config`, {
            method: 'POST',
            body: JSON.stringify(config)
        });
    }

    // Report methods
    async getReport(diseaseId, monthId) {
        return this.request(`/api/v1/user/${this.userId}/report/${diseaseId}/${monthId}`);
    }

    async saveReport(reportData) {
        return this.request(`/api/v1/user/${this.userId}/report`, {
            method: 'POST',
            body: JSON.stringify(reportData)
        });
    }

    async getAllReports() {
        return this.request(`/api/v1/user/${this.userId}/reports`);
    }

    // Check if token is valid
    isAuthenticated() {
        if (!this.token || !this.userId) return false;

        const expiresAt = localStorage.getItem('token_expires');
        if (!expiresAt) return false;

        return new Date() < new Date(expiresAt);
    }
}

// Create global instance
const api = new ApiClient();

// Auto-logout when token expires
function setupTokenExpiryCheck() {
    const checkToken = () => {
        if (!api.isAuthenticated()) {
            localStorage.clear();
            window.location.href = 'login.html';
        }
    };

    // Check every minute
    setInterval(checkToken, 60000);
}

// Initialize on page load
if (typeof window !== 'undefined') {
    setupTokenExpiryCheck();
}