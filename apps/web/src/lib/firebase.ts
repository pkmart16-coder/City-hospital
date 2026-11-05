import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAiViLGS4-qPQg7WngnECtkdRzMbZNHSbQ',
  authDomain: 'city-hospital-f534f.firebaseapp.com',
  projectId: 'city-hospital-f534f',
  storageBucket: 'city-hospital-f534f.firebasestorage.app',
  messagingSenderId: '96664392162',
  appId: '1:96664392162:web:758e8d8f59b09efefc29bb',
};

export const STORAGE_BUCKET = firebaseConfig.storageBucket;
const fbApp = (): FirebaseApp => (getApps().length ? getApp() : initializeApp(firebaseConfig));
export const getDb = () => getFirestore(fbApp());
export const getBucket = () => getStorage(fbApp());