import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ensureRepository,repositoryNames,marker,ownsRepository,githubRepositoryUrl,IGNORE} from './policy.mjs';
const company={id:'a5a8e5c4-220e-4396-9491-939cf1f18be0',name:'TQL Warehousing'};
const own=(name='tql-warehousing')=>({id:42,full_name:`Overview-Labs/${name}`,owner:{login:'Overview-Labs'},private:true,description:marker(company.id)+' '+company.name});
test('names are readable, bounded, collision-safe and identities are required',()=>{
 assert.deepEqual(repositoryNames(company),['tql-warehousing','tql-warehousing-a5a8e5c4','tql-warehousing-'+company.id]);
 assert.equal(repositoryNames({...company,name:'Équipe / 工程'})[0],'equipe');
 assert.throws(()=>repositoryNames({...company,id:'../../secret'}));
 assert.equal(githubRepositoryUrl('https://github.com/OVLStudio/TQL-WMS.git'),'OVLStudio/TQL-WMS');
 assert.equal(githubRepositoryUrl('https://token@github.com/OVLStudio/TQL-WMS'),null);
});
test('a fresh organization gets an initialized private repository',async()=>{
 const calls=[];const repo=await ensureRepository(company,'Overview-Labs',async(method,url,body)=>{calls.push({method,url,body});return method==='GET'?null:own();});
 assert.equal(repo.id,42);assert.equal(calls[1].body.private,true);assert.equal(calls[1].body.auto_init,true);
 assert.equal(calls[1].url,'/orgs/Overview-Labs/repos');
});
test('retries reuse the exact marked repository and never adopt another organization',async()=>{
 const calls=[];const repo=await ensureRepository(company,'Overview-Labs',async(method,url)=>{calls.push(method);return own();});
 assert.equal(repo.id,42);assert.deepEqual(calls,['GET']);
 const other={...own(),description:marker('0d8aad87-64f2-4f9c-a92c-94a261e140f7')};
 const names=[];await ensureRepository(company,'Overview-Labs',async(method,url)=>{names.push(url);return url.endsWith('tql-warehousing')?other:own('tql-warehousing-a5a8e5c4');});
 assert.equal(names.length,2);assert.ok(names[1].endsWith('tql-warehousing-a5a8e5c4'));
 assert.equal(ownsRepository({...own(),private:false},company,'Overview-Labs'),false);
});
test('an ambiguous successful create is recovered without another POST',async()=>{
 let reads=0,posts=0;const repo=await ensureRepository(company,'Overview-Labs',async method=>{if(method==='POST'){posts++;throw Error('Disconnected');}return ++reads===1?null:own();});
 assert.equal(repo.id,42);assert.equal(posts,1);assert.equal(reads,2);
});
test('failed writes stay failed unless a matching private repo exists; credentials are excluded',async()=>{
 await assert.rejects(ensureRepository(company,'Overview-Labs',async method=>{if(method==='POST')throw Error('Denied');return null;}),/Denied/);
 for(const rule of ['.env','*.pem','*.key','credentials.json','/data/','/backups/']) assert.ok(IGNORE.includes(rule));
});
test('an interrupted setup retains its repository after an organization rename',async()=>{
 const calls=[];const repo=await ensureRepository({...company,name:'New Name'},'Overview-Labs',async(method,url)=>{calls.push({method,url});return own();},'Overview-Labs/tql-warehousing');
 assert.equal(repo.full_name,'Overview-Labs/tql-warehousing');assert.deepEqual(calls,[{method:'GET',url:'/repos/Overview-Labs/tql-warehousing'}]);
 await assert.rejects(ensureRepository(company,'Overview-Labs',async()=>own(),'other/repository'),/Invalid repository receipt/);
});
