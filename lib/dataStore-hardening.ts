'use client';

import { dataStore } from '@/lib/dataStore';
import { api } from '@/lib/neon-client';

if (typeof window !== 'undefined') {
  const store = dataStore as any;
  const refresh = async () => { await dataStore.refresh(); };

  store.payOrder = async function(orderId: string, paymentData: any) {
    try { await api.orders.pay(orderId, paymentData); await refresh(); return dataStore.getOrders().find((o:any)=>o.id===orderId)||null; }
    catch (error) { console.error('[KROWN] Payment was not persisted:', error); await refresh().catch(()=>{}); return null; }
  };

  store.addSplitPayment = async function(orderId: string, split: any) {
    try {
      const current:any = dataStore.getOrders().find((o:any)=>o.id===orderId);
      const splits=[...((current as any)?.splitPayments||[]),{id:crypto.randomUUID(),amount:split.amount,paymentMethod:split.paymentMethod,paidAt:Date.now(),splitIndex:split.splitIndex,totalSplits:split.totalSplits,seatCovered:split.seatCovered,itemsCovered:split.itemsCovered,guestLabel:split.guestLabel,guestItems:split.guestItems}];
      await api.orders.splitPay(orderId,splits); await refresh(); return dataStore.getOrders().find((o:any)=>o.id===orderId)||null;
    } catch(error){ console.error('[KROWN] Split payment was not persisted:',error); await refresh().catch(()=>{}); return null; }
  };

  store.addItemsToOrder = async function(orderId:string, items:any[]){ try{ await api.orders.addItems(orderId,items); await refresh(); return dataStore.getOrders().find((o:any)=>o.id===orderId)||null; }catch(error){ console.error('[KROWN] Add items failed:',error); await refresh().catch(()=>{}); return null; } };
  store.updateOrderStatus = async function(orderId:string,status:any){ try{ await api.orders.updateStatus(orderId,status); await refresh(); return true; }catch(error){ console.error('[KROWN] Order status update failed:',error); await refresh().catch(()=>{}); return false; } };
  store.updateOrderCustomerTin = async function(orderId:string,tin:string){ try{ await api.orders.updateTin(orderId,tin); await refresh(); return dataStore.getOrders().find((o:any)=>o.id===orderId)||null; }catch(error){ console.error('[KROWN] TIN update failed:',error); await refresh().catch(()=>{}); return null; } };

  store.addIngredient = async function(data:any){ try{ const r=await api.ingredients.create(data); await refresh(); const id=r?.data?.id||r?.id; return id?dataStore.getIngredients().find((i:any)=>i.id===id):dataStore.getIngredients().find((i:any)=>i.name===data.name)||null; }catch(error){ console.error('[KROWN] Ingredient create failed:',error); await refresh().catch(()=>{}); return null; } };
  store.updateIngredient = async function(id:string,updates:any){ try{ await api.ingredients.update(id,updates); await refresh(); return dataStore.getIngredients().find((i:any)=>i.id===id)||null; }catch(error){ console.error('[KROWN] Ingredient update failed:',error); await refresh().catch(()=>{}); return null; } };
  store.updateIngredientQuantity = async function(id:string,q:number){ try{ await api.ingredients.updateQuantity(id,q); await refresh(); return dataStore.getIngredients().find((i:any)=>i.id===id)||null; }catch(error){ console.error('[KROWN] Ingredient quantity update failed:',error); await refresh().catch(()=>{}); return null; } };
  store.deleteIngredient = async function(id:string){ try{ await api.ingredients.delete(id); await refresh(); return true; }catch(error){ console.error('[KROWN] Ingredient delete failed:',error); await refresh().catch(()=>{}); return false; } };

  store.addPlaceZone = async function(data:any){ try{ await api.zones.create(data); await refresh(); return dataStore.getZones().find((z:any)=>z.name===data.name)||null; }catch(error){ console.error('[KROWN] Zone create failed:',error); await refresh().catch(()=>{}); return null; } };
  store.updatePlaceZone = async function(zone:any){ try{ await api.zones.update(zone.id,zone); await refresh(); return dataStore.getZones().find((z:any)=>z.id===zone.id)||null; }catch(error){ console.error('[KROWN] Zone update failed:',error); await refresh().catch(()=>{}); return null; } };
  store.deletePlaceZone = async function(id:string){ try{ await api.zones.delete(id); await refresh(); return true; }catch(error){ console.error('[KROWN] Zone delete failed:',error); await refresh().catch(()=>{}); return false; } };
  store.addTableToZone = async function(zoneId:string,tableNumber:string,seatsCount=4,shape:any='round'){ try{ await api.zones.addTable(zoneId,{tableNumber,seatsCount,shape}); await refresh(); return true; }catch(error){ console.error('[KROWN] Table create failed:',error); await refresh().catch(()=>{}); return false; } };
  store.addSeatToTable = async function(zoneId:string,tableNumber:string){ try{ const z:any=dataStore.getZones().find((x:any)=>x.id===zoneId); const t=z?.tables?.find((x:any)=>(x.tableNumber||x.number)===tableNumber); if(!t) throw new Error('Table not found'); await api.zones.updateTable(zoneId,tableNumber,{seatsCount:Math.min(24,Number(t.seatsCount||0)+1)}); await refresh(); return true; }catch(error){ console.error('[KROWN] Add seat failed:',error); await refresh().catch(()=>{}); return false; } };
  store.removeSeatFromTable = async function(zoneId:string,tableNumber:string){ try{ const z:any=dataStore.getZones().find((x:any)=>x.id===zoneId); const t=z?.tables?.find((x:any)=>(x.tableNumber||x.number)===tableNumber); if(!t) throw new Error('Table not found'); await api.zones.updateTable(zoneId,tableNumber,{seatsCount:Math.max(1,Number(t.seatsCount||1)-1)}); await refresh(); return true; }catch(error){ console.error('[KROWN] Remove seat failed:',error); await refresh().catch(()=>{}); return false; } };
  store.deleteTableFromZone = async function(zoneId:string,tableNumber:string){ try{ await api.zones.deleteTable(zoneId,tableNumber); await refresh(); return true; }catch(error){ console.error('[KROWN] Table delete failed:',error); await refresh().catch(()=>{}); return false; } };

  store.addCompany = async function(data:any){ try{ await api.companies.create(data); await refresh(); return dataStore.getCompanies().find((c:any)=>c.name===data.name)||null; }catch(error){ console.error('[KROWN] Company create failed:',error); await refresh().catch(()=>{}); return null; } };
  store.toggleCompanyStatus = async function(id:string,status:any){ try{ await api.companies.updateStatus(id,status); await refresh(); return dataStore.getCompanies().find((c:any)=>c.id===id)||null; }catch(error){ console.error('[KROWN] Company status failed:',error); await refresh().catch(()=>{}); return null; } };
  store.settleCompanyBalance = async function(id:string,amount:number,method:any,notes?:string){ try{ await api.companies.settle(id,{amountPaid:amount,paymentMethod:method,notes}); await refresh(); return dataStore.getCompanies().find((c:any)=>c.id===id)||null; }catch(error){ console.error('[KROWN] Company settlement failed:',error); await refresh().catch(()=>{}); return null; } };

  // Products, staff, branches and expenses are master data; do not leave a local-only edit behind.
  store.addProduct = async function(data:any){ try{ await api.products.create(data); await refresh(); return dataStore.getProducts().find((p:any)=>p.name===data.name)||null; }catch(error){ console.error('[KROWN] Product create failed:',error); await refresh().catch(()=>{}); return null; } };
  store.updateProduct = async function(id:string,updates:any){ try{ await api.products.update(id,updates); await refresh(); return true; }catch(error){ console.error('[KROWN] Product update failed:',error); await refresh().catch(()=>{}); return false; } };
  store.toggleProductAvailability = async function(id:string){ try{ await api.products.toggle(id); await refresh(); return true; }catch(error){ console.error('[KROWN] Product availability update failed:',error); await refresh().catch(()=>{}); return false; } };
  store.addStaffMember = async function(data:any){ try{ await api.staff.create(data); await refresh(); return dataStore.getStaff().find((s:any)=>s.email===data.email)||null; }catch(error){ console.error('[KROWN] Staff create failed:',error); await refresh().catch(()=>{}); return null; } };
  store.updateStaffStatus = async function(id:string,status:any){ try{ await api.staff.updateStatus(id,status); await refresh(); return true; }catch(error){ console.error('[KROWN] Staff status failed:',error); await refresh().catch(()=>{}); return false; } };
  store.updateStaffRole = async function(id:string,role:any){ try{ await api.staff.updateRole(id,role); await refresh(); return dataStore.getStaff().find((s:any)=>s.id===id)||null; }catch(error){ console.error('[KROWN] Staff role failed:',error); await refresh().catch(()=>{}); return null; } };
  store.deleteStaff = async function(id:string){ try{ await api.staff.delete(id); await refresh(); return true; }catch(error){ console.error('[KROWN] Staff delete failed:',error); await refresh().catch(()=>{}); return false; } };
  store.addBranch = async function(data:any){ try{ await api.branches.create(data); await refresh(); return dataStore.getBranches().find((b:any)=>b.name===data.name)||null; }catch(error){ console.error('[KROWN] Branch create failed:',error); await refresh().catch(()=>{}); return null; } };
  store.updateBranchStatus = async function(id:string,status:any){ try{ await api.branches.updateStatus(id,status); await refresh(); return true; }catch(error){ console.error('[KROWN] Branch status failed:',error); await refresh().catch(()=>{}); return false; } };
  store.deleteBranch = async function(id:string){ try{ await api.branches.delete(id); await refresh(); return true; }catch(error){ console.error('[KROWN] Branch delete failed:',error); await refresh().catch(()=>{}); return false; } };
  store.addExpense = async function(data:any){ try{ await api.expenses.create(data); await refresh(); return dataStore.getExpenses().find((e:any)=>e.title===data.title)||null; }catch(error){ console.error('[KROWN] Expense create failed:',error); await refresh().catch(()=>{}); return null; } };
  store.saveProductIngredients = async function(productId:string,ingredients:any[]){ try{ await api.products.saveRecipe(productId,ingredients); await refresh(); return true; }catch(error){ console.error('[KROWN] Recipe save failed:',error); await refresh().catch(()=>{}); return false; } };
}
