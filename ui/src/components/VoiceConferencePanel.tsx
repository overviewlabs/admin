import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Users, AudioLines } from 'lucide-react';
import { useOptionalVoiceSession } from '@/context/VoiceSessionContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';

export function VoiceConferencePanel() {
  const voice = useOptionalVoiceSession();
  const [picker, setPicker] = useState(false);
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!voice?.active) return null;
  const members = voice.participants ?? [];
  const open = async () => {
    setPicker(true); setSelected([]); setError(''); setBusy(true);
    try { setAgents(await voice.availableAgents()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <>
    <Button size="xs" variant="ghost" onClick={() => { voice.setConferenceOpen(true); void open(); }} disabled={voice.phase === 'connecting'}><Plus />Add to call</Button>
    {voice.conferenceOpen && createPortal(<aside className="voice-conference-panel" aria-label="Conference Call">
      <div className="flex items-center justify-between gap-2 border-b p-4">
        <div className="flex items-center gap-2"><Users className="size-4" /><h2 className="text-sm font-medium">Conference Call</h2><span className="text-xs text-muted-foreground">{members.length}/5</span></div>
        <Button size="icon-xs" variant="ghost" aria-label="Collapse conference panel" onClick={() => voice.setConferenceOpen(false)}><X /></Button>
      </div>
      <div className="space-y-2 p-4">
        {members.map(member => <div key={member.id} className="rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{member.name}</span>
            <Button size="icon-xs" variant="ghost" aria-label={`Remove ${member.name} from call`} onClick={() => void voice.removeFromCall(member.id)?.catch(e => setError(String(e)))}><X /></Button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">{voice.speakerId === member.id && member.phase === 'speaking' && <AudioLines className="size-3" />}{member.status === 'connecting' ? 'Connecting…' : voice.speakerId === member.id ? member.phase === 'speaking' ? 'Speaking' : 'Listening to you' : 'Listening to the call'}</span>
            {member.status === 'connected' && voice.speakerId !== member.id && <Button size="xs" variant="ghost" onClick={() => { try { voice.handoffCall(member.id); } catch(e) { setError(String(e)); } }}>Give turn</Button>}
          </div>
        </div>)}
        <Button variant="outline" size="sm" disabled={members.length >= 5} onClick={() => void open()}><Plus />Add agents</Button>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    </aside>, document.body)}
    <Dialog open={picker} onOpenChange={setPicker}><DialogContent>
      <DialogTitle>Add agents to call</DialogTitle>
      <DialogDescription>Select up to {Math.max(0, 5 - members.length)} more agents from this organization.</DialogDescription>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {agents.filter(a => !members.some(m => m.id === a.id)).map(a => <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm">
          <input type="checkbox" checked={selected.includes(a.id)} disabled={busy || (!selected.includes(a.id) && selected.length + members.length >= 5)} onChange={e => setSelected(ids => e.target.checked ? [...ids, a.id] : ids.filter(id => id !== a.id))} />{a.name}
        </label>)}
        {!agents.length && !busy && <p className="text-sm text-muted-foreground">No available agents.</p>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={busy || !selected.length} onClick={async () => {
        setBusy(true); setError('');
        try { for (const id of selected) await voice.addToCall(id); setPicker(false); }
        catch(e) { setError((e as Error).message); } finally { setSelected([]); setBusy(false); }
      }}>{busy ? 'Connecting…' : `Add ${selected.length || ''} to call`}</Button>
    </DialogContent></Dialog>
  </>;
}
