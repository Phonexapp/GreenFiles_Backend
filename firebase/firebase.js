// firebase/firebase.js
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK with your service account credentials
const serviceAccount = require("./serviceAccountKey.json"); // Download this from Firebase Console
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://greenfiles-574e5-default-rtdb.firebaseio.com",
});

module.exports = admin;
