import apiClient from '../../api/client';

export const documentApi = {
  async getDocuments() {
    return apiClient.get('/api/documents');
  },

  async getDocument(docId) {
    return apiClient.get(`/api/documents/${docId}`);
  },

  async createDocument(title, content) {
    return apiClient.post('/api/documents', { title, content });
  },

  async updateDocument(docId, title, content) {
    return apiClient.patch(`/api/documents/${docId}`, { title, content });
  },

  async deleteDocument(docId) {
    return apiClient.del(`/api/documents/${docId}`);
  },
};
