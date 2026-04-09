export class AppError extends Error {
  constructor(message, status = 500, errorCode = null) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }
}
