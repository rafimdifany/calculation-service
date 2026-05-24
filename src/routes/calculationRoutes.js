const express = require('express');
const router = express.Router();
const validateRequest = require('../middlewares/validateRequest');
const authMiddleware = require('../middlewares/authMiddleware');
const calculationController = require('../controllers/calculationController');

/**
 * POST /api/v1/calculate
 * Pipeline: validateRequest → authMiddleware → calculate
 */
router.post('/calculate', validateRequest, authMiddleware, calculationController.calculate);

module.exports = router;
