async page => {
 await page.unroute('**/functions/v1/**');
 await page.route('**/functions/v1/**',route=>route.fulfill({status:400,json:{error:{code:'INVALID_ROUND'}},headers:{'access-control-allow-origin':'*'}}));
 await page.reload();
 await page.getByRole('button',{name:'ВОССТАНОВИТЬ БАТТЛ'}).click();
 if(await page.locator('body').getAttribute('data-recovered')!=='INVALID_ROUND')throw Error('Recovery not called');
 return 'PASS: permanent errors route to battle recovery';
}
