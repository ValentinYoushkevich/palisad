export async function refreshAndRetryRequest({
  refreshAccessToken,
  resolvePendingRequests,
  rejectPendingRequests,
  logoutAndRedirect,
  http,
  originalRequest
}) {
  try {
    const isRefreshOk = await refreshAccessToken()
    resolvePendingRequests(isRefreshOk)
    return await http(originalRequest)
  } catch (refreshError) {
    rejectPendingRequests()
    await logoutAndRedirect()
    throw refreshError
  }
}
