async page => {
 const calls=[], errors=[]; let failOnce=true;
 page.on('pageerror',e=>errors.push(e.message));
 const game={id:'00000000-0000-4000-8000-000000000003',kind:'timing',round_number:2,duration_ms:1200,started_at:null,penalty_points:null,timing_hits:0,timing_path:[.1,.9,.15,.8,.05,.95,.2,.85]};
 const pattern=/\/functions\/v1\/(?:start-mini-game|finish-mini-game)$/;
 const handler=async route=>{
  const body=route.request().postDataJSON();
  const processingStart=Date.now();
  if(body.actionId==='start')await new Promise(r=>setTimeout(r,550));
  if(body.actionId==='start'&&!game.started_at)game.started_at=Date.now()+800;
  if(route.request().url().endsWith('finish-mini-game')){
   calls.push(body.actionId);
   const stage=Number(body.actionId.at(-1));
   if(stage===game.timing_hits+1){
    if(body.actionId.startsWith('timeout'))game.penalty_points=15;
    else{game.timing_hits++;if(game.timing_hits===3)game.penalty_points=0;else{game.started_at=Date.now()+800;game.duration_ms=[1200,1000,2100][game.timing_hits];}}
   }
   if(failOnce){failOnce=false;return route.abort();}
  }
  await route.fulfill({json:{...game,server_now:Date.now(),server_processing_ms:Date.now()-processingStart,prompt:null,options:[]},headers:{'access-control-allow-origin':'*'}});
 };
 await page.route(pattern,handler);
 try {
 await page.setViewportSize({width:390,height:844});
 await page.reload();
 await page.getByRole('button',{name:'НАЧАТЬ',exact:true}).waitFor();
 await page.waitForTimeout(350);
 await page.screenshot({path:'output/playwright/timing-v2-ready.png'});
 await page.getByRole('button',{name:'НАЧАТЬ',exact:true}).click();
 const first=page.getByRole('button',{name:'УДАРИТЬ · 1/3',exact:true});
 await first.click();
 await page.getByRole('button',{name:'ПОВТОРИТЬ ЗАПРОС'}).click();
 const second=page.getByRole('button',{name:'УДАРИТЬ · 2/3',exact:true});
 await second.waitFor();
 if(calls.join(',')!=='tap-1,tap-1')throw Error('Retry changed action');
 await page.waitForTimeout(300);
 await page.screenshot({path:'output/playwright/timing-v2-stage2.png'});
 await second.click();
 await page.getByRole('button',{name:'УДАРИТЬ · 3/3',exact:true}).click();
 await page.getByText('Чисто. Продолжаем!',{exact:true}).waitFor();
 if(calls.join(',')!=='tap-1,tap-1,tap-2,tap-3')throw Error('Unexpected action sequence');
 await page.getByRole('button',{name:'К РАУНДУ 2',exact:true}).click();
 if(await page.locator('body').getAttribute('data-completed')!=='0')throw Error('Callback before full completion');
 await page.setViewportSize({width:320,height:568});
 await page.waitForTimeout(400);
 await page.screenshot({path:'output/playwright/timing-v2-small.png'});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow');
 if(errors.length)throw Error(errors.join('\n'));
 return 'PASS: three stages, lost response retried same action, callback only after three hits, 320px layout';
 } finally {
  await page.unroute(pattern,handler);
 }
}
