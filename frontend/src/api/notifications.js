import client from './client'

export const getNotifications = (householdId) =>
  client.get(`/households/${householdId}/notifications`)
