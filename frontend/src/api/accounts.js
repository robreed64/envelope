import client from './client'

export const getAccounts = (householdId) =>
  client.get(`/households/${householdId}/accounts`)

export const createAccount = (householdId, data) =>
  client.post(`/households/${householdId}/accounts`, data)

export const getAccountTransactions = (householdId, accountId) =>
  client.get(`/households/${householdId}/transactions/search`, { params: { account_id: accountId, limit: 500 } })
