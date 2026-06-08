import client from './client'

export const getIncome = (householdId, month) =>
  client.get(`/households/${householdId}/income`, { params: { month } })

export const addIncome = (householdId, data) =>
  client.post(`/households/${householdId}/income`, data)

export const updateIncome = (householdId, incomeId, data) =>
  client.patch(`/households/${householdId}/income/${incomeId}`, data)

export const deleteIncome = (householdId, incomeId) =>
  client.delete(`/households/${householdId}/income/${incomeId}`)
