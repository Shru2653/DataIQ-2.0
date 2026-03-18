import axiosClient from './axiosClient'

export async function loginApi({ email, password }) {
  const res = await axiosClient.post('/api/auth/login', { email, password })
  return res.data
}

export async function registerApi({ username, name, email, password }) {
  const res = await axiosClient.post('/api/auth/register', { username, name, email, password })
  return res.data
}

export async function meApi() {
  const res = await axiosClient.get('/api/auth/me')
  return res.data
}
