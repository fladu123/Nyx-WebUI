import apiClient from '../../api/client';

export const searchApi = {
  async search(query) {
    const results = await apiClient.get(`/api/search?q=${encodeURIComponent(query)}`);
    return { chats: results, projects: [], documents: [] };
  },
};
