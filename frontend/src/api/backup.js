import client from './client'

export const exportBackup = (householdId, items) =>
  client.get(`/households/${householdId}/data/export`, {
    params: { items: items.join(',') },
    responseType: 'blob',
  })

export const deleteData = (householdId, items) =>
  client.delete(`/households/${householdId}/data/delete`, {
    params: { items: items.join(',') },
  })

export const restoreBackup = (householdId, data, items) =>
  client.post(`/households/${householdId}/data/restore`, data, {
    params: { items: items.join(',') },
  })
