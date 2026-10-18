import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizePublicUi} from './public-ui-permissions.mjs';
function fixture(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ui-modes-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const dist=path.join(dir,'dist');fs.mkdirSync(dist);fs.writeFileSync(path.join(dist,'index.html'),'<html></html>');return {dir,dist}; }
test('repairs the root-owned build output produced under Admin umask 0007',t=>{
 const {dist}=fixture(t);const before=process.umask(0o007);
 try {fs.chmodSync(dist,0o770);fs.mkdirSync(path.join(dist,'assets'));fs.writeFileSync(path.join(dist,'assets','app.js'),'export {}');fs.chmodSync(path.join(dist,'index.html'),0o660);}finally{process.umask(before);}
 assert.throws(()=>normalizePublicUi(dist,{checkOnly:true}),/permissions/);
 const result=normalizePublicUi(dist);assert.equal(result.repaired,4);
 assert.equal(fs.statSync(dist).mode&0o777,0o755);
 assert.equal(fs.statSync(path.join(dist,'index.html')).mode&0o777,0o644);
 assert.equal(fs.statSync(path.join(dist,'assets','app.js')).mode&0o777,0o644);
 assert.equal(fs.statSync(path.join(dist,'assets')).mode&0o777,0o755);
 assert.equal(normalizePublicUi(dist,{checkOnly:true}).repaired,0);
});
test('refuses symlinks and leaves credentials outside the public tree unchanged',t=>{
 const {dir,dist}=fixture(t);const secret=path.join(dir,'credentials');fs.writeFileSync(secret,'private',{mode:0o600});fs.symlinkSync(secret,path.join(dist,'escape'));
 assert.throws(()=>normalizePublicUi(dist),/artifact type/);assert.equal(fs.statSync(secret).mode&0o777,0o600);
});
test('refuses broad directories and accidental hidden secrets',t=>{
 const {dir,dist}=fixture(t);assert.throws(()=>normalizePublicUi(dir),/public UI dist/);fs.writeFileSync(path.join(dist,'.env'),'private',{mode:0o600});assert.throws(()=>normalizePublicUi(dist),/Hidden file/);
});
