import {describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {qualificationTransfer,reserveQualification,rootAdmission} from '../services/definition-qualification-transfer.js';
describe('fixed qualification route',()=>{
 it('denies malformed/missing root credential before any gateway call',async()=>{
  for(const body of [null,{}, {payload:'bad',signature:'bad'},{payload:'bad',signature:'bad',runToken:'x',extra:true}])
   await expect(qualificationTransfer({} as any,'bad',body)).rejects.toThrow('definition_qualification_failed');
 });
 it('retains exclusive replay reservation in separate nonce directory',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'qualification-nonce-'));
  const r={nonce:'bff52273-ed86-4314-9105-35fa02ed6522',runId:'run',queryId:'query',manifestSha256:'manifest',at:1};
  try{await reserveQualification(r,directory);await expect(reserveQualification(r,directory)).rejects.toThrow();}
  finally{await rm(directory,{recursive:true});}
 });
 it('live fixed root broker rejects unsigned input',async()=>{
  await expect(rootAdmission({payload:'invalid',signature:'invalid'},'invalid')).rejects.toThrow('definition_qualification_failed');
 });
});
