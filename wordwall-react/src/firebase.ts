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
  increment,
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

function normEmail(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

/** Single doc per user: externalApps/LANGUAGE/WordWall/UserDataWall/WordWallFile/{normalized-email} */
function userDocIdFromEmail(email) {
  var em = normEmail(email);
  return em;
}

function legacyUserWallDataRef(uid) {
  return doc(db, 'externalApps', 'LANGUAGE', 'WordWall', 'UserDataWall', 'WordWallFile', String(uid));
}

function userWallDataRef(userId, emailHint) {
  var currentEmail = (auth.currentUser && auth.currentUser.email) || '';
  var resolvedEmail = emailHint || currentEmail;
  var emailDocId = userDocIdFromEmail(resolvedEmail);
  var fallbackId = String(userId || '').trim();
  var finalId = emailDocId || fallbackId;
  if (!finalId) throw new Error('Cannot resolve user document id');
  return doc(db, 'externalApps', 'LANGUAGE', 'WordWall', 'UserDataWall', 'WordWallFile', finalId);
}

async function readUserDoc(userId, emailHint) {
  var primaryRef = userWallDataRef(userId, emailHint);
  var primarySnap = await getDoc(primaryRef);
  if (primarySnap.exists()) return { ref: primaryRef, snap: primarySnap };

  var em = normEmail(emailHint || (auth.currentUser && auth.currentUser.email));
  if (em) {
    var legacySuffixRef = doc(
      db,
      'externalApps',
      'LANGUAGE',
      'WordWall',
      'UserDataWall',
      'WordWallFile',
      em + '-current',
    );
    var legacySuffixSnap = await getDoc(legacySuffixRef);
    if (legacySuffixSnap.exists()) {
      await setDoc(primaryRef, legacySuffixSnap.data() || {}, { merge: true });
      var migratedSuffix = await getDoc(primaryRef);
      return { ref: primaryRef, snap: migratedSuffix };
    }
  }

  // Backward compatibility: migrate from legacy uid doc if it exists.
  if (userId) {
    var legacyRef = legacyUserWallDataRef(userId);
    var legacySnap = await getDoc(legacyRef);
    if (legacySnap.exists()) {
      await setDoc(primaryRef, legacySnap.data() || {}, { merge: true });
      var migrated = await getDoc(primaryRef);
      return { ref: primaryRef, snap: migrated };
    }
  }
  return { ref: primaryRef, snap: primarySnap };
}

window.fbSaveResult = async function (data) {
  try {
    if (!data || !data.userId || data.userId === 'guest') return;
    var ref = userWallDataRef(data.userId, data.userEmail);
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

/** Cumulative points on the user doc; uses Firestore increment with merge so the field is always created. */
window.fbAddPoints = async function (userId, userEmail, delta) {
  try {
    var d = Math.floor(Number(delta));
    if (!userId || userId === 'guest' || !Number.isFinite(d) || d <= 0) return;
    await readUserDoc(userId, userEmail);
    var ref = userWallDataRef(userId, userEmail);
    await setDoc(
      ref,
      { points: increment(d), pointsUpdatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.error('fbAddPoints', e);
  }
};

window.fbRegister = async function (email, password, profile) {
  var c = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(
    userWallDataRef(c.user.uid, email),
    Object.assign({}, profile, {
      email: email,
      authUid: c.user.uid,
      createdAt: serverTimestamp(),
      words: {},
      sessions: [],
      points: 0,
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
    var r = await readUserDoc(uid, (auth.currentUser && auth.currentUser.email) || '');
    if (!r.snap.exists()) return null;
    var d = r.snap.data();
    if (d.points === undefined || d.points === null) {
      await setDoc(r.ref, { points: 0, pointsUpdatedAt: serverTimestamp() }, { merge: true });
      d = Object.assign({}, d, { points: 0 });
    }
    return d;
  } catch (e) {
    return null;
  }
};

window.fbSaveLearningLanguage = async function (uid, learningLangCode) {
  if (!uid) return;
  var code = String(learningLangCode || '').toUpperCase() === 'ES' ? 'ES' : 'EN';
  var label = code === 'EN' ? 'English' : 'Spanish';
  try {
    await setDoc(
      userWallDataRef(uid),
      {
        learningLangCode: code,
        learningLang: label,
        targetLang: label,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.error('fbSaveLearningLanguage:', e);
  }
};

window.fbSavePhonemeProblem = async function (uid, userEmail, weaknesses) {
  if (!uid || !weaknesses || !weaknesses.length) return;
  try {
    var ref = userWallDataRef(uid, userEmail);
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
    var r = await readUserDoc(userId, (auth.currentUser && auth.currentUser.email) || '');
    if (!r.snap.exists()) return {};
    var d = r.snap.data();
    var w = d.words;
    return w && typeof w === 'object' && !Array.isArray(w) ? w : {};
  } catch (e) {
    console.error('fbGetWordProgress:', e);
    return {};
  }
};

window.fbGetAssessmentProgress = async function (userId) {
  try {
    var r = await readUserDoc(userId, (auth.currentUser && auth.currentUser.email) || '');
    if (!r.snap.exists()) return {};
    var d = r.snap.data();
    var w = d.assessmentProgress;
    return w && typeof w === 'object' && !Array.isArray(w) ? w : {};
  } catch (e) {
    console.error('fbGetAssessmentProgress:', e);
    return {};
  }
};

function rowsFromAssessmentDoc(d) {
  if (!d || typeof d !== 'object') return [];
  var found = [];
  var keys = Object.keys(d);
  for (var i = 0; i < keys.length; i++) {
    var v = d[keys[i]];
    if (Array.isArray(v) && v.length) {
      for (var j = 0; j < v.length; j++) {
        found.push(v[j]);
      }
    }
  }
  return found;
}

function pairFromAssessmentEntry(e, gameLang) {
  if (!e) return null;
  if (typeof e === 'string' && e.trim()) return { prompt: e.trim(), target: e.trim() };
  if (typeof e === 'object') {
    var allKeys = Object.keys(e);
    var stringVals = [];
    for (var k = 0; k < allKeys.length; k++) {
      var val = e[allKeys[k]];
      if (typeof val === 'string' && val.trim()) {
        stringVals.push({ key: allKeys[k].toLowerCase(), val: val.trim() });
      }
    }

    var p = '';
    var t = '';

    var promptKeys = ['word', 'prompt', 'native', 'source', 'from', 'es', 'spanish', 'question', 'worda', 'palabra', 'word_es', 'spanishword', 'spanish_word'];
    var targetKeys = ['translation', 'target', 'en', 'english', 'answer', 'wordb', 'traduccion', 'word_en', 'englishword', 'english_word'];

    for (var pi = 0; pi < promptKeys.length; pi++) {
      for (var si = 0; si < stringVals.length; si++) {
        if (stringVals[si].key === promptKeys[pi]) { p = stringVals[si].val; break; }
      }
      if (p) break;
    }
    for (var ti = 0; ti < targetKeys.length; ti++) {
      for (var si2 = 0; si2 < stringVals.length; si2++) {
        if (stringVals[si2].key === targetKeys[ti]) { t = stringVals[si2].val; break; }
      }
      if (t) break;
    }

    if ((!p || !t) && e.pair && Array.isArray(e.pair) && e.pair.length >= 2) {
      p = String(e.pair[0] || '').trim();
      t = String(e.pair[1] || '').trim();
    }

    if (!p && !t && stringVals.length >= 2) {
      p = stringVals[0].val;
      t = stringVals[1].val;
    }

    if (p && t) return { prompt: p, target: t };
  }
  return null;
}

window.fbGetAssessmentKnownWordsForUser = async function (email, gameLang) {
  var em = normEmail(email);
  window._kwDebug = { email: em, steps: [] };
  if (!em) { window._kwDebug.steps.push('No email'); return []; }
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
    window._kwDebug.steps.push('Scanned ' + snap.size + ' docs');
    var allDocEmails = [];
    snap.forEach(function (docSnap) {
      var d = docSnap.data() || {};

      var emailFields = ['userEmail', 'email', 'Email', 'mail', 'user_email', 'correo'];
      var docEm = '';
      for (var ef = 0; ef < emailFields.length; ef++) {
        if (d[emailFields[ef]] && typeof d[emailFields[ef]] === 'string') {
          docEm = normEmail(d[emailFields[ef]]);
          if (docEm) break;
        }
      }
      var idEmail = normEmail(docSnap.id);
      if (docEm) allDocEmails.push(docEm);
      if (idEmail.indexOf('@') !== -1) allDocEmails.push(idEmail);

      var matched = (docEm && docEm === em) || (idEmail === em);
      if (!matched) return;

      window._kwDebug.steps.push('MATCHED doc: ' + docSnap.id);
      window._kwDebug.steps.push('Fields: ' + Object.keys(d).join(', '));

      var knownArr = d.known || d.knownWords || d.words || d.items || d.pairs || d.vocabulary || [];
      var unknownArr = d.unknown || d.unknownWords || [];

      if (Array.isArray(knownArr) && knownArr.length) {
        window._kwDebug.steps.push('"known" array has ' + knownArr.length + ' entries');
        window._kwDebug.steps.push('Sample: ' + JSON.stringify(knownArr[0]).substring(0, 120));
        for (var i = 0; i < knownArr.length; i++) {
          var pair = pairFromAssessmentEntry(knownArr[i], gameLang);
          if (pair) out.push(pair);
        }
      } else {
        window._kwDebug.steps.push('No "known" array found, checking all arrays...');
        var raw = rowsFromAssessmentDoc(d);
        window._kwDebug.steps.push('rowsFromAssessmentDoc found ' + raw.length + ' entries');
        for (var j = 0; j < raw.length; j++) {
          var pair2 = pairFromAssessmentEntry(raw[j], gameLang);
          if (pair2) out.push(pair2);
        }
      }
    });
    window._kwDebug.steps.push('Total pairs extracted: ' + out.length);
    window._kwDebug.allDocEmails = allDocEmails.slice(0, 10);
    if (out.length) window._kwDebug.steps.push('Sample: ' + JSON.stringify(out[0]));
    console.log('[WordWall] Debug:', window._kwDebug);
    return out;
  } catch (e) {
    window._kwDebug.steps.push('ERROR: ' + String(e));
    console.error('fbGetAssessmentKnownWordsForUser:', e);
    return [];
  }
};

window.fbSaveWordProgress = async function (userId, wordId, wordText, timesDone, completed) {
  try {
    var ref = userWallDataRef(userId, (auth.currentUser && auth.currentUser.email) || '');
    var data = {
      word: wordText,
      ID: typeof wordId === 'number' ? wordId : String(wordId),
      timesDone: timesDone,
      updatedAt: serverTimestamp(),
    };
    if (completed) {
      data.completed = true;
      data.completedAt = serverTimestamp();
    }
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
    var ref = userWallDataRef(userId, (auth.currentUser && auth.currentUser.email) || '');
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
