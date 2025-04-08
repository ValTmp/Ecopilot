const { body, query, validationResult } = require('express-validator');
const Joi = require('joi');
const { ValidationError } = require('../utils/errors');

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

/**
 * Validierungsmiddleware mit Joi
 * @param {Object} schema - Joi Schema
 * @returns {Function} Express Middleware
 */
const validateJoi = (schema) => {
    return (req, res, next) => {
        const validationOptions = {
            abortEarly: false,
            allowUnknown: true,
            stripUnknown: true
        };

        const toValidate = {
            body: req.body,
            query: req.query,
            params: req.params
        };

        const { error, value } = schema.validate(toValidate, validationOptions);

        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            throw new ValidationError('Validation failed', details);
        }

        // Validierte Werte an Request anhängen
        req.body = value.body;
        req.query = value.query;
        req.params = value.params;

        next();
    };
};

// Validierungsschemas
const schemas = {
    // Benutzer-Schemas
    user: {
        register: Joi.object({
            body: Joi.object({
                email: Joi.string().email().required(),
                password: Joi.string().min(8).required(),
                name: Joi.string().required(),
                role: Joi.string().valid('user', 'premium', 'admin').default('user')
            })
        }),
        login: Joi.object({
            body: Joi.object({
                email: Joi.string().email().required(),
                password: Joi.string().required()
            })
        }),
        update: Joi.object({
            body: Joi.object({
                name: Joi.string(),
                email: Joi.string().email(),
                currentPassword: Joi.string().when('newPassword', {
                    is: Joi.exist(),
                    then: Joi.required()
                }),
                newPassword: Joi.string().min(8)
            })
        })
    },

    // CO2-Berechnungs-Schemas
    co2: {
        calculate: Joi.object({
            body: Joi.object({
                activity: Joi.string().required(),
                value: Joi.number().required(),
                unit: Joi.string().required(),
                date: Joi.date().default(Date.now)
            })
        }),
        batch: Joi.object({
            body: Joi.object({
                activities: Joi.array().items(
                    Joi.object({
                        activity: Joi.string().required(),
                        value: Joi.number().required(),
                        unit: Joi.string().required(),
                        date: Joi.date().default(Date.now)
                    })
                ).min(1).max(100).required()
            })
        }),
        co2Calculation: Joi.object({
            body: Joi.object({
                transportType: Joi.string().valid('car', 'plane', 'public').required()
                    .messages({
                        'any.required': 'Transport type is required',
                        'string.base': 'Transport type must be a string',
                        'any.only': 'Transport type must be one of: car, plane, public'
                    }),
                distance: Joi.number().positive().required()
                    .messages({
                        'any.required': 'Distance is required',
                        'number.base': 'Distance must be a number',
                        'number.positive': 'Distance must be a positive number'
                    })
            })
        })
    },

    // Produkt-Schemas
    product: {
        create: Joi.object({
            body: Joi.object({
                name: Joi.string().required(),
                description: Joi.string().required(),
                price: Joi.number().required(),
                category: Joi.string().required(),
                ecoScore: Joi.number().min(0).max(100).required(),
                co2Savings: Joi.number().required(),
                affiliateLink: Joi.string().uri()
            })
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
    }
};

module.exports = {
    affiliateValidation,
    analyticsValidation,
    complianceValidation,
    validateJoi,
    schemas
}; 