import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {suppliedTuition,suppliedTransport} from '../shared/fee-schedule.ts';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
mkdirSync('test-results',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let rates=suppliedTransport.map(rate=>({...rate}));
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),p=url.pathname;let data=[];
    if(p==='/api/auth/me')data={user:{id:'admin',name:'Preview Admin',role:'Super Admin'}};
    else if(p==='/api/setup')data={required:false};
    else if(p==='/api/public')data={pages:{},settings:{}};
    else if(p==='/api/school-settings')data={academicSession:'2026–2027'};
    else if(p==='/api/integrations')data={};
    else if(p.includes('notifications'))data={rows:[],recent:[],unread:0,total:0};
    else if(p==='/api/fees/schedule')data={session:'2026–2027',tuition:suppliedTuition.map((rate,i)=>({...rate,id:`t${i}`})),transport:rates,canEditTransport:true};
    else if(p==='/api/fees/schedule/transport'&&route.request().method()==='PUT'){rates=route.request().postDataJSON().routes;data={ok:true};}
    else if(p==='/api/records/feeStructures')data=suppliedTuition.map((rate,i)=>({id:`t${i}`,title:'Tuition fee',data:{...rate,session:'2026–2027',frequency:'Monthly'}}));
    await route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:5173/#/admin/feeStructures');
  const schedule=page.getByRole('region',{name:'School monthly fee structure'});
  await expect(schedule.locator('.fs-tuition tbody tr')).toHaveCount(11);
  await expect(schedule.locator('.fs-transport tbody tr')).toHaveCount(6);
  await expect(schedule.locator('.fs-grand-total dd')).toHaveText('₹350');
  await page.getByLabel('Fee calculator transport route').selectOption('Lakri');
  await expect(schedule.locator('.fs-grand-total dd')).toHaveText('₹1,150');
  await page.getByLabel('Fee calculator class').selectOption('Class 8');
  await page.getByLabel('Fee calculator transport route').selectOption('Jalalpur');
  await expect(schedule.locator('.fs-grand-total dd')).toHaveText('₹700');
  await schedule.screenshot({path:'test-results/fee-structure-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await schedule.screenshot({path:'test-results/fee-structure-mobile.png'});
  await page.getByRole('button',{name:'Edit transport rates',exact:true}).click();
  await page.getByLabel('Jalalpur monthly transport fee').fill('350');
  await page.getByRole('button',{name:'Save transport rates',exact:true}).click();
  await expect(schedule.getByRole('status')).toContainText('Transport rates saved');
  await expect(schedule.locator('.fs-grand-total dd')).toHaveText('₹750');
  assert.deepEqual(errors,[]);
  console.log('Fee schedule passed: all classes/routes, exact totals, optional transport, editable rates, mobile layout, no runtime errors.');
}finally{await browser.close();}
