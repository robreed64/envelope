import client from './client'

export const previewImport = (householdId, file) => {
  const form = new FormData()
  form.append('file', file)
  return client.post(`/households/${householdId}/import/preview`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const confirmImport = (householdId, transactions) =>
  client.post(`/households/${householdId}/import/confirm`, { transactions })
