import { Database, DatabaseError, DatabaseErrorType } from './database.js';
import { TOTP, TOTPSecretEncryption } from '@app/shared/totp';
import { Result } from '@app/shared/api/service/common/result';
import { z } from 'zod';
import { RunResult } from 'better-sqlite3';

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

  private _dbUserHas2FAEnabled(userId: number): Result<boolean, DatabaseError> {
    return this.db.get(
      `SELECT isEnabled FROM user_2fa_secrets WHERE userId = ?`,
      z.object({ isEnabled: z.coerce.boolean() }),
      [userId]
    ).map((result) => result.isEnabled);
  }

  private _dbDeleteUser2FAData(userId: number): Result<RunResult, DatabaseError> {
    return this.db.run(
      `DELETE FROM user_2fa_secrets WHERE userId = ?`,
      [userId]
    );
  }

  private _dbInsertOrUpdateUser2FAData(userId: number, encryptedSecret: string, isEnabled: boolean): Result<RunResult, DatabaseError> {
    return this.db.run(
      `INSERT INTO user_2fa_secrets (userId, encryptedSecret, isEnabled, createdAt) 
       VALUES (?, ?, ?, strftime('%s', 'now')) 
       ON CONFLICT(userId) DO UPDATE SET encryptedSecret = excluded.encryptedSecret, isEnabled = excluded.isEnabled, createdAt = excluded.createdAt`,
      [userId, encryptedSecret, isEnabled ? 1 : 0]
    );
  }

  private _dbUpdateUser2FAData(userId: number, options?: { encryptedSecret?: string; isEnabled?: boolean }): Result<RunResult, DatabaseError> {
    return this.db.update(
      'user_2fa_secrets',
      {
        encryptedSecret: options?.encryptedSecret,
        isEnabled: options?.isEnabled !== undefined ? (options.isEnabled ? 1 : 0) : undefined,
      },
      'userId = ?',
      [userId]
    );
  }

  private _dbGetUserEncryptedSecret(userId: number): Result<string, DatabaseError> {
    return this.db.get(
      `SELECT encryptedSecret FROM user_2fa_secrets WHERE userId = ?`,
      z.object({ encryptedSecret: z.string() }),
      [userId]
    ).map((result) => result.encryptedSecret);
  }

  private _dbGetUserSecretForVerification(userId: number): Result<string, DatabaseError> {
    return this.db.get(
      `SELECT encryptedSecret FROM user_2fa_secrets WHERE userId = ? AND isEnabled = 1`,
      z.object({ encryptedSecret: z.string() }),
      [userId]
    ).map((result) => result.encryptedSecret);
  }

  /**
   * Check if user has 2FA enabled
   */
  public isEnabled(userId: number): Result<boolean, DatabaseError> {
    return this._dbUserHas2FAEnabled(userId).flatMapErr((error) => {
      if (error.type === DatabaseErrorType.NOT_FOUND)
        return Result.Ok(false); // No 2FA secret means 2FA is not enabled
      return Result.Err(error);
    });
  }
  
  /**
   * Generate a new 2FA secret for user (but don't enable it yet)
   * Returns the QR code data URL and the secret (for manual entry)
   */
  public async generateSecret(
    userId: number,
    username: string
  ): Promise<Result<{ qrCode: string; secret: string; uri: string }, DatabaseError>> {
    return await this.db.safeBlockAsync(async () => {
      const secret = this.totp.generateSecret(32);
      const encryptedSecret = this.encryption.encrypt(secret, this.masterPassword);
      this._dbInsertOrUpdateUser2FAData(userId, encryptedSecret, false).unwrap();
      const uri = this.totp.generateTOTPUri(secret, username, 'Transcendence');
      const qrCode = await this.totp.generateQRCode(uri);
      return Result.Ok({ qrCode, secret, uri });
    });
  }

  /**
   * Enable 2FA after user has scanned QR and verified first code
   */
  public async enable(userId: number, verificationCode: string): Promise<Result<null, DatabaseError>> {
    return await this.db.safeBlockAsync(async () => {
      const encryptedSecretResult = this._dbGetUserEncryptedSecret(userId)
        .expect('No 2FA secret found. Generate one first.');
      const secret = this.encryption.decrypt(encryptedSecretResult, this.masterPassword);
      if (!this.totp.verify(secret, verificationCode))
        return Result.Err(DatabaseError.internal('Invalid verification code'));
      return this._dbUpdateUser2FAData(userId, { isEnabled: true }).map(() => null);
    });
  }

  /**
   * Disable 2FA (requires current password or admin action)
   */
  public disable2FA(userId: number): Result<null, DatabaseError> {
    return this._dbUpdateUser2FAData(userId, { isEnabled: false }).map(() => null);
  }

  /**
   * Verify a TOTP code for a user
   */
  public verify(userId: number, code: string): Result<boolean, DatabaseError> {
    if (this.isEnabled(userId).unwrapOr(false) === false )
      return Result.Err(DatabaseError.internal('2FA is not enabled for this user'));

    return this._dbGetUserSecretForVerification(userId).flatMap((secret) => {
      return Result.safeTry(() => {
        const decryptedSecret = this.encryption.decrypt(secret, this.masterPassword);
        return this.totp.verify(decryptedSecret, code, 1); // 1-step window tolerance
      }, (e) => {
        console.error('Error decrypting secret or verifying code:', e);
        return DatabaseError.internal('Failed to verify 2FA code');
      });
    });
  }

  /**
   * Delete 2FA secret completely (for user deletion)
   */
  public deleteSecret(userId: number): Result<null, DatabaseError> {
    return this._dbDeleteUser2FAData(userId).map(() => null);
  }
}
