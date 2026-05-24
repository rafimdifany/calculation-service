const { AuthenticationError } = require('../utils/errors');
const logger = require('../utils/logger');

const authMiddleware = (req, res, next) => {
  try {
    const { clientId, clientSecret } = req.body;

    const validClientId = process.env.CLIENT_ID;
    const validClientSecret = process.env.CLIENT_SECRET;

    if (!validClientId || !validClientSecret) {
      logger.error('CLIENT_ID or CLIENT_SECRET not configured in environment variables');
      throw new AuthenticationError('Server authentication not configured');
    }

    if (clientId !== validClientId || clientSecret !== validClientSecret) {
      logger.warn(`Authentication failed for clientId: ${clientId}`);
      throw new AuthenticationError();
    }

    logger.debug('Client authenticated successfully');
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = authMiddleware;
