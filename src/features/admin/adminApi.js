import apiClient from '../../api/client';

export const adminApi = {
  async getPendingUsers() {
    return apiClient.get('/api/admin/users').then((users) => users.filter((user) => !user.approved)).catch(() => []);
  },

  async getAllUsers() {
    return apiClient.get('/api/admin/users').catch(() => []);
  },

  async approveUser(userId) {
    return apiClient.patch(`/api/admin/users/${userId}/approve`, { approved: true });
  },

  async rejectUser(userId) {
    return apiClient.patch(`/api/admin/users/${userId}/approve`, { approved: false });
  },

  async deleteUser(userId) {
    return apiClient.del(`/api/admin/users/${userId}`);
  },

  async updateUserRole(userId, role) {
    return apiClient.patch(`/api/admin/users/${userId}/role`, { role });
  },

  async resetUserPassword(userId) {
    return apiClient.patch(`/api/admin/users/${userId}/password`, { new_password: crypto.randomUUID().slice(0, 12) });
  },

  async revokeUserAccess(userId) {
    return apiClient.patch(`/api/admin/users/${userId}/approve`, { approved: false });
  },

  async getAuditLog() {
    return apiClient.get('/api/admin/audit').catch(() => []);
  },
};
