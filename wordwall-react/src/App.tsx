/* eslint-disable */
// @ts-nocheck
import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { signInWithCustomToken } from 'firebase/auth';
import './app.css';
import { auth } from './firebase';

var QF       = "Questrial, sans-serif";
var TMAX     = 5;
var TMAX_L23 = 8;
var VERIFIED_NEEDED = 3;   /* Correct answers needed to verify a word */
var L3_SPEECH_MAX_TRIES = 3; /* Level 3: 1 try + up to 2 retries before next word */
var WALL_BRICK_PX = 56;      /* Default in-exercise brick height (bigger wall) */
var WALL_STAGGER_PX = 50;
var WALL_LAYOUT_MIN = 400;   /* Min width for wall column in grids */

var LANGS = ["Español","English","Français","Deutsch","Português","Italiano","中文","日本語","한국어","Arabic"];
var NATS  = ["Mexicana","Americana","Colombiana","Argentina","Española","Venezolana","Peruana","Chilena","Ecuatoriana","Guatemalteca","Otra"];
var LVES  = ["Primaria","Secundaria","Preparatoria / Bachillerato","Universidad / Licenciatura","Maestría","Doctorado","Otro"];
var LVEN  = ["Elementary","Middle School","High School","University / Bachelor's","Master's","PhD","Other"];

/* ═══════════════════════════════════════════════════════════
   PHONETIC ENGINE  (unchanged from original)
   ═══════════════════════════════════════════════════════════ */
var PHONEME_SUBS={
  "en-US":[{from:/th/g,label:'TH→D (e.g. "the" as "de")',severity:"grave"},{from:/th/g,label:'TH→T (e.g. "think" as "tink")',severity:"grave"},{from:/v/g,label:'V→B (e.g. "very" as "bery")',severity:"moderado"},{from:/w/g,label:'W→V (e.g. "wine" as "vine")',severity:"moderado"},{from:/ng$/,label:'NG→N ending',severity:"leve"},{from:/r$/,label:"Dropped final R",severity:"leve"}],
  "es-MX":[{from:/rr/g,label:"RR débil",severity:"moderado"},{from:/s$/,label:"S final omitida",severity:"leve"},{from:/b/g,label:"Confusión B/V",severity:"leve"}]
};
function metaphone(str){str=str.toLowerCase().replace(/[^a-z]/g,"").replace(/^ae|^gn|^kn|^pn|^wr/,"").replace(/mb$/,"m");var r="";for(var i=0;i<str.length;i++){var c=str[i],p=str[i-1]||"",n=str[i+1]||"",n2=str[i+2]||"";if("aeiou".indexOf(c)!==-1){if(i===0)r+=c;continue;}switch(c){case"b":if(p!=="m")r+="b";break;case"c":if(n==="h"){r+="x";i++;break;}if("ei".indexOf(n)!==-1){r+="s";break;}r+="k";break;case"d":if(n==="g"&&"eiy".indexOf(n2)!==-1){r+="j";i++;break;}r+="t";break;case"f":r+="f";break;case"g":if(n==="h"&&"aeiou".indexOf(n2)===-1)break;if("ei".indexOf(n)!==-1){r+="j";break;}if(n==="g")i++;r+="k";break;case"h":if("aeiou".indexOf(n)!==-1&&"aeiou".indexOf(p)===-1)r+="h";break;case"j":r+="j";break;case"k":if(p!=="c")r+="k";break;case"l":r+="l";break;case"m":r+="m";break;case"n":r+="n";break;case"p":r+=(n==="h")?"f":"p";break;case"q":r+="k";break;case"r":r+="r";break;case"s":if(n==="h"||(n==="i"&&"ao".indexOf(n2)!==-1)){r+="x";break;}if(str.slice(i,i+3)==="sch"){r+="sk";i+=2;break;}r+="s";break;case"t":if(n==="h"){r+="0";i++;break;}if(str.slice(i,i+3)==="tia"||str.slice(i,i+3)==="tio"){r+="x";break;}r+="t";break;case"v":r+="f";break;case"w":if("aeiou".indexOf(n)!==-1)r+="w";break;case"x":r+="ks";break;case"y":if("aeiou".indexOf(n)!==-1)r+="j";break;case"z":r+="s";break;}}return r;}
function levenshtein(a,b){var m=a.length,n=b.length,i,j;var dp=[];for(i=0;i<=m;i++){dp[i]=[];for(j=0;j<=n;j++)dp[i][j]=i||j;}for(i=1;i<=m;i++)for(j=1;j<=n;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);return dp[m][n];}
function syllableCount(word){word=word.toLowerCase().replace(/[^a-z]/g,"");if(!word)return 0;var v=word.match(/[aeiouy]+/g)||[];var c=v.length;if(word.charAt(word.length-1)==="e"&&c>1)c--;return Math.max(1,c);}
function phNorm(text){return(text||"").toLowerCase().replace(/[àáâã]/g,"a").replace(/[èéêë]/g,"e").replace(/[ìíîï]/g,"i").replace(/[òóôõö]/g,"o").replace(/[ùúûü]/g,"u").replace(/ñ/g,"n").replace(/[^a-z\s]/g,"").trim();}
function phWords(text){return phNorm(text).split(/\s+/).filter(Boolean);}
function analyzePronunciation(target,spoken,lang){
  var tw=phWords(target),sw=phWords(spoken);
  var completeness=Math.min(100,Math.round((sw.length/Math.max(tw.length,1))*100));
  var wr=tw.map(function(t,i){var s=sw[i]||"";var cd=levenshtein(t,s);var cs=Math.max(0,100-Math.round((cd/Math.max(t.length,1))*100));var tk=metaphone(t),sk=s?metaphone(s):"";var pd=levenshtein(tk,sk);var ps=tk.length>0?Math.max(0,100-Math.round((pd/tk.length)*100)):cs;var ts=syllableCount(t),ss2=s?syllableCount(s):0;var ys=Math.max(0,100-Math.abs(ts-ss2)*30);var eb=(phNorm(t)===phNorm(s))?8:0;if(!s)return{word:t,heard:"(omitida)",score:0,charScore:0,phonScore:0,sylScore:0,error:"Omisión",severity:"grave",phonemes:[]};var ws=Math.min(100,Math.round(ps*0.55+cs*0.30+ys*0.15+eb));var et=ws>=88?"None":ws>=65?"Mal pronunciada":ws>=40?"Distorsionada":"Incorrecta";var sev=ws>=80?"leve":ws>=50?"moderado":"grave";var ph=[];for(var j=0;j<Math.min(t.length,8);j++){var tc=t[j]||"",sc3=s[j]||"";ph.push({symbol:tc,score:tc===sc3?100:30,heard:sc3});}return{word:t,heard:s,score:ws,charScore:cs,phonScore:ps,sylScore:ys,error:et,severity:sev,phonemes:ph};});
  var ins=sw.slice(tw.length);
  var acc=wr.length?Math.round(wr.reduce(function(x,w){return x+w.score;},0)/wr.length):0;
  var wc=tw.length,sc4=sw.length;var wr2=wc>0?Math.min(sc4/wc,wc/Math.max(sc4,1)):0;var fl=Math.round(Math.min(100,wr2*70+acc*0.30));
  var tk2=metaphone(phNorm(target)),sk2=metaphone(phNorm(spoken));var gd=levenshtein(tk2,sk2);var ph2=tk2.length>0?Math.max(0,Math.round(100-(gd/tk2.length)*100)):(phNorm(target)===phNorm(spoken)?100:0);
  var ov=Math.max(0,Math.min(100,Math.round(acc*0.50+fl*0.15+completeness*0.15+ph2*0.20)));
  var errs=[];wr.forEach(function(w){if(w.error==="Omisión"){errs.push({text:'La palabra "'+w.word+'" no fue pronunciada.',severity:"grave"});}else if(w.error!=="None"&&w.score<75){errs.push({text:'"'+w.word+'" → "'+w.heard+'" — '+(w.charScore<50?"Muy diferente":w.phonScore<60?"Discrepancia fonética":"Leve error")+'. '+w.score+'/100.',severity:w.severity});}});
  ins.forEach(function(iw){errs.push({text:'Palabra extra: "'+iw+'".',severity:"leve"});});
  var subs=PHONEME_SUBS[lang]||PHONEME_SUBS["en-US"]||[];var spN=phNorm(spoken),tgN=phNorm(target);
  subs.forEach(function(sub){if(!sub.from.test(tgN)&&sub.from.test(spN))errs.push({text:"Posible sustitución: "+sub.label,severity:sub.severity});});
  return{overall:ov,accuracy:acc,fluency:fl,completeness:Math.min(100,completeness),phonetic:ph2,wordResults:wr,errors:errs};
}
function scoreColor(s){if(s>=85)return"#16a34a";if(s>=70)return"#2563eb";if(s>=50)return"#d97706";if(s>=30)return"#ea580c";return"#dc2626";}
function scoreLabel(s,lang){if(s>=90)return lang==="ES"?"EXCELENTE":"EXCELLENT";if(s>=75)return lang==="ES"?"MUY BUENO":"VERY GOOD";if(s>=70)return lang==="ES"?"BUENO":"GOOD";if(s>=50)return lang==="ES"?"REGULAR":"FAIR";if(s>=30)return lang==="ES"?"DEFICIENTE":"POOR";return lang==="ES"?"INCORRECTO":"INCORRECT";}

/* ═══════════════════════════════════════════════════════════
   WORD PAIRS DATA  — 3 categories, words identified by ID only.
   Text is loaded from Firestore at runtime.
   enId = ID in /Word-bank-VB/EN/{id}
   esId = ID in /Word-bank-VB/ES/{id}
   ═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   WORD PAIRS DATA
   enWord / esWord  = text shown in game (always available)
   enId   / esId    = Firestore ID used when saving progress
   ═══════════════════════════════════════════════════════════ */
var WORD_PAIRS_DATA = [
  {
    id:"numbers", brickStart:0,
    nameES:"NÚMEROS DEL 1 AL 10", nameEN:"NUMBERS 1 TO 10",
    pairs:[
      {enWord:"One",        esWord:"Uno",         enId:346,  esId:13   },
      {enWord:"Two",        esWord:"Dos",         enId:72,   esId:80   },
      {enWord:"Three",      esWord:"Tres",        enId:138,  esId:166  },
      {enWord:"Four",       esWord:"Cuatro",      enId:229,  esId:309  },
      {enWord:"Five",       esWord:"Cinco",       enId:260,  esId:322  },
      {enWord:"Six",        esWord:"Seis",        enId:353,  esId:462  },
      {enWord:"Seven",      esWord:"Siete",       enId:435,  esId:727  },
      {enWord:"Eight",      esWord:"Ocho",        enId:449,  esId:782  },
      {enWord:"Nine",       esWord:"Nueve",       enId:588,  esId:1149 },
      {enWord:"Ten",        esWord:"Diez",        enId:357,  esId:541  }
    ]
  },
  {
    id:"colors", brickStart:10,
    nameES:"LOS COLORES", nameEN:"COLORS",
    pairs:[
      {enWord:"Blue",       esWord:"Azul",        enId:507,  esId:946  },
      {enWord:"Green",      esWord:"Verde",       enId:508,  esId:1078 },
      {enWord:"Gray",       esWord:"Gris",        enId:761,  esId:2528 },
      {enWord:"Orange",     esWord:"Naranja",     enId:873,  esId:2681 },
      {enWord:"Pink",       esWord:"Rosa",        enId:982,  esId:4056 },
      {enWord:"Purple",     esWord:"Morado",      enId:1006, esId:6917 },
      {enWord:"Black",      esWord:"Negro",       enId:275,  esId:397  },
      {enWord:"White",      esWord:"Blanco",      enId:312,  esId:380  },
      {enWord:"Red",        esWord:"Rojo",        enId:407,  esId:690  },
      {enWord:"Yellow",     esWord:"Amarillo",    enId:685,  esId:1863 }
    ]
  },
  {
    id:"food", brickStart:20,
    nameES:"COMIDAS Y BEBIDAS", nameEN:"FOOD & DRINKS",
    pairs:[
      {enWord:"Water",      esWord:"Agua",        enId:197,  esId:262  },
      {enWord:"Coffee",     esWord:"Café",        enId:572,  esId:603  },
      {enWord:"Egg",        esWord:"Huevo",       enId:779,  esId:1137 },
      {enWord:"Tea",        esWord:"Té",          enId:838,  esId:1252 },
      {enWord:"Milk",       esWord:"Leche",       enId:689,  esId:1261 },
      {enWord:"Ice Cream",  esWord:"Nieve",       enId:1134, esId:2054 },
      {enWord:"Hamburger",  esWord:"Hamburguesa", enId:1112, esId:3120 },
      {enWord:"Salad",      esWord:"Ensalada",    enId:1054, esId:3162 },
      {enWord:"Bacon",      esWord:"Tocino",      enId:3184, esId:5759 },
      {enWord:"Soda",       esWord:"Soda",        enId:2035, esId:5908 }
    ]
  }
];

var ROWS = [[8,9],[6,7],[4,5],[2,3],[0,1]];

/* Full wall rows — 30 bricks (3 cats × 10) displayed bottom-to-top */
var ROWS_FULL = [
  [28,29],[26,27],[24,25],[22,23],[20,21],   /* cat 3 food     */
  [18,19],[16,17],[14,15],[12,13],[10,11],   /* cat 2 colors   */
  [8,9],[6,7],[4,5],[2,3],[0,1]              /* cat 1 numbers  */
];

function shuffle(arr){var a=arr.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}

function isAllWordWallComplete(wordProgress, gameLang){
  for(var ci=0;ci<WORD_PAIRS_DATA.length;ci++){
    var cat=WORD_PAIRS_DATA[ci];
    for(var pi=0;pi<cat.pairs.length;pi++){
      var id=String(gameLang==="ES"?cat.pairs[pi].enId:cat.pairs[pi].esId);
      var p=(wordProgress[id]||{});
      if((p.timesDone||0)<VERIFIED_NEEDED)return false;
    }
  }
  return true;
}

function buildKnownWordsL1Queue(assessmentRows){
  var rows=assessmentRows||[];
  var unique=[];var seen={};
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    var pr=String(r.prompt!=null?r.prompt:"").trim();
    var tg=String(r.target!=null?r.target:"").trim();
    if(!pr||!tg)continue;
    var k=pr.toLowerCase().replace(/\s+/g,"")+"|"+tg.toLowerCase().replace(/\s+/g,"");
    if(seen[k])continue;
    seen[k]=1;
    unique.push({prompt:pr,target:tg});
  }
  var slice0=shuffle(unique.slice()).slice(0,Math.min(10,unique.length));
  if(!slice0.length)return[];
  var optPool=[];var ts={};
  slice0.forEach(function(r){if(!ts[r.target]){ts[r.target]=1;optPool.push(r.target);}});
  return slice0.map(function(r,i){
    return{promptWord:r.prompt,targetWord:r.target,targetId:"demo-"+i,options:shuffle(optPool.slice())};
  });
}

function getDemoBankBrickData(sessQueue,demoProg,sessionCorrectIds){
  var hits=sessionCorrectIds||[];
  var out=[];
  for(var idx=0;idx<10;idx++){
    if(idx>=sessQueue.length){out.push({timesDone:0,word:""});continue;}
    var cur=sessQueue[idx];
    var id=cur.targetId;
    var p2=demoProg[String(id)]||{timesDone:0};
    var wd=cur.targetWord;
    var done=p2.timesDone||0;
    if(hits.indexOf(id)!==-1)out.push({timesDone:Math.max(done,1),word:wd});
    else out.push({timesDone:0,word:""});
  }
  return out;
}

function getAssessmentDemoWords(gameLang){
  if(gameLang==="ES"){
    return[
      {prompt:"Biblioteca",target:"Library"},
      {prompt:"Ventana",target:"Window"},
      {prompt:"Reloj",target:"Clock"},
      {prompt:"Silla",target:"Chair"},
      {prompt:"Llave",target:"Key"},
      {prompt:"Mesa",target:"Table"},
      {prompt:"Puerta",target:"Door"},
      {prompt:"Libro",target:"Book"},
      {prompt:"Casa",target:"House"},
      {prompt:"Zapato",target:"Shoe"}
    ];
  }
  return[
    {prompt:"Library",target:"Biblioteca"},
    {prompt:"Window",target:"Ventana"},
    {prompt:"Clock",target:"Reloj"},
    {prompt:"Chair",target:"Silla"},
    {prompt:"Key",target:"Llave"},
    {prompt:"Table",target:"Mesa"},
    {prompt:"Door",target:"Puerta"},
    {prompt:"Book",target:"Libro"},
    {prompt:"House",target:"Casa"},
    {prompt:"Shoe",target:"Zapato"}
  ];
}

/* ─────────────────────────────────────────────────────────────
   buildSessionQueue
   Uses hardcoded word text from WORD_PAIRS_DATA.
   Filters out already-verified words (timesDone >= 3).
   Returns [] if all words are verified.
   ───────────────────────────────────────────────────────────── */
function buildSessionQueue(cat, wordProgress, gameLang){
  function getTarget(pair){ return gameLang==="ES" ? pair.enWord : pair.esWord; }
  function getPrompt(pair) { return gameLang==="ES" ? pair.esWord : pair.enWord; }
  function getId(pair)     { return gameLang==="ES" ? pair.enId  : pair.esId;   }

  /* All 10 target words — shown as buttons on every question */
  var allTargetWords = cat.pairs.map(function(pair){ return getTarget(pair); });

  /* Always include ALL 10 words — siempre 10 preguntas por sesión */
  /* catComplete screen handles the "all verified" case separately  */
  return shuffle(cat.pairs.slice()).map(function(pair){
    return {
      promptWord : getPrompt(pair),
      targetWord : getTarget(pair),
      targetId   : getId(pair),
      timesDone  : (wordProgress[String(getId(pair))]||{}).timesDone || 0,
      options    : shuffle(allTargetWords.slice())   /* all 10 words as buttons */
    };
  });
}

/* ═══════════════════════════════════════════════════════════
   G — UI strings
   ═══════════════════════════════════════════════════════════ */
var G={
  ES:{
    title:"WORD WALL PROGRESS",
    sub:"Cada palabra necesita 3 respuestas correctas para verificarse.",
    start:"COMENZAR",pauseTxt:"PAUSA",resumeTxt:"CONTINUAR",
    qLbl:"PALABRA",ofLbl:"DE",pts:"PTS",timeLbl:"TIEMPO",
    okTxt:"¡CORRECTO!",wrongTxt:"INCORRECTO · ERA:",toTxt:"¡TIEMPO! · ERA:",
    endTitle:"RESULTADO NIVEL 1",corrTxt:"CORRECTAS",errTxt:"ERRORES",fastTxt:"MÁS RÁPIDA",
    goL2:"CONTINUAR AL NIVEL 2 →",againTxt:"REPETIR CATEGORÍA",
    pauseMsg:"JUEGO EN PAUSA",pauseSub:"Presiona continuar para seguir",progTxt:"PROGRESO",
    l2badge:"NIVEL 2",l2title:"ESCRIBE LA RESPUESTA",
    l2ph:"Escribe aquí...",l2check:"VERIFICAR",l2ok:"¡CORRECTO!",l2wrong:"Incorrecto, era:",
    l2endTitle:"NIVEL 2 COMPLETADO",l2scoreLbl:"RESPUESTAS CORRECTAS",
    l2goL3:"CONTINUAR AL NIVEL 3 →",
    l2detailTitle:"DETALLE",l2typed:"Escribiste:",l2expected:"Correcto:",
    l3badge:"NIVEL 3",l3title:"PRONUNCIACIÓN",
    l3tap:"🎤 TOCA PARA GRABAR",l3listening:"🔴 ESCUCHANDO…",l3tapStop:"Toca de nuevo para detener y calificar",
    l3manualHint:"Tú inicias la grabación; no empieza sola.",
    l3relisten:"🎤 GRABAR DE NUEVO",l3relistenHint:"Cuando termines, toca otra vez el botón para enviar.",
    l3continueNext:"SIGUIENTE PALABRA →",
    l3RetryHint:function(n){return"Intenta de nuevo · te quedan "+n+" intento"+(n===1?"":"s");},
    l3heard:"Escuché:",l3nothing:"No te escuché. Toca para intentar de nuevo.",
    l3noSupport:"Tu navegador no soporta reconocimiento de voz. Usa Google Chrome.",
    l3skip:"Saltar →",l3endTitle:"RESULTADO DE PRONUNCIACIÓN",
    l3endSub:"Análisis fonético por respuesta",
    l3scoreLbl:"PRONUNCIACIÓN CORRECTA",l3expectedLbl:"Esperado:",l3saidLbl:"Dijiste:",
    l3accuracyLbl:"Precisión",l3phoneticLbl:"Fonética",l3fluencyLbl:"Fluidez",
    l3errorsLbl:"ERRORES",l3noErrors:"✅ Sin errores fonéticos significativos.",
    l3avgLabel:"Puntuación fonética promedio",
    backStart:"← VOLVER AL INICIO",exerciseBack:"← INICIO",nextCatTxt:"SIGUIENTE CATEGORÍA →",
    /* NEW */
    loadingTxt:"Cargando palabras...",loadErrTxt:"Error al cargar las palabras. Intenta de nuevo.",
    loadRetry:"REINTENTAR",
    catDoneTitle:"¡CATEGORÍA COMPLETADA!",catDoneSub:"¡Dominaste todas las palabras!",
    catDoneNext:"SIGUIENTE CATEGORÍA →",catDoneBack:"← VOLVER AL INICIO",
    verifiedLbl:"VERIFICADAS",
    sayLbl:"DI LA PALABRA",howSay:"¿Cómo se dice",howSayIn:"en inglés?",
    progressLbl:"PROGRESO DE LA PALABRA",
    mHigh:{e:"🏆",t:"¡EXCELENTE!",b:"¡Vas por muy buen camino!"},
    mLow:{e:"💪",t:"¡NO TE RINDAS!",b:"Cada intento te hace más fuerte."},
    rules:[["⏱","5 seg"],["⭐","Pts = seg"],["🧱","3 correctas"]],
    info:[["🧱","Cada palabra necesita 3 respuestas correctas para verificarse"],
          ["⏱","Tienes 5 segundos para responder en el nivel 1"],
          ["⭐","Los puntos dependen de tu velocidad de respuesta"],
          ["🔁","Las palabras se repiten hasta que las domines"]],
    assessBadge:"EVALUACIÓN",assessTitle:"PALABRAS CONOCIDAS",assessSub:"Del módulo de vocabulario (tu correo)",
    assessIntro:"Has completado todo el muro. Practica las palabras que el sistema ya registró para ti.",
    assessCTA:"▶ PRACTICAR PALABRAS CONOCIDAS",assessLoad:"Cargando tu lista…",assessEmpty:"No hay palabras registradas para tu correo en Evaluación.",
    assessErr:"No se pudo cargar la lista. Intenta de nuevo.",assessRetry:"REINTENTAR",assessHint:"Escribe la traducción correcta.",
    assessEndTitle:"PRÁCTICA COMPLETADA",assessBack:"← VOLVER AL INICIO",
    assessDemoFab:"Vista previa",assessDemoBanner:"Demo — sin guardar datos",
    assessDemoLiveBanner:"Demo — palabras de tu vocabulario · sin guardar",
    demoMcBadge:"DEMO",demoMcHead:"MURO + OPCIÓN MÚLTIPLE",demoMcWallLbl:"MURO",
    demoMcEndTitle:"Ronda demo — opción múltiple",demoMcEndSub:"Nada se guarda en tu cuenta.",
    demoMcNextTyping:"SIGUIENTE: ESCRIBIR TRADUCCIÓN →",
    wallCrumbleHint:"El muro se derrumba… siguiente bloque de 10 palabras.",
    demoSkipSection:"SALTAR SECCIÓN"
  },
  EN:{
    title:"WORD WALL PROGRESS",
    sub:"Each word needs 3 correct answers to be verified.",
    start:"START",pauseTxt:"PAUSE",resumeTxt:"RESUME",
    qLbl:"WORD",ofLbl:"OF",pts:"PTS",timeLbl:"TIME",
    okTxt:"CORRECT!",wrongTxt:"WRONG · IT WAS:",toTxt:"TIME'S UP · IT WAS:",
    endTitle:"LEVEL 1 RESULTS",corrTxt:"CORRECT",errTxt:"ERRORS",fastTxt:"FASTEST",
    goL2:"CONTINUE TO LEVEL 2 →",againTxt:"REPEAT CATEGORY",
    pauseMsg:"GAME PAUSED",pauseSub:"Press resume to continue",progTxt:"PROGRESS",
    l2badge:"LEVEL 2",l2title:"WRITE THE ANSWER",
    l2ph:"Type here...",l2check:"CHECK",l2ok:"CORRECT!",l2wrong:"Wrong, it was:",
    l2endTitle:"LEVEL 2 COMPLETE",l2scoreLbl:"CORRECT ANSWERS",
    l2goL3:"CONTINUE TO LEVEL 3 →",
    l2detailTitle:"DETAIL",l2typed:"You wrote:",l2expected:"Correct:",
    l3badge:"LEVEL 3",l3title:"PRONUNCIATION",
    l3tap:"🎤 TAP TO RECORD",l3listening:"🔴 LISTENING…",l3tapStop:"Tap again to stop and grade",
    l3manualHint:"You start recording — nothing runs automatically.",
    l3relisten:"🎤 RECORD AGAIN",l3relistenHint:"When you’re done speaking, tap the button again to submit.",
    l3continueNext:"NEXT WORD →",
    l3RetryHint:function(n){return"Try again · "+n+" attempt"+(n===1?"":"s")+" left";},
    l3heard:"I heard:",l3nothing:"I didn't hear you. Tap to try again.",
    l3noSupport:"Your browser doesn't support voice recognition. Use Google Chrome.",
    l3skip:"Skip →",l3endTitle:"PRONUNCIATION RESULTS",
    l3endSub:"Detailed phonetic analysis",
    l3scoreLbl:"CORRECT PRONUNCIATION",l3expectedLbl:"Expected:",l3saidLbl:"You said:",
    l3accuracyLbl:"Accuracy",l3phoneticLbl:"Phonetic",l3fluencyLbl:"Fluency",
    l3errorsLbl:"ERRORS",l3noErrors:"✅ No significant phonetic errors.",
    l3avgLabel:"Avg. phonetic score",
    backStart:"← BACK TO START",exerciseBack:"← HOME",nextCatTxt:"NEXT CATEGORY →",
    /* NEW */
    loadingTxt:"Loading words...",loadErrTxt:"Error loading words. Please try again.",
    loadRetry:"RETRY",
    catDoneTitle:"CATEGORY COMPLETE!",catDoneSub:"You've mastered all the words!",
    catDoneNext:"NEXT CATEGORY →",catDoneBack:"← BACK TO START",
    verifiedLbl:"VERIFIED",
    sayLbl:"SAY THE WORD",howSay:"How do you say",howSayIn:"in Spanish?",
    progressLbl:"WORD PROGRESS",
    mHigh:{e:"🏆",t:"EXCELLENT!",b:"You're on the right track!"},
    mLow:{e:"💪",t:"DON'T GIVE UP!",b:"Every attempt makes you stronger."},
    rules:[["⏱","5 sec"],["⭐","Pts = sec"],["🧱","3 correct"]],
    info:[["🧱","Each word needs 3 correct answers to be verified"],
          ["⏱","You have 5 seconds in level 1"],
          ["⭐","Points depend on how fast you answer"],
          ["🔁","Words repeat until you've mastered them"]],
    assessBadge:"ASSESSMENT",assessTitle:"KNOWN WORDS",assessSub:"From vocabulary assessment (your email)",
    assessIntro:"You've completed the full wall. Practice words the system already registered for you.",
    assessCTA:"▶ PRACTICE KNOWN WORDS",assessLoad:"Loading your list…",assessEmpty:"No words found for your email in Assessment.",
    assessErr:"Could not load the list. Please try again.",assessRetry:"RETRY",assessHint:"Type the correct translation.",
    assessEndTitle:"PRACTICE COMPLETE",assessBack:"← BACK TO START",
    assessDemoFab:"Preview",assessDemoBanner:"Demo — nothing is saved",
    assessDemoLiveBanner:"Demo — words from your vocabulary · nothing saved",
    demoMcBadge:"DEMO",demoMcHead:"WALL + MULTIPLE CHOICE",demoMcWallLbl:"WALL",
    demoMcEndTitle:"Demo round — multiple choice",demoMcEndSub:"Nothing is saved to your account.",
    demoMcNextTyping:"NEXT: TYPE THE TRANSLATION →",
    wallCrumbleHint:"The wall crumbles… next set of 10 words.",
    demoSkipSection:"SKIP SECTION"
  }
};

/* TX — auth strings (unchanged) */
var TX={
  ES:{loginTitle:"INICIAR SESIÓN",sub:"Word Wall Progress",emailLbl:"Correo electrónico",emailPh:"correo@ejemplo.com",pwdLbl:"Contraseña",pwdPh:"••••••••",enter:"▶ ENTRAR",entering:"Entrando...",forgot:"¿Olvidaste tu contraseña?",noAcc:"¿No tienes cuenta?",createAcc:"Crear cuenta nueva",eFields:"Por favor completa todos los campos.",eCreds:"Correo o contraseña incorrectos.",eLogin:"Error al iniciar sesión. Intenta de nuevo.",resetTitle:"RECUPERAR CONTRASEÑA",resetDesc:"Te enviaremos un enlace a tu correo para que puedas crear una nueva contraseña.",resetBtn:"ENVIAR ENLACE",resetSending:"Enviando...",resetOk:"✓ Correo enviado. Revisa tu bandeja de entrada.",eResetEmail:"Ingresa tu correo electrónico.",eResetNF:"No encontramos una cuenta con ese correo.",eResetGen:"Error al enviar. Intenta de nuevo.",backLogin:"← Volver al inicio de sesión",regTitle:"CREAR CUENTA",step1:"Datos de acceso",step2:"Perfil de aprendizaje",fullName:"Nombre Completo",fullNamePh:"Juan Pérez",confPwd:"Confirmar contraseña",confPwdPh:"Repite tu contraseña",pwdMin:"Mínimo 6 caracteres",nextBtn:"SIGUIENTE →",backBtn:"←",nativeLbl:"Idioma que hablas",targetLbl:"Idioma a aprender",natLbl:"Nacionalidad",birthLbl:"Fecha de nacimiento",phoneLbl:"Teléfono",phonePh:"+52 55 1234 5678",studyLbl:"Nivel de estudios",careerLbl:"Carrera / Profesión",careerPh:"Ej: Ingeniería, Medicina...",optTxt:"OPCIONAL",selTxt:"Seleccionar",creating:"Registrando...",createBtn:"✓ CREAR CUENTA",hasAcc:"¿Ya tienes cuenta?",goLogin:"Iniciar sesión",eName:"El nombre completo es requerido.",eEmail:"El correo es requerido.",ePwdLen:"La contraseña debe tener al menos 6 caracteres.",ePwdMatch:"Las contraseñas no coinciden.",eNative:"Selecciona el idioma que hablas.",eTarget:"Selecciona el idioma que quieres aprender.",eNat:"Selecciona tu nacionalidad.",eBirth:"La fecha de nacimiento es requerida.",ePhone:"El teléfono es requerido.",eExists:"Este correo ya está registrado.",eReg:"Error al registrar. Intenta de nuevo."},
  EN:{loginTitle:"SIGN IN",sub:"Word Wall Progress",emailLbl:"Email address",emailPh:"email@example.com",pwdLbl:"Password",pwdPh:"••••••••",enter:"▶ SIGN IN",entering:"Signing in...",forgot:"Forgot your password?",noAcc:"Don't have an account?",createAcc:"Create new account",eFields:"Please fill in all fields.",eCreds:"Incorrect email or password.",eLogin:"Sign in error. Please try again.",resetTitle:"RECOVER PASSWORD",resetDesc:"We'll send a link to your email so you can create a new password.",resetBtn:"SEND LINK",resetSending:"Sending...",resetOk:"✓ Email sent. Check your inbox.",eResetEmail:"Please enter your email address.",eResetNF:"No account found with that email.",eResetGen:"Error sending email. Please try again.",backLogin:"← Back to sign in",regTitle:"CREATE ACCOUNT",step1:"Access data",step2:"Learning profile",fullName:"Full Name",fullNamePh:"John Smith",confPwd:"Confirm password",confPwdPh:"Repeat your password",pwdMin:"At least 6 characters",nextBtn:"NEXT →",backBtn:"←",nativeLbl:"Language you speak",targetLbl:"Language to learn",natLbl:"Nationality",birthLbl:"Date of birth",phoneLbl:"Phone",phonePh:"+1 555 123 4567",studyLbl:"Education level",careerLbl:"Career / Profession",careerPh:"E.g. Engineering, Medicine...",optTxt:"OPTIONAL",selTxt:"Select",creating:"Registering...",createBtn:"✓ CREATE ACCOUNT",hasAcc:"Already have an account?",goLogin:"Sign in",eName:"Full name is required.",eEmail:"Email is required.",ePwdLen:"Password must be at least 6 characters.",ePwdMatch:"Passwords do not match.",eNative:"Select the language you speak.",eTarget:"Select the language you want to learn.",eNat:"Select your nationality.",eBirth:"Date of birth is required.",ePhone:"Phone number is required.",eExists:"This email is already registered.",eReg:"Registration error. Please try again."}
};

/* ═══════════════════════════════════════════════════════════
   UI HELPERS (unchanged)
   ═══════════════════════════════════════════════════════════ */
function Logo(p){return React.createElement("img",{src:"LOGO.png",alt:"MIA",width:p.size||160,height:p.size||160,style:{objectFit:"contain",display:"block"}});}
function EyeIcon(p){if(p.open)return(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>);return(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>);}
function LangBtn(p){return(<button onClick={p.onToggle} style={{position:"absolute",top:"16px",right:"16px",width:"38px",height:"38px",borderRadius:"50%",background:"#fff",border:"2px solid #000",fontFamily:QF,fontSize:"11px",fontWeight:"700",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,.1)",zIndex:10}}>{p.lang==="ES"?"EN":"ES"}</button>);}
function RoundBtn(p){var s=Object.assign({fontFamily:QF,fontWeight:"700",letterSpacing:".08em",borderRadius:"50px",cursor:"pointer",border:"2px solid #000",background:p.filled?"#000":"#fff",color:p.filled?"#fff":"#000",transition:"all .15s"},p.style||{});return(<button onClick={p.onClick} disabled={p.disabled} style={s}>{p.children}</button>);}
function LogoutBtn(p){return(<button onClick={p.onClick} style={{display:"flex",alignItems:"center",gap:"6px",padding:"7px 14px",borderRadius:"50px",background:"#fff",border:"2px solid #e0e0e0",cursor:"pointer",fontFamily:QF,fontSize:"11px",fontWeight:"700",color:"#aaa",letterSpacing:".06em",transition:"all .15s"}} onMouseEnter={function(e){e.currentTarget.style.borderColor="#000";e.currentTarget.style.color="#000";}} onMouseLeave={function(e){e.currentTarget.style.borderColor="#e0e0e0";e.currentTarget.style.color="#aaa;"}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>{p.label}</button>);}
function DashBackBtn(p){
  var st=p.style||{};
  return(<button type="button" onClick={p.onClick} style={Object.assign({display:"flex",alignItems:"center",gap:"6px",padding:"7px 14px",borderRadius:"50px",background:"#fff",border:"2px solid #000",cursor:"pointer",fontFamily:QF,fontSize:"11px",fontWeight:"700",color:"#000",letterSpacing:".06em",transition:"all .15s"},st)} onMouseEnter={function(e){e.currentTarget.style.background="#f5f5f5";}} onMouseLeave={function(e){e.currentTarget.style.background="#fff";}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>{p.label}</button>);
}
function normStr(s){return(s||"").toLowerCase().trim().replace(/[àáâã]/g,"a").replace(/[èéêë]/g,"e").replace(/[ìíîï]/g,"i").replace(/[òóôõö]/g,"o").replace(/[ùúûü]/g,"u").replace(/ñ/g,"n").replace(/[^a-z ]/g,"");}
function normCheck(s){return normStr(s).replace(/ /g,"");}
function pronDiff(expected,heard){var e=normStr(expected),h=normStr(heard||"");var m=e.length,n=h.length,i,j;var dp=[];for(i=0;i<=m;i++){dp[i]=[];for(j=0;j<=n;j++)dp[i][j]=0;}for(i=1;i<=m;i++)for(j=1;j<=n;j++)dp[i][j]=e[i-1]===h[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);var matched=[];for(i=0;i<m;i++)matched.push(false);i=m;j=n;while(i>0&&j>0){if(e[i-1]===h[j-1]){matched[i-1]=true;i--;j--;}else if(dp[i-1][j]>=dp[i][j-1])i--;else j--;}var result=[],ei=0;for(var k=0;k<expected.length;k++){var ch=expected[k];if(/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(ch)){result.push({c:ch,ok:ei<matched.length&&matched[ei]});ei++;}else result.push({c:ch,ok:true});}return result;}
var NUM_WORDS_EN={"0":"zero","1":"one","2":"two","3":"three","4":"four","5":"five","6":"six","7":"seven","8":"eight","9":"nine","10":"ten","11":"eleven","12":"twelve","13":"thirteen","14":"fourteen","15":"fifteen","16":"sixteen","17":"seventeen","18":"eighteen","19":"nineteen","20":"twenty"};
var NUM_WORDS_ES={"0":"cero","1":"uno","2":"dos","3":"tres","4":"cuatro","5":"cinco","6":"seis","7":"siete","8":"ocho","9":"nueve","10":"diez","11":"once","12":"doce","13":"trece","14":"catorce","15":"quince","16":"dieciseis","17":"diecisiete","18":"dieciocho","19":"diecinueve","20":"veinte"};
function normalizeDigitTranscript(spoken,sLang){
  if(!spoken)return "";
  var map=sLang==="es-MX"?NUM_WORDS_ES:NUM_WORDS_EN;
  return spoken.replace(/\b\d+\b/g,function(m){return map[m]||m;});
}
function ScoreRing(p){var color=scoreColor(p.value);var r=44,circ=2*Math.PI*r;var dash=(p.value/100)*circ;return(<div className="ph-ring-wrap"><svg width="110" height="110" viewBox="0 0 110 110"><circle cx="55" cy="55" r={r} fill="none" stroke="#f0f0f0" strokeWidth="9"/><circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={dash+" "+(circ-dash)} style={{transition:"stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)"}}/></svg><div className="ph-ring-inner"><span className="ph-ring-val" style={{color:color}}>{p.value}</span><span className="ph-ring-sub">/100</span></div></div>);}

/* ── Dots showing timesDone progress (0→1→2→3) ── */
function ProgressDots(p){
  var n = p.times || 0;
  var colors = ["#e0e0e0","#f5a067","#e8633a","#16a34a"];
  return(<div className="dot-trail">{[0,1,2].map(function(i){return(<div key={i} className="dot" style={{background: i<n ? colors[Math.min(n,3)] : "#e0e0e0"}}></div>);})}</div>);
}

/* ═══════════════════════════════════════════════════════════
   SPLASH
   ═══════════════════════════════════════════════════════════ */
function Splash(p){useEffect(function(){var t=setTimeout(function(){p.onDone();},1700);return function(){clearTimeout(t);};},[]);return(<div className="splash"><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"10px"}}><div style={{fontFamily:QF,fontWeight:"900",fontSize:"64px",letterSpacing:".08em",lineHeight:"1",textTransform:"uppercase"}}>Wordwall</div><div style={{fontFamily:QF,fontWeight:"700",fontSize:"20px",letterSpacing:".18em",color:"#666",textTransform:"uppercase"}}>by Monexus</div></div></div>);}

/* ═══════════════════════════════════════════════════════════
   LOGIN  (unchanged)
   ═══════════════════════════════════════════════════════════ */
function Login(p){
  var tx=TX[p.lang];
  var _v=useState("login");var view=_v[0];var setView=_v[1];
  var _e=useState("");var email=_e[0];var setEmail=_e[1];
  var _pw=useState("");var pwd=_pw[0];var setPwd=_pw[1];
  var _sp=useState(false);var showP=_sp[0];var setShowP=_sp[1];
  var _b=useState(false);var busy=_b[0];var setBusy=_b[1];
  var _er=useState("");var err=_er[0];var setErr=_er[1];
  var _re=useState("");var rEmail=_re[0];var setREmail=_re[1];
  var _rb=useState(false);var rBusy=_rb[0];var setRBusy=_rb[1];
  var _rer=useState("");var rErr=_rer[0];var setRErr=_rer[1];
  var _rok=useState(false);var rOk=_rok[0];var setROk=_rok[1];
  function doLogin(){if(!email||!pwd){setErr(tx.eFields);return;}setBusy(true);setErr("");window.fbLogin(email,pwd).then(function(u){p.onLogin(u);setBusy(false);}).catch(function(e){setErr(e.code==="auth/invalid-credential"||e.code==="auth/wrong-password"?tx.eCreds:tx.eLogin);setBusy(false);});}
  function doReset(){if(!rEmail.trim()){setRErr(tx.eResetEmail);return;}setRBusy(true);setRErr("");window.fbResetPwd(rEmail.trim()).then(function(){setROk(true);setRBusy(false);}).catch(function(e){setRErr(e.code==="auth/user-not-found"?tx.eResetNF:tx.eResetGen);setRBusy(false);});}
  if(view==="reset")return(<div className="ascreen"><div className="acard"><LangBtn lang={p.lang} onToggle={p.onLang}/><div style={{textAlign:"center",marginBottom:"24px"}}><div style={{display:"flex",justifyContent:"center"}}><Logo size={80}/></div><div style={{fontFamily:QF,fontWeight:"900",fontSize:"18px",letterSpacing:".12em",textTransform:"uppercase",marginTop:"14px"}}>{tx.resetTitle}</div><div style={{fontFamily:QF,fontSize:"12px",color:"#888",lineHeight:"1.6",marginTop:"8px"}}>{tx.resetDesc}</div></div>{rErr?<div className="aerr">{rErr}</div>:null}{rOk?<div className="aok">{tx.resetOk}</div>:null}{!rOk?(<div><div className="ainw"><label className="albl">{tx.emailLbl}</label><input className="ainp" type="email" placeholder={tx.emailPh} value={rEmail} onChange={function(e){setREmail(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")doReset();}}/></div><button className="abig" onClick={doReset} disabled={rBusy}>{rBusy?tx.resetSending:tx.resetBtn}</button></div>):null}<div style={{textAlign:"center",marginTop:"16px"}}><button className="alink" onClick={function(){setView("login");setRErr("");setROk(false);}}>{tx.backLogin}</button></div></div></div>);
  return(<div className="ascreen"><div className="acard"><LangBtn lang={p.lang} onToggle={p.onLang}/><div style={{textAlign:"center",marginBottom:"24px"}}><div style={{display:"flex",justifyContent:"center"}}><Logo size={90}/></div><div style={{fontFamily:QF,fontWeight:"900",fontSize:"20px",letterSpacing:".12em",textTransform:"uppercase",marginTop:"14px"}}>{tx.loginTitle}</div><div style={{fontFamily:QF,fontSize:"12px",color:"#aaa",marginTop:"4px"}}>{tx.sub}</div></div>{err?<div className="aerr">{err}</div>:null}<div className="ainw"><label className="albl">{tx.emailLbl}</label><input className="ainp" type="email" placeholder={tx.emailPh} value={email} onChange={function(e){setEmail(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")doLogin();}}/></div><div className="ainw"><label className="albl">{tx.pwdLbl}</label><input className="ainp eye" type={showP?"text":"password"} placeholder={tx.pwdPh} value={pwd} onChange={function(e){setPwd(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")doLogin();}}/><button className="eyebtn" onClick={function(){setShowP(function(v){return !v;});}}><EyeIcon open={showP}/></button></div><div style={{textAlign:"right",marginTop:"-4px",marginBottom:"10px"}}><button className="alink" style={{fontSize:"12px",color:"#aaa"}} onClick={function(){setView("reset");setREmail(email);setRErr("");setROk(false);}}>{tx.forgot}</button></div><button className="abig" onClick={doLogin} disabled={busy}>{busy?tx.entering:tx.enter}</button></div></div>);
}

/* ═══════════════════════════════════════════════════════════
   REGISTER  (unchanged)
   ═══════════════════════════════════════════════════════════ */
function Register(p){
  var tx=TX[p.lang];var LVLS=p.lang==="EN"?LVEN:LVES;
  var _st=useState(1);var step=_st[0];var setStep=_st[1];
  var _f=useState({fullName:"",email:"",password:"",confPwd:"",nativeLang:"",targetLang:"",nat:"",birth:"",phone:"",study:"",career:""});
  var form=_f[0];var setForm=_f[1];
  var _sp=useState(false);var showP=_sp[0];var setShowP=_sp[1];
  var _sc=useState(false);var showC=_sc[0];var setShowC=_sc[1];
  var _b=useState(false);var busy=_b[0];var setBusy=_b[1];
  var _er=useState("");var err=_er[0];var setErr=_er[1];
  function upd(k,v){setForm(function(f){var n={};for(var x in f)n[x]=f[x];n[k]=v;return n;});}
  function goNext(){if(!form.fullName.trim()){setErr(tx.eName);return;}if(!form.email.trim()){setErr(tx.eEmail);return;}if(form.password.length<6){setErr(tx.ePwdLen);return;}if(form.password!==form.confPwd){setErr(tx.ePwdMatch);return;}setErr("");setStep(2);}
  function doSubmit(){if(!form.nativeLang){setErr(tx.eNative);return;}if(!form.targetLang){setErr(tx.eTarget);return;}if(!form.nat){setErr(tx.eNat);return;}if(!form.birth){setErr(tx.eBirth);return;}if(!form.phone.trim()){setErr(tx.ePhone);return;}setBusy(true);setErr("");window.fbRegister(form.email,form.password,{fullName:form.fullName,nativeLang:form.nativeLang,targetLang:form.targetLang,nationality:form.nat,birthdate:form.birth,phone:form.phone,studyLevel:form.study,career:form.career}).then(function(u){p.onDone(u,{nativeLang:form.nativeLang,targetLang:form.targetLang});setBusy(false);}).catch(function(e){setErr(e.code==="auth/email-already-in-use"?tx.eExists:tx.eReg);setBusy(false);});}
  return(<div className="ascreen"><div className="acard"><LangBtn lang={p.lang} onToggle={p.onLang}/><div style={{textAlign:"center",marginBottom:"20px"}}><div style={{display:"flex",justifyContent:"center"}}><Logo size={70}/></div><div style={{fontFamily:QF,fontWeight:"900",fontSize:"18px",letterSpacing:".12em",textTransform:"uppercase",marginTop:"12px"}}>{tx.regTitle}</div><div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",marginTop:"10px"}}><div style={{width:"28px",height:"28px",borderRadius:"50%",background:step>=1?"#000":"#eee",color:step>=1?"#fff":"#aaa",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:QF,fontSize:"12px",fontWeight:"700"}}>1</div><div style={{width:"32px",height:"2px",background:step>1?"#000":"#eee"}}></div><div style={{width:"28px",height:"28px",borderRadius:"50%",background:step>=2?"#000":"#eee",color:step>=2?"#fff":"#aaa",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:QF,fontSize:"12px",fontWeight:"700"}}>2</div></div><div style={{fontFamily:QF,fontSize:"11px",color:"#aaa",marginTop:"6px"}}>{step===1?tx.step1:tx.step2}</div></div>{err?<div className="aerr">{err}</div>:null}{step===1?(<div><div className="ainw"><label className="albl">{tx.fullName}</label><input className="ainp" type="text" placeholder={tx.fullNamePh} value={form.fullName} onChange={function(e){upd("fullName",e.target.value);}}/></div><div className="ainw"><label className="albl">{tx.emailLbl}</label><input className="ainp" type="email" placeholder={tx.emailPh} value={form.email} onChange={function(e){upd("email",e.target.value);}}/></div><div className="ainw"><label className="albl">{tx.pwdLbl}</label><input className="ainp eye" type={showP?"text":"password"} placeholder={tx.pwdMin} value={form.password} onChange={function(e){upd("password",e.target.value);}}/><button className="eyebtn" onClick={function(){setShowP(function(v){return !v;});}}><EyeIcon open={showP}/></button></div><div className="ainw"><label className="albl">{tx.confPwd}</label><input className="ainp eye" type={showC?"text":"password"} placeholder={tx.confPwdPh} value={form.confPwd} onChange={function(e){upd("confPwd",e.target.value);}}/><button className="eyebtn" onClick={function(){setShowC(function(v){return !v;});}}><EyeIcon open={showC}/></button></div><button className="abig" onClick={goNext}>{tx.nextBtn}</button></div>):(<div><div className="two"><div className="ainw"><label className="albl">{tx.nativeLbl}</label><select className="asel" value={form.nativeLang} onChange={function(e){upd("nativeLang",e.target.value);}}><option value="">{tx.selTxt}</option>{LANGS.map(function(l){return(<option key={l} value={l}>{l}</option>);})}</select></div><div className="ainw"><label className="albl">{tx.targetLbl}</label><select className="asel" value={form.targetLang} onChange={function(e){upd("targetLang",e.target.value);}}><option value="">{tx.selTxt}</option>{LANGS.map(function(l){return(<option key={l} value={l}>{l}</option>);})}</select></div></div><div className="two"><div className="ainw"><label className="albl">{tx.natLbl}</label><select className="asel" value={form.nat} onChange={function(e){upd("nat",e.target.value);}}><option value="">{tx.selTxt}</option>{NATS.map(function(n){return(<option key={n} value={n}>{n}</option>);})}</select></div><div className="ainw"><label className="albl">{tx.birthLbl}</label><input className="ainp" type="date" value={form.birth} onChange={function(e){upd("birth",e.target.value);}} style={{borderRadius:"50px"}}/></div></div><div className="ainw"><label className="albl">{tx.phoneLbl}</label><input className="ainp" type="tel" placeholder={tx.phonePh} value={form.phone} onChange={function(e){upd("phone",e.target.value);}}/></div><div className="ainw"><label className="albl">{tx.studyLbl}<span className="opt">{" "+tx.optTxt}</span></label><select className="asel" value={form.study} onChange={function(e){upd("study",e.target.value);}}><option value="">{tx.selTxt}</option>{LVLS.map(function(l){return(<option key={l} value={l}>{l}</option>);})}</select></div><div className="ainw"><label className="albl">{tx.careerLbl}<span className="opt">{" "+tx.optTxt}</span></label><input className="ainp" type="text" placeholder={tx.careerPh} value={form.career} onChange={function(e){upd("career",e.target.value);}}/></div><div style={{display:"flex",gap:"10px"}}><button className="abig" style={{background:"#fff",color:"#000",flex:"0 0 48px",padding:"14px 0"}} onClick={function(){setStep(1);setErr("");}}>{tx.backBtn}</button><button className="abig" style={{flex:1}} onClick={doSubmit} disabled={busy}>{busy?tx.creating:tx.createBtn}</button></div></div>)}<div className="adiv">{tx.hasAcc}</div><div style={{textAlign:"center"}}><button className="alink" onClick={p.onLogin}>{tx.goLogin}</button></div></div></div>);
}

/* ═══════════════════════════════════════════════════════════
   WALL  — 10 bricks, state derived from brickData
   brickData: array of 10 { timesDone, word }
   curQ: active brick index (0-9), -1 = none
   ═══════════════════════════════════════════════════════════ */
function Wall(p){
  var brickData = p.brickData || [];
  var bh=typeof p.brickH==="number"?p.brickH:WALL_BRICK_PX;
  var sw=typeof p.staggerW==="number"?p.staggerW:WALL_STAGGER_PX;
  var rg=typeof p.rowGap==="number"?p.rowGap:7;
  var cg=typeof p.colGap==="number"?p.colGap:6;
  var fs=bh>=54?12:bh>=48?11:9;
  var maxChars=bh>=54?9:bh>=48?8:7;
  return(
    <div style={{width:"100%",background:"#fff",border:"2px solid #e8e8e8",borderRadius:"14px",padding:"10px 10px 6px",boxShadow:"0 2px 12px rgba(0,0,0,.08)"}}>
      {ROWS.map(function(row,ri){
        var off=ri%2===1;
        return(
          <div key={ri} style={{display:"flex",marginBottom:ri===ROWS.length-1?"0":rg+"px"}}>
            {off?<div className="brick" style={{width:sw+"px",flexShrink:0,height:bh+"px",marginRight:cg+"px",borderRadius:"6px"}}></div>:null}
            {row.map(function(idx,bi){
              var d = brickData[idx] || {timesDone:0, word:""};
              var active = idx===p.curQ && p.playing;
              var cls = d.timesDone>=3 ? "brick"
                      : d.timesDone===2 ? "brick-p2"
                      : d.timesDone===1 ? "brick-p1"
                      : active ? "brick-cur" : "brick-empty";
              var txt = d.timesDone>=1 ? d.word : "";
              if(txt && txt.length>maxChars) txt=txt.slice(0,maxChars-1)+"·";
              return(
                <div key={idx} className={cls}
                  style={{flex:1,height:bh+"px",marginRight:bi===row.length-1?"0":cg+"px",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:fs+"px",fontFamily:QF,fontWeight:"700",letterSpacing:".04em",
                    textTransform:"uppercase",
                    color: d.timesDone>=3?"#fff": d.timesDone>0?"rgba(255,255,255,.7)":"transparent",
                    textShadow: d.timesDone>0?"0 1px 2px rgba(0,0,0,.5)":"none",
                    transition:"all .5s cubic-bezier(.34,1.4,.64,1)"}}>
                  {txt}
                </div>
              );
            })}
            {!off?<div className="brick" style={{width:sw+"px",flexShrink:0,height:bh+"px",marginLeft:cg+"px",borderRadius:"6px"}}></div>:null}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   WALL CRUMBLE — batch complete, bricks fall before next 10
   ═══════════════════════════════════════════════════════════ */
function WallCrumble(p){
  var brickData=p.brickData||[];
  var bh=WALL_BRICK_PX;
  var sw=WALL_STAGGER_PX;
  var rg=7,cg=6;
  var fs=bh>=54?12:bh>=48?11:9;
  var maxChars=bh>=54?9:bh>=48?8:7;
  var seq=0;
  return(
    <div className="wall-crumble-wrap">
      <div className="wall-crumble-dust" aria-hidden="true"></div>
      <div className="wall-crumble-slab" style={{width:"100%",background:"#fff",border:"2px solid #e8e8e8",borderRadius:"14px",padding:"10px 10px 6px",boxShadow:"0 2px 12px rgba(0,0,0,.08)",position:"relative",zIndex:1}}>
        {ROWS.map(function(row,ri){
          var off=ri%2===1;
          return(
            <div key={ri} style={{display:"flex",marginBottom:ri===ROWS.length-1?"0":rg+"px"}}>
              {off?(<div className="brick brick-crumble-piece" style={{width:sw+"px",flexShrink:0,height:bh+"px",marginRight:cg+"px",borderRadius:"6px",["--crumble-order"]:seq++}}></div>):null}
              {row.map(function(idx,bi){
                var d=brickData[idx]||{timesDone:0,word:""};
                var cls=d.timesDone>=3?"brick":d.timesDone===2?"brick-p2":d.timesDone===1?"brick-p1":"brick-empty";
                var txt=d.timesDone>=1?d.word:"";
                if(txt&&txt.length>maxChars)txt=txt.slice(0,maxChars-1)+"·";
                var mySeq=seq++;
                return(
                  <div key={idx} className={cls+" brick-crumble-piece"}
                    style={{flex:1,height:bh+"px",marginRight:bi===row.length-1?"0":cg+"px",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:fs+"px",fontFamily:QF,fontWeight:"700",letterSpacing:".04em",
                      textTransform:"uppercase",
                      color:d.timesDone>=3?"#fff":d.timesDone>0?"rgba(255,255,255,.7)":"#94a3b8",
                      textShadow:d.timesDone>0?"0 1px 2px rgba(0,0,0,.5)":"none",
                      ["--crumble-order"]:mySeq}}>
                    {txt}
                  </div>
                );
              })}
              {!off?(<div className="brick brick-crumble-piece" style={{width:sw+"px",flexShrink:0,height:bh+"px",marginLeft:cg+"px",borderRadius:"6px",["--crumble-order"]:seq++}}></div>):null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   FULL WALL MODAL — 30 bricks (3 categories)
   ═══════════════════════════════════════════════════════════ */
function FullWallModal(p){
  var allData = p.allBrickData || [];
  var verified = allData.filter(function(d){ return d && d.timesDone>=3; }).length;
  var catColors = ["#e8633a","#7c3aed","#0891b2"];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:"20px"}} onClick={p.onClose}>
      <div style={{background:"#fff",borderRadius:"24px",padding:"24px",maxWidth:"400px",width:"100%",boxShadow:"0 24px 80px rgba(0,0,0,.3)",overflowY:"auto",maxHeight:"90vh"}} onClick={function(e){e.stopPropagation();}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
          <div>
            <div style={{fontFamily:QF,fontWeight:"900",fontSize:"16px",letterSpacing:".1em",textTransform:"uppercase"}}>🧱 PARED COMPLETA</div>
            <div style={{fontFamily:QF,fontSize:"10px",color:"#aaa",marginTop:"2px"}}>{verified+" / 30 "+p.verifiedLbl}</div>
          </div>
          <button onClick={p.onClose} style={{width:"34px",height:"34px",borderRadius:"50%",border:"2px solid #e0e0e0",background:"#fff",cursor:"pointer",fontFamily:QF,fontSize:"16px",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        {WORD_PAIRS_DATA.map(function(cat,ci){
          var start=cat.brickStart;
          var catVerified=allData.slice(start,start+10).filter(function(d){return d&&d.timesDone>=3;}).length;
          return(<div key={ci} style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
            <div style={{width:"12px",height:"12px",borderRadius:"3px",background:catColors[ci],flexShrink:0}}></div>
            <span style={{fontFamily:QF,fontSize:"10px",color:"#555",flex:1}}>{p.lang==="ES"?cat.nameES:cat.nameEN}</span>
            <span style={{fontFamily:QF,fontSize:"10px",fontWeight:"700",color:catColors[ci]}}>{catVerified+"/10"}</span>
          </div>);
        })}
        <div style={{height:"1px",background:"#f0f0f0",margin:"10px 0 12px"}}></div>
        <div style={{background:"#fff",border:"2px solid #e8e8e8",borderRadius:"14px",padding:"8px 8px 4px"}}>
          {ROWS_FULL.map(function(row,ri){
            var catIdx2=Math.floor((14-ri)/5);var catColor=catColors[Math.min(catIdx2,catColors.length-1)];
            var isSeam=ri>0&&ri%5===0;
            return(
              <div key={ri}>
                {isSeam?<div style={{height:"3px",margin:"2px 4px 6px",borderRadius:"50px",background:"linear-gradient(90deg,transparent,#d0d0d0,transparent)"}}></div>:null}
                <div style={{display:"flex",marginBottom:"4px"}}>
                  {ri%2===1?<div style={{width:"30px",flexShrink:0,height:"30px",marginRight:"4px",borderRadius:"4px",background:"linear-gradient(160deg,#e8633a,#a83b1a)"}}></div>:null}
                  {row.map(function(idx,bi){
                    var d=allData[idx]||{timesDone:0,word:""};
                    var filled=d.timesDone>=3;
                    var partial=!filled&&d.timesDone>0;
                    var txt=filled?d.word:"";
                    if(txt&&txt.length>6)txt=txt.slice(0,5)+"·";
                    return(<div key={idx} style={{flex:1,height:"30px",marginRight:bi===row.length-1?"0":"4px",borderRadius:"5px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"8px",fontFamily:QF,fontWeight:"700",letterSpacing:".04em",textTransform:"uppercase",background:filled?"linear-gradient(160deg,"+catColor+" 0%,"+catColor+"99 100%)":partial?"rgba(200,200,200,.4)":"rgba(200,200,200,.12)",border:filled?"none":"2px dashed #ddd",color:filled?"#fff":"transparent",textShadow:filled?"0 1px 2px rgba(0,0,0,.4)":"none"}}>{txt}</div>);
                  })}
                  {ri%2!==1?<div style={{width:"30px",flexShrink:0,height:"30px",marginLeft:"4px",borderRadius:"4px",background:"linear-gradient(160deg,#e8633a,#a83b1a)"}}></div>:null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   GAME COMPONENT
   ═══════════════════════════════════════════════════════════ */
function Game(p){
  var user    = p.user;
  var profile = p.profile;

  /* ── Determine game language ── */
  var native = (profile&&profile.nativeLang?profile.nativeLang:"").toLowerCase();
  var lang   = native.indexOf("english")!==-1 ? "EN" : "ES";
  var g      = G[lang];
  var speechLang = lang==="ES" ? "en-US" : "es-MX";

  /* ── Word helpers — read text directly from pair, use ID for DB ── */
  function targetWord(pair){ return lang==="ES" ? pair.enWord : pair.esWord; }
  function promptWord(pair) { return lang==="ES" ? pair.esWord : pair.enWord; }
  function tId(pair)        { return lang==="ES" ? pair.enId  : pair.esId;   }

  /* ── Screen / load state ── */
  var _sc  = useState("start");  var screen  = _sc[0];  var setScreen  = _sc[1];
  var _lt  = useState(null);     var loadTrig= _lt[0];  var setLoadTrig= _lt[1];
  var _le  = useState(false);    var loadErr = _le[0];  var setLoadErr = _le[1];

  /* ── Data state ── */
  var _ci  = useState(0);        var catIdx  = _ci[0];  var setCatIdx  = _ci[1];
  var _wb  = useState({});       var wordBank= _wb[0];  var setWordBank= _wb[1];
  var _wp  = useState({});       var wordProg= _wp[0];  var setWordProg= _wp[1];
  var _sw  = useState([]);       var sessW   = _sw[0];  var setSessW   = _sw[1];

  /* ── L1 state ── */
  var _qi  = useState(0);        var qi      = _qi[0];  var setQi      = _qi[1];
  var _tm  = useState(TMAX);     var timer   = _tm[0];  var setTimer   = _tm[1];
  var _sc2 = useState(0);        var score   = _sc2[0]; var setScore   = _sc2[1];
  var _fb  = useState(null);     var fb      = _fb[0];  var setFb      = _fb[1];
  var _sel = useState(null);     var sel     = _sel[0]; var setSel     = _sel[1];
  var _best= useState(0);        var best    = _best[0];var setBest    = _best[1];
  var _lp  = useState(0);        var lpts    = _lp[0];  var setLpts    = _lp[1];
  var _corr= useState([]);       var corrList= _corr[0];var setCorrList= _corr[1];
  var tref = useRef(null);       var tval    = useRef(TMAX);

  /* ── L2 state ── */
  var _l2q = useState(0);        var l2qi   = _l2q[0]; var setL2Qi   = _l2q[1];
  var _l2i = useState("");       var l2inp  = _l2i[0]; var setL2Inp  = _l2i[1];
  var _l2f = useState(null);     var l2fb   = _l2f[0]; var setL2Fb   = _l2f[1];
  var _l2s = useState(0);        var l2score= _l2s[0]; var setL2Score= _l2s[1];
  var _l2a = useState([]);       var l2ans  = _l2a[0]; var setL2Ans  = _l2a[1];
  var _l2tm= useState(TMAX_L23); var l2timer= _l2tm[0];var setL2Timer= _l2tm[1];
  var l2tref=useRef(null);       var l2tval =useRef(TMAX_L23);

  /* ── L3 state ── */
  var _l3q = useState(0);        var l3qi   = _l3q[0]; var setL3Qi   = _l3q[1];
  var _l3l = useState(false);    var l3listen=_l3l[0]; var setL3Listen=_l3l[1];
  var _l3f = useState(null);     var l3fb   = _l3f[0]; var setL3Fb   = _l3f[1];
  var _l3r = useState([]);       var l3res  = _l3r[0]; var setL3Res  = _l3r[1];
  var _l3sup=useState(true);     var l3sup  = _l3sup[0];var setL3Sup = _l3sup[1];
  var _l3tm= useState(TMAX_L23); var l3timer= _l3tm[0];var setL3Timer= _l3tm[1];
  var _l3wc= useState(false);   var l3WaitContinue=_l3wc[0];var setL3WaitContinue=_l3wc[1];
  var l3tref=useRef(null);
  var l3RecRef=useRef(null);
  var l3FailCountRef=useRef(0);
  var l3PendingNewResRef=useRef(null);
  var l3WaitContRef=useRef(false);
  var l3SessionKindRef=useRef("wall"); /* "wall" | "assess" — for saving results after last word */
  var micStreamRef=useRef(null);
  var bestAltRef=useRef("");

  /* ── Full wall modal ── */
  var _sfw = useState(false);    var showFW  = _sfw[0]; var setShowFW = _sfw[1];

  var _aq = useState([]);        var asQueue = _aq[0]; var setAsQueue = _aq[1];
  var _aqi= useState(0);         var asQi    = _aqi[0]; var setAsQi    = _aqi[1];
  var _ai = useState("");        var asInp   = _ai[0];  var setAsInp   = _ai[1];
  var _af = useState(null);      var asFb    = _af[0];  var setAsFb    = _af[1];
  var _aa = useState([]);        var asAns   = _aa[0];  var setAsAns   = _aa[1];
  var _ad = useState(false);     var asDemo  = _ad[0];  var setAsDemo   = _ad[1];
  var _adl= useState(false);     var asDemoLiveList=_adl[0];var setAsDemoLiveList=_adl[1];
  var _dwp= useState({});        var demoWordProg=_dwp[0];var setDemoWordProg=_dwp[1];
  var _dbs= useState([]);        var demoBankSnapshot=_dbs[0];var setDemoBankSnapshot=_dbs[1];
  var _apr= useState({});        var asProg  = _apr[0]; var setAsProg  = _apr[1];
  var _adp= useState({});        var demoAsProg = _adp[0]; var setDemoAsProg = _adp[1];
  var demoAsProgRef=useRef(demoAsProg);
  var _arw= useState([]);        var asRows  = _arw[0]; var setAsRows  = _arw[1];
  var _ab = useState([]);        var asBatch = _ab[0];  var setAsBatch = _ab[1]; /* current 10 (or fewer) */
  var _am = useState(null);      var asMeta  = _am[0];  var setAsMeta  = _am[1]; /* { total, done } */
  var _cdb= useState(null);      var crumbleBrickData=_cdb[0]; var setCrumbleBrickData=_cdb[1];
  var asCrumbleNextRef=useRef(null);
  var screenR=useRef(screen);
  screenR.current=screen;

  var wallComplete=isAllWordWallComplete(wordProg,lang);

  useEffect(function(){
    demoAsProgRef.current=demoAsProg||{};
  }, [demoAsProg]);

  function asId(gameLang, prompt, target){
    function n(s){return String(s||"").trim().toLowerCase().replace(/\s+/g," ");}
    return "as|"+String(gameLang||"") + "|" + n(prompt) + "|" + n(target);
  }

  function normalizeAssessmentRows(rows){
    var raw=rows||[];
    var out=[];var seen={};
    for(var i=0;i<raw.length;i++){
      var r=raw[i]||{};
      var pr=String(r.prompt!=null?r.prompt:"").trim();
      var tg=String(r.target!=null?r.target:"").trim();
      if(!pr||!tg)continue;
      var k=asId(lang,pr,tg);
      if(seen[k])continue;
      seen[k]=1;
      out.push({prompt:pr,target:tg,id:k});
    }
    return out;
  }

  function buildAssessmentBatch(allRows, progMap, isDemo){
    var p=progMap||{};
    var remaining=(allRows||[]).filter(function(r){var t=(p[String(r.id)]||{}).timesDone||0;return t<VERIFIED_NEEDED;});
    var batch=remaining.slice(0,10);
    var targets={};var optPool=[];
    batch.forEach(function(r){if(!targets[r.target]){targets[r.target]=1;optPool.push(r.target);}});
    var q=batch.map(function(r){
      return {promptWord:r.prompt,targetWord:r.target,targetId:r.id,options:shuffle(optPool.slice())};
    });
    return {remaining:remaining,total:(allRows||[]).length,batch:batch,queue:q};
  }

  var demoFabHandlerRef=useRef(function(){});
  demoFabHandlerRef.current=function(){
    setAsDemo(true);
    function normalizeSnap(rows){
      var mock=getAssessmentDemoWords(lang);
      var raw=rows&&rows.length?rows:mock;
      var snap=[];
      for(var i=0;i<raw.length;i++){
        var r=raw[i];
        snap.push({prompt:String(r.prompt!=null?r.prompt:"").trim(),target:String(r.target!=null?r.target:"").trim()});
      }
      snap=snap.filter(function(x){return x.prompt&&x.target;});
      if(!snap.length)snap=mock.map(function(m){return {prompt:m.prompt,target:m.target};});
      return snap;
    }
    function afterBankReady(rows){
      var hasLive=!!(rows&&rows.length);
      setAsDemoLiveList(hasLive);
      var snap=normalizeSnap(rows||[]);
      var norm=normalizeAssessmentRows(snap);
      setDemoBankSnapshot(norm);
      setDemoAsProg({});
      var built=buildAssessmentBatch(norm, {}, true);
      if(!built.queue.length){setScreen("assessmentEmpty");return;}
      setAsRows(norm);
      setAsBatch(built.batch);
      setAsMeta({total:built.total,done:built.total-built.remaining.length});
      setSessW(built.queue);
      setQi(0);tval.current=TMAX;setTimer(TMAX);
      setScore(0);setFb(null);setSel(null);setBest(0);setLpts(0);setCorrList([]);
      setL2Qi(0); setL2Inp(""); setL2Fb(null); setL2Score(0); setL2Ans([]);
      setL2Timer(TMAX_L23); l2tval.current=TMAX_L23;
      setL3Qi(0); setL3Listen(false); setL3Fb(null); setL3Res([]);
      setL3Timer(TMAX_L23);
      l3PendingNewResRef.current=null;l3WaitContRef.current=false;setL3WaitContinue(false);
      setScreen("asPlaying");
    }
    if(user&&user.email&&window.fbGetAssessmentKnownWordsForUser){
      setAsDemoLiveList(false);
      setScreen("assessmentLoading");
      window.fbGetAssessmentKnownWordsForUser(user.email,lang).then(function(rows){
        afterBankReady(rows||[]);
      }).catch(function(e){
        console.error(e);
        afterBankReady([]);
      });
    } else {
      afterBankReady([]);
    }
  };
  var showAssessmentDemoFab=screen!=="assessmentPlay"&&screen!=="assessmentEnd"&&screen!=="assessmentLoading"&&screen!=="demoMcPlay"&&screen!=="demoMcPaused"&&screen!=="demoMcEnd"&&screen!=="asPlaying"&&screen!=="asPaused"&&screen!=="asL2play"&&screen!=="asL2end"&&screen!=="asL3play"&&screen!=="asL3paused"&&screen!=="asL3end"&&screen!=="asWallCrumble"&&screen!=="asBatchEnd"&&screen!=="asAllDone";
  var assessmentDemoFabEl=showAssessmentDemoFab&&typeof document!=="undefined"?createPortal(
    <button
      type="button"
      onClick={function(){demoFabHandlerRef.current();}}
      aria-label={g.assessDemoFab}
      title={g.assessDemoFab}
      style={{
        position:"fixed",
        bottom:"max(20px, env(safe-area-inset-bottom, 0px))",
        right:"max(20px, env(safe-area-inset-right, 0px))",
        zIndex:2147483647,
        fontFamily:QF,
        fontSize:"12px",
        fontWeight:"700",
        letterSpacing:".1em",
        textTransform:"uppercase",
        padding:"12px 22px",
        borderRadius:"50px",
        border:"2px solid #0f766e",
        background:"linear-gradient(180deg,#14b8a6 0%,#0d9488 100%)",
        color:"#fff",
        cursor:"pointer",
        boxShadow:"0 8px 28px rgba(13,148,136,.55), 0 0 0 1px rgba(255,255,255,.25) inset",
        pointerEvents:"auto",
      }}
    >{g.assessDemoFab}</button>,
    document.body
  ):null;

  useEffect(function(){
    if(screen!=="start"||!user||!user.uid)return;
    if(!window.fbGetWordProgress)return;
    window.fbGetWordProgress(user.uid).then(function(prog){ setWordProg(prog||{}); });
  }, [screen, user]);

  function startAssessment(){
    if(!wallComplete||!user||!user.email){setScreen("start");return;}
    setAsDemo(false);
    setAsDemoLiveList(false);
    setScreen("assessmentLoading");
    window.fbGetAssessmentKnownWordsForUser(user.email,lang).then(function(rows){
      var norm=normalizeAssessmentRows(rows||[]);
      if(!norm.length){setScreen("assessmentEmpty");return;}
      setAsRows(norm);
      var getProg=(user&&window.fbGetAssessmentProgress)?window.fbGetAssessmentProgress(user.uid):Promise.resolve({});
      getProg.then(function(pmap){
        var pm=pmap||{};
        setAsProg(pm);
        var built=buildAssessmentBatch(norm, pm, false);
        if(!built.queue.length){setScreen("asAllDone");return;}
        setAsBatch(built.batch);
        setAsMeta({total:built.total,done:built.total-built.remaining.length});
        setSessW(built.queue);
        setQi(0);tval.current=TMAX;setTimer(TMAX);
        setScore(0);setFb(null);setSel(null);setBest(0);setLpts(0);setCorrList([]);
        setL2Qi(0); setL2Inp(""); setL2Fb(null); setL2Score(0); setL2Ans([]);
        setL2Timer(TMAX_L23); l2tval.current=TMAX_L23;
        setL3Qi(0); setL3Listen(false); setL3Fb(null); setL3Res([]);
        setL3Timer(TMAX_L23);
        l3PendingNewResRef.current=null;l3WaitContRef.current=false;setL3WaitContinue(false);
        setScreen("asPlaying");
      });
    }).catch(function(e){
      console.error(e);
      setScreen("assessmentError");
    });
  }
  function checkAssessment(){
    if(!asQueue.length)return;
    var cur=asQueue[asQi]||{prompt:"",target:""};
    var ok=normCheck(asInp)===normCheck(cur.target);
    if(ok)sOk();else sWrong();
    var newAns=asAns.concat([{promptWord:cur.prompt,expected:cur.target,typed:asInp.trim(),correct:ok}]);
    setAsAns(newAns);
    setAsFb({ok:ok,expected:cur.target,typed:asInp.trim()});
    setTimeout(function(){
      var nx=asQi+1;
      if(nx>=asQueue.length){
        var fc=newAns.filter(function(a){return a.correct;}).length;
        if(!asDemo&&window.fbSaveResult)window.fbSaveResult({userId:user?user.uid:"guest",userEmail:user?user.email:"",language:lang,level:"assessment",writingScore:fc,totalQuestions:asQueue.length,source:"VocabularyBuilder/Assessment/Users"});
        setScreen("assessmentEnd");
      } else {setAsQi(nx);setAsInp("");setAsFb(null);}
    },1400);
  }

  /* ─────────────────────────────────────────────────────────────
     Compute brickData for one category from wordProgress
  ───────────────────────────────────────────────────────────── */
  function getCatBrickData(ci, prog, sessionCorrects){
    /* sessionCorrects = IDs acertados en ESTA sesión (corrList)
       La pared arranca vacía — solo se llena con aciertos de esta sesión.
       wordProg solo se usa para calcular el timesDone acumulado (para Firestore),
       no para mostrar ladrillos previos. */
    var hits = sessionCorrects || [];
    var cat = WORD_PAIRS_DATA[ci];
    return cat.pairs.map(function(pair){
      var id   = tId(pair);
      var p2   = prog[String(id)] || {timesDone:0};
      var wd   = targetWord(pair);
      var done = p2.timesDone || 0;
      /* ¿Respondió correctamente en esta sesión? → mostrar ladrillo con palabra */
      if(hits.indexOf(id) !== -1) return { timesDone: Math.max(done, 1), word: wd };
      /* No acertado aún en esta sesión → ladrillo vacío, sin palabra */
      return { timesDone: 0, word: "" };
    });
  }

  function getAllBrickData(prog){
    var out = Array(30).fill(null).map(function(){ return {timesDone:0,word:""}; });
    WORD_PAIRS_DATA.forEach(function(cat){
      cat.pairs.forEach(function(pair, pi){
        var id = tId(pair);
        var p2 = prog[String(id)] || {timesDone:0};
        out[cat.brickStart + pi] = { timesDone: p2.timesDone||0, word: targetWord(pair) };
      });
    });
    return out;
  }

  function pad10(arr){
    var a=(arr||[]).slice();
    while(a.length<10)a.push({timesDone:0,word:""});
    return a.slice(0,10);
  }

  function getCatBrickDataCumulative(ci, prog){
    var cat = WORD_PAIRS_DATA[ci];
    return cat.pairs.map(function(pair){
      var id = tId(pair);
      var p2 = (prog||{})[String(id)] || {timesDone:0};
      return { timesDone: p2.timesDone||0, word: targetWord(pair) };
    });
  }

  function getBrickIdxInCatById(ci, targetId){
    var cat = WORD_PAIRS_DATA[ci];
    for(var i=0;i<cat.pairs.length;i++){
      if(String(tId(cat.pairs[i]))===String(targetId)) return i;
    }
    return 0;
  }

  function getAssessmentBatchBrickData(batchRows, progMap){
    var p=progMap||{};
    var bricks=(batchRows||[]).map(function(r){
      var pr=p[String(r.id)]||{timesDone:0};
      return { timesDone: pr.timesDone||0, word: String(r.target||"") };
    });
    return pad10(bricks);
  }

  /* Level 2 typing: keep brick fill (timesDone) but hide English until that word is answered correctly in this L2 run. */
  function l2RevealedNormKeys(l2ans){
    var o={};
    (l2ans||[]).forEach(function(a){
      if(a&&a.correct&&a.expected)o[normCheck(a.expected)]=1;
    });
    return o;
  }
  function brickDataHideLabelsUnlessL2Correct(brickData, revealedNorm, normKeyForBrickIndex){
    return (brickData||[]).map(function(b,i){
      var nk=normKeyForBrickIndex(i);
      if(!nk||!revealedNorm[nk])return Object.assign({},b,{word:""});
      return b;
    });
  }

  /* ─────────────────────────────────────────────────────────────
     handleCorrectAnswer — update timesDone locally + Firestore
  ───────────────────────────────────────────────────────────── */
  function handleCorrectAnswer(targetId, targetWord, currentProg){
    var current = (currentProg[String(targetId)]||{}).timesDone||0;
    var newTimes = Math.min(VERIFIED_NEEDED, current+1);
    var updated  = Object.assign({}, currentProg);
    updated[String(targetId)] = {
      timesDone : newTimes,
      verified  : newTimes >= VERIFIED_NEEDED,
      word      : targetWord
    };
    setWordProg(updated);
    if(user && window.fbSaveWordProgress){
      window.fbSaveWordProgress(user.uid, targetId, targetWord, newTimes);
    }
    return updated;
  }

  /* ─────────────────────────────────────────────────────────────
     LOAD EFFECT — only fetches user progress from Firestore.
     Word text comes from hardcoded WORD_PAIRS_DATA.
  ───────────────────────────────────────────────────────────── */
  useEffect(function(){
    if(!loadTrig) return;
    var ci  = loadTrig.ci;
    var cat = WORD_PAIRS_DATA[ci];

    var getProg = (user && window.fbGetWordProgress)
      ? window.fbGetWordProgress(user.uid)
      : Promise.resolve({});

    getProg
      .then(function(prog){
        var finalProg = prog || {};
        setWordProg(finalProg);
        setCatIdx(ci);

        var queue = buildSessionQueue(cat, finalProg, lang);

        if(!queue.length){
          setScreen("catComplete");
          return;
        }
        setSessW(queue);
        setQi(0); tval.current=TMAX; setTimer(TMAX);
        setScore(0); setFb(null); setSel(null); setBest(0); setLpts(0); setCorrList([]);
        setL2Qi(0); setL2Inp(""); setL2Fb(null); setL2Score(0); setL2Ans([]);
        setL2Timer(TMAX_L23); l2tval.current=TMAX_L23;
        setL3Qi(0); setL3Listen(false); setL3Fb(null); setL3Res([]);
        setL3Timer(TMAX_L23);
        l3PendingNewResRef.current=null;l3WaitContRef.current=false;setL3WaitContinue(false);
        setScreen("playing");
      })
      .catch(function(e){
        console.error("WordWall load error:",e);
        setLoadErr(true);
        setScreen("loadError");
      });
  }, [loadTrig]);

  function startCat(ci){
    setScreen("loading");
    setLoadErr(false);
    setLoadTrig({ ci:ci, ts:Date.now() });
  }

  /* ═══ SOUNDS ═══ */
  function AC(){return new(window.AudioContext||window.webkitAudioContext)();}
  function tn(ctx,f,type,d,v,dl,f2){v=v||.35;dl=dl||0;var o=ctx.createOscillator(),gn=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,ctx.currentTime+dl);if(f2)o.frequency.exponentialRampToValueAtTime(f2,ctx.currentTime+dl+d);gn.gain.setValueAtTime(v,ctx.currentTime+dl);gn.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+dl+d);o.connect(gn);gn.connect(ctx.destination);o.start(ctx.currentTime+dl);o.stop(ctx.currentTime+dl+d);}
  function sOk(){try{var c=AC();[523,659,784].forEach(function(f,i){tn(c,f,"sine",.4,.3,i*.08);});}catch(e){}}
  function sWrong(){try{var c=AC();tn(c,440,"square",.1,.3);}catch(e){}}
  function sBub(){try{var c=AC();tn(c,600,"sine",.18,.4,0,1200);}catch(e){}}
  function sTada(){try{var c=AC();[523,659,784,1047].forEach(function(f,i){tn(c,f,"sine",.5,.25,i*.07);});}catch(e){}}
  function sWin(){try{var c=AC();[261,294,329,349,392,440,494,523,587,659,784,880].forEach(function(f,i){var o=c.createOscillator(),gn=c.createGain();o.type="square";o.frequency.value=f;gn.gain.setValueAtTime(.2,c.currentTime+i*.06);gn.gain.exponentialRampToValueAtTime(.001,c.currentTime+i*.06+.15);o.connect(gn);gn.connect(c.destination);o.start(c.currentTime+i*.06);o.stop(c.currentTime+i*.06+.15);});}catch(e){}}

  /* ════════════ LEVEL 1 TIMER ════════════ */
  function clrT(){if(tref.current){clearInterval(tref.current);tref.current=null;}}
  useEffect(function(){
    if((screen!=="playing"&&screen!=="demoMcPlay"&&screen!=="asPlaying")||fb!==null)return;
    clrT();tval.current=TMAX;setTimer(TMAX);
    tref.current=setInterval(function(){
      tval.current-=1;setTimer(tval.current);
      if(tval.current<=0){
        clrT();
        if(screenR.current==="demoMcPlay")procDemoL1(null,0);
        else if(screenR.current==="asPlaying")procAsL1(null,0);
        else procL1(null,0);
      }
    },1000);
    return clrT;
  },[screen,qi]);

  function handleCorrectAnswerAssessment(targetId, promptWord, targetWord, currentProg, isDemo){
    var curMap=currentProg||{};
    var current=(curMap[String(targetId)]||{}).timesDone||0;
    var newTimes=Math.min(VERIFIED_NEEDED, current+1);
    var updated=Object.assign({}, curMap);
    updated[String(targetId)]={timesDone:newTimes,prompt:promptWord,target:targetWord,verified:newTimes>=VERIFIED_NEEDED};
    if(isDemo){
      setDemoAsProg(updated);
    } else {
      setAsProg(updated);
      if(user && window.fbSaveAssessmentProgress){
        window.fbSaveAssessmentProgress(user.uid, targetId, promptWord, targetWord, newTimes);
      }
    }
    return updated;
  }

  function procL1(ans,tl){
    if(!sessW.length)return;
    var cur=sessW[qi];
    var ok = ans===cur.targetWord;
    clrT();
    var latestProg = wordProg;
    if(ok){
      sOk();
      latestProg = handleCorrectAnswer(cur.targetId, cur.targetWord, wordProg);
      setScore(function(s){return s+(tl||0);});
      setLpts(tl||0);
      setBest(function(b){return Math.max(b,tl||0);});
      setCorrList(function(l){ return l.concat([cur.targetId]); });
    } else sWrong();
    setSel(ans);
    setFb(ans===null?"timeout":ok?"ok":"wrong");
    setTimeout(function(){
      var nx=qi+1;
      if(nx>=sessW.length){
        var fc=corrList.length+(ok?1:0);
        if(fc===sessW.length)sWin();
        setScreen("results");
      } else {
        if(qi===Math.floor(sessW.length/2)-1) sTada();
        setQi(nx);setTimer(TMAX);tval.current=TMAX;setFb(null);setSel(null);
      }
    },1600);
  }

  function procDemoL1(ans,tl){
    if(!sessW.length)return;
    var cur=sessW[qi];
    var ok=ans===cur.targetWord;
    clrT();
    if(ok){
      sOk();
      setDemoWordProg(function(prev){
        var id=String(cur.targetId);
        var c=(prev[id]||{}).timesDone||0;
        var n=Object.assign({},prev);
        n[id]={timesDone:Math.min(VERIFIED_NEEDED,c+1),word:cur.targetWord,verified:(c+1)>=VERIFIED_NEEDED};
        return n;
      });
      setScore(function(s){return s+(tl||0);});
      setLpts(tl||0);
      setBest(function(b){return Math.max(b,tl||0);});
      setCorrList(function(l){ return l.concat([cur.targetId]); });
    } else sWrong();
    setSel(ans);
    setFb(ans===null?"timeout":ok?"ok":"wrong");
    setTimeout(function(){
      var nx=qi+1;
      var fc=corrList.length+(ok?1:0);
      if(nx>=sessW.length){
        if(fc===sessW.length)sWin();
        setScreen("demoMcEnd");
      } else {
        if(qi===Math.floor(sessW.length/2)-1)sTada();
        setQi(nx);setTimer(TMAX);tval.current=TMAX;setFb(null);setSel(null);
      }
    },1600);
  }

  function procAsL1(ans,tl){
    if(!sessW.length)return;
    var cur=sessW[qi];
    var ok = ans===cur.targetWord;
    clrT();
    if(ok){
      sOk();
      handleCorrectAnswerAssessment(cur.targetId, cur.promptWord, cur.targetWord, asDemo?demoAsProg:asProg, !!asDemo);
      setScore(function(s){return s+(tl||0);});
      setLpts(tl||0);
      setBest(function(b){return Math.max(b,tl||0);});
      setCorrList(function(l){ return l.concat([cur.targetId]); });
    } else sWrong();
    setSel(ans);
    setFb(ans===null?"timeout":ok?"ok":"wrong");
    setTimeout(function(){
      var nx=qi+1;
      if(nx>=sessW.length){
        var fc=corrList.length+(ok?1:0);
        if(fc===sessW.length)sWin();
        setScreen("asBatchEnd");
      } else {
        if(qi===Math.floor(sessW.length/2)-1) sTada();
        setQi(nx);setTimer(TMAX);tval.current=TMAX;setFb(null);setSel(null);
      }
    },1600);
  }

  function pickL1(ans){
    if(fb!==null)return;
    sBub();clrT();
    if(screen==="demoMcPlay"||screen==="demoMcPaused")procDemoL1(ans,tval.current);
    else if(screen==="asPlaying"||screen==="asPaused")procAsL1(ans,tval.current);
    else procL1(ans,tval.current);
  }

  /* ════════════ LEVEL 2 TIMER ════════════ */
  function clrL2T(){if(l2tref.current){clearInterval(l2tref.current);l2tref.current=null;}}
  useEffect(function(){
    if((screen!=="l2play"&&screen!=="asL2play")||l2fb!==null){clrL2T();return;}
    clrL2T();l2tval.current=TMAX_L23;setL2Timer(TMAX_L23);
    l2tref.current=setInterval(function(){
      l2tval.current-=1;setL2Timer(l2tval.current);
      if(l2tval.current<=0){clrL2T();checkL2(true);}
    },1000);
    return clrL2T;
  },[screen,l2qi]);

  function startL2(){setL2Qi(0);setL2Inp("");setL2Fb(null);setL2Score(0);setL2Ans([]);setL2Timer(TMAX_L23);l2tval.current=TMAX_L23;setScreen("l2play");}
  function startAsL2(){setL2Qi(0);setL2Inp("");setL2Fb(null);setL2Score(0);setL2Ans([]);setL2Timer(TMAX_L23);l2tval.current=TMAX_L23;setScreen("asL2play");}

  function checkL2(timeout){
    clrL2T();
    var cur=sessW[l2qi];
    var ok=!timeout&&normCheck(l2inp)===normCheck(cur.targetWord);
    if(ok){sOk();}else sWrong();
    if(ok){
      if(screenR.current==="asL2play"){
        handleCorrectAnswerAssessment(cur.targetId, cur.promptWord, cur.targetWord, asDemo?demoAsProg:asProg, !!asDemo);
      } else {
        handleCorrectAnswer(cur.targetId, cur.targetWord, wordProg);
      }
    }
    var newAns=l2ans.concat([{expected:cur.targetWord,typed:l2inp.trim(),correct:ok,timeout:!!timeout,promptWord:cur.promptWord}]);
    setL2Ans(newAns);
    setL2Fb({ok:ok,expected:cur.targetWord,typed:l2inp.trim(),timeout:!!timeout});
    if(ok)setL2Score(function(s){return s+1;});
    setTimeout(function(){
      var nx=l2qi+1;
      if(nx>=sessW.length){
        var fc2=newAns.filter(function(a){return a.correct;}).length;
        if(screenR.current==="asL2play"){
          if(!asDemo&&window.fbSaveResult)window.fbSaveResult({userId:user?user.uid:"guest",userEmail:user?user.email:"",language:lang,level:"assessment",category:"assessment",level2Score:fc2,totalQuestions:sessW.length,source:"VocabularyBuilder/Assessment/Users"});
          setScreen("asL2end");
        } else {
          if(window.fbSaveResult)window.fbSaveResult({userId:user?user.uid:"guest",userEmail:user?user.email:"",language:lang,category:WORD_PAIRS_DATA[catIdx].id,level:2,writingScore:fc2,totalQuestions:sessW.length});
          setScreen("l2end");
        }
      } else {setL2Qi(nx);setL2Inp("");setL2Fb(null);}
    },1400);
  }

  /* ════════════ LEVEL 3 ════════════ */
  function requestMicOnce(cb){
    if(micStreamRef.current&&micStreamRef.current.active){cb();return;}
    navigator.mediaDevices.getUserMedia({audio:true,video:false})
      .then(function(stream){micStreamRef.current=stream;cb();})
      .catch(function(err){console.warn("Mic:",err);setL3Sup(false);});
  }
  function startL3(){
    l3SessionKindRef.current="wall";
    l3FailCountRef.current=0;l3PendingNewResRef.current=null;l3WaitContRef.current=false;setL3WaitContinue(false);
    setL3Qi(0);setL3Listen(false);setL3Fb(null);setL3Res([]);setL3Timer(TMAX_L23);
    requestMicOnce(function(){setScreen("l3play");});
  }
  function startAsL3(){
    l3SessionKindRef.current="assess";
    l3FailCountRef.current=0;l3PendingNewResRef.current=null;l3WaitContRef.current=false;setL3WaitContinue(false);
    setL3Qi(0);setL3Listen(false);setL3Fb(null);setL3Res([]);setL3Timer(TMAX_L23);
    requestMicOnce(function(){setScreen("asL3play");});
  }
  function pauseL3Exercise(){
    stopL3Recognizer();
    if(screenR.current==="l3play")setScreen("l3paused");
    else if(screenR.current==="asL3play")setScreen("asL3paused");
  }
  function resumeL3Exercise(which){
    setScreen(which);
  }
  function clrL3T(){if(l3tref.current){clearInterval(l3tref.current);l3tref.current=null;}}
  function stopL3Recognizer(){
    clrL3T();
    var rec=l3RecRef.current;
    if(rec){
      try{if(rec.abort)rec.abort();}catch(e1){}
      try{if(rec.stop)rec.stop();}catch(e2){}
      l3RecRef.current=null;
    }
    setL3Listen(false);
  }
  function startSpeech(){
    var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){setL3Sup(false);return;}
    if(screenR.current!=="l3play"&&screenR.current!=="asL3play")return;
    if(l3WaitContRef.current)return;
    if(!sessW.length)return;
    var curAtTap=sessW[l3qi];
    if(!curAtTap)return;
    stopL3Recognizer();
    bestAltRef.current="";
    var rec=new SR();
    l3RecRef.current=rec;
    rec.lang=speechLang;rec.interimResults=false;rec.maxAlternatives=5;
    setL3Listen(true);setL3Timer(TMAX_L23);
    rec.onresult=function(ev){
      var bAlt="";var bScore=-1;
      for(var i=0;i<ev.results[0].length;i++){
        var alt=normalizeDigitTranscript(ev.results[0][i].transcript,speechLang);
        var tmp=analyzePronunciation(curAtTap.targetWord,alt,speechLang);
        if(tmp.overall>bScore){bScore=tmp.overall;bAlt=alt;}
      }
      bestAltRef.current=bAlt;
    };
    rec.onend=function(){
      l3RecRef.current=null;clrL3T();setL3Listen(false);setL3Timer(TMAX_L23);
      if(screenR.current!=="l3play"&&screenR.current!=="asL3play")return;
      processL3(bestAltRef.current,curAtTap);
    };
    rec.onerror=function(){
      l3RecRef.current=null;clrL3T();setL3Listen(false);setL3Timer(TMAX_L23);
      if(screenR.current!=="l3play"&&screenR.current!=="asL3play")return;
      processL3("",curAtTap);
    };
    try{rec.start();}catch(e3){l3RecRef.current=null;setL3Listen(false);if(screenR.current==="l3play"||screenR.current==="asL3play")processL3("",curAtTap);}
    var tv=TMAX_L23;
    l3tref.current=setInterval(function(){tv-=1;setL3Timer(tv);if(tv<=0){clrL3T();try{rec.stop();}catch(e){}}},1000);
  }
  function toggleL3Recording(){
    if(screenR.current!=="l3play"&&screenR.current!=="asL3play")return;
    if(l3WaitContRef.current)return;
    if(l3listen){
      var rec0=l3RecRef.current;
      if(rec0){try{rec0.stop();}catch(eSt){}}
      return;
    }
    if(l3fb&&l3fb.retry)setL3Fb(null);
    startSpeech();
  }
  function queueL3WordComplete(newRes){
    l3PendingNewResRef.current=newRes;
    l3WaitContRef.current=true;
    setL3WaitContinue(true);
  }
  function applyL3WordComplete(){
    var newRes=l3PendingNewResRef.current;
    l3PendingNewResRef.current=null;
    l3WaitContRef.current=false;
    setL3WaitContinue(false);
    setL3Fb(null);
    if(!newRes)return;
    setL3Res(newRes);
    var nextQi=newRes.length;
    if(nextQi>=sessW.length){
      var fc3=newRes.filter(function(r){return r.correct;}).length;
      var avgS=Math.round(newRes.reduce(function(s,r){return s+(r.analysis?r.analysis.overall:0);},0)/Math.max(newRes.length,1));
      var weaknesses=[];
      newRes.forEach(function(r){if(!r.analysis||!r.analysis.wordResults||!r.analysis.wordResults.length)return;var worst=r.analysis.wordResults.reduce(function(a,b){return a.score<=b.score?a:b;});if(worst.score<70)weaknesses.push({word:worst.word,heard:worst.heard,score:worst.score});});
      if(l3SessionKindRef.current==="assess"){
        if(!asDemo&&window.fbSaveResult)window.fbSaveResult({userId:user?user.uid:"guest",userEmail:user?user.email:"",language:lang,level:"assessment",category:"assessment",pronunciationScore:fc3,avgPhoneticScore:avgS,totalQuestions:sessW.length,source:"VocabularyBuilder/Assessment/Users"});
        if(weaknesses.length&&user&&user.uid&&window.fbSavePhonemeProblem)window.fbSavePhonemeProblem(user.uid,user.email||"",weaknesses);
        if(asDemo){
          var progMapEndNow=demoAsProgRef.current||{};
          var builtNow=buildAssessmentBatch(asRows, progMapEndNow, true);
          var brickSnapNow=getAssessmentBatchBrickData(asBatch, progMapEndNow);
          setCrumbleBrickData(brickSnapNow);
          asCrumbleNextRef.current=function(){
            var progAgain=demoAsProgRef.current||{};
            var builtNext=buildAssessmentBatch(asRows, progAgain, true);
            if(!builtNext.queue.length){
              setScreen("asAllDone");
              return;
            }
            setAsMeta({total:builtNext.total,done:builtNext.total-builtNext.remaining.length});
            setAsBatch(builtNext.batch);
            setSessW(builtNext.queue);
            setQi(0);tval.current=TMAX;setTimer(TMAX);
            setScore(0);setFb(null);setSel(null);setBest(0);setLpts(0);setCorrList([]);
            setL2Qi(0);setL2Inp("");setL2Fb(null);setL2Score(0);setL2Ans([]);
            setL2Timer(TMAX_L23);l2tval.current=TMAX_L23;
            setL3Qi(0);setL3Listen(false);setL3Fb(null);setL3Res([]);
            setL3Timer(TMAX_L23);
            l3PendingNewResRef.current=null;l3WaitContRef.current=false;setL3WaitContinue(false);
            setScreen("asPlaying");
          };
          setScreen("asWallCrumble");
        }else{
          var progMapEndNow=asProg;
          var builtNow=buildAssessmentBatch(asRows, progMapEndNow, false);
          if(builtNow.queue.length){
            var brickSnapNow=getAssessmentBatchBrickData(asBatch, progMapEndNow);
            asCrumbleNextRef.current=function(){
              setAsMeta({total:builtNow.total,done:builtNow.total-builtNow.remaining.length});
              setAsBatch(builtNow.batch);
              setSessW(builtNow.queue);
              setQi(0);tval.current=TMAX;setTimer(TMAX);
              setScore(0);setFb(null);setSel(null);setBest(0);setLpts(0);setCorrList([]);
              setL2Qi(0);setL2Inp("");setL2Fb(null);setL2Score(0);setL2Ans([]);
              setL2Timer(TMAX_L23);l2tval.current=TMAX_L23;
              setL3Qi(0);setL3Listen(false);setL3Fb(null);setL3Res([]);
              setL3Timer(TMAX_L23);
              l3PendingNewResRef.current=null;l3WaitContRef.current=false;setL3WaitContinue(false);
              setScreen("asPlaying");
            };
            setCrumbleBrickData(brickSnapNow);
            setScreen("asWallCrumble");
          }else{
            setScreen("asL3end");
          }
        }
      } else {
        if(window.fbSaveResult)window.fbSaveResult({userId:user?user.uid:"guest",userEmail:user?user.email:"",language:lang,category:WORD_PAIRS_DATA[catIdx].id,level:3,pronunciationScore:fc3,avgPhoneticScore:avgS,totalQuestions:sessW.length});
        if(weaknesses.length&&user&&user.uid&&window.fbSavePhonemeProblem)window.fbSavePhonemeProblem(user.uid,user.email||"",weaknesses);
        setScreen("l3end");
      }
      return;
    }
    l3FailCountRef.current=0;
    setL3Qi(nextQi);
  }
  function processL3(heard,cur){
    if(screenR.current!=="l3play"&&screenR.current!=="asL3play")return;
    if(heard==="__SKIP__"){
      sWrong();
      var analysis0=analyzePronunciation(cur.targetWord,"",speechLang);
      var diff0=pronDiff(cur.targetWord,"");
      l3FailCountRef.current=0;
      setL3Fb({heard:"",correct:false,diff:diff0,analysis:analysis0,skipped:true});
      var newRes0=l3res.concat([{expected:cur.targetWord,heard:"",diff:diff0,correct:false,analysis:analysis0,promptWord:cur.promptWord}]);
      queueL3WordComplete(newRes0);
      return;
    }
    var fixedHeard=normalizeDigitTranscript(heard||"",speechLang);
    var analysis=analyzePronunciation(cur.targetWord,fixedHeard,speechLang);
    var correct=analysis.overall>=75;
    var diff=pronDiff(cur.targetWord,fixedHeard);
    if(correct){
      sOk();
      if(screenR.current==="asL3play"){
        handleCorrectAnswerAssessment(cur.targetId, cur.promptWord, cur.targetWord, asDemo?demoAsProg:asProg, !!asDemo);
      } else {
        handleCorrectAnswer(cur.targetId,cur.targetWord,wordProg);
      }
      l3FailCountRef.current=0;
      setL3Fb({heard:fixedHeard,correct:true,diff:diff,analysis:analysis});
      var newResOk=l3res.concat([{expected:cur.targetWord,heard:fixedHeard,diff:diff,correct:true,analysis:analysis,promptWord:cur.promptWord}]);
      queueL3WordComplete(newResOk);
      return;
    }
    sWrong();
    l3FailCountRef.current+=1;
    if(l3FailCountRef.current<L3_SPEECH_MAX_TRIES){
      var left=L3_SPEECH_MAX_TRIES-l3FailCountRef.current;
      setL3Fb({heard:fixedHeard,correct:false,diff:diff,analysis:analysis,retry:true,triesLeft:left});
      return;
    }
    l3FailCountRef.current=0;
    setL3Fb({heard:fixedHeard,correct:false,diff:diff,analysis:analysis});
    var newResBad=l3res.concat([{expected:cur.targetWord,heard:fixedHeard,diff:diff,correct:false,analysis:analysis,promptWord:cur.promptWord}]);
    queueL3WordComplete(newResBad);
  }
  function skipL3(){
    if(!sessW.length)return;
    if(l3WaitContRef.current)return;
    stopL3Recognizer();
    processL3("__SKIP__",sessW[l3qi]);
  }

  function goDashboard(){
    clrT();
    clrL2T();
    stopL3Recognizer();
    setL3Listen(false);
    l3PendingNewResRef.current=null;
    l3WaitContRef.current=false;
    setL3WaitContinue(false);
    asCrumbleNextRef.current=null;
    setCrumbleBrickData(null);
    setScreen("start");
  }

  function continueAfterCrumble(){
    var fn=asCrumbleNextRef.current;
    asCrumbleNextRef.current=null;
    setCrumbleBrickData(null);
    if(typeof fn==="function")fn();
    else setScreen("asAllDone");
  }

  useEffect(function(){
    if(screen!=="asWallCrumble")return;
    var id=setTimeout(function(){continueAfterCrumble();},2800);
    return function(){clearTimeout(id);};
  }, [screen]);

  function skipDemoSection(){
    if(!asDemo)return;
    if(!asBatch||!asBatch.length)return;

    function bumpBatchProgress(prevMap){
      var next=Object.assign({}, prevMap||{});
      asBatch.forEach(function(r){
        if(!r)return;
        var id=String(r.id);
        if(!id||id==="undefined")return;
        var cur=(next[id]||{}).timesDone||0;
        var n=Math.min(VERIFIED_NEEDED, cur+1);
        next[id]={
          timesDone:n,
          verified:n>=VERIFIED_NEEDED,
          prompt:r.promptWord||"",
          target:r.targetWord||""
        };
      });
      return next;
    }

    // Skip ONE exercise:
    // asPlaying -> asL2play
    // asL2play  -> asL3play
    // asL3play  -> asWallCrumble (then next 10 on Continue)
    if(screenR.current==="asPlaying"||screenR.current==="asPaused"){
      try{clrT();}catch(eT){}
      setFb(null);
      setSel(null);

      var nextProgL1=bumpBatchProgress(demoAsProg||{});
      setDemoAsProg(nextProgL1);
      var builtMetaL1=buildAssessmentBatch(asRows, nextProgL1, !!asDemo);
      setAsMeta({total:builtMetaL1.total, done: builtMetaL1.total-builtMetaL1.remaining.length});

      // Move to Level 2 for the same 10-word batch.
      startAsL2();
      return;
    }

    if(screenR.current==="asL2play"){
      try{clrL2T();}catch(eL2){}
      setL2Fb(null);

      var nextProgL2=bumpBatchProgress(demoAsProg||{});
      setDemoAsProg(nextProgL2);
      var builtMetaL2=buildAssessmentBatch(asRows, nextProgL2, !!asDemo);
      setAsMeta({total:builtMetaL2.total, done: builtMetaL2.total-builtMetaL2.remaining.length});

      // Reveal words on the L2 wall (since we're skipping typing).
      var newL2Ans=(asBatch||[]).map(function(r){
        return {expected:r.targetWord, typed:r.targetWord, correct:true, timeout:false, promptWord:r.promptWord};
      });
      setL2Ans(newL2Ans);

      startAsL3();
      return;
    }

    if(screenR.current==="asL3play"){
      stopL3Recognizer();
      setL3Fb(null);
      setL3Res([]);
      l3PendingNewResRef.current=null;
      l3WaitContRef.current=false;
      setL3WaitContinue(false);

      var nextProgL3=bumpBatchProgress(demoAsProg||{});
      setDemoAsProg(nextProgL3);

      var brickSnapNowL3=getAssessmentBatchBrickData(asBatch, nextProgL3);
      var builtNextL3=buildAssessmentBatch(asRows, nextProgL3, !!asDemo);

      asCrumbleNextRef.current=function(){
        if(!builtNextL3.queue.length){
          setScreen("asAllDone");
          return;
        }
        setAsMeta({total:builtNextL3.total,done:builtNextL3.total-builtNextL3.remaining.length});
        setAsBatch(builtNextL3.batch);
        setSessW(builtNextL3.queue);
        setQi(0);tval.current=TMAX;setTimer(TMAX);
        setScore(0);setFb(null);setSel(null);setBest(0);setLpts(0);setCorrList([]);
        setL2Qi(0); setL2Inp(""); setL2Fb(null); setL2Score(0); setL2Ans([]);
        setL2Timer(TMAX_L23); l2tval.current=TMAX_L23;
        setL3Qi(0); setL3Listen(false); setL3Fb(null); setL3Res([]);
        setL3Timer(TMAX_L23);
        l3PendingNewResRef.current=null;l3WaitContRef.current=false;setL3WaitContinue(false);
        setScreen("asPlaying");
      };

      setCrumbleBrickData(brickSnapNowL3);
      setScreen("asWallCrumble");
      return;
    }
  }

  /* ════════════ SHARED SUB-COMPONENTS ════════════ */
  function getCat(){ return WORD_PAIRS_DATA[catIdx]; }
  function getCatName(){ var c=getCat(); return lang==="ES"?c.nameES:c.nameEN; }

  function GameHeader(hp){
    var subLine="sub" in hp?hp.sub:getCatName();
    return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"3px",maxWidth:"960px",width:"100%",alignSelf:"center"}}><div style={{display:"flex",alignItems:"center",gap:"10px"}}><span className="lvl-badge" style={{background:hp.color||"#000",color:"#fff"}}>{hp.badge}</span><div><h1 style={{fontFamily:QF,fontWeight:"900",fontSize:"17px",letterSpacing:".1em",textTransform:"uppercase",lineHeight:1.1}}>{hp.title}</h1><div style={{fontFamily:QF,fontSize:"9px",color:"#aaa",letterSpacing:".08em",textTransform:"uppercase",marginTop:"1px"}}>{subLine}</div></div></div><DashBackBtn onClick={goDashboard} label={g.exerciseBack}/></div>);
  }

  function Pbar(pp){
    var tot=typeof pp.total==="number"?pp.total:sessW.length;
    return(<div style={{maxWidth:"960px",width:"100%",alignSelf:"center",marginBottom:"3px"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"2px"}}><span style={{fontFamily:QF,fontSize:"9px",color:"#aaa",letterSpacing:".1em",textTransform:"uppercase"}}>{g.progTxt}</span><span style={{fontFamily:QF,fontSize:"9px",color:"#aaa"}}>{pp.cur+"/"+tot}</span></div><div style={{height:"5px",background:"#eee",borderRadius:"50px",overflow:"hidden"}}><div style={{height:"100%",width:((pp.cur/Math.max(tot,1))*100)+"%",background:"linear-gradient(90deg,"+pp.c1+","+pp.c2+")",borderRadius:"50px",transition:"width .5s ease"}}></div></div></div>);
  }

  function TimerMini(tp){var max=tp.max||TMAX;var pct=(tp.val/max)*100;var clr=tp.val<=2?"#dc2626":tp.val<=3?"#f97316":tp.color||"#555";return(<div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}><span style={{fontFamily:QF,fontSize:"9px",color:"#aaa",letterSpacing:".1em",textTransform:"uppercase",flexShrink:0}}>{g.timeLbl}</span><div style={{flex:1,height:"5px",background:"#eee",borderRadius:"50px",overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:clr,borderRadius:"50px",transition:"width 1s linear"}}></div></div><span style={{fontFamily:QF,fontSize:"13px",fontWeight:"900",color:clr,flexShrink:0,minWidth:"24px",textAlign:"right"}}>{tp.val}s</span></div>);}

  /* ═══════════════════════════════════════════════════════════
     SCREENS
     ═══════════════════════════════════════════════════════════ */

  if(screen==="assessmentLoading")return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#fff",gap:"16px"}}>
      <div className="spinner"></div>
      <div style={{fontFamily:QF,fontSize:"14px",color:"#888",letterSpacing:".06em"}}>{g.assessLoad}</div>
      {asDemo?(<div style={{fontFamily:QF,fontSize:"12px",color:"#0d9488",letterSpacing:".04em",textAlign:"center",maxWidth:"320px",padding:"0 16px"}}>{g.assessDemoBanner}</div>):null}
    </div>
  );
  if(screen==="assessmentError")return(
    <>
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#fff",gap:"16px",padding:"20px",textAlign:"center"}}>
      <div style={{fontSize:"48px"}}>⚠️</div>
      <div style={{fontFamily:QF,fontSize:"14px",color:"#555",maxWidth:"360px",lineHeight:"1.6"}}>{g.assessErr}</div>
      <RoundBtn onClick={startAssessment} filled style={{fontSize:"14px",padding:"12px 32px"}}>{g.assessRetry}</RoundBtn>
      <RoundBtn onClick={function(){setScreen("start");}} style={{fontSize:"13px",padding:"10px 24px"}}>{g.backStart}</RoundBtn>
    </div>
    {assessmentDemoFabEl}
    </>
  );
  if(screen==="assessmentEmpty")return(
    <>
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#fff",gap:"16px",padding:"24px",textAlign:"center"}}>
      <div style={{fontSize:"48px"}}>📭</div>
      <div style={{fontFamily:QF,fontSize:"15px",color:"#555",maxWidth:"400px",lineHeight:"1.6"}}>{g.assessEmpty}</div>
      <RoundBtn onClick={function(){setScreen("start");}} filled style={{fontSize:"14px",padding:"12px 32px"}}>{g.backStart}</RoundBtn>
    </div>
    {assessmentDemoFabEl}
    </>
  );
  if(screen==="asWallCrumble"){
    return(
      <>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(180deg,#ecfdf5 0%,#fff 38%,#f1f5f9 100%)",padding:"28px 20px",gap:"18px",overflow:"hidden"}}>
        <div className="wall-crumble-emoji" style={{fontSize:"48px",lineHeight:1}}>🧱</div>
        <p style={{fontFamily:QF,fontSize:"13px",fontWeight:"700",letterSpacing:".1em",textTransform:"uppercase",color:"#0f766e",textAlign:"center",maxWidth:"380px",lineHeight:1.45}}>{g.wallCrumbleHint}</p>
        <div style={{width:"100%",maxWidth:"440px",flexShrink:0}}>
          {crumbleBrickData?<WallCrumble brickData={crumbleBrickData}/>:null}
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  if(screen==="asAllDone")return(
    <>
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#fff",gap:"16px",padding:"24px",textAlign:"center"}}>
      <div style={{fontSize:"56px"}}>🏁</div>
      <div style={{fontFamily:QF,fontSize:"16px",fontWeight:"900",letterSpacing:".08em",textTransform:"uppercase"}}>{lang==="EN"?"ASSESSMENT COMPLETE":"EVALUACIÓN COMPLETA"}</div>
      <div style={{fontFamily:QF,fontSize:"14px",color:"#555",maxWidth:"420px",lineHeight:"1.6"}}>
        {lang==="EN"?"You finished all assessment words available for your account.":"Terminaste todas las palabras de evaluación disponibles para tu cuenta."}
      </div>
      <RoundBtn onClick={function(){setAsDemo(false);setAsDemoLiveList(false);setScreen("start");}} filled style={{fontSize:"14px",padding:"12px 32px"}}>{g.backStart}</RoundBtn>
    </div>
    {assessmentDemoFabEl}
    </>
  );

  if(screen==="asBatchEnd"){
    return(
      <>
      <div className="groot">
        <GameHeader badge={g.assessBadge} title={lang==="EN"?"ASSESSMENT":"EVALUACIÓN"} color="#0d9488" sub={asDemo?(asDemoLiveList?g.assessDemoLiveBanner:g.assessDemoBanner):g.assessSub}/>
        <div style={{maxWidth:"820px",width:"100%",alignSelf:"center",marginBottom:"10px"}}>
          <div style={{fontFamily:QF,fontSize:"12px",color:"#0f766e",letterSpacing:".08em",textTransform:"uppercase"}}>{lang==="EN"?"Level 1 complete":"Nivel 1 completo"}</div>
          <div style={{fontFamily:QF,fontSize:"15px",color:"#555",lineHeight:"1.6"}}>{lang==="EN"?"Next: write the answers.":"Siguiente: escribe las respuestas."}</div>
        </div>
        <div style={{maxWidth:"520px",width:"100%",alignSelf:"center",display:"flex",gap:"12px",justifyContent:"center"}}>
          <RoundBtn onClick={startAsL2} filled style={{flex:1,fontSize:"14px",padding:"14px 20px",background:"#0d9488",borderColor:"#0d9488"}}>{"✍️ "+(lang==="EN"?"START LEVEL 2":"INICIAR NIVEL 2")}</RoundBtn>
          <RoundBtn onClick={function(){setScreen("start");}} style={{fontSize:"13px",padding:"14px 16px"}}>←</RoundBtn>
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  if(screen==="asPlaying"||screen==="asPaused"){
    if(!sessW.length)return null;
    var curQ=sessW[qi]||{promptWord:"",targetWord:"",options:[]};
    var tpctA=(timer/TMAX)*100;
    var pausedA=screen==="asPaused";
    var progMapA=asDemo?demoAsProg:asProg;
    var bDataA=getAssessmentBatchBrickData(asBatch, progMapA);
    return(
      <>
      <div className="groot">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"3px",maxWidth:"960px",width:"100%",alignSelf:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span className="lvl-badge" style={{background:"#0d9488",color:"#fff"}}>{lang==="EN"?"ASSESS":"EVAL"}</span>
            <div>
              <h1 style={{fontFamily:QF,fontWeight:"900",fontSize:"17px",letterSpacing:".1em",textTransform:"uppercase",lineHeight:1.1}}>{lang==="EN"?"LEVEL 1 — MULTIPLE CHOICE":"NIVEL 1 — OPCIÓN MÚLTIPLE"}</h1>
              <div style={{fontFamily:QF,fontSize:"9px",color:"#aaa",letterSpacing:".08em",textTransform:"uppercase",marginTop:"1px"}}>
                {(asMeta?("("+asMeta.done+"/"+asMeta.total+") "):"")+(asDemo?(asDemoLiveList?g.assessDemoLiveBanner:g.assessDemoBanner):g.assessSub)}
              </div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span style={{fontFamily:QF,fontSize:"14px",fontWeight:"700"}}>{"⭐ "+score+" "+g.pts}</span>
            <button onClick={function(){if(screen==="asPlaying"){clrT();setScreen("asPaused");}else if(screen==="asPaused"){setFb(null);setScreen("asPlaying");}}} style={{width:"38px",height:"38px",borderRadius:"50%",background:"#fff",color:"#000",border:"2px solid #000",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px"}}>{pausedA?"▶":"⏸"}</button>
            {asDemo?(
              <button type="button" onClick={skipDemoSection} style={{padding:"7px 14px",borderRadius:"50px",background:"#fff",border:"2px solid #000",cursor:"pointer",fontFamily:QF,fontSize:"11px",fontWeight:"700",color:"#000",letterSpacing:".06em"}}>{g.demoSkipSection}</button>
            ):null}
            <DashBackBtn onClick={goDashboard} label={g.exerciseBack}/>
          </div>
        </div>
        <Pbar cur={qi+(fb!==null?1:0)} total={sessW.length} c1="#0f766e" c2="#14b8a6"/>
        <div style={{maxWidth:"960px",width:"100%",alignSelf:"center",display:"grid",gridTemplateColumns:"minmax(400px, 44%) 1fr",gap:"24px",alignItems:"start",marginTop:"10px"}}>
          <div style={{flex:"0 0 auto",width:"100%",minWidth:0}}>
            <Wall brickData={bDataA} curQ={qi} playing={!pausedA}/>
            <div style={{marginTop:"10px"}}>
              <TimerMini val={timer} max={TMAX} color={timer<=2?"#dc2626":"#0f766e"}/>
              <div style={{fontFamily:QF,fontSize:"10px",color:"#94a3b8"}}>{lang==="EN"?"Pick the correct translation.":"Elige la traducción correcta."}</div>
            </div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:"10px"}}>
            <div style={{border:"2px solid #0d9488",borderRadius:"16px",padding:"14px 22px",textAlign:"center",width:"100%",background:"#f0fdfa"}}>
              <div style={{fontFamily:QF,fontSize:"10px",color:"#64748b",letterSpacing:".1em",textTransform:"uppercase",marginBottom:"8px"}}>{g.qLbl+" "+(qi+1)+" "+g.ofLbl+" "+sessW.length}</div>
              <p style={{fontFamily:QF,fontSize:"26px",fontWeight:"900",letterSpacing:".06em",color:"#0f766e"}}>{curQ.promptWord}</p>
            </div>
            {pausedA?(
              <div style={{background:"#fff",border:"2px dashed #ddd",borderRadius:"16px",padding:"18px",textAlign:"center"}}>
                <div style={{fontFamily:QF,fontSize:"18px",fontWeight:"700",letterSpacing:".1em",textTransform:"uppercase"}}>{g.pauseMsg}</div>
                <div style={{fontFamily:QF,fontSize:"12px",color:"#777"}}>{g.pauseSub}</div>
                <RoundBtn onClick={function(){setFb(null);setScreen("asPlaying");}} filled style={{fontSize:"14px",padding:"12px 36px",marginTop:"10px"}}>{"▶ "+g.resumeTxt}</RoundBtn>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"repeat(2, minmax(0, 1fr))",gap:"10px"}}>
                {curQ.options.map(function(o,i){
                  var isSel=sel===o;
                  var isOk=fb==="ok"&&isSel;
                  var isWrong=fb==="wrong"&&isSel;
                  var st={
                    padding:"14px 12px",borderRadius:"14px",border:"2px solid "+(isOk?"#16a34a":isWrong?"#dc2626":"#e5e7eb"),
                    background:isOk?"#dcfce7":isWrong?"#fee2e2":"#fff",cursor:fb? "default":"pointer",
                    fontFamily:QF,fontSize:"14px",fontWeight:"800",letterSpacing:".04em",textTransform:"uppercase"
                  };
                  return(<button key={i} onClick={function(){if(fb===null)pickL1(o);}} style={st}>{o}</button>);
                })}
              </div>
            )}
            {fb?(
              <div style={{fontFamily:QF,fontSize:"12px",color:fb==="ok"?"#16a34a":"#dc2626",letterSpacing:".06em",textTransform:"uppercase",marginTop:"4px"}}>
                {fb==="ok"?(lang==="EN"?"Correct!":"¡Correcto!"):(fb==="timeout"?(lang==="EN"?"Time’s up!":"¡Tiempo!"): (lang==="EN"?"Try again":"Intenta de nuevo"))}
              </div>
            ):null}
          </div>
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  if(screen==="asL2play"){
    if(!sessW.length)return null;
    var cur2=sessW[l2qi]||{promptWord:"",targetWord:""};
    var progMapA2=asDemo?demoAsProg:asProg;
    var bDataA2=brickDataHideLabelsUnlessL2Correct(
      getAssessmentBatchBrickData(asBatch, progMapA2),
      l2RevealedNormKeys(l2ans),
      function(i){var r=(asBatch||[])[i];return r?normCheck(r.target):"";}
    );
    return(
      <>
      <div className="groot">
        <GameHeader badge={g.l2badge} title={lang==="EN"?"LEVEL 2 — WRITE":"NIVEL 2 — ESCRIBE"} color="#0d9488" sub={asDemo?(asDemoLiveList?g.assessDemoLiveBanner:g.assessDemoBanner):g.assessSub}/>
        <Pbar cur={l2qi+(l2fb!==null?1:0)} total={sessW.length} c1="#0f766e" c2="#14b8a6"/>
        {asDemo?(
          <div style={{display:"flex",justifyContent:"flex-end",maxWidth:"960px",width:"100%",alignSelf:"center",marginBottom:"6px"}}>
            <button type="button" onClick={skipDemoSection} style={{padding:"7px 14px",borderRadius:"50px",background:"#fff",border:"2px solid #000",cursor:"pointer",fontFamily:QF,fontSize:"11px",fontWeight:"700",color:"#000",letterSpacing:".06em"}}>{g.demoSkipSection}</button>
          </div>
        ):null}
        <div style={{maxWidth:"960px",width:"100%",alignSelf:"center",display:"grid",gridTemplateColumns:"minmax(400px, 44%) 1fr",gap:"24px",alignItems:"start",marginTop:"10px"}}>
          <div style={{flex:"0 0 auto",width:"100%",minWidth:0}}>
            <Wall brickData={bDataA2} curQ={l2qi} playing={true}/>
            <div style={{marginTop:"10px"}}>
              <TimerMini val={l2timer} max={TMAX_L23} color={l2timer<=2?"#dc2626":"#0f766e"}/>
              <div style={{fontFamily:QF,fontSize:"10px",color:"#94a3b8"}}>{lang==="EN"?"Type the correct translation.":"Escribe la traducción correcta."}</div>
            </div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:"10px",overflowY:"auto",paddingBottom:"10px"}}>
            <div style={{border:"2px solid #0d9488",borderRadius:"16px",padding:"14px 22px",textAlign:"center",width:"100%",background:"#f0fdfa"}}>
              <div style={{fontFamily:QF,fontSize:"10px",color:"#64748b",letterSpacing:".1em",textTransform:"uppercase",marginBottom:"8px"}}>{g.qLbl+" "+(l2qi+1)+" "+g.ofLbl+" "+sessW.length}</div>
              <p style={{fontFamily:QF,fontSize:"26px",fontWeight:"900",letterSpacing:".06em",color:"#0f766e"}}>{cur2.promptWord}</p>
            </div>
            <input className="write-inp" type="text" placeholder={g.l2ph} value={l2inp} disabled={l2fb!==null}
              onChange={function(e){setL2Inp(e.target.value);}}
              onKeyDown={function(e){if(e.key==="Enter"&&l2fb===null)checkL2(false);}}
            />
            <div style={{display:"flex",gap:"10px",width:"100%"}}>
              <RoundBtn onClick={function(){if(l2fb===null)checkL2(false);}} filled style={{flex:1,fontSize:"14px",padding:"12px 18px",background:"#0d9488",borderColor:"#0d9488"}}>{g.submitTxt}</RoundBtn>
              <RoundBtn onClick={function(){checkL2(true);}} style={{fontSize:"13px",padding:"12px 18px"}}>{g.skipTxt}</RoundBtn>
            </div>
            {l2fb?(
              <div style={{width:"100%",border:"1px solid #eee",borderRadius:"14px",padding:"12px 14px",background:"#fff"}}>
                <div style={{fontFamily:QF,fontSize:"11px",letterSpacing:".08em",textTransform:"uppercase",color:l2fb.ok?"#16a34a":"#dc2626"}}>{l2fb.ok?(lang==="EN"?"Correct":"Correcto"):(l2fb.timeout?(lang==="EN"?"Time’s up":"Tiempo"):(lang==="EN"?"Incorrect":"Incorrecto"))}</div>
                <div style={{fontFamily:QF,fontSize:"14px",fontWeight:"800",marginTop:"6px"}}>{lang==="EN"?"Answer: ":"Respuesta: "}{cur2.targetWord}</div>
              </div>
            ):null}
          </div>
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  if(screen==="asL2end"){
    var l2cA=l2ans.filter(function(a){return a.correct;}).length;
    return(
      <>
      <div className="groot" style={{justifyContent:"center"}}>
        <GameHeader badge={g.l2badge} title={lang==="EN"?"LEVEL 2 COMPLETE":"NIVEL 2 COMPLETO"} color="#0d9488" sub={asDemo?(asDemoLiveList?g.assessDemoLiveBanner:g.assessDemoBanner):g.assessSub}/>
        <div style={{maxWidth:"520px",width:"100%",alignSelf:"center",textAlign:"center",marginTop:"14px"}}>
          <div style={{fontFamily:QF,fontSize:"40px",fontWeight:"900",color:"#0f766e"}}>{l2cA+"/"+sessW.length}</div>
          <div style={{fontFamily:QF,fontSize:"13px",color:"#777"}}>{lang==="EN"?"Correct answers":"Respuestas correctas"}</div>
          <div style={{display:"flex",gap:"12px",marginTop:"18px"}}>
            <RoundBtn onClick={startAsL3} filled style={{flex:1,fontSize:"14px",padding:"14px 20px",letterSpacing:".06em",background:"#0d9488",borderColor:"#0d9488"}}>{"🎤 "+(lang==="EN"?"START LEVEL 3":"INICIAR NIVEL 3")}</RoundBtn>
            <RoundBtn onClick={function(){setScreen("start");}} style={{fontSize:"13px",padding:"14px 16px"}}>←</RoundBtn>
          </div>
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  if(screen==="l3paused")return(
    <div className="groot" style={{justifyContent:"center"}}>
      <GameHeader badge={g.l3badge} title={g.l3title} color="#7c3aed"/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"16px",padding:"32px 20px",textAlign:"center",maxWidth:"420px"}}>
        <div style={{fontFamily:QF,fontSize:"18px",fontWeight:"700",letterSpacing:".1em",textTransform:"uppercase"}}>{g.pauseMsg}</div>
        <div style={{fontFamily:QF,fontSize:"13px",color:"#777"}}>{g.pauseSub}</div>
        <RoundBtn onClick={function(){resumeL3Exercise("l3play");}} filled style={{fontSize:"14px",padding:"12px 36px"}}>{"▶ "+g.resumeTxt}</RoundBtn>
      </div>
    </div>
  );

  if(screen==="asL3paused")return(
    <>
    <div className="groot" style={{justifyContent:"center"}}>
      <GameHeader badge={g.l3badge} title={lang==="EN"?"LEVEL 3 — SPEAK":"NIVEL 3 — DI"} color="#0d9488" sub={asDemo?(asDemoLiveList?g.assessDemoLiveBanner:g.assessDemoBanner):g.assessSub}/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"16px",padding:"32px 20px",textAlign:"center",maxWidth:"420px"}}>
        <div style={{fontFamily:QF,fontSize:"18px",fontWeight:"700",letterSpacing:".1em",textTransform:"uppercase"}}>{g.pauseMsg}</div>
        <div style={{fontFamily:QF,fontSize:"13px",color:"#777"}}>{g.pauseSub}</div>
        <RoundBtn onClick={function(){resumeL3Exercise("asL3play");}} filled style={{fontSize:"14px",padding:"12px 36px",background:"#0d9488",borderColor:"#0d9488"}}>{"▶ "+g.resumeTxt}</RoundBtn>
      </div>
    </div>
    {assessmentDemoFabEl}
    </>
  );

  if(screen==="asL3play"){
    if(!sessW.length)return null;
    if(!l3sup)return(
      <>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#fff",gap:"16px",padding:"20px",textAlign:"center"}}>
        <div style={{fontSize:"52px"}}>🎤</div>
        <div style={{fontFamily:QF,fontSize:"14px",color:"#555",lineHeight:"1.6"}}>{g.l3noSupport}</div>
        <RoundBtn onClick={function(){setScreen("start");}} filled style={{fontSize:"13px",padding:"12px 32px"}}>{g.backStart}</RoundBtn>
      </div>
      {assessmentDemoFabEl}
      </>
    );
    var cur3=sessW[l3qi]||{promptWord:"",targetWord:""};
    var progMapA3=asDemo?demoAsProg:asProg;
    var bDataA3=getAssessmentBatchBrickData(asBatch, progMapA3);
    var l3ProgBarAs=l3qi+((l3WaitContinue||l3fb!==null)?1:0);
    return(
      <>
      <div className="groot">
        <GameHeader badge={g.l3badge} title={lang==="EN"?"LEVEL 3 — SPEAK":"NIVEL 3 — DI"} color="#0d9488" sub={asDemo?(asDemoLiveList?g.assessDemoLiveBanner:g.assessDemoBanner):g.assessSub}/>
        <div style={{maxWidth:"960px",width:"100%",alignSelf:"center",display:"flex",justifyContent:"flex-end",gap:"10px",marginBottom:"4px"}}>
          {asDemo?(
            <button type="button" onClick={skipDemoSection} style={{padding:"7px 14px",borderRadius:"50px",background:"#fff",border:"2px solid #000",cursor:"pointer",fontFamily:QF,fontSize:"11px",fontWeight:"700",color:"#000",letterSpacing:".06em"}}>{g.demoSkipSection}</button>
          ):null}
          <button type="button" onClick={pauseL3Exercise} style={{padding:"7px 16px",borderRadius:"50px",background:"#fff",color:"#000",border:"2px solid #000",cursor:"pointer",fontFamily:QF,fontSize:"11px",fontWeight:"700",letterSpacing:".08em"}}>{g.pauseTxt}</button>
        </div>
        <Pbar cur={l3ProgBarAs} total={sessW.length} c1="#0f766e" c2="#14b8a6"/>
        <div style={{maxWidth:"960px",width:"100%",alignSelf:"center",display:"grid",gridTemplateColumns:"minmax(400px, 44%) 1fr",gap:"24px",alignItems:"start",marginTop:"10px"}}>
          <div style={{flex:"0 0 auto",width:"100%",minWidth:0}}>
            <Wall brickData={bDataA3} curQ={l3qi} playing={!l3listen&&!l3WaitContinue}/>
            <div style={{marginTop:"10px"}}>
              <TimerMini val={l3timer} max={TMAX_L23} color={l3timer<=2?"#dc2626":"#0f766e"}/>
              <div style={{fontFamily:QF,fontSize:"10px",color:"#94a3b8"}}>{lang==="EN"?"Say the word clearly.":"Di la palabra claramente."}</div>
            </div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:"10px",overflowY:"auto",paddingBottom:"10px"}}>
            <div style={{border:"2px solid #0d9488",borderRadius:"16px",padding:"14px 22px",textAlign:"center",width:"100%",background:"#f0fdfa"}}>
              <div style={{fontFamily:QF,fontSize:"10px",color:"#64748b",letterSpacing:".1em",textTransform:"uppercase",marginBottom:"8px"}}>{g.sayLbl}</div>
              <p style={{fontFamily:QF,fontSize:"28px",fontWeight:"900",letterSpacing:".06em",color:"#0f766e"}}>{cur3.targetWord}</p>
              <p style={{fontFamily:QF,fontSize:"11px",color:"#94a3b8",marginTop:"6px"}}>{g.l3manualHint}</p>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"8px",width:"100%"}}>
              <div style={{display:"flex",gap:"10px",width:"100%",justifyContent:"center",flexWrap:"wrap",alignItems:"center"}}>
                <RoundBtn onClick={toggleL3Recording} disabled={!!l3WaitContinue} filled style={{fontSize:"14px",padding:"14px 26px",background:l3listen?"#111":"#0d9488",borderColor:l3listen?"#111":"#0d9488",opacity:l3WaitContinue?0.45:1}}>{l3listen?g.l3listening:(l3fb&&l3fb.retry?g.l3relisten:g.l3tap)}</RoundBtn>
                <RoundBtn onClick={skipL3} disabled={!!l3listen||!!l3WaitContinue} style={{fontSize:"13px",padding:"14px 18px",opacity:(l3listen||l3WaitContinue)?0.5:1}}>{g.skipTxt}</RoundBtn>
              </div>
              <p style={{fontFamily:QF,fontSize:"10px",color:"#94a3b8",margin:0,textAlign:"center",maxWidth:"340px"}}>{l3listen?g.l3tapStop:g.l3relistenHint}</p>
            </div>
            {l3fb?(
              <div style={{width:"100%",border:"1px solid #eee",borderRadius:"14px",padding:"12px 14px",background:"#fff"}}>
                <div style={{fontFamily:QF,fontSize:"11px",letterSpacing:".08em",textTransform:"uppercase",color:l3fb.correct?"#16a34a":"#dc2626"}}>{l3fb.correct?(lang==="EN"?"Correct":"Correcto"):(l3fb.skipped?(lang==="EN"?"Skipped":"Omitida"):(lang==="EN"?"Not quite":"Casi"))}</div>
                {l3fb.retry&&typeof l3fb.triesLeft==="number"?(<div style={{fontFamily:QF,fontSize:"12px",color:"#d97706",marginTop:"6px",fontWeight:"700"}}>{g.l3RetryHint(l3fb.triesLeft)}</div>):null}
                <div style={{fontFamily:QF,fontSize:"12px",color:"#555",marginTop:"6px"}}>{lang==="EN"?"Heard: ":"Escuchó: "}<b>{l3fb.heard||"—"}</b></div>
                <div style={{fontFamily:QF,fontSize:"12px",color:"#555",marginTop:"4px"}}>{lang==="EN"?"Target: ":"Meta: "}<b>{cur3.targetWord}</b></div>
                {l3WaitContinue?(<RoundBtn onClick={applyL3WordComplete} filled style={{marginTop:"14px",width:"100%",fontSize:"14px",padding:"12px 18px",background:"#0d9488",borderColor:"#0d9488"}}>{g.l3continueNext}</RoundBtn>):null}
              </div>
            ):null}
          </div>
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  if(screen==="asL3end"){
    var l3cA=l3res.filter(function(r){return r.correct;}).length;
    var progMapEnd=asDemo?demoAsProg:asProg;
    var builtEnd=buildAssessmentBatch(asRows, progMapEnd, !!asDemo);
    return(
      <>
      <div className="groot" style={{justifyContent:"center"}}>
        <GameHeader badge={g.l3badge} title={lang==="EN"?"LEVEL 3 COMPLETE":"NIVEL 3 COMPLETO"} color="#0d9488" sub={asDemo?(asDemoLiveList?g.assessDemoLiveBanner:g.assessDemoBanner):g.assessSub}/>
        <div style={{maxWidth:"520px",width:"100%",alignSelf:"center",textAlign:"center",marginTop:"14px"}}>
          <div style={{fontFamily:QF,fontSize:"40px",fontWeight:"900",color:"#0f766e"}}>{l3cA+"/"+sessW.length}</div>
          <div style={{fontFamily:QF,fontSize:"13px",color:"#777"}}>{lang==="EN"?"Pronunciation passes":"Aciertos de pronunciación"}</div>
          <div style={{fontFamily:QF,fontSize:"12px",color:"#94a3b8",marginTop:"10px"}}>
            {lang==="EN"?"Batch progress: ":"Progreso del bloque: "}{(builtEnd.total-builtEnd.remaining.length)+"/"+builtEnd.total}
          </div>
          <div style={{display:"flex",gap:"12px",marginTop:"18px"}}>
            <RoundBtn onClick={function(){
              setAsMeta({total:builtEnd.total,done:builtEnd.total-builtEnd.remaining.length});
              if(!builtEnd.queue.length){setScreen("asAllDone");return;}
              var brickSnap=getAssessmentBatchBrickData(asBatch, progMapEnd);
              asCrumbleNextRef.current=function(){
                setAsBatch(builtEnd.batch);
                setSessW(builtEnd.queue);
                setQi(0);tval.current=TMAX;setTimer(TMAX);
                setScore(0);setFb(null);setSel(null);setBest(0);setLpts(0);setCorrList([]);
                setL2Qi(0); setL2Inp(""); setL2Fb(null); setL2Score(0); setL2Ans([]);
                setL2Timer(TMAX_L23); l2tval.current=TMAX_L23;
                setL3Qi(0); setL3Listen(false); setL3Fb(null); setL3Res([]);
                setL3Timer(TMAX_L23);
                l3PendingNewResRef.current=null;l3WaitContRef.current=false;setL3WaitContinue(false);
                setScreen("asPlaying");
              };
              setCrumbleBrickData(brickSnap);
              setScreen("asWallCrumble");
            }} filled style={{flex:1,fontSize:"14px",padding:"14px 18px",background:"#0d9488",borderColor:"#0d9488"}}>
              {lang==="EN"?"NEXT 10 WORDS":"SIGUIENTES 10"}
            </RoundBtn>
            <RoundBtn onClick={function(){setScreen("start");}} style={{fontSize:"13px",padding:"14px 16px"}}>{g.backStart}</RoundBtn>
          </div>
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }
  if(screen==="assessmentPlay"){
    if(!asQueue.length)return null;
    var acur=asQueue[asQi]||{prompt:"",target:""};
    return(
      <>
      <div className="groot">
        <GameHeader badge={g.assessBadge} title={g.assessTitle} color="#0d9488" sub={asDemo?(asDemoLiveList?g.assessDemoLiveBanner:g.assessDemoBanner):g.assessSub}/>
        <Pbar cur={asQi+(asFb!==null?1:0)} total={asQueue.length} c1="#0f766e" c2="#14b8a6"/>
        <div style={{maxWidth:"820px",width:"100%",alignSelf:"center",marginBottom:"4px"}}>
          <p style={{fontFamily:QF,fontSize:"10px",color:"#888",margin:0}}>{g.assessHint}</p>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",maxWidth:"520px",width:"100%",alignSelf:"center",gap:"8px",overflowY:"auto",paddingBottom:"10px"}}>
          <div style={{border:"2px solid #0d9488",borderRadius:"16px",padding:"14px 22px",textAlign:"center",width:"100%",background:"#f0fdfa"}}>
            <div style={{fontFamily:QF,fontSize:"10px",color:"#64748b",letterSpacing:".1em",textTransform:"uppercase",marginBottom:"8px"}}>{g.qLbl+" "+(asQi+1)+" "+g.ofLbl+" "+asQueue.length}</div>
            <p style={{fontFamily:QF,fontSize:"26px",fontWeight:"900",letterSpacing:".06em",color:"#0f766e"}}>{acur.prompt}</p>
            <p style={{fontFamily:QF,fontSize:"11px",color:"#94a3b8",marginTop:"6px"}}>{g.howSay+" «"+acur.prompt+"» "+g.howSayIn}</p>
          </div>
          <input className="write-inp" type="text" placeholder={g.l2ph} value={asInp} disabled={asFb!==null}
            onChange={function(e){setAsInp(e.target.value);}}
            onKeyDown={function(e){if(e.key==="Enter"&&asFb===null)checkAssessment();}}
            autoFocus={true}
            style={{borderColor:asFb!==null?(asFb.ok?"#16a34a":"#dc2626"):"#000"}}/>
          {asFb!==null?(
            <div style={{width:"100%",padding:"12px 20px",borderRadius:"14px",textAlign:"center",background:asFb.ok?"#000":"#fff3f0",border:asFb.ok?"none":"2px solid #f5c4b5"}}>
              {asFb.ok?(<span style={{fontFamily:QF,fontWeight:"700",fontSize:"16px",color:"#fff",letterSpacing:".08em"}}>{"✓ "+g.l2ok}</span>):(<div><span style={{fontFamily:QF,fontWeight:"700",fontSize:"13px",color:"#d44e25"}}>{g.l2wrong+" "}</span><span style={{fontFamily:QF,fontWeight:"900",fontSize:"16px",color:"#d44e25"}}>{asFb.expected}</span></div>)}
            </div>
          ):(
            <RoundBtn onClick={checkAssessment} filled style={{fontSize:"15px",padding:"12px 48px",letterSpacing:".1em"}}>{g.l2check}</RoundBtn>
          )}
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }
  if(screen==="assessmentEnd"){
    var asc=asAns.filter(function(a){return a.correct;}).length;
    var aspct=asQueue.length?Math.round((asc/asQueue.length)*100):0;
    return(
      <>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",padding:"16px 20px",background:"#fff",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px",maxWidth:"600px",width:"100%",alignSelf:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span className="lvl-badge" style={{background:"#0d9488",color:"#fff"}}>{g.assessBadge}</span>
            <div><h1 style={{fontFamily:QF,fontWeight:"900",fontSize:"20px",letterSpacing:".1em",textTransform:"uppercase",lineHeight:1.1}}>{g.assessEndTitle}</h1><div style={{fontFamily:QF,fontSize:"9px",color:asDemo?"#0d9488":"#aaa",letterSpacing:".08em",textTransform:"uppercase"}}>{asDemo?(asDemoLiveList?g.assessDemoLiveBanner:g.assessDemoBanner):g.assessSub}</div></div>
          </div>
          <DashBackBtn onClick={goDashboard} label={g.exerciseBack}/>
        </div>
        <div style={{maxWidth:"600px",width:"100%",alignSelf:"center"}}>
          <div style={{textAlign:"center",marginBottom:"20px",padding:"20px",border:"3px solid "+(aspct>=80?"#16a34a":aspct>=60?"#d97706":"#dc2626"),borderRadius:"20px",background:aspct>=80?"#f0faf4":aspct>=60?"#fffbeb":"#fff8f8"}}>
            <div style={{fontFamily:QF,fontSize:"56px",fontWeight:"900",lineHeight:1,color:aspct>=80?"#16a34a":aspct>=60?"#d97706":"#dc2626"}}>{asc}</div>
            <div style={{fontFamily:QF,fontSize:"14px",color:"#555",marginTop:"4px"}}>{"/ "+asQueue.length+" — "+aspct+"%"}</div>
            <div style={{fontFamily:QF,fontSize:"11px",color:"#aaa",letterSpacing:".1em",marginTop:"4px",textTransform:"uppercase"}}>{g.l2scoreLbl}</div>
          </div>
          <div style={{marginBottom:"16px"}}>
            {asAns.map(function(a,i){return(<div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 14px",marginBottom:"6px",borderRadius:"12px",background:a.correct?"#f0faf4":"#fff8f8",border:"1px solid "+(a.correct?"#b3dfc4":"#fca5a5")}}><span style={{fontSize:"18px"}}>{a.correct?"✅":"❌"}</span><div style={{flex:1}}><div style={{fontFamily:QF,fontSize:"13px",fontWeight:"700"}}>{a.promptWord}</div><div style={{fontFamily:QF,fontSize:"11px",color:"#aaa",marginTop:"2px"}}>{g.l2typed} <strong style={{color:a.correct?"#16a34a":"#dc2626"}}>{a.typed||"—"}</strong>{!a.correct?(<span> · {g.l2expected} <strong style={{color:"#16a34a"}}>{a.expected}</strong></span>):null}</div></div></div>);})}
          </div>
          <RoundBtn onClick={function(){setAsDemo(false);setAsDemoLiveList(false);setScreen("start");}} filled style={{fontSize:"14px",padding:"14px 28px"}}>{g.assessBack}</RoundBtn>
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  /* ── LOADING ── */
  if(screen==="loading") return(
    <>
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#fff",gap:"16px"}}>
      <div className="spinner"></div>
      <div style={{fontFamily:QF,fontSize:"14px",color:"#888",letterSpacing:".06em"}}>{g.loadingTxt}</div>
    </div>
    {assessmentDemoFabEl}
    </>
  );

  /* ── LOAD ERROR ── */
  if(screen==="loadError") return(
    <>
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#fff",gap:"16px",padding:"20px",textAlign:"center"}}>
      <div style={{fontSize:"48px"}}>⚠️</div>
      <div style={{fontFamily:QF,fontSize:"14px",color:"#555",maxWidth:"360px",lineHeight:"1.6"}}>{g.loadErrTxt}</div>
      <RoundBtn onClick={function(){startCat(catIdx);}} filled style={{fontSize:"14px",padding:"12px 32px"}}>{g.loadRetry}</RoundBtn>
      <RoundBtn onClick={function(){setScreen("start");}} style={{fontSize:"13px",padding:"10px 24px"}}>{g.backStart}</RoundBtn>
    </div>
    {assessmentDemoFabEl}
    </>
  );

  /* ── CATEGORY COMPLETE ── */
  if(screen==="catComplete"){
    var hasNext = catIdx+1 < WORD_PAIRS_DATA.length;
    var allBD   = getAllBrickData(wordProg);
    return(
      <>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#fff",gap:"16px",padding:"20px",textAlign:"center",position:"relative"}}>
        {showFW?<FullWallModal allBrickData={allBD} lang={lang} verifiedLbl={g.verifiedLbl} onClose={function(){setShowFW(false);}}/>:null}
        <div style={{position:"absolute",top:"16px",right:"16px"}}><DashBackBtn onClick={goDashboard} label={g.exerciseBack}/></div>
        <div style={{fontSize:"56px"}}>🏆</div>
        <div style={{fontFamily:QF,fontWeight:"900",fontSize:"22px",letterSpacing:".1em",textTransform:"uppercase"}}>{g.catDoneTitle}</div>
        <div style={{fontFamily:QF,fontSize:"13px",color:"#555",maxWidth:"360px",lineHeight:"1.6"}}>{g.catDoneSub}</div>
        <div style={{marginTop:"8px",display:"flex",gap:"10px",flexWrap:"wrap",justifyContent:"center"}}>
          {hasNext?(<RoundBtn onClick={function(){startCat(catIdx+1);}} filled style={{fontSize:"14px",padding:"14px 32px"}}>{"▶ "+g.catDoneNext}</RoundBtn>):null}
          {!hasNext&&wallComplete&&user&&user.email?(<RoundBtn onClick={startAssessment} filled style={{fontSize:"14px",padding:"14px 24px",background:"#0d9488",borderColor:"#0d9488"}}>{g.assessCTA}</RoundBtn>):null}
          <RoundBtn onClick={function(){setScreen("start");}} style={{fontSize:"13px",padding:"13px 24px"}}>{g.catDoneBack}</RoundBtn>
        </div>
        <button onClick={function(){setShowFW(true);}} style={{marginTop:"8px",padding:"10px 24px",borderRadius:"50px",border:"2px solid #e8e8e8",background:"#fff",cursor:"pointer",fontFamily:QF,fontSize:"12px",fontWeight:"700",color:"#555"}}>
          🧱 {lang==="EN"?"SEE FULL WALL":"VER PARED COMPLETA"} ({allBD.filter(function(d){return d&&d.timesDone>=3;}).length+"/30"})
        </button>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  /* ── START ── */
  if(screen==="start") return(
    <>
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",background:"#fff",position:"relative"}}>
      <button onClick={p.onSignOut} style={{position:"absolute",top:"16px",right:"16px",display:"flex",alignItems:"center",gap:"6px",padding:"8px 16px",borderRadius:"50px",background:"#fff",border:"2px solid #e0e0e0",cursor:"pointer",fontFamily:QF,fontSize:"11px",fontWeight:"700",color:"#aaa"}} onMouseEnter={function(e){e.currentTarget.style.borderColor="#000";e.currentTarget.style.color="#000";}} onMouseLeave={function(e){e.currentTarget.style.borderColor="#e0e0e0";e.currentTarget.style.color="#aaa";}}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        {lang==="EN"?"LOG OUT":"CERRAR SESIÓN"}
      </button>
      <h1 style={{fontFamily:QF,fontWeight:"900",fontSize:"26px",letterSpacing:".14em",textAlign:"center",textTransform:"uppercase",marginBottom:"6px"}}>{g.title}</h1>
      <p style={{fontFamily:QF,fontSize:"13px",color:"#555",textAlign:"center",maxWidth:"560px",lineHeight:"1.6",marginBottom:"14px"}}>{g.sub}</p>
      <div style={{display:"flex",gap:"10px",marginBottom:"20px",flexWrap:"wrap",justifyContent:"center"}}>
        {g.rules.map(function(r){return(<div key={r[1]} style={{display:"flex",alignItems:"center",gap:"7px",padding:"8px 18px",borderRadius:"50px",border:"2px solid #e8e8e8"}}><span style={{fontSize:"17px"}}>{r[0]}</span><span style={{fontFamily:QF,fontSize:"12px",fontWeight:"700",letterSpacing:".06em",textTransform:"uppercase"}}>{r[1]}</span></div>);})}
      </div>
      <div style={{display:"flex",gap:"28px",maxWidth:"720px",width:"100%",alignItems:"flex-start",marginBottom:"24px",flexWrap:"wrap",justifyContent:"center"}}>
        <div style={{flex:"0 0 auto",width:"340px"}}><Wall brickData={Array(10).fill({timesDone:0,word:""})} curQ={-1} playing={false} brickH={42} staggerW={38}/></div>
        <div style={{flex:1,minWidth:"200px",display:"flex",flexDirection:"column",gap:"12px",paddingTop:"6px"}}>
          {g.info.map(function(it){return(<div key={it[1]} style={{display:"flex",alignItems:"flex-start",gap:"14px"}}><span style={{fontSize:"22px",lineHeight:"1",flexShrink:0}}>{it[0]}</span><span style={{fontFamily:QF,fontSize:"13px",color:"#333",lineHeight:"1.5"}}>{it[1]}</span></div>);})}
          <div style={{marginTop:"6px",padding:"10px 14px",borderRadius:"12px",background:"#f9f9f9",border:"1px solid #eee"}}>
            <div style={{fontFamily:QF,fontSize:"9px",color:"#aaa",letterSpacing:".1em",textTransform:"uppercase",marginBottom:"6px"}}>CATEGORÍAS</div>
            {WORD_PAIRS_DATA.map(function(c,ci){var colors=["#e8633a","#7c3aed","#0891b2"];return(<div key={ci} style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}><div style={{width:"10px",height:"10px",borderRadius:"2px",background:colors[ci],flexShrink:0}}></div><span style={{fontFamily:QF,fontSize:"11px",color:"#555"}}>{lang==="ES"?c.nameES:c.nameEN}</span></div>);})}
          </div>
        </div>
      </div>
      {wallComplete&&user&&user.email?(
        <div style={{width:"100%",maxWidth:"520px",marginBottom:"16px",padding:"16px 20px",borderRadius:"16px",border:"2px solid #0d9488",background:"#f0fdfa",textAlign:"center"}}>
          <div style={{fontFamily:QF,fontSize:"12px",fontWeight:"700",letterSpacing:".08em",color:"#0f766e",marginBottom:"8px",textTransform:"uppercase"}}>{g.assessBadge}</div>
          <div style={{fontFamily:QF,fontSize:"13px",color:"#334155",lineHeight:"1.5",marginBottom:"12px"}}>{g.assessIntro}</div>
          <RoundBtn onClick={startAssessment} filled style={{fontSize:"14px",padding:"12px 28px",background:"#0d9488",borderColor:"#0d9488"}}>{g.assessCTA}</RoundBtn>
        </div>
      ):null}
      <RoundBtn onClick={function(){startCat(0);}} filled style={{fontSize:"16px",padding:"15px 64px",letterSpacing:".12em"}}>{"▶ "+g.start}</RoundBtn>
    </div>
    {assessmentDemoFabEl}
    </>
  );

  /* ── RESULTS (L1) ── */
  if(screen==="results"){
    var cat=getCat();
    var bData=getCatBrickData(catIdx,wordProg,corrList);
    var verified=bData.filter(function(d){return d.timesDone>=3;}).length;
    var correct=corrList.length;
    return(
      <>
      <div style={{height:"100vh",display:"flex",flexDirection:"column",padding:"10px 16px",background:"#fff",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px",maxWidth:"960px",width:"100%",alignSelf:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span className="lvl-badge" style={{background:"#000",color:"#fff"}}>NIVEL 1</span>
            <div><h1 style={{fontFamily:QF,fontWeight:"900",fontSize:"18px",letterSpacing:".12em",textTransform:"uppercase",lineHeight:1.1}}>{g.endTitle}</h1><div style={{fontFamily:QF,fontSize:"9px",color:"#aaa",textTransform:"uppercase",letterSpacing:".08em"}}>{getCatName()}</div></div>
          </div>
          <DashBackBtn onClick={goDashboard} label={g.exerciseBack}/>
        </div>
        <div style={{display:"flex",gap:"20px",maxWidth:"960px",width:"100%",alignSelf:"center",alignItems:"flex-start",flex:1,overflow:"hidden"}}>
          <div style={{flex:1,minWidth:0}}>
            <Wall brickData={bData} curQ={-1} playing={false}/>
            <div style={{marginTop:"10px",padding:"10px 14px",borderRadius:"12px",background:"#f9f9f9",border:"1px solid #eee"}}>
              <div style={{fontFamily:QF,fontSize:"9px",color:"#aaa",letterSpacing:".1em",textTransform:"uppercase",marginBottom:"8px"}}>{g.verifiedLbl}: {verified}/10</div>
              {sessW.map(function(w,i){
                var prog2=wordProg[String(w.targetId)]||{timesDone:0};
                return(<div key={i} style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
                  <span style={{fontFamily:QF,fontSize:"12px",fontWeight:"700",flex:1,color:"#333"}}>{w.targetWord}</span>
                  <ProgressDots times={prog2.timesDone}/>
                  <span style={{fontFamily:QF,fontSize:"10px",color:"#aaa"}}>{prog2.timesDone+"/3"}</span>
                </div>);
              })}
            </div>
          </div>
          <div style={{flex:1,maxWidth:"280px",overflowY:"auto"}}>
            <div style={{textAlign:"center",marginBottom:"10px",padding:"12px",border:"2px solid #000",borderRadius:"16px"}}>
              <div style={{fontFamily:QF,fontSize:"48px",fontWeight:"900",lineHeight:1}}>{score}</div>
              <div style={{fontFamily:QF,fontSize:"10px",color:"#777",letterSpacing:".12em",marginTop:"3px",textTransform:"uppercase"}}>PUNTOS</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"10px"}}>
              {[[correct,g.corrTxt],[sessW.length-correct,g.errTxt]].map(function(it){return(<div key={it[1]} style={{textAlign:"center",padding:"8px 4px",border:"1px solid #eee",borderRadius:"10px"}}><div style={{fontFamily:QF,fontSize:"22px",fontWeight:"700"}}>{it[0]}</div><div style={{fontFamily:QF,fontSize:"9px",color:"#777",letterSpacing:".06em",marginTop:"2px",textTransform:"uppercase"}}>{it[1]}</div></div>);})}
            </div>
            <div style={{display:"flex",gap:"6px",flexDirection:"column"}}>
              <RoundBtn onClick={startL2} filled style={{fontSize:"13px",padding:"12px 16px",letterSpacing:".05em"}}>{"▶ "+g.goL2}</RoundBtn>
              <div style={{display:"flex",gap:"6px"}}>
                <RoundBtn onClick={function(){startCat(catIdx);}} style={{flex:1,fontSize:"11px",padding:"10px 8px"}}>{g.againTxt}</RoundBtn>
                <RoundBtn onClick={function(){setScreen("start");}} style={{fontSize:"11px",padding:"10px 14px"}}>←</RoundBtn>
              </div>
            </div>
          </div>
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  /* ── L2 PLAY ── */
  if(screen==="l2play"){
    if(!sessW.length)return null;
    var cur2=sessW[l2qi]||{promptWord:"",targetWord:""};
    var catForL2=WORD_PAIRS_DATA[catIdx];
    var catWall2=brickDataHideLabelsUnlessL2Correct(
      pad10(getCatBrickDataCumulative(catIdx,wordProg)),
      l2RevealedNormKeys(l2ans),
      function(i){
        var pair=catForL2.pairs[i];
        return pair?normCheck(targetWord(pair)):"";
      }
    );
    var curBrick2=getBrickIdxInCatById(catIdx, cur2.targetId);
    return(
      <div className="groot">
        <GameHeader badge={g.l2badge} title={g.l2title} color="#1d4ed8"/>
        <Pbar cur={l2qi+(l2fb!==null?1:0)} c1="#1e40af" c2="#3b82f6"/>
        <div style={{maxWidth:"960px",width:"100%",alignSelf:"center",display:"grid",gridTemplateColumns:"minmax(400px, 44%) 1fr",gap:"24px",alignItems:"start",marginTop:"10px"}}>
          <div style={{flex:"0 0 auto",width:"100%",minWidth:0}}>
            <Wall brickData={catWall2} curQ={curBrick2} playing={true}/>
            <div style={{marginTop:"10px"}}>
              <TimerMini val={l2timer} max={TMAX_L23} color="#1d4ed8"/>
              <div style={{fontFamily:QF,fontSize:"10px",color:"#94a3b8"}}>{lang==="ES"?"Escribe la traducción en inglés":"Type the translation in Spanish"}</div>
            </div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:"10px",overflowY:"auto",paddingBottom:"10px"}}>
          <div style={{border:"2px solid #1d4ed8",borderRadius:"16px",padding:"14px 22px",textAlign:"center",width:"100%",background:"#f0f4ff"}}>
            <div style={{fontFamily:QF,fontSize:"10px",color:"#6b7280",letterSpacing:".1em",textTransform:"uppercase",marginBottom:"8px"}}>{g.qLbl+" "+(l2qi+1)+" "+g.ofLbl+" "+sessW.length}</div>
            <p style={{fontFamily:QF,fontSize:"22px",fontWeight:"900",letterSpacing:".08em",color:"#1d4ed8"}}>{cur2.promptWord}</p>
            <p style={{fontFamily:QF,fontSize:"11px",color:"#9ca3af",marginTop:"6px"}}>{g.howSay+" «"+cur2.promptWord+"» "+g.howSayIn}</p>
          </div>
          <input className="write-inp" type="text" placeholder={g.l2ph} value={l2inp} disabled={l2fb!==null}
            onChange={function(e){setL2Inp(e.target.value);}}
            onKeyDown={function(e){if(e.key==="Enter"&&l2fb===null)checkL2(false);}}
            autoFocus={true}
            style={{borderColor:l2fb!==null?(l2fb.ok?"#16a34a":"#dc2626"):"#000"}}/>
          {l2fb!==null?(
            <div style={{width:"100%",padding:"12px 20px",borderRadius:"14px",textAlign:"center",background:l2fb.ok?"#000":l2fb.timeout?"#fffbeb":"#fff3f0",border:l2fb.ok?"none":l2fb.timeout?"2px solid #fde68a":"2px solid #f5c4b5"}}>
              {l2fb.ok?(<span style={{fontFamily:QF,fontWeight:"700",fontSize:"16px",color:"#fff",letterSpacing:".08em"}}>{"✓ "+g.l2ok}</span>):l2fb.timeout?(<div><span style={{fontFamily:QF,fontWeight:"700",fontSize:"13px",color:"#d97706"}}>{"⏱ "+g.toTxt+" "}</span><span style={{fontFamily:QF,fontWeight:"900",fontSize:"16px",color:"#d97706"}}>{l2fb.expected}</span></div>):(<div><span style={{fontFamily:QF,fontWeight:"700",fontSize:"13px",color:"#d44e25"}}>{g.l2wrong+" "}</span><span style={{fontFamily:QF,fontWeight:"900",fontSize:"16px",color:"#d44e25"}}>{l2fb.expected}</span></div>)}
            </div>
          ):(
            <RoundBtn onClick={function(){checkL2(false);}} filled style={{fontSize:"15px",padding:"12px 48px",letterSpacing:".1em"}}>{g.l2check}</RoundBtn>
          )}
          </div>
        </div>
      </div>
    );
  }

  /* ── L2 END ── */
  if(screen==="l2end"){
    var l2c=l2ans.filter(function(a){return a.correct;}).length;
    var l2pct=(l2c/sessW.length)*100;
    var bData2=getCatBrickData(catIdx,wordProg,corrList);
    return(
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",padding:"16px 20px",background:"#fff",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px",maxWidth:"600px",width:"100%",alignSelf:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span className="lvl-badge" style={{background:"#1d4ed8",color:"#fff"}}>{g.l2badge}</span>
            <div><h1 style={{fontFamily:QF,fontWeight:"900",fontSize:"20px",letterSpacing:".1em",textTransform:"uppercase",lineHeight:1.1}}>{g.l2endTitle}</h1><div style={{fontFamily:QF,fontSize:"9px",color:"#aaa",textTransform:"uppercase",letterSpacing:".08em"}}>{getCatName()}</div></div>
          </div>
          <DashBackBtn onClick={goDashboard} label={g.exerciseBack}/>
        </div>
        <div style={{maxWidth:"600px",width:"100%",alignSelf:"center"}}>
          <div style={{textAlign:"center",marginBottom:"20px",padding:"20px",border:"3px solid "+(l2pct>=80?"#16a34a":l2pct>=60?"#d97706":"#dc2626"),borderRadius:"20px",background:l2pct>=80?"#f0faf4":l2pct>=60?"#fffbeb":"#fff8f8"}}>
            <div style={{fontFamily:QF,fontSize:"64px",fontWeight:"900",lineHeight:1,color:l2pct>=80?"#16a34a":l2pct>=60?"#d97706":"#dc2626"}}>{l2c}</div>
            <div style={{fontFamily:QF,fontSize:"14px",color:"#555",marginTop:"4px"}}>{"/ "+sessW.length+" — "+Math.round(l2pct)+"%"}</div>
            <div style={{fontFamily:QF,fontSize:"11px",color:"#aaa",letterSpacing:".1em",marginTop:"4px",textTransform:"uppercase"}}>{g.l2scoreLbl}</div>
          </div>
          <div style={{marginBottom:"20px"}}>
            <p style={{fontFamily:QF,fontSize:"11px",fontWeight:"700",letterSpacing:".1em",textTransform:"uppercase",marginBottom:"10px",color:"#777"}}>{g.l2detailTitle}</p>
            {l2ans.map(function(a,i){return(<div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 14px",marginBottom:"6px",borderRadius:"12px",background:a.correct?"#f0faf4":"#fff8f8",border:"1px solid "+(a.correct?"#b3dfc4":"#fca5a5")}}><span style={{fontSize:"18px",flexShrink:0}}>{a.correct?"✅":"❌"}</span><div style={{flex:1,minWidth:0}}><div style={{fontFamily:QF,fontSize:"13px",fontWeight:"700",color:"#333"}}>{a.promptWord}</div><div style={{display:"flex",gap:"16px",flexWrap:"wrap",marginTop:"2px"}}><span style={{fontFamily:QF,fontSize:"11px",color:"#aaa"}}>{g.l2typed+" "}<strong style={{color:a.correct?"#16a34a":"#dc2626"}}>{a.typed||"—"}</strong></span>{!a.correct?(<span style={{fontFamily:QF,fontSize:"11px",color:"#aaa"}}>{g.l2expected+" "}<strong style={{color:"#16a34a"}}>{a.expected}</strong></span>):null}</div></div></div>);})}
          </div>
          <div style={{display:"flex",gap:"10px"}}>
            <RoundBtn onClick={startL3} filled style={{flex:1,fontSize:"14px",padding:"14px 20px",letterSpacing:".06em"}}>{"🎤 "+g.l2goL3}</RoundBtn>
            <RoundBtn onClick={function(){setScreen("start");}} style={{fontSize:"13px",padding:"14px 16px"}}>←</RoundBtn>
          </div>
        </div>
      </div>
    );
  }

  /* ── L3 PLAY ── */
  if(screen==="l3play"){
    if(!sessW.length)return null;
    var cur3=sessW[l3qi]||{promptWord:"",targetWord:""};
    var catWall3=pad10(getCatBrickDataCumulative(catIdx,wordProg));
    var curBrick3=getBrickIdxInCatById(catIdx, cur3.targetId);
    var l3ProgBarWall=l3qi+((l3WaitContinue||l3fb!==null)?1:0);
    return(
      <div className="groot">
        <GameHeader badge={g.l3badge} title={g.l3title} color="#7c3aed"/>
        <div style={{maxWidth:"960px",width:"100%",alignSelf:"center",display:"flex",justifyContent:"flex-end",marginBottom:"4px"}}>
          <button type="button" onClick={pauseL3Exercise} style={{padding:"7px 16px",borderRadius:"50px",background:"#fff",color:"#000",border:"2px solid #000",cursor:"pointer",fontFamily:QF,fontSize:"11px",fontWeight:"700",letterSpacing:".08em"}}>{g.pauseTxt}</button>
        </div>
        <Pbar cur={l3ProgBarWall} c1="#6d28d9" c2="#a78bfa"/>
        <div style={{maxWidth:"960px",width:"100%",alignSelf:"center",display:"grid",gridTemplateColumns:"minmax(400px, 44%) 1fr",gap:"24px",alignItems:"start",marginTop:"10px"}}>
          <div style={{flex:"0 0 auto",width:"100%",minWidth:0}}>
            <Wall brickData={catWall3} curQ={curBrick3} playing={!l3listen&&!l3WaitContinue}/>
            <div style={{marginTop:"10px"}}>
              <TimerMini val={l3timer} max={TMAX_L23} color="#7c3aed"/>
              <div style={{fontFamily:QF,fontSize:"10px",color:"#94a3b8"}}>{lang==="ES"?"Pronuncia la palabra claramente":"Say the word clearly"}</div>
            </div>
          </div>
        {!l3sup?(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"16px",maxWidth:"520px",alignSelf:"center",textAlign:"center"}}>
            <div style={{fontSize:"48px"}}>⚠️</div>
            <div style={{fontFamily:QF,fontSize:"14px",color:"#555",lineHeight:"1.6"}}>{g.l3noSupport}</div>
            <RoundBtn onClick={function(){setScreen("start");}} filled style={{fontSize:"13px",padding:"12px 32px"}}>{g.backStart}</RoundBtn>
          </div>
        ):(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",maxWidth:"540px",width:"100%",alignSelf:"center",gap:"8px",overflowY:"auto",paddingBottom:"10px"}}>
            <div style={{border:"2px solid #7c3aed",borderRadius:"16px",padding:"14px 22px",textAlign:"center",width:"100%",background:"#faf5ff"}}>
              <div style={{fontFamily:QF,fontSize:"10px",color:"#a78bfa",letterSpacing:".1em",textTransform:"uppercase",marginBottom:"8px"}}>{g.qLbl+" "+(l3qi+1)+" "+g.ofLbl+" "+sessW.length}</div>
              <p style={{fontFamily:QF,fontSize:"24px",fontWeight:"900",letterSpacing:".08em",color:"#7c3aed"}}>{cur3.promptWord}</p>
              <p style={{fontFamily:QF,fontSize:"11px",color:"#a78bfa",marginTop:"6px"}}>{g.howSay+" «"+cur3.promptWord+"» "+g.howSayIn}</p>
              <p style={{fontFamily:QF,fontSize:"10px",color:"#94a3b8",marginTop:"8px"}}>{g.l3manualHint}</p>
            </div>
            {l3fb===null?(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"10px"}}>
                <button type="button" className={"mic-btn"+(l3listen?" listening":"")} onClick={toggleL3Recording} disabled={!!l3WaitContinue} style={{opacity:l3WaitContinue?0.5:1}}>{l3listen?"🔴":"🎤"}</button>
                <span style={{fontFamily:QF,fontSize:"13px",color:l3listen?"#d44e25":"#aaa",fontWeight:"700",letterSpacing:".08em",textTransform:"uppercase",textAlign:"center"}}>{l3listen?g.l3listening:g.l3tap}</span>
                <span style={{fontFamily:QF,fontSize:"11px",color:"#94a3b8",textAlign:"center",maxWidth:"300px"}}>{l3listen?g.l3tapStop:g.l3relistenHint}</span>
                <RoundBtn onClick={toggleL3Recording} disabled={!!l3WaitContinue} style={{fontSize:"12px",padding:"10px 20px",opacity:l3WaitContinue?0.5:1}}>{l3listen?g.l3tapStop:g.l3tap}</RoundBtn>
                {!l3listen&&!l3WaitContinue?(<button type="button" onClick={skipL3} style={{fontFamily:QF,fontSize:"11px",color:"#ccc",background:"none",border:"none",cursor:"pointer",marginTop:"2px"}}>{g.l3skip}</button>):null}
              </div>
            ):(
              <div style={{width:"100%",display:"flex",flexDirection:"column",gap:"8px"}}>
                <div className="ph-verdict" style={{background:l3fb.correct?"#000":l3fb.retry?"#fffbeb":"#fff3f0",border:l3fb.correct?"none":l3fb.retry?"2px solid #fde68a":"2px solid #f5c4b5",color:l3fb.correct?"#fff":"#d44e25"}}>
                  {l3fb.correct?"✓ "+g.l2ok+" — "+scoreLabel(l3fb.analysis.overall,lang):(l3fb.retry&&typeof l3fb.triesLeft==="number"?g.l3RetryHint(l3fb.triesLeft):"✗ "+g.l2wrong+" "+cur3.targetWord)}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"14px",padding:"10px 14px",borderRadius:"14px",background:"#f9f9f9",border:"1px solid #eee"}}>
                  <ScoreRing value={l3fb.analysis.overall}/>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:QF,fontSize:"9px",fontWeight:"700",letterSpacing:".1em",textTransform:"uppercase",color:"#aaa",marginBottom:"6px"}}>SCORE</div>
                    <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
                      {[[g.l3accuracyLbl,l3fb.analysis.accuracy],[g.l3phoneticLbl,l3fb.analysis.phonetic],[g.l3fluencyLbl,l3fb.analysis.fluency]].map(function(it){var c=scoreColor(it[1]);return(<span key={it[0]} className="ph-sub-chip" style={{borderColor:c+"66",color:c}}>{it[0]}: <strong>{it[1]}</strong></span>);})}
                    </div>
                  </div>
                </div>
                {l3fb.heard?(<div style={{padding:"8px 14px",borderRadius:"12px",background:"#f9f9f9",border:"1px solid #eee"}}><span style={{fontFamily:QF,fontSize:"11px",color:"#aaa",textTransform:"uppercase",letterSpacing:".08em"}}>{g.l3heard+" "}</span><span style={{fontFamily:QF,fontSize:"14px",color:"#555",fontStyle:"italic"}}>"{l3fb.heard}"</span></div>):null}
                <div style={{padding:"10px 16px",borderRadius:"12px",background:"#f9f9f9",border:"1px solid #eee",textAlign:"center"}}>
                  {l3fb.diff.map(function(d,i){return(<span key={i} className={d.ok?"char-ok":"char-bad"} style={{fontFamily:QF,fontSize:"22px",letterSpacing:".08em"}}>{d.c}</span>);})}
                </div>
                {l3fb.analysis.errors&&l3fb.analysis.errors.length>0?(
                  <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                    {l3fb.analysis.errors.slice(0,2).map(function(e,ei){var bc=e.severity==="grave"?"#dc2626":e.severity==="moderado"?"#ea580c":"#d97706";return(<div key={ei} className="ph-err-row" style={{borderLeftColor:bc}}><span className="ph-err-sev" style={{color:bc}}>{e.severity}</span><span>{e.text}</span></div>);})}
                  </div>
                ):null}
                {l3fb.retry&&!l3WaitContinue?(
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"8px",marginTop:"6px"}}>
                    <RoundBtn onClick={toggleL3Recording} filled style={{fontSize:"13px",padding:"12px 22px"}}>{l3listen?g.l3listening:g.l3relisten}</RoundBtn>
                    <span style={{fontFamily:QF,fontSize:"10px",color:"#94a3b8",textAlign:"center"}}>{l3listen?g.l3tapStop:g.l3relistenHint}</span>
                  </div>
                ):null}
                {l3WaitContinue?(<RoundBtn onClick={applyL3WordComplete} filled style={{marginTop:"10px",width:"100%",fontSize:"14px",padding:"12px 18px"}}>{g.l3continueNext}</RoundBtn>):null}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    );
  }

  /* ── L3 END ── */
  if(screen==="l3end"){
    var l3c=l3res.filter(function(r){return r.correct;}).length;
    var l3pct=(l3c/sessW.length)*100;
    var avgPhS=Math.round(l3res.reduce(function(s,r){return s+(r.analysis?r.analysis.overall:0);},0)/Math.max(l3res.length,1));
    var mainColor=l3pct>=80?"#16a34a":l3pct>=60?"#d97706":"#dc2626";
    var hasNext2=catIdx+1<WORD_PAIRS_DATA.length;
    var allBD2=getAllBrickData(wordProg);
    return(
      <>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",padding:"16px 20px",background:"#fff",overflowY:"auto"}}>
        {showFW?<FullWallModal allBrickData={allBD2} lang={lang} verifiedLbl={g.verifiedLbl} onClose={function(){setShowFW(false);}}/>:null}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px",maxWidth:"720px",width:"100%",alignSelf:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span className="lvl-badge" style={{background:"#7c3aed",color:"#fff"}}>{g.l3badge}</span>
            <div><h1 style={{fontFamily:QF,fontWeight:"900",fontSize:"20px",letterSpacing:".1em",textTransform:"uppercase",lineHeight:1.1}}>{g.l3endTitle}</h1><div style={{fontFamily:QF,fontSize:"9px",color:"#aaa",textTransform:"uppercase",letterSpacing:".08em"}}>{getCatName()}</div></div>
          </div>
          <DashBackBtn onClick={goDashboard} label={g.exerciseBack}/>
        </div>
        <div style={{maxWidth:"720px",width:"100%",alignSelf:"center"}}>
          <div style={{textAlign:"center",marginBottom:"16px",padding:"20px",border:"3px solid "+mainColor,borderRadius:"24px",background:l3pct>=80?"#f0faf4":l3pct>=60?"#fffbeb":"#fff8f8"}}>
            <div style={{fontSize:"46px",marginBottom:"6px"}}>{l3pct>=80?"🏆":l3pct>=60?"👍":"💪"}</div>
            <div style={{fontFamily:QF,fontSize:"64px",fontWeight:"900",lineHeight:1,color:mainColor}}>{l3c}</div>
            <div style={{fontFamily:QF,fontSize:"14px",color:"#555",marginTop:"4px"}}>{"/ "+sessW.length+" — "+Math.round(l3pct)+"%"}</div>
            <div style={{fontFamily:QF,fontSize:"11px",color:"#aaa",letterSpacing:".1em",marginTop:"4px",textTransform:"uppercase"}}>{g.l3scoreLbl}</div>
            <div style={{marginTop:"12px",display:"inline-flex",alignItems:"center",gap:"8px",padding:"6px 20px",borderRadius:"50px",background:"rgba(124,58,237,.08)",border:"1px solid rgba(124,58,237,.2)"}}>
              <span style={{fontFamily:QF,fontSize:"11px",color:"#7c3aed",letterSpacing:".07em",textTransform:"uppercase"}}>{g.l3avgLabel}:</span>
              <span style={{fontFamily:QF,fontSize:"17px",fontWeight:"900",color:scoreColor(avgPhS)}}>{avgPhS}/100</span>
            </div>
          </div>
          <p style={{fontFamily:QF,fontSize:"12px",color:"#888",marginBottom:"12px",textAlign:"center"}}>{g.l3endSub}</p>
          {l3res.map(function(r,i){
            var rs=r.analysis?r.analysis.overall:0;var rc=scoreColor(rs);
            return(<div key={i} style={{marginBottom:"12px",padding:"14px 16px",borderRadius:"16px",border:"2px solid "+(r.correct?"#bbf7d0":"#fca5a5"),background:r.correct?"#f0fdf4":"#fff8f8"}}>
              <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px"}}>
                <span style={{fontSize:"20px",flexShrink:0}}>{r.correct?"✅":"❌"}</span>
                <div style={{flex:1}}><span style={{fontFamily:QF,fontSize:"14px",fontWeight:"900",color:"#1d4ed8"}}>{r.promptWord}</span><span style={{fontFamily:QF,fontSize:"11px",color:"#aaa",marginLeft:"8px"}}>→</span><span style={{fontFamily:QF,fontSize:"14px",fontWeight:"700",color:"#333",marginLeft:"8px"}}>{r.expected}</span></div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"2px"}}><span style={{fontFamily:QF,fontSize:"16px",fontWeight:"900",color:rc}}>{rs}/100</span><span style={{fontFamily:QF,fontSize:"9px",fontWeight:"700",letterSpacing:".07em",color:rc,textTransform:"uppercase"}}>{scoreLabel(rs,lang)}</span></div>
              </div>
              <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"10px"}}>
                {r.analysis?[[g.l3accuracyLbl,r.analysis.accuracy],[g.l3phoneticLbl,r.analysis.phonetic],[g.l3fluencyLbl,r.analysis.fluency]].map(function(it){var c=scoreColor(it[1]);return(<span key={it[0]} className="ph-sub-chip" style={{borderColor:c+"66",color:c}}>{it[0]}: <strong>{it[1]}</strong></span>);}):null}
              </div>
              <div style={{display:"flex",gap:"20px",flexWrap:"wrap",alignItems:"flex-start"}}>
                <div><span style={{fontFamily:QF,fontSize:"10px",color:"#aaa",letterSpacing:".08em",textTransform:"uppercase",display:"block",marginBottom:"4px"}}>{g.l3expectedLbl}</span><div style={{padding:"6px 14px",background:"#fff",borderRadius:"8px",border:"1px solid #e5e7eb",display:"inline-flex",gap:"1px"}}>{r.diff.map(function(d,di){return(<span key={di} className={d.ok?"char-ok":"char-bad"} style={{fontFamily:QF,fontSize:"18px",fontWeight:"700"}}>{d.c}</span>);})}</div></div>
                <div><span style={{fontFamily:QF,fontSize:"10px",color:"#aaa",letterSpacing:".08em",textTransform:"uppercase",display:"block",marginBottom:"4px"}}>{g.l3saidLbl}</span><div style={{padding:"6px 14px",background:"#fff",borderRadius:"8px",border:"1px solid #e5e7eb",fontFamily:QF,fontSize:"14px",color:r.heard?"#666":"#ccc",fontStyle:"italic"}}>{r.heard?("\""+r.heard+"\""):g.l3nothing}</div></div>
              </div>
              {r.analysis&&r.analysis.errors.length>0?(<div style={{marginTop:"10px"}}><span style={{fontFamily:QF,fontSize:"9px",fontWeight:"700",letterSpacing:".1em",textTransform:"uppercase",color:"#aaa",display:"block",marginBottom:"5px"}}>{g.l3errorsLbl}</span>{r.analysis.errors.slice(0,2).map(function(e,ei){var bc=e.severity==="grave"?"#dc2626":e.severity==="moderado"?"#ea580c":"#d97706";return(<div key={ei} className="ph-err-row" style={{borderLeftColor:bc}}><span className="ph-err-sev" style={{color:bc}}>{e.severity}</span><span>{e.text}</span></div>);})}</div>):(<div style={{marginTop:"8px",fontFamily:QF,fontSize:"11px",color:"#16a34a"}}>{g.l3noErrors}</div>)}
            </div>);
          })}
          <div style={{display:"flex",gap:"10px",marginTop:"8px",marginBottom:"8px",flexWrap:"wrap"}}>
            {hasNext2?(<RoundBtn onClick={function(){startCat(catIdx+1);}} filled style={{flex:2,fontSize:"13px",padding:"14px 16px",letterSpacing:".04em"}}>{"▶ "+g.nextCatTxt+" "+(lang==="ES"?WORD_PAIRS_DATA[catIdx+1].nameES:WORD_PAIRS_DATA[catIdx+1].nameEN)}</RoundBtn>):null}
            {!hasNext2&&wallComplete&&user&&user.email?(<RoundBtn onClick={startAssessment} filled style={{flex:2,fontSize:"13px",padding:"14px 16px",background:"#0d9488",borderColor:"#0d9488",letterSpacing:".04em"}}>{g.assessCTA}</RoundBtn>):null}
            <RoundBtn onClick={function(){startCat(catIdx);}} style={{flex:1,fontSize:"13px",padding:"13px 16px"}}>{g.againTxt}</RoundBtn>
            <RoundBtn onClick={function(){setScreen("start");}} style={{fontSize:"13px",padding:"13px 16px"}}>{g.backStart}</RoundBtn>
          </div>
          <button onClick={function(){setShowFW(true);}} style={{width:"100%",marginBottom:"24px",padding:"12px 20px",borderRadius:"50px",border:"2px solid #e8e8e8",background:"#fff",cursor:"pointer",fontFamily:QF,fontSize:"13px",fontWeight:"700",letterSpacing:".06em",color:"#555",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",transition:"all .15s"}} onMouseEnter={function(e){e.currentTarget.style.borderColor="#000";e.currentTarget.style.color="#000";}} onMouseLeave={function(e){e.currentTarget.style.borderColor="#e8e8e8";e.currentTarget.style.color="#555";}}>
            🧱 {lang==="EN"?"SEE FULL WALL":"VER PARED COMPLETA"}
            <span style={{fontSize:"10px",color:"#aaa",fontWeight:"400"}}>{"("+allBD2.filter(function(d){return d&&d.timesDone>=3;}).length+"/30)"}</span>
          </button>
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  if(screen==="demoMcEnd"){
    var dmc=corrList.length;
    var dtot=Math.max(sessW.length,1);
    var dmx=dmc===dtot?"#16a34a":dmc>=dtot/2?"#d97706":"#dc2626";
    return(
      <>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#fff",padding:"24px 20px",textAlign:"center",gap:"16px"}}>
        <span className="lvl-badge" style={{background:"#0d9488",color:"#fff"}}>{g.demoMcBadge}</span>
        <h1 style={{fontFamily:QF,fontWeight:"900",fontSize:"20px",letterSpacing:".1em",textTransform:"uppercase",margin:0,maxWidth:"400px",lineHeight:1.2}}>{g.demoMcEndTitle}</h1>
        <p style={{fontFamily:QF,fontSize:"13px",color:"#64748b",margin:0,maxWidth:"380px",lineHeight:1.5}}>{g.demoMcEndSub}</p>
        <div style={{padding:"24px 40px",borderRadius:"20px",border:"3px solid "+dmx,background:"#fafafa"}}>
          <div style={{fontFamily:QF,fontSize:"48px",fontWeight:"900",color:dmx,lineHeight:1}}>{dmc}</div>
          <div style={{fontFamily:QF,fontSize:"14px",color:"#555",marginTop:"6px"}}>{"/ "+dtot+" · "+g.corrTxt}</div>
        </div>
        <RoundBtn onClick={function(){
          /* Legacy demo flow kept for compatibility; route into new 3-level assessment batch */
          setAsDemo(true);
          var snap=(demoBankSnapshot&&demoBankSnapshot.length)?demoBankSnapshot:normalizeAssessmentRows(getAssessmentDemoWords(lang));
          setAsRows(snap);
          var built=buildAssessmentBatch(snap, demoAsProg||{}, true);
          if(!built.queue.length){setScreen("asAllDone");return;}
          setAsBatch(built.batch);
          setAsMeta({total:built.total,done:built.total-built.remaining.length});
          setSessW(built.queue);
          setQi(0);tval.current=TMAX;setTimer(TMAX);
          setScore(0);setFb(null);setSel(null);setBest(0);setLpts(0);setCorrList([]);
          setL2Qi(0); setL2Inp(""); setL2Fb(null); setL2Score(0); setL2Ans([]);
          setL2Timer(TMAX_L23); l2tval.current=TMAX_L23;
          setL3Qi(0); setL3Listen(false); setL3Fb(null); setL3Res([]);
          setL3Timer(TMAX_L23);
          l3PendingNewResRef.current=null;l3WaitContRef.current=false;setL3WaitContinue(false);
          setScreen("asPlaying");
        }} filled style={{fontSize:"14px",padding:"14px 28px",background:"#0d9488",borderColor:"#0d9488",letterSpacing:".04em"}}>{lang==="EN"?"CONTINUE":"CONTINUAR"}</RoundBtn>
        <RoundBtn onClick={function(){setScreen("start");}} style={{fontSize:"13px",padding:"12px 24px"}}>{g.backStart}</RoundBtn>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  if(screen==="demoMcPlay"||screen==="demoMcPaused"){
    if(!sessW.length)return null;
    var curQD=sessW[qi]||{promptWord:"",targetWord:"",options:[]};
    var tpctD=(timer/TMAX)*100;
    var pausedD=screen==="demoMcPaused";
    var bDataD=getDemoBankBrickData(sessW,demoWordProg,corrList);
    var demoSubBanner=asDemoLiveList?g.assessDemoLiveBanner:g.assessDemoBanner;
    return(
      <>
      <div className="groot">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"2px",maxWidth:"960px",width:"100%",alignSelf:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span className="lvl-badge" style={{background:"#0d9488",color:"#fff"}}>{g.demoMcBadge}</span>
            <div><h1 style={{fontFamily:QF,fontWeight:"900",fontSize:"17px",letterSpacing:".1em",textTransform:"uppercase",lineHeight:1.1}}>{g.demoMcHead}</h1><div style={{fontFamily:QF,fontSize:"9px",color:"#0d9488",letterSpacing:".08em",textTransform:"uppercase"}}>{demoSubBanner}</div></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span style={{fontFamily:QF,fontSize:"14px",fontWeight:"700"}}>{"⭐ "+score+" "+g.pts}</span>
            <button onClick={function(){if(screen==="demoMcPlay"){clrT();setScreen("demoMcPaused");}else if(screen==="demoMcPaused"){setFb(null);setScreen("demoMcPlay");}}} style={{width:"38px",height:"38px",borderRadius:"50%",background:"#fff",color:"#000",border:"2px solid #000",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px"}}>{pausedD?"▶":"⏸"}</button>
            <DashBackBtn onClick={goDashboard} label={g.exerciseBack}/>
          </div>
        </div>
        <div style={{maxWidth:"960px",width:"100%",alignSelf:"center",marginBottom:"3px"}}>
          <Pbar cur={qi+(fb!==null?1:0)} total={sessW.length} c1="#0f766e" c2="#14b8a6"/>
        </div>
        <div style={{display:"flex",gap:"24px",maxWidth:"960px",width:"100%",alignSelf:"center",alignItems:"flex-start",flex:1,overflow:"hidden"}}>
          <div style={{flex:"1.2 1 0",minWidth:"380px",marginTop:"18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
              <span style={{fontFamily:QF,fontSize:"11px",color:"#aaa",letterSpacing:".08em",textTransform:"uppercase"}}>{g.demoMcWallLbl}</span>
              <span style={{fontFamily:QF,fontSize:"11px",color:"#aaa"}}>{g.qLbl+" "+(qi+1)+" "+g.ofLbl+" "+sessW.length}</span>
            </div>
            <Wall brickData={bDataD} curQ={qi} playing={!pausedD}/>
          </div>
          <div style={{flex:"1 1 0",minWidth:0}}>
            {pausedD?(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"14px",border:"2px dashed #ccc",borderRadius:"20px",padding:"32px 20px"}}>
                <div style={{fontFamily:QF,fontSize:"18px",fontWeight:"700",letterSpacing:".1em",textTransform:"uppercase"}}>{g.pauseMsg}</div>
                <div style={{fontFamily:QF,fontSize:"12px",color:"#777"}}>{g.pauseSub}</div>
                <RoundBtn onClick={function(){setFb(null);setScreen("demoMcPlay");}} filled style={{fontSize:"14px",padding:"12px 36px",marginTop:"6px"}}>{"▶ "+g.resumeTxt}</RoundBtn>
              </div>
            ):(
              <div>
                <div style={{marginBottom:"6px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                    <span style={{fontFamily:QF,fontSize:"10px",color:"#aaa",letterSpacing:".1em",textTransform:"uppercase"}}>{g.timeLbl}</span>
                    <span style={{fontFamily:QF,fontSize:"16px",fontWeight:"900",color:timer<=2?"#cc0000":"#000"}}>{timer+"s"}</span>
                  </div>
                  <div style={{height:"6px",background:"#f0f0f0",borderRadius:"50px",overflow:"hidden"}}>
                    <div style={{height:"100%",width:tpctD+"%",background:timer<=2?"#cc0000":"#0d9488",borderRadius:"50px",transition:"width 1s linear"}}></div>
                  </div>
                </div>
                <div style={{border:"2px solid #0d9488",borderRadius:"16px",padding:"14px 18px",textAlign:"center",marginBottom:"6px",background:"#f0fdfa"}}>
                  <div style={{fontFamily:QF,fontSize:"10px",color:"#64748b",letterSpacing:".1em",textTransform:"uppercase",marginBottom:"6px"}}>{g.howSay}</div>
                  <div style={{fontFamily:QF,fontSize:"28px",fontWeight:"900",letterSpacing:".06em",color:"#0f766e"}}>{curQD.promptWord}</div>
                  <div style={{fontFamily:QF,fontSize:"10px",color:"#94a3b8",marginTop:"4px"}}>{g.howSayIn}</div>
                </div>
                <div style={{height:"28px",marginBottom:"6px",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50px",fontFamily:QF,fontSize:"11px",letterSpacing:".07em",fontWeight:"700",textTransform:"uppercase",background:fb==="ok"?"#000":fb?"#fff3f0":"transparent",color:fb==="ok"?"#fff":fb?"#d44e25":"transparent",border:(fb&&fb!=="ok")?"1px solid #f5c4b5":"none"}}>
                  {fb==="ok"?("✓ "+g.okTxt+" +"+lpts+" "+g.pts):null}
                  {fb==="wrong"?("✗ "+g.wrongTxt+" "+curQD.targetWord):null}
                  {fb==="timeout"?("⏱ "+g.toTxt+" "+curQD.targetWord):null}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px"}}>
                  {curQD.options.map(function(opt){
                    var isCorrect=opt===curQD.targetWord;var isSel=sel===opt;
                    var bg="#fff",cl="#000",bd="2px solid #0d9488";
                    if(fb!==null){if(isCorrect){bg="#0d9488";cl="#fff";}else if(isSel){bg="#fff3f0";cl="#d44e25";bd="2px solid #f5c4b5";}else{bg="#fafafa";cl="#ccc";bd="2px solid #e5e7eb";}}
                    return(<button key={opt+"-"+curQD.promptWord} type="button" className="abtn" onClick={function(){pickL1(opt);}} disabled={fb!==null} style={{backgroundColor:bg,color:cl,border:bd,fontWeight:"700",fontSize:"14px",padding:"9px 4px"}}>{opt}</button>);
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {assessmentDemoFabEl}
      </>
    );
  }

  /* ── L1 PLAYING ── */
  if(screen!=="playing"&&screen!=="paused")return null;
  if(!sessW.length)return null;
  var curQ  = sessW[qi]||{promptWord:"",targetWord:"",options:[]};
  var cat   = getCat();
  var tpct  = (timer/TMAX)*100;
  var paused= screen==="paused";
  var bData3= getCatBrickData(catIdx,wordProg,corrList);
  var curBrick=getBrickIdxInCatById(catIdx, curQ.targetId);

  return(
    <>
    <div className="groot">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"2px",maxWidth:"960px",width:"100%",alignSelf:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <span className="lvl-badge" style={{background:"#000",color:"#fff"}}>NIVEL 1</span>
          <div><h1 style={{fontFamily:QF,fontWeight:"900",fontSize:"17px",letterSpacing:".1em",textTransform:"uppercase",lineHeight:1.1}}>{g.title}</h1><div style={{fontFamily:QF,fontSize:"9px",color:"#aaa",textTransform:"uppercase",letterSpacing:".08em"}}>{getCatName()}</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <span style={{fontFamily:QF,fontSize:"14px",fontWeight:"700"}}>{"⭐ "+score+" "+g.pts}</span>
          <button onClick={function(){if(screen==="playing"){clrT();setScreen("paused");}else if(screen==="paused"){setFb(null);setScreen("playing");}}} style={{width:"38px",height:"38px",borderRadius:"50%",background:"#fff",color:"#000",border:"2px solid #000",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px"}}>{paused?"▶":"⏸"}</button>
          <DashBackBtn onClick={goDashboard} label={g.exerciseBack}/>
        </div>
      </div>
      <div style={{maxWidth:"960px",width:"100%",alignSelf:"center",marginBottom:"3px"}}>
        <Pbar cur={qi+(fb!==null?1:0)} c1="#a83b1a" c2="#e8633a"/>
      </div>
      <div style={{display:"flex",gap:"24px",maxWidth:"960px",width:"100%",alignSelf:"center",alignItems:"flex-start",flex:1,overflow:"hidden"}}>
        {/* Left: wall */}
        <div style={{flex:"1.2 1 0",minWidth:"380px",marginTop:"18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
            <span style={{fontFamily:QF,fontSize:"11px",color:"#aaa",letterSpacing:".08em",textTransform:"uppercase"}}>MURO</span>
            <span style={{fontFamily:QF,fontSize:"11px",color:"#aaa"}}>{g.qLbl+" "+(qi+1)+" "+g.ofLbl+" "+sessW.length}</span>
          </div>
          <Wall brickData={bData3} curQ={curBrick} playing={!paused}/>
        </div>
        {/* Right: question */}
        <div style={{flex:"1 1 0",minWidth:0}}>
          {paused?(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"14px",border:"2px dashed #ccc",borderRadius:"20px",padding:"32px 20px"}}>
              <div style={{fontFamily:QF,fontSize:"18px",fontWeight:"700",letterSpacing:".1em",textTransform:"uppercase"}}>{g.pauseMsg}</div>
              <div style={{fontFamily:QF,fontSize:"12px",color:"#777"}}>{g.pauseSub}</div>
              <RoundBtn onClick={function(){setFb(null);setScreen("playing");}} filled style={{fontSize:"14px",padding:"12px 36px",marginTop:"6px"}}>{"▶ "+g.resumeTxt}</RoundBtn>
            </div>
          ):(
            <div>
              {/* Timer */}
              <div style={{marginBottom:"6px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                  <span style={{fontFamily:QF,fontSize:"10px",color:"#aaa",letterSpacing:".1em",textTransform:"uppercase"}}>{g.timeLbl}</span>
                  <span style={{fontFamily:QF,fontSize:"16px",fontWeight:"900",color:timer<=2?"#cc0000":"#000"}}>{timer+"s"}</span>
                </div>
                <div style={{height:"6px",background:"#f0f0f0",borderRadius:"50px",overflow:"hidden"}}>
                  <div style={{height:"100%",width:tpct+"%",background:timer<=2?"#cc0000":"#000",borderRadius:"50px",transition:"width 1s linear"}}></div>
                </div>
              </div>
              {/* Question: show prompt word */}
              <div style={{border:"2px solid #000",borderRadius:"16px",padding:"14px 18px",textAlign:"center",marginBottom:"6px"}}>
                <div style={{fontFamily:QF,fontSize:"10px",color:"#aaa",letterSpacing:".1em",textTransform:"uppercase",marginBottom:"6px"}}>{g.howSay}</div>
                <div style={{fontFamily:QF,fontSize:"28px",fontWeight:"900",letterSpacing:".06em",color:"#000"}}>{curQ.promptWord}</div>
                <div style={{fontFamily:QF,fontSize:"10px",color:"#aaa",marginTop:"4px"}}>{g.howSayIn}</div>
              </div>
              {/* Feedback */}
              <div style={{height:"28px",marginBottom:"6px",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50px",fontFamily:QF,fontSize:"11px",letterSpacing:".07em",fontWeight:"700",textTransform:"uppercase",background:fb==="ok"?"#000":fb?"#fff3f0":"transparent",color:fb==="ok"?"#fff":fb?"#d44e25":"transparent",border:(fb&&fb!=="ok")?"1px solid #f5c4b5":"none"}}>
                {fb==="ok"?("✓ "+g.okTxt+" +"+lpts+" "+g.pts):null}
                {fb==="wrong"?("✗ "+g.wrongTxt+" "+curQ.targetWord):null}
                {fb==="timeout"?("⏱ "+g.toTxt+" "+curQ.targetWord):null}
              </div>
              {/* Options — 2 columns, up to 10 buttons */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px"}}>
                {curQ.options.map(function(opt,oi){
                  var isCorrect=opt===curQ.targetWord;var isSel=sel===opt;
                  var bg="#fff",cl="#000",bd="2px solid #000";
                  if(fb!==null){if(isCorrect){bg="#000";cl="#fff";}else if(isSel){bg="#fff3f0";cl="#d44e25";bd="2px solid #f5c4b5";}else{bg="#fafafa";cl="#ccc";bd="2px solid #efefef";}}
                  return(<button key={opt} className="abtn" onClick={function(){pickL1(opt);}} disabled={fb!==null} style={{backgroundColor:bg,color:cl,border:bd,fontWeight:"700",fontSize:"14px",padding:"9px 4px"}}>{opt}</button>);
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    {assessmentDemoFabEl}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   ROOT
   ═══════════════════════════════════════════════════════════ */
function Root(){
  var _sc=useState("splash");var screen=_sc[0];var setScreen=_sc[1];
  var _u=useState(null);var user=_u[0];var setUser=_u[1];
  var _pr=useState(null);var profile=_pr[0];var setProfile=_pr[1];
  var _al=useState("ES");var aLang=_al[0];var setALang=_al[1];
  var _rd=useState(false);var isReady=_rd[0];var setIsReady=_rd[1];
  var isEmbedded=typeof window!=="undefined"&&window!==window.parent;
  var parentOrigin=import.meta.env.VITE_PARENT_ORIGIN||"";
  function togLang(){setALang(function(l){return l==="ES"?"EN":"ES";});}
  useEffect(function(){
    function handleMessage(event){
      var originOk=parentOrigin?event.origin===parentOrigin:event.origin===window.location.origin;
      if(!originOk)return;
      if(event.data&&event.data.type==="AUTH"&&event.data.token){
        signInWithCustomToken(auth,event.data.token).then(function(){
          console.log("Auto login successful");
        }).catch(function(err){
          console.error("Auto login failed",err);
          if(isEmbedded)setIsReady(true);
        });
      }
    }
    window.addEventListener("message",handleMessage);
    return function(){window.removeEventListener("message",handleMessage);};
  },[isEmbedded,parentOrigin]);
  useEffect(function(){
    if(window.fbAuthReady){
      var unsub=window.fbAuthReady(function(u){
        if(u){
          setUser(u);
          var gp=window.fbGetProfile?window.fbGetProfile(u.uid):Promise.resolve(null);
          gp.then(function(pr){setProfile(pr);setScreen("game");setIsReady(true);});
          return;
        }
        if(!isEmbedded)setIsReady(true);
      });
      return function(){if(unsub)unsub();};
    }
    setIsReady(true);
  },[isEmbedded]);
  if(!isReady)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:QF,fontSize:"14px",letterSpacing:".08em",color:"#666"}}>Loading...</div>);
  if(screen==="splash")return(<Splash onDone={function(){setScreen("login");}}/>);
  if(isEmbedded&&screen==="login")return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:QF,fontSize:"14px",letterSpacing:".08em",color:"#666"}}>Waiting for secure sign-in...</div>);
  if(screen==="login")return(<Login lang={aLang} onLang={togLang} onLogin={function(u){setUser(u);var gp=window.fbGetProfile?window.fbGetProfile(u.uid):Promise.resolve(null);gp.then(function(pr){setProfile(pr);setScreen("game");});}}/>);
  if(isEmbedded&&screen==="register")return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:QF,fontSize:"14px",letterSpacing:".08em",color:"#666"}}>Waiting for secure sign-in...</div>);
  if(screen==="register")return(<Register lang={aLang} onLang={togLang} onDone={function(u,pd){setUser(u);setProfile(pd);setScreen("game");setIsReady(true);}} onLogin={function(){setScreen("login");}}/>);
  return(<Game user={user} profile={profile} onSignOut={function(){if(window.fbSignOut)window.fbSignOut();setUser(null);setProfile(null);setScreen("login");}}/>);
}

export default Root;
