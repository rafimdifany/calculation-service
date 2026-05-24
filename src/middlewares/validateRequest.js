const Joi = require('joi');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

const itemSchema = Joi.object({
  variant_id: Joi.number().required().messages({
    'any.required': 'variant_id is required for each item',
    'number.base': 'variant_id must be a number',
  }),
  quantity: Joi.number().integer().min(1).required().messages({
    'any.required': 'quantity is required for each item',
    'number.base': 'quantity must be a number',
    'number.min': 'quantity must be at least 1',
  }),
  title: Joi.string().required().messages({
    'any.required': 'title is required for each item',
  }),
  tags: Joi.string().allow('').required().messages({
    'any.required': 'tags is required for each item',
  }),
  price: Joi.number().min(0).required().messages({
    'any.required': 'price is required for each item',
    'number.base': 'price must be a valid number (e.g., 1400.00)',
    'number.min': 'price cannot be negative',
  }),
  price_display: Joi.string().required().messages({
    'any.required': 'price_display is required for each item',
  }),
});

const requestSchema = Joi.object({
  items: Joi.array().items(itemSchema).min(1).required().messages({
    'any.required': 'items array is required',
    'array.min': 'items must contain at least 1 item',
  }),
});

const validateRequest = (req, res, next) => {
  const { error } = requestSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const errorMessages = error.details.map((detail) => detail.message).join('; ');
    logger.warn(`Validation failed: ${errorMessages}`);
    return next(new ValidationError(errorMessages));
  }

  next();
};

module.exports = validateRequest;
