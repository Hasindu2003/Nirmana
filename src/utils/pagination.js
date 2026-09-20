/**
 * Helper to calculate pagination parameters and metadata
 */
function buildPagination(totalCount, page = 1, limit = 10) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const totalPages = Math.ceil(totalCount / limitNum) || 1;
  const offset = (pageNum - 1) * limitNum;

  return {
    totalItems: totalCount,
    totalPages,
    currentPage: pageNum,
    limit: limitNum,
    hasNextPage: pageNum < totalPages,
    hasPrevPage: pageNum > 1,
    startItem: totalCount === 0 ? 0 : offset + 1,
    endItem: Math.min(offset + limitNum, totalCount),
    offset,
  };
}

module.exports = {
  buildPagination,
};
