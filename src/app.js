const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const calculationRoutes = require('./routes/calculationRoutes');

const app = express();

// ── Security Middleware ──────────────────────────────────────────────
app.use(helmet());
app.use(cors());

// ── Rate Limiting ────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});
app.use(limiter);

// ── Body Parser ──────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Health Check ─────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Calculation Service is running',
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ───────────────────────────────────────────────────────────
app.use('/api/v1', calculationRoutes);

// ── 404 Handler ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ── Global Error Handler ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  // Log error details
  if (statusCode >= 500) {
    logger.error(`[${statusCode}] ${err.message}\n${err.stack}`);
  } else {
    logger.warn(`[${statusCode}] ${err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    message: message,
  });
});

module.exports = app;
