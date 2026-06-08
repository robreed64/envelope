import client from './client'

export const getTemplates = (householdId) =>
  client.get(`/households/${householdId}/recurring`)

export const getSuggestions = (householdId) =>
  client.get(`/households/${householdId}/recurring/suggestions`)

export const createTemplate = (householdId, data) =>
  client.post(`/households/${householdId}/recurring`, data)

export const updateTemplate = (householdId, templateId, data) =>
  client.patch(`/households/${householdId}/recurring/${templateId}`, data)

export const deleteTemplate = (householdId, templateId) =>
  client.delete(`/households/${householdId}/recurring/${templateId}`)

export const applyTemplate = (householdId, templateId, date) =>
  client.post(`/households/${householdId}/recurring/${templateId}/apply`, { date })
