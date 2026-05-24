module.exports = {
  // Price Policy
  OCEAN_FREIGHT_RATE: parseFloat(process.env.OCEAN_FREIGHT_RATE) || 10,
  OCEAN_FREIGHT_FREE_THRESHOLD: parseFloat(process.env.OCEAN_FREIGHT_FREE_THRESHOLD) || 4000,
  LOCAL_DELIVERY_CHARGE: parseFloat(process.env.LOCAL_DELIVERY_CHARGE) || 40,
  LOCAL_DELIVERY_FREE_THRESHOLD: parseFloat(process.env.LOCAL_DELIVERY_FREE_THRESHOLD) || 2000,
  INSTALLATION_FREE_THRESHOLD: parseFloat(process.env.INSTALLATION_FREE_THRESHOLD) || 12000,

  // Tags
  TAG_INSTALLATION_SERVICE: 'service',
  TAG_INSTALLATION_LARGE: 'installation-large',
  TAG_INSTALLATION_SMALL: 'installation-small',

  // Shopify
  SHOPIFY_API_VERSION: '2025-01',
};
