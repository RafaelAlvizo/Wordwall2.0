/* eslint-disable */
// @ts-nocheck
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';

function firebaseConfigFromEnv() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  const missing = Object.entries(config)
    .filter(([, v]) => !v || String(v).trim() === '')
    .map(([k]) => k);
  if (missing.length) {
    console.error(
      '[WordWall] Missing Firebase env vars:',
      missing.join(', '),
      '— add them to wordwall-react/.env.local (see .env.example).',
    );
    throw new Error(
      'Firebase is not configured. Copy .env.example to .env.local and set VITE_FIREBASE_* values.',
    );
  }
  return config;
}

const app = initializeApp(firebaseConfigFromEnv());
const db = getFirestore(app);
const auth = getAuth(app);

/** Single doc per user: externalApps/LANGUAGE/WordWall/UserDataWall/WordWallFile/{uid} */
function userWallDataRef(uid) {
  return doc(db, 'externalApps', 'LANGUAGE', 'WordWall', 'UserDataWall', 'WordWallFile', String(uid));
}

window.fbSaveResult = async function (data) {
  try {
    if (!data || !data.userId || data.userId === 'guest') return;
    var ref = userWallDataRef(data.userId);
    /* serverTimestamp() is not valid inside arrayUnion elements */
    var entry = Object.assign({}, data, { playedAt: Timestamp.now() });
    try {
      await updateDoc(ref, { sessions: arrayUnion(entry) });
    } catch (err) {
      await setDoc(ref, { sessions: [entry] }, { merge: true });
    }
  } catch (e) {
    console.error(e);
  }
};

window.fbRegister = async function (email, password, profile) {
  var c = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(
    userWallDataRef(c.user.uid),
    Object.assign({}, profile, {
      email: email,
      authUid: c.user.uid,
      createdAt: serverTimestamp(),
      words: {},
      sessions: [],
      weakPhonemes: [],
      phonemeWeaknessHistory: [],
    }),
    { merge: false },
  );
  return c.user;
};

window.fbLogin = async function (email, password) {
  var c = await signInWithEmailAndPassword(auth, email, password);
  return c.user;
};
window.fbSignOut = function () {
  return signOut(auth);
};
window.fbResetPwd = function (email) {
  return sendPasswordResetEmail(auth, email);
};
window.fbAuthReady = function (cb) {
  return onAuthStateChanged(auth, cb);
};

window.fbGetProfile = async function (uid) {
  try {
    var s = await getDoc(userWallDataRef(uid));
    return s.exists() ? s.data() : null;
  } catch (e) {
    return null;
  }
};

window.fbSavePhonemeProblem = async function (uid, userEmail, weaknesses) {
  if (!uid || !weaknesses || !weaknesses.length) return;
  try {
    var ref = userWallDataRef(uid);
    var snap = await getDoc(ref);
    var d = snap.exists() ? snap.data() : {};
    var prev = d.weakPhonemes && Array.isArray(d.weakPhonemes) ? d.weakPhonemes : [];
    var merged = weaknesses.concat(prev).slice(0, 50);
    var hist = d.phonemeWeaknessHistory && Array.isArray(d.phonemeWeaknessHistory) ? d.phonemeWeaknessHistory.slice() : [];
    hist.push({ userEmail: userEmail, recordedAt: Timestamp.now(), weaknesses: weaknesses });
    /* Cap history so one doc does not grow without bound */
    if (hist.length > 100) hist = hist.slice(-100);
    await setDoc(ref, { weakPhonemes: merged, phonemeWeaknessHistory: hist }, { merge: true });
  } catch (e) {
    console.error('fbSavePhonemeProblem:', e);
  }
};

window.fbGetWord = async function (bankLang, id) {
  try {
    var s = await getDoc(
      doc(db, 'externalApps', 'LANGUAGE', 'VocabularyBuilder', 'Word-bank-VB', bankLang, String(id)),
    );
    if (!s.exists()) return null;
    var d = s.data();
    return (
      d.word ||
      d.Word ||
      d.english ||
      d.spanish ||
      d.text ||
      d.name ||
      Object.values(d).find(function (v) {
        return typeof v === 'string' && v.length > 0;
      }) ||
      null
    );
  } catch (e) {
    console.error('fbGetWord(' + bankLang + ',' + id + '):', e);
    return null;
  }
};

window.fbGetWordProgress = async function (userId) {
  try {
    var s = await getDoc(userWallDataRef(userId));
    if (!s.exists()) return {};
    var d = s.data();
    var w = d.words;
    return w && typeof w === 'object' && !Array.isArray(w) ? w : {};
  } catch (e) {
    console.error('fbGetWordProgress:', e);
    return {};
  }
};

window.fbGetAssessmentProgress = async function (userId) {
  try {
    var s = await getDoc(userWallDataRef(userId));
    if (!s.exists()) return {};
    var d = s.data();
    var w = d.assessmentProgress;
    return w && typeof w === 'object' && !Array.isArray(w) ? w : {};
  } catch (e) {
    console.error('fbGetAssessmentProgress:', e);
    return {};
  }
};

function normEmail(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function rowsFromAssessmentDoc(d) {
  if (!d || typeof d !== 'object') return [];
  var keys = [
    'knownWords',
    'words',
    'items',
    'pairs',
    'entries',
    'known',
    'vocabulary',
    'assessmentWords',
  ];
  for (var i = 0; i < keys.length; i++) {
    var v = d[keys[i]];
    if (Array.isArray(v) && v.length) return v;
  }
  return [];
}

function pairFromAssessmentEntry(e, gameLang) {
  if (!e) return null;
  if (typeof e === 'string') return { prompt: e, target: e };
  if (typeof e === 'object') {
    var p =
      e.prompt ||
      e.native ||
      e.source ||
      e.from ||
      e.es ||
      e.spanish ||
      e.question ||
      e.wordA ||
      '';
    var t =
      e.target ||
      e.translation ||
      e.en ||
      e.english ||
      e.answer ||
      e.wordB ||
      '';
    if ((!p || !t) && e.pair && Array.isArray(e.pair) && e.pair.length >= 2) {
      p = e.pair[0];
      t = e.pair[1];
    }
    p = String(p || '').trim();
    t = String(t || '').trim();
    if (p && t) return { prompt: p, target: t };
  }
  return null;
}

window.fbGetAssessmentKnownWordsForUser = async function (email, gameLang) {
  var em = normEmail(email);
  if (!em) return [];
  try {
    var col = collection(
      db,
      'externalApps',
      'LANGUAGE',
      'VocabularyBuilder',
      'Assessment',
      'Users',
    );
    var snap = await getDocs(col);
    var out = [];
    snap.forEach(function (docSnap) {
      var d = docSnap.data() || {};
      var docEm = normEmail(d.email || d.Email || d.userEmail || d.mail || '');
      if (docEm !== em && normEmail(docSnap.id) !== em) return;
      var raw = rowsFromAssessmentDoc(d);
      for (var i = 0; i < raw.length; i++) {
        var pair = pairFromAssessmentEntry(raw[i], gameLang);
        if (pair) out.push(pair);
      }
    });
    return out;
  } catch (e) {
    console.error('fbGetAssessmentKnownWordsForUser:', e);
    return [];
  }
};

window.fbSaveWordProgress = async function (userId, wordId, wordText, timesDone) {
  try {
    var ref = userWallDataRef(userId);
    var data = {
      word: wordText,
      ID: Number(wordId),
      timesDone: timesDone,
      updatedAt: serverTimestamp(),
    };
    if (timesDone >= 3) {
      data.verifiedWord = wordText;
      data.verifiedAt = serverTimestamp();
    }
    await setDoc(ref, { words: { [String(wordId)]: data } }, { merge: true });
  } catch (e) {
    console.error('fbSaveWordProgress:', e);
  }
};

window.fbSaveAssessmentProgress = async function (userId, entryId, promptWord, targetWord, timesDone) {
  try {
    var ref = userWallDataRef(userId);
    var data = {
      prompt: String(promptWord || ''),
      target: String(targetWord || ''),
      timesDone: timesDone,
      updatedAt: serverTimestamp(),
    };
    if (timesDone >= 3) {
      data.verifiedAt = serverTimestamp();
    }
    await setDoc(ref, { assessmentProgress: { [String(entryId)]: data } }, { merge: true });
  } catch (e) {
    console.error('fbSaveAssessmentProgress:', e);
  }
};
