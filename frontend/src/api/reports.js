import client from './client'

export const getSpendingReport = (householdId, months) =>
  client.get(`/households/${householdId}/reports/spending`, { params: { months } })
