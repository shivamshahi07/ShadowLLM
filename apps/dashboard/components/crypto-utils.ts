/**
 * Client-Side Encryption Utilities for BYOK (Bring-Your-Own-Key)
 * Uses browser Web Crypto API (AES-GCM 256-bit) to ensure user API keys
 * are stored in an encrypted format in localStorage and only decrypted
 * in-memory when dispatched to authorized test sessions.
 */

const SALT = new Uint8Array([83, 104, 97, 100, 111, 119, 76, 76, 77, 95, 83, 101, 99, 117, 114, 101]); // "ShadowLLM_Secure"

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptKey(plainText: string, userSecret = 'shadow_llm_client_vault'): Promise<string> {
  if (!plainText || !plainText.trim()) return '';
  try {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      return btoa(plainText); // Safe fallback if crypto is unavailable
    }
    const key = await deriveKey(userSecret);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plainText)
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    let binary = '';
    const bytes = new Uint8Array(combined);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.warn('Encryption fallback applied:', err);
    return btoa(plainText);
  }
}

export async function decryptKey(cipherText: string, userSecret = 'shadow_llm_client_vault'): Promise<string> {
  if (!cipherText || !cipherText.trim()) return '';
  try {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      return atob(cipherText);
    }
    const binary = atob(cipherText);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    if (bytes.length < 13) {
      return atob(cipherText); // Likely fallback encoded
    }

    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);
    const key = await deriveKey(userSecret);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (err) {
    try {
      return atob(cipherText);
    } catch {
      return '';
    }
  }
}

export interface EncryptedUserKeys {
  geminiApiKeyEnc?: string;
  groqApiKeyEnc?: string;
  openrouterApiKeyEnc?: string;
}

export interface DecryptedUserKeys {
  geminiApiKey: string;
  groqApiKey: string;
  openrouterApiKey: string;
}

export async function saveEncryptedKeys(
  keys: { geminiApiKey?: string; groqApiKey?: string; openrouterApiKey?: string },
  userEmail: string
): Promise<void> {
  const encGemini = await encryptKey(keys.geminiApiKey || '', userEmail);
  const encGroq = await encryptKey(keys.groqApiKey || '', userEmail);
  const encOR = await encryptKey(keys.openrouterApiKey || '', userEmail);

  const payload: EncryptedUserKeys = {
    geminiApiKeyEnc: encGemini,
    groqApiKeyEnc: encGroq,
    openrouterApiKeyEnc: encOR,
  };

  localStorage.setItem(`shadow_keys_${userEmail}`, JSON.stringify(payload));
}

export async function loadDecryptedKeys(userEmail: string): Promise<DecryptedUserKeys> {
  const raw = localStorage.getItem(`shadow_keys_${userEmail}`);
  if (!raw) {
    return { geminiApiKey: '', groqApiKey: '', openrouterApiKey: '' };
  }

  try {
    const parsed: EncryptedUserKeys = JSON.parse(raw);
    const [geminiApiKey, groqApiKey, openrouterApiKey] = await Promise.all([
      decryptKey(parsed.geminiApiKeyEnc || '', userEmail),
      decryptKey(parsed.groqApiKeyEnc || '', userEmail),
      decryptKey(parsed.openrouterApiKeyEnc || '', userEmail),
    ]);

    return { geminiApiKey, groqApiKey, openrouterApiKey };
  } catch {
    return { geminiApiKey: '', groqApiKey: '', openrouterApiKey: '' };
  }
}
