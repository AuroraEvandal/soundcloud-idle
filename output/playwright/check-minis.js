async (page) => {
  let kind = 'timing', game = null, received = [], failOnce = false;
  const messages = [];
  page.on('pageerror', e => messages.push(e.message));
  const pattern = /\/functions\/v1\/(?:start-mini-game|finish-mini-game)$/;
  const handler = async route => {
    const req = route.request();
    if(req.method() === 'OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
    const body = req.postDataJSON();
    const finish = req.url().endsWith('finish-mini-game');
    if(!game) game={id:'00000000-0000-4000-8000-000000000003',kind,round_number:2,duration_ms:{timing:1200,slang:2000,wave:3200}[kind],started_at:null,penalty_points:null,timing_hits:0,timing_path:[0,1,0,1,0,1,0,1]};
    if(body.actionId==='start' && !game.started_at) game.started_at=Date.now()+800;
    if(finish){
      received.push(body);
      if(failOnce){failOnce=false;return route.abort();}
      if(game.penalty_points===null) {
        if(kind==='timing') {
          if(body.actionId!==`tap-${game.timing_hits+1}`) game.penalty_points=15;
          else if(++game.timing_hits===3) game.penalty_points=0;
          else {game.started_at=Date.now()+800;game.duration_ms=[1200,1000,2100][game.timing_hits];}
        } else game.penalty_points=body.actionId==='timeout'||body.actionId==='wrong'? (kind==='slang'?20:15) : 0;
      }
    }
    await route.fulfill({json:{...game,server_now:Date.now(),prompt:game.started_at?'Залетел на бит — и сразу в…':null,options:game.started_at?[{id:'correct',text:'хит'},{id:'wrong',text:'компот'},{id:'wrong2',text:'шкаф'}]:[]},headers:{'access-control-allow-origin':'*'}});
  };
  await page.route(pattern, handler);
  try {
  await page.setViewportSize({width:390,height:844});
  await page.reload();
  await page.getByRole('button',{name:'НАЧАТЬ',exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/mini-timing-ready.png'});
  await page.getByRole('button',{name:'НАЧАТЬ',exact:true}).click();
  await page.getByRole('button',{name:'УДАРИТЬ · 1/3',exact:true}).waitFor({state:'visible'});
  await page.screenshot({path:'output/playwright/mini-timing.png'});
  for(let stage=1;stage<=3;stage++) await page.getByRole('button',{name:`УДАРИТЬ · ${stage}/3`,exact:true}).click();
  await page.getByText('Чисто. Продолжаем!').waitFor();
  if(received.map(body=>body.actionId).join(',')!=='tap-1,tap-2,tap-3')throw Error('Unexpected timing stages');
  await page.getByRole('button',{name:'К РАУНДУ 2'}).click();
  if(await page.locator('body').getAttribute('data-completed')!=='0')throw Error('Completion penalty');
  kind='slang';game=null;received=[];
  await page.reload();
  await page.getByRole('button',{name:'НАЧАТЬ',exact:true}).click();
  await page.getByRole('button',{name:'02 компот'}).waitFor();
  await page.screenshot({path:'output/playwright/mini-slang.png'});
  failOnce=true;
  await page.getByRole('button',{name:'02 компот'}).click();
  await page.getByRole('button',{name:'ПОВТОРИТЬ ЗАПРОС'}).click();
  await page.getByText('Забыл текст на**й!',{exact:true}).waitFor();
  if(received.length!==2||received[0].actionId!==received[1].actionId)throw Error('Retry changed action');
  await page.screenshot({path:'output/playwright/mini-slang-failure.png'});
  kind='wave';game=null;received=[];
  await page.reload();
  await page.getByRole('button',{name:'НАЧАТЬ',exact:true}).click();
  await page.waitForTimeout(1500);
  await page.screenshot({path:'output/playwright/mini-wave.png'});
  await page.getByText('Микрофон фонит! Сбился с волны.',{exact:true}).waitFor();
  if(received.length!==1||received[0].actionId!=='timeout')throw Error('Timeout was not sent once');
  await page.reload();
  await page.getByText('Микрофон фонит! Сбился с волны.',{exact:true}).waitFor();
  if(await page.getByRole('button',{name:'НАЧАТЬ',exact:true}).count())throw Error('Reload reset saved game');
  await page.setViewportSize({width:320,height:568});
  await page.screenshot({path:'output/playwright/mini-small.png'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Horizontal overflow');
  if(messages.length)throw Error(messages.join('\n'));
  console.log('PASS: 3 game UIs, callback, retry preserves action, timeout once, reload retains result, 320px layout.');
  } finally {
    await page.unroute(pattern, handler);
  }
}
