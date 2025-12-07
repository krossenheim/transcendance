/**
 * Vault Integration Utility
 * 
 * This module provides utilities for fetching secrets from HashiCorp Vault.
 * In production, use this instead of hardcoded secrets or environment variables
 * containing sensitive data.
 */

import axios from 'axios';

interface VaultSecrets {
  [key: string]: string;
}

interface VaultResponse {
  data: {
    data: VaultSecrets;
  };
}

const VAULT_ADDR = process.env.VAULT_ADDR || 'http://vault:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN;

/**
 * Fetch secrets from Vault KV v2 store
 * @param secretPath - Path to the secret (e.g., 'transcendance/auth')
 * @returns Object containing the secrets
 */
export async function fetchSecretsFromVault(secretPath: string): Promise<VaultSecrets | null> {
  if (!VAULT_TOKEN) {
    console.warn('[Vault] VAULT_TOKEN not set, skipping Vault fetch');
    return null;
  }

  try {
    const url = `${VAULT_ADDR}/v1/secret/data/${secretPath}`;
    const response = await axios.get<VaultResponse>(url, {
      headers: {
        'X-Vault-Token': VAULT_TOKEN,
      },
      timeout: 5000,
    });

    if (response.status === 200 && response.data?.data?.data) {
      console.log(`[Vault] Successfully fetched secrets from ${secretPath}`);
      return response.data.data.data;
    }

    console.warn(`[Vault] Unexpected response from Vault for ${secretPath}`);
    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Vault] Failed to fetch secrets from ${secretPath}:`, errorMessage);
    return null;
  }
}

/**
 * Get a specific secret with fallback to environment variable
 * @param vaultPath - Path in Vault
 * @param secretKey - Key of the secret within the path
 * @param envFallback - Environment variable name to use as fallback
 * @param defaultValue - Default value if neither Vault nor env var available
 */
export async function getSecret(
  vaultPath: string,
  secretKey: string,
  envFallback?: string,
  defaultValue?: string
): Promise<string | undefined> {
  // Try Vault first
  const secrets = await fetchSecretsFromVault(vaultPath);
  if (secrets && secrets[secretKey]) {
    return secrets[secretKey];
  }

  // Fall back to environment variable
  if (envFallback && process.env[envFallback]) {
    console.warn(`[Vault] Using environment variable ${envFallback} as fallback`);
    return process.env[envFallback];
  }

  // Use default value
  if (defaultValue !== undefined) {
    console.warn(`[Vault] Using default value for ${secretKey} (NOT RECOMMENDED FOR PRODUCTION)`);
    return defaultValue;
  }

  return undefined;
}

/**
 * Initialize auth service secrets from Vault
 */
export async function initAuthSecrets(): Promise<{
  jwtSecret: string;
  githubClientId: string;
  githubClientSecret: string;
}> {
  const secrets = await fetchSecretsFromVault('transcendance/auth');
  
  return {
    jwtSecret: secrets?.JWT_SECRET || process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION',
    githubClientId: secrets?.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '',
    githubClientSecret: secrets?.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '',
  };
}

/**
 * Initialize database secrets from Vault
 */
export async function initDbSecrets(): Promise<{
  tokenSecretKey: string;
  totpMasterKey: string;
}> {
  const secrets = await fetchSecretsFromVault('transcendance/db');
  
  return {
    tokenSecretKey: secrets?.TOKEN_SECRET_KEY || process.env.TOKEN_SECRET_KEY || 'CHANGE_ME_IN_PRODUCTION',
    totpMasterKey: secrets?.TOTP_MASTER_KEY || process.env.TOTP_MASTER_KEY || 'CHANGE_ME_IN_PRODUCTION',
  };
}

export default {
  fetchSecretsFromVault,
  getSecret,
  initAuthSecrets,
  initDbSecrets,
};
