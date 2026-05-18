import client from './client'

export const getPeriods = (householdId, envelopeId) =>
  client.get(`/households/${householdId}/envelopes/${envelopeId}/periods`)

export const createPeriod = (householdId, envelopeId, data) =>
  client.post(`/households/${householdId}/envelopes/${envelopeId}/periods`, data)

export const updatePeriod = (householdId, envelopeId, periodId, data) =>
  client.patch(`/households/${householdId}/envelopes/${envelopeId}/periods/${periodId}`, data)

export const getBulkPeriods = (householdId, month) =>
  client.get(`/households/${householdId}/periods`, { params: { month } })

export const copyPeriods = (householdId, fromMonth, toMonth) =>
  client.post(`/households/${householdId}/periods/copy`, { from_month: fromMonth, to_month: toMonth })
