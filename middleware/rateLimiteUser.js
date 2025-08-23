const rateLimit = require('express-rate-limit');

const userRateLimit = rateLimit({
  windowMs: 30 * 60 * 1000, 
  max: 75, 
  keyGenerator: (req) => {
    if (req.user && req.user.id) {
      return req.user.id;
    }
    return req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'limite de requisições'
    });
  }
});

module.exports = userRateLimit;
