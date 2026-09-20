import {list,nonnegative,oneOf,percentage,positive,text,uuid} from "./validation.mjs";

export function validateRecipePayload(body={}){
  const recipeType=oneOf(body.recipe_type||"menu",["menu","bulk"],{field:"Recipe type"});
  const name=text(body.name,{field:"Name",required:true,max:180});
  const category=recipeType==="menu"?text(body.category,{field:"Category",required:true,max:120}):null;
  const status=oneOf(body.status||"recorded",["draft","recorded","approved"],{field:"Status"});
  const yieldQuantity=recipeType==="bulk"?positive(body.yield_quantity,{field:"Usable batch yield"}):null;
  const yieldUnit=recipeType==="bulk"?text(body.yield_unit,{field:"Yield unit",required:true,max:40}):null;
  const components=list(Array.isArray(body.components)?body.components:[],{field:"Components",max:500}).map((x,i)=>({
    kind:oneOf(x?.kind,["ingredient","bulk"],{field:`Components[${i}].kind`}),
    id:uuid(x?.id,{field:`Components[${i}].id`}),
    quantity:positive(x?.quantity,{field:`Components[${i}].quantity`}),
    unit:text(x?.unit,{field:`Components[${i}].unit`,required:true,max:40}),
    notes:text(x?.notes,{field:`Components[${i}].notes`,max:1000})||null
  }));
  const packaging=recipeType==="menu"?list(Array.isArray(body.packaging)?body.packaging:[],{field:"Packaging",max:100}).map((x,i)=>({
    packaging_item_id:uuid(x?.packaging_item_id,{field:`Packaging[${i}].packaging_item_id`}),
    order_type:oneOf(x?.order_type,["default","dine_in","takeaway","delivery"],{field:`Packaging[${i}].order_type`}),
    quantity:positive(x?.quantity,{field:`Packaging[${i}].quantity`})
  })):[];
  const financials=recipeType==="menu"?{
    selling_price:nonnegative(body.selling_price??0,{field:"Selling price"}),
    target_food_cost:percentage(body.target_food_cost??35,{field:"Target food cost"}),
    delivery_commission_pct:percentage(body.delivery_commission_pct??0,{field:"Delivery commission"}),
    payment_fee_pct:percentage(body.payment_fee_pct??0,{field:"Payment fee"}),
    other_variable_pct:percentage(body.other_variable_pct??0,{field:"Other variable cost"}),
    delivery_fixed_cost:nonnegative(body.delivery_fixed_cost??0,{field:"Fixed delivery cost"})
  }:{
    selling_price:null,target_food_cost:35,delivery_commission_pct:0,payment_fee_pct:0,other_variable_pct:0,delivery_fixed_cost:0
  };
  return {...body,name,recipe_type:recipeType,category,status,yield_quantity:yieldQuantity,yield_unit:yieldUnit,components,packaging,...financials};
}
