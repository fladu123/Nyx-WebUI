export const API_BASE = window.NYX_CONFIG?.API_URL ?? 'http://192.168.1.139:8000';

const getAuthToken = () => localStorage.getItem('nyx_token');

const buildHeaders = (token, includeJson = true) => {
  const headers = {};

  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const parseJson = async (response) => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

async function request(path, options = {}) {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(token, !(options.body instanceof FormData)),
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) return null;

  const payload = await parseJson(response);

  if (!response.ok) {
    const error = payload?.detail || payload?.message || 'Request failed';
    throw new Error(error);
  }

  return payload;
}

export const apiClient = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path, body) => request(path, {
    method: 'DELETE',
    ...(body ? { body: JSON.stringify(body) } : {}),
  }),
  form: (path, formData) => request(path, {
    method: 'POST',
    body: formData,
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  }),
};

export default apiClient;
