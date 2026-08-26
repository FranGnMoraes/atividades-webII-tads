export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  order: 'asc' | 'desc';
  orderBy: string;
}

export function parsePaginationParams(
  query: Record<string, unknown> = {},
  defaultOrderBy: string = 'createdAt',
  defaultLimit: number = 10,
): PaginationParams {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || defaultLimit));
  const skip = (page - 1) * limit;
  const order = query.order === 'asc' ? 'asc' : 'desc';
  const orderBy = typeof query.orderBy === 'string' && query.orderBy.trim() ? query.orderBy.trim() : defaultOrderBy;

  return { page, limit, skip, order, orderBy };
}

export interface PaginatedResult<T> {
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  data: T[];
}

export function paginate<T>(items: T[], total: number, params: PaginationParams): PaginatedResult<T> {
  return {
    meta: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit) || (total === 0 ? 0 : 1),
    },
    data: items,
  };
}
