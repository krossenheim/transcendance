import { TOTP, TOTPSecretEncryption } from '@app/shared/totp';
import { Result } from '@app/shared/api/service/common/result';
import { Database } from './database.js';
import { z } from 'zod';

// const TwoFactorSecret = z.object({
//   userId: z.number(),
//   encryptedSecret: z.string(),
//   isEnabled: z.coerce.boolean(),
//   createdAt: z.number(),
// });

// type TwoFactorSecretType = z.infer<typeof TwoFactorSecret>;

export class TwoFactorService {
  private db: Database;
  private totp: TOTP;
  private encryption: TOTPSecretEncryption;
  private masterPassword: string;

  constructor(db: Database) {
    this.db = db;
    this.totp = new TOTP();
    this.encryption = new TOTPSecretEncryption();
    
    // Get master password from environment
    this.masterPassword = process.env.TOTP_MASTER_KEY || 'transcendence_2fa_master_key_change_in_production';
    
    if (!process.env.TOTP_MASTER_KEY) {
      console.warn('WARNING: Using default TOTP_MASTER_KEY. Set TOTP_MASTER_KEY environment variable for production!');
    }
  }

  /**
   * Check if user has 2FA enabled
   */
  isEnabled(userId: number): Result<boolean, string> {
    const result = this.db.get(
      `SELECT isEnabled FROM user_2fa_secrets WHERE userId = ?`,
      z.object({ isEnabled: z.coerce.boolean() }),
      [userId]
    );

    if (result.isErr()) {
      // No 2FA secret means 2FA is not enabled
      return Result.Ok(false);
    }

    return Result.Ok(result.unwrap().isEnabled);
  }

  /**
   * Generate a new 2FA secret for user (but don't enable it yet)
   * Returns the QR code data URL and the secret (for manual entry)
   */
  async generateSecret(
    userId: number,
    username: string
  ): Promise<Result<{ qrCode: string; secret: string; uri: string }, string>> {
    try {
      // Generate new secret
      const secret = this.totp.generateSecret(32);
      
      // Encrypt it
      const encryptedSecret = this.encryption.encrypt(secret, this.masterPassword);

      // Store in database (disabled by default)
      const insertResult = this.db.run(
        `INSERT INTO user_2fa_secrets (userId, encryptedSecret, isEnabled) 
         VALUES (?, ?, 0) 
         ON CONFLICT(userId) DO UPDATE SET encryptedSecret = excluded.encryptedSecret, isEnabled = 0`,
        [userId, encryptedSecret]
      );

      if (insertResult.isErr()) {
        return Result.Err('Failed to store 2FA secret');
      }

      // Generate TOTP URI
      const uri = this.totp.generateTOTPUri(secret, username, 'Transcendence');

      // Generate QR code
      const qrCode = await this.totp.generateQRCode(uri);

      return Result.Ok({ qrCode, secret, uri });
    } catch (error) {
      console.error('Error generating 2FA secret:', error);
      return Result.Err('Failed to generate 2FA secret');
    }
  }

  /**
   * Enable 2FA after user has scanned QR and verified first code
   */
  enable(userId: number, verificationCode: string): Result<null, string> {
    // Get the secret
    const secretResult = this.db.get(
      `SELECT encryptedSecret FROM user_2fa_secrets WHERE userId = ?`,
      z.object({ encryptedSecret: z.string() }),
      [userId]
    );

    if (secretResult.isErr()) {
      return Result.Err('No 2FA secret found. Generate one first.');
    }

    try {
      // Decrypt secret
      const encryptedSecret = secretResult.unwrap().encryptedSecret;
      const secret = this.encryption.decrypt(encryptedSecret, this.masterPassword);

      // Verify the code
      if (!this.totp.verify(secret, verificationCode)) {
        return Result.Err('Invalid verification code');
      }

      // Enable 2FA
      const updateResult = this.db.run(
        `UPDATE user_2fa_secrets SET isEnabled = 1 WHERE userId = ?`,
        [userId]
      );

      if (updateResult.isErr()) {
        return Result.Err('Failed to enable 2FA');
      }

      return Result.Ok(null);
    } catch (error) {
      console.error('Error enabling 2FA:', error);
      return Result.Err('Failed to enable 2FA');
    }
  }

  /**
   * Disable 2FA (requires current password or admin action)
   */
  disable(userId: number): Result<null, string> {
    const updateResult = this.db.run(
      `UPDATE user_2fa_secrets SET isEnabled = 0 WHERE userId = ?`,
      [userId]
    );

    if (updateResult.isErr()) {
      return Result.Err('Failed to disable 2FA');
    }

    return Result.Ok(null);
  }

  /**
   * Verify a TOTP code for a user
   */
  verify(userId: number, code: string): Result<boolean, string> {
    // Check if 2FA is enabled
    const enabledResult = this.isEnabled(userId);
    if (enabledResult.isErr()) {
      return Result.Err(enabledResult.unwrapErr());
    }

    if (!enabledResult.unwrap()) {
      return Result.Err('2FA is not enabled for this user');
    }

    // Get the secret
    const secretResult = this.db.get(
      `SELECT encryptedSecret FROM user_2fa_secrets WHERE userId = ? AND isEnabled = 1`,
      z.object({ encryptedSecret: z.string() }),
      [userId]
    );

    if (secretResult.isErr()) {
      return Result.Err('2FA secret not found');
    }

    try {
      // Decrypt secret
      const encryptedSecret = secretResult.unwrap().encryptedSecret;
      const secret = this.encryption.decrypt(encryptedSecret, this.masterPassword);

      // Verify the code (with 1-step window tolerance)
      const isValid = this.totp.verify(secret, code, 1);

      return Result.Ok(isValid);
    } catch (error) {
      console.error('Error verifying 2FA code:', error);
      return Result.Err('Failed to verify 2FA code');
    }
  }

  /**
   * Delete 2FA secret completely (for user deletion)
   */
  deleteSecret(userId: number): Result<null, string> {
    const deleteResult = this.db.run(
      `DELETE FROM user_2fa_secrets WHERE userId = ?`,
      [userId]
    );

    if (deleteResult.isErr()) {
      return Result.Err('Failed to delete 2FA secret');
    }

    return Result.Ok(null);
  }
}
