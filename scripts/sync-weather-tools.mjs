import {writeFileSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {WEATHER_TOOL_DEFINITIONS,WEATHER_AGENT_GUIDANCE} from '../server/src/services/weather-tools.ts';
// Node 24's native type stripping: no dependency install, model, or build needed.
if(process.env.CPTR_SOURCE_ROOT){
 const dest=resolve(process.env.CPTR_SOURCE_ROOT,'utils');
 writeFileSync(resolve(dest,'weather-tools.generated.json'),JSON.stringify(WEATHER_TOOL_DEFINITIONS,null,2)+'\n');
 writeFileSync(resolve(dest,'weather-guidance.generated.txt'),WEATHER_AGENT_GUIDANCE+'\n');
}
const board=new URL('../skills/whoxos-board/SKILL.md',import.meta.url);
const current=readFileSync(board,'utf8');
const start='<!-- system-weather:start -->',end='<!-- system-weather:end -->';
const block=start+'\n## System weather and city data\n\n'+WEATHER_AGENT_GUIDANCE+'\n\nOrganization API fallback (agent bearer authentication): POST /api/companies/{yourCompanyId}/weather/city with {city,units,forecastDays}; POST /weather/geocode, /weather/query or /weather/capabilities under the same company prefix. Runtime sessions expose the four weather_* tools directly.\n'+end+'\n\n';
const stripped=current.includes(start)?current.slice(0,current.indexOf(start))+current.slice(current.indexOf(end)+end.length).replace(/^\s+/, ''):current;
const marker='## Interactive answers in Overview Labs';
if(!stripped.includes(marker))throw Error('Board presentation marker missing');
writeFileSync(board,stripped.replace(marker,block+marker));
console.log('Synchronized read-only weather tools and agent guidance.');
