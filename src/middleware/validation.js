const { body, query, validationResult } = require('express-validator');
const Joi = require('joi');
const { ValidationError } = require('../utils/errors');
const logger = require('../services/logger');
const { AppError } = require('./error');

const validateUserInput = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// Validation rules for different routes
const affiliateValidation = {
    getProducts: [
        query('category').trim().escape().notEmpty().withMessage('Category is required'),
        query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
        validateUserInput
    ],
    trackView: [
        body('productId').trim().notEmpty().withMessage('Product ID is required'),
        body('userId').trim().notEmpty().withMessage('User ID is required'),
        validateUserInput
    ],
    trackClick: [
        body('productId').trim().notEmpty().withMessage('Product ID is required'),
        body('userId').trim().notEmpty().withMessage('User ID is required'),
        validateUserInput
    ],
    trackConversion: [
        body('productId').trim().notEmpty().withMessage('Product ID is required'),
        body('userId').trim().notEmpty().withMessage('User ID is required'),
        body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
        validateUserInput
    ]
};

const analyticsValidation = {
    trackEvent: [
        body('eventName').trim().notEmpty().withMessage('Event name is required'),
        body('eventParams').isObject().withMessage('Event params must be an object'),
        validateUserInput
    ],
    getReport: [
        query('startDate').isISO8601().withMessage('Start date must be a valid ISO date'),
        query('endDate').isISO8601().withMessage('End date must be a valid ISO date'),
        validateUserInput
    ]
};

const complianceValidation = {
    saveConsent: [
        body('userId').trim().notEmpty().withMessage('User ID is required'),
        body('preferences').isObject().withMessage('Preferences must be an object'),
        validateUserInput
    ],
    requestExport: [
        body('userId').trim().notEmpty().withMessage('User ID is required'),
        validateUserInput
    ],
    deleteData: [
        body('userId').trim().notEmpty().withMessage('User ID is required'),
        validateUserInput
    ]
};

const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            logger.warn('Validation error', {
                path: req.path,
                errors
            });

            return next(new AppError('Validation failed', 400, errors));
        }

        next();
    };
};

// Validierungsschemas
const schemas = {
    // Benutzer-Schemas
    user: {
        create: Joi.object({
            email: Joi.string().email().required(),
            password: Joi.string().min(8).required(),
            name: Joi.string().required(),
            role: Joi.string().valid('user', 'admin').default('user')
        }),
        update: Joi.object({
            email: Joi.string().email(),
            password: Joi.string().min(8),
            name: Joi.string(),
            role: Joi.string().valid('user', 'admin')
        }).min(1)
    },

    // CO2-Berechnungs-Schemas
    co2: {
        calculate: Joi.object({
            transportType: Joi.string().required(),
            distance: Joi.number().positive().required(),
            date: Joi.date().default(Date.now)
        }),
        factors: Joi.object({
            transportType: Joi.string().required(),
            factor: Joi.number().positive().required()
        })
    },

    // Produkt-Schemas
    product: {
        create: Joi.object({
            name: Joi.string().required(),
            description: Joi.string().required(),
            price: Joi.number().required(),
            category: Joi.string().required(),
            ecoScore: Joi.number().min(0).max(100).required(),
            co2Savings: Joi.number().required(),
            affiliateLink: Joi.string().uri()
        }),
        update: Joi.object({
            params: Joi.object({
                id: Joi.string().required()
            }),
            body: Joi.object({
                name: Joi.string(),
                description: Joi.string(),
                price: Joi.number(),
                category: Joi.string(),
                ecoScore: Joi.number().min(0).max(100),
                co2Savings: Joi.number(),
                affiliateLink: Joi.string().uri()
            })
        })
    },

    // Analytics-Schemas
    analytics: {
        track: Joi.object({
            body: Joi.object({
                event: Joi.string().required(),
                properties: Joi.object().default({}),
                userId: Joi.string(),
                sessionId: Joi.string()
            })
        }),
        query: Joi.object({
            query: Joi.object({
                startDate: Joi.date().required(),
                endDate: Joi.date().required(),
                metrics: Joi.array().items(Joi.string()).required(),
                dimensions: Joi.array().items(Joi.string())
            })
        })
    },

    // Recommendation Feedback Schema
    recommendationFeedback: Joi.object({
        recommendationId: Joi.string().required(),
        isHelpful: Joi.boolean().required(),
        comments: Joi.string().max(500).allow('', null)
    }),

    // Common validation schemas
    id: Joi.string().uuid().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(100).required(),
    name: Joi.string().min(2).max(100).required(),
    role: Joi.string().valid('user', 'admin').default('user'),
    points: Joi.number().integer().min(0).required(),
    transportType: Joi.string().valid('car', 'bus', 'train', 'plane', 'bike', 'walk').required(),
    distance: Joi.number().positive().required(),
    target: Joi.number().positive().required(),
    deadline: Joi.date().greater('now').required(),
    type: Joi.string().valid('daily', 'weekly', 'monthly', 'custom').required(),
    progress: Joi.number().min(0).max(100).required(),
    goal: {
        create: Joi.object({
            type: Joi.string().required(),
            target: Joi.number().positive().required(),
            deadline: Joi.date().greater('now').required(),
            description: Joi.string()
        }),
        update: Joi.object({
            progress: Joi.number().min(0).max(100).required()
        })
    }
};

module.exports = {
    affiliateValidation,
    analyticsValidation,
    complianceValidation,
    validate,
    schemas
}; 