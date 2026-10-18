import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toolsApi } from '@/api/tools';
import { api } from '@/api/client';
import { Checkbox } from '@/components/ui/checkbox';
export function WhoxMailPermissions({connectionId,agentId}:{connectionId:string;agentId:string}) {
  const cache=useQueryClient();
  const key=['whox-mail-access',connectionId];
  const connection=useQuery({queryKey:key,queryFn:()=>toolsApi.getConnection(connectionId)});
  const grants=useQuery({queryKey:['whox-mail-configure',connectionId],queryFn:()=>toolsApi.listConnectionGrants(connectionId)});
  const permissions=(connection.data?.config?.mailAgentPermissions as Record<string,{read:boolean;write:boolean}>|undefined)?.[agentId] ?? {read:false,write:false};
  const save=useMutation({mutationFn:(next:{read:boolean;write:boolean})=>api.patch(`/tool-connections/${connectionId}/mail-access/${agentId}`,next),onSuccess:()=>cache.invalidateQueries({queryKey:key})});
  const disabled=!grants.data?.capabilities.canConfigure || connection.isLoading || save.isPending;
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-4">
      <label className="flex items-center gap-2 text-sm"><Checkbox aria-label="Read mail" checked={permissions.read} disabled={disabled} onCheckedChange={v=>save.mutate({...permissions,read:v===true})}/>Read mail</label>
      <label className="flex items-center gap-2 text-sm"><Checkbox aria-label="Write and send mail" checked={permissions.write} disabled={disabled} onCheckedChange={v=>save.mutate({...permissions,write:v===true})}/>Write/send mail</label>
    </div>
    <p className="text-xs text-muted-foreground">Enable either permission or both. Write includes sending messages and changing read status.</p>
    {(connection.error || grants.error || save.error) && <p role="alert" className="text-sm text-destructive">Mail permissions could not be loaded or saved. Try again.</p>}
  </div>;
}
