import apiClient, { API_BASE } from '../../api/client';

export const modelCatalogue = [
  { name: 'llama3.2:latest', description: 'Meta Llama 3.2 3B - fast, low VRAM' },
  { name: 'llama3.1:8b', description: 'Meta Llama 3.1 8B - solid all-rounder' },
  { name: 'mistral:7b', description: 'Mistral 7B - fast, instruction-tuned' },
  { name: 'qwen2.5:7b', description: 'Qwen 2.5 7B - strong coding and reasoning' },
  { name: 'qwen2.5:14b', description: 'Qwen 2.5 14B' },
  { name: 'gemma2:9b', description: 'Google Gemma 2 9B' },
  { name: 'deepseek-r1:7b', description: 'DeepSeek R1 7B - reasoning model' },
  { name: 'qwen2.5-coder:7b', description: 'Best small code model' },
  { name: 'codellama:7b', description: 'Meta Code Llama 7B' },
  { name: 'llava:7b', description: 'LLaVA 7B vision model' },
  { name: 'moondream:latest', description: 'Moondream - tiny, fast vision model' },
  { name: 'nomic-embed-text:latest', description: 'Fast text embeddings' },
];

export const modelsApi = {
  async getInstalledModels(nodeId) {
    return apiClient.get(`/api/ollama/models?node_id=${nodeId}`);
  },

  async *pullModel(nodeId, modelName) {
    const token = localStorage.getItem('nyx_token') || '';
    const response = await fetch(
      `${API_BASE}/api/ollama/pull?node_id=${nodeId}&model=${encodeURIComponent(modelName)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok || !response.body) throw new Error('Model pull failed');

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
          try { yield JSON.parse(data); } catch { /* Ignore malformed events. */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  async removeModel(nodeId, modelName) {
    return apiClient.del(`/api/ollama/models?node_id=${nodeId}&model=${encodeURIComponent(modelName)}`);
  },

};
