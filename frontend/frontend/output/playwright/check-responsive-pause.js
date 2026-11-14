async page => {
  await page.unrouteAll({behavior:'wait'})
  const received=[]
  await page.route('**/functions/v1/concert*', async route => {
    const request=route.request().postDataJSON()
    await new Promise(resolve=>setTimeout(resolve,350))
    const response=await route.fetch();received.push({action:request.action,data:await response.json()})
    await new Promise(resolve=>setTimeout(resolve,350))
    await route.fulfill({response})
  })
  await page.goto('http://127.0.0.1:5175/concert.html')
  await page.getByRole('button',{name:/Последний концерт.*18\/18/}).click()
  await page.getByText('Смена засчитана. Награда зачислена в общий кошелёк.').waitFor()
  await page.getByRole('button',{name:'Назад',exact:true}).click()
  await page.getByRole('button',{name:/Вернуться на сцену/}).click()
  await page.getByRole('button',{name:/Выйти к сцене/}).click()
  await page.getByRole('button',{name:/01 Довериться артисту/}).click()
  await page.getByRole('button',{name:'Начать концерт'}).click()
  await page.getByRole('button',{name:'Пауза',exact:true}).click()
  await page.waitForTimeout(800)
  await page.getByRole('button',{name:/Продолжить концерт/}).click()
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))})
  await page.waitForTimeout(1900)
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
  const last=received.at(-1)
  if(last.action!=='pause'||!last.data.show.paused||received.filter(r=>r.action==='pause').length!==2)throw new Error('Background during resume did not restore server pause')
  await page.getByRole('button',{name:'Завершить без награды'}).click()
  return {lastResultRecovered:true,hiddenDuringResumeRepaused:true}
}
