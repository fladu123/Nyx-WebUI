import apiClient, { API_BASE } from '../../api/client';

export const chatApi = {
  // Chat list/management
  async getChats(projectId = null) {
    const params = projectId ? `?project_id=${projectId}` : '';
    return apiClient.get(`/api/chats${params}`);
  },

  async getChat(chatId) {
    return apiClient.get(`/api/chats/${chatId}`);
  },

  async createChat(projectId = null) {
    return apiClient.post('/api/chats', projectId ? { project_id: projectId } : {});
  },

  async updateChat(chatId, data) {
    return apiClient.patch(`/api/chats/${chatId}`, data);
  },

  async deleteChat(chatId) {
    return apiClient.del(`/api/chats/${chatId}`);
  },

  // Messages
  async getMessages(chatId) {
    return apiClient.get(`/api/chats/${chatId}/messages`);
  },

  async addMessage(chatId, role, content, images = null) {
    return apiClient.post(`/api/chats/${chatId}/messages`, {
      role,
      content,
      ...(images ? { images } : {}),
    });
  },

  async deleteMessage(chatId, messageId) {
    return apiClient.del(`/api/chats/${chatId}/messages/${messageId}`);
  },

  // Chat compression
  async compressChat(chatId, model) {
    return apiClient.post(`/api/chats/${chatId}/compress`, { model, chat_id: chatId });
  },

  // File attachments (for standalone chats)
  async getChatFiles(chatId) {
    return apiClient.get(`/api/chats/${chatId}/files`);
  },

  async uploadChatFile(chatId, file) {
    const formData = new FormData();
    formData.append('file', file);
    const headers = {
      'Authorization': `Bearer ${localStorage.getItem('nyx_token') || ''}`,
    };
    return apiClient.form(`/api/chats/${chatId}/files`, formData, 'POST', headers);
  },

  async deleteChatFile(chatId, fileId) {
    return apiClient.del(`/api/chats/${chatId}/files/${fileId}`);
  },

  // Ollama chat streaming
  async *streamChat(payload) {
    const token = localStorage.getItem('nyx_token') || '';
    const response = await fetch(
      `${API_BASE}/api/ollama/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Chat failed: ${error}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const obj = JSON.parse(data);
            yield obj;
          } catch {
            // Ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  // Title generation
  async generateTitle(model, firstMessage) {
    return apiClient.post('/api/ollama/title', { model, first_message: firstMessage });
  },

  // Models
  async getModels() {
    return apiClient.get('/api/ollama/models');
  },

  // Documents
  async saveDocument(title, content) {
    return apiClient.post('/api/documents', { title, content });
  },
};
