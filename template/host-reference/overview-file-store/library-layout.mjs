import crypto from 'node:crypto';
import path from 'node:path';
export const libraryPrefix='studio/library/';
const slug=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100)||'unnamed';
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const backupGroups={
 'whoxos-database':['databases/whoxos','WHOXOS database backups'],
 'studio-database':['databases/ovl-studio','OVL Studio database backups'],
 'admin-database':['databases/overview-labs-admin','Overview Labs Admin database backups'],
 'wms-database':['databases/tql-wms','TQL WMS database backups'],
 'deployment-archives':['deployments/overview-labs','Overview Labs deployment backups'],
 'wms-archives':['deployments/tql-wms','TQL WMS deployment backups'],
 'retired-buckets':['retired-storage','Retired storage recovery archives'],
 'index':['recovery-receipts','Backup recovery receipt index'],
};
function groupFor(row,metadata) {
 const first=row.key.split('/')[0];
 switch(row.namespace) {
  case 'studio-source':return ['blueprints/'+slug(first)+'/source',first+' — blueprint source'];
  case 'studio-previews':return ['websites/'+slug(first)+'/previews',first+' — website previews'];
  case 'studio-projects':return ['websites/'+slug(first)+'/projects',first+' — editable website projects'];
  case 'studio-data':return ['applications/ovl-studio/saved-data','OVL Studio saved metadata'];
  case 'studio-jobs':return ['applications/ovl-studio/build-jobs','OVL Studio build jobs'];
  case 'studio-supabase':return ['applications/ovl-studio/supabase-files','OVL Studio Supabase files'];
  case 'admin-uploads':return ['applications/overview-labs-admin/attachments','Overview Labs Admin attachments'];
  case 'whoxos-assets':{
   const name=metadata.companies?.[first]||first;
   return ['applications/whoxos/'+slug(name)+'-'+digest(first).slice(0,8)+'/assets',name+' — WHOXOS assets'];
  }
  case 'workspaces':{
   const root=metadata.workspaces?.[first];const name=root?path.basename(root):'Workspace '+first;
   return ['workspaces/'+slug(name)+'-'+first.slice(0,8),name+' — workspace files'];
  }
  case 'backups':{
   const [folder,title]=backupGroups[first]||['other/'+slug(first),first+' backups'];
   return ['backups/'+folder,title];
  }
  default:return ['applications/'+slug(row.namespace),row.namespace+' files'];
 }
}
export function buildLibrary(rows,metadata={}) {
 const groups=new Map();let totalFiles=0,totalBytes=0;
 for(const row of rows) {
  if(row.deleted||row.namespace==='verification')continue;
  if(!row.key||row.key.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Invalid catalog file path');
  const [folder,title]=groupFor(row,metadata);const key=libraryPrefix+folder+'/catalog.json';
  const identity=row.namespace+'\0'+row.key.split('/')[0];
  const separate=['studio-source','studio-previews','studio-projects','whoxos-assets','workspaces'].includes(row.namespace);
  if(groups.has(key)&&separate&&groups.get(key).identity!==identity)throw Error('Catalog folder collision');
  if(!groups.has(key))groups.set(key,{key,identity,title,format:'overview-labs-file-catalog/v1',bucket:'ovl-studio',namespace:row.namespace,files:[],totalBytes:0});
  const g=groups.get(key);const size=Number(row.byte_size);const offset=Number(row.byte_offset);
  if(!Number.isSafeInteger(size)||size<0||!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid catalog byte range');
  const named=row.namespace==='admin-uploads'?metadata.uploadNames?.[row.key]:row.namespace==='whoxos-assets'?metadata.assetNames?.[row.key]:undefined;
  g.files.push({name:named||path.posix.basename(row.key),originalPath:row.key,applicationNamespace:row.namespace,sizeBytes:size,modifiedAt:new Date(row.updated_at).toISOString(),sha256:row.sha256,contentType:row.content_type,storage:{bucket:'ovl-studio',objectKey:row.blob_key,byteOffset:offset,byteLength:size},previousVersionCount:Number(row.previous_versions||0)});
  g.totalBytes+=size;totalFiles++;totalBytes+=size;
 }
 const catalogs=[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(({identity,...g})=>({...g,fileCount:g.files.length,files:g.files.sort((a,b)=>a.originalPath.localeCompare(b.originalPath))}));
 return {catalogs,totalFiles,totalBytes};
}
export const libraryReadme=`Overview Labs storage library\n\nStart with studio/library/index.json. Browse the named folders for blueprints, websites, applications, workspaces and backups. Every catalog.json lists original paths, available original upload names, sizes, checksums and the Backblaze object and byte range containing each file.\n\nThese are file catalogs, not duplicate file contents. Payloads remain in the existing compact storage. Use Overview Labs, OVL Studio and TQL WMS for ordinary viewing, editing and downloads; application permissions remain in effect. A Backblaze account operator can use the catalog storage references for recovery. Packed files require extraction of the listed byte range.\n\nDatabase backup payloads are additionally encrypted before upload. The catalog does not contain recovery keys or application credentials. Live databases remain on the server. Earlier content versions and recovery snapshots are retained.\n\nThe catalog is refreshed by the regular five-minute file sync after uploads and backup verification. The shared ovl-studio bucket contains the platform file library and database/deployment backups, including WMS backups. The tql-wms bucket separately holds WMS CRM document uploads; its catalog is under crm-documents/library/.\n`;
