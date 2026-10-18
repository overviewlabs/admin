// @vitest-environment jsdom
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import type {Agent} from '@whoxos/shared';
import {AgentVoice} from './AgentVoice';
vi.mock('@/lib/router',()=>({Link:({to,children}:any)=><a href={to}>{children}</a>}));
it('offers Gemini connection and preserves text runtime',()=>{
 const html=renderToStaticMarkup(<AgentVoice agent={{name:'CEO',metadata:null} as Agent}/>);
 expect(html).toContain('Gemini voice');expect(html).toContain('gemini-3.8-live-extended-thinking');expect(html).toContain('apps/connect?source=gemini');expect(html).not.toContain('LiveKit');
});
