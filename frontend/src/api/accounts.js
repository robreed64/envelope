import client from './client'

export const getAccounts = (householdId) =>
  client.get(`/households/${householdId}/accounts`)
