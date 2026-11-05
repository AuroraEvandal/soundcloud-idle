// Visual-only fixtures. This does not verify a live Supabase project or Telegram payment.
async page => {
 let paid=false; const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const player={id:'00000000-0000-4000-8000-000000000001',username:'pet-preview',level:2,xp:20,xp_to_next:110,popularity:30,coins:500,streams:250,skills:{rhyme:2,flow:2,punch:2,charisma:2}};
 let collection={pets:[{id:'soundity',name:'Саундити',level:2,friendship:23,friendship_stage:2,income_pct:3,owned:true},{id:'micity',name:'Майкити',level:1,friendship:3,friendship_stage:1,income_pct:1,owned:true},{id:'scalevillity',name:'Скейлвиллити',level:0,friendship:0,friendship_stage:1,income_pct:0,owned:false}],active_pet_id:'soundity',income_pct:3};
 const cases=[{id:'free',name:'Ежедневный кейс',price_stars:0,pet_chance:.0005,fallback_coins:25,available_at:null},{id:'underground',name:'Андеграунд',price_stars:29,pet_chance:.01,fallback_coins:150,available_at:null},{id:'gift-vault',name:'Хранилище подарков',price_stars:100,pet_chance:.03,fallback_coins:600,available_at:null}];
 const pattern=/\/functions\/v1\//;
 const handler=async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  const name=route.request().url().split('/').at(-1),body=route.request().postDataJSON();let data;
  if(name==='login')data={is_new:false,player};
  else if(name==='get-profile')data={player,stats:{battles_played:2,wins:1,losses:1},opponents:[],recent_battles:[]};
  else if(name==='get-pets')data=collection;
  else if(name==='equip-pet'){collection={...collection,active_pet_id:body.petId,income_pct:1};data=collection;}
  else if(name==='create-case-invoice')data={invoice_url:'https://t.me/fixture-only',order_id:'00000000-0000-4000-8000-000000000088'};
  else if(name==='get-case-order')data=paid?{status:'paid',player,drop:{type:'coins',coins:150},pets:collection}:{status:'pending'};
  else if(name==='get-cases')data={cases,pets:collection};
  else if(name==='open-case'){cases[0].available_at=new Date(Date.now()+86400000).toISOString();player.coins+=25;data={player,drop:{type:'coins',coins:25},pets:collection};}
  else return route.fulfill({status:400,json:{error:{code:'INVALID_REQUEST'}},headers:{'access-control-allow-origin':'*'}});
  return route.fulfill({json:data,headers:{'access-control-allow-origin':'*'}});
 };
 await page.route(pattern,handler);
 try{
  await page.addInitScript(()=>{window.Telegram={WebApp:{initData:'fixture-only',openInvoice:(_url,callback)=>callback('paid')}}});
  await page.setViewportSize({width:390,height:844});await page.reload();
  await page.getByRole('button',{name:'Профиль',exact:true}).first().click();
  await page.getByText('Твоя команда',{exact:true}).waitFor();
  await page.getByRole('button',{name:'ВЗЯТЬ С СОБОЙ',exact:true}).click();
  await page.getByText('СЕЙЧАС С ТОБОЙ',{exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/pets-profile.png'});
  await page.getByRole('button',{name:'Назад',exact:true}).click();
  await page.getByRole('button',{name:'Казик',exact:true}).click();
  await page.getByRole('button',{name:/ОТКРЫТЬ БЕСПЛАТНО/}).click();
  await page.getByText('+25 монет',{exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/pets-case.png'});
  await page.getByRole('button',{name:/Андеграунд/}).click();
  await page.getByRole('button',{name:/ОПЛАТИТЬ 29/}).click();
  await page.getByText('Проверяем оплату на сервере…',{exact:true}).waitFor();
  if(await page.getByText('+150 монет',{exact:true}).count())throw Error('Browser callback granted unpaid reward');
  paid=true;
  await page.getByText('+150 монет',{exact:true}).waitFor();
  for(const width of [320,390]){
    await page.setViewportSize({width,height:700});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow at '+width);
  }
  const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));
  if(broken.length)throw Error('Broken art: '+broken.join(','));
  if(errors.length)throw Error(errors.join('\n'));
  return 'PASS: fixture UI collection, equip, free case result, paid callback cannot grant before server, 320/390px no horizontal overflow, art loads';
 }finally{await page.unroute(pattern,handler);}
}

