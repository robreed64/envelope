import client from './client'

export const getEnvelopes = (householdId) =>
  client.get(`/households/${householdId}/envelopes`)

export const createEnvelope = (householdId, data) =>
  client.post(`/households/${householdId}/envelopes`, data)

export const updateEnvelope = (householdId, envelopeId, data) =>
  client.patch(`/households/${householdId}/envelopes/${envelopeId}`, data)
