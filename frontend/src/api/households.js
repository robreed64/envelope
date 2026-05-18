import client from './client'

export const getHouseholds = () => client.get('/households')
export const createHousehold = (name) => client.post('/households', { name })
export const updateHousehold = (householdId, data) => client.patch(`/households/${householdId}`, data)

export const getMembers = (householdId) => client.get(`/households/${householdId}/members`)
export const updateMemberRole = (householdId, memberId, role) =>
  client.patch(`/households/${householdId}/members/${memberId}`, { role })
export const removeMember = (householdId, memberId) =>
  client.delete(`/households/${householdId}/members/${memberId}`)

export const createInvite = (householdId, data) => client.post(`/households/${householdId}/invites`, data)
export const listInvites = (householdId) => client.get(`/households/${householdId}/invites`)
export const revokeInvite = (householdId, inviteId) =>
  client.delete(`/households/${householdId}/invites/${inviteId}`)

export const getInvite = (token) => client.get(`/invites/${token}`)
export const acceptInvite = (token) => client.post(`/invites/${token}/accept`)
