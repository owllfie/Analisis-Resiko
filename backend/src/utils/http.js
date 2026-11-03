export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function parsePagination(query, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit || defaultLimit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}
