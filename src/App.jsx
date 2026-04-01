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
  Users,
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
import liumaqLogo from './assets/liumaq-logo.svg';

const ROLE_OPTIONS = [
  { value: 'Administrador', label: 'Administrador (total)' },
  { value: 'Administrador/Tecnico', label: 'Administrador + Técnico' },
  { value: 'Tecnico', label: 'Técnico' },
  { value: 'Servicio', label: 'Servicio' },
  { value: 'Back Office', label: 'Back Office' },
  { value: 'Consulta', label: 'Solo consulta' },
];

const getEmptyUserForm = () => ({
  username: '',
  name: '',
  role: 'Tecnico',
  password: '',
});

const toLocalDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const diffHours = (startValue, endValue) => {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
};

const formatDuration = (hoursValue) => {
  if (hoursValue === null || Number.isNaN(hoursValue)) return 'N/D';
  const totalMinutes = Math.max(0, Math.round(hoursValue * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
};

const csvEscape = (value) => {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
};

export default function App() {
  // === MEJORA 1: localStorage - Persistencia de datos ===
  const [inventory, setInventory] = useLocalStorage('almacen-inventory', INITIAL_DATA);
  const [orders, setOrders] = useLocalStorage('almacen-orders', INITIAL_ORDERS);
  const [returnRequests, setReturnRequests] = useLocalStorage('almacen-return-requests', []);
  const [history, setHistory] = useLocalStorage('almacen-history', []);
  const [darkMode, setDarkMode] = useLocalStorage('almacen-darkmode-v2', true);
  const [systemUsers, setSystemUsers] = useLocalStorage('almacen-system-users', SYSTEM_USERS);

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
  const [editingUsername, setEditingUsername] = useState(null);
  const [userForm, setUserForm] = useState(getEmptyUserForm());
  const [userFormErrors, setUserFormErrors] = useState({});

  // Sesión / Login
  const [currentUser, setCurrentUser] = useLocalStorage('almacen-current-user', '');
  const [isAuthenticated, setIsAuthenticated] = useLocalStorage('almacen-is-authenticated', false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const activeUser = useMemo(
    () => systemUsers.find(u => u.username === currentUser) || null,
    [currentUser, systemUsers]
  );

  const roleValue = (activeUser?.role || '').toLowerCase();
  const permissions = useMemo(() => {
    const isAdmin = roleValue.includes('administrador');
    const isTech = roleValue.includes('tecnico') || roleValue.includes('workshop');
    const isService = roleValue.includes('servicio') || roleValue.includes('back office');
    const currentUserLower = (currentUser || '').toLowerCase();
    const canFulfillByUser = ORDER_FULFILLMENT_USERS.has(currentUserLower);
    const canViewAdminPanel = isAdmin || isService;

    return {
      canViewDashboard: canViewAdminPanel,
      canViewInventory: canViewAdminPanel,
      canEditInventory: isAdmin,
      canManageData: isAdmin,
      canCreateOrder: isAdmin || isTech || isService,
      canCompleteOrder: canFulfillByUser || isAdmin || isTech || isService,
      canViewReturns: isAdmin || isTech,
      canCreateReturn: isAdmin || isTech,
      canAuthorizeReturn: isAdmin,
      canViewReports: isAdmin || isService,
      canViewSensitiveUsers: isAdmin,
      canViewTv: true,
      canAssignTechnicians: isAdmin || currentUser === 'lfuentes',
      canManageUsers: isAdmin,
    };
  }, [roleValue, currentUser]);

  const panelTypeLabel = permissions.canViewDashboard ? 'Administrativo' : 'Operativo';

  useEffect(() => {
    if (!isAuthenticated) return;

    const allowedViews = new Set(['orders', 'tv']);
    if (permissions.canViewDashboard) allowedViews.add('dashboard');
    if (permissions.canViewInventory) allowedViews.add('inventory');
    if (permissions.canViewReturns) allowedViews.add('returns');
    if (permissions.canViewReports) allowedViews.add('reports');
    if (permissions.canManageUsers) allowedViews.add('users');

    if (!allowedViews.has(view)) {
      setView('orders');
      setIsMobileMenuOpen(false);
    }
  }, [
    isAuthenticated,
    view,
    permissions.canViewDashboard,
    permissions.canViewInventory,
    permissions.canViewReturns,
    permissions.canViewReports,
    permissions.canManageUsers,
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
  const [assignmentForm, setAssignmentForm] = useState({ orderId: '', technicianId: '', scheduledDate: toLocalDateKey(new Date()) });
  const [bulkTechnicianId, setBulkTechnicianId] = useState('');
  const [bulkOrderIds, setBulkOrderIds] = useState([]);
  const [orderQuickFilters, setOrderQuickFilters] = useState({ client: 'ALL', technician: 'ALL', date: toLocalDateKey(new Date()) });
  const [dailyReportDate, setDailyReportDate] = useState(toLocalDateKey(new Date()));
  const [returnForm, setReturnForm] = useState({ orderId: '', itemId: '', qty: 1, reason: '', notes: '' });
  const [returnErrors, setReturnErrors] = useState({});

  const technicianUsers = useMemo(
    () => systemUsers.filter(u => (u.role || '').toLowerCase().includes('tecnico')),
    [systemUsers]
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

  const getOrderScheduledDate = useCallback((order) => {
    if (order?.scheduledDate) return order.scheduledDate;
    if (order?.date) return order.date;
    return toLocalDateKey(getOrderCreatedAt(order));
  }, [getOrderCreatedAt]);

  const getOrderCompletedAt = useCallback((order) => {
    if (order?.completedAt) {
      const completed = new Date(order.completedAt);
      if (!Number.isNaN(completed.getTime())) return completed;
    }
    if (order?.status === 'completed') return getOrderCreatedAt(order);
    return null;
  }, [getOrderCreatedAt]);

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

  const completedOrdersForReturns = useMemo(() => {
    const completed = orders.filter(order => order.status === 'completed');
    if (permissions.canAuthorizeReturn) return completed;
    return completed.filter(order => order.assignedTo === currentUser);
  }, [orders, permissions.canAuthorizeReturn, currentUser]);

  const selectedReturnOrder = useMemo(
    () => completedOrdersForReturns.find(order => order.id === returnForm.orderId) || null,
    [completedOrdersForReturns, returnForm.orderId]
  );

  const selectedReturnOrderItem = useMemo(
    () => selectedReturnOrder?.items?.find(item => item.id === returnForm.itemId) || null,
    [selectedReturnOrder, returnForm.itemId]
  );

  const getRequestedReturnQty = useCallback((orderId, itemId) => {
    if (!orderId || !itemId) return 0;
    return returnRequests
      .filter(req => req.orderId === orderId && req.itemId === itemId && req.status !== 'rejected')
      .reduce((sum, req) => sum + (parseInt(req.qty, 10) || 0), 0);
  }, [returnRequests]);

  const remainingReturnQty = useMemo(() => {
    if (!selectedReturnOrderItem || !returnForm.orderId || !returnForm.itemId) return 0;
    const requested = getRequestedReturnQty(returnForm.orderId, returnForm.itemId);
    return Math.max(0, selectedReturnOrderItem.qty - requested);
  }, [selectedReturnOrderItem, returnForm.orderId, returnForm.itemId, getRequestedReturnQty]);

  const visibleReturnRequests = useMemo(() => {
    const source = permissions.canAuthorizeReturn
      ? returnRequests
      : returnRequests.filter(req => req.requestedBy === currentUser);

    return [...source].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [returnRequests, permissions.canAuthorizeReturn, currentUser]);

  const returnStats = useMemo(() => {
    return returnRequests.reduce((acc, req) => {
      acc.total += 1;
      if (req.status === 'pending') acc.pending += 1;
      if (req.status === 'approved') acc.approved += 1;
      if (req.status === 'rejected') acc.rejected += 1;
      return acc;
    }, { total: 0, pending: 0, approved: 0, rejected: 0 });
  }, [returnRequests]);

  const inventoryDescriptionById = useMemo(() => {
    return inventory.reduce((acc, item) => {
      acc[(item.id || '').toLowerCase()] = item.desc;
      return acc;
    }, {});
  }, [inventory]);

  const getOrderItemDescription = useCallback((item) => {
    const directDescription = (item?.desc || '').trim();
    if (directDescription) return directDescription;

    const inventoryDescription = inventoryDescriptionById[(item?.id || '').toLowerCase()];
    return inventoryDescription || 'Sin descripción';
  }, [inventoryDescriptionById]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchClient = orderQuickFilters.client === 'ALL' || order.client === orderQuickFilters.client;
      const matchTechnician = orderQuickFilters.technician === 'ALL'
        || (orderQuickFilters.technician === 'UNASSIGNED' ? !order.assignedTo : order.assignedTo === orderQuickFilters.technician);
      const matchDate = orderQuickFilters.date === 'ALL' || getOrderScheduledDate(order) === orderQuickFilters.date;
      return matchClient && matchTechnician && matchDate;
    });
  }, [orders, orderQuickFilters, getOrderScheduledDate]);

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
        : `${systemUsers.find(u => u.username === orderQuickFilters.technician)?.name || orderQuickFilters.technician} (${orderQuickFilters.technician})`;

      chips.push({
        key: 'technician',
        label: `Técnico: ${techLabel}`,
        clear: () => setOrderQuickFilters(prev => ({ ...prev, technician: 'ALL' })),
      });
    }

    if (orderQuickFilters.date !== 'ALL') {
      chips.push({
        key: 'date',
        label: `Fecha: ${orderQuickFilters.date}`,
        clear: () => setOrderQuickFilters(prev => ({ ...prev, date: 'ALL' })),
      });
    }

    return chips;
  }, [orderQuickFilters, systemUsers]);

  useEffect(() => {
    setBulkOrderIds(prev => prev.filter(id => orders.some(o => o.id === id && o.status === 'pending')));
  }, [orders]);

  useEffect(() => {
    if (!returnForm.orderId) {
      if (returnForm.itemId) {
        setReturnForm(prev => ({ ...prev, itemId: '', qty: 1 }));
      }
      return;
    }

    const targetOrder = completedOrdersForReturns.find(order => order.id === returnForm.orderId);
    if (!targetOrder || !targetOrder.items?.length) {
      if (returnForm.itemId) {
        setReturnForm(prev => ({ ...prev, itemId: '', qty: 1 }));
      }
      return;
    }

    const itemExists = targetOrder.items.some(item => item.id === returnForm.itemId);
    if (!itemExists) {
      setReturnForm(prev => ({ ...prev, itemId: targetOrder.items[0].id, qty: 1 }));
    }
  }, [returnForm.orderId, returnForm.itemId, completedOrdersForReturns]);

  useEffect(() => {
    if (!returnForm.itemId || !remainingReturnQty) return;
    const currentQty = parseInt(returnForm.qty, 10) || 1;
    if (currentQty > remainingReturnQty) {
      setReturnForm(prev => ({ ...prev, qty: remainingReturnQty }));
    }
  }, [returnForm.itemId, returnForm.qty, remainingReturnQty]);

  const handleLogin = (e) => {
    e.preventDefault();
    const username = loginForm.username.trim().toLowerCase();
    const password = loginForm.password;

    const user = systemUsers.find(
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

  const resetUserForm = () => {
    setEditingUsername(null);
    setUserForm(getEmptyUserForm());
    setUserFormErrors({});
  };

  const startEditUser = (user) => {
    if (!permissions.canManageUsers) {
      showToast('⛔ Tu rol no tiene permiso para gestionar usuarios', 'error');
      return;
    }

    setEditingUsername(user.username);
    setUserForm({
      username: user.username,
      name: user.name || '',
      role: user.role || 'Tecnico',
      password: '',
    });
    setUserFormErrors({});
    setView('users');
  };

  const saveUser = (e) => {
    e.preventDefault();

    if (!permissions.canManageUsers) {
      showToast('⛔ Tu rol no tiene permiso para gestionar usuarios', 'error');
      return;
    }

    const errors = {};
    const normalizedUsername = userForm.username.trim().toLowerCase();
    const normalizedName = userForm.name.trim();
    const normalizedRole = userForm.role.trim();

    if (!normalizedUsername) errors.username = 'Usuario requerido';
    if (!normalizedName) errors.name = 'Nombre requerido';
    if (!normalizedRole) errors.role = 'Rol requerido';

    if (!editingUsername && !userForm.password.trim()) {
      errors.password = 'Contraseña requerida para nuevo usuario';
    }

    const usernameInUse = systemUsers.some(
      u => u.username.toLowerCase() === normalizedUsername && u.username !== editingUsername
    );
    if (usernameInUse) errors.username = 'Ese usuario ya existe';

    if (Object.keys(errors).length > 0) {
      setUserFormErrors(errors);
      showToast('❌ Revisa los datos del usuario', 'error');
      return;
    }

    if (editingUsername) {
      setSystemUsers(prev => prev.map(user => (
        user.username === editingUsername
          ? {
            ...user,
            username: normalizedUsername,
            name: normalizedName,
            role: normalizedRole,
            password: userForm.password.trim() ? userForm.password : user.password,
          }
          : user
      )));

      if (currentUser === editingUsername && normalizedUsername !== editingUsername) {
        setCurrentUser(normalizedUsername);
      }

      addHistory('user-updated', { username: normalizedUsername, role: normalizedRole });
      showToast(`✅ Usuario ${normalizedUsername} actualizado`, 'success');
    } else {
      const newUser = {
        username: normalizedUsername,
        name: normalizedName,
        role: normalizedRole,
        password: userForm.password,
      };

      setSystemUsers(prev => [...prev, newUser]);
      addHistory('user-created', { username: normalizedUsername, role: normalizedRole });
      showToast(`✅ Usuario ${normalizedUsername} creado`, 'success');
    }

    resetUserForm();
  };

  const removeUser = (username) => {
    if (!permissions.canManageUsers) {
      showToast('⛔ Tu rol no tiene permiso para gestionar usuarios', 'error');
      return;
    }

    if (username === currentUser) {
      showToast('⚠️ No puedes eliminar tu propio usuario activo', 'error');
      return;
    }

    const targetUser = systemUsers.find(u => u.username === username);
    if (!targetUser) return;

    const adminCount = systemUsers.filter(
      user => (user.role || '').toLowerCase().includes('administrador')
    ).length;

    if ((targetUser.role || '').toLowerCase().includes('administrador') && adminCount <= 1) {
      showToast('⚠️ Debe quedar al menos un administrador en el sistema', 'error');
      return;
    }

    if (!window.confirm(`¿Eliminar al usuario ${username}?`)) return;

    setSystemUsers(prev => prev.filter(user => user.username !== username));
    addHistory('user-deleted', { username });
    showToast(`✅ Usuario ${username} eliminado`, 'success');

    if (editingUsername === username) {
      resetUserForm();
    }
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

  const exportDailyDeliveredReport = () => {
    if (!permissions.canViewReports) {
      showToast('⛔ Tu rol no tiene permiso para exportar reportes', 'error');
      return;
    }

    const completedForDay = orders
      .filter(order => order.status === 'completed')
      .filter(order => {
        const completedAt = getOrderCompletedAt(order);
        if (!completedAt) return false;
        return toLocalDateKey(completedAt) === dailyReportDate;
      });

    if (completedForDay.length === 0) {
      showToast('⚠️ No hay pedidos entregados en la fecha seleccionada', 'error');
      return;
    }

    const headers = [
      'Pedido',
      'Cliente',
      'Tecnico',
      'FechaProgramada',
      'Creado',
      'PrimeraAsignacion',
      'Entregado',
      'TiempoRespuestaHoras',
      'TiempoEntregaHoras',
      'Items',
    ];

    const rows = completedForDay.map(order => {
      const createdAt = getOrderCreatedAt(order);
      const assignedAt = order.firstAssignedAt ? new Date(order.firstAssignedAt) : null;
      const completedAt = getOrderCompletedAt(order);
      const responseHours = assignedAt ? diffHours(createdAt, assignedAt) : null;
      const deliveryHours = completedAt ? diffHours(createdAt, completedAt) : null;
      const itemsSummary = order.items
        .map(item => `${item.id} - ${getOrderItemDescription(item)} x${item.qty}`)
        .join(' | ');

      return [
        order.id,
        order.client || '',
        order.assignedTo || 'Sin asignar',
        getOrderScheduledDate(order),
        createdAt.toLocaleString('es-MX'),
        assignedAt ? assignedAt.toLocaleString('es-MX') : 'N/D',
        completedAt ? completedAt.toLocaleString('es-MX') : 'N/D',
        responseHours === null ? 'N/D' : responseHours.toFixed(2),
        deliveryHours === null ? 'N/D' : deliveryHours.toFixed(2),
        itemsSummary,
      ].map(csvEscape).join(',');
    });

    const csvContent = `data:text/csv;charset=utf-8,${headers.join(',')}\n${rows.join('\n')}`;
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Reporte_Entregados_${dailyReportDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addHistory('report-daily-exported', { date: dailyReportDate, orders: completedForDay.length });
    showToast(`✅ Reporte diario (${completedForDay.length} pedido(s)) exportado`, 'success');
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
      scheduledDate: toLocalDateKey(new Date()),
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
        scheduledDate: getOrderScheduledDate(order),
      });
    } else {
      setAssignmentForm({ orderId: '', technicianId: '', scheduledDate: toLocalDateKey(new Date()) });
    }

    setShowAssignmentModal(true);
  };

  const handleAssignTechnician = e => {
    e.preventDefault();
    if (!permissions.canAssignTechnicians) {
      showToast('⛔ Solo el planeador puede asignar técnicos', 'error');
      return;
    }
    if (!assignmentForm.orderId || !assignmentForm.technicianId || !assignmentForm.scheduledDate) {
      showToast('❌ Selecciona orden, técnico y fecha programada', 'error');
      return;
    }

    const targetOrder = orders.find(o => o.id === assignmentForm.orderId);
    if (!targetOrder) {
      showToast('❌ La orden seleccionada ya no existe', 'error');
      return;
    }

    const previousTechnician = targetOrder.assignedTo || null;
    const previousScheduledDate = getOrderScheduledDate(targetOrder);
    if (previousTechnician === assignmentForm.technicianId) {
      if (previousScheduledDate === assignmentForm.scheduledDate) {
        showToast('ℹ️ La orden ya está asignada a ese técnico y fecha', 'error');
        return;
      }
    }

    const nowIso = new Date().toISOString();

    setOrders(orders.map(o => (
      o.id === assignmentForm.orderId
        ? {
          ...o,
          assignedTo: assignmentForm.technicianId,
          scheduledDate: assignmentForm.scheduledDate,
          firstAssignedAt: o.firstAssignedAt || nowIso,
          lastAssignedAt: nowIso,
        }
        : o
    )));
    setShowAssignmentModal(false);
    setAssignmentForm({ orderId: '', technicianId: '', scheduledDate: toLocalDateKey(new Date()) });

    addHistory(previousTechnician ? 'order-reassigned' : 'order-assigned', {
      orderId: assignmentForm.orderId,
      from: previousTechnician,
      assignedTo: assignmentForm.technicianId,
      scheduledDate: assignmentForm.scheduledDate,
    });

    if (previousScheduledDate !== assignmentForm.scheduledDate) {
      addHistory('order-rescheduled', {
        orderId: assignmentForm.orderId,
        fromDate: previousScheduledDate,
        toDate: assignmentForm.scheduledDate,
      });
    }

    showToast(
      previousTechnician
        ? `✅ Orden ${assignmentForm.orderId} re-asignada a ${assignmentForm.technicianId} (${assignmentForm.scheduledDate})`
        : `✅ Orden ${assignmentForm.orderId} asignada a ${assignmentForm.technicianId} (${assignmentForm.scheduledDate})`,
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
      setOrders(orders.map(o => (o.id === orderId ? { ...o, status: 'completed', completedAt: new Date().toISOString() } : o)));
      addHistory('order-completed', { orderId });
      showToast(`✅ Pedido ${orderId} surtido`, 'success');
    }
  };

  const generateReturnId = useCallback(() => {
    const maxId = returnRequests.reduce((max, req) => {
      const numericPart = parseInt((req.id || '').replace(/\D/g, ''), 10);
      if (Number.isNaN(numericPart)) return max;
      return Math.max(max, numericPart);
    }, 0);

    return `DEV-${String(maxId + 1).padStart(3, '0')}`;
  }, [returnRequests]);

  const handleCreateReturnRequest = e => {
    e.preventDefault();

    if (!permissions.canCreateReturn) {
      showToast('⛔ Tu rol no tiene permiso para solicitar devoluciones', 'error');
      return;
    }

    const errors = {};
    const targetOrder = completedOrdersForReturns.find(order => order.id === returnForm.orderId);
    const qty = parseInt(returnForm.qty, 10);

    if (!returnForm.orderId) errors.orderId = 'Selecciona una orden surtida';
    if (!returnForm.itemId) errors.itemId = 'Selecciona un artículo';
    if (!returnForm.reason.trim() || returnForm.reason.trim().length < 5) {
      errors.reason = 'Describe brevemente el motivo (mínimo 5 caracteres)';
    }
    if (Number.isNaN(qty) || qty <= 0) errors.qty = 'Cantidad inválida';

    if (!targetOrder) {
      errors.orderId = 'La orden seleccionada no está disponible';
    }

    const targetItem = targetOrder?.items?.find(item => item.id === returnForm.itemId);
    if (!targetItem) {
      errors.itemId = 'Artículo no encontrado en la orden';
    }

    if (targetItem && !Number.isNaN(qty)) {
      const requestedQty = getRequestedReturnQty(targetOrder.id, targetItem.id);
      const remainingQty = Math.max(0, targetItem.qty - requestedQty);
      if (remainingQty <= 0) {
        errors.qty = 'Ese artículo ya no tiene piezas disponibles para devolver';
      } else if (qty > remainingQty) {
        errors.qty = `Solo puedes devolver hasta ${remainingQty} pieza(s)`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setReturnErrors(errors);
      showToast('❌ Revisa los datos de la devolución', 'error');
      return;
    }

    const newRequest = {
      id: generateReturnId(),
      orderId: targetOrder.id,
      itemId: targetItem.id,
      itemDesc: getOrderItemDescription(targetItem),
      qty,
      client: targetOrder.client,
      assignedTo: targetOrder.assignedTo,
      reason: returnForm.reason.trim(),
      notes: returnForm.notes.trim(),
      status: 'pending',
      requestedBy: currentUser,
      requestedByName: activeUser?.name || currentUser,
      createdAt: new Date().toISOString(),
      decidedAt: null,
      decidedBy: null,
      decisionNote: '',
    };

    setReturnRequests(prev => [newRequest, ...prev]);
    setReturnForm({ orderId: '', itemId: '', qty: 1, reason: '', notes: '' });
    setReturnErrors({});
    addHistory('return-requested', {
      returnId: newRequest.id,
      orderId: newRequest.orderId,
      itemId: newRequest.itemId,
      qty: newRequest.qty,
    });
    showToast(`✅ Solicitud ${newRequest.id} enviada para autorización`, 'success');
  };

  const handleApproveReturn = requestId => {
    if (!permissions.canAuthorizeReturn) {
      showToast('⛔ Solo administradores pueden autorizar devoluciones', 'error');
      return;
    }

    const request = returnRequests.find(req => req.id === requestId);
    if (!request || request.status !== 'pending') {
      showToast('⚠️ Esta devolución ya fue procesada', 'error');
      return;
    }

    const inventoryItem = inventory.find(item => item.id === request.itemId);
    if (!inventoryItem) {
      showToast('❌ No existe el artículo en inventario para regresar stock', 'error');
      return;
    }

    const decisionNote = window.prompt('Comentario de autorización (opcional):', '') || '';

    setInventory(prev => prev.map(item => {
      if (item.id !== request.itemId) return item;
      const newStock = item.stock + request.qty;
      const newAvailable = Math.max(0, newStock - item.reserved);
      return {
        ...item,
        stock: newStock,
        available: newAvailable,
        totalCost: newAvailable * item.cost,
      };
    }));

    setReturnRequests(prev => prev.map(req => (
      req.id === requestId
        ? {
          ...req,
          status: 'approved',
          decidedAt: new Date().toISOString(),
          decidedBy: currentUser,
          decisionNote: decisionNote.trim(),
        }
        : req
    )));

    addHistory('return-approved', {
      returnId: request.id,
      orderId: request.orderId,
      itemId: request.itemId,
      qty: request.qty,
    });
    showToast(`✅ Devolución ${request.id} autorizada y stock actualizado`, 'success');
  };

  const handleRejectReturn = requestId => {
    if (!permissions.canAuthorizeReturn) {
      showToast('⛔ Solo administradores pueden rechazar devoluciones', 'error');
      return;
    }

    const request = returnRequests.find(req => req.id === requestId);
    if (!request || request.status !== 'pending') {
      showToast('⚠️ Esta devolución ya fue procesada', 'error');
      return;
    }

    const decisionNote = window.prompt('Motivo de rechazo (opcional):', '') || '';

    setReturnRequests(prev => prev.map(req => (
      req.id === requestId
        ? {
          ...req,
          status: 'rejected',
          decidedAt: new Date().toISOString(),
          decidedBy: currentUser,
          decisionNote: decisionNote.trim(),
        }
        : req
    )));

    addHistory('return-rejected', {
      returnId: request.id,
      orderId: request.orderId,
      itemId: request.itemId,
      qty: request.qty,
    });
    showToast(`✅ Devolución ${request.id} rechazada`, 'success');
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
  const dailyCompletedOrders = useMemo(() => {
    return orders
      .filter(order => order.status === 'completed')
      .filter(order => {
        const completedAt = getOrderCompletedAt(order);
        if (!completedAt) return false;
        return toLocalDateKey(completedAt) === dailyReportDate;
      });
  }, [orders, getOrderCompletedAt, dailyReportDate]);

  const dailyReportSummary = useMemo(() => {
    const totals = dailyCompletedOrders.reduce((acc, order) => {
      const createdAt = getOrderCreatedAt(order);
      const completedAt = getOrderCompletedAt(order);
      const responseHours = order.firstAssignedAt ? diffHours(createdAt, order.firstAssignedAt) : null;
      const deliveryHours = completedAt ? diffHours(createdAt, completedAt) : null;

      if (responseHours !== null) {
        acc.responseTotal += responseHours;
        acc.responseCount += 1;
      }

      if (deliveryHours !== null) {
        acc.deliveryTotal += deliveryHours;
        acc.deliveryCount += 1;
      }

      return acc;
    }, { responseTotal: 0, responseCount: 0, deliveryTotal: 0, deliveryCount: 0 });

    return {
      delivered: dailyCompletedOrders.length,
      avgResponseHours: totals.responseCount ? totals.responseTotal / totals.responseCount : null,
      avgDeliveryHours: totals.deliveryCount ? totals.deliveryTotal / totals.deliveryCount : null,
    };
  }, [dailyCompletedOrders, getOrderCreatedAt, getOrderCompletedAt]);

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
      'order-rescheduled': 'Reprogramado',
      'order-bulk-assigned': 'Asignación masiva',
      'order-completed': 'Pedido surtido',
      'report-daily-exported': 'Reporte diario exportado',
      'return-requested': 'Devolución solicitada',
      'return-approved': 'Devolución autorizada',
      'return-rejected': 'Devolución rechazada',
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

  const returnStatusBadgeClass = (status) => {
    if (status === 'approved') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'rejected') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
  };

  const returnStatusLabel = (status) => {
    if (status === 'approved') return 'Autorizada';
    if (status === 'rejected') return 'Rechazada';
    return 'Pendiente';
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
  const bgColor = darkMode ? 'app-bg text-slate-100' : 'bg-slate-50 text-slate-800';
  const cardColor = darkMode ? 'glass-card border-slate-700/60 text-slate-100' : 'bg-white border-slate-200/60';
  const inputColor = darkMode ? 'bg-slate-900/70 border-slate-600/70 text-slate-100 placeholder:text-slate-400' : 'bg-white border-slate-200 text-slate-800';
  const navButtonClass = (active) => {
    if (active) {
      return 'w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-white shadow-[0_10px_30px_-16px_rgba(56,189,248,0.9)] transition-all';
    }

    return darkMode
      ? 'w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-transparent text-slate-200 hover:bg-slate-800/60 hover:border-slate-600 transition-all'
      : 'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-slate-100';
  };

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
    <div className={`flex h-[100dvh] overflow-hidden ${bgColor} font-sans relative transition-colors duration-200`}>
      {/* === MEJORA 6: Gestión de Múltiples Almacenes === */}
      {/* Sidebar */}
      {view !== 'tv' && (
      <aside className={`hidden md:flex flex-col h-full w-64 ${darkMode ? 'sidebar-glass border-r border-slate-700/60' : 'bg-slate-900'} text-white shadow-xl`}>
        <div className="p-5 border-b border-slate-800/70">
          <img
            src={liumaqLogo}
            alt="LIUMAQ"
            className="w-full h-auto max-h-16 object-contain"
          />
        </div>

        <div className="px-4 py-4 border-b border-slate-800/70">
          <label className="block text-xs text-slate-400 mb-1">Usuario activo</label>
          <p className="text-sm font-semibold text-white">{activeUser?.name || activeUser?.username || currentUser}</p>
          <p className="text-xs text-cyan-300 mt-1">{activeUser?.role}</p>
          <p className="text-[11px] text-emerald-300/90 mt-1">Panel: {panelTypeLabel}</p>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-lg bg-red-600/80 hover:bg-red-500 text-white text-sm py-2 border border-red-400/30"
          >
            Cerrar sesión
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {permissions.canViewDashboard && (
            <button onClick={() => setView('dashboard')} className={navButtonClass(view === 'dashboard')}>
              <LayoutDashboard size={20} /> <span>Dashboard</span>
            </button>
          )}
          {permissions.canViewInventory && (
            <button onClick={() => setView('inventory')} className={navButtonClass(view === 'inventory')}>
              <Package size={20} /> <span>Inventario</span>
            </button>
          )}
          <button onClick={() => setView('orders')} className={navButtonClass(view === 'orders')}>
            <ClipboardList size={20} /> <span>Pedidos</span>
          </button>
          {permissions.canViewReturns && (
            <button onClick={() => setView('returns')} className={navButtonClass(view === 'returns')}>
              <RotateCcw size={20} /> <span>Devoluciones</span>
            </button>
          )}
          {permissions.canViewReports && (
            <button onClick={() => setView('reports')} className={navButtonClass(view === 'reports')}>
              <BarChart3 size={20} /> <span>Reportes</span>
            </button>
          )}
          {permissions.canManageUsers && (
            <button onClick={() => setView('users')} className={navButtonClass(view === 'users')}>
              <Users size={20} /> <span>Usuarios</span>
            </button>
          )}
          <button onClick={() => setView('tv')} className={navButtonClass(view === 'tv')}>
            <Monitor size={20} /> <span>Pantalla Taller</span>
          </button>
          {permissions.canAssignTechnicians && (
            <button onClick={() => openAssignmentModal()} className={navButtonClass(showAssignmentModal)}>
              <User size={20} /> <span>Asignar Técnicos</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800/70 space-y-2">
          {permissions.canManageData ? (
            <>
              <button onClick={exportToCSV} className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 text-sm font-medium transition-colors">
                <Download size={16} /> Exportar CSV
              </button>
              <label className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-blue-400/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 text-sm font-medium cursor-pointer transition-colors">
                <Upload size={16} /> Importar CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>
              <button onClick={downloadBackup} className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-violet-400/40 bg-violet-500/10 hover:bg-violet-500/20 text-violet-200 text-sm font-medium transition-colors">
                <Download size={16} /> Backup JSON
              </button>
              <label className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-indigo-400/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-200 text-sm font-medium cursor-pointer transition-colors">
                <Upload size={16} /> Restaurar
                <input type="file" accept=".json" className="hidden" onChange={restoreBackup} />
              </label>
            </>
          ) : (
            <p className="text-xs text-slate-400 px-2">Panel operativo: sin import/export</p>
          )}
          <button onClick={() => setDarkMode(!darkMode)} className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-slate-500/50 bg-slate-700/60 hover:bg-slate-700 text-sm font-medium transition-colors">
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            {darkMode ? 'Claro' : 'Oscuro'}
          </button>
        </div>
      </aside>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        {view !== 'tv' && (
        <header className={`md:hidden flex items-center justify-between p-4 ${darkMode ? 'bg-slate-950' : 'bg-slate-900'} text-white`}>
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={liumaqLogo}
              alt="LIUMAQ"
              className="h-8 w-auto object-contain"
            />
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
              {permissions.canViewReturns && (
                <button onClick={() => { setView('returns'); setIsMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 rounded"><RotateCcw /> Devoluciones</button>
              )}
              {permissions.canViewReports && (
                <button onClick={() => { setView('reports'); setIsMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 rounded"><BarChart3 /> Reportes</button>
              )}
              {permissions.canManageUsers && (
                <button onClick={() => { setView('users'); setIsMobileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 rounded"><Users /> Usuarios</button>
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

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8">
          {/* PANTALLA TALLER (TV) */}
          {view === 'tv' && (
            <div className={`${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900'} min-h-full rounded-2xl p-3 sm:p-4 md:p-8`}>
              <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 p-4 rounded-2xl border ${darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-white/80 border-slate-200'} backdrop-blur`}>
                <div>
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">Tablero de Pedidos - Taller</h2>
                  <p className={`${darkMode ? 'text-slate-300' : 'text-slate-600'} text-sm sm:text-base md:text-lg`}>Centro de control visual · prioridad, tiempo límite y progreso en tiempo real</p>
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
                  <p className="font-bold text-sm sm:text-base md:text-lg">
                    ⚠️ Alerta operativa: {tvSlaSummary.overdue} atrasado(s) · {tvSlaSummary.warning} urge hoy
                  </p>
                </div>
              )}

              <div className="sticky top-2 z-10 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
                          <p className="text-2xl sm:text-3xl font-extrabold break-words">{order.id}</p>
                          <p className={`${darkMode ? 'text-slate-300' : 'text-slate-600'} text-base sm:text-lg break-words`}>👤 Cliente: {order.client}</p>
                          <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'} text-sm sm:text-base break-words`}>🔧 Técnico: {order.assignedTo ? systemUsers.find(u => u.username === order.assignedTo)?.name || order.assignedTo : 'Sin asignar'}</p>
                          <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'} text-sm sm:text-base`}>
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
                                <p key={`${order.id}-${idx}`} className="text-sm truncate">• {item.id} - {getOrderItemDescription(item)} x{item.qty}</p>
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
              <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 rounded-2xl border ${darkMode ? 'glass-card border-slate-700/60' : 'bg-white border-slate-200'}`}>
                <div>
                  <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Resumen General</h2>
                  <p className={`text-sm ${darkMode ? 'text-cyan-200/80' : 'text-slate-500'}`}>En tiempo real</p>
                </div>
                <div className="w-full sm:w-64">
                  <label className="block text-sm font-medium mb-1">🔎 Búsqueda Global</label>
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
                <div className={`${cardColor} metric-card p-5 rounded-2xl shadow-sm border`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'} mb-2`}>Valor Total</p>
                      <h3 className="text-3xl font-extrabold text-cyan-300">{formatMoney(metrics.totalValue)}</h3>
                    </div>
                    <BarChart3 size={20} className="text-cyan-300" />
                  </div>
                </div>

                <div className={`${cardColor} metric-card p-5 rounded-2xl shadow-sm border`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'} mb-2`}>SKUs</p>
                      <h3 className="text-3xl font-extrabold text-emerald-300">{metrics.totalItems}</h3>
                    </div>
                    <Package size={20} className="text-emerald-300" />
                  </div>
                </div>

                <div className={`${cardColor} metric-card p-5 rounded-2xl shadow-sm border`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'} mb-2`}>Unidades</p>
                      <h3 className="text-3xl font-extrabold text-slate-100">{metrics.totalUnits}</h3>
                    </div>
                    <Box size={20} className="text-slate-300" />
                  </div>
                </div>

                <div className={`${cardColor} metric-card p-5 rounded-2xl shadow-sm border`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'} mb-2`}>Críticos</p>
                      <h3 className="text-3xl font-extrabold text-rose-300">{metrics.lowStockCount}</h3>
                    </div>
                    <AlertTriangle size={20} className="text-rose-300" />
                  </div>
                </div>

                <div className={`${cardColor} metric-card p-5 rounded-2xl shadow-sm border`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'} mb-2`}>Reservado</p>
                      <h3 className="text-3xl font-extrabold text-amber-300">{metrics.totalReserved}</h3>
                    </div>
                    <ClipboardList size={20} className="text-amber-300" />
                  </div>
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
                  <h2 className="text-2xl md:text-3xl font-extrabold">Tablero de Pedidos</h2>
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
                    <label className="block text-xs font-semibold mb-1">Fecha programada</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={orderQuickFilters.date === 'ALL' ? '' : orderQuickFilters.date}
                        onChange={e => setOrderQuickFilters(prev => ({ ...prev, date: e.target.value }))}
                        className={`w-full px-3 py-2.5 rounded-xl border text-sm shadow-sm ${inputColor} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </div>
                    <div className={`mt-2 inline-flex rounded-xl border p-1 ${darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-100 border-slate-300'}`}>
                      <button
                        onClick={() => setOrderQuickFilters(prev => ({ ...prev, date: toLocalDateKey(new Date()) }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${orderQuickFilters.date !== 'ALL' ? 'bg-blue-600 text-white shadow-sm' : darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-white'}`}
                      >
                        Hoy
                      </button>
                      <button
                        onClick={() => setOrderQuickFilters(prev => ({ ...prev, date: 'ALL' }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${orderQuickFilters.date === 'ALL' ? 'bg-blue-600 text-white shadow-sm' : darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-white'}`}
                      >
                        Todas las fechas
                      </button>
                    </div>
                  </div>

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
                          {(systemUsers.find(u => u.username === username)?.name || username)} ({username})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => setOrderQuickFilters({ client: 'ALL', technician: 'ALL', date: toLocalDateKey(new Date()) })}
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

              <div className="overflow-x-auto pb-2 -mx-1 px-1 md:mx-0 md:px-0">
                {filteredOrders.length === 0 && (
                  <EmptyState
                    title="No hay pedidos con esos filtros"
                    description="Prueba limpiando filtros o creando un nuevo pedido."
                    className={darkMode ? 'mb-4 bg-slate-800/40 border-slate-700 text-slate-200' : 'mb-4'}
                  />
                )}

                {filteredOrders.length > 0 && (
                  <div className="md:hidden space-y-2">
                    {filteredOrders.map(order => {
                      const sla = getSlaInfo(order);
                      const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);

                      return (
                        <article key={`mobile-${order.id}`} className={`${cardColor} rounded-lg border shadow-sm p-3 space-y-2`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-extrabold text-sm">{order.id}</p>
                              <p className="text-[11px] text-slate-400">{order.status === 'completed' ? 'Completado' : 'Pendiente'}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${statusBadgeClass(order.status)}`}>
                              {sla.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityBadgeClass(order.priority || 'Media')}`}>
                              {order.priority || 'Media'}
                            </span>
                            <span className={`text-[10px] font-semibold ${sla.text}`}>
                              {getTimeWindowText(sla.remainingHours)}
                            </span>
                          </div>

                          <p className="text-xs font-semibold break-words">👤 {order.client}</p>
                          <p className="text-[11px] break-words">
                            🔧 {order.assignedTo ? systemUsers.find(u => u.username === order.assignedTo)?.name || order.assignedTo : 'Sin asignar'}
                          </p>
                          <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            📅 Programado: {getOrderScheduledDate(order)}
                          </p>
                          <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            📦 {order.items.length} artículo(s) · {totalQty} pieza(s)
                          </p>

                          <div className="space-y-1 max-h-16 overflow-y-auto">
                            {order.items.map((item, idx) => (
                              <p key={`mobile-item-${order.id}-${idx}`} className="text-[11px] truncate">
                                • {item.id} - {getOrderItemDescription(item)} x{item.qty}
                              </p>
                            ))}
                          </div>

                          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                            {permissions.canAssignTechnicians && order.status === 'pending' && (
                              <button
                                onClick={() => openAssignmentModal(order)}
                                className="w-full bg-amber-600 text-white py-1.5 rounded-lg hover:bg-amber-500 flex items-center justify-center gap-2 text-[11px]"
                              >
                                <User size={12} /> {order.assignedTo ? 'Reasignar' : 'Asignar'}
                              </button>
                            )}

                            {order.status === 'pending' ? (
                              !order.assignedTo ? (
                                <button disabled className={`w-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-300 text-slate-600'} py-1.5 rounded-lg cursor-not-allowed text-[11px]`}>
                                  Asigna primero
                                </button>
                              ) : permissions.canCompleteOrder ? (
                                <button
                                  onClick={() => completeOrder(order.id)}
                                  className="w-full bg-blue-600 text-white py-1.5 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-[11px]"
                                >
                                  <CheckCircle size={12} /> Surtir
                                </button>
                              ) : (
                                <button disabled className={`w-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-300 text-slate-600'} py-1.5 rounded-lg cursor-not-allowed text-[11px]`}>
                                  Solo administrativos
                                </button>
                              )
                            ) : (
                              <button disabled className={`w-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-300 text-slate-600'} py-1.5 rounded-lg cursor-not-allowed text-[11px]`}>
                                Entregado
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-5 gap-4">
                  {kanbanColumns.map(column => (
                    <section key={column.id} className={`rounded-2xl border p-2 sm:p-3 ${kanbanToneClass(column.tone)}`}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-xs sm:text-sm uppercase tracking-wide">{column.title}</h3>
                        <span className="text-[11px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                          {column.orders.length}
                        </span>
                      </div>

                      <div className="space-y-2 sm:space-y-3 max-h-[52vh] sm:max-h-[64vh] overflow-y-auto pr-1">
                        {column.orders.length === 0 ? (
                          <p className="text-[11px] sm:text-xs text-slate-400">Sin pedidos en esta columna.</p>
                        ) : (
                          column.orders.map(order => {
                            const sla = getSlaInfo(order);
                            const timeline = getOrderTimeline(order.id);
                            return (
                              <article key={order.id} className={`${cardColor} rounded-lg sm:rounded-xl shadow-sm border overflow-hidden`}>
                                <div className="p-2 sm:p-3 border-b">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="font-extrabold text-xs sm:text-sm">{order.id}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityBadgeClass(order.priority || 'Media')}`}>
                                          {order.priority || 'Media'}
                                        </span>
                                        <span className={`w-2.5 h-2.5 rounded-full ${sla.traffic}`} />
                                        <span className={`text-[9px] sm:text-[10px] font-semibold ${sla.text}`}>{sla.label}</span>
                                      </div>
                                    </div>
                                    <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-1 rounded-full border ${statusBadgeClass(order.status)}`}>
                                      {order.status === 'completed' ? 'Surtido' : 'Pendiente'}
                                    </span>
                                  </div>
                                </div>

                                <div className="p-2 sm:p-3 text-[11px] sm:text-xs space-y-1.5 sm:space-y-2">
                                  <p className="font-semibold">👤 {order.client}</p>
                                  <p>🔧 {order.assignedTo ? systemUsers.find(u => u.username === order.assignedTo)?.name || order.assignedTo : 'Sin asignar'}</p>
                                  <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>📅 Programado: {getOrderScheduledDate(order)}</p>
                                  <p className={`hidden sm:block ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    🕒 {getOrderCreatedAt(order).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                  <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiempo límite: {sla.slaHours}h · {getTimeWindowText(sla.remainingHours)}</p>
                                  {!!order.notes && <p className={`italic break-words ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>📝 {order.notes}</p>}

                                  <div className="space-y-1 max-h-16 sm:max-h-20 overflow-y-auto">
                                    {order.items.map((item, idx) => (
                                      <p key={idx} className="truncate">• {item.id} - {getOrderItemDescription(item)} x{item.qty}</p>
                                    ))}
                                  </div>

                                  <div className="hidden sm:block pt-2 border-t border-slate-200 dark:border-slate-700">
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

                                <div className="p-2 sm:p-3 border-t space-y-1.5 sm:space-y-2">
                                  {permissions.canAssignTechnicians && order.status === 'pending' && (
                                    <button
                                      onClick={() => openAssignmentModal(order)}
                                      className="w-full bg-amber-600 text-white py-1.5 sm:py-2 rounded-lg hover:bg-amber-500 flex items-center justify-center gap-2 text-[11px] sm:text-xs"
                                    >
                                      <User size={12} className="sm:hidden" />
                                      <User size={14} className="hidden sm:inline" />
                                      {order.assignedTo ? 'Reasignar' : 'Asignar'}
                                    </button>
                                  )}
                                  {order.status === 'pending' ? (
                                    !order.assignedTo ? (
                                      <button disabled className={`w-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-300 text-slate-600'} py-1.5 sm:py-2 rounded-lg cursor-not-allowed text-[11px] sm:text-xs`}>
                                        Asigna primero
                                      </button>
                                    ) : permissions.canCompleteOrder ? (
                                      <button
                                        onClick={() => completeOrder(order.id)}
                                        className="w-full bg-blue-600 text-white py-1.5 sm:py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-[11px] sm:text-xs"
                                      >
                                        <CheckCircle size={12} className="sm:hidden" />
                                        <CheckCircle size={14} className="hidden sm:inline" />
                                        Surtir
                                      </button>
                                    ) : (
                                      <button disabled className={`w-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-300 text-slate-600'} py-1.5 sm:py-2 rounded-lg cursor-not-allowed text-[11px] sm:text-xs`}>
                                        Solo administrativos
                                      </button>
                                    )
                                  ) : (
                                    <button disabled className={`w-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-300 text-slate-600'} py-1.5 sm:py-2 rounded-lg cursor-not-allowed text-[11px] sm:text-xs`}>
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

          {/* DEVOLUCIONES */}
          {view === 'returns' && permissions.canViewReturns && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className={`rounded-2xl border p-4 md:p-6 ${darkMode ? 'bg-gradient-to-r from-slate-900 to-slate-800 border-slate-700' : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100'} flex flex-col md:flex-row md:items-center md:justify-between gap-4`}>
                <div>
                  <h2 className="text-2xl md:text-3xl font-extrabold">Zona de Devoluciones</h2>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    Los técnicos solicitan devoluciones y administración autoriza o rechaza.
                  </p>
                </div>
                <div className={`text-xs rounded-lg px-3 py-2 ${darkMode ? 'bg-slate-800 border border-slate-700 text-slate-300' : 'bg-white border border-slate-200 text-slate-600'}`}>
                  Pendientes por revisar: <span className="font-bold">{returnStats.pending}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className={`${cardColor} rounded-xl border p-4`}>
                  <p className="text-xs uppercase tracking-wide">Total</p>
                  <p className="text-2xl font-extrabold">{returnStats.total}</p>
                </div>
                <div className={`${cardColor} rounded-xl border p-4`}>
                  <p className="text-xs uppercase tracking-wide">Pendientes</p>
                  <p className="text-2xl font-extrabold text-amber-500">{returnStats.pending}</p>
                </div>
                <div className={`${cardColor} rounded-xl border p-4`}>
                  <p className="text-xs uppercase tracking-wide">Autorizadas</p>
                  <p className="text-2xl font-extrabold text-emerald-500">{returnStats.approved}</p>
                </div>
                <div className={`${cardColor} rounded-xl border p-4`}>
                  <p className="text-xs uppercase tracking-wide">Rechazadas</p>
                  <p className="text-2xl font-extrabold text-red-500">{returnStats.rejected}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {permissions.canCreateReturn && (
                  <section className={`${cardColor} rounded-2xl border p-5`}>
                    <h3 className="font-bold text-lg mb-4">Solicitar devolución</h3>

                    {completedOrdersForReturns.length === 0 ? (
                      <EmptyState
                        title="No hay órdenes surtidas para devolver"
                        description="Necesitas una orden completada para iniciar una solicitud."
                        className={darkMode ? 'bg-slate-800/40 border-slate-700 text-slate-200' : ''}
                      />
                    ) : (
                      <form onSubmit={handleCreateReturnRequest} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Orden surtida *</label>
                          <select
                            value={returnForm.orderId}
                            onChange={e => {
                              setReturnForm(prev => ({ ...prev, orderId: e.target.value, itemId: '', qty: 1 }));
                              setReturnErrors(prev => ({ ...prev, orderId: '', itemId: '', qty: '' }));
                            }}
                            className={`w-full p-2 rounded-lg border ${inputColor}`}
                          >
                            <option value="">Selecciona una orden</option>
                            {completedOrdersForReturns.map(order => (
                              <option key={`return-order-${order.id}`} value={order.id}>
                                {order.id} · {order.client} · {order.assignedTo || 'Sin técnico'}
                              </option>
                            ))}
                          </select>
                          {returnErrors.orderId && <p className="text-xs text-red-500 mt-1">{returnErrors.orderId}</p>}
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Artículo *</label>
                          <select
                            value={returnForm.itemId}
                            onChange={e => {
                              setReturnForm(prev => ({ ...prev, itemId: e.target.value, qty: 1 }));
                              setReturnErrors(prev => ({ ...prev, itemId: '', qty: '' }));
                            }}
                            className={`w-full p-2 rounded-lg border ${inputColor}`}
                            disabled={!selectedReturnOrder}
                          >
                            <option value="">Selecciona un artículo</option>
                            {selectedReturnOrder?.items?.map(item => {
                              const requestedQty = getRequestedReturnQty(selectedReturnOrder.id, item.id);
                              const remainingQtyByItem = Math.max(0, item.qty - requestedQty);
                              return (
                                <option key={`return-item-${selectedReturnOrder.id}-${item.id}`} value={item.id} disabled={remainingQtyByItem <= 0}>
                                  {item.id} - {getOrderItemDescription(item)} (máx: {remainingQtyByItem})
                                </option>
                              );
                            })}
                          </select>
                          {returnErrors.itemId && <p className="text-xs text-red-500 mt-1">{returnErrors.itemId}</p>}
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Cantidad a devolver *</label>
                          <input
                            type="number"
                            min="1"
                            max={Math.max(1, remainingReturnQty || 1)}
                            value={returnForm.qty}
                            onChange={e => {
                              const parsed = parseInt(e.target.value, 10);
                              setReturnForm(prev => ({ ...prev, qty: Number.isNaN(parsed) ? 1 : parsed }));
                              setReturnErrors(prev => ({ ...prev, qty: '' }));
                            }}
                            className={`w-full p-2 rounded-lg border ${inputColor}`}
                            disabled={!selectedReturnOrderItem || remainingReturnQty <= 0}
                          />
                          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Disponible para devolver: <span className="font-semibold">{remainingReturnQty}</span>
                          </p>
                          {returnErrors.qty && <p className="text-xs text-red-500 mt-1">{returnErrors.qty}</p>}
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Motivo *</label>
                          <textarea
                            rows={2}
                            value={returnForm.reason}
                            onChange={e => {
                              setReturnForm(prev => ({ ...prev, reason: e.target.value }));
                              setReturnErrors(prev => ({ ...prev, reason: '' }));
                            }}
                            className={`w-full p-2 rounded-lg border ${inputColor}`}
                            placeholder="Ej. Pieza dañada o no requerida en campo"
                          />
                          {returnErrors.reason && <p className="text-xs text-red-500 mt-1">{returnErrors.reason}</p>}
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Notas adicionales (opcional)</label>
                          <textarea
                            rows={2}
                            value={returnForm.notes}
                            onChange={e => setReturnForm(prev => ({ ...prev, notes: e.target.value }))}
                            className={`w-full p-2 rounded-lg border ${inputColor}`}
                            placeholder="Núm. serie, condiciones, evidencia, etc."
                          />
                        </div>

                        <button type="submit" className="w-full bg-amber-600 text-white py-2 rounded-lg hover:bg-amber-500 font-medium">
                          Enviar solicitud
                        </button>
                      </form>
                    )}
                  </section>
                )}

                <section className={`${cardColor} rounded-2xl border p-5`}>
                  <h3 className="font-bold text-lg mb-4">{permissions.canAuthorizeReturn ? 'Pendientes de autorización' : 'Mis devoluciones pendientes'}</h3>
                  {visibleReturnRequests.filter(req => req.status === 'pending').length === 0 ? (
                    <p className="text-sm text-slate-400">No hay devoluciones pendientes por revisar.</p>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {visibleReturnRequests
                        .filter(req => req.status === 'pending')
                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                        .map(req => (
                          <article key={`pending-return-${req.id}`} className={`rounded-xl border p-3 ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-bold text-sm">{req.id}</p>
                                <p className="text-xs">Orden: {req.orderId}</p>
                                <p className="text-xs">{req.itemId} · {req.qty} pza(s)</p>
                                <p className="text-xs text-slate-400">Solicita: {req.requestedByName || req.requestedBy}</p>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${returnStatusBadgeClass(req.status)}`}>
                                {returnStatusLabel(req.status)}
                              </span>
                            </div>
                          </article>
                        ))}
                    </div>
                  )}
                </section>
              </div>

              <section className={`${cardColor} rounded-2xl border p-5`}>
                <h3 className="font-bold text-lg mb-4">Historial de devoluciones</h3>

                {visibleReturnRequests.length === 0 ? (
                  <EmptyState
                    title="Sin devoluciones registradas"
                    description="Cuando se creen solicitudes de devolución aparecerán aquí."
                    className={darkMode ? 'bg-slate-800/40 border-slate-700 text-slate-200' : ''}
                  />
                ) : (
                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                    {visibleReturnRequests.map(req => (
                      <article key={req.id} className={`rounded-xl border p-4 ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div>
                            <p className="font-extrabold text-sm">{req.id}</p>
                            <p className="text-xs text-slate-400">
                              {new Date(req.createdAt).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full border ${returnStatusBadgeClass(req.status)}`}>
                            {returnStatusLabel(req.status)}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          <p><span className="font-semibold">Orden:</span> {req.orderId}</p>
                          <p><span className="font-semibold">Cliente:</span> {req.client || 'N/A'}</p>
                          <p><span className="font-semibold">Artículo:</span> {req.itemId} - {req.itemDesc || 'Sin descripción'}</p>
                          <p><span className="font-semibold">Cantidad:</span> {req.qty} pza(s)</p>
                          <p><span className="font-semibold">Solicitó:</span> {req.requestedByName || req.requestedBy}</p>
                          <p><span className="font-semibold">Técnico:</span> {req.assignedTo || 'Sin asignar'}</p>
                        </div>

                        <div className="mt-2 text-xs">
                          <p><span className="font-semibold">Motivo:</span> {req.reason}</p>
                          {req.notes && <p className="mt-1"><span className="font-semibold">Notas:</span> {req.notes}</p>}
                          {req.decidedBy && (
                            <p className="mt-1 text-slate-400">
                              Resolvió: {req.decidedBy} · {req.decidedAt ? new Date(req.decidedAt).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'}
                            </p>
                          )}
                          {req.decisionNote && <p className="mt-1 italic text-slate-400">Comentario admin: {req.decisionNote}</p>}
                        </div>

                        {permissions.canAuthorizeReturn && req.status === 'pending' && (
                          <div className="mt-3 flex flex-col sm:flex-row gap-2">
                            <button
                              onClick={() => handleApproveReturn(req.id)}
                              className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                            >
                              Autorizar devolución
                            </button>
                            <button
                              onClick={() => handleRejectReturn(req.id)}
                              className="flex-1 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                            >
                              Rechazar
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* USUARIOS */}
          {view === 'users' && permissions.canManageUsers && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className={`${cardColor} p-5 rounded-2xl border shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3`}>
                <div>
                  <h2 className="text-2xl md:text-3xl font-extrabold">Gestión de Usuarios</h2>
                  <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                    Crea usuarios y controla permisos a través del rol.
                  </p>
                </div>
                <div className={`text-xs rounded-lg px-3 py-2 ${darkMode ? 'bg-slate-800 border border-slate-700 text-slate-300' : 'bg-slate-100 border border-slate-200 text-slate-600'}`}>
                  Total usuarios: <span className="font-bold">{systemUsers.length}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <section className={`${cardColor} p-6 rounded-2xl border shadow-sm`}>
                  <h3 className="font-bold text-lg mb-4">{editingUsername ? `Editar: ${editingUsername}` : 'Crear usuario nuevo'}</h3>
                  <form onSubmit={saveUser} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Usuario *</label>
                      <input
                        type="text"
                        value={userForm.username}
                        disabled={!!editingUsername}
                        onChange={e => setUserForm(prev => ({ ...prev, username: e.target.value.trim().toLowerCase() }))}
                        className={`w-full p-2 rounded-lg border ${inputColor} ${editingUsername ? 'opacity-70 cursor-not-allowed' : ''}`}
                        placeholder="ej. jlopez"
                      />
                      {userFormErrors.username && <p className="text-xs text-red-500 mt-1">{userFormErrors.username}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Nombre *</label>
                      <input
                        type="text"
                        value={userForm.name}
                        onChange={e => setUserForm(prev => ({ ...prev, name: e.target.value }))}
                        className={`w-full p-2 rounded-lg border ${inputColor}`}
                        placeholder="Nombre completo"
                      />
                      {userFormErrors.name && <p className="text-xs text-red-500 mt-1">{userFormErrors.name}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Rol *</label>
                      <select
                        value={userForm.role}
                        onChange={e => setUserForm(prev => ({ ...prev, role: e.target.value }))}
                        className={`w-full p-2 rounded-lg border ${inputColor}`}
                      >
                        {ROLE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      {userFormErrors.role && <p className="text-xs text-red-500 mt-1">{userFormErrors.role}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {editingUsername ? 'Nueva contraseña (opcional)' : 'Contraseña inicial *'}
                      </label>
                      <input
                        type="password"
                        value={userForm.password}
                        onChange={e => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                        className={`w-full p-2 rounded-lg border ${inputColor}`}
                        placeholder={editingUsername ? 'Deja vacío para conservar la actual' : 'Contraseña segura'}
                      />
                      {userFormErrors.password && <p className="text-xs text-red-500 mt-1">{userFormErrors.password}</p>}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                      >
                        {editingUsername ? 'Guardar cambios' : 'Crear usuario'}
                      </button>
                      <button
                        type="button"
                        onClick={resetUserForm}
                        className="flex-1 px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white"
                      >
                        Limpiar
                      </button>
                    </div>
                  </form>
                </section>

                <section className={`${cardColor} p-6 rounded-2xl border shadow-sm`}>
                  <h3 className="font-bold text-lg mb-4">Usuarios registrados</h3>
                  <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                    {[...systemUsers]
                      .sort((a, b) => a.username.localeCompare(b.username))
                      .map(user => (
                        <article key={user.username} className={`rounded-xl border p-3 ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-sm">{user.name}</p>
                              <p className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>@{user.username}</p>
                              <p className={`text-xs mt-1 ${darkMode ? 'text-cyan-300' : 'text-blue-600'}`}>Rol: {user.role}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {user.username === currentUser && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">Tú</span>
                              )}
                              <div className="flex gap-1">
                                <button
                                  onClick={() => startEditUser(user)}
                                  className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => removeUser(user.username)}
                                  className="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-500 text-white"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* REPORTES */}
          {view === 'reports' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-bold">Reportes & Estadísticas</h2>

              <div className={`${cardColor} p-5 rounded-2xl shadow-sm border space-y-4`}>
                <div className="flex flex-col md:flex-row md:items-end gap-3">
                  <div className="w-full md:w-auto">
                    <label className="block text-sm font-medium mb-1">Reporte diario de entregados</label>
                    <input
                      type="date"
                      value={dailyReportDate}
                      onChange={e => setDailyReportDate(e.target.value)}
                      className={`w-full md:w-52 p-2 rounded-lg border ${inputColor}`}
                    />
                  </div>
                  <button
                    onClick={exportDailyDeliveredReport}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm font-semibold"
                  >
                    Exportar CSV (Excel)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className={`rounded-xl border p-3 ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
                    <p className="text-xs uppercase tracking-wide">Entregados ({dailyReportDate})</p>
                    <p className="text-2xl font-extrabold text-emerald-500">{dailyReportSummary.delivered}</p>
                  </div>
                  <div className={`rounded-xl border p-3 ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
                    <p className="text-xs uppercase tracking-wide">Promedio reacción</p>
                    <p className="text-xl font-bold">{formatDuration(dailyReportSummary.avgResponseHours)}</p>
                  </div>
                  <div className={`rounded-xl border p-3 ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
                    <p className="text-xs uppercase tracking-wide">Promedio entrega</p>
                    <p className="text-xl font-bold">{formatDuration(dailyReportSummary.avgDeliveryHours)}</p>
                  </div>
                </div>

                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Incluye tiempos de respuesta (creación → primera asignación) y entrega (creación → surtido).
                </p>
              </div>

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
                    <h3 className="font-bold mb-2">Control de acceso</h3>
                    <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      Gestiona usuarios desde la vista <span className="font-semibold">Usuarios</span> para crear cuentas,
                      cambiar roles (permisos) y actualizar contraseñas.
                    </p>
                    <button
                      onClick={() => setView('users')}
                      className="mt-3 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm"
                    >
                      Ir a gestión de usuarios
                    </button>
                    <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Usuarios registrados: <span className="font-semibold">{systemUsers.length}</span>
                    </p>
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
              <button onClick={() => { setShowAssignmentModal(false); setAssignmentForm({ orderId: '', technicianId: '', scheduledDate: toLocalDateKey(new Date()) }); }}><X size={20} /></button>
            </div>
            <form onSubmit={handleAssignTechnician} className="p-5 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Orden pendiente *</label>
                <select
                  value={assignmentForm.orderId}
                  onChange={e => {
                    const nextOrderId = e.target.value;
                    const nextOrder = orders.find(order => order.id === nextOrderId);
                    setAssignmentForm({
                      ...assignmentForm,
                      orderId: nextOrderId,
                      scheduledDate: nextOrder ? getOrderScheduledDate(nextOrder) : assignmentForm.scheduledDate,
                    });
                  }}
                  className={`w-full p-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-amber-500`}
                >
                  <option value="">Selecciona una orden</option>
                  {orders.filter(o => o.status === 'pending').map(order => (
                    <option key={order.id} value={order.id}>
                      {order.id} - {order.client}{order.assignedTo ? ` (Actual: ${order.assignedTo})` : ' (Sin asignar)'} · {getOrderScheduledDate(order)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Técnico *</label>
                <select value={assignmentForm.technicianId} onChange={e => setAssignmentForm({...assignmentForm, technicianId: e.target.value})} className={`w-full p-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-amber-500`}>
                  <option value="">Selecciona un técnico</option>
                  {systemUsers.filter(u => (u.role || '').toLowerCase().includes('tecnico')).map(user => (
                    <option key={user.username} value={user.username}>{user.name} ({user.username})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fecha programada *</label>
                <input
                  type="date"
                  value={assignmentForm.scheduledDate}
                  onChange={e => setAssignmentForm({ ...assignmentForm, scheduledDate: e.target.value })}
                  className={`w-full p-2 rounded-lg border ${inputColor} focus:outline-none focus:ring-2 focus:ring-amber-500`}
                />
                <p className={`text-[11px] mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Puedes reprogramar la orden para otro día.
                </p>
              </div>
              <div className="flex gap-2 pt-4">
                <button type="submit" className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-500 font-medium">
                  {assignmentForm.orderId ? 'Guardar asignación' : 'Asignar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAssignmentModal(false); setAssignmentForm({ orderId: '', technicianId: '', scheduledDate: toLocalDateKey(new Date()) }); }}
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
