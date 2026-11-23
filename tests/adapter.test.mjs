import test from 'node:test';import assert from 'node:assert/strict';import worker,{authenticate} from '../adapter/worker.mjs';
const env={ALLOWED_ORIGIN:'https://coolcode.ca',CF_ACCESS_TEAM_DOMAIN:'owner.cloudflareaccess.com',CF_ACCESS_AUD:'aud',OWNER_EMAIL:'owner@example.com'};
test('adapter refuses unauthenticated reads and writes',async()=>{for(const path of ['/api/job/1493115','/api/solve']){const res=await worker.fetch(new Request(`https://api.example.com${path}`,{headers:{Origin:env.ALLOWED_ORIGIN}}),env);assert.equal(res.status,401);assert.ok(!(await res.text()).includes('apikey'));}});
test('adapter rejects foreign origin and config without owner restriction',async()=>{let r=await worker.fetch(new Request('https://api.example.com/api/solve',{method:'POST',headers:{Origin:'https://evil.example'}}),env);assert.equal(r.status,403);await assert.rejects(()=>authenticate(new Request('https://api.example.com'),{}),/incomplete/);});
test('only preflight bypasses auth, with exact origin and credentials',async()=>{const r=await worker.fetch(new Request('https://api.example.com/api/solve',{method:'OPTIONS',headers:{Origin:env.ALLOWED_ORIGIN}}),env);assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),env.ALLOWED_ORIGIN);assert.equal(await r.text(),'');});
test('signed owner token authorizes and forged signature is refused; upload defaults remain private',async t=>{
 const {readFile}=await import('node:fs/promises');const example=JSON.parse(await readFile(new URL('../web/data/example.json',import.meta.url)));
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test-key';
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const body=encode({alg:'RS256',kid:'test-key'})+'.'+encode({iss:'https://owner.cloudflareaccess.com',aud:['aud'],email:env.OWNER_EMAIL,exp:Date.now()/1000+3600,nbf:Date.now()/1000-10});const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(body))).toString('base64url');const token=body+'.'+signature;let uploaded;
 t.mock.method(globalThis,'fetch',async(url,options)=>{const p=new URL(url).pathname;if(p==='/cdn-cgi/access/certs')return Response.json({keys:[jwk]});if(p.endsWith('/info/'))return Response.json({status:'success',calibration:example.calibration,original_filename:example.name,objects_in_field:example.objects});if(p.endsWith('/calibration/'))return Response.json(example.calibration);if(p==='/api/login')return Response.json({status:'success',session:'secret-session'});if(p==='/api/url_upload'){uploaded=JSON.parse(options.body.get('request-json'));return Response.json({status:'success',subid:123});}throw Error('Unexpected request');});
 const authHeaders={'Origin':env.ALLOWED_ORIGIN,'Cf-Access-Jwt-Assertion':token};let r=await worker.fetch(new Request('https://api.example.com/api/job/1493115',{headers:authHeaders}),env);assert.equal(r.status,200);assert.equal((await r.json()).jobId,'1493115');
 r=await worker.fetch(new Request('https://api.example.com/',{headers:{'Cf-Access-Jwt-Assertion':token}}),env);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(r.headers.get('Content-Security-Policy'),/script-src 'nonce-/);const portal=await r.text();assert.ok(portal.includes('Upload a sky photograph'));assert.ok(!portal.includes('{{NONCE}}'));assert.ok(!portal.includes('secret-session'));
 const forged=body+'.'+signature.slice(0,20)+(signature[20]==='A'?'B':'A')+signature.slice(21);r=await worker.fetch(new Request('https://api.example.com/api/job/1493115',{headers:{...authHeaders,'Cf-Access-Jwt-Assertion':forged}}),env);assert.equal(r.status,401);
 const form=new FormData();form.append('url','https://images.example.org/sky.jpg');form.append('consent','yes');r=await worker.fetch(new Request('https://api.example.com/api/solve',{method:'POST',headers:authHeaders,body:form}),{...env,ASTROMETRY_API_KEY:'test-only-placeholder'});assert.equal(r.status,200);assert.deepEqual(await r.json(),{subid:'123'});assert.equal(uploaded.publicly_visible,'n');assert.equal(uploaded.allow_commercial_use,'n');assert.equal(uploaded.allow_modifications,'n');assert.equal(uploaded.session,'secret-session');
 const ownForm=new FormData();ownForm.append('url','https://images.example.org/sky.jpg');ownForm.append('consent','yes');r=await worker.fetch(new Request('https://api.example.com/api/solve',{method:'POST',headers:{...authHeaders,Origin:'https://api.example.com'},body:ownForm}),{...env,ASTROMETRY_API_KEY:'test-only-placeholder'});assert.equal(r.status,200);assert.deepEqual(await r.json(),{subid:'123'});
});

test('paste-ready dashboard worker has no module dependencies and fails closed',async()=>{const {default:dashboard}=await import('../adapter/worker-dashboard.mjs');const r=await dashboard.fetch(new Request('https://api.example.com/'),env);assert.equal(r.status,401);});

async function signedFixture(t,team,provider){
 const config={...env,CF_ACCESS_TEAM_DOMAIN:`${team}.cloudflareaccess.com`,ASTROMETRY_API_KEY:'test-key-not-for-disclosure'};
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid=team;
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const sign=async(changes={})=>{const data=encode({alg:'RS256',kid:team})+'.'+encode({iss:`https://${config.CF_ACCESS_TEAM_DOMAIN}`,aud:[config.CF_ACCESS_AUD],email:config.OWNER_EMAIL,exp:Date.now()/1000+3600,nbf:Date.now()/1000-10,...changes});return data+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(data))).toString('base64url');};
 t.mock.method(globalThis,'fetch',async(url,options)=>new URL(url).pathname==='/cdn-cgi/access/certs'?Response.json({keys:[jwk]}):provider(url,options));
 return {config,sign,headers:{Origin:'https://api.example.com','Cf-Access-Jwt-Assertion':await sign()}};
}

test('real multipart File upload is forwarded with private options and no secret response fields',async t=>{
 let forwarded,optionsSeen;
 const fixture=await signedFixture(t,'file-upload-check',async(url,options)=>{
  const path=new URL(url).pathname;
  if(path==='/api/login')return Response.json({status:'success',session:'test-private-session'});
  assert.equal(path,'/api/upload');assert.ok(options.body instanceof FormData);
  forwarded=options.body.get('file');optionsSeen=JSON.parse(options.body.get('request-json'));
  return Response.json({status:'success',subid:456});
 });
 const form=new FormData();form.append('file',new File(['synthetic image bytes'], 'sky-field.jpg',{type:'image/jpeg'}));form.append('consent','yes');
 const response=await worker.fetch(new Request('https://api.example.com/api/solve',{method:'POST',headers:fixture.headers,body:form}),fixture.config);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{subid:'456'});
 assert.ok(forwarded instanceof File);assert.equal(forwarded.name,'sky-field.jpg');assert.equal(forwarded.type,'image/jpeg');assert.equal(await forwarded.text(),'synthetic image bytes');
 assert.equal(optionsSeen.session,'test-private-session');assert.equal(optionsSeen.publicly_visible,'n');assert.equal(optionsSeen.allow_commercial_use,'n');assert.equal(optionsSeen.allow_modifications,'n');
});

test('string-valued file fields, including empty strings, are rejected before provider calls',async t=>{
 let calls=0;
 const fixture=await signedFixture(t,'malformed-upload-check',async()=>{calls++;throw Error('Provider must not be called');});
 for(const value of ['sky-field.jpg','']){
  const form=new FormData();form.append('file',value);form.append('url','https://images.example.org/sky.jpg');form.append('consent','yes');
  const response=await worker.fetch(new Request('https://api.example.com/api/solve',{method:'POST',headers:fixture.headers,body:form}),fixture.config);
  assert.equal(response.status,400);assert.match((await response.json()).error,/file field must contain an uploaded/);
 }
 assert.equal(calls,0);
});

test('signed Access diagnostics distinguish binding and session problems without echoing claim values',async t=>{
 let calls=0;
 const fixture=await signedFixture(t,'signed-diagnostic-check',async()=>{calls++;throw Error('Provider must not be called');});
 for(const [change,expected] of [
  [{iss:'https://another-team.cloudflareaccess.com'},/Access team mismatch.*CF_ACCESS_TEAM_DOMAIN/],
  [{aud:['private-audience-not-for-disclosure']},/Access application mismatch.*CF_ACCESS_AUD/],
  [{email:'private-identity@example.net'},/Owner email mismatch.*OWNER_EMAIL/],
  [{email:null},/Access identity has no email/],
  [{exp:Date.now()/1000-100},/Access session expired/],
  [{nbf:Date.now()/1000+600},/Access session is not active yet/]
 ]){
  const response=await worker.fetch(new Request('https://api.example.com/api/job/1493115',{headers:{...fixture.headers,'Cf-Access-Jwt-Assertion':await fixture.sign(change)}}),fixture.config);
  const message=await response.text();assert.equal(response.status,403);assert.match(message,expected);assert.ok(!message.includes('private-audience'));assert.ok(!message.includes('private-identity'));assert.ok(!message.includes('another-team'));assert.ok(!message.includes('test-key-not-for-disclosure'));
 }
 const valid=await fixture.sign({aud:['private-audience-not-for-disclosure']});const parts=valid.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
 const response=await worker.fetch(new Request('https://api.example.com/api/job/1493115',{headers:{...fixture.headers,'Cf-Access-Jwt-Assertion':parts.join('.')}}),fixture.config);
 assert.equal(response.status,401);const message=await response.text();assert.match(message,/Invalid Access signature/);assert.ok(!message.includes('CF_ACCESS_AUD'));assert.equal(calls,0);
});
