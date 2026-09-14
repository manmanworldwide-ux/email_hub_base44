export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = "error", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = "Not authenticated", code = "unauthorized") => new ApiError(401, message, code);
export const forbidden = (message = "Forbidden", code = "forbidden") => new ApiError(403, message, code);
export const notFound = (message = "Not found", code = "not_found") => new ApiError(404, message, code);
export const badRequest = (message: string, code = "bad_request", details?: unknown) =>
  new ApiError(400, message, code, details);
export const conflict = (message: string, code = "conflict") => new ApiError(409, message, code);
export const upstream = (message: string, code = "upstream_error", details?: unknown) =>
  new ApiError(502, message, code, details);
