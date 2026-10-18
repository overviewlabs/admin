import { test, expect } from '@playwright/test';
import { installBrowserVoiceFixture, startVoice, stats } from './helpers';
test.use({serviceWorkers:'block'});
test('quota waiting is visible and hangup cancels queued voice data', async ({page}) => {
 const requests=await installBrowserVoiceFixture(page); await startVoice(page);
 requests.budgetWait=true;
 await page.evaluate(() => (window as any).__voiceBrowser.sockets[0].emit({toolCall:{functionCalls:[{id:'read',name:'search_web',args:{category:'general',query:'example'}}]}}));
 await expect(page.getByText('Waiting for voice allowance',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'End voice',exact:true}).click();
 await expect.poll(()=>stats(page)).toMatchObject({openSockets:0,runningContexts:0});
 expect(requests.budgetRequests).toBeGreaterThan(1); expect(requests.unknown).toEqual([]);
});
