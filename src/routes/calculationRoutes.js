const express = require('express');
const router = express.Router();
const validateRequest = require('../middlewares/validateRequest');
// authMiddleware removed per user request
const calculationController = require('../controllers/calculationController');

/**
 * POST /api/v1/calculate
 * Pipeline: validateRequest → authMiddleware → calculate
 */
router.post('/calculate', validateRequest, calculationController.calculate);

module.exports = router;
