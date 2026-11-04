const { sequelize } = require('../models');
const config = require('../config/config');
const neonStorage = require('../services/neonStorageService');
const neonAuth = require('../services/neonAuthService');
const neonFunction = require('../services/neonFunctionService');
const neonRealtime = require('../services/neonRealtimeService');

class NeonController {
  /**
   * Health and end-to-end status of all 5 wired Neon services
   */
  async getStatus(req, res) {
    try {
      const results = {
        branch: config.neon.branch,
        timestamp: new Date().toISOString(),
        services: {},
      };

      // 1. Lakebase Postgres
      try {
        await sequelize.authenticate();
        const [dialect] = await sequelize.query('SELECT version();');
        results.services.postgres = {
          status: 'CONNECTED',
          dialect: sequelize.getDialect(),
          database: sequelize.config.database,
          version: dialect && dialect[0] ? dialect[0].version : 'PostgreSQL',
          pooled: Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.includes('-pooler')),
        };
      } catch (pgErr) {
        results.services.postgres = {
          status: 'ERROR',
          error: pgErr.message,
        };
      }

      // 2. Neon Auth
      try {
        const authStatus = await neonAuth.getAuthStatus();
        results.services.auth = authStatus;
      } catch (authErr) {
        results.services.auth = {
          status: 'ERROR',
          error: authErr.message,
        };
      }

      // 3. Neon Object Storage
      try {
        if (neonStorage.isConfigured()) {
          const testKey = `health-check/${Date.now()}.txt`;
          await neonStorage.uploadFile(testKey, Buffer.from('Neon Object Storage Health OK'), 'text/plain');
          const presigned = await neonStorage.getPresignedUrl(testKey, 300);
          await neonStorage.deleteFile(testKey);

          results.services.objectStorage = {
            status: 'ACTIVE',
            bucket: config.neon.objectStorage.bucket,
            endpoint: config.neon.objectStorage.endpoint,
            region: config.neon.objectStorage.region,
            presignedUrlGenerated: Boolean(presigned),
          };
        } else {
          results.services.objectStorage = {
            status: 'NOT_CONFIGURED',
          };
        }
      } catch (storageErr) {
        results.services.objectStorage = {
          status: 'ERROR',
          error: storageErr.message,
        };
      }

      // 4. Neon Functions
      try {
        if (neonFunction.isConfigured()) {
          const fnRes = await neonFunction.invokeHello();
          results.services.functions = {
            status: 'ACTIVE',
            helloFunctionUrl: fnRes.url,
            responseStatus: fnRes.status,
            output: fnRes.output,
          };
        } else {
          results.services.functions = {
            status: 'NOT_CONFIGURED',
          };
        }
      } catch (fnErr) {
        results.services.functions = {
          status: 'ERROR',
          error: fnErr.message,
        };
      }

      // 5. Neon Realtime
      try {
        if (neonRealtime.isConfigured()) {
          const liveSeal = await neonRealtime.sealLiveOrdersQuery(5);
          results.services.realtime = {
            status: 'ACTIVE',
            url: liveSeal.realtimeUrl,
            querySealed: Boolean(liveSeal.sealed && liveSeal.sealed.capability),
            fingerprint: liveSeal.sealed ? liveSeal.sealed.queryFingerprint : null,
          };
        } else {
          results.services.realtime = {
            status: 'NOT_CONFIGURED',
          };
        }
      } catch (rtErr) {
        results.services.realtime = {
          status: 'ERROR',
          error: rtErr.message,
        };
      }

      return res.json({
        success: true,
        message: 'Neon cloud services status check complete',
        data: results,
      });
    } catch (error) {
      console.error('Error in neonController.getStatus:', error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Seal a live query for client-side live subscription
   */
  async sealQuery(req, res) {
    try {
      const limit = req.query.limit || 20;
      const data = await neonRealtime.sealLiveOrdersQuery(limit);
      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Invoke a deployed Neon Function
   */
  async invokeFunction(req, res) {
    try {
      const result = await neonFunction.invokeHello();
      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new NeonController();

