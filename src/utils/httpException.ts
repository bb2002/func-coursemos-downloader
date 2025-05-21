export class HttpException extends Error {
  status: number;
  details: object;

  constructor(status: number, message: string, details?: object) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export class InternalServerError extends HttpException {
  constructor(details?: object) {
    super(500, "Internal Server Error", details);
  }
}

export class BadRequestError extends HttpException {
  constructor(details?: object) {
    super(400, "Bad Request Error", details);
  }
}

export class UnauthorizedError extends HttpException {
  constructor(details?: object) {
    super(401, "Unauthorized Error", details);
  }
}

export class ForbiddenError extends HttpException {
  constructor(details?: object) {
    super(403, "Forbidden Error", details);
  }
}

export class NotFoundError extends HttpException {
  constructor(details?: object) {
    super(404, "Not Found Error", details);
  }
}

export class TooManyRequestsError extends HttpException {
  constructor(details?: object) {
    super(429, "Too Many Requests Error", details);
  }
}
