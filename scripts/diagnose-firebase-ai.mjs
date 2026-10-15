import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';

// Safe diagnostic; no teacher credentials, students' work, or API keys are printed.
// This tests AI Logic's endpoint using a minimal token-count request.
// It cannot attest App Check tokens originating from a real user's browser.
const cfg=JSON.parse(readFileSync(new URL('../firebase-applet-config.json',import.meta.url),'utf8'));
const app=initializeApp(cfg,'ai-logic-check');
const ai=getAI(app,{backend:new GoogleAIBackend()});
const model=getGenerativeModel(ai,{model:'gemini-3.1-flash-lite'});
let classification='UNKNOWN';
try {
 const result=await Promise.race([
  model.countTokens('Kiểm tra kỹ thuật, không chứa dữ liệu học sinh.'),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('diagnostic timeout')),25000))
 ]);
 classification='TOKEN_COUNT_SUCCEEDED';
 console.log('AI_LOGIC_ENDPOINT_STATUS='+classification);
 console.log('COUNTED_TOKENS='+String(result.totalTokens));
} catch(e) {
 const message=String(e?.message||'');
 const code=String(e?.code||'');
 const safe=`${code} ${message}`.toLowerCase();
 if (/service_disabled|api.*not.*used|api.*not.*enabled|firebase ai logic api.*disabled|api.*disabled/.test(safe)) classification='API_DISABLED';
 else if (/genai config not found|not set up.*gemini|developer api.*not.*configured/.test(safe)) classification='GEMINI_BACKEND_NOT_CONFIGURED';
 else if (/app.?check|attestation|recaptcha/.test(safe)) classification='APP_CHECK_DENIED_OR_MISSING';
 else if (/api.*key.*block|api.*key.*restrict|requests to this api.*blocked/.test(safe)) classification='API_KEY_RESTRICTED';
 else if (/model.*not.*found|404.*model/.test(safe)) classification='MODEL_NOT_AVAILABLE';
 else if (/permission_denied|permission denied|http.*403| 403 /.test(safe)) classification='PERMISSION_DENIED_UNSPECIFIED';
 else if (/timeout/.test(safe)) classification='TIMEOUT';
 else if (/fetch|network/.test(safe)) classification='NETWORK_ERROR';
 console.log('AI_LOGIC_ENDPOINT_STATUS='+classification);
 console.log('SDK_ERROR_CODE='+code.replace(/[^a-zA-Z0-9_./:-]/g,'').slice(0,60));
 console.log('ERROR_HTTP_STATUS='+String(e?.status||e?.customData?.httpStatus||'unknown').replace(/[^0-9]/g,'').slice(0,3));
 console.log('NOTE=This probe has no reCAPTCHA token and cannot prove student-facing AI works.');
} finally {await deleteApp(app);}

// Live recheck after Firebase AI Logic setup change, 2026-10-15 15:08 VN.
