import client from './client'

export const getMe = () => client.get('/me')
export const updateMe = (data) => client.patch('/me', data)
