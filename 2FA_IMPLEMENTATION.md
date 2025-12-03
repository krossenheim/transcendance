# Two-Factor Authentication (2FA) Implementation

This implementation adds TOTP-based two-factor authentication to the Transcendence project, using the core logic from your ft_otp project.

## Overview

The 2FA system uses Time-based One-Time Passwords (TOTP) as specified in RFC 6238. Users can enable 2FA on their accounts, which requires them to enter a 6-digit code from an authenticator app (like Google Authenticator or Authy) in addition to their password when logging in.

## Architecture

### Backend Components

#### 1. TOTP Module (`/srcs/nodejs_base_image/utils/totp.ts`)
Ported from your Python ft_otp implementation, this module provides:
- **TOTP class**: Generates and verifies time-based one-time passwords
- **TOTPSecretEncryption class**: Encrypts/decrypts TOTP secrets using AES-256-GCM

Key features:
- 30-second time window
- 6-digit codes
- SHA1 HMAC algorithm (standard for TOTP)
- QR code generation for easy setup
- Time window tolerance (±1 step) for verification

#### 2. Database Schema (`/srcs/db/structure.sql`)
New table `user_2fa_secrets`:
```sql
CREATE TABLE IF NOT EXISTS user_2fa_secrets (
    userId INTEGER PRIMARY KEY,
    encryptedSecret TEXT NOT NULL,
    isEnabled INTEGER DEFAULT 0,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
);
```

#### 3. Two-Factor Service (`/srcs/db/src_ts/database/twoFactorService.ts`)
Manages 2FA operations:
- `generateSecret()`: Creates new TOTP secret and QR code
- `enable()`: Enables 2FA after verifying initial code
- `disable()`: Disables 2FA for a user
- `verify()`: Validates TOTP codes during login
- `isEnabled()`: Checks if user has 2FA enabled

#### 4. Database Routes (`/srcs/db/src_ts/routes/twoFactor.ts`)
Internal API endpoints:
- `GET /internal_api/db/2fa/status/:userId` - Check 2FA status
- `POST /internal_api/db/2fa/generate` - Generate QR code
- `POST /internal_api/db/2fa/enable` - Enable 2FA
- `POST /internal_api/db/2fa/disable` - Disable 2FA
- `POST /internal_api/db/2fa/verify` - Verify TOTP code

#### 5. Auth Service (`/srcs/auth/src_ts/main.ts`)
Updated login flow and public API endpoints:
- Modified `POST /public_api/auth/login` to check for 2FA
- `POST /public_api/auth/2fa/setup` - Generate QR code
- `POST /public_api/auth/2fa/enable` - Enable after verification
- `POST /public_api/auth/2fa/disable` - Disable 2FA
- `POST /public_api/auth/2fa/verify-login` - Complete 2FA login
- `GET /public_api/auth/2fa/status/:userId` - Check status

### Frontend Components

#### 1. Login Component (`/srcs/nginx/react_source/tsxsourcefiles/loginComponent.tsx`)
Enhanced to handle 2FA:
- Detects `requires2FA` response from login
- Transitions to 2FA verification screen
- Stores temporary token for verification

#### 2. Two-Factor Components (`/srcs/nginx/react_source/tsxsourcefiles/twoFactorComponent.tsx`)
Four React components:

**TwoFactorVerify**: Login 2FA verification screen
- 6-digit code input
- Validates and completes login

**TwoFactorSetup**: Setup wizard
- Generates QR code
- Shows secret for manual entry
- Verifies first code before enabling

**TwoFactorDisable**: Disable confirmation
- Confirms user wants to disable 2FA

#### 3. Settings Component (`/srcs/nginx/react_source/tsxsourcefiles/twoFactorSettings.tsx`)
Profile settings integration:
- Shows current 2FA status
- Enable/disable buttons
- Can be added to profile page

## User Flow

### Enabling 2FA

1. User goes to profile/settings
2. Clicks "Enable 2FA"
3. System generates a random 64-character hex secret
4. Secret is encrypted and stored in database (disabled)
5. QR code is displayed
6. User scans QR code with authenticator app
7. User enters first 6-digit code to verify setup
8. System verifies code and enables 2FA
9. 2FA is now active for this account

### Login with 2FA

1. User enters username and password
2. System validates credentials
3. If user has 2FA enabled:
   - System generates temporary token (5-minute expiry)
   - Returns `{requires2FA: true, tempToken: "..."}`
   - Frontend shows 2FA verification screen
4. User enters 6-digit code from authenticator
5. System verifies code (with ±30 second tolerance)
6. If valid, generates real JWT/refresh tokens
7. User is logged in

### Disabling 2FA

1. User goes to settings
2. Clicks "Disable 2FA"
3. Confirms action
4. 2FA is disabled (secret remains encrypted in DB)
5. Can be re-enabled anytime

## Security Features

### Secret Storage
- Secrets encrypted with AES-256-GCM
- PBKDF2 key derivation (100,000 iterations)
- Master password from environment variable
- Random salt per encryption

### Login Protection
- Temporary tokens expire in 5 minutes
- Time-window tolerance prevents clock drift issues
- Failed attempts don't reveal if 2FA is enabled
- Temp tokens stored in-memory (consider Redis for production)

### Code Verification
- ±1 time step window (90 seconds total)
- Prevents replay attacks through time-based validation
- Standard TOTP algorithm (compatible with all authenticator apps)

## Configuration

### Environment Variables

Add to your `.env` or `globals.env`:

```bash
# TOTP master encryption key (CHANGE THIS IN PRODUCTION!)
TOTP_MASTER_KEY=your-secure-random-key-here
```

**⚠️ IMPORTANT**: Generate a secure random key for production:
```bash
openssl rand -hex 32
```

### Database Migration

The new table will be created automatically when the database service starts. For existing databases:

```bash
# Rebuild database container
docker-compose down db
docker-compose up -d db
```

Or manually run:
```sql
CREATE TABLE IF NOT EXISTS user_2fa_secrets (
    userId INTEGER PRIMARY KEY,
    encryptedSecret TEXT NOT NULL,
    isEnabled INTEGER DEFAULT 0,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_2fa_userId ON user_2fa_secrets(userId);
```

## Installation & Setup

1. **Install dependencies**:
   ```bash
   # Already added to package.json
   npm install qrcode
   ```

2. **Set environment variable**:
   ```bash
   # In your globals.env or docker-compose.yml
   TOTP_MASTER_KEY=$(openssl rand -hex 32)
   ```

3. **Rebuild containers**:
   ```bash
   make
   # or
   docker-compose up --build
   ```

4. **Test the implementation**:
   - Register or log in as a user
   - Go to profile settings
   - Click "Enable 2FA"
   - Scan QR code with Google Authenticator
   - Enter code to enable
   - Log out and log back in
   - Verify 2FA prompt appears

## Testing

### Manual Testing

1. **Test Setup**:
   ```bash
   # Install Google Authenticator on your phone
   # Or use online TOTP generator for testing
   ```

2. **Test Enable Flow**:
   - User with no 2FA → Settings → Enable 2FA
   - Scan QR code
   - Verify with 6-digit code
   - Should show "2FA enabled successfully"

3. **Test Login Flow**:
   - Log out
   - Enter username/password
   - Should show 2FA prompt
   - Enter code from app
   - Should log in successfully

4. **Test Disable Flow**:
   - Settings → Disable 2FA
   - Confirm
   - Log out and back in
   - Should NOT prompt for 2FA

### Automated Testing (Future)

Create tests in `/srcs/db/src_ts/database/twoFactorService.test.ts`:
```typescript
import { TOTP } from '../../../nodejs_base_image/utils/totp.js';

describe('TOTP', () => {
  it('should generate valid codes', () => {
    const totp = new TOTP();
    const secret = totp.generateSecret();
    const code = totp.generate(secret);
    expect(totp.verify(secret, code)).toBe(true);
  });
  
  it('should reject invalid codes', () => {
    const totp = new TOTP();
    const secret = totp.generateSecret();
    expect(totp.verify(secret, '000000')).toBe(false);
  });
});
```

## Integration with Profile

To add 2FA settings to your profile component:

```typescript
import { TwoFactorSettings } from "./twoFactorSettings";

// Inside your profile component, add:
{isOwnProfile && (
  <div className="mt-6">
    <h4 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">
      Security Settings
    </h4>
    <TwoFactorSettings 
      userId={currentUserId} 
      username={profile.username} 
    />
  </div>
)}
```

## Troubleshooting

### QR Code Not Displaying
- Check browser console for errors
- Verify `qrcode` npm package is installed
- Check that endpoint returns base64 image data

### "Invalid 2FA code" Error
- Verify phone time is synced correctly
- Check time zone settings
- Codes are time-sensitive (30-second window)
- Try waiting for next code

### Database Errors
- Verify `user_2fa_secrets` table exists
- Check foreign key constraints
- Ensure database service is running

### "No TOTP_MASTER_KEY" Warning
- Set `TOTP_MASTER_KEY` environment variable
- Don't use default key in production

## Production Considerations

1. **Temp Token Storage**: 
   - Currently in-memory (lost on restart)
   - Use Redis for distributed systems
   - Implement token cleanup

2. **Rate Limiting**:
   - Add rate limits to 2FA endpoints
   - Prevent brute force attacks
   - Consider lockout after failed attempts

3. **Backup Codes**:
   - Generate one-time backup codes
   - Allow account recovery if phone lost
   - Store securely like passwords

4. **Audit Logging**:
   - Log 2FA enable/disable events
   - Track failed verification attempts
   - Monitor for suspicious activity

5. **Recovery Options**:
   - Email verification for 2FA reset
   - Admin override capability
   - Account recovery flow

## Comparison with ft_otp

This implementation preserves the core algorithms from your ft_otp project:

| Feature | ft_otp (Python) | Transcendence (TypeScript) |
|---------|----------------|----------------------------|
| TOTP Algorithm | ✅ RFC 6238 | ✅ RFC 6238 |
| HOTP Base | ✅ RFC 4226 | ✅ RFC 4226 |
| Encryption | ✅ Fernet (AES-128) | ✅ AES-256-GCM |
| Key Derivation | ✅ PBKDF2 | ✅ PBKDF2 |
| QR Code Gen | ✅ qrcode lib | ✅ qrcode lib |
| Web Interface | ✅ Flask | ✅ Fastify + React |
| Time Window | ✅ 30s | ✅ 30s |
| Code Length | ✅ 6 digits | ✅ 6 digits |

## Future Enhancements

- [ ] Backup codes for account recovery
- [ ] SMS 2FA option
- [ ] WebAuthn/FIDO2 support
- [ ] 2FA enforcement policies
- [ ] Admin 2FA management
- [ ] 2FA statistics dashboard
- [ ] Export/import functionality

## Credits

Based on the ft_otp project originally created for a different assignment. Core TOTP/HOTP algorithms ported from Python to TypeScript while maintaining RFC compliance and security best practices.
