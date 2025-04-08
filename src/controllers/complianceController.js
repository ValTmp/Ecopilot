const ComplianceService = require('../services/compliance');

class ComplianceController {
  static async getCookieConsent(req, res) {
    try {
      const userId = req.user?.id || 'anonymous';
      const consent = await ComplianceService.generateCookieConsent(userId);
      return res.json(consent);
    } catch (error) {
      console.error('Error in getCookieConsent:', error);
      return res.status(500).json({ error: 'Failed to get cookie consent' });
    }
  }
  
  static async saveCookieConsent(req, res) {
    try {
      const userId = req.user?.id || 'anonymous';
      const { preferences } = req.body;
      
      if (!preferences) {
        return res.status(400).json({ error: 'Preferences are required' });
      }
      
      const success = await ComplianceService.saveConsent(userId, preferences);
      
      if (!success) {
        return res.status(500).json({ error: 'Failed to save consent' });
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error('Error in saveCookieConsent:', error);
      return res.status(500).json({ error: 'Failed to save cookie consent' });
    }
  }
  
  static async requestDataExport(req, res) {
    try {
      const userId = req.user?.id || 'anonymous';
      const result = await ComplianceService.requestDataExport(userId);
      return res.json(result);
    } catch (error) {
      console.error('Error in requestDataExport:', error);
      return res.status(500).json({ error: 'Failed to request data export' });
    }
  }
  
  static async deleteUserData(req, res) {
    try {
      const userId = req.user?.id || 'anonymous';
      const result = await ComplianceService.deleteUserData(userId);
      return res.json(result);
    } catch (error) {
      console.error('Error in deleteUserData:', error);
      return res.status(500).json({ error: 'Failed to delete user data' });
    }
  }
}

module.exports = ComplianceController; 