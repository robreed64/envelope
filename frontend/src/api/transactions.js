import client from './client'

export const getTransactions = (householdId, envelopeId, month = null) =>
  client.get(`/households/${householdId}/envelopes/${envelopeId}/transactions`, {
    params: month ? { month } : {},
  })

export const createTransaction = (householdId, envelopeId, data) =>
  client.post(`/households/${householdId}/envelopes/${envelopeId}/transactions`, data)

export const updateTransaction = (householdId, envelopeId, txId, data) =>
  client.patch(`/households/${householdId}/envelopes/${envelopeId}/transactions/${txId}`, data)

export const deleteTransaction = (householdId, envelopeId, txId) =>
  client.delete(`/households/${householdId}/envelopes/${envelopeId}/transactions/${txId}`)

export const createTransfer = (householdId, data) =>
  client.post(`/households/${householdId}/transfers`, data)

export const deleteTransfer = (householdId, transferId) =>
  client.delete(`/households/${householdId}/transfers/${transferId}`)

export const createSplit = (householdId, data) =>
  client.post(`/households/${householdId}/splits`, data)

export const deleteSplit = (householdId, splitId) =>
  client.delete(`/households/${householdId}/splits/${splitId}`)

export const searchTransactions = (householdId, q) =>
  client.get(`/households/${householdId}/transactions/search`, { params: { q } })

export const exportTransactionsCsv = (householdId, { start, end } = {}) => {
  const params = {}
  if (start) params.start = start
  if (end) params.end = end
  return client.get(`/households/${householdId}/transactions/export`, { params, responseType: 'blob' })
}
