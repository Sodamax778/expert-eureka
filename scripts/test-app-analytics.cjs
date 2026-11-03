const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,imports={},extras={}){const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>imports[name]??require(name),Buffer,console,URL,Date,Set,Map,...extras},{filename:file});return module.exports;}
const model=load('lib/app-analytics.ts'),now=Date.now(),installation=crypto.randomUUID(),salt='test-salt-'.repeat(6),token='test-admin-'.repeat(5);
const event=(name='app_active',extra={})=>({id:crypto.randomUUID(),at:now,name,template:'none',mode:'none',outcome:'none',...extra});
const batch=(events=[event()],id=installation)=>({installation:id,version:'0.6.0-local',events});
let checks=0;function check(name,fn){fn();checks++;console.log('PASS',name);}
check('payload excludes arbitrary personal fields',()=>{assert.throws(()=>model.parseBatch({...batch(),key:'DO_NOT_SEND'}));assert.throws(()=>model.parseBatch(batch([event('app_active',{title:'PRIVATE'})])));});
check('oversized batches and stale events rejected',()=>{assert.throws(()=>model.parseBatch(batch(Array.from({length:21},()=>event()))));assert.throws(()=>model.parseBatch(batch([event('app_active',{at:now-8*86400000})])));});
check('UUID and event whitelist validated',()=>{assert.throws(()=>model.parseBatch({...batch(),installation:'IMEI'}));assert.throws(()=>model.parseBatch(batch([event('key_uploaded')])));});
check('stored key uses salted pseudonym',()=>{const b=model.parseBatch(batch());const key=model.eventKey(b,b.events[0],salt);assert(!key.includes(installation));assert.notEqual(key,model.eventKey(b,b.events[0],salt+'x'));});
check('admin bearer token required',()=>{assert(model.authorized('Bearer '+token,token));assert(!model.authorized(null,token));assert(!model.authorized('Bearer '+token+'x',token));assert(!model.authorized('Bearer ',undefined));});
const a=batch([event('app_active'),event('app_active'),event('install'),event('wallpaper_update',{template:'calendar',mode:'manual',outcome:'success'})]);const b=batch([event('app_active',{at:now-86400000})],crypto.randomUUID());const background=batch([event('wallpaper_update',{template:'receipt',mode:'auto',outcome:'success'})],crypto.randomUUID());
const keys=[...a.events.map(e=>model.eventKey(a,e,salt)),...b.events.map(e=>model.eventKey(b,e,salt)),...background.events.map(e=>model.eventKey(background,e,salt))];
check('background never inflates active users; devices deduplicated',()=>{const r=model.summarize([...keys,...keys],30,now);assert.equal(r.dau,1);assert.equal(r.wau,2);assert.equal(r.mau,2);assert.equal(r.newInstallations,1);assert.equal(r.daily.find(d=>d.date===model.day(now)).autoSuccess,1);});
check('short report does not mislabel monthly activity',()=>assert.equal(model.summarize(keys,7,now).mau,null));
const memory=new Map(),env={ANALYTICS_HASH_SALT:salt,ANALYTICS_ADMIN_TOKEN:token};let unavailable=false;
const route=load('app/api/app-analytics/route.ts',{
  'next/server':{NextResponse:{json:(value,options={})=>new Response(JSON.stringify(value),{status:options.status??200,headers:options.headers})}},
  '@edgeone/pages-blob':{getStore:()=>({
    setJSON:async(k,v)=>{if(unavailable)throw Error('PRIVATE_STORAGE_ERROR');memory.set(k,v);},
    list:async({prefix})=>({blobs:[...memory.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))})
  })},
  '@/lib/app-analytics':model,
  '@/lib/anonymous-analytics-store':{readAnonymousCounters:async()=>({totals:{page_open:0},daily:[]})},
  '@/lib/request-security':{enforceRateLimit:()=>{}}
},{process:{env}});
const req=(method,data,auth)=>{const request=new Request('https://example.test/api/app-analytics?days=30',{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(data?{body:JSON.stringify(data)}:{})});return Object.assign(request,{nextUrl:new URL(request.url)});};
(async()=>{
  assert.equal((await route.GET(req('GET'))).status,401);checks++;console.log('PASS unauthorized report is private');
  const payload=batch([event('install'),event('app_active')]);assert.equal((await route.POST(req('POST',payload))).status,200);await route.POST(req('POST',payload));assert.equal(memory.size,2);checks++;console.log('PASS upload retry is idempotent');
  assert.equal((await route.POST(req('POST',{...payload,key:'PRIVATE'}))).status,400);assert.equal(memory.size,2);checks++;console.log('PASS private fields rejected before storage');
  assert.equal((await route.POST(req('POST',{padding:'x'.repeat(18000)}))).status,413);checks++;console.log('PASS body size bounded');
  const report=await route.GET(req('GET',null,token));assert.equal(report.status,200);assert.equal((await report.json()).app.dau,1);checks++;console.log('PASS authenticated dashboard report');
  env.ANALYTICS_HASH_SALT='';assert.equal((await route.POST(req('POST',payload))).status,503);env.ANALYTICS_HASH_SALT=salt;unavailable=true;assert.equal((await route.POST(req('POST',payload))).status,503);checks++;console.log('PASS unconfigured or unavailable storage is not reported as success');
  console.log(checks+' analytics checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
