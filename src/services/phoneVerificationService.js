const crypto = require('crypto');
const { Op } = require('sequelize');
const { PhoneVerification } = require('../models');

class PhoneVerificationService {
  /**
   * Normalize and validate Sri Lankan mobile number
   * Format: 07XXXXXXXX (10 digits)
   */
  sanitizePhone(phone) {
    if (!phone) throw new Error('Phone number is required.');
    const cleaned = String(phone).replace(/\D/g, '').trim();
    if (!/^0\d{9}$/.test(cleaned)) {
      throw new Error('Phone number must be exactly 10 digits starting with 0 (e.g. 0771234567).');
    }
    return cleaned;
  }

  /**
   * Ensure phone_verifications table exists
   */
  async ensureTable() {
    if (!this._tableReady) {
      await PhoneVerification.sync().catch(() => {});
      this._tableReady = true;
    }
  }

  /**
   * Generate and send 6-digit verification OTP
   */
  async sendOtp(rawPhone) {
    await this.ensureTable();
    const phone = this.sanitizePhone(rawPhone);

    // Rate-limiting check: enforce 45s cooldown
    const existing = await PhoneVerification.findOne({
      where: { phone },
    });

    const now = new Date();
    if (existing && existing.lastSentAt) {
      const secondsSinceLast = Math.floor((now.getTime() - new Date(existing.lastSentAt).getTime()) / 1000);
      if (secondsSinceLast < 45) {
        const waitSec = 45 - secondsSinceLast;
        throw new Error(`Please wait ${waitSec}s before requesting another verification code.`);
      }
    }

    // Generate 6-digit numeric OTP (100000 - 999999)
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    if (existing) {
      existing.otp = otp;
      existing.expiresAt = expiresAt;
      existing.attempts = 0;
      existing.isVerified = false;
      existing.lastSentAt = now;
      await existing.save();
    } else {
      await PhoneVerification.create({
        phone,
        otp,
        expiresAt,
        attempts: 0,
        isVerified: false,
        lastSentAt: now,
      });
    }

    // Dispatch SMS or WhatsApp message
    let smsSent = false;
    let providerName = 'LOCAL_CONSOLE';

    // 1. Notify.lk (Sri Lanka SMS Gateway) integration
    if (process.env.NOTIFYLK_API_KEY && process.env.NOTIFYLK_USER_ID) {
      try {
        const https = require('https');
        const postData = JSON.stringify({
          user_id: process.env.NOTIFYLK_USER_ID,
          api_key: process.env.NOTIFYLK_API_KEY,
          sender_id: process.env.NOTIFYLK_SENDER_ID || 'NotifyDEMO',
          to: phone.startsWith('0') ? '94' + phone.substring(1) : phone,
          message: `Your Nirmana Printing verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`,
        });

        const req = https.request({
          hostname: 'app.notify.lk',
          path: '/api/v1/send',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        });
        req.on('error', (e) => console.warn('[SMS Gateway] Notify.lk error:', e.message));
        req.write(postData);
        req.end();
        smsSent = true;
        providerName = 'NOTIFY_LK';
      } catch (smsErr) {
        console.warn('[SMS Gateway] Failed dispatching via Notify.lk:', smsErr.message);
      }
    }

    // Always log prominently to server console for transparent development & testing
    console.log(`\n=======================================================`);
    console.log(`🔑 [NIRMANA SMS OTP VERIFICATION]`);
    console.log(`📱 Phone Number : ${phone}`);
    console.log(`🔐 OTP Code     : ${otp}`);
    console.log(`⏳ Expires In   : 5 minutes (${expiresAt.toLocaleTimeString('en-LK')})`);
    console.log(`📡 Provider     : ${providerName}`);
    console.log(`=======================================================\n`);

    return {
      success: true,
      message: `Verification code sent to ${phone}. It will expire in 5 minutes.`,
      phone,
      // Provide devOtp when running without SMS gateway credentials so dev/demo testing is instant
      devOtp: (!process.env.NOTIFYLK_API_KEY && !process.env.TWILIO_ACCOUNT_SID) ? otp : undefined,
    };
  }

  /**
   * Verify entered 6-digit OTP
   */
  async verifyOtp(rawPhone, rawOtp) {
    await this.ensureTable();
    const phone = this.sanitizePhone(rawPhone);
    const otp = String(rawOtp || '').trim();

    if (!otp || otp.length !== 6) {
      throw new Error('Please enter the 6-digit verification code sent to your phone.');
    }

    const record = await PhoneVerification.findOne({
      where: { phone },
    });

    if (!record) {
      throw new Error('No verification code requested for this phone number. Please click "Send Code".');
    }

    const now = new Date();
    if (now > new Date(record.expiresAt)) {
      throw new Error('Verification code has expired. Please request a new code.');
    }

    if (record.attempts >= 5) {
      throw new Error('Too many failed attempts. Please request a new code.');
    }

    record.attempts += 1;

    if (record.otp !== otp) {
      await record.save();
      const remainingAttempts = 5 - record.attempts;
      throw new Error(`Incorrect verification code. ${remainingAttempts} attempts remaining.`);
    }

    // Mark as verified
    record.isVerified = true;
    record.verifiedAt = now;
    await record.save();

    return {
      success: true,
      message: 'Phone number verified successfully!',
      phone,
      verified: true,
    };
  }

  /**
   * Check if phone was verified recently (within 15 minutes)
   */
  async isPhoneVerified(rawPhone) {
    try {
      await this.ensureTable();
      const phone = this.sanitizePhone(rawPhone);
      const record = await PhoneVerification.findOne({
        where: { phone },
      });

      if (!record || !record.isVerified || !record.verifiedAt) {
        return false;
      }

      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      return new Date(record.verifiedAt) > fifteenMinutesAgo;
    } catch (e) {
      return false;
    }
  }
}

module.exports = new PhoneVerificationService();
