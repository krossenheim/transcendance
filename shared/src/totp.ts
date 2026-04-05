import * as crypto from 'crypto';

export class TOTP {
  private timeStep: number = 30;
  private digits: number = 6;
  private algorithm: string = 'sha1';

  generateSecret(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  hexToBase32(hexKey: string): string {
    const keyBytes = Buffer.from(hexKey, 'hex');
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < keyBytes.length; i++) {
      value = (value << 8) | keyBytes[i]!;
      bits += 8;

      while (bits >= 5) {
        output += base32Chars[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += base32Chars[(value << (5 - bits)) & 31];
    }

    return output;
  }

  private hotp(key: string, counter: number): number {
    const keyBuffer = Buffer.from(key, 'hex');
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));

    const hmacDigest = crypto
      .createHmac(this.algorithm, keyBuffer)
      .update(counterBuffer)
      .digest();

    const offset = hmacDigest[hmacDigest.length - 1]! & 0x0f;
    const truncated =
      ((hmacDigest[offset]! & 0x7f) << 24) |
      ((hmacDigest[offset + 1]! & 0xff) << 16) |
      ((hmacDigest[offset + 2]! & 0xff) << 8) |
      (hmacDigest[offset + 3]! & 0xff);

    const otp = truncated % Math.pow(10, this.digits);
    return otp;
  }

  generate(key: string, timestamp?: number): string {
    const time = timestamp || Math.floor(Date.now() / 1000);
    const counter = Math.floor(time / this.timeStep);
    const otp = this.hotp(key, counter);
    return otp.toString().padStart(this.digits, '0');
  }

  verify(key: string, token: string, window: number = 1): boolean {
    const currentTime = Math.floor(Date.now() / 1000);

    for (let i = -window; i <= window; i++) {
      const time = currentTime + (i * this.timeStep);
      const expectedToken = this.generate(key, time);

      if (expectedToken === token) {
        return true;
      }
    }

    return false;
  }

  getTimeRemaining(): number {
    const currentTime = Math.floor(Date.now() / 1000);
    return this.timeStep - (currentTime % this.timeStep);
  }

  generateTOTPUri(
    secret: string,
    accountName: string,
    issuer: string = 'Transcendence'
  ): string {
    const base32Secret = this.hexToBase32(secret);
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
      accountName
    )}?secret=${base32Secret}&issuer=${encodeURIComponent(
      issuer
    )}&digits=${this.digits}&period=${this.timeStep}&algorithm=SHA1`;
  }

  async generateQRCode(uri: string): Promise<string> {
    try {
      const QRCode: any = await import('qrcode' as any).catch(() => null);
      if (!QRCode || !QRCode.toDataURL) {
        throw new Error('QRCode package not available');
      }
      return await QRCode.toDataURL(uri);
    } catch (error) {
      console.error('QRCode generation error:', error);
      throw new Error('QRCode package not available. Install with: npm install qrcode @types/qrcode');
    }
  }
}

export class TOTPSecretEncryption {
  private algorithm: string = 'aes-256-gcm';
  private keyLength: number = 32;
  private ivLength: number = 16;
  private saltLength: number = 64;
  private tagLength: number = 16;

  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      100000,
      this.keyLength,
      'sha256'
    );
  }

  encrypt(secret: string, masterPassword: string): string {
    const salt = crypto.randomBytes(this.saltLength);
    const key = this.deriveKey(masterPassword, salt);
    const iv = crypto.randomBytes(this.ivLength);

    const cipher = crypto.createCipheriv(this.algorithm, key, iv) as crypto.CipherGCM;
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    const combined = Buffer.concat([salt, iv, tag, encrypted]);
    return combined.toString('base64');
  }

  decrypt(encryptedData: string, masterPassword: string): string {
    const combined = Buffer.from(encryptedData, 'base64');

    const salt = combined.subarray(0, this.saltLength);
    const iv = combined.subarray(this.saltLength, this.saltLength + this.ivLength);
    const tag = combined.subarray(
      this.saltLength + this.ivLength,
      this.saltLength + this.ivLength + this.tagLength
    );
    const encrypted = combined.subarray(this.saltLength + this.ivLength + this.tagLength);

    const key = this.deriveKey(masterPassword, salt);

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}

export default TOTP;

