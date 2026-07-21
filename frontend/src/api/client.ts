import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post('/api/auth/refresh/', { refresh })
          localStorage.setItem('access_token', data.access)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      } else {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api

// ── Typed helpers ───────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login/', { username: email, password }),
  register: (data: { first_name: string; last_name: string; email: string; password: string; currency?: string }) =>
    api.post('/auth/register/', { ...data, username: data.email }),
  me: () => api.get('/me/'),
  updateMe: (data: object) => api.patch('/me/', data),
}

export const accountsApi = {
  list: () => api.get('/accounts/'),
  create: (data: object) => api.post('/accounts/', data),
  update: (id: number, data: object) => api.patch(`/accounts/${id}/`, data),
  remove: (id: number) => api.delete(`/accounts/${id}/`),
}

export const projectsApi = {
  list: (params?: object) => api.get('/projects/', { params }),
  create: (data: object) => api.post('/projects/', data),
  update: (id: number, data: object) => api.patch(`/projects/${id}/`, data),
  remove: (id: number) => api.delete(`/projects/${id}/`),
}

export const transactionsApi = {
  list: (params?: object) => api.get('/transactions/', { params }),
  create: (data: object) => api.post('/transactions/', data),
  update: (id: number, data: object) => api.patch(`/transactions/${id}/`, data),
  remove: (id: number) => api.delete(`/transactions/${id}/`),
}

export const expensesApi = {
  list: () => api.get('/expenses/'),
  create: (data: object) => api.post('/expenses/', data),
  update: (id: number, data: object) => api.patch(`/expenses/${id}/`, data),
  remove: (id: number) => api.delete(`/expenses/${id}/`),
}

export const receivablesApi = {
  list: () => api.get('/receivables/'),
  create: (data: object) => api.post('/receivables/', data),
  update: (id: number, data: object) => api.patch(`/receivables/${id}/`, data),
}

export const payablesApi = {
  list: () => api.get('/payables/'),
  create: (data: object) => api.post('/payables/', data),
  update: (id: number, data: object) => api.patch(`/payables/${id}/`, data),
}

export const dashboardApi = {
  get: () => api.get('/dashboard/'),
}

export const forecastApi = {
  get: (year: number, month: number) => api.get(`/forecast/${year}/${month}/`),
}
