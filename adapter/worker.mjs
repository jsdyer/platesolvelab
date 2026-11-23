/* Optional dedicated owner adapter. Deploy manually; never add this key to web/. */
import {fromProvider,jobId,publicImageUrl} from '../web/model.mjs';
import {OWNER_PAGE} from './owner-page.mjs';
const BASE='https://nova.astrometry.net';let cachedKeys=null;
async function boundedText(response,max=2000000){const reader=response.body?.getReader();if(!reader)return '';const chunks=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();throw fail('Provider metadata exceeded the size limit.',502);}chunks.push(value);}return new Blob(chunks).text();}
function fail(message,status=400){return Object.assign(new Error(message),{status});}
function decode(part){try{return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));}catch{throw fail('Invalid Access token.',401);}}
export async function authenticate(request,env){
 const issuer=`https://${env.CF_ACCESS_TEAM_DOMAIN}`;
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.CF_ACCESS_TEAM_DOMAIN||'')||!env.CF_ACCESS_AUD||!env.OWNER_EMAIL)throw fail('Owner Access configuration is incomplete.',503);
 const jwt=request.headers.get('Cf-Access-Jwt-Assertion')||'';if(jwt.length>20000)throw fail('Invalid Access token.',401);const parts=jwt.split('.');if(parts.length!==3)throw fail('Sign in through the configured owner Access application.',401);
 const header=decode(parts[0]),claims=decode(parts[1]);const now=Date.now()/1000;
 if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==issuer||typeof claims.exp!=='number'||claims.exp<=now||claims.nbf>now+30||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(env.CF_ACCESS_AUD)||typeof claims.email!=='string'||claims.email.toLowerCase()!==env.OWNER_EMAIL.toLowerCase())throw fail('Access identity is not authorized for this owner adapter.',403);
 if(!cachedKeys||cachedKeys.issuer!==issuer||Date.now()>cachedKeys.until){const r=await fetch(`${issuer}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw fail('Could not validate owner Access identity.',503);cachedKeys={issuer,until:Date.now()+600000,keys:JSON.parse(await boundedText(r,200000)).keys};}
 const jwk=cachedKeys.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw fail('Unknown Access signing key. Retry after key-cache expiry.',401);
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);let bytes;try{bytes=Uint8Array.from(atob(parts[2].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}catch{throw fail('Invalid signature.',401);}
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes,new TextEncoder().encode(`${parts[0]}.${parts[1]}`)))throw fail('Invalid Access signature.',401);
}
async function provider(path,payload,multipart){const options={signal:AbortSignal.timeout(40000),redirect:'error'};if(payload){options.method='POST';options.body=multipart?payload:new URLSearchParams({'request-json':JSON.stringify(payload)});}const r=await fetch(BASE+path,options);if(!r.ok)throw fail(`Astrometry returned HTTP ${r.status}.`,502);const text=await boundedText(r);let data;try{data=JSON.parse(text);}catch{throw fail('Astrometry returned an unexpected response.',502);}if(data.status==='error')throw fail('Astrometry rejected the request. Check the configured account and image options.',502);return data;}
async function result(id){const [info,cal]=await Promise.all([provider(`/api/jobs/${id}/info/`),provider(`/api/jobs/${id}/calibration/`)]);return fromProvider(id,info,cal);}
async function limitedForm(request){const max=11*1024*1024;if(Number(request.headers.get('content-length'))>max)throw fail('Maximum image size is 10 MB.',413);const reader=request.body?.getReader();if(!reader)throw fail('No upload body.');let size=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw fail('Maximum image size is 10 MB.',413);}chunks.push(value);}return new Response(new Blob(chunks),{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData();}
export default {async fetch(request,env){
 const origin=request.headers.get('Origin'),allowed=env.ALLOWED_ORIGIN||'https://coolcode.ca',ownOrigin=new URL(request.url).origin;const originAllowed=origin===allowed||origin===ownOrigin;const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(originAllowed)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'});
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 try{
  if(origin&&!originAllowed)throw fail('Origin is not allowed.',403);
  if(request.method==='OPTIONS'){headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type';headers['Access-Control-Max-Age']='600';return new Response(null,{status:204,headers});}
  await authenticate(request,env);
  const path=new URL(request.url).pathname;let m;
  if(request.method==='GET'&&path==='/'){const nonce=crypto.randomUUID();return new Response(OWNER_PAGE.replaceAll('{{NONCE}}',nonce),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
  if(request.method==='GET'&&(m=path.match(/^\/api\/job\/(\d{1,12})$/)))return json(await result(jobId(m[1])));
  if(request.method==='GET'&&(m=path.match(/^\/api\/submission\/(\d{1,12})$/))){const data=await provider(`/api/submissions/${jobId(m[1])}`);const jobs=(data.jobs||[]).filter(Boolean).slice(0,5);const infos=await Promise.all(jobs.map(id=>provider(`/api/jobs/${jobId(id)}/info/`)));const solved=infos.findIndex(x=>x.status==='success');if(solved>=0)return json({receipt:await result(jobId(jobs[solved]))});return json({pending:true,failed:jobs.length>0&&Boolean(data.processing_finished)&&infos.every(x=>x.status==='failure')});}
  if(request.method==='POST'&&path==='/api/solve'){
   if(!originAllowed)throw fail('Uploads must come from this owner portal or the configured application origin.',403);
   if(!env.ASTROMETRY_API_KEY)throw fail('Owner API key is not configured.',503);
   const form=await limitedForm(request);if(form.get('consent')!=='yes')throw fail('Submission permission is required.');const file=form.get('file'),url=String(form.get('url')||'');if(Boolean(file)===Boolean(url))throw fail('Choose one file or one image URL.');
   const options={publicly_visible:'n',allow_commercial_use:'n',allow_modifications:'n',downsample_factor:2};const lo=form.get('scale_lower'),hi=form.get('scale_upper');if(lo||hi){if(!(Number(lo)>0&&Number(hi)>Number(lo)&&Number(hi)<=180))throw fail('Invalid field width bounds.');Object.assign(options,{scale_units:'degwidth',scale_type:'ul',scale_lower:Number(lo),scale_upper:Number(hi)});}
   if(file&&(!(file instanceof File)||file.size>10485760||file.size===0||!/\.(jpe?g|png|fits?|fts)$/i.test(file.name)))throw fail('Choose a JPEG, PNG or FITS photo under 10 MB.');if(url)options.url=publicImageUrl(url);
   const login=await provider('/api/login',{apikey:env.ASTROMETRY_API_KEY});if(!login.session)throw fail('The owner API key did not authenticate.',502);options.session=login.session;
   let submitted;if(file){const upload=new FormData();upload.append('request-json',JSON.stringify(options));upload.append('file',file,file.name.slice(0,100));submitted=await provider('/api/upload',upload,true);}else submitted=await provider('/api/url_upload',options);
   return json({subid:jobId(submitted.subid)});
  }
  return json({error:'Route not found.'},404);
 }catch(e){return json({error:e.status?e.message:'The owner service could not complete the request. Existing receipts are unchanged.'},e.status||502);}
}};
