// Initialize Supabase
const supabase = window.supabase.createClient(
  'https://qgayglybnnrhobcvftrs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnYXlnbHlibm5yaG9iY3ZmdHJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2ODQ5ODMsImV4cCI6MjA3ODI2MDk4M30.dqiEe-v1cro5N4tuawu7Y1x5klSyjINsLHd9-V40QjQ'
);

// App configuration
const sections = ['grill', 'wholesale', 'building', 'food', 'pos_mart', 'pos1'];
const sectionNames = {
  'grill': 'Grill', 'wholesale': 'Wholesale', 
  'building': 'Building Material', 'food': 'Food Supplies',
  'pos_mart': 'POS (MART)', 'pos1': 'POS1'
};

// Initialize data structures
const dataStores = {
  inventory: {}, carts: {}, salesData: {}, purchaseData: {}, 
  userData: {}, suppliers: {}, purchaseOrders: {}, transactions: {}, transactionData: {}, balances: {}, openingCutoff: {}, sales: {}, purchases: {}
};

// Initialize empty data for each section
sections.forEach(section => {
  dataStores.inventory[section] = [];
  dataStores.carts[section] = [];
  dataStores.salesData[section] = { 
    totalSales: 0, totalTransactions: 0, avgTransaction: 0, topItem: '-', 
    dailySales: 0, dailyTransactions: 0, profit: 0, profitMargin: 0 
  };
  dataStores.purchaseData[section] = { 
    totalPurchases: 0, totalTransactions: 0, avgTransaction: 0, 
    topSupplier: '-', dailyPurchases: 0, dailyTransactions: 0 
  };
  dataStores.userData[section] = { transactions: 0, sales: 0, purchases: 0 };
  dataStores.suppliers[section] = [];
  dataStores.purchaseOrders[section] = [];
  dataStores.transactions[section] = [];
  dataStores.transactionData[section] = {
    totalVolume: 0, totalCharges: 0, totalTransactions: 0,
    byType: {
      withdraw: 0, transfer_in: 0, transfer_out: 0, deposit: 0, bill_payment: 0, airtime: 0, data: 0, pos_purchase: 0
    }
  };
  dataStores.balances[section] = {};
  dataStores.openingCutoff[section] = {};
  dataStores.sales[section] = [];
dataStores.purchases[section] = [];
});

// App state
let currentSection = 'grill';
let currentView = 'pos';
let currentFilter = 'all';
let currentUser = null;
let selectedDate = {};
sections.forEach(section => { selectedDate[section] = new Date().toISOString().split('T')[0]; });

// Utility functions
const utils = {
  getTodayDate: () => new Date().toISOString().split('T')[0],
  generateOfflineId: () => 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
  
  saveToLocalStorage: (key, data) => {
    try { localStorage.setItem(key, JSON.stringify(data)); } 
    catch (e) { console.error('Error saving to localStorage:', e); }
  },
  
  loadFromLocalStorage: (key, defaultValue = null) => {
    try { 
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) { 
      console.error('Error loading from localStorage:', e);
      return defaultValue;
    }
  },
  
  isExpired: (expiryDate) => {
    if (!expiryDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    return expiry < today;
  },
  
  isExpiringSoon: (expiryDate) => {
    if (!expiryDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffTime > 0 && diffDays <= 7;
  },
  
  getProductStatus: (item) => {
    if (utils.isExpired(item.expiry_date)) return 'expired';
    if (utils.isExpiringSoon(item.expiry_date)) return 'expiring-soon';
    if (item.stock === 0) return 'out-of-stock';
    if (item.stock < 10) return 'low-stock';
    return 'in-stock';
  },
  
  formatDate: (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  },
  
  validateForm: (formId, requiredFields) => {
    const form = document.getElementById(formId);
    if (!form) return { isValid: false, message: 'Form not found.' };
    
    const missingFields = [];
    requiredFields.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (!field || field.value.trim() === '') {
        missingFields.push(field?.getAttribute('data-label') || fieldId);
      }
    });
    
    return missingFields.length > 0 
      ? { isValid: false, message: `Please fill in all required fields: ${missingFields.join(', ')}.` }
      : { isValid: true };
  },
  
  showNotification: (message, type = 'info') => {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 3000);
  },
  downloadCSV: (filename, headers, rows) => {
    const escape = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const headerLine = headers.map(escape).join(',');
    const dataLines = rows.map(r => headers.map(h => escape(r[h])).join(','));
    const csv = [headerLine, ...dataLines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

// Data management
const dataManager = {
  recomputeTopItem: (section) => {
    const sales = dataStores.sales[section] || [];
    const counts = {};
    sales.forEach(s => {
      (s.items || []).forEach(it => {
        const key = String(it.id);
        counts[key] = (counts[key] || 0) + (Number(it.quantity) || 0);
      });
    });
    let topKey = null;
    let topQty = -1;
    Object.keys(counts).forEach(k => {
      if (counts[k] > topQty) { topQty = counts[k]; topKey = k; }
    });
    if (topKey) {
      const anySale = sales.find(s => (s.items || []).some(it => String(it.id) === topKey));
      const item = anySale ? (anySale.items || []).find(it => String(it.id) === topKey) : null;
      dataStores.salesData[section].topItem = item ? item.name : '-';
    } else {
      dataStores.salesData[section].topItem = '-';
    }
    utils.saveToLocalStorage(`salesData_${section}`, dataStores.salesData[section]);
    uiManager.updateReports(section);
  },
  calculateSaleProfitForSection: (items, section) => {
    let totalCost = 0;
    items.forEach(item => {
      const inv = dataStores.inventory[section].find(x => x.id === item.id);
      if (inv) totalCost += (inv.cost || 0) * item.quantity;
    });
    const total = items.reduce((sum, it) => sum + (Number(it.total) || (Number(it.price) * Number(it.quantity))), 0);
    return total - totalCost;
  },
  serializeForSupabase: (table, data) => {
    let d = { ...data };
    delete d.isOffline;
    delete d.timestamp;
    if (table === 'inventory') {
      const safeCreatedBy = (typeof d.created_by === 'string' && (d.created_by.startsWith('offline_') || d.created_by === 'offline_user')) ? null : d.created_by;
      const safeUpdatedBy = (typeof d.updated_by === 'string' && (d.updated_by.startsWith('offline_') || d.updated_by === 'offline_user')) ? null : d.updated_by;
      const cleanExpiryDate = d.expiry_date && d.expiry_date.trim() !== '' ? d.expiry_date : null;
      return {
        section: d.section, name: d.name, price: d.price, cost: d.cost, stock: d.stock,
        expiry_date: cleanExpiryDate,
        description: d.description, status: d.status,
        created_by: (currentUser ? currentUser.id : safeCreatedBy), created_at: d.created_at,
        updated_by: (currentUser ? currentUser.id : safeUpdatedBy), updated_at: d.updated_at
      };
    }
    if (table === 'daily_balances') {
      const safeCreatedBy = (typeof d.created_by === 'string' && (d.created_by.startsWith('offline_') || d.created_by === 'offline_user')) ? null : d.created_by;
      return {
        section: d.section,
        balance_date: d.balance_date,
        opening_cash: d.opening_cash,
        opening_pos: d.opening_pos,
        closing_cash: d.closing_cash,
        closing_pos: d.closing_pos,
        recorded_at: d.recorded_at,
        created_by: (currentUser ? currentUser.id : safeCreatedBy)
      };
    }
    if (table === 'suppliers') {
      const safeCreatedBy = (typeof d.created_by === 'string' && (d.created_by.startsWith('offline_') || d.created_by === 'offline_user')) ? null : d.created_by;
      const safeUpdatedBy = (typeof d.updated_by === 'string' && (d.updated_by.startsWith('offline_') || d.updated_by === 'offline_user')) ? null : d.updated_by;
      return {
        section: d.section, name: d.name, phone: d.phone, email: d.email, address: d.address, products: d.products,
        created_by: (currentUser ? currentUser.id : safeCreatedBy), created_at: d.created_at,
        updated_by: (currentUser ? currentUser.id : safeUpdatedBy), updated_at: d.updated_at
      };
    }
    if (table === 'sales') {
      const safeUserId = (typeof d.user_id === 'string' && (d.user_id.startsWith('offline_') || d.user_id === 'offline_user')) ? null : d.user_id;
      return {
        user_id: safeUserId, user_email: d.user_email, section: d.section, items: d.items, subtotal: d.subtotal, total: d.total,
        totalCost: d.totalCost, totalProfit: d.totalProfit, payment_method: d.payment_method,
        customer_name: d.customer_name, customer_phone: d.customer_phone, timestamp: d.timestamp
      };
    }
    if (table === 'purchases') {
      const safeUserId = (typeof d.user_id === 'string' && (d.user_id.startsWith('offline_') || d.user_id === 'offline_user')) ? null : d.user_id;
      return {
        user_id: safeUserId, user_email: d.user_email, section: d.section, supplierName: d.supplierName, productName: d.productName,
        quantity: d.quantity, cost: d.cost, total: d.total, orderNumber: d.orderNumber, orderDate: d.orderDate, receivedDate: d.receivedDate, timestamp: d.timestamp
      };
    }
    if (table === 'sales_data') {
      return {
        id: d.id, totalSales: d.totalSales, totalTransactions: d.totalTransactions, topItem: d.topItem,
        dailySales: d.dailySales, dailyTransactions: d.dailyTransactions, profit: d.profit
      };
    }
    if (table === 'purchase_data') {
      return {
        id: d.id, totalPurchases: d.totalPurchases, totalTransactions: d.totalTransactions, topSupplier: d.topSupplier,
        dailyPurchases: d.dailyPurchases, dailyTransactions: d.dailyTransactions
      };
    }
    if (table === 'user_data') {
      return { id: d.id, transactions: d.transactions, sales: d.sales, purchases: d.purchases };
    }
    if (table === 'transactions') {
      const safeUserId = (typeof d.user_id === 'string' && (d.user_id.startsWith('offline_') || d.user_id === 'offline_user')) ? null : d.user_id;
      return { user_id: safeUserId, user_email: d.user_email, section: d.section, type: d.type, amount: d.amount, charge: d.charge, reference: d.reference, customer_phone: d.customer_phone, timestamp: d.timestamp, notes: d.notes };
    }
    if (table === 'purchase_orders') {
      const safeSupplierId = (typeof d.supplierId === 'string' && d.supplierId.startsWith('offline_')) ? null : d.supplierId;
      const safeCreatedBy = (typeof d.created_by === 'string' && (d.created_by.startsWith('offline_') || d.created_by === 'offline_user')) ? null : d.created_by;
      const safeUpdatedBy = (typeof d.updated_by === 'string' && (d.updated_by.startsWith('offline_') || d.updated_by === 'offline_user')) ? null : d.updated_by;
      return {
        section: d.section, orderNumber: d.orderNumber, supplierId: safeSupplierId, supplierName: d.supplierName,
        productName: d.productName, quantity: d.quantity, cost: d.cost, total: d.total, orderDate: d.orderDate,
        status: (currentUser ? d.status : d.status), created_by: (currentUser ? currentUser.id : safeCreatedBy), created_at: d.created_at,
        updated_by: (currentUser ? currentUser.id : safeUpdatedBy), updated_at: d.updated_at, receivedDate: d.receivedDate
      };
    }
    return d;
  },
  ensureOwnershipAndDelete: async (table, id) => {
    if (!navigator.onLine) throw new Error('offline');
    if (!id || String(id).startsWith('offline_')) throw new Error('invalid');
    try {
      if (currentUser && currentUser.id) {
        await supabase
          .from(table)
          .update({ created_by: currentUser.id, updated_by: currentUser.id })
          .eq('id', id);
      }
    } catch (e) {}
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
  applyPendingDeletionsToLocal: () => {
    const pending = utils.loadFromLocalStorage('pendingChanges', {});
    const invDel = (pending.inventory && pending.inventory.deleteIds) ? pending.inventory.deleteIds : [];
    const supDel = (pending.suppliers && pending.suppliers.deleteIds) ? pending.suppliers.deleteIds : [];
    const poDel = (pending.purchase_orders && pending.purchase_orders.deleteIds) ? pending.purchase_orders.deleteIds : [];
    sections.forEach(section => {
      if (dataStores.inventory[section]) {
        dataStores.inventory[section] = (dataStores.inventory[section] || []).filter(i => !invDel.includes(i.id));
        utils.saveToLocalStorage(`inventory_${section}`, dataStores.inventory[section]);
      }
      if (dataStores.suppliers[section]) {
        dataStores.suppliers[section] = (dataStores.suppliers[section] || []).filter(i => !supDel.includes(i.id));
        utils.saveToLocalStorage(`suppliers_${section}`, dataStores.suppliers[section]);
      }
      if (dataStores.purchaseOrders[section]) {
        dataStores.purchaseOrders[section] = (dataStores.purchaseOrders[section] || []).filter(i => !poDel.includes(i.id));
        utils.saveToLocalStorage(`purchaseOrders_${section}`, dataStores.purchaseOrders[section]);
      }
    });
  },
  loadDataFromLocalStorage: () => {
    sections.forEach(section => {
      Object.keys(dataStores).forEach(store => {
        const localData = utils.loadFromLocalStorage(`${store}_${section}`, 
          Array.isArray(dataStores[store][section]) ? [] : {});
        if (store === 'salesData' || store === 'purchaseData' || store === 'userData' || store === 'transactionData' || store === 'balances') {
          if (Object.keys(localData).length > 0) dataStores[store][section] = localData;
        } else if (localData.length > 0) {
          dataStores[store][section] = localData;
        }
      });
    });
  },
  
  saveDataToSupabase: async (table, data, id = null) => {
    if (!navigator.onLine) {
      utils.showNotification('You are offline. Connect to the internet to save.', 'error');
      throw new Error('offline');
    }
    data.timestamp = new Date().toISOString();
    data.userId = currentUser ? currentUser.id : null;
    
    // Update local data structures
    if (table === 'inventory') {
      const payload = dataManager.serializeForSupabase('inventory', data);
      if (!id) {
        const { data: resultData, error } = await supabase.from('inventory').insert(payload).select();
        if (error) throw error;
        const created = { ...data, id: resultData[0].id };
        dataStores.inventory[data.section].push(created);
      } else {
        const { error } = await supabase.from('inventory').update(payload).eq('id', id);
        if (error) throw error;
        const index = dataStores.inventory[data.section].findIndex(item => item.id === id);
        if (index !== -1) dataStores.inventory[data.section][index] = { ...dataStores.inventory[data.section][index], ...data };
      }
      utils.saveToLocalStorage(`inventory_${data.section}`, dataStores.inventory[data.section]);
      uiManager.loadInventoryTable(data.section);
      uiManager.updateDepartmentStats(data.section);
      uiManager.updateCategoryInventorySummary(data.section);
      uiManager.updateTotalInventory();
    } else if (table === 'sales') {
      const section = data.section;
      const payload = dataManager.serializeForSupabase('sales', data);
      const { data: resultData, error } = await supabase.from('sales').insert(payload).select();
      if (error) throw error;
      const created = { ...data, id: resultData[0].id, isOffline: false };
      dataStores.sales[section].push(created);
      const totalProfit = dataManager.calculateSaleProfitForSection(data.items, section);
      dataStores.salesData[section].totalSales += data.total;
      dataStores.salesData[section].totalTransactions += 1;
      dataStores.salesData[section].avgTransaction = 
        dataStores.salesData[section].totalSales / dataStores.salesData[section].totalTransactions;
      dataStores.salesData[section].dailySales += data.total;
      dataStores.salesData[section].dailyTransactions += 1;
      dataStores.salesData[section].profit += totalProfit;
      dataStores.salesData[section].profitMargin = dataStores.salesData[section].totalSales > 0 ? 
        (dataStores.salesData[section].profit / dataStores.salesData[section].totalSales) * 100 : 0;
      dataStores.userData[section].transactions += 1;
      dataStores.userData[section].sales += data.total;
      utils.saveToLocalStorage(`sales_${section}`, dataStores.sales[section]);
      utils.saveToLocalStorage(`salesData_${section}`, dataStores.salesData[section]);
      utils.saveToLocalStorage(`userData_${section}`, dataStores.userData[section]);
      dataManager.recomputeTopItem(section);
      uiManager.updateReports(section);
      uiManager.updateUserStats(section);
      uiManager.updateDepartmentStats(section);
      uiManager.loadSalesTable(section);
    } else if (table === 'purchases') {
      const section = data.section;
      const payload = dataManager.serializeForSupabase('purchases', data);
      const { data: resultData, error } = await supabase.from('purchases').insert(payload).select();
      if (error) throw error;
      const created = { ...data, id: resultData[0].id, isOffline: false };
      dataStores.purchases[section].push(created);
      dataStores.purchaseData[section].totalPurchases += data.total;
      dataStores.purchaseData[section].totalTransactions += 1;
      dataStores.purchaseData[section].avgTransaction = 
        dataStores.purchaseData[section].totalPurchases / dataStores.purchaseData[section].totalTransactions;
      dataStores.purchaseData[section].dailyPurchases += data.total;
      dataStores.purchaseData[section].dailyTransactions += 1;
      dataStores.userData[section].purchases += data.total;
      utils.saveToLocalStorage(`purchases_${section}`, dataStores.purchases[section]);
      utils.saveToLocalStorage(`purchaseData_${section}`, dataStores.purchaseData[section]);
      utils.saveToLocalStorage(`userData_${section}`, dataStores.userData[section]);
      uiManager.updatePurchaseReports(section);
      uiManager.updateUserStats(section);
      uiManager.updateDepartmentStats(section);
      uiManager.loadPurchasesTable(section);
    } else if (table === 'suppliers') {
      const section = data.section;
      const payload = dataManager.serializeForSupabase('suppliers', data);
      if (!id) {
        const { data: resultData, error } = await supabase.from('suppliers').insert(payload).select();
        if (error) throw error;
        const created = { ...data, id: resultData[0].id };
        dataStores.suppliers[section].push(created);
      } else {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', id);
        if (error) throw error;
        const index = dataStores.suppliers[section].findIndex(supplier => supplier.id === id);
        if (index !== -1) dataStores.suppliers[section][index] = { ...dataStores.suppliers[section][index], ...data };
      }
      utils.saveToLocalStorage(`suppliers_${section}`, dataStores.suppliers[section]);
      uiManager.loadSuppliersTable(section);
    } else if (table === 'purchase_orders') {
      const section = data.section;
      const payload = dataManager.serializeForSupabase('purchase_orders', data);
      if (!id) {
        const { data: resultData, error } = await supabase.from('purchase_orders').insert(payload).select();
        if (error) throw error;
        const created = { ...data, id: resultData[0].id };
        dataStores.purchaseOrders[section].push(created);
      } else {
        const { error } = await supabase.from('purchase_orders').update(payload).eq('id', id);
        if (error) throw error;
        const index = dataStores.purchaseOrders[section].findIndex(order => order.id === id);
        if (index !== -1) dataStores.purchaseOrders[section][index] = { ...dataStores.purchaseOrders[section][index], ...data };
      }
      utils.saveToLocalStorage(`purchaseOrders_${section}`, dataStores.purchaseOrders[section]);
      uiManager.loadPurchaseOrdersTable(section);
    } else if (table === 'sales_data') {
      const section = id;
      if (section && dataStores.salesData[section]) {
        dataStores.salesData[section] = { ...dataStores.salesData[section], ...data };
        try {
          const payload = dataManager.serializeForSupabase('sales_data', { ...dataStores.salesData[section], id: section });
          const { error } = await supabase.from('sales_data').update(payload).eq('id', section);
          if (error) {
            const { error: insertErr } = await supabase.from('sales_data').insert(payload);
            if (insertErr) console.error('Error persisting sales_data:', insertErr.message || insertErr);
          }
        } catch (e) {
          console.error('Error updating sales_data on server:', e);
        }
        utils.saveToLocalStorage(`salesData_${section}`, dataStores.salesData[section]);
        uiManager.updateReports(section);
        uiManager.updateDepartmentStats(section);
      }
    } else if (table === 'purchase_data') {
      const section = id;
      if (section && dataStores.purchaseData[section]) {
        dataStores.purchaseData[section] = { ...dataStores.purchaseData[section], ...data };
        try {
          const payload = dataManager.serializeForSupabase('purchase_data', { ...dataStores.purchaseData[section], id: section });
          const { error } = await supabase.from('purchase_data').update(payload).eq('id', section);
          if (error) {
            const { error: insertErr } = await supabase.from('purchase_data').insert(payload);
            if (insertErr) console.error('Error persisting purchase_data:', insertErr.message || insertErr);
          }
        } catch (e) {
          console.error('Error updating purchase_data on server:', e);
        }
        utils.saveToLocalStorage(`purchaseData_${section}`, dataStores.purchaseData[section]);
        uiManager.updatePurchaseReports(section);
        uiManager.updateDepartmentStats(section);
      }
    } else if (table === 'user_data') {
      const section = id;
      if (section && dataStores.userData[section]) {
        dataStores.userData[section] = { ...dataStores.userData[section], ...data };
        try {
          const payload = dataManager.serializeForSupabase('user_data', { ...dataStores.userData[section], id: section });
          const { error } = await supabase.from('user_data').update(payload).eq('id', section);
          if (error) {
            const { error: insertErr } = await supabase.from('user_data').insert(payload);
            if (insertErr) console.error('Error persisting user_data:', insertErr.message || insertErr);
          }
        } catch (e) {
          console.error('Error updating user_data on server:', e);
        }
        utils.saveToLocalStorage(`userData_${section}`, dataStores.userData[section]);
        uiManager.updateUserStats(section);
      }
    } else if (table === 'transactions') {
      const section = data.section;
      const payload = dataManager.serializeForSupabase('transactions', data);
      if (!id) {
        const { data: resultData, error } = await supabase.from('transactions').insert(payload).select();
        if (error) throw error;
        const created = { ...data, id: resultData[0].id };
        dataStores.transactions[section].push(created);
      } else {
        const { error } = await supabase.from('transactions').update(payload).eq('id', id);
        if (error) throw error;
        const index = dataStores.transactions[section].findIndex(tx => tx.id === id);
        if (index !== -1) dataStores.transactions[section][index] = { ...dataStores.transactions[section][index], ...data };
      }
      const stats = dataStores.transactionData[section];
      stats.totalVolume += Number(data.amount) || 0;
      stats.totalCharges += Number(data.charge) || 0;
      stats.totalTransactions += 1;
      if (stats.byType[data.type] !== undefined) stats.byType[data.type] += 1;
      utils.saveToLocalStorage(`transactions_${section}`, dataStores.transactions[section]);
      utils.saveToLocalStorage(`transactionData_${section}`, dataStores.transactionData[section]);
      uiManager.loadTransactionsTable(section);
      uiManager.updateTransactionAnalytics(section);
    } else if (table === 'daily_balances') {
      const section = data.section;
      const payload = dataManager.serializeForSupabase('daily_balances', data);
      const { data: resultData, error } = await supabase
        .from('daily_balances')
        .upsert(payload, { onConflict: 'section,balance_date' })
        .select();
      if (error) throw error;
      const d = data.balance_date;
      const existing = dataStores.balances[section][d] || {};
      dataStores.balances[section][d] = {
        ...existing,
        openingCash: data.opening_cash !== undefined ? data.opening_cash : existing.openingCash,
        openingPos: data.opening_pos !== undefined ? data.opening_pos : existing.openingPos,
        closingCash: data.closing_cash !== undefined ? data.closing_cash : existing.closingCash,
        closingPos: data.closing_pos !== undefined ? data.closing_pos : existing.closingPos,
        recordedAt: data.recorded_at || existing.recordedAt
      };
      utils.saveToLocalStorage(`balances_${section}`, dataStores.balances[section]);
      uiManager.loadDailyBalancesTable(section);
      uiManager.updateDepartmentStats(section);
    }
    
    return { id };
  },
  
  calculateSaleProfit: (items) => {
    let totalCost = 0;
    items.forEach(item => {
      const inventoryItem = dataStores.inventory[currentSection].find(invItem => invItem.id === item.id);
      if (inventoryItem) {
        totalCost += (inventoryItem.cost || 0) * item.quantity;
      }
    });
    return items.reduce((sum, item) => sum + item.total, 0) - totalCost;
  },
  
  syncPendingChanges: async () => {
    if (!navigator.onLine) return;
    
    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) syncStatus.classList.add('show');
    
    const pendingChanges = utils.loadFromLocalStorage('pendingChanges', {});
    
    if (Object.keys(pendingChanges).length > 0) {
      const promises = [];
      
        Object.keys(pendingChanges).forEach(table => {
          // Process new documents
          if (pendingChanges[table].new && pendingChanges[table].new.length > 0) {
          pendingChanges[table].new.forEach(data => {
            let dataForSupabase = dataManager.serializeForSupabase(table, data);
            delete dataForSupabase.id;
            
            promises.push(
              supabase
                .from(table)
                .insert(dataForSupabase)
                .select()
                .then(({ data: result, error }) => {
                  if (error) throw error;
                  
                  // Update local data with real ID
                  if (table === 'inventory') {
                    const index = dataStores.inventory[data.section].findIndex(item => item.id === data.id);
                    if (index !== -1) {
                      dataStores.inventory[data.section][index].id = result[0].id;
                      dataStores.inventory[data.section][index].isOffline = false;
                      utils.saveToLocalStorage(`inventory_${data.section}`, dataStores.inventory[data.section]);
                    }
                  } else if (table === 'suppliers') {
                    const index = dataStores.suppliers[data.section].findIndex(item => item.id === data.id);
                    if (index !== -1) {
                      dataStores.suppliers[data.section][index].id = result[0].id;
                      dataStores.suppliers[data.section][index].isOffline = false;
                      utils.saveToLocalStorage(`suppliers_${data.section}`, dataStores.suppliers[data.section]);
                    }
                  } else if (table === 'purchase_orders') {
                    const index = dataStores.purchaseOrders[data.section].findIndex(item => item.id === data.id);
                    if (index !== -1) {
                      dataStores.purchaseOrders[data.section][index].id = result[0].id;
                      dataStores.purchaseOrders[data.section][index].isOffline = false;
                      utils.saveToLocalStorage(`purchaseOrders_${data.section}`, dataStores.purchaseOrders[data.section]);
                    }
                  }
                  pendingChanges[table].new = (pendingChanges[table].new || []).filter(x => x.id !== data.id);
                  utils.saveToLocalStorage('pendingChanges', pendingChanges);
                  return result[0];
                })
            );
          });
          }

          // Process existing documents
          Object.keys(pendingChanges[table]).forEach(id => {
            if (id !== 'new' && pendingChanges[table][id]) {
              const data = pendingChanges[table][id];
            
            let dataForSupabase = dataManager.serializeForSupabase(table, data);
            
            promises.push(
              supabase
                .from(table)
                .update(dataForSupabase)
                .eq('id', id)
                .select()
                .then(({ data: result, error }) => {
                  if (error) throw error;
                  delete pendingChanges[table][id];
                  utils.saveToLocalStorage('pendingChanges', pendingChanges);
                  return result[0];
                })
            );
            }
          });

          // Process deletions
          if (pendingChanges[table].deleteIds && pendingChanges[table].deleteIds.length > 0) {
            const ids = [...pendingChanges[table].deleteIds];
            ids.forEach(id => {
              promises.push(
                supabase
                  .from(table)
                  .delete()
                  .eq('id', id)
                  .then(({ error }) => {
                    if (error) throw error;
                    pendingChanges[table].deleteIds = (pendingChanges[table].deleteIds || []).filter(x => x !== id);
                    utils.saveToLocalStorage('pendingChanges', pendingChanges);
                    return { id };
                  })
              );
            });
          }
        });

        try {
          await Promise.all(promises);
          if (syncStatus) syncStatus.classList.remove('show');
          utils.showNotification('Changes synced', 'success');
          dataManager.loadDataFromSupabase();
        } catch (error) {
          console.error('Error syncing changes:', error);
          if (syncStatus) syncStatus.classList.remove('show');
          utils.showNotification('Error syncing changes. Please try again later.', 'error');
        }
    } else {
      if (syncStatus) syncStatus.classList.remove('show');
    }
  },
  
  loadDataFromSupabase: async () => {
    if (!navigator.onLine) return;
    
    try {
      // Load inventory
      sections.forEach(section => {
        supabase
          .from('inventory')
          .select('*')
          .eq('section', section)
          .then(({ data, error }) => {
            if (error) {
              console.error(`Error loading ${section} inventory:`, error);
              utils.showNotification(`Error loading ${section} inventory. Using cached data.`, 'warning');
              return;
            }
            const localArr = dataStores.inventory[section] || [];
            const pending = utils.loadFromLocalStorage('pendingChanges', {});
            const pendingDeleteIds = (pending.inventory && pending.inventory.deleteIds) ? pending.inventory.deleteIds : [];
            const remoteArr = (data || []).filter(item => !pendingDeleteIds.includes(item.id));
            const byId = {};
            localArr.filter(item => !pendingDeleteIds.includes(item.id)).forEach(item => { byId[item.id] = item; });
            remoteArr.forEach(item => { byId[item.id] = { ...(byId[item.id] || {}), ...item, isOffline: false }; });
            dataStores.inventory[section] = Object.values(byId);
            utils.saveToLocalStorage(`inventory_${section}`, dataStores.inventory[section]);
            uiManager.loadInventoryTable(section);
            uiManager.updateDepartmentStats(section);
            uiManager.updateCategoryInventorySummary(section);
            uiManager.updateTotalInventory();
          });
      });
      
      // Load suppliers
      sections.forEach(section => {
        supabase
          .from('suppliers')
          .select('*')
          .eq('section', section)
          .then(({ data, error }) => {
            if (error) {
              console.error(`Error loading ${section} suppliers:`, error);
              utils.showNotification(`Error loading ${section} suppliers. Using cached data.`, 'warning');
              return;
            }
            const localArr = dataStores.suppliers[section] || [];
            const pending2 = utils.loadFromLocalStorage('pendingChanges', {});
            const pendingDeleteIds2 = (pending2.suppliers && pending2.suppliers.deleteIds) ? pending2.suppliers.deleteIds : [];
            const remoteArr = (data || []).filter(item => !pendingDeleteIds2.includes(item.id));
            const byId = {};
            localArr.filter(item => !pendingDeleteIds2.includes(item.id)).forEach(item => { byId[item.id] = item; });
            remoteArr.forEach(item => { byId[item.id] = { ...(byId[item.id] || {}), ...item, isOffline: false }; });
            dataStores.suppliers[section] = Object.values(byId);
            utils.saveToLocalStorage(`suppliers_${section}`, dataStores.suppliers[section]);
            uiManager.loadSuppliersTable(section);
          });
      });
      
      // Load purchase orders
      sections.forEach(section => {
        supabase
          .from('purchase_orders')
          .select('*')
          .eq('section', section)
          .then(({ data, error }) => {
            if (error) {
              console.error(`Error loading ${section} purchase orders:`, error);
              utils.showNotification(`Error loading ${section} purchase orders. Using cached data.`, 'warning');
              return;
            }
            const localArr = dataStores.purchaseOrders[section] || [];
            const pending3 = utils.loadFromLocalStorage('pendingChanges', {});
            const pendingDeleteIds3 = (pending3.purchase_orders && pending3.purchase_orders.deleteIds) ? pending3.purchase_orders.deleteIds : [];
            const remoteArr = (data || []).filter(item => !pendingDeleteIds3.includes(item.id));
            const byId = {};
            localArr.filter(item => !pendingDeleteIds3.includes(item.id)).forEach(item => { byId[item.id] = item; });
            remoteArr.forEach(item => { byId[item.id] = { ...(byId[item.id] || {}), ...item, isOffline: false }; });
            dataStores.purchaseOrders[section] = Object.values(byId);
            utils.saveToLocalStorage(`purchaseOrders_${section}`, dataStores.purchaseOrders[section]);
            uiManager.loadPurchaseOrdersTable(section);
            uiManager.loadPurchasesTable(section);
          });
      });
      
      // Load sales data
      sections.forEach(section => {
        supabase
          .from('sales_data')
          .select('*')
          .eq('id', section)
          .single()
          .then(({ data, error }) => {
            if (error && error.code !== 'PGRST116') {
              console.error(`Error loading ${section} sales data:`, error);
              utils.showNotification(`Error loading ${section} sales data. Using cached data.`, 'warning');
              return;
            }
            
            if (data) {
              dataStores.salesData[section] = {
                totalSales: data.totalSales || 0,
                totalTransactions: data.totalTransactions || 0,
                avgTransaction: data.totalSales && data.totalTransactions ? data.totalSales / data.totalTransactions : 0,
                topItem: data.topItem || '-',
                dailySales: data.dailySales || 0,
                dailyTransactions: data.dailyTransactions || 0,
                profit: data.profit || 0,
                profitMargin: data.totalSales && data.profit ? (data.profit / data.totalSales) * 100 : 0
              };
              utils.saveToLocalStorage(`salesData_${section}`, dataStores.salesData[section]);
              uiManager.updateReports(section);
              uiManager.updateDepartmentStats(section);
            } else {
              // Create initial record
              const initialSalesData = {
                id: section,
                totalSales: 0, totalTransactions: 0, topItem: '-',
                dailySales: 0, dailyTransactions: 0, profit: 0
              };
              supabase
                .from('sales_data')
                .insert(initialSalesData)
                .then(({ data, error }) => {
                  if (!error) {
                    dataStores.salesData[section] = {
                      totalSales: 0, totalTransactions: 0, avgTransaction: 0, topItem: '-',
                      dailySales: 0, dailyTransactions: 0, profit: 0, profitMargin: 0
                    };
                    utils.saveToLocalStorage(`salesData_${section}`, dataStores.salesData[section]);
                    uiManager.updateReports(section);
                    uiManager.updateDepartmentStats(section);
                  }
                });
            }
          });
      });
      
      // Load purchase data
      sections.forEach(section => {
        supabase
          .from('purchase_data')
          .select('*')
          .eq('id', section)
          .single()
          .then(({ data, error }) => {
            if (error && error.code !== 'PGRST116') {
              console.error(`Error loading ${section} purchase data:`, error);
              utils.showNotification(`Error loading ${section} purchase data. Using cached data.`, 'warning');
              return;
            }
            
            if (data) {
              dataStores.purchaseData[section] = {
                totalPurchases: data.totalPurchases || 0,
                totalTransactions: data.totalTransactions || 0,
                avgTransaction: data.totalPurchases && data.totalTransactions ? data.totalPurchases / data.totalTransactions : 0,
                topSupplier: data.topSupplier || '-',
                dailyPurchases: data.dailyPurchases || 0,
                dailyTransactions: data.dailyTransactions || 0
              };
              utils.saveToLocalStorage(`purchaseData_${section}`, dataStores.purchaseData[section]);
              uiManager.updatePurchaseReports(section);
              uiManager.updateDepartmentStats(section);
            } else {
              // Create initial record
              const initialPurchaseData = {
                id: section,
                totalPurchases: 0, totalTransactions: 0,
                topSupplier: '-', dailyPurchases: 0, dailyTransactions: 0
              };
              supabase
                .from('purchase_data')
                .insert(initialPurchaseData)
                .then(({ data, error }) => {
                  if (!error) {
                    dataStores.purchaseData[section] = {
                      totalPurchases: 0, totalTransactions: 0, avgTransaction: 0,
                      topSupplier: '-', dailyPurchases: 0, dailyTransactions: 0
                    };
                    utils.saveToLocalStorage(`purchaseData_${section}`, dataStores.purchaseData[section]);
                    uiManager.updatePurchaseReports(section);
                    uiManager.updateDepartmentStats(section);
                  }
                });
            }
          });
      });
      
      // Load user data
      sections.forEach(section => {
        supabase
          .from('user_data')
          .select('*')
          .eq('id', section)
          .single()
          .then(({ data, error }) => {
            if (error && error.code !== 'PGRST116') {
              console.error(`Error loading ${section} user data:`, error);
              utils.showNotification(`Error loading ${section} user data. Using cached data.`, 'warning');
              return;
            }
            
            if (data) {
              dataStores.userData[section] = {
                transactions: data.transactions || 0,
                sales: data.sales || 0,
                purchases: data.purchases || 0
              };
              utils.saveToLocalStorage(`userData_${section}`, dataStores.userData[section]);
              uiManager.updateUserStats(section);
            } else {
              // Create initial record
              const initialUserData = {
                id: section,
                transactions: 0, sales: 0, purchases: 0
              };
              supabase
                .from('user_data')
                .insert(initialUserData)
                .then(({ data, error }) => {
                  if (!error) {
                    dataStores.userData[section] = {
                      transactions: 0, sales: 0, purchases: 0
                    };
                    utils.saveToLocalStorage(`userData_${section}`, dataStores.userData[section]);
                    uiManager.updateUserStats(section);
                  }
                });
            }
          });
      });

      // Load transactions
      sections.forEach(section => {
        supabase
          .from('transactions')
          .select('*')
          .eq('section', section)
          .then(({ data, error }) => {
            if (error) {
              console.error(`Error loading ${section} transactions:`, error);
              utils.showNotification(`Error loading ${section} transactions. Using cached data.`, 'warning');
              return;
            }
            const localArr = dataStores.transactions[section] || [];
            const remoteArr = data || [];
            const byId = {};
            localArr.forEach(item => { byId[item.id] = item; });
            remoteArr.forEach(item => { byId[item.id] = { ...byId[item.id], ...item, isOffline: false }; });
            dataStores.transactions[section] = Object.values(byId);
            const stats = {
              totalVolume: 0,
              totalCharges: 0,
              totalTransactions: 0,
              byType: {
                withdraw: 0, transfer_in: 0, transfer_out: 0, deposit: 0, bill_payment: 0, airtime: 0, data: 0, pos_purchase: 0
              }
            };
            dataStores.transactions[section].forEach(tx => {
              stats.totalVolume += Number(tx.amount) || 0;
              stats.totalCharges += Number(tx.charge) || 0;
              stats.totalTransactions += 1;
              if (stats.byType[tx.type] !== undefined) stats.byType[tx.type] += 1;
            });
            dataStores.transactionData[section] = stats;
            utils.saveToLocalStorage(`transactions_${section}`, dataStores.transactions[section]);
            utils.saveToLocalStorage(`transactionData_${section}`, dataStores.transactionData[section]);
            uiManager.loadTransactionsTable(section);
            uiManager.updateTransactionAnalytics(section);
          });
      });

      // Load sales history
      sections.forEach(section => {
        supabase
          .from('sales')
          .select('*')
          .eq('section', section)
          .then(({ data, error }) => {
            if (error) {
              console.error(`Error loading ${section} sales history:`, error);
              utils.showNotification(`Error loading ${section} sales history. Using cached data.`, 'warning');
              return;
            }
            const localArr = dataStores.sales[section] || [];
            const remoteArr = data || [];
            const byId = {};
            localArr.forEach(item => { byId[item.id] = item; });
            remoteArr.forEach(item => { byId[item.id] = { ...byId[item.id], ...item, isOffline: false }; });
            dataStores.sales[section] = Object.values(byId);
            utils.saveToLocalStorage(`sales_${section}`, dataStores.sales[section]);
            uiManager.loadSalesTable(section);
            dataManager.recomputeTopItem(section);
          });
      });

      // Load purchases history
      sections.forEach(section => {
        supabase
          .from('purchases')
          .select('*')
          .eq('section', section)
          .then(({ data, error }) => {
            if (error) {
              console.warn(`Error loading ${section} purchases history:`, error);
              return;
            }
            const localArr = dataStores.purchases[section] || [];
            const remoteArr = data || [];
            const byId = {};
            localArr.forEach(item => { byId[item.id] = item; });
            remoteArr.forEach(item => { byId[item.id] = { ...byId[item.id], ...item, isOffline: false }; });
            dataStores.purchases[section] = Object.values(byId);
            utils.saveToLocalStorage(`purchases_${section}`, dataStores.purchases[section]);
            uiManager.loadPurchasesTable(section);
            uiManager.updatePurchaseReports(section);
            uiManager.updateFinancialReports(section);
        });
      });

      // Load daily balances
      sections.forEach(section => {
        supabase
          .from('daily_balances')
          .select('*')
          .eq('section', section)
          .then(({ data, error }) => {
            if (error) {
              console.warn(`Error loading ${section} daily balances:`, error);
              return;
            }
            const remote = Array.isArray(data) ? data : [];
            const merged = { ...(dataStores.balances[section] || {}) };
            remote.forEach(row => {
              const d = row.balance_date;
              merged[d] = {
                ...(merged[d] || {}),
                openingCash: row.opening_cash ?? (merged[d] ? merged[d].openingCash : undefined),
                openingPos: row.opening_pos ?? (merged[d] ? merged[d].openingPos : undefined),
                closingCash: row.closing_cash ?? (merged[d] ? merged[d].closingCash : undefined),
                closingPos: row.closing_pos ?? (merged[d] ? merged[d].closingPos : undefined),
                recordedAt: row.recorded_at ?? (merged[d] ? merged[d].recordedAt : undefined)
              };
            });
            dataStores.balances[section] = merged;
            utils.saveToLocalStorage(`balances_${section}`, dataStores.balances[section]);
            uiManager.loadDailyBalancesTable(section);
            uiManager.updateDepartmentStats(section);
          });
      });
    } catch (error) {
      console.error('Error loading data from Supabase:', error);
      utils.showNotification('Error loading data from server. Using cached data.', 'warning');
    }
  }
};

// UI management
const uiManager = {
  updateUserInfo: (user) => {
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin User';
    const email = user.email || '';
    const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase();
    
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = displayName;
    
    const userAvatarEl = document.getElementById('userAvatar');
    if (userAvatarEl) userAvatarEl.textContent = initials;
    
    sections.forEach(section => {
      const profileNameEl = document.getElementById(`${section}-profile-name`);
      if (profileNameEl) profileNameEl.textContent = displayName;
      
      const profileAvatarEl = document.getElementById(`${section}-profile-avatar`);
      if (profileAvatarEl) profileAvatarEl.textContent = initials;
      
      const emailEl = document.getElementById(`${section}-email`);
      if (emailEl) emailEl.value = email;
    });
  },
  
  handleOnlineStatus: () => {
    const offlineIndicator = document.getElementById('offlineIndicator');
    if (offlineIndicator) offlineIndicator.classList.remove('show');
    utils.showNotification('Connection restored. Syncing data...', 'info');
    dataManager.syncPendingChanges();
    dataManager.loadDataFromSupabase();
  },
  
  handleOfflineStatus: () => {
    const offlineIndicator = document.getElementById('offlineIndicator');
    if (offlineIndicator) offlineIndicator.classList.add('show');
    utils.showNotification('You\'re now offline. Changes will be saved locally.', 'warning');
  },
  
  initializeApp: () => {
  sections.forEach(section => {
    uiManager.initializePOSSearch(section);
    uiManager.updateCart(section);
    uiManager.updateDepartmentStats(section);
    uiManager.loadInventoryTable(section);
    uiManager.updateReports(section);
    uiManager.updatePurchaseReports(section);
    uiManager.updateFinancialReports(section);
    uiManager.loadSuppliersTable(section);
    uiManager.loadPurchaseOrdersTable(section);
    uiManager.updateUserStats(section);
    uiManager.updateCategoryInventorySummary(section);
    uiManager.updateTransactionAnalytics(section);
    uiManager.loadTransactionsTable(section);
    uiManager.loadSalesTable(section);
    uiManager.loadPurchasesTable(section);
    const openingCashInput = document.getElementById(`${section}-opening-cash-input`);
    const openingPosInput = document.getElementById(`${section}-opening-pos-input`);
    const setOpeningBtn = document.querySelector(`.js-set-opening-btn[data-section="${section}"]`);
    if (setOpeningBtn && openingCashInput && openingPosInput) {
      setOpeningBtn.addEventListener('click', () => {
        const cash = parseFloat(openingCashInput.value) || 0;
        const pos = parseFloat(openingPosInput.value) || 0;
        const dateSel = selectedDate[section] || utils.getTodayDate();
        dataStores.balances[section][dateSel] = { openingCash: cash, openingPos: pos };
        dataStores.openingCutoff[section][dateSel] = new Date().toISOString();
        utils.saveToLocalStorage(`balances_${section}`, dataStores.balances[section]);
        utils.saveToLocalStorage(`openingCutoff_${section}`, dataStores.openingCutoff[section]);
        if (navigator.onLine) {
          const row = {
            section,
            balance_date: dateSel,
            opening_cash: cash,
            opening_pos: pos,
            recorded_at: new Date().toISOString(),
            created_by: currentUser ? currentUser.id : 'offline_user'
          };
          dataManager.saveDataToSupabase('daily_balances', row)
            .catch(err => console.error('Error saving opening daily balance:', err));
        } else {
          const pending = utils.loadFromLocalStorage('pendingChanges', {});
          pending.daily_balances = pending.daily_balances || { new: [] };
          pending.daily_balances.new.push({
            id: utils.generateOfflineId(),
            section,
            balance_date: dateSel,
            opening_cash: cash,
            opening_pos: pos,
            recorded_at: new Date().toISOString(),
            created_by: currentUser ? currentUser.id : 'offline_user'
          });
          utils.saveToLocalStorage('pendingChanges', pending);
        }
        uiManager.updateTransactionAnalytics(section);
        utils.showNotification('Opening balance set', 'success');
        openingCashInput.value = '';
        openingPosInput.value = '';
      });
    }

    const dateInput = document.getElementById(`${section}-date-selector`);
    if (dateInput) {
      if (!dateInput.value) dateInput.value = selectedDate[section];
      dateInput.addEventListener('change', () => {
        selectedDate[section] = dateInput.value || utils.getTodayDate();
        uiManager.updateTransactionAnalytics(section);
        uiManager.loadTransactionsTable(section);
        uiManager.updateDepartmentStats(section);
      });
    }

    const dbDate = document.getElementById(`${section}-daily-balance-date`);
    const saveBtn = document.querySelector(`.js-save-daily-balance-btn[data-section="${section}"]`);
    const cashInput = document.getElementById(`${section}-closing-cash-input`);
    const posInput = document.getElementById(`${section}-closing-pos-input`);
    if (dbDate && !dbDate.value) dbDate.value = selectedDate[section];
    if (saveBtn && cashInput && posInput) {
      saveBtn.addEventListener('click', () => {
        const d = (dbDate && dbDate.value) ? dbDate.value : (selectedDate[section] || utils.getTodayDate());
        const c = parseFloat(cashInput.value) || 0;
        const p = parseFloat(posInput.value) || 0;
        dataStores.balances[section][d] = { ...(dataStores.balances[section][d] || {}), closingCash: c, closingPos: p, recordedAt: new Date().toISOString() };
        utils.saveToLocalStorage(`balances_${section}`, dataStores.balances[section]);
        if (navigator.onLine) {
          const row = {
            section,
            balance_date: d,
            closing_cash: c,
            closing_pos: p,
            recorded_at: new Date().toISOString(),
            created_by: currentUser ? currentUser.id : 'offline_user'
          };
          dataManager.saveDataToSupabase('daily_balances', row)
            .catch(err => console.error('Error saving daily balance:', err));
        } else {
          const pending = utils.loadFromLocalStorage('pendingChanges', {});
          pending.daily_balances = pending.daily_balances || { new: [] };
          pending.daily_balances.new.push({
            id: utils.generateOfflineId(),
            section,
            balance_date: d,
            closing_cash: c,
            closing_pos: p,
            recorded_at: new Date().toISOString(),
            created_by: currentUser ? currentUser.id : 'offline_user'
          });
          utils.saveToLocalStorage('pendingChanges', pending);
        }
        uiManager.loadDailyBalancesTable(section);
        uiManager.updateDepartmentStats(section);
        utils.showNotification('Daily balance saved', 'success');
        cashInput.value = '';
        posInput.value = '';
      });
      if (dbDate) {
        dbDate.addEventListener('change', () => {
          uiManager.loadDailyBalancesTable(section);
        });
      }
    }

      const form = document.getElementById(`${section}-account-form`);
      if (form) {
        form.addEventListener('submit', function(e) {
          e.preventDefault();
          // saveAccountInfo(section);
        });
      }
      
      const searchInput = document.querySelector(`.js-inventory-search[data-section="${section}"]`);
      if (searchInput) {
        searchInput.addEventListener('input', function() {
          uiManager.filterInventory(section, this.value);
        });
      }
  });
  
  uiManager.updateTotalInventory();
  },
  
  initializePOSSearch: (section) => {
    const searchInput = document.querySelector(`.js-pos-search[data-section="${section}"]`);
    const searchResults = document.querySelector(`.js-pos-search-results[data-section="${section}"]`);
    
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim().toLowerCase();
        
        if (searchTerm.length === 0) {
          searchResults.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon"><i class="fas fa-search"></i></div>
              <h3 class="empty-state-title">Search for Products</h3>
              <p class="empty-state-description">Type in the search box above to find products from your inventory.</p>
            </div>
          `;
          return;
        }
        
        const filteredItems = dataStores.inventory[section].filter(item => 
          item.name.toLowerCase().includes(searchTerm)
        );
        
        if (filteredItems.length === 0) {
          searchResults.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon"><i class="fas fa-search"></i></div>
              <h3 class="empty-state-title">No Products Found</h3>
              <p class="empty-state-description">Try a different search term or add new products to your inventory.</p>
            </div>
          `;
        } else {
          searchResults.innerHTML = '';
          filteredItems.forEach(item => {
            const resultItem = document.createElement('div');
            resultItem.className = 'pos-search-result-item';
            resultItem.setAttribute('data-id', item.id);
            
            resultItem.innerHTML = `
              <div class="pos-item-info">
                <div class="pos-item-name">${item.name}</div>
                <div class="pos-item-stock">Stock: ${item.stock}</div>
              </div>
              <div class="pos-item-price">₦${item.price.toFixed(2)}</div>
            `;
            
            searchResults.appendChild(resultItem);
          });
        }
      });
    }
  },
  
  updateCart: (section) => {
    const cartItemsContainer = document.querySelector(`.js-cart-items[data-section="${section}"]`);
    if (!cartItemsContainer) return;
    
    cartItemsContainer.innerHTML = '';
    let subtotal = 0;
    
    if (dataStores.carts[section].length === 0) {
      cartItemsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-shopping-cart"></i></div>
          <h3 class="empty-state-title">Your Cart is Empty</h3>
          <p class="empty-state-description">Search for products to add to your cart.</p>
        </div>
      `;
      const checkoutBtn = document.querySelector(`.js-checkout-btn[data-section="${section}"]`);
      if (checkoutBtn) checkoutBtn.disabled = true;
    } else {
      dataStores.carts[section].forEach(item => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.setAttribute('data-item-id', item.id);
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        
        cartItem.innerHTML = `
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-details">₦${item.price.toFixed(2)} × ${item.quantity}</div>
          </div>
          <div class="cart-item-actions">
            <button class="quantity-btn">-</button>
            <span>${item.quantity}</span>
            <button class="quantity-btn">+</button>
            <button class="action-btn delete"><i class="fas fa-trash"></i></button>
          </div>
        `;
        cartItemsContainer.appendChild(cartItem);
      });
      const checkoutBtn = document.querySelector(`.js-checkout-btn[data-section="${section}"]`);
      if (checkoutBtn) checkoutBtn.disabled = false;
    }
    
    const subtotalEl = document.querySelector(`.js-subtotal[data-section="${section}"]`);
    if (subtotalEl) subtotalEl.textContent = `₦${subtotal.toFixed(2)}`;
    
    const totalEl = document.querySelector(`.js-total[data-section="${section}"]`);
    if (totalEl) totalEl.textContent = `₦${subtotal.toFixed(2)}`;
  },
  
  loadInventoryTable: (section) => {
    const inventoryContainer = document.querySelector(`.js-inventory-container[data-section="${section}"]`);
    if (!inventoryContainer) return;
    
    inventoryContainer.innerHTML = '';
    
    const searchInput = document.querySelector(`.js-inventory-search[data-section="${section}"]`);
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const pending = utils.loadFromLocalStorage('pendingChanges', {});
    const pendingDeleteIds = (pending.inventory && pending.inventory.deleteIds) ? pending.inventory.deleteIds : [];
    let filteredItems = (dataStores.inventory[section] || []).filter(item => !pendingDeleteIds.includes(item.id));
    if (currentFilter !== 'all') {
      filteredItems = filteredItems.filter(item => {
        const status = utils.getProductStatus(item);
        return status === currentFilter;
      });
    }
    
    if (searchTerm) {
      filteredItems = filteredItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm)
      );
    }
    
    if (filteredItems.length === 0) {
      inventoryContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-warehouse"></i></div>
          <h3 class="empty-state-title">${searchTerm ? 'No Products Found' : 'No Products in Inventory'}</h3>
          <p class="empty-state-description">${searchTerm ? 'Try a different search term or add new products.' : 'Start by adding products to your inventory.'}</p>
          <button class="btn btn-primary js-add-inventory-btn" data-section="${section}">
            <i class="fas fa-plus"></i> Add Your First Product
          </button>
        </div>
      `;
      return;
    }
    
    const inventoryTable = document.createElement('table');
    inventoryTable.className = 'inventory-table';
    
    inventoryTable.innerHTML = `
      <thead>
        <tr>
          <th>Product</th>
          <th>Price</th>
          <th>Cost</th>
          <th>Profit</th>
          <th>Stock</th>
          <th>Expiry Date</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filteredItems.map(item => {
          const status = utils.getProductStatus(item);
          let statusClass = '';
          let statusText = '';
          
          if (status === 'in-stock') {
            statusClass = 'status-in-stock';
            statusText = 'In Stock';
          } else if (status === 'low-stock') {
            statusClass = 'status-low-stock';
            statusText = 'Low Stock';
          } else if (status === 'out-of-stock') {
            statusClass = 'status-out-of-stock';
            statusText = 'Out of Stock';
          } else if (status === 'expired') {
            statusClass = 'status-expired';
            statusText = 'Expired';
          } else if (status === 'expiring-soon') {
            statusClass = 'status-expiring-soon';
            statusText = 'Expiring Soon';
          }
          
          const profit = item.price - (item.cost || 0);
          const profitMargin = item.price > 0 ? (profit / item.price) * 100 : 0;
          
          return `
            <tr data-item-id="${item.id}">
              <td>${item.name} ${item.isOffline ? '<i class="fas fa-wifi" style="color: #f39c12;" title="Pending sync"></i>' : ''}</td>
              <td>₦${item.price.toFixed(2)}</td>
              <td>₦${(item.cost || 0).toFixed(2)}</td>
              <td>₦${profit.toFixed(2)} (${profitMargin.toFixed(1)}%)</td>
              <td>${item.stock}</td>
              <td>${utils.formatDate(item.expiry_date)}</td>
              <td><span class="status-badge ${statusClass}">${statusText}</span></td>
              <td>
                <button class="action-btn"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
    
    inventoryContainer.appendChild(inventoryTable);
  },
  loadCategoryTable: (section) => {
    const container = document.querySelector(`.js-category-container[data-section="${section}"]`);
    if (!container) return;
    container.innerHTML = '';
    let filteredItems = (dataStores.inventory[section] || []).slice();
    if (currentFilter && currentFilter !== 'all') {
      filteredItems = filteredItems.filter(item => utils.getProductStatus(item) === currentFilter);
    }
    if (filteredItems.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-warehouse"></i></div>
          <h3 class="empty-state-title">No Products</h3>
          <p class="empty-state-description">No products match the selected category.</p>
          <button class="btn btn-primary js-add-inventory-btn" data-section="${section}">
            <i class="fas fa-plus"></i> Add Product
          </button>
        </div>
      `;
      return;
    }
    const table = document.createElement('table');
    table.className = 'inventory-table transactions-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Product</th>
          <th>Price</th>
          <th>Cost</th>
          <th>Profit</th>
          <th>Stock</th>
          <th>Expiry Date</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filteredItems.map(item => {
          const status = utils.getProductStatus(item);
          let statusClass = '';
          let statusText = '';
          if (status === 'in-stock') { statusClass = 'status-in-stock'; statusText = 'In Stock'; }
          else if (status === 'low-stock') { statusClass = 'status-low-stock'; statusText = 'Low Stock'; }
          else if (status === 'out-of-stock') { statusClass = 'status-out-of-stock'; statusText = 'Out of Stock'; }
          else if (status === 'expired') { statusClass = 'status-expired'; statusText = 'Expired'; }
          else if (status === 'expiring-soon') { statusClass = 'status-expiring-soon'; statusText = 'Expiring Soon'; }
          const profit = item.price - (item.cost || 0);
          const margin = item.price > 0 ? (profit / item.price) * 100 : 0;
          return `
            <tr data-item-id="${item.id}">
              <td>${item.name} ${item.isOffline ? '<i class="fas fa-wifi" style="color:#f39c12;" title="Pending sync"></i>' : ''}</td>
              <td>₦${item.price.toFixed(2)}</td>
              <td>₦${(item.cost || 0).toFixed(2)}</td>
              <td>₦${profit.toFixed(2)} (${margin.toFixed(1)}%)</td>
              <td>${item.stock}</td>
              <td>${utils.formatDate(item.expiry_date)}</td>
              <td><span class="status-badge ${statusClass}">${statusText}</span></td>
              <td>
                <button class="action-btn"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
    container.appendChild(table);
  },
  
  loadSuppliersTable: (section) => {
    const suppliersContainer = document.querySelector(`.js-suppliers-container[data-section="${section}"]`);
    if (!suppliersContainer) return;
    
    suppliersContainer.innerHTML = '';
    const pending = utils.loadFromLocalStorage('pendingChanges', {});
    const pendingDeleteIds = (pending.suppliers && pending.suppliers.deleteIds) ? pending.suppliers.deleteIds : [];
    const suppliers = (dataStores.suppliers[section] || []).filter(s => !pendingDeleteIds.includes(s.id));
    if (suppliers.length === 0) {
      suppliersContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-truck"></i></div>
          <h3 class="empty-state-title">No Suppliers Added</h3>
          <p class="empty-state-description">Start by adding suppliers to your department.</p>
          <button class="btn btn-primary js-add-supplier-btn" data-section="${section}">
            <i class="fas fa-plus"></i> Add Your First Supplier
          </button>
        </div>
      `;
      return;
    }
    
    const suppliersTable = document.createElement('table');
    suppliersTable.className = 'inventory-table';
    
    suppliersTable.innerHTML = `
      <thead>
        <tr>
          <th>Supplier</th>
          <th>Contact</th>
          <th>Email</th>
          <th>Products</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${suppliers.map(supplier => `
          <tr data-item-id="${supplier.id}">
            <td>${supplier.name} ${supplier.isOffline ? '<i class="fas fa-wifi" style="color: #f39c12;" title="Pending sync"></i>' : ''}</td>
            <td>${supplier.phone || 'N/A'}</td>
            <td>${supplier.email || 'N/A'}</td>
            <td>${supplier.products || 'N/A'}</td>
            <td>
              <button class="action-btn"><i class="fas fa-edit"></i></button>
              <button class="action-btn delete"><i class="fas fa-trash"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;
    
    suppliersContainer.appendChild(suppliersTable);
  },
  
  loadPurchaseOrdersTable: (section) => {
    const purchaseOrdersContainer = document.querySelector(`.js-purchase-orders-container[data-section="${section}"]`);
    if (!purchaseOrdersContainer) return;
    
    purchaseOrdersContainer.innerHTML = '';
    const pending = utils.loadFromLocalStorage('pendingChanges', {});
    const pendingDeleteIds = (pending.purchase_orders && pending.purchase_orders.deleteIds) ? pending.purchase_orders.deleteIds : [];
    const orders = (dataStores.purchaseOrders[section] || []).filter(o => !pendingDeleteIds.includes(o.id));
    if (orders.length === 0) {
      purchaseOrdersContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-file-invoice"></i></div>
          <h3 class="empty-state-title">No Purchase Orders</h3>
          <p class="empty-state-description">Start by creating purchase orders for your department.</p>
          <button class="btn btn-primary js-add-purchase-order-btn" data-section="${section}">
            <i class="fas fa-plus"></i> Create Your First Purchase Order
          </button>
        </div>
      `;
      return;
    }
    
    const purchaseOrdersTable = document.createElement('table');
    purchaseOrdersTable.className = 'inventory-table';
    
    purchaseOrdersTable.innerHTML = `
      <thead>
        <tr>
          <th>Order #</th>
          <th>Supplier</th>
          <th>Date</th>
          <th>Total</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map(order => {
          let statusClass = '';
          let statusText = '';
          
          if (order.status === 'pending') {
            statusClass = 'status-pending';
            statusText = 'Pending';
          } else if (order.status === 'received') {
            statusClass = 'status-received';
            statusText = 'Received';
          } else if (order.status === 'cancelled') {
            statusClass = 'status-cancelled';
            statusText = 'Cancelled';
          }
          
          return `
            <tr data-item-id="${order.id}">
              <td>${order.orderNumber || order.id} ${order.isOffline ? '<i class="fas fa-wifi" style="color: #f39c12;" title="Pending sync"></i>' : ''}</td>
              <td>${order.supplierName || 'N/A'}</td>
              <td>${utils.formatDate(order.orderDate)}</td>
              <td>₦${order.total.toFixed(2)}</td>
              <td><span class="status-badge ${statusClass}">${statusText}</span></td>
              <td>
                <button class="action-btn"><i class="fas fa-edit"></i></button>
                ${order.status === 'pending' ? `<button class="action-btn receive"><i class="fas fa-check"></i></button>` : ''}
                <button class="action-btn delete"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
    
    purchaseOrdersContainer.appendChild(purchaseOrdersTable);
  },
  
  updateTotalInventory: () => {
    let totalProducts = 0;
    let totalValue = 0;
    let totalCost = 0;
    let totalExpired = 0;
    let totalExpiringSoon = 0;
    
    sections.forEach(section => {
      dataStores.inventory[section].forEach(item => {
        totalProducts++;
        totalValue += item.price * item.stock;
        totalCost += (item.cost || 0) * item.stock;
        
        if (utils.isExpired(item.expiry_date)) {
          totalExpired++;
        } else if (utils.isExpiringSoon(item.expiry_date)) {
          totalExpiringSoon++;
        }
      });
    });
    
    const totalProfit = totalValue - totalCost;
    const profitMargin = totalValue > 0 ? (totalProfit / totalValue) * 100 : 0;
    
    const totalProductsEl = document.getElementById('total-products');
    if (totalProductsEl) totalProductsEl.textContent = totalProducts;
    
    const totalValueEl = document.getElementById('total-value');
    if (totalValueEl) totalValueEl.textContent = `₦${totalValue.toFixed(2)}`;
    
    const totalCostEl = document.getElementById('total-cost');
    if (totalCostEl) totalCostEl.textContent = `₦${totalCost.toFixed(2)}`;
    
    const totalProfitEl = document.getElementById('total-profit');
    if (totalProfitEl) totalProfitEl.textContent = `₦${totalProfit.toFixed(2)}`;
    
    const profitMarginEl = document.getElementById('total-profit-margin');
    if (profitMarginEl) profitMarginEl.textContent = `${profitMargin.toFixed(1)}%`;
    
    const totalExpiredEl = document.getElementById('total-expired');
    if (totalExpiredEl) totalExpiredEl.textContent = totalExpired;
    
    const totalExpiringSoonEl = document.getElementById('total-expiring-soon');
    if (totalExpiringSoonEl) totalExpiringSoonEl.textContent = totalExpiringSoon;
    
    uiManager.loadTotalInventoryTable();
  },
  
  loadTotalInventoryTable: () => {
    const inventoryContainer = document.querySelector('.js-total-inventory-container');
    if (!inventoryContainer) return;
    
    inventoryContainer.innerHTML = '';
    
    const searchInput = document.getElementById('total-inventory-search');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    // Combine all inventory items
    let allItems = [];
    sections.forEach(section => {
      dataStores.inventory[section].forEach(item => {
        allItems.push({ ...item, section });
      });
    });
    
    // Filter items
    let filteredItems = allItems;
    if (currentFilter !== 'all') {
      filteredItems = allItems.filter(item => {
        const status = utils.getProductStatus(item);
        return status === currentFilter;
      });
    }
    
    if (searchTerm) {
      filteredItems = filteredItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm)
      );
    }
    
    if (filteredItems.length === 0) {
      inventoryContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-warehouse"></i></div>
          <h3 class="empty-state-title">${searchTerm ? 'No Products Found' : 'No Products in Inventory'}</h3>
          <p class="empty-state-description">${searchTerm ? 'Try a different search term.' : 'Start by adding products to your inventory.'}</p>
        </div>
      `;
      return;
    }
    
    const inventoryTable = document.createElement('table');
    inventoryTable.className = 'inventory-table';
    
    inventoryTable.innerHTML = `
      <thead>
        <tr>
          <th>Product</th>
          <th>Department</th>
          <th>Price</th>
          <th>Cost</th>
          <th>Profit</th>
          <th>Stock</th>
          <th>Expiry Date</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filteredItems.map(item => {
          const status = utils.getProductStatus(item);
          let statusClass = '';
          let statusText = '';
          
          if (status === 'in-stock') {
            statusClass = 'status-in-stock';
            statusText = 'In Stock';
          } else if (status === 'low-stock') {
            statusClass = 'status-low-stock';
            statusText = 'Low Stock';
          } else if (status === 'out-of-stock') {
            statusClass = 'status-out-of-stock';
            statusText = 'Out of Stock';
          } else if (status === 'expired') {
            statusClass = 'status-expired';
            statusText = 'Expired';
          } else if (status === 'expiring-soon') {
            statusClass = 'status-expiring-soon';
            statusText = 'Expiring Soon';
          }
          
          const profit = item.price - (item.cost || 0);
          const profitMargin = item.price > 0 ? (profit / item.price) * 100 : 0;
          
          let sectionColor = '';
          if (item.section === 'grill') sectionColor = 'var(--grill-color)';
          else if (item.section === 'wholesale') sectionColor = 'var(--wholesale-color)';
          else if (item.section === 'building') sectionColor = 'var(--building-color)';
          else if (item.section === 'food') sectionColor = 'var(--food-color)';
          
          return `
            <tr data-item-id="${item.id}" data-section="${item.section}">
              <td>${item.name} ${item.isOffline ? '<i class="fas fa-wifi" style="color: #f39c12;" title="Pending sync"></i>' : ''}</td>
              <td><span style="color: ${sectionColor}; font-weight: 600;">${sectionNames[item.section]}</span></td>
              <td>₦${item.price.toFixed(2)}</td>
              <td>₦${(item.cost || 0).toFixed(2)}</td>
              <td>₦${profit.toFixed(2)} (${profitMargin.toFixed(1)}%)</td>
              <td>${item.stock}</td>
              <td>${utils.formatDate(item.expiry_date)}</td>
              <td><span class="status-badge ${statusClass}">${statusText}</span></td>
              <td>
                <button class="action-btn"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
    
    inventoryContainer.appendChild(inventoryTable);
  },
  
  filterTotalInventory: (searchTerm) => {
    uiManager.loadTotalInventoryTable();
  },

  loadDailyBalancesTable: (section) => {
    const tbody = document.getElementById(`${section}-daily-balances-table`);
    if (!tbody) return;
    const entries = Object.entries(dataStores.balances[section] || {})
      .map(([date, obj]) => ({ date, cash: Number(obj.closingCash) || 0, pos: Number(obj.closingPos) || 0 }))
      .filter(e => (e.cash !== 0 || e.pos !== 0));
    entries.sort((a,b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = entries.map(e => `<tr><td>${e.date}</td><td>₦${e.cash.toFixed(2)}</td><td>₦${e.pos.toFixed(2)}</td></tr>`).join('');
  },
  
  updateCategoryInventorySummary: (section) => {
    let totalProducts = 0;
    let totalValue = 0;
    let totalCost = 0;
    let lowStockCount = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;
    
    dataStores.inventory[section].forEach(item => {
      totalProducts++;
      totalValue += item.price * item.stock;
      totalCost += (item.cost || 0) * item.stock;
      
      const status = utils.getProductStatus(item);
      if (status === 'low-stock') {
        lowStockCount++;
      } else if (status === 'expiring-soon') {
        expiringSoonCount++;
      } else if (status === 'expired') {
        expiredCount++;
      }
    });
    
    const totalProfit = totalValue - totalCost;
    const profitMargin = totalValue > 0 ? (totalProfit / totalValue) * 100 : 0;
    
    // Update the summary cards with null checks
    const elements = [
      { id: `${section}-total-products`, value: totalProducts },
      { id: `${section}-total-value`, value: `₦${totalValue.toFixed(2)}` },
      { id: `${section}-total-cost`, value: `₦${totalCost.toFixed(2)}` },
      { id: `${section}-total-profit`, value: `₦${totalProfit.toFixed(2)}` },
      { id: `${section}-profit-margin`, value: `${profitMargin.toFixed(1)}%` },
      { id: `${section}-low-stock-count`, value: lowStockCount },
      { id: `${section}-expiring-soon-count`, value: expiringSoonCount },
      { id: `${section}-expired-count`, value: expiredCount }
    ];
    
    elements.forEach(el => {
      const element = document.getElementById(el.id);
      if (element) element.textContent = el.value;
    });
  },
  
  updateReports: (section) => {
    const sel = selectedDate[section] || null;
    let totalSales, avgTransaction, profit, profitMargin, totalTransactions;
    const isPos = (section === 'pos_mart' || section === 'pos1');
    if (isPos && sel) {
      const records = (dataStores.sales[section] || []).filter(r => ((r.timestamp || '').split('T')[0]) === sel);
      totalTransactions = records.length;
      totalSales = records.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
      profit = records.reduce((sum, r) => sum + (uiManager.calculateSaleProfitForSection(r.items || [], section) || 0), 0);
      avgTransaction = totalTransactions > 0 ? (totalSales / totalTransactions) : 0;
      profitMargin = totalSales > 0 ? (profit / totalSales) * 100 : 0;
    } else {
      totalSales = dataStores.salesData[section]?.totalSales || 0;
      avgTransaction = dataStores.salesData[section]?.avgTransaction || 0;
      profit = dataStores.salesData[section]?.profit || 0;
      profitMargin = dataStores.salesData[section]?.profitMargin || 0;
      totalTransactions = dataStores.salesData[section]?.totalTransactions || 0;
    }
    
    const elements = [
      { id: `${section}-total-sales`, value: `₦${totalSales.toFixed(2)}` },
      { id: `${section}-total-transactions`, value: totalTransactions || (dataStores.salesData[section]?.totalTransactions || 0) },
      { id: `${section}-avg-transaction`, value: `₦${avgTransaction.toFixed(2)}` },
      { id: `${section}-top-item`, value: dataStores.salesData[section]?.topItem || '-' },
      { id: `${section}-total-profit`, value: `₦${profit.toFixed(2)}` },
      { id: `${section}-profit-margin`, value: `${profitMargin.toFixed(1)}%` }
    ];
    
    elements.forEach(el => {
      const element = document.getElementById(el.id);
      if (element) element.textContent = el.value;
    });
    const chart = document.querySelector(`#${section}-reports-view .chart-container`);
    const hasSales = (dataStores.sales[section] || []).length > 0 || totalSales > 0;
    if (chart) chart.style.display = hasSales ? 'none' : 'block';

    const topMount = document.getElementById(`${section}-top-sellers`);
    if (topMount) {
      const counts = {};
      (dataStores.sales[section] || []).forEach(s => {
        (s.items || []).forEach(it => {
          const key = it.name || `#${it.id}`;
          counts[key] = (counts[key] || 0) + (Number(it.quantity) || 0);
        });
      });
      const entries = Object.entries(counts).map(([name, qty]) => ({ name, qty }));
      const totalQty = entries.reduce((sum, e) => sum + e.qty, 0);
      entries.sort((a,b) => b.qty - a.qty);
      const top5 = entries.slice(0,5);
      if (top5.length === 0) {
        topMount.innerHTML = '<div class="info-note">No sales yet.</div>';
      } else {
        topMount.innerHTML = top5.map(e => {
          const share = totalQty > 0 ? Math.round((e.qty / totalQty) * 100) : 0;
          return `
            <div class="top-seller-item">
              <div class="ts-row"><span class="ts-name">${e.name}</span><span class="ts-qty">${e.qty} (${share}%)</span></div>
              <div class="progress"><div class="progress-bar" style="width:${share}%"></div></div>
            </div>
          `;
        }).join('');
      }
    }
  },
  
  updatePurchaseReports: (section) => {
    const totalPurchases = dataStores.purchaseData[section]?.totalPurchases || 0;
    const avgTransaction = dataStores.purchaseData[section]?.avgTransaction || 0;
    
    const elements = [
      { id: `${section}-total-purchases`, value: `₦${totalPurchases.toFixed(2)}` },
      { id: `${section}-total-purchase-transactions`, value: dataStores.purchaseData[section]?.totalTransactions || 0 },
      { id: `${section}-avg-purchase-transaction`, value: `₦${avgTransaction.toFixed(2)}` },
      { id: `${section}-top-supplier`, value: dataStores.purchaseData[section]?.topSupplier || '-' }
    ];
    
    elements.forEach(el => {
      const element = document.getElementById(el.id);
      if (element) element.textContent = el.value;
    });
  },
  
  updateFinancialReports: (section) => {
    const totalSales = dataStores.salesData[section]?.totalSales || 0;
    const savedPurchases = dataStores.purchaseData[section]?.totalPurchases || 0;
    const computedPurchases = (dataStores.purchases[section] || []).reduce((sum, p) => sum + (Number(p.total) || 0), 0);
    const receivedOrdersTotal = (dataStores.purchaseOrders[section] || [])
      .filter(o => (o.status || '').toLowerCase() === 'received')
      .reduce((sum, o) => sum + (Number(o.total) || ((Number(o.cost) || 0) * (Number(o.quantity) || 0))), 0);
    const totalPurchases = savedPurchases > 0 ? savedPurchases : (computedPurchases > 0 ? computedPurchases : receivedOrdersTotal);
    const totalProfit = dataStores.salesData[section]?.profit || 0;
    const profitMargin = dataStores.salesData[section]?.profitMargin || 0;
    
    // Calculate inventory value and cost
    let inventoryValue = 0;
    let inventoryCost = 0;
    
    dataStores.inventory[section].forEach(item => {
      inventoryValue += item.price * item.stock;
      inventoryCost += (item.cost || 0) * item.stock;
    });
    
    const inventoryProfit = inventoryValue - inventoryCost;
    const inventoryProfitMargin = inventoryValue > 0 ? (inventoryProfit / inventoryValue) * 100 : 0;
    
    const elements = [
      { id: `${section}-financial-total-sales`, value: `₦${totalSales.toFixed(2)}` },
      { id: `${section}-financial-total-purchases`, value: `₦${totalPurchases.toFixed(2)}` },
      { id: `${section}-financial-total-profit`, value: `₦${totalProfit.toFixed(2)}` },
      { id: `${section}-financial-profit-margin`, value: `${profitMargin.toFixed(1)}%` },
      { id: `${section}-financial-inventory-value`, value: `₦${inventoryValue.toFixed(2)}` },
      { id: `${section}-financial-inventory-cost`, value: `₦${inventoryCost.toFixed(2)}` },
      { id: `${section}-financial-inventory-profit`, value: `₦${inventoryProfit.toFixed(2)}` },
      { id: `${section}-financial-inventory-profit-margin`, value: `${inventoryProfitMargin.toFixed(1)}%` }
    ];
    
    elements.forEach(el => {
      const element = document.getElementById(el.id);
      if (element) element.textContent = el.value;
    });
    const chart = document.querySelector(`#${section}-financial-view .chart-container`);
    const hasFinancial = (totalSales > 0) || (totalPurchases > 0) || (inventoryValue > 0) || (inventoryCost > 0);
    if (chart) chart.style.display = hasFinancial ? 'none' : 'block';
  },
  
  updateUserStats: (section) => {
    const sales = dataStores.userData[section]?.sales || 0;
    const purchases = dataStores.userData[section]?.purchases || 0;
    
    const elements = [
      { id: `${section}-user-transactions`, value: dataStores.userData[section]?.transactions || 0 },
      { id: `${section}-user-sales`, value: `₦${sales.toFixed(2)}` },
      { id: `${section}-user-purchases`, value: `₦${purchases.toFixed(2)}` },
      { id: `${section}-user-net`, value: `₦${(sales - purchases).toFixed(2)}` }
    ];
    
    elements.forEach(el => {
      const element = document.getElementById(el.id);
      if (element) element.textContent = el.value;
    });
  },
  
  updateDepartmentStats: (section) => {
    const lowStockItems = dataStores.inventory[section].filter(item => {
      const status = utils.getProductStatus(item);
      return status === 'low-stock';
    }).length;
    
    const dailySales = dataStores.salesData[section]?.dailySales || 0;
    const dailyPurchases = dataStores.purchaseData[section]?.dailyPurchases || 0;
    const dailyProfit = dataStores.salesData[section]?.profit || 0;
    
    const elements = [
      { id: `${section}-daily-sales`, value: `₦${dailySales.toFixed(2)}` },
      { id: `${section}-daily-purchases`, value: `₦${dailyPurchases.toFixed(2)}` },
      { id: `${section}-daily-profit`, value: `₦${dailyProfit.toFixed(2)}` },
      { id: `${section}-daily-transactions`, value: dataStores.salesData[section]?.dailyTransactions || 0 },
      { id: `${section}-daily-purchase-transactions`, value: dataStores.purchaseData[section]?.dailyTransactions || 0 },
      { id: `${section}-low-stock`, value: lowStockItems }
    ];
    
    elements.forEach(el => {
      const element = document.getElementById(el.id);
      if (element) element.textContent = el.value;
    });
    const sel = selectedDate[section] || new Date().toISOString().split('T')[0];
    const recorded = dataStores.balances[section][sel] || {};
    let cash = 0;
    let pos = 0;
    if (recorded.closingCash !== undefined || recorded.closingPos !== undefined) {
      cash = Number(recorded.closingCash) || 0;
      pos = Number(recorded.closingPos) || 0;
    } else {
      const sales = (dataStores.sales[section] || []).filter(s => ((s.timestamp || '').split('T')[0]) === sel);
      cash = sales.filter(s => (String(s.payment_method || '').toLowerCase() === 'cash')).reduce((sum, s) => sum + (Number(s.total) || 0), 0);
      pos = sales.filter(s => (String(s.payment_method || '').toLowerCase().includes('pos'))).reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    }
    const cashEl = document.getElementById(`${section}-daily-cash-balance`);
    const posEl = document.getElementById(`${section}-daily-pos-balance`);
    if (cashEl) cashEl.textContent = `₦${cash.toFixed(2)}`;
    if (posEl) posEl.textContent = `₦${pos.toFixed(2)}`;
  },
  
  resetToPOSView: (section) => {
    document.querySelectorAll(`#${section}-section .sub-nav-item`).forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-view') === 'pos') item.classList.add('active');
    });
    document.querySelectorAll(`#${section}-section .view-content`).forEach(view => {
      view.classList.remove('active');
      if (view.id === `${section}-pos-view`) view.classList.add('active');
    });
    currentView = 'pos';
  },
  resetToCategoriesView: (section) => {
    document.querySelectorAll(`#${section}-section .sub-nav-item`).forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-view') === 'categories') item.classList.add('active');
    });
    document.querySelectorAll(`#${section}-section .view-content`).forEach(view => {
      view.classList.remove('active');
      if (view.id === `${section}-categories-view`) view.classList.add('active');
    });
    currentView = 'categories';
    const defaultTab = document.querySelector(`#${section}-categories-view .js-section-tab[data-target-view="pos"]`);
    if (defaultTab) defaultTab.classList.add('active');
  },
  resetToDefaultView: (section) => {
    const sectionEl = document.getElementById(`${section}-section`);
    if (!sectionEl) return;
    const categoriesEl = document.getElementById(`${section}-categories-view`);
    const posEl = document.getElementById(`${section}-pos-view`);
    document.querySelectorAll(`#${section}-section .view-content`).forEach(view => view.classList.remove('active'));
    if (categoriesEl) {
      categoriesEl.classList.add('active');
      currentView = 'categories';
      const defaultTab = document.querySelector(`#${section}-categories-view .js-section-tab[data-target-view="pos"]`);
      if (defaultTab) defaultTab.classList.add('active');
    } else if (posEl) {
      posEl.classList.add('active');
      currentView = 'pos';
    } else {
      const firstView = sectionEl.querySelector('.view-content');
      if (firstView) firstView.classList.add('active');
    }
  },
  
  filterInventory: (section, searchTerm) => {
    uiManager.loadInventoryTable(section);
  },
  
  closeModal: (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  },
  updateTransactionAnalytics: (section) => {
    const stats = dataStores.transactionData[section];
    const totalVolumeEl = document.getElementById(`${section}-txn-total-volume`);
    const totalChargesEl = document.getElementById(`${section}-txn-total-charges`);
    const totalTransactionsEl = document.getElementById(`${section}-txn-total-transactions`);
    if (totalVolumeEl) totalVolumeEl.textContent = `₦${Number(stats.totalVolume).toFixed(2)}`;
    if (totalChargesEl) totalChargesEl.textContent = `₦${Number(stats.totalCharges).toFixed(2)}`;
    if (totalTransactionsEl) totalTransactionsEl.textContent = `${stats.totalTransactions}`;
    const selected = selectedDate[section] || utils.getTodayDate();
    const opening = dataStores.balances[section][selected] || { openingCash: 0, openingPos: 0 };
    let cashDelta = 0;
    let posDelta = 0;
    let machineChargesTotal = 0;
    let chargesToday = 0;
    let transactionsToday = 0;
    let volumeToday = 0;
    const cutoff = (dataStores.openingCutoff[section] && dataStores.openingCutoff[section][selected]) || null;
    dataStores.transactions[section].forEach(tx => {
      const txDate = (tx.timestamp || '').split('T')[0];
      const t = (tx.timestamp ? new Date(tx.timestamp).toISOString() : null);
      if (txDate === selected && (!cutoff || (t && t >= cutoff))) {
        const amount = Number(tx.amount) || 0;
        const charge = Number(tx.charge) || 0;
        const machineCharge = Number(tx.pos_charge) || 0;
        machineChargesTotal += machineCharge;
        chargesToday += charge;
        transactionsToday += 1;
        volumeToday += amount;
        if (tx.type === 'withdraw') {
          cashDelta += -amount + charge;
          posDelta += amount - machineCharge;
        } else if (tx.type === 'transfer_in') {
          cashDelta += -amount + charge;
          posDelta += amount - machineCharge;
        } else if (tx.type === 'transfer_out') {
          cashDelta += charge;
          posDelta += -amount - machineCharge;
        } else if (tx.type === 'deposit') {
          cashDelta += amount;
          posDelta += -(amount - charge) - machineCharge;
        } else if (tx.type === 'bill_payment' || tx.type === 'airtime' || tx.type === 'data') {
          cashDelta += amount + charge;
          posDelta += -amount;
        } else if (tx.type === 'pos_purchase') {
          cashDelta += -amount + charge;
          posDelta += amount - machineCharge;
        }
      }
    });
    const profitToday = chargesToday - machineChargesTotal;
    const machineChargesTodayEl = document.getElementById(`${section}-txn-machine-charges-today`);
    const profitTodayEl = document.getElementById(`${section}-txn-profit-today`);
    if (machineChargesTodayEl) machineChargesTodayEl.textContent = `₦${Number(machineChargesTotal).toFixed(2)}`;
    if (profitTodayEl) profitTodayEl.textContent = `₦${Number(profitToday).toFixed(2)}`;
    const openingCashEl = document.getElementById(`${section}-opening-cash`);
    const openingPosEl = document.getElementById(`${section}-opening-pos`);
    const openingTotalEl = document.getElementById(`${section}-opening-total`);
    const closingCashEl = document.getElementById(`${section}-closing-cash`);
    const closingPosEl = document.getElementById(`${section}-closing-pos`);
    const closingTotalEl = document.getElementById(`${section}-closing-total`);
    const closingCash = Number(opening.openingCash) + cashDelta;
    const closingPos = Number(opening.openingPos) + posDelta;
    const openingTotal = Number(opening.openingCash) + Number(opening.openingPos);
    const closingTotal = closingCash + closingPos;
    if (openingCashEl) openingCashEl.textContent = `₦${opening.openingCash?.toFixed ? opening.openingCash.toFixed(2) : Number(opening.openingCash).toFixed(2)}`;
    if (openingPosEl) openingPosEl.textContent = `₦${opening.openingPos?.toFixed ? opening.openingPos.toFixed(2) : Number(opening.openingPos).toFixed(2)}`;
    if (openingTotalEl) openingTotalEl.textContent = `₦${openingTotal.toFixed(2)}`;
    if (closingCashEl) closingCashEl.textContent = `₦${closingCash.toFixed(2)}`;
    if (closingPosEl) closingPosEl.textContent = `₦${closingPos.toFixed(2)}`;
    if (closingTotalEl) closingTotalEl.textContent = `₦${closingTotal.toFixed(2)}`;
  },
  loadSalesTable: (section) => {
    const containers = document.querySelectorAll(`.js-sales-container[data-section="${section}"]`);
    if (!containers || containers.length === 0) return;
    const all = [...(dataStores.sales[section] || [])];
    const sel = selectedDate[section] || null;
    const records = sel ? all.filter(r => ((r.timestamp || '').split('T')[0]) === sel) : all;
    records.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    const buildTableHTML = () => {
      if (records.length === 0) {
        return `
          <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-receipt"></i></div>
            <h3 class="empty-state-title">No Sales</h3>
            <p class="empty-state-description">Complete a checkout to see sales history.</p>
          </div>
        `;
      }
      let html = `
        <table class="inventory-table">
          <thead>
            <tr>
              <th>Items</th>
              <th>Total</th>
              <th>Cost</th>
              <th>Profit</th>
              <th>Payment</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
      `;
      records.forEach(r => {
        const itemNames = (r.items || []).map(i => `${i.name}×${i.quantity}`).join(', ');
        html += `
            <tr data-id="${r.id}">
              <td>${itemNames || '-'}</td>
              <td>₦${Number(r.total).toFixed(2)}</td>
              <td>₦${Number(r.totalCost || 0).toFixed(2)}</td>
              <td>₦${Number(r.totalProfit || 0).toFixed(2)}</td>
              <td>${r.payment_method || '-'}</td>
              <td>${r.customer_name || '-'} (${r.customer_phone || '-'})</td>
              <td>${utils.formatDate(r.timestamp)}</td>
              <td>
                <button class="action-btn js-sale-view" data-action="view"><i class="fas fa-eye"></i></button>
                <button class="action-btn delete js-sale-delete" data-action="delete"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
        `;
      });
      html += `
          </tbody>
        </table>
      `;
      return html;
    };
    const tableHTML = buildTableHTML();
    containers.forEach(container => {
      container.innerHTML = tableHTML;
    });
    const reportChart = document.querySelector(`#${section}-reports-view .chart-container`);
    if (reportChart) reportChart.style.display = records.length > 0 ? 'none' : 'block';
  },
  loadPurchasesTable: (section) => {
    const containers = document.querySelectorAll(`.js-purchases-container[data-section="${section}"]`);
    if (!containers || containers.length === 0) return;
    const purchaseRecords = [...(dataStores.purchases[section] || [])];
    const poAsPurchases = (dataStores.purchaseOrders[section] || []).map(po => ({
      supplierName: po.supplierName,
      productName: po.productName,
      quantity: po.quantity,
      cost: po.cost,
      total: po.total,
      orderNumber: po.orderNumber,
      receivedDate: po.receivedDate || null,
      timestamp: po.orderDate || po.created_at,
      status: po.status || 'pending',
      _source: 'po'
    }));
    const purchasesByOrder = new Set(purchaseRecords.map(p => p.orderNumber).filter(Boolean));
    const merged = [
      ...purchaseRecords,
      ...poAsPurchases.filter(po => !purchasesByOrder.has(po.orderNumber) || (po.status && po.status.toLowerCase() !== 'received'))
    ];
    const records = merged.sort((a,b) => new Date(b.receivedDate || b.timestamp) - new Date(a.receivedDate || a.timestamp));
    const buildTableHTML = () => {
      if (records.length === 0) {
        return `
          <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-file-invoice"></i></div>
            <h3 class="empty-state-title">No Purchases</h3>
            <p class="empty-state-description">Create or receive a purchase order to see activity here.</p>
          </div>
        `;
      }
      let html = `
        <table class="inventory-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Cost</th>
              <th>Total</th>
              <th>Order #</th>
              <th>Received/Status</th>
            </tr>
          </thead>
          <tbody>
      `;
      records.forEach(r => {
        html += `
            <tr>
              <td>${r.supplierName || '-'}</td>
              <td>${r.productName || '-'}</td>
              <td>${r.quantity || 0}</td>
              <td>₦${Number(r.cost || 0).toFixed(2)}</td>
              <td>₦${Number(r.total || 0).toFixed(2)}</td>
              <td>${r.orderNumber || '-'}</td>
              <td>${r.receivedDate ? utils.formatDate(r.receivedDate) : (r.status ? (r.status.charAt(0).toUpperCase() + r.status.slice(1)) : utils.formatDate(r.timestamp))}</td>
            </tr>
        `;
      });
      html += `
          </tbody>
        </table>
      `;
      return html;
    };
    const tableHTML = buildTableHTML();
    containers.forEach(container => {
      container.innerHTML = tableHTML;
    });
  },
  loadTransactionsTable: (section) => {
    const container = document.querySelector(`.js-transactions-container[data-section="${section}"]`);
    if (!container) return;
    const records = [...dataStores.transactions[section]].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    const sel = selectedDate[section] || utils.getTodayDate();
    const filtered = records.filter(r => ((r.timestamp || '').split('T')[0]) === sel);
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-receipt"></i></div>
          <h3 class="empty-state-title">No Transactions</h3>
          <p class="empty-state-description">No transactions for the selected date. Record a transaction or pick another date.</p>
        </div>
      `;
      return;
    }
    const table = document.createElement('table');
    table.className = 'inventory-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Type</th>
          <th>Amount</th>
          <th>Merchant Charge</th>
          <th>POS Charge</th>
          <th>Phone</th>
          <th>Reference</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    filtered.forEach(tx => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${tx.type}</td>
        <td>₦${Number(tx.amount).toFixed(2)}</td>
        <td>₦${Number(tx.charge).toFixed(2)}</td>
        <td>₦${Number(tx.pos_charge || 0).toFixed(2)}</td>
        <td>${tx.customer_phone || '-'}</td>
        <td>${tx.reference || '-'}</td>
        <td>${utils.formatDate(tx.timestamp)}</td>
      `;
      tbody.appendChild(tr);
    });
    container.innerHTML = '';
    container.appendChild(table);
  }
};

// Cart management
const cartManager = {
  addToCart: (section, item) => {
    if (item.stock <= 0) { 
      utils.showNotification(`${item.name} is out of stock`, 'error'); 
      return; 
    }
    
    const existingItem = dataStores.carts[section].find(cartItem => cartItem.id === item.id);
    if (existingItem) {
      if (existingItem.quantity >= item.stock) { 
        utils.showNotification(`Cannot add more ${item.name}. Only ${item.stock} in stock.`, 'warning'); 
        return; 
      }
      existingItem.quantity += 1;
    } else {
      dataStores.carts[section].push({ id: item.id, name: item.name, price: item.price, quantity: 1 });
    }
    
    utils.saveToLocalStorage(`cart_${section}`, dataStores.carts[section]);
    uiManager.updateCart(section); 
    utils.showNotification(`${item.name} added to cart`, 'success');
  },
  
  incrementQuantity: (section, itemId) => {
    const item = dataStores.carts[section].find(cartItem => cartItem.id === itemId);
    const inventoryItem = dataStores.inventory[section].find(invItem => invItem.id === itemId);
    if (item && inventoryItem && item.quantity < inventoryItem.stock) { 
      item.quantity += 1; 
      utils.saveToLocalStorage(`cart_${section}`, dataStores.carts[section]);
      uiManager.updateCart(section); 
    }
    else if (item && inventoryItem) { 
      utils.showNotification(`Cannot add more ${item.name}. Only ${inventoryItem.stock} in stock.`, 'warning'); 
    }
  },
  
  decrementQuantity: (section, itemId) => {
    const item = dataStores.carts[section].find(cartItem => cartItem.id === itemId);
    if (item && item.quantity > 1) { 
      item.quantity -= 1; 
      utils.saveToLocalStorage(`cart_${section}`, dataStores.carts[section]);
      uiManager.updateCart(section); 
    }
  },
  
  removeFromCart: (section, itemId) => {
    dataStores.carts[section] = dataStores.carts[section].filter(cartItem => cartItem.id !== itemId);
    utils.saveToLocalStorage(`cart_${section}`, dataStores.carts[section]);
    uiManager.updateCart(section);
  },
  
  processCheckout: (section) => {
    if (dataStores.carts[section].length === 0) { 
      utils.showNotification('Your cart is empty', 'error'); 
      return; 
    }
    
    const checkoutModal = document.getElementById('checkoutModal');
    if (!checkoutModal) return;
    
    const checkoutSummary = document.getElementById('checkout-summary');
    let subtotal = 0; 
    let totalCost = 0;
    let summaryHTML = '<table class="inventory-table">';
    
    dataStores.carts[section].forEach(item => {
      const itemTotal = item.price * item.quantity; 
      subtotal += itemTotal;
      
      const inventoryItem = dataStores.inventory[section].find(invItem => invItem.id === item.id);
      const itemCost = inventoryItem ? (inventoryItem.cost || 0) * item.quantity : 0;
      totalCost += itemCost;
      
      summaryHTML += `<tr><td>${item.name}</td><td>₦${item.price.toFixed(2)}</td><td>₦${(itemCost / item.quantity).toFixed(2)}</td><td>${item.quantity}</td><td>₦${itemTotal.toFixed(2)}</td></tr>`;
    });
    
    const totalProfit = subtotal - totalCost;
    const profitMargin = subtotal > 0 ? (totalProfit / subtotal) * 100 : 0;
    summaryHTML += `<tr><td colspan="4" class="total-label">Total</td><td>₦${subtotal.toFixed(2)}</td></tr>`;
    summaryHTML += `<tr><td colspan="4" class="total-label">Cost</td><td>₦${totalCost.toFixed(2)}</td></tr>`;
    summaryHTML += `<tr><td colspan="4" class="total-label">Profit</td><td>₦${totalProfit.toFixed(2)} (${profitMargin.toFixed(1)}%)</td></tr></table>`;
    
    checkoutSummary.innerHTML = summaryHTML;
    checkoutModal.setAttribute('data-section', section);
    checkoutModal.classList.add('active');
  },
  
  completeCheckout: () => {
    const checkoutModal = document.getElementById('checkoutModal');
    if (!checkoutModal) return;
    
    const section = checkoutModal.getAttribute('data-section');
    
    const validation = utils.validateForm('checkoutForm', ['paymentMethod']);
    if (!validation.isValid) {
      utils.showNotification(validation.message, 'error');
      return;
    }
    
    let subtotal = 0; 
    let totalCost = 0;
    const saleItems = [];
    
    dataStores.carts[section].forEach(item => {
      const itemTotal = item.price * item.quantity; 
      subtotal += itemTotal;
      
      const inventoryItem = dataStores.inventory[section].find(invItem => invItem.id === item.id);
      const itemCost = inventoryItem ? (inventoryItem.cost || 0) * item.quantity : 0;
      totalCost += itemCost;
      
      saleItems.push({ 
        id: item.id, 
        name: item.name, 
        price: item.price, 
        cost: inventoryItem ? inventoryItem.cost || 0 : 0,
        quantity: item.quantity, 
        total: itemTotal,
        itemCost: itemCost
      });
      
      if (inventoryItem) {
        inventoryItem.stock -= item.quantity;
        inventoryItem.status = utils.getProductStatus(inventoryItem);
        utils.saveToLocalStorage(`inventory_${section}`, dataStores.inventory[section]);
        dataManager.saveDataToSupabase('inventory', inventoryItem, inventoryItem.id)
          .catch(error => console.error('Error updating inventory:', error));
      }
    });
    
    const totalProfit = subtotal - totalCost;
    const profitMargin = subtotal > 0 ? (totalProfit / subtotal) * 100 : 0;
    
    const saleRecord = {
      user_id: currentUser ? currentUser.id : 'offline_user', 
      user_email: currentUser ? currentUser.email : 'offline@example.com', 
      section, 
      items: saleItems, 
      subtotal, 
      total: subtotal,
      totalCost,
      totalProfit,
      payment_method: document.getElementById('paymentMethod').value,
      customer_name: document.getElementById('customerName').value,
      customer_phone: document.getElementById('customerPhone').value,
      timestamp: selectedDate[section] || utils.getTodayDate()
    };
    
    dataManager.saveDataToSupabase('sales', saleRecord).then(() => {
      
      
      
      
      
      
      
      // Save updated stats
      dataManager.saveDataToSupabase('sales_data', dataStores.salesData[section], section);
      dataManager.saveDataToSupabase('user_data', dataStores.userData[section], section);
      
      // Clear cart and remove from local storage
      dataStores.carts[section] = [];
      utils.saveToLocalStorage(`cart_${section}`, []);
      
      uiManager.updateCart(section); 
      uiManager.loadInventoryTable(section); 
      uiManager.updateReports(section);
      uiManager.updateFinancialReports(section);
      uiManager.updateUserStats(section); 
      uiManager.updateDepartmentStats(section);
      uiManager.updateCategoryInventorySummary(section);
      uiManager.updateTotalInventory();
      checkoutModal.classList.remove('active');
      utils.showNotification(`Sale completed successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
    }).catch(error => {
      console.error('Error saving sale:', error); 
      utils.showNotification('Error saving sale. Please try again.', 'error');
    });
  }
};
const salesManager = {
  viewSale: (section, id) => {
    const rec = (dataStores.sales[section] || []).find(r => String(r.id) === String(id));
    if (!rec) return;
    const body = document.getElementById('saleDetailsBody');
    if (!body) return;
    const itemsHTML = (rec.items || []).map(i => `<tr><td>${i.name}</td><td>${i.quantity}</td><td>₦${Number(i.price).toFixed(2)}</td><td>₦${Number(i.total || i.price * i.quantity).toFixed(2)}</td></tr>`).join('');
    body.innerHTML = `
      <div style="margin-bottom:1rem"><strong>Payment:</strong> ${rec.payment_method || '-'} | <strong>Customer:</strong> ${rec.customer_name || '-'} (${rec.customer_phone || '-'}) | <strong>Date:</strong> ${utils.formatDate(rec.timestamp)}</div>
      <table class="inventory-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>${itemsHTML}</tbody>
        <tfoot>
          <tr><td colspan="3" class="total-label">Subtotal</td><td>₦${Number(rec.subtotal || rec.total).toFixed(2)}</td></tr>
          <tr><td colspan="3" class="total-label">Cost</td><td>₦${Number(rec.totalCost || 0).toFixed(2)}</td></tr>
          <tr><td colspan="3" class="total-label">Profit</td><td>₦${Number(rec.totalProfit || 0).toFixed(2)}</td></tr>
        </tfoot>
      </table>
    `;
    const modal = document.getElementById('saleDetailsModal');
    if (modal) {
      modal.setAttribute('data-section', section);
      modal.setAttribute('data-id', id);
      modal.classList.add('active');
    }
  },
  confirmDelete: (section, id) => {
    const rec = (dataStores.sales[section] || []).find(r => String(r.id) === String(id));
    if (!rec) return;
    if (!rec.isOffline) {
      utils.showNotification('Cannot delete a recorded sale', 'error');
      return;
    }
    const modal = document.getElementById('saleDetailsModal');
    if (modal) {
      modal.setAttribute('data-section', section);
      modal.setAttribute('data-id', id);
      modal.classList.add('active');
    }
  },
  deleteSale: () => {
    const modal = document.getElementById('saleDetailsModal');
    if (!modal) return;
    const section = modal.getAttribute('data-section');
    const id = modal.getAttribute('data-id');
    const rec = (dataStores.sales[section] || []).find(r => String(r.id) === String(id));
    if (!rec) { modal.classList.remove('active'); return; }
    if (!rec.isOffline) {
      utils.showNotification('Cannot delete a recorded sale', 'error');
      return;
    }
    dataStores.sales[section] = dataStores.sales[section].filter(r => String(r.id) !== String(id));
    utils.saveToLocalStorage(`sales_${section}`, dataStores.sales[section]);
    uiManager.loadSalesTable(section);
    dataManager.recomputeTopItem(section);
    modal.classList.remove('active');
    utils.showNotification('Sale removed locally', 'success');
  }
};
const transactionManager = {
  recordTransaction: (section) => {
    const typeEl = document.getElementById(`${section}-txn-type`);
    const amountEl = document.getElementById(`${section}-txn-amount`);
    const chargeEl = document.getElementById(`${section}-txn-charge`);
    const posChargeEl = document.getElementById(`${section}-txn-pos-charge`);
    if (!typeEl || !amountEl || !chargeEl) return;
    const type = typeEl.value;
    const amount = parseFloat(amountEl.value);
    const charge = parseFloat(chargeEl.value);
    const pos_charge = posChargeEl ? parseFloat(posChargeEl.value) : 0;
    if (!type || isNaN(amount) || isNaN(charge) || amount <= 0 || charge < 0) {
      utils.showNotification('Enter valid type, amount and charge', 'error');
      return;
    }
    const reference = (document.getElementById(`${section}-txn-ref`)?.value || '').trim();
    const customer_phone = (document.getElementById(`${section}-txn-phone`)?.value || '').trim();
    const notes = (document.getElementById(`${section}-txn-notes`)?.value || '').trim();
    const dateStr = selectedDate[section] || utils.getTodayDate();
    const timeStr = new Date().toTimeString().split(' ')[0];
    const ts = new Date(`${dateStr}T${timeStr}`).toISOString();
    const txRecord = {
      user_id: currentUser ? currentUser.id : 'offline_user',
      user_email: currentUser ? currentUser.email : '',
      section,
      type,
      amount,
      charge,
      pos_charge,
      reference,
      customer_phone,
      notes,
      timestamp: ts
    };
    dataManager.saveDataToSupabase('transactions', txRecord).then(() => {
      uiManager.updateTransactionAnalytics(section);
      uiManager.loadTransactionsTable(section);
      utils.showNotification(`Transaction recorded${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
      amountEl.value = '';
      chargeEl.value = '';
      if (posChargeEl) posChargeEl.value = '';
      const refEl = document.getElementById(`${section}-txn-ref`);
      const phoneEl = document.getElementById(`${section}-txn-phone`);
      const notesEl = document.getElementById(`${section}-txn-notes`);
      if (refEl) refEl.value = '';
      if (phoneEl) phoneEl.value = '';
      if (notesEl) notesEl.value = '';
    }).catch(error => {
      console.error('Error recording transaction:', error);
      utils.showNotification('Error recording transaction', 'error');
    });
  }
};

// Item management
const itemManager = {
  showAddItemModal: (section) => {
    const modal = document.getElementById('addItemModal');
    if (modal) {
      document.getElementById('addItemForm').reset();
      modal.setAttribute('data-section', section);
      modal.classList.add('active');
    }
  },
  
  addNewItem: () => {
    const modal = document.getElementById('addItemModal');
    if (!modal) return;
    
    const section = modal.getAttribute('data-section');
    const name = document.getElementById('addItemName').value;
    const price = parseFloat(document.getElementById('addItemPrice').value);
    const cost = parseFloat(document.getElementById('addItemCost').value) || 0;
    const stock = parseInt(document.getElementById('addItemStock').value);
    const expiryDate = document.getElementById('addItemExpiry').value;
    
    const newItem = { 
      section, 
      name, 
      price, 
      cost,
      stock, 
      expiry_date: expiryDate,
      status: stock > 10 ? 'in-stock' : (stock > 0 ? 'low-stock' : 'out-of-stock'), 
      created_by: currentUser ? currentUser.id : 'offline_user',
      created_at: new Date().toISOString()
    };
    
    dataManager.saveDataToSupabase('inventory', newItem).then(() => {
      modal.classList.remove('active');
      utils.showNotification(`${name} added successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
    }).catch(error => {
      console.error('Error adding item:', error);
      utils.showNotification('Error adding item', 'error');
    });
  },
  
  showAddInventoryModal: (section) => {
    const modal = document.getElementById('addInventoryModal');
    if (modal) {
      document.getElementById('addInventoryForm').reset();
      modal.setAttribute('data-section', section);
      modal.classList.add('active');
    }
  },
  
  addNewInventory: () => {
    const modal = document.getElementById('addInventoryModal');
    if (!modal) return;
    
    const section = modal.getAttribute('data-section');
    
    const validation = utils.validateForm('addInventoryForm', [
      'addInventoryName', 
      'addInventoryPrice', 
      'addInventoryStock'
    ]);
    if (!validation.isValid) {
      utils.showNotification(validation.message, 'error');
      return;
    }
    
    const name = document.getElementById('addInventoryName').value;
    const price = parseFloat(document.getElementById('addInventoryPrice').value);
    const cost = parseFloat(document.getElementById('addInventoryCost').value) || 0;
    const stock = parseInt(document.getElementById('addInventoryStock').value);
    const expiryDate = document.getElementById('addInventoryExpiry').value;
    const description = document.getElementById('addInventoryDescription').value;
    
    const newItem = { 
      section, 
      name, 
      price, 
      cost,
      stock, 
      expiry_date: expiryDate,
      description, 
      status: stock > 10 ? 'in-stock' : (stock > 0 ? 'low-stock' : 'out-of-stock'), 
      created_by: currentUser ? currentUser.id : 'offline_user',
      created_at: new Date().toISOString()
    };
    
    dataManager.saveDataToSupabase('inventory', newItem).then(() => {
      modal.classList.remove('active');
      utils.showNotification(`${name} added successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
    }).catch(error => {
      console.error('Error adding item:', error);
      utils.showNotification('Error adding item', 'error');
    });
  },
  
  editInventoryItem: (section, itemId) => {
    const item = dataStores.inventory[section].find(invItem => invItem.id === itemId);
    if (!item) return;
    
    document.getElementById('editInventoryName').value = item.name;
    document.getElementById('editInventoryPrice').value = item.price;
    document.getElementById('editInventoryCost').value = item.cost || 0;
    document.getElementById('editInventoryStock').value = item.stock;
    document.getElementById('editInventoryExpiry').value = item.expiry_date || '';
    document.getElementById('editInventoryDescription').value = item.description || '';
    
    const editModal = document.getElementById('editInventoryModal');
    if (editModal) {
      editModal.setAttribute('data-section', section);
      editModal.setAttribute('data-item-id', itemId);
      editModal.classList.add('active');
    }
  },
  
  updateInventoryItem: () => {
    const editModal = document.getElementById('editInventoryModal');
    if (!editModal) return;
    
    const section = editModal.getAttribute('data-section');
    const itemId = editModal.getAttribute('data-item-id');
    const name = document.getElementById('editInventoryName').value;
    const price = parseFloat(document.getElementById('editInventoryPrice').value);
    const cost = parseFloat(document.getElementById('editInventoryCost').value) || 0;
    const stock = parseInt(document.getElementById('editInventoryStock').value);
    const expiryDate = document.getElementById('editInventoryExpiry').value;
    const description = document.getElementById('editInventoryDescription').value;
    const item = dataStores.inventory[section].find(invItem => invItem.id === itemId);
    
    if (!item) return;
    
    const updatedItem = {
      ...item,
      name, 
      price, 
      cost,
      stock, 
      expiry_date: expiryDate,
      description,
      status: stock > 10 ? 'in-stock' : (stock > 0 ? 'low-stock' : 'out-of-stock'),
      updated_by: currentUser ? currentUser.id : 'offline_user',
      updated_at: new Date().toISOString()
    };
    
    dataManager.saveDataToSupabase('inventory', updatedItem, itemId).then(() => {
      editModal.classList.remove('active');
      utils.showNotification(`${name} updated successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
    }).catch(error => {
      console.error('Error updating item:', error);
      utils.showNotification('Error updating item', 'error');
    });
  },
  
  deleteInventoryItem: (section, itemId) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    const item = dataStores.inventory[section].find(invItem => invItem.id === itemId);
    if (!item) return;
    dataManager.ensureOwnershipAndDelete('inventory', itemId)
      .then(() => {
        dataStores.inventory[section] = dataStores.inventory[section].filter(invItem => invItem.id !== itemId);
        utils.saveToLocalStorage(`inventory_${section}`, dataStores.inventory[section]);
        uiManager.loadInventoryTable(section);
        uiManager.updateDepartmentStats(section);
        uiManager.updateCategoryInventorySummary(section);
        uiManager.updateTotalInventory();
        utils.showNotification('Item deleted successfully', 'success');
      })
      .catch(error => {
        console.error('Error deleting item:', error);
        utils.showNotification('Error deleting item. Please check your connection or permissions.', 'error');
      });
  }
};

// Supplier management
const supplierManager = {
  showAddSupplierModal: (section) => {
    const modal = document.getElementById('addSupplierModal');
    if (modal) {
      document.getElementById('addSupplierForm').reset();
      modal.setAttribute('data-section', section);
      modal.classList.add('active');
    }
  },
  
  addNewSupplier: () => {
    const modal = document.getElementById('addSupplierModal');
    if (!modal) return;
    
    const section = modal.getAttribute('data-section');

    const validation = utils.validateForm('addSupplierForm', ['addSupplierName']);
    if (!validation.isValid) {
      utils.showNotification(validation.message, 'error');
      return;
    }
    
    const name = document.getElementById('addSupplierName').value;
    const phone = document.getElementById('addSupplierPhone').value;
    const email = document.getElementById('addSupplierEmail').value;
    const address = document.getElementById('addSupplierAddress').value;
    const products = document.getElementById('addSupplierProducts').value;
    
    const newSupplier = { 
      section, 
      name, 
      phone, 
      email,
      address,
      products,
      created_by: currentUser ? currentUser.id : 'offline_user',
      created_at: new Date().toISOString()
    };
    
    dataManager.saveDataToSupabase('suppliers', newSupplier).then(() => {
      modal.classList.remove('active');
      utils.showNotification(`${name} added successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
    }).catch(error => {
      console.error('Error adding supplier:', error);
      utils.showNotification('Error adding supplier', 'error');
    });
  },
  
  editSupplier: (section, supplierId) => {
    const supplier = dataStores.suppliers[section].find(s => s.id === supplierId);
    if (!supplier) return;
    
    document.getElementById('editSupplierName').value = supplier.name;
    document.getElementById('editSupplierPhone').value = supplier.phone || '';
    document.getElementById('editSupplierEmail').value = supplier.email || '';
    document.getElementById('editSupplierAddress').value = supplier.address || '';
    document.getElementById('editSupplierProducts').value = supplier.products || '';
    
    const editModal = document.getElementById('editSupplierModal');
    if (editModal) {
      editModal.setAttribute('data-section', section);
      editModal.setAttribute('data-item-id', supplierId);
      editModal.classList.add('active');
    }
  },
  
  updateSupplier: () => {
    const editModal = document.getElementById('editSupplierModal');
    if (!editModal) return;
    
    const section = editModal.getAttribute('data-section');
    const supplierId = editModal.getAttribute('data-item-id');
    const name = document.getElementById('editSupplierName').value;
    const phone = document.getElementById('editSupplierPhone').value;
    const email = document.getElementById('editSupplierEmail').value;
    const address = document.getElementById('editSupplierAddress').value;
    const products = document.getElementById('editSupplierProducts').value;
    const supplier = dataStores.suppliers[section].find(s => s.id === supplierId);
    
    if (!supplier) return;
    
    const updatedSupplier = {
      ...supplier,
      name, 
      phone,
      email,
      address,
      products,
      updated_by: currentUser ? currentUser.id : 'offline_user',
      updated_at: new Date().toISOString()
    };
    
    dataManager.saveDataToSupabase('suppliers', updatedSupplier, supplierId).then(() => {
      editModal.classList.remove('active');
      utils.showNotification(`${name} updated successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
    }).catch(error => {
      console.error('Error updating supplier:', error);
      utils.showNotification('Error updating supplier', 'error');
    });
  },
  
  deleteSupplier: (section, supplierId) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    
    const supplier = dataStores.suppliers[section].find(s => s.id === supplierId);
    if (!supplier) return;
    dataManager.ensureOwnershipAndDelete('suppliers', supplierId)
      .then(() => {
        dataStores.suppliers[section] = dataStores.suppliers[section].filter(s => s.id !== supplierId);
        utils.saveToLocalStorage(`suppliers_${section}`, dataStores.suppliers[section]);
        uiManager.loadSuppliersTable(section);
        utils.showNotification('Supplier deleted successfully', 'success');
      })
      .catch(error => {
        console.error('Error deleting supplier:', error);
        utils.showNotification('Error deleting supplier. Please check your connection or permissions.', 'error');
      });
  }
};

// Purchase order management
const purchaseOrderManager = {
  showAddPurchaseOrderModal: (section) => {
    const modal = document.getElementById('addPurchaseOrderModal');
    if (modal) {
      document.getElementById('addPurchaseOrderForm').reset();
      
      // Populate supplier dropdown
      const supplierSelect = document.getElementById('addPurchaseOrderSupplier');
      if (supplierSelect) {
        supplierSelect.innerHTML = '<option value="">Select Supplier</option>';
        
        dataStores.suppliers[section].forEach(supplier => {
          const option = document.createElement('option');
          option.value = supplier.id;
          option.textContent = supplier.name;
          supplierSelect.appendChild(option);
        });
      }
      
      // Populate product dropdown
      const productSelect = document.getElementById('addPurchaseOrderProduct');
      if (productSelect) {
        productSelect.innerHTML = '<option value="">Select Product</option>';
        
        dataStores.inventory[section].forEach(item => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = `${item.name} (Current Stock: ${item.stock})`;
          productSelect.appendChild(option);
        });
      }
      
      modal.setAttribute('data-section', section);
      modal.classList.add('active');
    }
  },
  
  addNewPurchaseOrder: () => {
    const modal = document.getElementById('addPurchaseOrderModal');
    if (!modal) return;
    
    const section = modal.getAttribute('data-section');

    const validation = utils.validateForm('addPurchaseOrderForm', [
      'addPurchaseOrderSupplier', 
      'addPurchaseOrderProduct', 
      'addPurchaseOrderQuantity', 
      'addPurchaseOrderCost'
    ]);
    if (!validation.isValid) {
      utils.showNotification(validation.message, 'error');
      return;
    }
    
    const supplierId = document.getElementById('addPurchaseOrderSupplier').value;
    const productId = document.getElementById('addPurchaseOrderProduct').value;
    const quantity = parseInt(document.getElementById('addPurchaseOrderQuantity').value);
    const cost = parseFloat(document.getElementById('addPurchaseOrderCost').value);
    const orderDate = document.getElementById('addPurchaseOrderDate').value || new Date().toISOString().split('T')[0];
    
    const supplier = dataStores.suppliers[section].find(s => s.id === supplierId);
    const product = dataStores.inventory[section].find(p => p.id === productId);
    
    if (!supplier || !product) {
      utils.showNotification('Please select a valid supplier and product', 'error');
      return;
    }
    
    const total = cost * quantity;
    const orderNumber = `PO-${Date.now()}`;
    
    const newPurchaseOrder = { 
      section, 
      orderNumber,
      supplierId,
      supplierName: supplier.name,
      productId, // This is used locally but won't be sent to Supabase
      productName: product.name,
      quantity,
      cost,
      total,
      orderDate,
      status: 'pending',
      created_by: currentUser ? currentUser.id : 'offline_user',
      created_at: new Date().toISOString()
    };
    
    dataManager.saveDataToSupabase('purchase_orders', newPurchaseOrder).then(() => {
      modal.classList.remove('active');
      utils.showNotification(`Purchase order ${orderNumber} created successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
    }).catch(error => {
      console.error('Error creating purchase order:', error);
      utils.showNotification('Error creating purchase order', 'error');
    });
  },
  
  editPurchaseOrder: (section, orderId) => {
    const order = dataStores.purchaseOrders[section].find(o => o.id === orderId);
    if (!order) return;
    
    document.getElementById('editPurchaseOrderQuantity').value = order.quantity;
    document.getElementById('editPurchaseOrderCost').value = order.cost;
    document.getElementById('editPurchaseOrderStatus').value = order.status;
    
    const editModal = document.getElementById('editPurchaseOrderModal');
    if (editModal) {
      editModal.setAttribute('data-section', section);
      editModal.setAttribute('data-item-id', orderId);
      editModal.classList.add('active');
    }
  },
  
  updatePurchaseOrder: () => {
    const editModal = document.getElementById('editPurchaseOrderModal');
    if (!editModal) return;
    
    const section = editModal.getAttribute('data-section');
    const orderId = editModal.getAttribute('data-item-id');
    const quantity = parseInt(document.getElementById('editPurchaseOrderQuantity').value);
    const cost = parseFloat(document.getElementById('editPurchaseOrderCost').value);
    const status = document.getElementById('editPurchaseOrderStatus').value;
    const order = dataStores.purchaseOrders[section].find(o => o.id === orderId);
    
    if (!order) return;
    
    const total = cost * quantity;
    const updatedOrder = {
      ...order,
      quantity,
      cost,
      total,
      status,
      updated_by: currentUser ? currentUser.id : 'offline_user',
      updated_at: new Date().toISOString()
    };
    
    dataManager.saveDataToSupabase('purchase_orders', updatedOrder, orderId).then(() => {
      editModal.classList.remove('active');
      utils.showNotification(`Purchase order updated successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
    }).catch(error => {
      console.error('Error updating purchase order:', error);
      utils.showNotification('Error updating purchase order', 'error');
    });
  },
  
  receivePurchaseOrder: (section, orderId) => {
    const order = dataStores.purchaseOrders[section].find(o => o.id === orderId);
    if (!order) return;
    
    const product = dataStores.inventory[section].find(p => p.id === order.productId);
    if (!product) return;
    
    // Update product stock and cost
    product.stock += order.quantity;
    product.cost = order.cost;
    product.status = utils.getProductStatus(product);
    
    // Update order status
    order.status = 'received';
    order.receivedDate = new Date().toISOString().split('T')[0];
    
    // Save both changes
    Promise.all([
      dataManager.saveDataToSupabase('inventory', product, product.id),
      dataManager.saveDataToSupabase('purchase_orders', order, orderId)
    ]).then(() => {
      const purchaseRecord = {
        user_id: currentUser ? currentUser.id : 'offline_user',
        user_email: currentUser ? currentUser.email : '',
        section,
        supplierName: order.supplierName,
        productName: order.productName,
        quantity: order.quantity,
        cost: order.cost,
        total: order.total,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        receivedDate: order.receivedDate,
        timestamp: new Date().toISOString()
      };
      dataManager.saveDataToSupabase('purchases', purchaseRecord).then(() => {
        uiManager.loadPurchasesTable(section);
        uiManager.updatePurchaseReports(section);
        uiManager.updateFinancialReports(section);
      });
      utils.showNotification(`Purchase order received successfully. Stock updated for ${product.name}`, 'success');
    }).catch(error => {
      console.error('Error receiving purchase order:', error);
      utils.showNotification('Error receiving purchase order', 'error');
    });
  },
  
  deletePurchaseOrder: (section, orderId) => {
    if (!confirm('Are you sure you want to delete this purchase order?')) return;
    
    const order = dataStores.purchaseOrders[section].find(o => o.id === orderId);
    if (!order) return;
    dataManager.ensureOwnershipAndDelete('purchase_orders', orderId)
      .then(() => {
        dataStores.purchaseOrders[section] = dataStores.purchaseOrders[section].filter(o => o.id !== orderId);
        utils.saveToLocalStorage(`purchaseOrders_${section}`, dataStores.purchaseOrders[section]);
        uiManager.loadPurchaseOrdersTable(section);
        utils.showNotification('Purchase order deleted successfully', 'success');
      })
      .catch(error => {
        console.error('Error deleting purchase order:', error);
        utils.showNotification('Error deleting purchase order. Please check your connection or permissions.', 'error');
      });
  }
};

// Authentication
const authManager = {
  resetPassword: () => {
    const email = document.getElementById('resetEmail').value;
    const errorElement = document.getElementById('reset-password-error');
    const successElement = document.getElementById('reset-password-success');
    
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })
    .then(({ data, error }) => {
      if (error) {
        if (errorElement) errorElement.textContent = error.message;
        if (successElement) successElement.textContent = '';
      } else {
        if (successElement) successElement.textContent = 'Password reset email sent. Check your inbox.';
        if (errorElement) errorElement.textContent = '';
      }
    });
  }
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = './sw.js';
      const opts = { scope: './' };
      navigator.serviceWorker.register(swUrl, opts).catch(() => {});
    });
  }
  const maybeHideInstall = () => {
    const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = window.navigator && window.navigator.standalone;
    if (isStandalone || isIOSStandalone) {
      const btn1 = document.getElementById('installBtn');
      const btn2 = document.getElementById('installBtnLogin');
      if (btn1) btn1.style.display = 'none';
      if (btn2) btn2.style.display = 'none';
    }
  };
  maybeHideInstall();
  const showInstallCTAIfNotStandalone = () => {
    const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = window.navigator && window.navigator.standalone;
    if (!isStandalone && !isIOSStandalone) {
      const btn = document.getElementById('installBtnLogin');
      if (btn) btn.style.display = 'inline-block';
    }
  };
  showInstallCTAIfNotStandalone();
  // Always require explicit sign-in: show login, hide app, clear any session
  const loginEl = document.getElementById('loginScreen');
  const appEl = document.getElementById('mainApp');
  if (loginEl) loginEl.style.display = 'flex';
  if (appEl) appEl.style.display = 'none';
  try { supabase.auth.signOut(); } catch (e) {}
  // Preload local caches for faster post-login init (no UI init yet)
  dataManager.loadDataFromLocalStorage();
  dataManager.applyPendingDeletionsToLocal();
  window.addEventListener('online', uiManager.handleOnlineStatus);
  window.addEventListener('offline', uiManager.handleOfflineStatus);
  
  // Login form
  const emailLoginForm = document.getElementById('emailLoginForm');
  if (emailLoginForm) {
    emailLoginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const errorElement = document.getElementById('email-login-error');
      const loginBtn = document.getElementById('emailLoginBtn');
      
      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing In...';
      }
      
      supabase.auth.signInWithPassword({ email, password })
        .then(({ data, error }) => {
          if (error) {
            if (errorElement) errorElement.textContent = error.message;
            if (loginBtn) {
              loginBtn.disabled = false;
              loginBtn.textContent = 'Sign In';
            }
          }
        })
        .catch(error => {
          if (errorElement) errorElement.textContent = error.message;
          if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In';
          }
        });
    });
  }

  // Forgot password
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', function(e) {
      e.preventDefault();
      const forgotPasswordModal = document.getElementById('forgotPasswordModal');
      if (forgotPasswordModal) forgotPasswordModal.classList.add('active');
    });
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      supabase.auth.signOut();
    });
  }

  // Modal close buttons
  document.querySelectorAll('.js-modal-close').forEach(button => {
    button.addEventListener('click', () => {
      const targetModal = button.getAttribute('data-target');
      uiManager.closeModal(targetModal);
    });
  });

  // Event Delegation for dynamic content
  setupEventDelegation();
  document.querySelectorAll('.sub-nav').forEach(nav => {
    nav.querySelectorAll('.sub-nav-item').forEach(item => {
      if (item.getAttribute('data-view') !== 'categories') item.style.display = 'none';
      
    });
  });
  
  // Modal confirm buttons
  const addItemConfirmBtn = document.querySelector('.js-add-item-confirm-btn');
  if (addItemConfirmBtn) addItemConfirmBtn.addEventListener('click', itemManager.addNewItem);
  
  const addInventoryConfirmBtn = document.querySelector('.js-add-inventory-confirm-btn');
  if (addInventoryConfirmBtn) addInventoryConfirmBtn.addEventListener('click', itemManager.addNewInventory);
  
  const addSupplierConfirmBtn = document.querySelector('.js-add-supplier-confirm-btn');
  if (addSupplierConfirmBtn) addSupplierConfirmBtn.addEventListener('click', supplierManager.addNewSupplier);
  
  const addPurchaseOrderConfirmBtn = document.querySelector('.js-add-purchase-order-confirm-btn');
  if (addPurchaseOrderConfirmBtn) addPurchaseOrderConfirmBtn.addEventListener('click', purchaseOrderManager.addNewPurchaseOrder);
  
  const updateInventoryBtn = document.querySelector('.js-update-inventory-btn');
  if (updateInventoryBtn) updateInventoryBtn.addEventListener('click', itemManager.updateInventoryItem);
  
  const updateSupplierBtn = document.querySelector('.js-update-supplier-btn');
  if (updateSupplierBtn) updateSupplierBtn.addEventListener('click', supplierManager.updateSupplier);
  
  const updatePurchaseOrderBtn = document.querySelector('.js-update-purchase-order-btn');
  if (updatePurchaseOrderBtn) updatePurchaseOrderBtn.addEventListener('click', purchaseOrderManager.updatePurchaseOrder);
  
  const completeCheckoutBtn = document.querySelector('.js-complete-checkout-btn');
  if (completeCheckoutBtn) completeCheckoutBtn.addEventListener('click', cartManager.completeCheckout);
  
  const resetPasswordBtn = document.querySelector('.js-reset-password-btn');
  if (resetPasswordBtn) resetPasswordBtn.addEventListener('click', authManager.resetPassword);

  document.querySelectorAll('.js-record-transaction-btn').forEach(button => {
    button.addEventListener('click', () => {
      const section = button.getAttribute('data-section');
      transactionManager.recordTransaction(section);
    });
  });
});

function setupEventDelegation() {
  // Main nav tabs
  const navTabs = document.querySelector('.nav-tabs');
  if (navTabs) {
    navTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.nav-tab');
      if (tab) {
        const section = tab.getAttribute('data-section');
        
        // Handle total inventory tab
        if (section === 'total-inventory') {
          document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          document.querySelectorAll('.section-container').forEach(s => s.classList.remove('active'));
          const totalInventorySection = document.getElementById('total-inventory-section');
          if (totalInventorySection) totalInventorySection.classList.add('active');
          currentSection = 'total-inventory';
          uiManager.updateTotalInventory();
          return;
        }
        
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.section-container').forEach(s => s.classList.remove('active'));
        const sectionElement = document.getElementById(`${section}-section`);
        if (sectionElement) sectionElement.classList.add('active');
        currentSection = section;
        uiManager.resetToDefaultView(section);
      }
    });
  }

  // Sub nav tabs
  document.querySelectorAll('.sub-nav').forEach(nav => {
    nav.addEventListener('click', (e) => {
      const item = e.target.closest('.sub-nav-item');
      if (item) {
        const view = item.getAttribute('data-view');
        const section = nav.closest('.section-container').id.replace('-section', '');
        
        document.querySelectorAll(`#${section}-section .sub-nav-item`).forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll(`#${section}-section .view-content`).forEach(v => v.classList.remove('active'));
        
        const viewElement = document.getElementById(`${section}-${view}-view`);
        if (viewElement) viewElement.classList.add('active');
        
        currentView = view;
        if (view === 'inventory') {
          uiManager.loadInventoryTable(section);
          uiManager.updateCategoryInventorySummary(section);
        } else if (view === 'reports') {
          uiManager.updateReports(section);
          uiManager.loadSalesTable(section);
        } else if (view === 'categories') {
          const tabs = document.querySelectorAll(`#${section}-categories-view .js-section-tab`);
          tabs.forEach(t => t.classList.remove('active'));
          const defaultTab = document.querySelector(`#${section}-categories-view .js-section-tab[data-target-view="pos"]`);
          if (defaultTab) defaultTab.classList.add('active');
        } else if (view === 'financial') {
          uiManager.updateFinancialReports(section);
        } else if (view === 'suppliers') {
          uiManager.loadSuppliersTable(section);
        } else if (view === 'purchase-orders') {
          uiManager.loadPurchaseOrdersTable(section);
        } else if (view === 'account') {
          uiManager.updateUserStats(section);
        } else if (view === 'sales') {
          uiManager.loadSalesTable(section);
        } else if (view === 'purchases') {
          uiManager.loadPurchasesTable(section);
        }
      }
    });
  });

  // POS Search Results (Add to cart)
  document.querySelectorAll('.js-pos-search-results').forEach(container => {
    container.addEventListener('click', (e) => {
      const resultItem = e.target.closest('.pos-search-result-item');
      if (resultItem) {
        const section = container.getAttribute('data-section');
        const itemId = resultItem.getAttribute('data-id');
        const item = dataStores.inventory[section].find(invItem => invItem.id == itemId);
        if (item) {
          cartManager.addToCart(section, item);
          const searchInput = document.querySelector(`.js-pos-search[data-section="${section}"]`);
          if (searchInput) {
            searchInput.value = '';
            container.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-search"></i></div><h3 class="empty-state-title">Search for Products</h3><p class="empty-state-description">Type in search box above to find products from your inventory.</p></div>`;
          }
        }
      }
    });
  });

  // Cart Actions (Increment, Decrement, Remove)
  document.querySelectorAll('.js-pos-cart').forEach(cart => {
    cart.addEventListener('click', (e) => {
      const section = cart.getAttribute('data-section');
      if (e.target.closest('.quantity-btn')) {
        const btn = e.target.closest('.quantity-btn');
        const cartItem = btn.closest('.cart-item');
        const itemId = cartItem.getAttribute('data-item-id');
        if (btn.textContent === '+') cartManager.incrementQuantity(section, itemId);
        else if (btn.textContent === '-') cartManager.decrementQuantity(section, itemId);
      } else if (e.target.closest('.action-btn.delete')) {
        const btn = e.target.closest('.action-btn.delete');
        const cartItem = btn.closest('.cart-item');
        const itemId = cartItem.getAttribute('data-item-id');
        cartManager.removeFromCart(section, itemId);
      }
    });
  });

  // Inventory Table Actions (Edit, Delete)
  document.querySelectorAll('.js-inventory-container').forEach(container => {
    container.addEventListener('click', (e) => {
      const section = container.getAttribute('data-section');
      if (e.target.closest('.action-btn')) {
        const btn = e.target.closest('.action-btn');
        const row = btn.closest('tr');
        const itemId = row.getAttribute('data-item-id');
        if (btn.classList.contains('delete')) {
          itemManager.deleteInventoryItem(section, itemId);
        } else {
          itemManager.editInventoryItem(section, itemId);
        }
      }
    });
  });

  // Category Table Actions (Edit, Delete)
  document.querySelectorAll('.js-category-container').forEach(container => {
    container.addEventListener('click', (e) => {
      const section = container.getAttribute('data-section');
      if (e.target.closest('.action-btn')) {
        const btn = e.target.closest('.action-btn');
        const row = btn.closest('tr');
        const itemId = row.getAttribute('data-item-id');
        if (btn.classList.contains('delete')) {
          itemManager.deleteInventoryItem(section, itemId);
        } else {
          itemManager.editInventoryItem(section, itemId);
        }
      }
    });
  });

  // Suppliers Table Actions (Edit, Delete)
  document.querySelectorAll('.js-suppliers-container').forEach(container => {
    container.addEventListener('click', (e) => {
      const section = container.getAttribute('data-section');
      if (e.target.closest('.action-btn')) {
        const btn = e.target.closest('.action-btn');
        const row = btn.closest('tr');
        const itemId = row.getAttribute('data-item-id');
        if (btn.classList.contains('delete')) {
          supplierManager.deleteSupplier(section, itemId);
        } else {
          supplierManager.editSupplier(section, itemId);
        }
      }
    });
  });

  // Purchase Orders Table Actions (Edit, Delete, Receive)
  document.querySelectorAll('.js-purchase-orders-container').forEach(container => {
    container.addEventListener('click', (e) => {
      const section = container.getAttribute('data-section');
      if (e.target.closest('.action-btn')) {
        const btn = e.target.closest('.action-btn');
        const row = btn.closest('tr');
        const itemId = row.getAttribute('data-item-id');
        if (btn.classList.contains('delete')) {
          purchaseOrderManager.deletePurchaseOrder(section, itemId);
        } else if (btn.classList.contains('receive')) {
          purchaseOrderManager.receivePurchaseOrder(section, itemId);
        } else {
          purchaseOrderManager.editPurchaseOrder(section, itemId);
        }
      }
    });
  });

  // Total Inventory Table Actions (Edit, Delete)
  const totalInventoryContainer = document.querySelector('.js-total-inventory-container');
  if (totalInventoryContainer) {
    totalInventoryContainer.addEventListener('click', (e) => {
      if (e.target.closest('.action-btn')) {
        const btn = e.target.closest('.action-btn');
        const row = btn.closest('tr');
        const itemId = row.getAttribute('data-item-id');
        const section = row.getAttribute('data-section');
        if (btn.classList.contains('delete')) {
          itemManager.deleteInventoryItem(section, itemId);
        } else {
          itemManager.editInventoryItem(section, itemId);
        }
      }
    });
  }

  // Add item button
  document.querySelectorAll('.js-add-item-btn').forEach(button => {
    button.addEventListener('click', () => {
      const section = button.getAttribute('data-section');
      itemManager.showAddItemModal(section);
    });
  });

  // Add inventory button
  document.querySelectorAll('.js-add-inventory-btn').forEach(button => {
    button.addEventListener('click', () => {
      const section = button.getAttribute('data-section');
      itemManager.showAddInventoryModal(section);
    });
  });

  // Add supplier button
  document.querySelectorAll('.js-add-supplier-btn').forEach(button => {
    button.addEventListener('click', () => {
      const section = button.getAttribute('data-section');
      supplierManager.showAddSupplierModal(section);
    });
  });

  // Add purchase order button
  document.querySelectorAll('.js-add-purchase-order-btn').forEach(button => {
    button.addEventListener('click', () => {
      const section = button.getAttribute('data-section');
      purchaseOrderManager.showAddPurchaseOrderModal(section);
    });
  });

  // Checkout button
document.querySelectorAll('.js-checkout-btn').forEach(button => {
  button.addEventListener('click', () => {
    const section = button.getAttribute('data-section');
    cartManager.processCheckout(section);
  });
});
const deleteSaleBtn = document.getElementById('deleteSaleBtn');
if (deleteSaleBtn) {
  deleteSaleBtn.addEventListener('click', () => salesManager.deleteSale());
}

// Filter buttons (inventory only)
document.querySelectorAll('.filter-btn').forEach(button => {
  button.addEventListener('click', () => {
    if (button.classList.contains('js-category-tab')) return;
    const section = button.getAttribute('data-section');
    const filter = button.getAttribute('data-filter');
      
      // Handle total inventory filter buttons (no section attribute)
      if (!section) {
        document.querySelectorAll('.filter-btn:not([data-section])').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        currentFilter = filter;
        uiManager.loadTotalInventoryTable();
        return;
      }
      
      document.querySelectorAll(`[data-section="${section}"].filter-btn`).forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentFilter = filter;
      uiManager.loadInventoryTable(section);
    });
});

document.querySelectorAll('.js-section-tab').forEach(button => {
  button.addEventListener('click', () => {
    const section = button.getAttribute('data-section');
    const target = button.getAttribute('data-target-view');
    document.querySelectorAll(`#${section}-categories-view .js-section-tab`).forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    document.querySelectorAll(`#${section}-section .sub-nav-item`).forEach(i => i.classList.remove('active'));
    document.querySelectorAll(`#${section}-section .view-content`).forEach(v => v.classList.remove('active'));
    const viewElement = document.getElementById(`${section}-${target}-view`);
    if (viewElement) viewElement.classList.add('active');
    currentView = target;
    if (target === 'inventory') {
      uiManager.loadInventoryTable(section);
      uiManager.updateCategoryInventorySummary(section);
    } else if (target === 'reports') {
      uiManager.updateReports(section);
      uiManager.loadSalesTable(section);
    } else if (target === 'financial') {
      uiManager.updateFinancialReports(section);
    } else if (target === 'suppliers') {
      uiManager.loadSuppliersTable(section);
    } else if (target === 'purchase-orders') {
      uiManager.loadPurchaseOrdersTable(section);
      uiManager.loadPurchasesTable(section);
    } else if (target === 'account') {
      uiManager.updateUserStats(section);
    } else if (target === 'daily-balances') {
      uiManager.loadDailyBalancesTable(section);
    }
  });
});

document.querySelectorAll('.js-export-transactions-btn').forEach(button => {
  button.addEventListener('click', () => {
    const section = button.getAttribute('data-section');
    const sel = selectedDate[section] || utils.getTodayDate();
    const records = (dataStores.transactions[section] || []).filter(r => ((r.timestamp || '').split('T')[0]) === sel);
    if (records.length === 0) {
      utils.showNotification('No transactions for selected date', 'warning');
      return;
    }
    const headers = ['Date','Type','Amount','MerchantCharge','POSCharge','Phone','Reference','Notes'];
    const rows = records.map(r => ({
      Date: (r.timestamp || '').split('T')[0],
      Type: r.type || '',
      Amount: Number(r.amount || 0).toFixed(2),
      MerchantCharge: Number(r.charge || 0).toFixed(2),
      POSCharge: Number(r.pos_charge || 0).toFixed(2),
      Phone: r.customer_phone || '',
      Reference: r.reference || '',
      Notes: r.notes || ''
    }));
    const filename = `${section}_transactions_${sel}.csv`;
    utils.downloadCSV(filename, headers, rows);
    utils.showNotification('Daily report exported', 'success');
  });
});

document.querySelectorAll('.js-sales-container').forEach(container => {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const row = e.target.closest('tr');
    if (!row) return;
    const id = row.getAttribute('data-id');
    const section = container.getAttribute('data-section');
    if (btn.getAttribute('data-action') === 'view') {
      salesManager.viewSale(section, id);
    } else if (btn.getAttribute('data-action') === 'delete') {
      salesManager.confirmDelete(section, id);
    }
  });
});

  // Total inventory search
  const totalInventorySearch = document.getElementById('total-inventory-search');
  if (totalInventorySearch) {
    totalInventorySearch.addEventListener('input', function() {
      uiManager.filterTotalInventory(this.value);
    });
  }
}

// Listen for authentication state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    currentUser = session.user;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    uiManager.updateUserInfo(session.user);
    dataManager.loadDataFromSupabase();
    window.addEventListener('online', uiManager.handleOnlineStatus);
    window.addEventListener('offline', uiManager.handleOfflineStatus);
    uiManager.initializeApp();
  } else if (event === 'SIGNED_OUT') {
    currentUser = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
  }
});



let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  deferredPrompt = e;
  const btn1 = document.getElementById('installBtn');
  const btn2 = document.getElementById('installBtnLogin');
  if (btn1) btn1.style.display = 'inline-block';
  if (btn2) btn2.style.display = 'inline-block';
  utils.showNotification('Install available. Tap Install App to add to home screen.', 'info');
});
const installButtons = ['installBtn', 'installBtnLogin']
  .map(id => document.getElementById(id))
  .filter(Boolean);
installButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) {
      const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (!isStandalone && isIOS) {
        utils.showNotification('On iOS, use Share → Add to Home Screen to install.', 'info');
      } else {
        utils.showNotification('Install not available yet. Use HTTPS/localhost and ensure manifest icons.', 'info');
      }
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installButtons.forEach(b => b.style.display = 'none');
      utils.showNotification('App installed successfully', 'success');
    }
    deferredPrompt = null;
  });
});
window.addEventListener('appinstalled', () => {
  const btn1 = document.getElementById('installBtn');
  const btn2 = document.getElementById('installBtnLogin');
  if (btn1) btn1.style.display = 'none';
  if (btn2) btn2.style.display = 'none';
  utils.showNotification('App installed', 'success');
});