import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';

export function hashPassword(password: string): string {
	const encoder = new TextEncoder();
	const data = encoder.encode(password);
	const hash = sha256(data);
	return encodeHexLowerCase(hash);
}

export function verifyPassword(password: string, hashedPassword: string): boolean {
	return hashPassword(password) === hashedPassword;
}

export function generateSessionToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return encodeHexLowerCase(bytes);
}
