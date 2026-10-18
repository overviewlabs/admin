import { describe, expect, it } from 'vitest';
import { mapDiscoveryBounded } from '../services/discovery-concurrency.js';
describe('MCP discovery concurrency', () => {
  it('bounds work across simultaneous clients and preserves order and every decision', async () => {
    let active=0, peak=0, calls=0;
    const inputs=Array.from({length:60}, (_,i)=>i);
    const results=await Promise.all(Array.from({length:29}, ()=>mapDiscoveryBounded(inputs, async i=>{
      active++;peak=Math.max(peak,active);calls++;
      await new Promise(resolve=>setTimeout(resolve,1));active--;return i*2;
    })));
    expect(peak).toBeLessThanOrEqual(8);expect(calls).toBe(29*60);
    for(const result of results)expect(result).toEqual(inputs.map(i=>i*2));
  });
  it('propagates failure and releases slots for following discovery', async () => {
    await expect(mapDiscoveryBounded([1],async()=>{throw Error('denied');})).rejects.toThrow('denied');
    expect(await mapDiscoveryBounded([1,2],async n=>n)).toEqual([1,2]);
  });
  it('does not memoize authorization decisions across clients', async () => {
    let allowed=true;
    expect(await mapDiscoveryBounded(['tool'],async()=>allowed)).toEqual([true]);allowed=false;
    expect(await mapDiscoveryBounded(['tool'],async()=>allowed)).toEqual([false]);
  });
});
