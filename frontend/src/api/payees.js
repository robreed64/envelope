import client from './client'

export const getPayeeAliases = (householdId) =>
  client.get(`/households/${householdId}/payees`)

export const getRawNotes = (householdId) =>
  client.get(`/households/${householdId}/payees/notes`)

export const getPayeeAssignments = (householdId) =>
  client.get(`/households/${householdId}/payees/assignments`)

export const upsertPayeeAlias = (householdId, raw, alias) =>
  client.put(`/households/${householdId}/payees`, { raw, alias })

export const deletePayeeAlias = (householdId, raw) =>
  client.delete(`/households/${householdId}/payees`, { data: { raw, alias: '' } })
