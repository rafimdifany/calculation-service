const logger = require('../utils/logger');
const {
  OCEAN_FREIGHT_RATE,
  OCEAN_FREIGHT_FREE_THRESHOLD,
  LOCAL_DELIVERY_CHARGE,
  LOCAL_DELIVERY_FREE_THRESHOLD,
  INSTALLATION_FREE_THRESHOLD,
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
 * @returns {object} Calculation result
 */
const calculate = (items, notes, inventoryMap = {}) => {
  // Separate product items and installation-service items
  const productItems = items.filter((item) => !isInstallationService(item));
  const installationItems = items.filter((item) => isInstallationService(item));

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

  // Build line items for Shopify draft order
  const lineItems = [];

  // 1. Add product items (with variant_id)
  productItems.forEach((item) => {
    const lineItem = {
      variant_id: item.variant_id,
      quantity: item.quantity,
    };

    const stock = inventoryMap[item.variant_id];
    if (stock !== undefined && (stock - item.quantity) < 0) {
      lineItem.properties = [
        {
          name: "Status",
          value: "Preorder — estimated arrival 30-45 business days"
        }
      ];
    }

    lineItems.push(lineItem);
  });

  // 2. Add installation service items (as regular line items with variant_id)
  installationItems.forEach((item) => {
    lineItems.push({
      variant_id: item.variant_id,
      quantity: item.quantity,
    });
  });

  // 3. Add Ocean Freight (if applicable)
  if (oceanFreight > 0) {
    lineItems.push({
      title: 'Ocean Freight',
      price: oceanFreight.toFixed(2),
      quantity: 1,
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
    const totalInstallationCost = installationItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (totalInstallationCost > 0) {
      totalDiscount += totalInstallationCost;
      discountDescriptions.push(`Installation FREE (FPA > SGD ${INSTALLATION_FREE_THRESHOLD})`);
    }
  }

  let appliedDiscount = null;
  if (totalDiscount > 0) {
    appliedDiscount = {
      title: "Free Benefits Applied",
      description: discountDescriptions.join(" • "),
      value_type: "fixed_amount",
      value: totalDiscount.toFixed(2),
      amount: totalDiscount.toFixed(2)
    };
  }

  return {
    fpa: fpaRounded,
    oceanFreight,
    localDelivery,
    isInstallationFree,
    lineItems,
    note,
    appliedDiscount,
    shippingLine
  };
};

module.exports = { calculate };
