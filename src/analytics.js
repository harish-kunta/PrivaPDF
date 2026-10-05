import { initializeApp } from 'firebase/app';
import {
  getAnalytics,
  isSupported,
  logEvent,
  setAnalyticsCollectionEnabled,
} from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let analyticsPromise;

const hasAnalyticsConfig = () => Object.values(firebaseConfig).every(Boolean);

export const enableAnalytics = async () => {
  if (!hasAnalyticsConfig()) return null;
  if (!analyticsPromise) {
    analyticsPromise = isSupported().then((supported) => {
      if (!supported) return null;
      const app = initializeApp(firebaseConfig);
      const analytics = getAnalytics(app);
      setAnalyticsCollectionEnabled(analytics, true);
      return analytics;
    });
  }
  return analyticsPromise;
};

export const disableAnalytics = async () => {
  const analytics = await analyticsPromise;
  if (analytics) setAnalyticsCollectionEnabled(analytics, false);
};

export const trackEvent = async (eventName, eventParams = {}) => {
  const analytics = await analyticsPromise;
  if (analytics) logEvent(analytics, eventName, eventParams);
};
