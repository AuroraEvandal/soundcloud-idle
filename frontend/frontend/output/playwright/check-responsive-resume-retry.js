async page => {
  await page.unrouteAll({behavior:'wait'})
  await page.evaluate(()=>localStorage.removeItem('sw_concert_pending_v1:session'))
  const ids=[]
  await page.route('**/functions/v1/concert*',async route=>{
    const body=route.request().postDataJSON()
    if(body.action==='resume'){
      ids.push(body.requestId)
      if(ids.length===1){await route.fetch();await route.abort('failed');return}
    }
    await route.continue()
  })
  await page.goto('http://127.0.0.1:5175/concert.html')
  const ongoing=page.getByRole('button',{name:/Продолжить выступление/})
  await page.locator('.ct-hub-action').waitFor()
  if(await ongoing.count()){await ongoing.click();await page.getByRole('button',{name:'Пауза',exact:true}).click();await page.getByRole('button',{name:'Завершить без награды'}).click()}
  await page.getByRole('button',{name:/Заступить на смену|Вернуться на сцену/}).click()
  await page.getByRole('button',{name:/Выйти к сцене/}).click()
  await page.getByRole('button',{name:/01 Довериться артисту/}).click()
  await page.getByRole('button',{name:'Начать концерт'}).click()
  await page.getByRole('button',{name:'Пауза',exact:true}).click()
  await page.getByRole('button',{name:/Продолжить концерт/}).click()
  await page.getByRole('dialog').getByRole('button',{name:'Восстановить связь',exact:true}).click()
  await page.getByRole('dialog').waitFor({state:'hidden'})
  await page.getByRole('slider',{name:'Частота эквалайзера'}).waitFor()
  if(ids.length!==2||ids[0]!==ids[1]||await page.getByRole('dialog').count())throw new Error('Lost resume was not recovered: '+JSON.stringify({ids,dialog:await page.getByRole('dialog').count()}))
  await page.getByRole('button',{name:'Пауза',exact:true}).click()
  await page.getByRole('button',{name:'Завершить без награды'}).click()
  return {resumeLostReplyRecovered:true,pauseClosed:true}
}


