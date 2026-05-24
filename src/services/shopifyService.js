const logger = require('../utils/logger');
const { ShopifyApiError } = require('../utils/errors');
const { SHOPIFY_API_VERSION } = require('../utils/constants');

// In-memory token cache
let tokenCache = {
  accessToken: null,
  expiresAt: null,
};

/**
 * Get Shopify access token. Uses cached token if still valid.
 * Credentials come from the client request payload (clientId & clientSecret).
 * @param {string} clientId - Client ID from request payload
 * @param {string} clientSecret - Client Secret from request payload
 * @returns {Promise<string>} Access token
 */
const getAccessToken = async (clientId, clientSecret) => {
  // Check if cached token is still valid (with 60s buffer)
  if (tokenCache.accessToken && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
    logger.debug('Using cached Shopify access token');
    return tokenCache.accessToken;
  }

  const storeUrl = process.env.SHOPIFY_STORE_URL;

  if (!storeUrl) {
    throw new ShopifyApiError('SHOPIFY_STORE_URL not configured in environment variables');
  }

  const url = `${storeUrl}/admin/oauth/access_token`;

  logger.info('Requesting new Shopify access token...');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Shopify token request failed: ${response.status} - ${errorBody}`);
      throw new ShopifyApiError(`Failed to obtain access token: ${response.status}`);
    }

    const data = await response.json();

    // Cache the token with 60 second buffer before expiry
    tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };

    logger.info('Shopify access token obtained and cached successfully');
    return data.access_token;
  } catch (error) {
    if (error instanceof ShopifyApiError) throw error;
    logger.error(`Failed to get Shopify access token: ${error.message}`);
    throw new ShopifyApiError(`Failed to obtain access token: ${error.message}`);
  }
};

/**
 * Create a draft order in Shopify.
 * @param {string} clientId - Client ID from request payload (for OAuth)
 * @param {string} clientSecret - Client Secret from request payload (for OAuth)
 * @param {object[]} lineItems - Line items for the draft order
 * @param {string} currency - Currency code (e.g., 'SGD')
 * @param {string} note - Order note
 * @param {object} [appliedDiscount] - Optional applied discount
 * @returns {Promise<object>} Draft order response with checkout URL
 */
const createDraftOrder = async (clientId, clientSecret, lineItems, currency, note, appliedDiscount) => {
  const accessToken = await getAccessToken(clientId, clientSecret);
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const url = `${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/draft_orders.json`;

  const payload = {
    draft_order: {
      line_items: lineItems,
      currency: currency,
      note: note,
    },
  };

  if (appliedDiscount) {
    payload.draft_order.applied_discount = appliedDiscount;
  }

  logger.info(`Creating draft order with ${lineItems.length} line items...`);
  logger.debug(`Draft order payload: ${JSON.stringify(payload, null, 2)}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      logger.error(`Shopify API returned non-JSON response (Status: ${response.status}). Raw text: ${responseText}`);
      throw new ShopifyApiError(`Unexpected non-JSON response from Shopify: ${responseText.slice(0, 150)}...`);
    }

    if (!response.ok) {
      const errorMessage = data.errors
        ? typeof data.errors === 'string'
          ? data.errors
          : JSON.stringify(data.errors)
        : `HTTP ${response.status}`;
      logger.error(`Shopify draft order creation failed: ${errorMessage}`);
      throw new ShopifyApiError(`Failed to create draft order: ${errorMessage}`);
    }

    const checkoutUrl = data.draft_order.invoice_url;
    logger.info(`Draft order created successfully. Checkout URL: ${checkoutUrl}`);

    return {
      checkoutUrl,
      draftOrderId: data.draft_order.id,
    };
  } catch (error) {
    if (error instanceof ShopifyApiError) throw error;
    logger.error(`Failed to create draft order: ${error.message}`);
    throw new ShopifyApiError(`Failed to create draft order: ${error.message}`);
  }
};

module.exports = { getAccessToken, createDraftOrder };
