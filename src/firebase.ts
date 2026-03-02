// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD5vz6zoLDuA5lPMYZcE3Q3VpXlfHTiC2Y",
  authDomain: "dating-3736a.firebaseapp.com",
  projectId: "dating-3736a",
  storageBucket: "dating-3736a.firebasestorage.app",
  messagingSenderId: "756936504764",
  appId: "1:756936504764:web:5d908419db4278d0a767b9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);