import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit2, Minus, Plus, Save, Trash2, XCircle } from 'lucide-react';
import EmptyState from './EmptyState';

const ROW_HEIGHT = 56;
const OVERSCAN = 8;

export default function InventoryTable({
  items,
  darkMode,
  cardColor,
  inputColor,
  sortConfig,
  onSort,
  showEditItem,
  editData,
  setEditData,
  permissions,
  formatMoney,
  updateStock,
  startEditItem,
  saveEditedItem,
  cancelEditItem,
  deleteItem,
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);

  const onScroll = useCallback((event) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    const updateHeight = () => {
      const nextHeight = containerRef.current?.clientHeight || 560;
      setViewportHeight(nextHeight);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const totalRows = items.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(totalRows, startIndex + visibleCount);

  const topSpacerHeight = startIndex * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (totalRows - endIndex) * ROW_HEIGHT);

  const visibleItems = useMemo(() => items.slice(startIndex, endIndex), [items, startIndex, endIndex]);

  if (items.length === 0) {
    return (
      <div className={`${cardColor} rounded-2xl shadow-sm border p-4`}>
        <EmptyState
          title="No hay artículos para mostrar"
          description="Ajusta los filtros o carga más inventario para continuar."
          className={darkMode ? 'bg-slate-800/40 border-slate-700 text-slate-200' : ''}
        />
      </div>
    );
  }

  return (
    <div className={`${cardColor} rounded-2xl shadow-sm border overflow-hidden`}>
      <div className={`px-3 sm:px-4 py-2 text-[11px] sm:text-xs border-b ${darkMode ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
        Renderizando {visibleItems.length} de {items.length} filas (virtualizado)
      </div>

      <div ref={containerRef} onScroll={onScroll} className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[760px] text-xs sm:text-sm">
          <thead className={`${darkMode ? 'bg-slate-700' : 'bg-slate-50'} border-b sticky top-0 z-10`}>
            <tr>
              <th className="px-2 sm:px-4 py-3 text-left whitespace-nowrap cursor-pointer hover:opacity-70" onClick={() => onSort('id')}>Artículo {sortConfig.key === 'id' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
              <th className="px-2 sm:px-4 py-3 text-left whitespace-nowrap cursor-pointer hover:opacity-70" onClick={() => onSort('desc')}>Descripción {sortConfig.key === 'desc' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
              <th className="px-2 sm:px-4 py-3 text-center whitespace-nowrap cursor-pointer hover:opacity-70" onClick={() => onSort('cost')}>Costo {sortConfig.key === 'cost' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
              <th className="px-2 sm:px-4 py-3 text-center whitespace-nowrap cursor-pointer hover:opacity-70" onClick={() => onSort('stock')}>Stock {sortConfig.key === 'stock' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
              <th className="px-2 sm:px-4 py-3 text-center whitespace-nowrap">Disponible</th>
              <th className="px-2 sm:px-4 py-3 text-center whitespace-nowrap cursor-pointer hover:opacity-70" onClick={() => onSort('totalCost')}>Total {sortConfig.key === 'totalCost' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
              <th className="px-2 sm:px-4 py-3 text-center whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-slate-100'}`}>
            {topSpacerHeight > 0 && (
              <tr style={{ height: `${topSpacerHeight}px` }}>
                <td colSpan={7} />
              </tr>
            )}

            {visibleItems.map(item => (
              <tr key={item.id} className={`hover:${darkMode ? 'bg-slate-700/50' : 'bg-blue-50/30'} transition-colors`}>
                <td className="px-2 sm:px-4 py-3 font-bold whitespace-nowrap">
                  {showEditItem === item.id ? (
                    <input
                      type="text"
                      value={editData.id}
                      onChange={e => setEditData({ ...editData, id: e.target.value })}
                      className={`w-16 sm:w-20 p-1 rounded border ${inputColor}`}
                    />
                  ) : (
                    item.id
                  )}
                </td>
                <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm">
                  {showEditItem === item.id ? (
                    <input
                      type="text"
                      value={editData.desc}
                      onChange={e => setEditData({ ...editData, desc: e.target.value })}
                      className={`w-32 sm:w-40 p-1 rounded border ${inputColor}`}
                    />
                  ) : (
                    <span className="block max-w-[180px] sm:max-w-xs truncate">{item.desc}</span>
                  )}
                </td>
                <td className="px-2 sm:px-4 py-3 text-center whitespace-nowrap">
                  {showEditItem === item.id ? (
                    <input
                      type="number"
                      value={editData.cost}
                      onChange={e => setEditData({ ...editData, cost: parseFloat(e.target.value) || 0 })}
                      className={`w-20 sm:w-24 p-1 rounded border ${inputColor} text-center`}
                    />
                  ) : (
                    formatMoney(item.cost)
                  )}
                </td>
                <td className="px-2 sm:px-4 py-3 text-center whitespace-nowrap">
                  {showEditItem === item.id ? (
                    <input
                      type="number"
                      value={editData.stock}
                      onChange={e => setEditData({ ...editData, stock: parseInt(e.target.value, 10) || 0 })}
                      className={`w-16 p-1 rounded border ${inputColor} text-center`}
                    />
                  ) : (
                    item.stock
                  )}
                </td>
                <td className="px-2 sm:px-4 py-3 text-center whitespace-nowrap">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${item.available < 2 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {item.available}
                  </span>
                </td>
                <td className="px-2 sm:px-4 py-3 text-center font-bold whitespace-nowrap">{formatMoney(item.totalCost)}</td>
                <td className="px-2 sm:px-4 py-3">
                  <div className="flex flex-wrap sm:flex-nowrap justify-center gap-1">
                    {showEditItem === item.id ? (
                      <>
                        <button onClick={saveEditedItem} className="p-1 text-emerald-600 hover:bg-emerald-100 rounded" title="Guardar"><Save size={16} /></button>
                        <button onClick={cancelEditItem} className="p-1 text-red-600 hover:bg-red-100 rounded" title="Cancelar"><XCircle size={16} /></button>
                      </>
                    ) : (
                      <>
                        {permissions.canEditInventory ? (
                          <>
                            <button onClick={() => updateStock(item.id, 1)} className="p-1 text-blue-600 hover:bg-blue-100 rounded"><Plus size={14} /></button>
                            <button onClick={() => updateStock(item.id, -1)} disabled={item.stock === 0} className="p-1 text-amber-600 hover:bg-amber-100 rounded disabled:opacity-30"><Minus size={14} /></button>
                            <button onClick={() => startEditItem(item)} className="p-1 text-slate-600 hover:bg-slate-100 rounded"><Edit2 size={14} /></button>
                            <button onClick={() => deleteItem(item.id)} className="p-1 text-red-600 hover:bg-red-100 rounded"><Trash2 size={14} /></button>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400">Solo lectura</span>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {bottomSpacerHeight > 0 && (
              <tr style={{ height: `${bottomSpacerHeight}px` }}>
                <td colSpan={7} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
