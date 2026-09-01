import apiClient from '../../api/client';

export const authApi = {
  async login(username, password) {
    const data = await apiClient.post('/api/auth/login', { username, password });
    return data;
  },

  async register(username, password, email) {
    const data = await apiClient.post('/api/auth/register', { username, password, email });
    return data;
  },

  async logout() {
    try {
      await apiClient.post('/api/auth/logout', {});
    } catch {
      // Backend may reject on missing session; still logout locally
    }
  },

  async getMe() {
    return apiClient.get('/api/auth/me');
  },
};
