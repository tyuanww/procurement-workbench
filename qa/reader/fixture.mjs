import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const requireWeb=createRequire(new URL('../packages/report-renderers/package.json',import.meta.url));
const xlsx=requireWeb('xlsx');
const po='PO20261117009103';
const code='99010003';
const component='procurement-component:'+po+':'+code;
const path='/api/v1/lines/'+encodeURIComponent(component);
const warehouse='0199f0a0-0000-7000-8000-000000000010';
async function login(page,origin,accessCode,role) {
  await post(page,origin,'/api/v1/auth/dev/login',{userId:'0199f0a0-0000-7000-8000-00000000000'+role,accessCode:accessCode});
  page.setDefaultTimeout(15000);
}
async function post(page,origin,path,data) {
  const response=await page.request.post(new URL(path,origin).href,{data});
  assert.ok(response.ok(),path+' '+response.status()+' '+await response.text());
  return response.json();
}
async function get(page,origin,path) {
  const response=await page.request.get(new URL(path,origin).href);
  assert.ok(response.ok(),path+' '+response.status()+' '+await response.text());
  return response.json();
}
async function importWorkbook(page,origin,{name,data,template,factoryPartyId}) {
  const uploaded=await page.request.post(new URL('/api/v1/imports/detect',origin).href,{
    multipart:{file:{name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:data}},
  });
  assert.ok(uploaded.ok(),await uploaded.text());
  const {fileId}=await uploaded.json();
  const batch=await post(page,origin,'/api/v1/imports',{fileId,template,...(factoryPartyId ? {factoryPartyId}: {})});
  return post(page,origin,'/api/v1/imports/'+batch.id+'/commit',{expectedRevision:batch.revision??0});
}
function factoryWorkbook({po,code}) {
  const book=xlsx.utils.book_new();
  const append=(name,rows)=>xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet(rows),name);
  append('在途订单汇总',[['订单号','品名','供应商','产品69码','下单时间','采购需求量','已交货数量','工厂现货库存数量','未生产数量','是否结单','品号','客供包材采购单号'],['PO20261117009001','合成成品','合成原表核对工厂','9900000000001','2026-11-20',100,0,0,100,'否','980001',po]]);
  append('成品出货明细',[['订单号','品号','品名','批号','数量','装箱规格','托数','备注','出货时间（到货时间）','客户仓+托数','车型','备注'],['PO20261117009001','980001','合成成品','LOT-DEMO',10,null,null,null,'2026-11-24']]);
  append('库存数量汇总',[['订单号','编码','品名','批号','结存数量','托数','状态（coa时间）','生产日期','是否验货'],['PO20261117009001','980001','合成成品','LOT-DEMO',10,null,null,'2026-11-21','是']]);
  append('09月排产包材原料需求表',[
    ['采购单号','订单号','材料品号','材料品名','材料库存单位','成品预计用量','订单毛需求量','现有库存量','物料需求量','需求到位日期&数量',null,'需求到位日期&数量'],
    [null,null,null,null,null,null,null,null,null,'到货时间','数量','到货时间','数量'],
    [po,'PO20261117009001','980001','合成成品'],
    [null,null,code,'合成瓶盖','个',150,150,0,150,'2026-11-24',50,'2026-11-27',100],
  ]);
  return xlsx.write(book,{type:'buffer',bookType:'xlsx'});
}


export {login,component,po,code};
export async function seed(browser,app) {
 const {origin,accessCode,cwd}=app;
 const buyer=await browser.newPage(); const admin=await browser.newPage(); const manager=await browser.newPage();
 try {
  await login(buyer,origin,accessCode,'2');
  await login(admin,origin,accessCode,'1');
  await login(manager,origin,accessCode,'5');
  const procurement=await importWorkbook(buyer,origin,{name:'purchase-synthetic.xlsx',data:await readFile(cwd+'/fixtures/synthetic/po-master-procurement.xlsx'),template:'po-master-v1'});
  const factory=await post(admin,origin,'/api/v1/parties',{displayName:'合成原表核对工厂',isFactory:true,isSupplier:true});
  const factoryBatch=await importWorkbook(buyer,origin,{name:'factory-synthetic.xlsx',data:factoryWorkbook({po,code}),template:'factory-progress-v1',factoryPartyId:factory.id});
  const imported=await get(buyer,origin,'/api/v1/imports/'+factoryBatch.id+'/rows?sheet='+encodeURIComponent('09月排产包材原料需求表'));
  const raw=imported.items.find(row=>row.rowNo===4);
  assert.ok(raw);
  await post(admin,origin,'/api/v1/factory-reports/demand/'+encodeURIComponent(raw.id+':report')+'/link',{orderLineId:component});
  const first=await post(buyer,origin,path+'/batches',{receiverPartyId:warehouse,plannedQty:50,dateBuyerConfirmed:'2026-11-24'});
  const second=await post(buyer,origin,path+'/batches',{receiverPartyId:warehouse,plannedQty:100,dateBuyerConfirmed:'2026-11-27'});
  assert.equal(first.seq,1); assert.equal(second.seq,2);
  const {items}=await get(manager,origin,'/api/v1/lines?store=dafuyan&pageSize=200');
  const late=items.find(line=>line.lane==='finished'&&line.nextDue===null&&line.storeProgress?.materials.some(({id})=>id===component));
  assert.ok(late);
  const day=(offset)=>new Date(Date.now()+offset*86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
  const lateBatch=await post(buyer,origin,`/api/v1/lines/${encodeURIComponent(late.id)}/batches`,{receiverPartyId:warehouse,plannedQty:50,dateBuyerConfirmed:day(1),dateFactoryRequired:day(0)});
  return {first,second,late,lateBatch,procurement,factoryBatch};
 } finally {await Promise.all([buyer.close(),admin.close(),manager.close()]);}
}
