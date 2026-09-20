export function normUnit(v){return String(v||"").trim().toLowerCase()}
export function isEachUnit(v){return ["pc","pcs","piece","pieces","each"].includes(normUnit(v))}
export function packagingEachCost(storageCost,storageUnit,unitsPerStorageUnit){
  const cost=Number(storageCost),yieldQty=Number(unitsPerStorageUnit);
  if(!Number.isFinite(cost)||cost<0)return{unitCost:null,status:"missing_cost"};
  if(isEachUnit(storageUnit))return{unitCost:cost,status:"ready"};
  if(Number.isFinite(yieldQty)&&yieldQty>0)return{unitCost:cost/yieldQty,status:"ready"};
  return{unitCost:null,status:"needs_yield"};
}
export function overheadRate(monthlyOverheads,monthlySales){
  const sales=Number(monthlySales);
  const overhead=Array.isArray(monthlyOverheads)?monthlyOverheads.reduce((sum,x)=>sum+(Number(x?.amount)||0),0):0;
  return sales>0?overhead/sales:0;
}
export function contribution({sellingPrice=0,foodCost=0,packagingCost=0,channelCost=0,overheadPct=0}={}){
  const sell=Number(sellingPrice)||0,total=(Number(foodCost)||0)+(Number(packagingCost)||0)+(Number(channelCost)||0)+sell*(Number(overheadPct)||0)/100;
  return{totalCost:total,contribution:sell-total};
}
