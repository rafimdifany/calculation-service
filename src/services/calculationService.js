const logger = require('../utils/logger');
const {
  OCEAN_FREIGHT_RATE,
  OCEAN_FREIGHT_FREE_THRESHOLD,
  LOCAL_DELIVERY_CHARGE,
  LOCAL_DELIVERY_FREE_THRESHOLD,
  INSTALLATION_FREE_THRESHOLD,
  CREDIT_CARD_FEE_RATE,
  CREDIT_CARD_PAYMENT_METHOD,
  OCEAN_FREIGHT_VARIANT_ID,
  CREDIT_CARD_FEE_VARIANT_ID,
  TAG_INSTALLATION_SERVICE,
} = require('../utils/constants');

/**
 * Parse comma-separated tags string into an array of trimmed lowercase tags.
 * @param {string} tags
 * @returns {string[]}
 */
const parseTags = (tags) => {
  if (!tags) return [];
  return tags.split(',').map((tag) => tag.trim().toLowerCase());
};

/**
 * Check if an item is an installation service item.
 * @param {object} item
 * @returns {boolean}
 */
const isInstallationService = (item) => {
  const tags = parseTags(item.tags);
  return tags.includes(TAG_INSTALLATION_SERVICE);
};

/**
 * Calculate all charges and build line items for Shopify draft order.
 * @param {object[]} items - Items from the request payload
 * @param {string} [notes] - Optional notes from the request
 * @param {object} [inventoryMap] - Optional map of variant_id to available inventory quantity
 * @param {string} [paymentMethod] - Optional payment method from the request
 * @returns {object} Calculation result
 */
const calculate = (items, notes, inventoryMap = {}, paymentMethod = null) => {
  // Aggregate items with the same variant_id to avoid duplicate line items
  const aggregatedItemsMap = {};
  items.forEach(item => {
    if (aggregatedItemsMap[item.variant_id]) {
      aggregatedItemsMap[item.variant_id].quantity += item.quantity;
    } else {
      aggregatedItemsMap[item.variant_id] = { ...item };
    }
  });
  const aggregatedItems = Object.values(aggregatedItemsMap);

  // Separate product items and installation-service items
  const productItems = aggregatedItems.filter((item) => !isInstallationService(item));
  const installationItems = aggregatedItems.filter((item) => isInstallationService(item));

  // Calculate FPA (Final Product Amount) from product items only
  const fpa = productItems.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);
  const fpaRounded = Math.round(fpa * 100) / 100;

  logger.info(`FPA (Final Product Amount): $${fpaRounded.toFixed(2)}`);

  // Calculate Ocean Freight (always calculated)
  const oceanFreight = Math.round((fpaRounded * OCEAN_FREIGHT_RATE / 100) * 100) / 100;
  const isOceanFreightFree = fpaRounded >= OCEAN_FREIGHT_FREE_THRESHOLD;

  if (isOceanFreightFree) {
    logger.info(`Ocean Freight: $${oceanFreight.toFixed(2)} (Will be waived, FPA >= $${OCEAN_FREIGHT_FREE_THRESHOLD})`);
  } else {
    logger.info(`Ocean Freight: $${oceanFreight.toFixed(2)} (${OCEAN_FREIGHT_RATE}% of FPA)`);
  }

  // Calculate Local Delivery
  const localDelivery = LOCAL_DELIVERY_CHARGE;
  const isLocalDeliveryFree = fpaRounded >= LOCAL_DELIVERY_FREE_THRESHOLD;
  if (isLocalDeliveryFree) {
    logger.info(`Local Delivery: $${localDelivery.toFixed(2)} (Will be waived, FPA >= $${LOCAL_DELIVERY_FREE_THRESHOLD})`);
  } else {
    logger.info(`Local Delivery: $${localDelivery.toFixed(2)}`);
  }

  // Check if installation is free
  const isInstallationFree = fpaRounded >= INSTALLATION_FREE_THRESHOLD;
  if (isInstallationFree) {
    logger.info(`Installation: FREE (FPA >= $${INSTALLATION_FREE_THRESHOLD})`);
  }

  const totalInstallationCost = installationItems.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);

  // Build line items for Shopify draft order
  const lineItems = [];

  // 1. Add product items (with variant_id)
  productItems.forEach((item) => {
    const lineItem = {
      variant_id: item.variant_id,
      quantity: item.quantity,
    };

    lineItem.properties = [];

    if (item.original_price !== undefined && item.original_price > item.price) {
      const origPriceVal = item.original_display_price || `$${item.original_price.toFixed(2)}`;
      lineItem.properties.push({
        name: "Original Price",
        value: origPriceVal
      });
    }

    const stock = inventoryMap[item.variant_id];
    if (stock !== undefined) {
      if ((stock - item.quantity) < 0) {
        lineItem.properties.push({
          name: "Pre-order",
          value: "For a more accurate delivery estimate, please contact customer service."
        });
      } else {
        lineItem.properties.push({
          name: "Ready Stock",
          value: "Delivery timing may vary depending on items in your order. Contact customer service for an estimate."
        });
      }
    }

    lineItems.push(lineItem);
  });

  // 2. Add installation service items (as regular line items with variant_id)
  installationItems.forEach((item) => {
    const lineItem = {
      variant_id: item.variant_id,
      quantity: item.quantity,
    };

    if (item.original_price !== undefined && item.original_price > item.price) {
      const origPriceVal = item.original_display_price || `$${item.original_price.toFixed(2)}`;
      lineItem.properties = [
        {
          name: "Original Price",
          value: origPriceVal
        }
      ];
    }

    lineItems.push(lineItem);
  });

  // 3. Add Ocean Freight (if applicable)
  if (oceanFreight > 0) {
    lineItems.push({
      variant_id: OCEAN_FREIGHT_VARIANT_ID,
      quantity: 1,
      price_override: oceanFreight.toFixed(2),
      requires_shipping: false,
      taxable: false,
    });
  }

  // 4. Add Local Delivery as shipping_line
  const shippingLine = {
    title: 'Local Delivery',
    price: isLocalDeliveryFree ? "0.00" : localDelivery.toFixed(2),
    custom: true
  };

  // Use note directly from payload
  let note = notes || null;

  logger.debug(`Draft order note: ${note}`);

  let totalDiscount = 0;
  let discountDescriptions = [];

  if (isOceanFreightFree) {
    totalDiscount += oceanFreight;
    discountDescriptions.push(`Ocean Freight FREE (FPA > SGD ${OCEAN_FREIGHT_FREE_THRESHOLD})`);
  }

  // Note: Local Delivery free status is handled directly in shippingLine price (0.00)

  if (isInstallationFree && installationItems.length > 0) {
    if (totalInstallationCost > 0) {
      totalDiscount += totalInstallationCost;
      discountDescriptions.push(`Installation FREE (FPA > SGD ${INSTALLATION_FREE_THRESHOLD})`);
    }
  }

  let appliedDiscount = null;
  if (totalDiscount > 0) {
    const hasFreightFree = isOceanFreightFree;
    const hasInstallFree = isInstallationFree && installationItems.length > 0 &&
      installationItems.reduce((sum, item) => sum + item.price * item.quantity, 0) > 0;

    let discountTitle = '';
    if (hasFreightFree && hasInstallFree) {
      discountTitle = 'Free Freight & Install';
    } else if (hasFreightFree) {
      discountTitle = 'Free Ocean Freight';
    } else if (hasInstallFree) {
      discountTitle = 'Free Installation Service';
    }

    appliedDiscount = {
      title: discountTitle,
      description: discountDescriptions.join(" • "),
      value_type: "fixed_amount",
      value: totalDiscount.toFixed(2),
      amount: totalDiscount.toFixed(2)
    };
  }

  let creditCardFee = 0;
  if (paymentMethod === CREDIT_CARD_PAYMENT_METHOD) {
    const chargedLocalDelivery = isLocalDeliveryFree ? 0 : localDelivery;
    const totalBeforeCreditCardFee = Math.max(
      0,
      fpaRounded + totalInstallationCost + oceanFreight + chargedLocalDelivery - totalDiscount
    );
    creditCardFee = Math.round((totalBeforeCreditCardFee * CREDIT_CARD_FEE_RATE / 100) * 100) / 100;

    if (creditCardFee > 0) {
      lineItems.push({
        variant_id: CREDIT_CARD_FEE_VARIANT_ID,
        quantity: 1,
        price_override: creditCardFee.toFixed(2),
        requires_shipping: false,
        taxable: false,
      });

      logger.info(
        `Credit Card Fees: $${creditCardFee.toFixed(2)} ` +
        `(${CREDIT_CARD_FEE_RATE}% of $${totalBeforeCreditCardFee.toFixed(2)})`
      );
    }
  }

  return {
    fpa: fpaRounded,
    oceanFreight,
    localDelivery,
    creditCardFee,
    isInstallationFree,
    lineItems,
    note,
    appliedDiscount,
    shippingLine
  };
};

module.exports = { calculate };
