import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let initialized = false;

export function initFirebase(): void {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return;
  }

  const serviceAccountPath = resolve(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json',
  );
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
  initialized = true;
}

export function getFirebaseAdmin(): typeof admin {
  if (admin.apps.length === 0) {
    throw new Error(
      'Firebase Admin SDK has not been initialized. Call initFirebase() during application startup.',
    );
  }
  return admin;
}
