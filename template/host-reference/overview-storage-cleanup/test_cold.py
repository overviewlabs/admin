import importlib.util,json,os,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('cold','/usr/local/libexec/overview-storage-cleanup/cold.py');cold=importlib.util.module_from_spec(spec);spec.loader.exec_module(cold)
class Retention(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.ws=self.root/'workspace';self.ws.mkdir()
  self.rootpatch=patch.object(cold,'ROOT',self.root);self.rootpatch.start()
  self.mountpatch=patch.object(cold,'mounted',return_value=[]);self.mountpatch.start()
  self.usepatch=patch.object(cold,'in_use',side_effect=lambda f,paths:any(p.startswith(str(f)+'/') for p in paths));self.usepatch.start()
 def tearDown(self):
  self.usepatch.stop();self.mountpatch.stop();self.rootpatch.stop();self.tmp.cleanup()
 def release(self,n,status='deployed',age=172800):
  f=self.ws/('release-'+str(n));f.mkdir();(f/'source.tar').write_bytes(b'source')
  r={'releaseId':f.name,'status':status,'createdAt':str(n),'sourcePath':str(f/'source'),'sourceArchive':str(f/'source.tar')}
  p=f/'record.json';p.write_text(json.dumps(r));os.utime(p,(time.time()-age,)*2);return f
 def test_preserves_two_latest_and_prepared(self):
  old=self.release(1);self.release(2);self.release(3);self.release(4,'prepared')
  self.assertEqual(cold.eligible(),[old])
 def test_preserves_mounts_and_recent_and_already_archived(self):
  old=self.release(1,'failed');self.release(2,'failed',age=60);archived=self.release(3,'failed');(archived/'cold.json').write_text('{}')
  with patch.object(cold,'mounted',return_value=[str(old/'source/Blueprints')]):self.assertEqual(cold.eligible(),[])
 def test_current_release_and_alias_reference_protected(self):
  old=self.release(1);self.release(2);latest=self.release(3)
  record=json.loads((latest/'record.json').read_text());record['sourcePath']=str(old/'source');(latest/'record.json').write_text(json.dumps(record))
  self.assertEqual(cold.eligible(),[])
 def test_encryption_authentication(self):
  source=self.root/'plain';enc=self.root/'enc';out=self.root/'out';source.write_bytes(os.urandom(1024))
  cold.encrypt(source,enc);cold.decrypt(enc,out);self.assertEqual(source.read_bytes(),out.read_bytes())
  data=bytearray(enc.read_bytes());data[-1]^=1;enc.write_bytes(data)
  with self.assertRaises(ValueError):cold.decrypt(enc,self.root/'bad')
if __name__=='__main__':unittest.main()
