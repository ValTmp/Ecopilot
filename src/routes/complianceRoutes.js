const express = require('express');
const ComplianceController = require('../controllers/complianceController');

const router = express.Router();

// Cookie consent
router.get('/cookie-consent', ComplianceController.getCookieConsent);
router.post('/cookie-consent', ComplianceController.saveCookieConsent);

// GDPR data export
router.post('/data-export', ComplianceController.requestDataExport);

// GDPR right to be forgotten
router.delete('/user-data', ComplianceController.deleteUserData);

module.exports = router; 