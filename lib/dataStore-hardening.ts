'use client';

/**
 * KROWN client persistence hardening.
 *
 * The legacy DataStore intentionally updates local state optimistically, but a
 * number of critical operations did not roll back when their API write failed.
 * This module overrides only those critical operations so the UI changes only
 * after Neon confirms the write, then refreshes the canonical server state.
 */
import { dataStore } from '@/lib/dataStore';
import { api } from '@/lib/neon-client';

if (typeof window !== 'undefined') {
  const store = dataStore as any;

  const refreshAndFind = async (predicate: (item: any) => boolean) => {
    await dataStore.refresh();
    return predicate ? (dataStore.getOrders().find(predicate) || null) : null;
  };

  // Payments are financial state: never mark an order paid before Neon confirms it.
  store.payOrder = async function(orderId: string, paymentData: any) {
    try {
      await api.orders.pay(orderId, paymentData);
      await dataStore.refresh();
      return dataStore.getOrders().find((o: any) => o.id === orderId) || null;
    } catch (error) {
      console.error('[KROWN] Payment was not persisted:', error);
      await dataStore.refresh().catch(() => {});
      return null;
    }
  };

  // Split payments are also server-authoritative; the API receives the complete
  // split list and returns the canonical order state.
  store.addSplitPayment = async function(orderId: string, split: any) {
    try {
      const current = dataStore.getOrders().find((o: any) => o.id === orderId);
      const splits = [...((current as any)?.splitPayments || []), {
        id: crypto.randomUUID(),
        amount: split.amount,
        paymentMethod: split.paymentMethod,
        paidAt: Date.now(),
        splitIndex: split.splitIndex,
        totalSplits: split.totalSplits,
        seatCovered: split.seatCovered,
        itemsCovered: split.itemsCovered,
        guestLabel: split.guestLabel,
        guestItems: split.guestItems,
      }];
      await api.orders.splitPay(orderId, splits);
      await dataStore.refresh();
      return dataStore.getOrders().find((o: any) => o.id === orderId) || null;
    } catch (error) {
      console.error('[KROWN] Split payment was not persisted:', error);
      await dataStore.refresh().catch(() => {});
      return null;
    }
  };

  // Inventory writes: refresh the canonical ingredient list after Neon confirms.
  store.addIngredient = async function(data: any) {
    try {
      const result = await api.ingredients.create(data);
      await dataStore.refresh();
      const id = result?.data?.id || result?.id;
      return id ? dataStore.getIngredients().find((i: any) => i.id === id) : dataStore.getIngredients().find((i: any) => i.name === data.name);
    } catch (error) {
      console.error('[KROWN] Ingredient create failed:', error);
      await dataStore.refresh().catch(() => {});
      return null;
    }
  };

  store.updateIngredient = async function(id: string, updates: any) {
    try {
      await api.ingredients.update(id, updates);
      await dataStore.refresh();
      return dataStore.getIngredients().find((i: any) => i.id === id) || null;
    } catch (error) {
      console.error('[KROWN] Ingredient update failed:', error);
      await dataStore.refresh().catch(() => {});
      return null;
    }
  };

  store.updateIngredientQuantity = async function(id: string, quantity: number) {
    try {
      await api.ingredients.updateQuantity(id, quantity);
      await dataStore.refresh();
      return dataStore.getIngredients().find((i: any) => i.id === id) || null;
    } catch (error) {
      console.error('[KROWN] Ingredient quantity update failed:', error);
      await dataStore.refresh().catch(() => {});
      return null;
    }
  };

  store.deleteIngredient = async function(id: string) {
    try {
      await api.ingredients.delete(id);
      await dataStore.refresh();
      return true;
    } catch (error) {
      console.error('[KROWN] Ingredient delete failed:', error);
      await dataStore.refresh().catch(() => {});
      return false;
    }
  };

  // Seating writes: the previous client updated local JSON first, which made a
  // failed request look successful until the next reload. Always reconcile from DB.
  store.addPlaceZone = async function(data: any) {
    try {
      await api.zones.create(data);
      await dataStore.refresh();
      return dataStore.getZones().find((z: any) => z.name === data.name) || null;
    } catch (error) {
      console.error('[KROWN] Zone create failed:', error);
      await dataStore.refresh().catch(() => {});
      return null;
    }
  };

  store.updatePlaceZone = async function(updatedZone: any) {
    try {
      await api.zones.update(updatedZone.id, updatedZone);
      await dataStore.refresh();
      return dataStore.getZones().find((z: any) => z.id === updatedZone.id) || null;
    } catch (error) {
      console.error('[KROWN] Zone update failed:', error);
      await dataStore.refresh().catch(() => {});
      return null;
    }
  };

  store.addTableToZone = async function(zoneId: string, tableNumber: string, seatsCount = 4, shape: any = 'round') {
    try {
      await api.zones.addTable(zoneId, { tableNumber, seatsCount, shape });
      await dataStore.refresh();
      return true;
    } catch (error) {
      console.error('[KROWN] Table create failed:', error);
      await dataStore.refresh().catch(() => {});
      return false;
    }
  };

  store.addSeatToTable = async function(zoneId: string, tableNumber: string) {
    try {
      const zone = dataStore.getZones().find((z: any) => z.id === zoneId);
      const table = zone?.tables?.find((t: any) => (t.tableNumber || t.number) === tableNumber);
      if (!table) throw new Error('Table not found');
      await api.zones.updateTable(zoneId, tableNumber, { seatsCount: Math.min(24, Number(table.seatsCount || 0) + 1) });
      await dataStore.refresh();
      return true;
    } catch (error) {
      console.error('[KROWN] Add seat failed:', error);
      await dataStore.refresh().catch(() => {});
      return false;
    }
  };

  store.removeSeatFromTable = async function(zoneId: string, tableNumber: string) {
    try {
      const zone = dataStore.getZones().find((z: any) => z.id === zoneId);
      const table = zone?.tables?.find((t: any) => (t.tableNumber || t.number) === tableNumber);
      if (!table) throw new Error('Table not found');
      await api.zones.updateTable(zoneId, tableNumber, { seatsCount: Math.max(1, Number(table.seatsCount || 1) - 1) });
      await dataStore.refresh();
      return true;
    } catch (error) {
      console.error('[KROWN] Remove seat failed:', error);
      await dataStore.refresh().catch(() => {});
      return false;
    }
  };

  store.deleteTableFromZone = async function(zoneId: string, tableNumber: string) {
    try {
      await api.zones.deleteTable(zoneId, tableNumber);
      await dataStore.refresh();
      return true;
    } catch (error) {
      console.error('[KROWN] Table delete failed:', error);
      await dataStore.refresh().catch(() => {});
      return false;
    }
  };

  // Corporate account changes must survive reloads as well.
  store.addCompany = async function(data: any) {
    try {
      await api.companies.create(data);
      await dataStore.refresh();
      return dataStore.getCompanies().find((c: any) => c.name === data.name) || null;
    } catch (error) {
      console.error('[KROWN] Company create failed:', error);
      await dataStore.refresh().catch(() => {});
      return null;
    }
  };

  store.toggleCompanyStatus = async function(id: string, newStatus: any) {
    try {
      await api.companies.updateStatus(id, newStatus);
      await dataStore.refresh();
      return dataStore.getCompanies().find((c: any) => c.id === id) || null;
    } catch (error) {
      console.error('[KROWN] Company status update failed:', error);
      await dataStore.refresh().catch(() => {});
      return null;
    }
  };

  store.settleCompanyBalance = async function(companyId: string, amountPaid: number, paymentMethod: any, notes?: string) {
    try {
      await api.companies.settle(companyId, { amountPaid, paymentMethod, notes });
      await dataStore.refresh();
      return dataStore.getCompanies().find((c: any) => c.id === companyId) || null;
    } catch (error) {
      console.error('[KROWN] Company settlement failed:', error);
      await dataStore.refresh().catch(() => {});
      return null;
    }
  };

  void refreshAndFind;
}
