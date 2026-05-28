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
 * @returns {Promise<string>} Access token
 */
const getAccessToken = async () => {
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
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
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
 * @returns {Promise<object>} Draft order response with checkout URL
 */
const createDraftOrder = async (lineItems, currency, note, appliedDiscount, shippingLine, paymentMethod) => {
  const accessToken = await getAccessToken();
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const url = `${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/draft_orders.json`;

  const payload = {
    draft_order: {
      line_items: lineItems,
      currency: currency,
    },
  };

  if (shippingLine) {
    payload.draft_order.shipping_line = shippingLine;
  }

  if (note) {
    payload.draft_order.note = note;
  }

  if (paymentMethod) {
    payload.draft_order.note_attributes = [
      {
        name: 'payment_method',
        value: paymentMethod,
      },
    ];
  }

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
/**
 * Fetch inventory quantities for given variant IDs using GraphQL Admin API.
 * @param {number[]} variantIds - Array of product variant IDs
 * @returns {Promise<Object>} Map of variant ID to available inventory quantity
 */
const getInventoryQuantities = async (variantIds) => {
  if (!variantIds || variantIds.length === 0) return {};

  const accessToken = await getAccessToken();
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const url = `${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const gids = variantIds.map((id) => `gid://shopify/ProductVariant/${id}`);

  const query = `
    query getStock($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          inventoryItem {
            inventoryLevels(first: 50) {
              edges {
                node {
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const payload = {
    query,
    variables: { ids: gids },
  };

  logger.info(`Fetching inventory quantities for ${variantIds.length} variants...`);

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
      logger.error(`GraphQL API returned non-JSON response. Raw text: ${responseText}`);
      throw new ShopifyApiError(`Unexpected non-JSON response: ${responseText.slice(0, 150)}...`);
    }

    if (data.errors) {
      let errorMessage = 'Unknown GraphQL Error';
      if (Array.isArray(data.errors)) {
        errorMessage = data.errors.map((e) => e.message || JSON.stringify(e)).join('; ');
      } else if (typeof data.errors === 'string') {
        errorMessage = data.errors;
      } else {
        errorMessage = JSON.stringify(data.errors);
      }
      
      logger.error(`GraphQL inventory fetch failed: ${errorMessage}`);
      throw new ShopifyApiError(`Failed to fetch inventory: ${errorMessage}`);
    }

    const inventoryMap = {};
    if (data.data && data.data.nodes) {
      data.data.nodes.forEach((node) => {
        if (!node || !node.id) return;
        
        // Extract numeric ID from global ID
        const variantIdStr = node.id.split('/').pop();
        
        let totalAvailable = 0;
        const levels = node.inventoryItem?.inventoryLevels?.edges || [];
        
        levels.forEach((edge) => {
          const quantities = edge.node?.quantities || [];
          quantities.forEach((q) => {
            if (!q.name || q.name === 'available') {
              totalAvailable += (q.quantity || 0);
            }
          });
        });

        inventoryMap[variantIdStr] = totalAvailable;
      });
    }

    logger.info(`Inventory mapping result: ${JSON.stringify(inventoryMap)}`);
    return inventoryMap;
  } catch (error) {
    if (error instanceof ShopifyApiError) throw error;
    logger.error(`Failed to fetch inventory: ${error.message}`);
    throw new ShopifyApiError(`Failed to fetch inventory: ${error.message}`);
  }
};

module.exports = { getAccessToken, createDraftOrder, getInventoryQuantities };
