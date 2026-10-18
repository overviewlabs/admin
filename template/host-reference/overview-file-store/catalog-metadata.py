#!/usr/bin/python3
"""Read filename metadata for the private storage catalog; no credential export."""
import json,pathlib,sqlite3

def read_metadata():
 result={'uploadNames':{},'wmsDocuments':[],'localWmsDocumentCount':0}
 p=pathlib.Path('/.WHOX/.System/.Admin/data/app.db')
 with sqlite3.connect('file:'+str(p)+'?mode=ro',uri=True) as db:
  for ident,name,file_path in db.execute('SELECT id,filename,path FROM files'):
   if name:
    result['uploadNames'][str(ident)]=name
    if file_path:result['uploadNames'][pathlib.Path(file_path).name]=name
 p=pathlib.Path('/var/lib/docker/volumes/tql-wms_data/_data/crm.sqlite3')
 with sqlite3.connect('file:'+str(p)+'?mode=ro',uri=True) as db:
  for ident,owner,raw,updated in db.execute("SELECT id,owner,data,updated_at FROM records WHERE kind='documents' ORDER BY id"):
   d=json.loads(raw)
   if d.get('storage_backend','local')!='b2-cloudflare':result['localWmsDocumentCount']+=1;continue
   result['wmsDocuments'].append({'documentId':ident,'name':d.get('name') or d.get('filename') or ident,'originalFilename':d.get('filename'),'sizeBytes':d.get('size'),'customerId':d.get('client_id'),'ownerUserId':owner,'modifiedAtMilliseconds':updated})
 return result
if __name__=='__main__':print(json.dumps(read_metadata()))
