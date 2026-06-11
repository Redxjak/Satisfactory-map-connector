export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function assertFound(value, message = 'Not found') {
  if (!value) throw new HttpError(404, message);
  return value;
}
