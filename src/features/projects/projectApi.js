import apiClient from '../../api/client';

export const projectApi = {
  // Projects CRUD
  async getProjects() {
    return apiClient.get('/api/projects');
  },

  async getProject(projectId) {
    return apiClient.get(`/api/projects/${projectId}`);
  },

  async createProject(name) {
    return apiClient.post('/api/projects', { name });
  },

  async updateProject(projectId, data) {
    return apiClient.patch(`/api/projects/${projectId}`, data);
  },

  async deleteProject(projectId) {
    return apiClient.del(`/api/projects/${projectId}`);
  },

  // Project files (reference files for context)
  async getProjectFiles(projectId) {
    return apiClient.get(`/api/projects/${projectId}/files`);
  },

  async uploadProjectFile(projectId, file) {
    const formData = new FormData();
    formData.append('file', file);
    const headers = {
      'Authorization': `Bearer ${localStorage.getItem('nyx_token') || ''}`,
    };
    return apiClient.form(`/api/projects/${projectId}/files`, formData, 'POST', headers);
  },

  async deleteProjectFile(projectId, fileId) {
    return apiClient.del(`/api/projects/${projectId}/files/${fileId}`);
  },

  // Project chats
  async getProjectChats(projectId) {
    return apiClient.get(`/api/chats?project_id=${projectId}`);
  },

  async createProjectChat(projectId) {
    return apiClient.post('/api/chats', { project_id: projectId });
  },

  async deleteProjectChat(chatId) {
    return apiClient.del(`/api/chats/${chatId}`);
  },
};
