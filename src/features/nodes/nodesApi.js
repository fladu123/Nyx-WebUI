import apiClient from '../../api/client';

export const nodesApi = {
  async getNodes() {
    return apiClient.get('/api/nodes');
  },

  async probeAll() {
    return apiClient.get('/api/nodes/probe-all');
  },

  async addNode(name, url, priority, mode) {
    return apiClient.post('/api/nodes', { name, url, priority, mode });
  },

  async updateNode(nodeId, patch) {
    return apiClient.patch(`/api/nodes/${nodeId}`, patch);
  },

  async deleteNode(nodeId) {
    return apiClient.del(`/api/nodes/${nodeId}`);
  },

  async scanNetwork(subnet = null, port = 11434) {
    return apiClient.post('/api/nodes/scan', { subnet: subnet?.trim() || null, port });
  },
};
