// Validaciones
export const validateSKU = (sku) => {
  if (!sku || sku.trim() === '') return 'SKU es requerido';
  if (sku.length > 20) return 'SKU no puede exceder 20 caracteres';
  return null;
};

export const validateDescription = (desc) => {
  if (!desc || desc.trim() === '') return 'Descripción es requerida';
  if (desc.length > 100) return 'Descripción no puede exceder 100 caracteres';
  return null;
};

export const validateCost = (cost) => {
  const num = parseFloat(cost);
  if (isNaN(num) || num < 0) return 'Costo debe ser un número positivo';
  return null;
};

export const validateStock = (stock) => {
  const num = parseInt(stock, 10);
  if (isNaN(num) || num < 0) return 'Stock debe ser un número positivo';
  return null;
};

export const validateQuantity = (qty) => {
  const num = parseInt(qty, 10);
  if (isNaN(num) || num <= 0) return 'Cantidad debe ser mayor a 0';
  return null;
};

export const validateTechnicianName = (name) => {
  if (!name || name.trim() === '') return 'Nombre del técnico es requerido';
  if (name.length > 50) return 'Nombre no puede exceder 50 caracteres';
  return null;
};

// Formato de dinero
export const formatMoney = (amount) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
};

// Parser CSV mejorado
export const parseCSVData = (text) => {
  const rows = text.split('\n');
  const result = [];
  
  for (let i = 1; i < rows.length; i += 1) {
    if (!rows[i].trim()) continue;
    
    // Simple CSV parser que respeta comillas
    const columns = rows[i]
      .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map(col => col.replace(/^"|"$/g, '').trim());
    
    const colOffset = columns[0] === '' ? 1 : 0;
    
    if (columns.length > 5) {
      result.push({
        id: columns[colOffset] || `DESC-${i}`,
        desc: columns[colOffset + 1] || 'Sin descripción',
        cost: parseFloat(columns[colOffset + 2]) || 0,
        warehouse: columns[colOffset + 3] || 'ALM-CUU',
        stock: parseInt(columns[colOffset + 4], 10) || 0,
        reserved: parseInt(columns[colOffset + 5], 10) || 0,
        available: parseInt(columns[colOffset + 6], 10) || 0,
        totalCost: parseFloat(columns[colOffset + 7]) || 0,
      });
    }
  }
  
  return result;
};

// Detectar duplicados
export const findDuplicateSKUs = (items) => {
  const seen = new Set();
  const duplicates = [];
  
  items.forEach(item => {
    if (seen.has(item.id.toUpperCase())) {
      duplicates.push(item.id);
    }
    seen.add(item.id.toUpperCase());
  });
  
  return duplicates;
};

// Cálculos de métricas
export const calculateMetrics = (inventory) => {
  const totalValue = inventory.reduce((sum, item) => sum + item.totalCost, 0);
  const totalItems = inventory.length;
  const totalUnits = inventory.reduce((sum, item) => sum + item.stock, 0);
  const lowStockCount = inventory.filter(item => item.available < 2).length;
  const totalReserved = inventory.reduce((sum, item) => sum + item.reserved, 0);
  
  const topValued = [...inventory].sort((a, b) => b.totalCost - a.totalCost).slice(0, 5);
  const maxTopValue = topValued.length > 0 ? topValued[0].totalCost : 1;
  
  // Agrupar por almacén
  const byWarehouse = {};
  inventory.forEach(item => {
    if (!byWarehouse[item.warehouse]) {
      byWarehouse[item.warehouse] = { units: 0, value: 0, items: 0 };
    }
    byWarehouse[item.warehouse].units += item.stock;
    byWarehouse[item.warehouse].value += item.totalCost;
    byWarehouse[item.warehouse].items += 1;
  });
  
  return { totalValue, totalItems, totalUnits, lowStockCount, totalReserved, topValued, maxTopValue, byWarehouse };
};

// Histograma de órdenes
export const getOrderStats = (orders) => {
  const completed = orders.filter(o => o.status === 'completed').length;
  const pending = orders.filter(o => o.status === 'pending').length;
  const totalItems = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.qty, 0), 0);
  
  return { completed, pending, totalItems };
};

// Generar ID único
export const generateOrderId = (existingOrders) => {
  const maxNum = existingOrders
    .map(o => parseInt(o.id.replace('PED-', ''), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => b - a)[0] || 0;
  
  return `PED-${String(maxNum + 1).padStart(3, '0')}`;
};

// Estadísticas por Técnico
export const getTechnicianStats = (orders) => {
  const stats = {};
  
  orders.forEach(order => {
    if (!stats[order.technician]) {
      stats[order.technician] = { total: 0, completed: 0, pending: 0, items: 0 };
    }
    stats[order.technician].total += 1;
    stats[order.technician][order.status] += 1;
    stats[order.technician].items += order.items.reduce((sum, i) => sum + i.qty, 0);
  });
  
  return Object.entries(stats).map(([name, data]) => ({
    name,
    ...data,
    rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
  }));
};

// Items próximos a agotar (configurado en 5 unidades)
export const findLowStockItems = (inventory, threshold = 5) => {
  return inventory
    .filter(item => item.available > 0 && item.available <= threshold)
    .sort((a, b) => a.available - b.available);
};

// Crear backup JSON
export const createBackupJSON = (inventory, orders, history) => {
  return JSON.stringify(
    {
      version: '2.0',
      exportDate: new Date().toISOString(),
      inventory,
      orders,
      history,
    },
    null,
    2
  );
};
