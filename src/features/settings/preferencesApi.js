import apiClient from '../../api/client';

export const preferencesApi = {
  async getPreferences() {
    return apiClient.get('/api/prefs').catch(() => ({}));
  },

  async updatePreferences(prefs) {
    return apiClient.patch('/api/prefs', prefs).catch(() => ({}));
  },
};
