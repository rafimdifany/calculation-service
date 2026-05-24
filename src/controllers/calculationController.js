const calculationService = require('../services/calculationService');
const shopifyService = require('../services/shopifyService');
const logger = require('../utils/logger');

/**
 * POST /api/v1/calculate
 * Main endpoint: calculates charges and creates a Shopify draft order.
 */
const calculate = async (req, res, next) => {
  try {
    const { items, notes, currency } = req.body;
    const reqCurrency = currency || 'SGD';

    logger.info(`Received calculation request with ${items.length} items`);

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
      calculation.lineItems,
      reqCurrency,
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
