class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Invalid client credentials') {
    super(message, 401);
  }
}

class ShopifyApiError extends AppError {
  constructor(message) {
    super(`Shopify API Error: ${message}`, 502);
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  ShopifyApiError,
};
