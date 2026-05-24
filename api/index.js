require('dotenv').config();
const app = require('../src/app');

// Export the Express app as a Vercel serverless function
module.exports = app;
