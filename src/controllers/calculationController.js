const calculationService = require('../services/calculationService');
const shopifyService = require('../services/shopifyService');
const logger = require('../utils/logger');

/**
 * POST /api/v1/calculate
 * Main endpoint: calculates charges and creates a Shopify draft order.
 */
const calculate = async (req, res, next) => {
  try {
    const { clientId, clientSecret, currency, notes, items } = req.body;

    logger.info(`Received calculation request with ${items.length} items, currency: ${currency}`);

    // Step 1: Calculate charges (ocean freight, local delivery, installation)
    const calculation = calculationService.calculate(items, notes);

    logger.info(
      `Calculation result — FPA: $${calculation.fpa.toFixed(2)}, ` +
      `Ocean Freight: $${calculation.oceanFreight.toFixed(2)}, ` +
      `Local Delivery: $${calculation.localDelivery.toFixed(2)}, ` +
      `Installation Free: ${calculation.isInstallationFree}`
    );

    // Step 2: Create draft order in Shopify (credentials from FE payload)
    const { checkoutUrl } = await shopifyService.createDraftOrder(
      clientId,
      clientSecret,
      calculation.lineItems,
      currency,
      calculation.note,
      calculation.appliedDiscount
    );

    // Step 3: Return success response with checkout URL
    return res.status(200).json({
      success: true,
      checkout_url: checkoutUrl,
      message: 'success',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { calculate };
