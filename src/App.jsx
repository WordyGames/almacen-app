import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  AlertTriangle,
  Search,
  Upload,
  X,
  Menu,
  Box,
  ClipboardList,
  CheckCircle,
  User,
  Download,
  PlusCircle,
  Trash2,
  Moon,
  Sun,
  BarChart3,
  Monitor,
  RotateCcw,
} from 'lucide-react';
import Toast from './components/Toast';
import EmptyState from './components/EmptyState';
import InventoryTable from './components/InventoryTable';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import {
  validateSKU,
  validateDescription,
  validateCost,
  validateStock,
  validateQuantity,
  formatMoney,
  parseCSVData,
  findDuplicateSKUs,
  calculateMetrics,
  getOrderStats,
  generateOrderId,
  getTechnicianStats,
  findLowStockItems,
  createBackupJSON,
} from './utils/helpers';
import {
  INITIAL_DATA,
  INITIAL_ORDERS,
  SYSTEM_USERS,
  ORDER_FULFILLMENT_USERS,
  CLIENTS,
  CLIENT_SLA_HOURS,
} from './constants/appData';

export default function App() {
  // === MEJORA 1: localStorage - Persistencia de datos ===
  const [inventory, setInventory] = useLocalStorage('almacen-inventory', INITIAL_DATA);
  const [orders, setOrders] = useLocalStorage('almacen-orders', INITIAL_ORDERS);
  const [history, setHistory] = useLocalStorage('almacen-history', []);
  const [darkMode, setDarkMode] = useLocalStorage('almacen-darkmode', false);

  // UI State
  const [view, setView] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 250);
  const debouncedGlobalSearch = useDebouncedValue(globalSearch, 250);
  const isInventorySearching = searchTerm !== debouncedSearchTerm;
  const isGlobalSearching = globalSearch !== debouncedGlobalSearch;
  const [sortConfig, setSortConfig] = useState({ key: 'totalCost', direction: 'desc' });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showEditItem, setShowEditItem] = useState(null);
  const [toast, setToast] = useState(null);

  // Sesión / Login
  const [currentUser, setCurrentUser] = useLocalStorage('almacen-current-user', '');
  const [isAuthenticated, setIsAuthenticated] = useLocalStorage('almacen-is-authenticated', false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const activeUser = useMemo(
    () => SYSTEM_USERS.find(u => u.username === currentUser) || null,
    [currentUser]
  );

  const roleValue = (activeUser?.role || '').toLowerCase();
  const permissions = useMemo(() => {
    const isAdmin = roleValue.includes('administrador');
    const isTech = roleValue.includes('tecnico') || roleValue.includes('workshop');
    const isService = roleValue.includes('servicio') || roleValue.includes('back office');
    const canFulfillByUser = ORDER_FULFILLMENT_USERS.has((currentUser || '').toLowerCase());
    const canViewAdminPanel = isAdmin || isService;

    return {
      canViewDashboard: canViewAdminPanel,
      canViewInventory: canViewAdminPanel,
      canEditInventory: isAdmin,
      canManageData: isAdmin,
      canCreateOrder: isAdmin || isTech || isService,
      canCompleteOrder: canFulfillByUser,
      canViewReports: isAdmin || isService,
      canViewSensitiveUsers: isAdmin,
      canViewTv: true,
      canAssignTechnicians: isAdmin || currentUser === 'lfuentes',
    };
  }, [roleValue, currentUser]);

  const panelTypeLabel = permissions.canViewDashboard ? 'Administrativo' : 'Operativo';

  useEffect(() => {
    if (!isAuthenticated) return;

    const allowedViews = new Set(['orders', 'tv']);
    if (permissions.canViewDashboard) allowedViews.add('dashboard');
    if (permissions.canViewInventory) allowedViews.add('inventory');
    if (permissions.canViewReports) allowedViews.add('reports');

    if (!allowedViews.has(view)) {
      setView('orders');
      setIsMobileMenuOpen(false);
    }
  }, [
    isAuthenticated,
    view,
    permissions.canViewDashboard,
    permissions.canViewInventory,
    permissions.canViewReports,
  ]);

  // Limpieza de datos demo heredados (versiones anteriores)
  useEffect(() => {
    const demoClients = new Set(['carlos ruiz', 'mariana vega']);
    const cleaned = orders.filter(order => !demoClients.has((order.client || '').toLowerCase()));
    if (cleaned.length !== orders.length) {
      setOrders(cleaned);
    }
  }, [orders, setOrders]);
  const [tvClock, setTvClock] = useState(new Date());
  const [animateTvProgress, setAnimateTvProgress] = useState(false);

  useEffect(() => {
    if (view !== 'tv') return undefined;
    const interval = setInterval(() => setTvClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, [view]);

  useEffect(() => {
    if (view !== 'tv') return undefined;
    setAnimateTvProgress(false);
    const timer = setTimeout(() => setAnimateTvProgress(true), 80);
    return () => clearTimeout(timer);
  }, [view, orders]);

  // === MEJORA 5: Estadísticas por Técnico ===
  const techStats = useMemo(() => getTechnicianStats(orders), [orders]);

  // === MEJORA 1: Búsqueda Global ===
  const globalResults = useMemo(() => {
    if (!debouncedGlobalSearch.trim()) return { inventory: [], orders: [], items: 0 };
    const term = debouncedGlobalSearch.toLowerCase();
    const inventoryResults = inventory.filter(i =>
      i.id.toLowerCase().includes(term) || i.desc.toLowerCase().includes(term)
    );
    const orderResults = orders.filter(o =>
      o.id.toLowerCase().includes(term) ||
      (o.client || '').toLowerCase().includes(term) ||
      (o.assignedTo || '').toLowerCase().includes(term) ||
      o.items.some(item => item.id.toLowerCase().includes(term) || item.desc.toLowerCase().includes(term))
    );
    return { inventory: inventoryResults, orders: orderResults, items: inventoryResults.length + orderResults.length };
  }, [debouncedGlobalSearch, inventory, orders]);

  // === MEJORA 3: Items próximos a agotar ===
  const lowStockItems = useMemo(() => findLowStockItems(inventory, 5), [inventory]);

  // Pedido nuevo - ahora por cliente, técnico asignado después
  const [newOrderClient, setNewOrderClient] = useState('');
  const [newOrderPriority, setNewOrderPriority] = useState('Media');
  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [newOrderItems, setNewOrderItems] = useState([{ id: '', qty: 1 }]);
  const [orderErrors, setOrderErrors] = useState({});
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({ orderId: '', technicianId: '' });
  const [bulkTechnicianId, setBulkTechnicianId] = useState('');
  const [bulkOrderIds, setBulkOrderIds] = useState([]);
  const [orderQuickFilters, setOrderQuickFilters] = useState({ client: 'ALL', technician: 'ALL' });

  const technicianUsers = useMemo(
    () => SYSTEM_USERS.filter(u => u.role.toLowerCase().includes('tecnico')),
    []
  );

  // === MEJORA 4: Edición inline ===
  const [editData, setEditData] = useState({});

  // === MEJORA 9: Búsqueda y Filtros avanzados ===
  const [filters, setFilters] = useState({ warehouse: 'ALL', minStock: 0, maxStock: 999 });

  // === Funciones auxiliares ===
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const addHistory = useCallback((action, details) => {
    const newEntry = { 
      id: Date.now(), 
      timestamp: new Date().toISOString(), 
      action, 
      details,
      user: currentUser || 'Sistema'
    };
    setHistory([newEntry, ...history].slice(0, 100));
  }, [history, setHistory, currentUser]);

  const getOrderCreatedAt = useCallback((order) => {
    if (order?.createdAt) {
      const direct = new Date(order.createdAt);
      if (!Number.isNaN(direct.getTime())) return direct;
    }
    if (order?.date) {
      const byDate = new Date(`${order.date}T00:00:00`);
      if (!Number.isNaN(byDate.getTime())) return byDate;
    }
    return new Date();
  }, []);

  const unassignedPendingOrders = useMemo(
    () => orders.filter(o => o.status === 'pending' && !o.assignedTo),
    [orders]
  );

  const orderClients = useMemo(
    () => Array.from(new Set(orders.map(o => o.client).filter(Boolean))).sort(),
    [orders]
  );

  const orderTechnicianOptions = useMemo(
    () => Array.from(new Set(orders.map(o => o.assignedTo).filter(Boolean))).sort(),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchClient = orderQuickFilters.client === 'ALL' || order.client === orderQuickFilters.client;
      const matchTechnician = orderQuickFilters.technician === 'ALL'
        || (orderQuickFilters.technician === 'UNASSIGNED' ? !order.assignedTo : order.assignedTo === orderQuickFilters.technician);
      return matchClient && matchTechnician;
    });
  }, [orders, orderQuickFilters]);

  const activeOrderFilterChips = useMemo(() => {
    const chips = [];

    if (orderQuickFilters.client !== 'ALL') {
      chips.push({
        key: 'client',
        label: `Cliente: ${orderQuickFilters.client}`,
        clear: () => setOrderQuickFilters(prev => ({ ...prev, client: 'ALL' })),
      });
    }

    if (orderQuickFilters.technician !== 'ALL') {
      const techLabel = orderQuickFilters.technician === 'UNASSIGNED'
        ? 'Sin asignar'
        : `${SYSTEM_USERS.find(u => u.username === orderQuickFilters.technician)?.name || orderQuickFilters.technician} (${orderQuickFilters.technician})`;

      chips.push({
        key: 'technician',
        label: `Técnico: ${techLabel}`,
        clear: () => setOrderQuickFilters(prev => ({ ...prev, technician: 'ALL' })),
      });
    }

    return chips;
  }, [orderQuickFilters]);

  useEffect(() => {
    setBulkOrderIds(prev => prev.filter(id => orders.some(o => o.id === id && o.status === 'pending')));
  }, [orders]);

  const handleLogin = (e) => {
    e.preventDefault();
    const username = loginForm.username.trim().toLowerCase();
    const password = loginForm.password;

    const user = SYSTEM_USERS.find(
      u => u.username.toLowerCase() === username && u.password === password
    );

    if (!user) {
      setLoginError('Usuario o contraseña incorrectos');
      return;
    }

    setCurrentUser(user.username);
    setIsAuthenticated(true);
    setLoginError('');
    setLoginForm({ username: '', password: '' });

    const userRoleValue = (user.role || '').toLowerCase();
    const isAdminPanelUser = userRoleValue.includes('administrador') || userRoleValue.includes('servicio') || userRoleValue.includes('back office');
    setView(isAdminPanelUser ? 'dashboard' : 'orders');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser('');
    setIsMobileMenuOpen(false);
    setView('dashboard');
  };

  // Backup & Restore
  const downloadBackup = () => {
    if (!permissions.canManageData) {
      showToast('⛔ Tu rol no tiene permiso para descargar backups', 'error');
      return;
    }
    const backupData = createBackupJSON(inventory, orders, history);
    const blob = new Blob([backupData], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `almacen-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✅ Backup descargado', 'success');
  };

  const restoreBackup = (event) => {
    if (!permissions.canManageData) {
      showToast('⛔ Tu rol no tiene permiso para restaurar backups', 'error');
      return;
    }
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const backupData = JSON.parse(e.target.result);
        if (backupData.inventory && backupData.orders) {
          if (window.confirm('⚠️ Esto sobrescribirá todo tu inventario, pedidos e historial. ¿Continuar?')) {
            setInventory(backupData.inventory);
            setOrders(backupData.orders);
            setHistory(backupData.history || []);
            showToast('✅ Datos restaurados correctamente', 'success');
            addHistory('restore', { itemsCount: backupData.inventory.length });
          }
        } else {
          showToast('❌ Archivo de backup inválido', 'error');
        }
      } catch (error) {
        showToast(`❌ Error al restaurar: ${error.message}`, 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // === MEJORA 8: Importar/Exportar mejorado ===
  const exportToCSV = () => {
    if (!permissions.canManageData) {
      showToast('⛔ Tu rol no tiene permiso para exportar', 'error');
      return;
    }
    const headers = ['Artículo', 'Descripcion', 'UltimoCosto', 'Almacén', 'Existencias', 'Reservado', 'Disponible', 'COSTO TOTAL'];
    const csvRows = inventory.map(item => {
      const desc = `"${item.desc.replace(/"/g, '""')}"`;
      return [item.id, desc, item.cost, item.warehouse, item.stock, item.reserved, item.available, item.totalCost.toFixed(2)].join(',');
    });
    const csvContent = `data:text/csv;charset=utf-8,${headers.join(',')}\n${csvRows.join('\n')}`;
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Inventario_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✅ CSV exportado correctamente', 'success');
    addHistory('export', { itemsCount: inventory.length });
  };

  const handleFileUpload = (event) => {
    if (!permissions.canManageData) {
      showToast('⛔ Tu rol no tiene permiso para importar', 'error');
      return;
    }
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const newData = parseCSVData(e.target.result);
        const duplicates = findDuplicateSKUs(newData);
        
        // Filtrar items sin duplicados internos
        const uniqueItems = newData.filter(item => !duplicates.includes(item.id));
        
        if (duplicates.length > 0) {
          showToast(`⚠️ Se ignoraron ${duplicates.length} SKU(s) duplicado(s): ${duplicates.slice(0, 5).join(', ')}${duplicates.length > 5 ? '...' : ''}`, 'error');
        }
        
        // Fusionar con inventario existente
        const updated = uniqueItems.map(newItem => {
          const existing = inventory.find(i => i.id.toLowerCase() === newItem.id.toLowerCase());
          return existing ? { ...existing, ...newItem } : newItem;
        });
        
        // Agregar items existentes que no estén en el CSV
        const importedIds = new Set(updated.map(i => i.id.toLowerCase()));
        const kept = inventory.filter(i => !importedIds.has(i.id.toLowerCase()));
        
        const final = [...updated, ...kept];
        setInventory(final);
        addHistory('import', { itemsCount: uniqueItems.length, duplicatesRemoved: duplicates.length });
        showToast(`✅ ${uniqueItems.length} artículos importados` + (duplicates.length > 0 ? ` (${duplicates.length} duplicados ignorados)` : ''), 'success');
      } catch (error) {
        showToast(`❌ Error CSV: ${error.message}`, 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // === MEJORA 3: Validaciones robustas ===
  const updateStock = (id, delta) => {
    if (!permissions.canEditInventory) {
      showToast('⛔ Solo administradores pueden editar inventario', 'error');
      return;
    }
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const newStock = Math.max(0, Math.min(999, item.stock + delta));
    const newAvailable = Math.max(0, newStock - item.reserved);
    const updated = inventory.map(i =>
      i.id === id ? { ...i, stock: newStock, available: newAvailable, totalCost: newAvailable * i.cost } : i
    );
    setInventory(updated);
    addHistory('stock-update', { itemId: id, delta, newStock });
    showToast(`Stock ${item.id}: ${newStock}`, 'success');
  };

  // === MEJORA 4: Edición inline ===
  const startEditItem = item => {
    setShowEditItem(item.id);
    setEditData({ ...item });
  };

  const saveEditedItem = () => {
    if (!permissions.canEditInventory) {
      showToast('⛔ Solo administradores pueden editar inventario', 'error');
      return;
    }
    const errors = {};
    if (validateSKU(editData.id)) errors.id = validateSKU(editData.id);
    if (validateDescription(editData.desc)) errors.desc = validateDescription(editData.desc);
    if (validateCost(editData.cost)) errors.cost = validateCost(editData.cost);
    if (validateStock(editData.stock)) errors.stock = validateStock(editData.stock);
    if (Object.keys(errors).length > 0) {
      setOrderErrors(errors);
      showToast('❌ Errores en validación', 'error');
      return;
    }
    const oldItem = inventory.find(i => i.id === showEditItem);
    const updated = inventory.map(i => (i.id === showEditItem ? editData : i));
    setInventory(updated);
    setShowEditItem(null);
    addHistory('item-edited', { 
      itemId: editData.id,
      before: { desc: oldItem?.desc, cost: oldItem?.cost, stock: oldItem?.stock },
      after: { desc: editData.desc, cost: editData.cost, stock: editData.stock }
    });
    showToast('✅ Artículo actualizado', 'success');
  };

  const cancelEditItem = () => {
    setShowEditItem(null);
    setEditData({});
    setOrderErrors({});
  };

  const deleteItem = id => {
    if (!permissions.canEditInventory) {
      showToast('⛔ Solo administradores pueden eliminar artículos', 'error');
      return;
    }
    if (window.confirm(`¿Eliminar ${id}? Esta acción no se puede deshacer.`)) {
      setInventory(inventory.filter(i => i.id !== id));
      addHistory('item-delete', { itemId: id });
      showToast('✅ Artículo eliminado', 'success');
    }
  };

  const resolveProductQuery = (query) => {
    const normalized = (query || '').trim().toLowerCase();
    if (!normalized) return { found: false, reason: 'Producto vacío' };

    const bySku = inventory.find(i => i.id.toLowerCase() === normalized);
    if (bySku) return { found: true, item: bySku };

    const byExactDesc = inventory.filter(i => i.desc.toLowerCase() === normalized);
    if (byExactDesc.length === 1) return { found: true, item: byExactDesc[0] };

    const byContainsDesc = inventory.filter(i => i.desc.toLowerCase().includes(normalized));
    if (byContainsDesc.length === 1) return { found: true, item: byContainsDesc[0] };
    if (byContainsDesc.length > 1) {
      return {
        found: false,
        reason: `Coincidencia múltiple (${byContainsDesc.slice(0, 3).map(i => i.id).join(', ')}...)`,
      };
    }

    return { found: false, reason: 'No existe en inventario' };
  };

  // === MEJORA 3: Validaciones en creación de pedidos - AHORA POR CLIENTE ===
  const handleCreateOrder = e => {
    e.preventDefault();
    if (!permissions.canCreateOrder) {
      showToast('⛔ Tu rol no tiene permiso para crear pedidos', 'error');
      return;
    }
    const errors = {};
    if (!newOrderClient.trim()) errors.client = 'El nombre del cliente es requerido';
    const validItems = newOrderItems.filter(i => i.id.trim() !== '' && i.qty > 0);
    if (validItems.length === 0) errors.items = 'Agrega items válidos';
    validItems.forEach((item, idx) => {
      const resolved = resolveProductQuery(item.id);
      if (!resolved.found) errors[`item-${idx}-id`] = `Producto inválido: ${resolved.reason}`;
      if (validateQuantity(item.qty)) errors[`item-${idx}-qty`] = validateQuantity(item.qty);
    });
    if (Object.keys(errors).length > 0) {
      setOrderErrors(errors);
      showToast('❌ Hay errores en el formulario', 'error');
      return;
    }
    const itemsWithDesc = validItems.map(req => {
      const resolved = resolveProductQuery(req.id).item;
      return {
        id: resolved.id,
        desc: resolved.desc,
        qty: parseInt(req.qty, 10),
      };
    });
    const newOrder = {
      id: generateOrderId(orders),
      client: newOrderClient.trim(),
      priority: newOrderPriority,
      notes: newOrderNotes.trim(),
      assignedTo: null,
      createdAt: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      status: 'pending',
      items: itemsWithDesc,
    };
    setOrders([newOrder, ...orders]);
    setShowOrderModal(false);
    setNewOrderClient('');
    setNewOrderPriority('Media');
    setNewOrderNotes('');
    setNewOrderItems([{ id: '', qty: 1 }]);
    setOrderErrors({});
    addHistory('order-created', { orderId: newOrder.id });
    showToast(`✅ Pedido ${newOrder.id} creado - Pendiente de asignación`, 'success');
  };

  // === Asignación de técnicos por planeador ===
  const openAssignmentModal = (order = null) => {
    if (!permissions.canAssignTechnicians) {
      showToast('⛔ Solo el planeador puede asignar técnicos', 'error');
      return;
    }

    if (order) {
      setAssignmentForm({
        orderId: order.id,
        technicianId: order.assignedTo || '',
      });
    } else {
      setAssignmentForm({ orderId: '', technicianId: '' });
    }

    setShowAssignmentModal(true);
  };

  const handleAssignTechnician = e => {
    e.preventDefault();
    if (!permissions.canAssignTechnicians) {
      showToast('⛔ Solo el planeador puede asignar técnicos', 'error');
      return;
    }
    if (!assignmentForm.orderId || !assignmentForm.technicianId) {
      showToast('❌ Selecciona orden y técnico', 'error');
      return;
    }

    const targetOrder = orders.find(o => o.id === assignmentForm.orderId);
    if (!targetOrder) {
      showToast('❌ La orden seleccionada ya no existe', 'error');
      return;
    }

    const previousTechnician = targetOrder.assignedTo || null;
    if (previousTechnician === assignmentForm.technicianId) {
      showToast('ℹ️ La orden ya está asignada a ese técnico', 'error');
      return;
    }

    setOrders(orders.map(o => o.id === assignmentForm.orderId ? { ...o, assignedTo: assignmentForm.technicianId } : o));
    setShowAssignmentModal(false);
    setAssignmentForm({ orderId: '', technicianId: '' });

    addHistory(previousTechnician ? 'order-reassigned' : 'order-assigned', {
      orderId: assignmentForm.orderId,
      from: previousTechnician,
      assignedTo: assignmentForm.technicianId,
    });

    showToast(
      previousTechnician
        ? `✅ Orden ${assignmentForm.orderId} re-asignada a ${assignmentForm.technicianId}`
        : `✅ Orden ${assignmentForm.orderId} asignada a ${assignmentForm.technicianId}`,
      'success'
    );
  };

  const handleBulkAssign = () => {
    if (!permissions.canAssignTechnicians) {
      showToast('⛔ Solo el planeador puede asignar técnicos', 'error');
      return;
    }
    if (!bulkTechnicianId || bulkOrderIds.length === 0) {
      showToast('❌ Selecciona órdenes y técnico', 'error');
      return;
    }

    setOrders(prev => prev.map(order => (
      bulkOrderIds.includes(order.id) ? { ...order, assignedTo: bulkTechnicianId } : order
    )));

    addHistory('order-bulk-assigned', {
      orderIds: bulkOrderIds,
      assignedTo: bulkTechnicianId,
      count: bulkOrderIds.length,
    });

    showToast(`✅ ${bulkOrderIds.length} pedido(s) asignados a ${bulkTechnicianId}`, 'success');
    setBulkOrderIds([]);
    setBulkTechnicianId('');
  };

  const completeOrder = orderId => {
    if (!permissions.canCompleteOrder) {
      showToast('⛔ Tu rol no tiene permiso para surtir pedidos', 'error');
      return;
    }
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    if (!order.assignedTo) {
      showToast('⚠️ Asigna un técnico antes de surtir este pedido', 'error');
      return;
    }
    const missingItems = [];
    order.items.forEach(reqItem => {
      const invItem = inventory.find(i => i.id === reqItem.id);
      if (!invItem || invItem.available < reqItem.qty) missingItems.push(reqItem.id);
    });
    if (missingItems.length > 0) {
      showToast(`⚠️ Stock insuficiente: ${missingItems.join(', ')}`, 'error');
      return;
    }
    if (window.confirm(`¿Confirmar entrega ${orderId}?`)) {
      let updated = inventory;
      order.items.forEach(reqItem => {
        updated = updated.map(invItem => {
          if (invItem.id === reqItem.id) {
            const newStock = Math.max(0, invItem.stock - reqItem.qty);
            const newAvailable = Math.max(0, newStock - invItem.reserved);
            return { ...invItem, stock: newStock, available: newAvailable, totalCost: newAvailable * invItem.cost };
          }
          return invItem;
        });
      });
      setInventory(updated);
      setOrders(orders.map(o => (o.id === orderId ? { ...o, status: 'completed' } : o)));
      addHistory('order-completed', { orderId });
      showToast(`✅ Pedido ${orderId} surtido`, 'success');
    }
  };

  // Sorting
  const handleSort = key => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  // === MEJORA 9: Búsqueda y Filtros avanzados ===
  const filteredAndSortedInventory = useMemo(() => {
    const warehouseFilter = filters.warehouse === 'ALL' ? null : filters.warehouse;
    const searchValue = debouncedSearchTerm.toLowerCase();
    let result = inventory.filter(item => {
      const matchesSearch = item.id.toLowerCase().includes(searchValue) ||
        item.desc.toLowerCase().includes(searchValue);
      const matchesWarehouse = !warehouseFilter || item.warehouse === warehouseFilter;
      const matchesStock = item.stock >= filters.minStock && item.stock <= filters.maxStock;
      return matchesSearch && matchesWarehouse && matchesStock;
    });
    result.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [inventory, debouncedSearchTerm, sortConfig, filters]);

  // === MEJORA 5: Reportes y Estadísticas ===
  const metrics = useMemo(() => calculateMetrics(inventory), [inventory]);
  const orderStats = useMemo(() => getOrderStats(orders), [orders]);
  const warehouses = useMemo(() => Array.from(new Set(inventory.map(i => i.warehouse))), [inventory]);
  const tvOrders = useMemo(() => {
    // Planeador ve todas; técnicos ven solo sus órdenes asignadas
    const isTechnician = roleValue.includes('tecnico');
    let filtered = orders;
    if (isTechnician && !currentUser.includes('madrid') && !currentUser.includes('solis')) {
      // Técnico regular ve solo sus asignadas
      filtered = orders.filter(o => o.assignedTo === currentUser);
    }
    return filtered.sort((a, b) => {
      if (a.status === b.status) return getOrderCreatedAt(b) - getOrderCreatedAt(a);
      return a.status === 'pending' ? -1 : 1;
    });
  }, [orders, currentUser, roleValue, getOrderCreatedAt]);

  const getProcessInfo = useCallback((order) => {
    if (order.status === 'completed') {
      return { label: 'Entregado', color: 'bg-emerald-500 text-white', progress: 100 };
    }

    const created = getOrderCreatedAt(order);
    const diffHours = (tvClock.getTime() - created.getTime()) / (1000 * 60 * 60);
    if (diffHours >= 48) {
      return { label: 'En espera', color: 'bg-red-500 text-white', progress: 30 };
    }

    return { label: 'En proceso', color: 'bg-amber-500 text-black', progress: 65 };
  }, [tvClock, getOrderCreatedAt]);

  const getSlaHours = useCallback((client) => CLIENT_SLA_HOURS[client] || 48, []);

  const getSlaInfo = useCallback((order, now = new Date()) => {
    const slaHours = getSlaHours(order.client);
    const created = getOrderCreatedAt(order);
    const elapsedHours = Math.max(0, (now.getTime() - created.getTime()) / (1000 * 60 * 60));
    const remainingHours = Math.round(slaHours - elapsedHours);

    if (order.status === 'completed') {
      return { label: 'Completado', traffic: 'bg-emerald-500', text: 'text-emerald-600', remainingHours, slaHours };
    }
    if (remainingHours < 0) {
      return { label: 'Atrasado', traffic: 'bg-red-500', text: 'text-red-600', remainingHours, slaHours };
    }
    if (remainingHours <= Math.max(6, Math.round(slaHours * 0.25))) {
      return { label: 'Urge hoy', traffic: 'bg-amber-500', text: 'text-amber-600', remainingHours, slaHours };
    }
    return { label: 'A tiempo', traffic: 'bg-emerald-500', text: 'text-emerald-600', remainingHours, slaHours };
  }, [getSlaHours, getOrderCreatedAt]);

  const getTimeWindowText = useCallback((remainingHours) => {
    if (remainingHours < 0) return `Atrasado ${Math.abs(remainingHours)}h`;
    if (remainingHours === 0) return 'Vence ahora';
    if (remainingHours === 1) return 'Queda 1h';
    return `Quedan ${remainingHours}h`;
  }, []);

  const priorityBadgeClass = (priority = 'Media') => {
    if (priority === 'Alta') return 'bg-red-100 text-red-700';
    if (priority === 'Baja') return 'bg-emerald-100 text-emerald-700';
    return 'bg-amber-100 text-amber-700';
  };

  const mapActionLabel = (action) => {
    const labels = {
      'order-created': 'Pedido creado',
      'order-assigned': 'Asignado',
      'order-reassigned': 'Reasignado',
      'order-bulk-assigned': 'Asignación masiva',
      'order-completed': 'Pedido surtido',
    };
    return labels[action] || action;
  };

  const getOrderTimeline = (orderId) => {
    return history
      .filter(entry => {
        const details = entry.details || {};
        if (details.orderId === orderId) return true;
        if (Array.isArray(details.orderIds) && details.orderIds.includes(orderId)) return true;
        return false;
      })
      .slice(0, 5);
  };

  const statusBadgeClass = (status) => {
    if (status === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
  };

  const tvSlaSummary = useMemo(() => {
    return tvOrders.reduce((acc, order) => {
      const sla = getSlaInfo(order, tvClock);
      if (sla.label === 'Atrasado') acc.overdue += 1;
      if (sla.label === 'Urge hoy') acc.warning += 1;
      if (sla.label === 'A tiempo') acc.onTime += 1;
      if (order.status === 'pending' && !order.assignedTo) acc.unassigned += 1;
      return acc;
    }, { overdue: 0, warning: 0, onTime: 0, unassigned: 0 });
  }, [tvOrders, tvClock, getSlaInfo]);

  const kanbanColumns = useMemo(() => {
    const pending = filteredOrders.filter(o => o.status === 'pending');

    return [
      {
        id: 'unassigned',
        title: 'Sin asignar',
        tone: 'slate',
        orders: pending.filter(o => !o.assignedTo),
      },
      {
        id: 'on-time',
        title: 'A tiempo',
        tone: 'emerald',
        orders: pending.filter(o => o.assignedTo && getSlaInfo(o).label === 'A tiempo'),
      },
      {
        id: 'warning',
        title: 'Urge hoy',
        tone: 'amber',
        orders: pending.filter(o => o.assignedTo && getSlaInfo(o).label === 'Urge hoy'),
      },
      {
        id: 'overdue',
        title: 'Atrasado',
        tone: 'red',
        orders: pending.filter(o => o.assignedTo && getSlaInfo(o).label === 'Atrasado'),
      },
      {
        id: 'done',
        title: 'Completado',
        tone: 'blue',
        orders: filteredOrders.filter(o => o.status === 'completed'),
      },
    ];
  }, [filteredOrders, getSlaInfo]);

  const kanbanToneClass = (tone) => {
    if (tone === 'emerald') return darkMode ? 'border-emerald-700/60 bg-emerald-900/20' : 'border-emerald-200 bg-emerald-50/70';
    if (tone === 'amber') return darkMode ? 'border-amber-700/60 bg-amber-900/20' : 'border-amber-200 bg-amber-50/70';
    if (tone === 'red') return darkMode ? 'border-red-700/60 bg-red-900/20' : 'border-red-200 bg-red-50/70';
    if (tone === 'blue') return darkMode ? 'border-blue-700/60 bg-blue-900/20' : 'border-blue-200 bg-blue-50/70';
    return darkMode ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-slate-50/80';
  };

  // === MEJORA 7: Dark Mode ===
  const bgColor = darkMode ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-800';
  const cardColor = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/60';
  const inputColor = darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800';

  if (!isAuthenticated) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bgColor} p-4`}>
        <div className={`${cardColor} w-full max-w-md rounded-2xl border shadow-xl p-6`}>
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold">Ingreso al Sistema</h1>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Almacén CUU · Acceso por perfil</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Usuario</label>
              <input
                type="text"
                value={loginForm.username}
                onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                className={`w-full p-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder="ej. rmadrid"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Contraseña</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                className={`w-full p-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder="Tu contraseña"
                autoComplete="current-password"
              />
            </div>

            {loginError && <p className="text-sm text-red-600">{loginError}</p>}

            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-semibold">
              Ingresar
            </button>
          </form>

          <p className={`text-xs mt-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Accede con el usuario y clave asignados por administración.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen ${bgColor} font-sans relative transition-colors duration-200`}>
      {/* === MEJORA 6: Gestión de Múltiples Almacenes === */}
      {/* Sidebar */}
      {view !== 'tv' && (
      <aside className={`hidden md:flex flex-col w-64 ${darkMode ? 'bg-slate-950' : 'bg-slate-900'} text-white shadow-xl`}>
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Box size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold">Almacén CUU</h1>
            <p className="text-xs text-slate-400">v2.0 Pro ✨</p>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-slate-800">
          <label className="block text-xs text-slate-400 mb-1">Usuario activo</label>
          <p className="text-sm font-semibold text-white">{activeUser?.username}</p>
          <p className="text-xs text-blue-300 mt-1">Rol: {activeUser?.role}</p>
          <p className="text-[11px] text-emerald-300 mt-1">Panel: {panelTypeLabel}</p>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm py-2"
          >
            Cerrar sesión
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {permissions.canViewDashboard && (
            <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${view === 'dashboard' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
              <LayoutDashboard size={20} /> <span>Dashboard</span>
            </button>
          )}
          {permissions.canViewInventory && (
            <button onClick={() => setView('inventory')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${view === 'inventory' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
              <Package size={20} /> <span>Inventario</span>
            </button>
          )}
          <button onClick={() => setView('orders')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${view === 'orders' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <ClipboardList size={20} /> <span>Pedidos</span>
          </button>
          {permissions.canViewReports && (
            <button onClick={() => setView('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${view === 'reports' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
              <BarChart3 size={20} /> <span>Reportes</span>
            </button>
          )}
          <button onClick={() => setView('tv')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${view === 'tv' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
            <Monitor size={20} /> <span>Pantalla Taller</span>
          </button>
          {permissions.canAssignTechnicians && (
            <button onClick={() => openAssignmentModal()} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${showAssignmentModal ? 'bg-amber-600' : 'hover:bg-slate-800'}`}>
              <User size={20} /> <span>Asignar Técnicos</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          {permissions.canManageData ? (
            <>
              <button onClick={exportToCSV} className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-sm font-medium rounded-xl transition-colors text-white">
                <Download size={16} /> Exportar CSV
              </button>
              <label className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-sm font-medium rounded-xl cursor-pointer transition-colors text-white">
                <Upload size={16} /> Importar CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>
              <button onClick={downloadBackup} className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 text-sm font-medium rounded-xl transition-colors text-white">
                <Download size={16} /> Backup JSON
              </button>
              <label className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-sm font-medium rounded-xl cursor-pointer transition-colors text-white">
                <Upload size={16} /> Restaurar
                <input type="file" accept=".json" className="hidden" onChange={restoreBackup} />
              </label>
            </>
          ) : (
            <p className="text-xs text-slate-400 px-2">Panel operativo: sin import/export</p>
          )}
          <button onClick={() => setDarkMode(!darkMode)} className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-sm font-medium rounded-xl transition-colors">
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            {darkMode ? 'Claro' : 'Oscuro'}
          </button>
        </div>
      </aside>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        {view !== 'tv' && (
        <header className={`md:hidden flex items-center justify-between p-4 ${darkMode ? 'bg-slate-950' : 'bg-slate-900'} text-white`}>
          <div className="flex items-center gap-2">
            <Box size={24} className="text-blue-500" />
            <h1 className="font-bold">Almacén</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>{isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}</button>
        </header>
        )}

        {view !== 'tv' && isMobileMenuOpen && (
          <div className={`md:hidden absolute top-16 left-0 right-0 ${darkMode ? 'bg-slate-950' : 'bg-slate-900'} text-white z-50 border-b border-slate-800`}>
            <nav className="p-4 space-y-2">
              {permissions.canViewDashboard && (
                <button onClick={() => { setView('dashboard'); setIsMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 rounded"><LayoutDashboard /> Dashboard</button>
              )}
              {permissions.canViewInventory && (
                <button onClick={() => { setView('inventory'); setIsMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 rounded"><Package /> Inventario</button>
              )}
              <button onClick={() => { setView('orders'); setIsMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 rounded"><ClipboardList /> Pedidos</button>
              {permissions.canViewReports && (
                <button onClick={() => { setView('reports'); setIsMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 rounded"><BarChart3 /> Reportes</button>
              )}
              <button onClick={() => { setView('tv'); setIsMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 rounded"><Monitor /> Pantalla Taller</button>
              {permissions.canAssignTechnicians && (
                <button onClick={() => { openAssignmentModal(); setIsMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-700 rounded"><User /> Asignar Técnicos</button>
              )}
              <button onClick={handleLogout} className="w-full px-4 py-3 bg-red-600 hover:bg-red-500 rounded text-white text-sm">
                Cerrar sesión
              </button>
            </nav>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {/* PANTALLA TALLER (TV) */}
          {view === 'tv' && (
            <div className={`${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900'} min-h-full rounded-2xl p-6 md:p-8`}>
              <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 p-4 rounded-2xl border ${darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-white/80 border-slate-200'} backdrop-blur`}>
                <div>
                  <h2 className="text-3xl md:text-4xl font-extrabold">Tablero de Pedidos - Taller</h2>
                  <p className={`${darkMode ? 'text-slate-300' : 'text-slate-600'} text-base md:text-lg`}>Centro de control visual · prioridad, tiempo límite y progreso en tiempo real</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`px-4 py-2 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-white'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                    <p className="text-xs uppercase tracking-wide">Hora</p>
                    <p className="text-xl font-bold">{tvClock.toLocaleTimeString('es-MX')}</p>
                  </div>
                  <button onClick={() => setView(permissions.canViewDashboard ? 'dashboard' : 'orders')} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700">
                    Salir TV
                  </button>
                </div>
              </div>

              {(tvSlaSummary.overdue > 0 || tvSlaSummary.warning > 0) && (
                <div className={`mb-4 rounded-xl px-4 py-3 border ${tvSlaSummary.overdue > 0 ? 'bg-red-100 border-red-300 text-red-700' : 'bg-amber-100 border-amber-300 text-amber-700'} animate-pulse`}>
                  <p className="font-bold text-base md:text-lg">
                    ⚠️ Alerta operativa: {tvSlaSummary.overdue} atrasado(s) · {tvSlaSummary.warning} urge hoy
                  </p>
                </div>
              )}

              <div className="sticky top-2 z-10 mb-6">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className={`${darkMode ? 'bg-slate-800/95 border-slate-700' : 'bg-white/95 border-slate-200'} backdrop-blur p-4 rounded-2xl border shadow-sm`}>
                    <p className="text-xs uppercase tracking-wide">Totales</p>
                    <p className="text-3xl font-extrabold">{orders.length}</p>
                  </div>
                  <div className={`${darkMode ? 'bg-slate-800/95 border-slate-700' : 'bg-white/95 border-slate-200'} backdrop-blur p-4 rounded-2xl border shadow-sm`}>
                    <p className="text-xs uppercase tracking-wide">Pendientes</p>
                    <p className="text-3xl font-extrabold text-amber-500">{orderStats.pending}</p>
                  </div>
                  <div className={`${darkMode ? 'bg-slate-800/95 border-slate-700' : 'bg-white/95 border-slate-200'} backdrop-blur p-4 rounded-2xl border shadow-sm`}>
                    <p className="text-xs uppercase tracking-wide">Atrasados</p>
                    <p className="text-3xl font-extrabold text-red-500">{tvSlaSummary.overdue}</p>
                  </div>
                  <div className={`${darkMode ? 'bg-slate-800/95 border-slate-700' : 'bg-white/95 border-slate-200'} backdrop-blur p-4 rounded-2xl border shadow-sm`}>
                    <p className="text-xs uppercase tracking-wide">Urge hoy</p>
                    <p className="text-3xl font-extrabold text-amber-500">{tvSlaSummary.warning}</p>
                  </div>
                  <div className={`${darkMode ? 'bg-slate-800/95 border-slate-700' : 'bg-white/95 border-slate-200'} backdrop-blur p-4 rounded-2xl border shadow-sm`}>
                    <p className="text-xs uppercase tracking-wide">Entregados</p>
                    <p className="text-3xl font-extrabold text-emerald-500">{orderStats.completed}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {tvOrders.map(order => {
                  const process = getProcessInfo(order);
                  const sla = getSlaInfo(order, tvClock);
                  const totalQty = order.items.reduce((sum, i) => sum + i.qty, 0);
                  return (
                    <div key={order.id} className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-2xl border p-6 shadow-md`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-3xl font-extrabold">{order.id}</p>
                          <p className={`${darkMode ? 'text-slate-300' : 'text-slate-600'} text-lg`}>👤 Cliente: {order.client}</p>
                          <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'} text-base`}>🔧 Técnico: {order.assignedTo ? SYSTEM_USERS.find(u => u.username === order.assignedTo)?.name || order.assignedTo : 'Sin asignar'}</p>
                          <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'} text-base`}>
                            📅 Creado: {getOrderCreatedAt(order).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <div className="mt-3 flex items-center gap-2 text-sm">
                            <span className={`px-3 py-1 rounded-full font-semibold ${priorityBadgeClass(order.priority || 'Media')}`}>
                              Prioridad: {order.priority || 'Media'}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-white ${sla.traffic}`}>
                              Tiempo: {sla.label}
                            </span>
                          </div>
                        </div>
                        <span className={`px-4 py-2 rounded-full text-base font-bold ${process.color}`}>{process.label}</span>
                      </div>

                      <div className="mt-4">
                        <div className="flex justify-between text-sm mb-1">
                          <span>Progreso</span>
                          <span className="font-bold">{process.progress}%</span>
                        </div>
                        <div className={`w-full h-3 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                          <div
                            className={`h-3 rounded-full transition-[width] duration-1000 ease-out ${order.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: animateTvProgress ? `${process.progress}%` : '0%' }}
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="text-sm mb-2">Artículos ({totalQty})</p>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {order.items.map((item, idx) => (
                            <p key={`${order.id}-${idx}`} className="text-sm truncate">• {item.id} - {item.desc} x{item.qty}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DASHBOARD */}
          {view === 'dashboard' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-3xl font-bold">Resumen General</h2>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>En tiempo real</p>
                </div>
                <div className="w-full sm:w-64">
                  <label className="block text-sm font-medium mb-1">🔍 Búsqueda Global</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      placeholder="SKU, descripción, técnico..."
                      value={globalSearch}
                      onChange={e => setGlobalSearch(e.target.value)}
                      className={`w-full pl-10 pr-4 py-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm`}
                    />
                  </div>
                  {isGlobalSearching && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Buscando...
                    </p>
                  )}
                  {globalSearch && globalResults.items > 0 && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      📊 {globalResults.items} resultado{globalResults.items !== 1 ? 's' : ''} encontrado{globalResults.items !== 1 ? 's' : ''}
                    </p>
                  )}
                  {globalSearch && !isGlobalSearching && globalResults.items === 0 && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Sin coincidencias en inventario ni pedidos.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'} mb-2`}>Valor Total</p>
                  <h3 className="text-2xl font-bold text-blue-500">{formatMoney(metrics.totalValue)}</h3>
                </div>
                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'} mb-2`}>SKUs</p>
                  <h3 className="text-2xl font-bold text-emerald-500">{metrics.totalItems}</h3>
                </div>
                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'} mb-2`}>Unidades</p>
                  <h3 className="text-2xl font-bold">{metrics.totalUnits}</h3>
                </div>
                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'} mb-2`}>Críticos</p>
                  <h3 className="text-2xl font-bold text-red-500">{metrics.lowStockCount}</h3>
                </div>
                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'} mb-2`}>Reservado</p>
                  <h3 className="text-2xl font-bold text-amber-500">{metrics.totalReserved}</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <h3 className="font-bold mb-4">Órdenes</h3>
                  <p className="text-sm mb-1">Pendientes: <span className="font-bold text-amber-500">{orderStats.pending}</span></p>
                  <p className="text-sm mb-1">Completadas: <span className="font-bold text-emerald-500">{orderStats.completed}</span></p>
                  <p className="text-sm">Items: <span className="font-bold">{orderStats.totalItems}</span></p>
                </div>

                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <h3 className="font-bold mb-4">Por Almacén</h3>
                  <div className="space-y-1 text-sm max-h-[150px] overflow-y-auto">
                    {warehouses.map(wh => (
                      <p key={wh}>{wh}: <span className="font-bold">{metrics.byWarehouse[wh].items}</span> ({formatMoney(metrics.byWarehouse[wh].value)})</p>
                    ))}
                  </div>
                </div>

                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <h3 className="font-bold mb-4">Top 3 Valores</h3>
                  {metrics.topValued.slice(0, 3).map(item => (
                    <p key={item.id} className="text-xs mb-2">
                      <span className="font-bold block truncate">{item.id}</span>
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} truncate block`}>{item.desc}</span>
                      <span className="text-emerald-600 font-bold">{formatMoney(item.totalCost)}</span>
                    </p>
                  ))}
                </div>
              </div>

              {/* === MEJORA 3: Próximas a Agotar === */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <h3 className="font-bold mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-orange-500" /> ⚠️ Próximas a Agotar</h3>
                  {lowStockItems.length === 0 ? (
                    <p className="text-sm text-slate-400">✅ Stock normal en todos</p>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {lowStockItems.map(item => (
                        <div key={item.id} className="pb-2 border-b border-slate-200 dark:border-slate-700 text-xs">
                          <p className="font-bold">{item.id}</p>
                          <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'} truncate`}>{item.desc}</p>
                          <span className={`inline-block px-2 py-0.5 rounded mt-1 ${item.available === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {item.available === 0 ? 'AGOTADO' : `${item.available} disp.`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* === MEJORA 5: Estadísticas por Técnico === */}
                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <h3 className="font-bold mb-4 flex items-center gap-2"><User size={18} className="text-blue-500" /> 👥 Técnicos</h3>
                  {techStats.length === 0 ? (
                    <p className="text-sm text-slate-400">Sin pedidos</p>
                  ) : (
                    <div className="space-y-2">
                      {techStats.map(tech => (
                        <div key={tech.name} className="pb-2 border-b border-slate-200 dark:border-slate-700 text-xs">
                          <p className="font-bold">{tech.name}</p>
                          <div className="flex justify-between mt-1">
                            <span>Órdenes: <span className="font-bold">{tech.total}</span></span>
                            <span>Tasa: <span className="font-bold text-emerald-600">{tech.rate}%</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

          )}

          {/* INVENTARIO */}
          {view === 'inventory' && (
            <div className="space-y-4 max-w-full">
              <div className="flex flex-col sm:flex-row gap-4 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-medium mb-1">Buscar</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="SKU o descripción..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={`w-full pl-10 pr-4 py-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Almacén</label>
                  <select value={filters.warehouse} onChange={e => setFilters({ ...filters, warehouse: e.target.value })} className={`px-4 py-2 rounded-lg border ${inputColor}`}>
                    <option value="ALL">Todos</option>
                    {warehouses.map(w => (<option key={w} value={w}>{w}</option>))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Min Stock</label>
                  <input type="number" min="0" value={filters.minStock} onChange={e => setFilters({ ...filters, minStock: Number.isNaN(parseInt(e.target.value, 10)) ? 0 : parseInt(e.target.value, 10) })} className={`w-20 px-3 py-2 rounded-lg border ${inputColor}`} />
                </div>
              </div>

              {isInventorySearching && (
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Filtrando inventario...
                </p>
              )}

              <InventoryTable
                items={filteredAndSortedInventory}
                darkMode={darkMode}
                cardColor={cardColor}
                inputColor={inputColor}
                sortConfig={sortConfig}
                onSort={handleSort}
                showEditItem={showEditItem}
                editData={editData}
                setEditData={setEditData}
                permissions={permissions}
                formatMoney={formatMoney}
                updateStock={updateStock}
                startEditItem={startEditItem}
                saveEditedItem={saveEditedItem}
                cancelEditItem={cancelEditItem}
                deleteItem={deleteItem}
              />
            </div>
          )}

          {/* PEDIDOS */}
          {view === 'orders' && (
            <div className="space-y-6">
              <div className={`rounded-2xl border p-4 md:p-6 ${darkMode ? 'bg-gradient-to-r from-slate-900 to-slate-800 border-slate-700' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100'} flex justify-between items-center flex-wrap gap-4`}>
                <div>
                  <h2 className="text-3xl font-extrabold">Tablero de Pedidos</h2>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Visual tipo kanban para priorizar, asignar y surtir más rápido.</p>
                </div>
                {permissions.canCreateOrder && (
                  <button onClick={() => setShowOrderModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 shadow-sm">
                    <PlusCircle size={20} /> Nuevo
                  </button>
                )}
              </div>

              {permissions.canAssignTechnicians && (
                <div className={`${cardColor} rounded-2xl border p-4`}>
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
                    <h3 className="font-bold">🧩 Cola sin asignar ({unassignedPendingOrders.length})</h3>
                    <div className="flex items-center gap-2">
                      <select
                        value={bulkTechnicianId}
                        onChange={e => setBulkTechnicianId(e.target.value)}
                        className={`px-3 py-2 rounded-lg border text-sm ${inputColor}`}
                      >
                        <option value="">Técnico para asignación masiva</option>
                        {technicianUsers.map(user => (
                          <option key={user.username} value={user.username}>{user.name} ({user.username})</option>
                        ))}
                      </select>
                      <button
                        onClick={handleBulkAssign}
                        className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm hover:bg-amber-500"
                      >
                        Asignar seleccionadas
                      </button>
                    </div>
                  </div>

                  {unassignedPendingOrders.length === 0 ? (
                    <p className="text-sm text-slate-400">✅ No hay pedidos pendientes sin asignar.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                      {unassignedPendingOrders.map(order => (
                        <label key={`queue-${order.id}`} className={`flex items-center gap-2 p-2 rounded-lg border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                          <input
                            type="checkbox"
                            checked={bulkOrderIds.includes(order.id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setBulkOrderIds(prev => Array.from(new Set([...prev, order.id])));
                              } else {
                                setBulkOrderIds(prev => prev.filter(id => id !== order.id));
                              }
                            }}
                          />
                          <span className="text-sm font-medium">{order.id}</span>
                          <span className="text-xs text-slate-400 truncate">{order.client}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className={`${cardColor} rounded-2xl border p-4`}>
                <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold mb-1">Filtrar por cliente</label>
                    <select
                      value={orderQuickFilters.client}
                      onChange={e => setOrderQuickFilters(prev => ({ ...prev, client: e.target.value }))}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${inputColor}`}
                    >
                      <option value="ALL">Todos los clientes</option>
                      {orderClients.map(client => (
                        <option key={client} value={client}>{client}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold mb-1">Filtrar por técnico</label>
                    <select
                      value={orderQuickFilters.technician}
                      onChange={e => setOrderQuickFilters(prev => ({ ...prev, technician: e.target.value }))}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${inputColor}`}
                    >
                      <option value="ALL">Todos los técnicos</option>
                      <option value="UNASSIGNED">Sin asignar</option>
                      {orderTechnicianOptions.map(username => (
                        <option key={username} value={username}>
                          {(SYSTEM_USERS.find(u => u.username === username)?.name || username)} ({username})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => setOrderQuickFilters({ client: 'ALL', technician: 'ALL' })}
                    className="px-4 py-2 rounded-lg bg-slate-600 text-white text-sm hover:bg-slate-500"
                  >
                    Limpiar filtros
                  </button>
                </div>
                <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Mostrando {filteredOrders.length} pedido(s) según filtros activos.
                </p>

                {activeOrderFilterChips.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeOrderFilterChips.map(chip => (
                      <button
                        key={chip.key}
                        onClick={chip.clear}
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-100 hover:bg-slate-600' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'}`}
                      >
                        {chip.label}
                        <X size={12} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto pb-2">
                {filteredOrders.length === 0 && (
                  <EmptyState
                    title="No hay pedidos con esos filtros"
                    description="Prueba limpiando filtros o creando un nuevo pedido."
                    className={darkMode ? 'mb-4 bg-slate-800/40 border-slate-700 text-slate-200' : 'mb-4'}
                  />
                )}
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 min-w-[1200px] xl:min-w-0">
                  {kanbanColumns.map(column => (
                    <section key={column.id} className={`rounded-2xl border p-3 ${kanbanToneClass(column.tone)}`}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-sm uppercase tracking-wide">{column.title}</h3>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                          {column.orders.length}
                        </span>
                      </div>

                      <div className="space-y-3 max-h-[64vh] overflow-y-auto pr-1">
                        {column.orders.length === 0 ? (
                          <p className="text-xs text-slate-400">Sin pedidos en esta columna.</p>
                        ) : (
                          column.orders.map(order => {
                            const sla = getSlaInfo(order);
                            const timeline = getOrderTimeline(order.id);
                            return (
                              <article key={order.id} className={`${cardColor} rounded-xl shadow-sm border overflow-hidden`}>
                                <div className="p-3 border-b">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="font-extrabold text-sm">{order.id}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityBadgeClass(order.priority || 'Media')}`}>
                                          {order.priority || 'Media'}
                                        </span>
                                        <span className={`w-2.5 h-2.5 rounded-full ${sla.traffic}`} />
                                        <span className={`text-[10px] font-semibold ${sla.text}`}>{sla.label}</span>
                                      </div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${statusBadgeClass(order.status)}`}>
                                      {order.status === 'completed' ? 'Surtido' : 'Pendiente'}
                                    </span>
                                  </div>
                                </div>

                                <div className="p-3 text-xs space-y-2">
                                  <p className="font-semibold">👤 {order.client}</p>
                                  <p>🔧 {order.assignedTo ? SYSTEM_USERS.find(u => u.username === order.assignedTo)?.name || order.assignedTo : 'Sin asignar'}</p>
                                  <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    🕒 {getOrderCreatedAt(order).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                  <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiempo límite: {sla.slaHours}h · {getTimeWindowText(sla.remainingHours)}</p>
                                  {!!order.notes && <p className={`italic ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>📝 {order.notes}</p>}

                                  <div className="space-y-1 max-h-20 overflow-y-auto">
                                    {order.items.map((item, idx) => (
                                      <p key={idx} className="truncate">• {item.id} x{item.qty}</p>
                                    ))}
                                  </div>

                                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                                    <p className="text-[10px] font-bold mb-1">Bitácora</p>
                                    {timeline.length === 0 ? (
                                      <p className="text-[10px] text-slate-400">Sin eventos.</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {timeline.map(event => (
                                          <p key={event.id} className="text-[10px] text-slate-500 dark:text-slate-400">
                                            {new Date(event.timestamp).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' })} · {mapActionLabel(event.action)}
                                          </p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="p-3 border-t space-y-2">
                                  {permissions.canAssignTechnicians && order.status === 'pending' && (
                                    <button
                                      onClick={() => openAssignmentModal(order)}
                                      className="w-full bg-amber-600 text-white py-2 rounded-lg hover:bg-amber-500 flex items-center justify-center gap-2 text-xs"
                                    >
                                      <User size={14} /> {order.assignedTo ? 'Reasignar' : 'Asignar'}
                                    </button>
                                  )}
                                  {order.status === 'pending' ? (
                                    !order.assignedTo ? (
                                      <button disabled className={`w-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-300 text-slate-600'} py-2 rounded-lg cursor-not-allowed text-xs`}>
                                        Asigna primero
                                      </button>
                                    ) : permissions.canCompleteOrder ? (
                                      <button
                                        onClick={() => completeOrder(order.id)}
                                        className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-xs"
                                      >
                                        <CheckCircle size={14} /> Surtir
                                      </button>
                                    ) : (
                                      <button disabled className={`w-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-300 text-slate-600'} py-2 rounded-lg cursor-not-allowed text-xs`}>
                                        Solo administrativos
                                      </button>
                                    )
                                  ) : (
                                    <button disabled className={`w-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-300 text-slate-600'} py-2 rounded-lg cursor-not-allowed text-xs`}>
                                      Entregado
                                    </button>
                                  )}
                                </div>
                              </article>
                            );
                          })
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </div>

              {showOrderModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                  <div className={`${cardColor} rounded-2xl shadow-xl w-full max-w-md border overflow-hidden flex flex-col max-h-[90vh]`}>
                    <div className={`p-4 border-b flex justify-between items-center ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
                      <h3 className="font-bold">Nuevo Pedido</h3>
                      <button onClick={() => setShowOrderModal(false)}><X size={20} /></button>
                    </div>
                    <form onSubmit={handleCreateOrder} className="p-5 flex-1 overflow-y-auto space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Cliente *</label>
                        <select value={newOrderClient} onChange={e => setNewOrderClient(e.target.value)} className={`w-full p-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-blue-500`}>
                          <option value="">Selecciona un cliente</option>
                          {CLIENTS.map(client => (
                            <option key={client} value={client}>{client}</option>
                          ))}
                        </select>
                        {orderErrors.client && <p className="text-xs text-red-600">{orderErrors.client}</p>}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-sm font-medium mb-1">Prioridad *</label>
                          <select value={newOrderPriority} onChange={e => setNewOrderPriority(e.target.value)} className={`w-full p-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-blue-500`}>
                            <option value="Alta">Alta</option>
                            <option value="Media">Media</option>
                            <option value="Baja">Baja</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Tiempo límite</label>
                          <div className={`w-full p-2 rounded-lg border text-sm ${inputColor}`}>
                            {newOrderClient ? `${getSlaHours(newOrderClient)} horas` : 'Selecciona cliente'}
                          </div>
                          <p className={`text-[11px] mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Tiempo máximo para surtir este pedido.
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Notas (opcional)</label>
                        <textarea
                          rows={3}
                          value={newOrderNotes}
                          onChange={e => setNewOrderNotes(e.target.value)}
                          className={`w-full p-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                          placeholder="Observaciones del pedido"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Artículos *</label>
                        {newOrderItems.map((item, idx) => (
                          <div key={idx} className="flex gap-2 mb-2">
                            <input type="text" list="inventory-products" value={item.id} onChange={e => { const items = [...newOrderItems]; items[idx].id = e.target.value; setNewOrderItems(items); }} className={`flex-1 p-2 rounded-lg border ${inputColor} text-sm`} placeholder="SKU o nombre del producto" />
                            <input type="number" min="1" value={item.qty} onChange={e => { const items = [...newOrderItems]; items[idx].qty = e.target.value; setNewOrderItems(items); }} className={`w-16 p-2 rounded-lg border ${inputColor} text-center`} />
                            {newOrderItems.length > 1 && <button type="button" onClick={() => setNewOrderItems(newOrderItems.filter((_, i) => i !== idx))} className="p-2 text-red-600 hover:bg-red-100 rounded"><Trash2 size={16} /></button>}
                          </div>
                        ))}
                        <datalist id="inventory-products">
                          {inventory.map(product => (
                            <option key={`${product.id}-sku`} value={product.id}>{product.desc}</option>
                          ))}
                          {inventory.map(product => (
                            <option key={`${product.id}-desc`} value={product.desc}>{product.id}</option>
                          ))}
                        </datalist>
                        <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Tip: puedes escribir SKU o parte del nombre, por ejemplo: "Expansion valve".
                        </p>
                        <button type="button" onClick={() => setNewOrderItems([...newOrderItems, { id: '', qty: 1 }])} className="text-sm text-blue-600 font-medium mt-2">+ Agregar Artículo</button>
                      </div>
                      <div className="pt-4 border-t">
                        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium">Crear Pedido</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* REPORTES */}
          {view === 'reports' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <h2 className="text-3xl font-bold">Reportes & Estadísticas</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <h3 className="font-bold mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-red-500" /> Stock Crítico</h3>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {inventory.filter(i => i.available < 2).length === 0 ? (
                      <p className="text-sm text-slate-400">✅ Todos en stock</p>
                    ) : (
                      inventory.filter(i => i.available < 2).map(item => (
                        <div key={item.id} className="pb-2 border-b border-slate-200 dark:border-slate-700">
                          <p className="text-sm font-bold">{item.id}</p>
                          <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} truncate mb-1`}>{item.desc}</p>
                          <p className="flex justify-between text-sm">
                            <span>Disponible:</span>
                            <span className="text-red-600 font-bold">{item.available} unidad{item.available !== 1 ? 'es' : ''}</span>
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <h3 className="font-bold mb-4">Historial (Últimas 20 acciones)</h3>
                  <div className="space-y-1 text-xs max-h-[300px] overflow-y-auto">
                    {history.slice(0, 20).map(entry => (
                      <p key={entry.id} className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {new Date(entry.timestamp).toLocaleTimeString()}: {entry.action}
                      </p>
                    ))}
                  </div>
                  {history.length > 0 && (
                    <button onClick={() => setHistory([])} className="mt-4 flex items-center gap-2 text-xs px-3 py-1 bg-slate-600 text-white rounded hover:bg-slate-700">
                      <RotateCcw size={14} /> Limpiar
                    </button>
                  )}
                </div>

                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <h3 className="font-bold mb-4">Valor por Almacén</h3>
                  {warehouses.map(wh => (
                    <div key={wh} className="mb-3">
                      <p className="text-sm font-medium">{wh}</p>
                      <p className="text-lg font-bold text-blue-500">{formatMoney(metrics.byWarehouse[wh].value)}</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{metrics.byWarehouse[wh].items} items</p>
                    </div>
                  ))}
                </div>

                <div className={`${cardColor} p-6 rounded-2xl shadow-sm border`}>
                  <h3 className="font-bold mb-4">Performance de Órdenes</h3>
                  <div className="space-y-2">
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Completadas</p>
                      <p className="text-2xl font-bold text-emerald-500">{orderStats.completed}</p>
                    </div>
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Pendientes</p>
                      <p className="text-2xl font-bold text-amber-500">{orderStats.pending}</p>
                    </div>
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tasa</p>
                      <p className="text-2xl font-bold">{orders.length > 0 ? Math.round((orderStats.completed / orders.length) * 100) : 0}%</p>
                    </div>
                  </div>
                </div>

                {permissions.canViewSensitiveUsers && (
                  <div className={`${cardColor} p-6 rounded-2xl shadow-sm border lg:col-span-2`}>
                    <h3 className="font-bold mb-4">Usuarios técnicos y claves base</h3>
                    <div className="max-h-[220px] overflow-y-auto space-y-2 text-xs">
                      {SYSTEM_USERS.map(user => (
                        <div key={user.username} className="grid grid-cols-3 gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                          <span className="font-bold">{user.username}</span>
                          <span className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{user.role}</span>
                          <span>{user.password}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* === MODAL: Asignación de Técnicos === */}
      {showAssignmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className={`${cardColor} rounded-2xl shadow-xl w-full max-w-md border overflow-hidden flex flex-col max-h-[90vh]`}>
            <div className={`p-4 border-b flex justify-between items-center ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
              <h3 className="font-bold">{assignmentForm.orderId ? 'Asignar / Reasignar Técnico' : 'Asignar Técnico'}</h3>
              <button onClick={() => { setShowAssignmentModal(false); setAssignmentForm({ orderId: '', technicianId: '' }); }}><X size={20} /></button>
            </div>
            <form onSubmit={handleAssignTechnician} className="p-5 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Orden pendiente *</label>
                <select value={assignmentForm.orderId} onChange={e => setAssignmentForm({...assignmentForm, orderId: e.target.value})} className={`w-full p-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-amber-500`}>
                  <option value="">Selecciona una orden</option>
                  {orders.filter(o => o.status === 'pending').map(order => (
                    <option key={order.id} value={order.id}>
                      {order.id} - {order.client}{order.assignedTo ? ` (Actual: ${order.assignedTo})` : ' (Sin asignar)'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Técnico *</label>
                <select value={assignmentForm.technicianId} onChange={e => setAssignmentForm({...assignmentForm, technicianId: e.target.value})} className={`w-full p-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-amber-500`}>
                  <option value="">Selecciona un técnico</option>
                  {SYSTEM_USERS.filter(u => u.role.includes('Tecnico')).map(user => (
                    <option key={user.username} value={user.username}>{user.name} ({user.username})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <button type="submit" className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-500 font-medium">
                  {assignmentForm.orderId ? 'Guardar asignación' : 'Asignar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAssignmentModal(false); setAssignmentForm({ orderId: '', technicianId: '' }); }}
                  className="flex-1 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === MEJORA 7: Toast Notifications === */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
