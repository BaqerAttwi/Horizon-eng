const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { parseCrmExcel } = require('../utils/crmExcel');
const { calcItemPricing } = require('../utils/pricingCore');
function workbook(rows, sheet='CRM') {
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),sheet);
  return XLSX.write(book,{type:'buffer',bookType:'xlsx'});
}
const header=['Project','Panel#','Panel name','Division','Part number','Description','Brand','QTY','UNIT PRICE EUR','UNIT PRICE USD','UNIT PRICE USD2','DISCOUNT','MAN POWER','MARKUP'];
test('CRM imports saved prices, discounts and markup on both product and manpower',()=>{
  const result=parseCrmExcel(workbook([header,['Old',1,'ATS','ATS','A','Breaker','Brand',2,100,0,112.5,70,0.08,0.02903193581893948],['Old',2,'DB','OUTGOING','B','Other','Brand',1,0,10,10,0,0,0]]));
  assert.equal(result.total_items,2);
  assert.equal(result.panels.length,2);
  assert.equal(result.metadata.exchange_rate,1.125);
  const item=result.unmatched[0];
  const price=calcItemPricing({...item,discount_pct:item.discount});
  assert.ok(Math.abs(price.totalfinalProduct-2*112.5*0.3*1.08*(1+0.02903193581893948))<1e-9);
  assert.equal(item.base_price_usd,112.5);
});
test('CRM rejects missing sheet, bad pricing and fractional quantities',()=>{
  assert.throws(()=>parseCrmExcel(workbook([header],'BOM')),/CRM sheet/);
  assert.throws(()=>parseCrmExcel(workbook([header,['Old',1,'P','D','A','','',1,0,0,'#REF!']])),/Invalid UNIT PRICE USD2/);
  assert.throws(()=>parseCrmExcel(workbook([header,['Old',1,'P','D','A','','',1.5]])),/quantity/);
});
test('CRM rejects missing required columns, mixed projects and discount over 100',()=>{
  assert.throws(()=>parseCrmExcel(workbook([['Panel#','Part number'],[1,'A']])),/Missing CRM column/);
  assert.throws(()=>parseCrmExcel(workbook([header,['One',1,'P','D','A','','',1],['Two',2,'P','D','B','','',1]])),/more than one project/);
  assert.throws(()=>parseCrmExcel(workbook([header,['One',1,'P','D','A','','',1,1,0,1,101]])),/discount/);
});
test('CRM preserves historical cost per item from total cost',()=>{
  const result=parseCrmExcel(workbook([[...header,'TOTAL COST'],['Old',1,'P','D','A','','',2,10,0,12,0,0.1,0.2,26.4]]));
  assert.equal(result.unmatched[0].cost,13.2);
});
