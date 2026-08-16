import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';

const BACKEND_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;
const API_BASE = BACKEND_URL.endsWith('/') ? `${BACKEND_URL}api/` : `${BACKEND_URL}/api/`;

const formatImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('/')) {
    const cleanBase = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
    return `${cleanBase}${url}`;
  }
  return url;
};

// ==========================================
// 1. CUSTOMER CATALOG VIEW (READ-ONLY)
// ==========================================
function CustomerView() {
  const [garments, setGarments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  // NEW: State for customer image zoom
  const [zoomedImage, setZoomedImage] = useState(null);

  useEffect(() => {
    const fetchGarments = async () => {
      try {
        const res = await axios.get(`${API_BASE}garments/`);
        setGarments(res.data.map(g => ({ ...g, image: formatImageUrl(g.image) })));
      } catch (error) {
        console.error("Error fetching garments:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchGarments();
  }, []);

  const filteredGarments = garments.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (item.batch_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#f9f6f0] font-sans text-stone-800 relative">
      <nav className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌸</span>
            <h1 className="font-black text-xl tracking-tight text-stone-900">FLEURETTE</h1>
          </div>
          {/* UPDATED: Prominent Pink Login Button */}
          <Link to="/login" className="text-xs font-black text-white hover:text-white bg-pink-600 hover:bg-pink-700 transition uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md">
            Admin Login
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-4xl font-black text-stone-900 mb-4">Latest Collection</h2>
          <p className="text-stone-500">Discover our newest arrivals. Browse available sizes and colors below.</p>
          <div className="mt-6 relative max-w-md mx-auto">
            <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-stone-400">🔍</span>
            <input 
              type="text" placeholder="Search styles..." 
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-stone-300 rounded-2xl text-sm font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center text-stone-500 font-bold py-20">Loading Fleurette Collection...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredGarments.map(item => (
              <div 
                key={item.id} 
                // UPDATED: Added onClick and cursor-pointer to the entire card
                onClick={() => { if (item.image) setZoomedImage(item.image); }}
                className="bg-white rounded-3xl shadow-sm border border-stone-200/80 overflow-hidden flex flex-col group relative cursor-pointer hover:shadow-xl transition duration-300"
              >
                {item.total_pieces === 0 && (
                  <div className="absolute top-4 right-4 bg-stone-900 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full z-10 shadow-lg">Sold Out</div>
                )}
                <div className="relative h-72 bg-[#f2ece4] overflow-hidden flex items-center justify-center p-4">
                  {item.image ? (
                    <>
                      <img 
                        src={item.image} 
                        alt={item.name} 
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                        className={`w-full h-full object-cover rounded-xl transition duration-500 ${item.total_pieces === 0 ? 'opacity-50 grayscale' : 'group-hover:scale-105'}`} 
                      />
                      <span className="text-6xl text-stone-300 hidden">👗</span>
                    </>
                  ) : (
                    <span className="text-6xl text-stone-300">👗</span>
                  )}
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-black text-lg text-stone-900 leading-tight mb-1">{item.name}</h3>
                  <span className="text-2xl font-black text-pink-600 mb-4">₱{item.selling_price}</span>
                  
                  <div className="mt-auto">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 block">Available Sizes</span>
                    <div className="flex flex-wrap gap-2">
                      {item.sizes.map(s => (
                        <span key={s.size} className={`text-xs font-black px-3 py-1.5 rounded-lg border ${s.quantity > 0 ? 'bg-[#f9f6f0] border-stone-300 text-stone-700' : 'bg-stone-50 border-stone-100 text-stone-300 line-through'}`}>
                          {s.size}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* NEW: ZOOM IMAGE MODAL FOR CUSTOMERS */}
      {zoomedImage && (
        <div onClick={() => setZoomedImage(null)} className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 cursor-pointer animate-fade-in">
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img src={zoomedImage} alt="Zoomed clothing" className="max-w-full max-h-[82vh] object-contain rounded-3xl shadow-2xl border-2 border-white/20" />
            <span className="text-white/80 text-xs mt-3 font-semibold bg-white/10 px-4 py-1.5 rounded-full border border-white/10">✖ Click anywhere on screen to close</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 2. LOGIN SCREEN
// ==========================================
function LoginScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === 'admin123') {
      localStorage.setItem('isAdmin', 'true');
      navigate('/admin');
    } else {
      setError('Incorrect password. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#eae4dc] flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm border border-stone-200 text-center">
        <div className="text-4xl mb-4">🌸</div>
        <h2 className="text-2xl font-black text-stone-900 mb-1">Boutique Admin</h2>
        <p className="text-stone-500 text-sm mb-6">Enter password to access the POS system</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input 
              type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full border border-stone-300 rounded-xl p-3 text-center font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
            />
          </div>
          {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
          <button type="submit" className="w-full bg-stone-900 hover:bg-black text-white font-black py-3 rounded-xl shadow-lg transition active:scale-95">
            Login to Workspace
          </button>
        </form>
        <div className="mt-6 pt-6 border-t border-stone-100">
          <Link to="/" className="text-xs font-bold text-stone-400 hover:text-stone-600 transition">← Back to Customer Catalog</Link>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. FULL ADMIN DASHBOARD POS
// ==========================================
function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('inventory');
  const [garments, setGarments] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [preOrders, setPreOrders] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [historyFilterDate, setHistoryFilterDate] = useState('');

  const [zoomedImage, setZoomedImage] = useState(null);

  const [showAddBatchModal, setShowAddBatchModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showEditExpenseModal, setShowEditExpenseModal] = useState(false);
  const [showPreOrderModal, setShowPreOrderModal] = useState(false);
  const [showEditPreOrderModal, setShowEditPreOrderModal] = useState(false);
  
  const [showRenameBatchModal, setShowRenameBatchModal] = useState(false);
  const [batchRenameState, setBatchRenameState] = useState({ oldName: '', newName: '' });

  const [productModal, setProductModal] = useState({
    show: false, garment: null, mode: 'sell', size: 'M', quantity: 1
  });

  const [selectedBatch, setSelectedBatch] = useState(null);

  const [newBatch, setNewBatch] = useState({
    batch_name: '', styles: [{ id: Date.now(), name: '', cost_price: '', selling_price: '', image: null, sizes: { S: 0, M: 0, L: 0, XL: 0 } }]
  });

  const [editGarment, setEditGarment] = useState({
    id: null, batch_name: '', name: '', cost_price: '', selling_price: '', image: null, previewUrl: null, sizes: { S: 0, M: 0, L: 0, XL: 0 }
  });

  const [newExpense, setNewExpense] = useState({
    title: '', amount: '', date: new Date().toISOString().split('T')[0], isDetailed: false, breakdown: [{ name: '', cost: '' }]
  });

  const [editExpense, setEditExpense] = useState({
    id: null, title: '', amount: '', date: '', isDetailed: false, breakdown: [{ name: '', cost: '' }]
  });

  const [newPreOrder, setNewPreOrder] = useState({
    customer_name: '', item_name: '', size: '', color: '', price: '', down_payment: '', is_paid: false, balance: ''
  });

  const [editPreOrder, setEditPreOrder] = useState({
    id: null, customer_name: '', item_name: '', size: '', color: '', price: '', down_payment: '', is_paid: false, balance: ''
  });

  const showToast = (message) => { setToastMessage(message); setTimeout(() => setToastMessage(null), 3500); };

  const handleLogout = () => {
    localStorage.removeItem('isAdmin');
    navigate('/');
  };

  const fetchData = async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setLoading(true);
    setErrorMessage(null);
    try {
      const garmentsRes = await axios.get(`${API_BASE}garments/`);
      const formattedGarments = garmentsRes.data.map(g => ({ ...g, image: formatImageUrl(g.image) }));
      setGarments(formattedGarments);

      if (productModal.show && productModal.garment) {
        const freshCurrent = formattedGarments.find(g => g.id === productModal.garment.id);
        if (freshCurrent) setProductModal(prev => ({ ...prev, garment: freshCurrent }));
      }

      await fetchSalesHistory();
      await fetchExpenses();
      await fetchPreOrders();
      if (!isBackgroundRefresh) setLoading(false);
    } catch (error) {
      setErrorMessage('Could not connect to Django server. Please ensure the backend is running.');
      setLoading(false);
    }
  };

  const fetchSalesHistory = async () => { try { const res = await axios.get(`${API_BASE}sales/history/`); setSalesHistory(res.data); } catch (error) {} };
  const fetchExpenses = async () => { try { const res = await axios.get(`${API_BASE}expenses/`); setExpenses(res.data); } catch (error) {} };
  const fetchPreOrders = async () => { try { const res = await axios.get(`${API_BASE}preorders/`); setPreOrders(res.data); } catch (error) {} };

  useEffect(() => { fetchData(); }, []);

  const openProductModal = (item, defaultMode = 'sell') => {
    const defaultSize = item.sizes.find(s => s.quantity > 0)?.size || 'S';
    setProductModal({ show: true, garment: item, mode: defaultMode, size: defaultSize, quantity: 1 });
  };

  const handleSellSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.patch(`${API_BASE}garments/${productModal.garment.id}/update_stock/`, { size: productModal.size, change: -Math.abs(productModal.quantity), is_sale: true });
      const updatedGarment = { ...response.data, image: formatImageUrl(response.data.image) };
      setGarments(garments.map(g => g.id === updatedGarment.id ? updatedGarment : g));
      setProductModal({ show: false, garment: null, mode: 'sell', size: 'M', quantity: 1 });
      showToast(`🌸 Sale Recorded! Sold ${productModal.quantity} pc(s) of ${updatedGarment.name}`);
      await fetchData(true);
    } catch (error) { alert('Could not complete sale. Check stock!'); }
  };

  const handleRestockSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.patch(`${API_BASE}garments/${productModal.garment.id}/update_stock/`, { size: productModal.size, change: Math.abs(productModal.quantity), is_sale: false });
      const updatedGarment = { ...response.data, image: formatImageUrl(response.data.image) };
      setGarments(garments.map(g => g.id === updatedGarment.id ? updatedGarment : g));
      setProductModal(prev => ({ ...prev, garment: updatedGarment, quantity: 1 }));
      showToast(`📦 Restocked! Added ${productModal.quantity} pc(s) to ${updatedGarment.name}`);
      await fetchData(true);
    } catch (error) { alert('Could not restock item.'); }
  };

  const handleBatchStyleChange = (index, field, value) => {
    const updatedStyles = [...newBatch.styles];
    updatedStyles[index][field] = value;
    setNewBatch({ ...newBatch, styles: updatedStyles });
  };

  const handleBatchSizeChange = (index, size, value) => {
    const updatedStyles = [...newBatch.styles];
    updatedStyles[index].sizes[size] = value;
    setNewBatch({ ...newBatch, styles: updatedStyles });
  };

  const addStyleToBatch = () => setNewBatch({ ...newBatch, styles: [...newBatch.styles, { id: Date.now(), name: '', cost_price: '', selling_price: '', image: null, sizes: { S: 0, M: 0, L: 0, XL: 0 } }] });
  const removeStyleFromBatch = (index) => setNewBatch({ ...newBatch, styles: newBatch.styles.filter((_, i) => i !== index) });

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    try {
      for (const style of newBatch.styles) {
        if (!style.name) continue; 
        const batchName = newBatch.batch_name || 'Uncategorized';
        const existingGarment = garments.find(g => g.name.toLowerCase().trim() === style.name.toLowerCase().trim() && (g.batch_name || 'Uncategorized').toLowerCase().trim() === batchName.toLowerCase().trim());
        const formData = new FormData();
        formData.append('batch_name', batchName);
        formData.append('name', style.name.trim());

        if (existingGarment) {
          const mergedSizes = { S: 0, M: 0, L: 0, XL: 0 };
          const currentSizeMap = {};
          existingGarment.sizes.forEach(s => { currentSizeMap[s.size] = s.quantity; });
          ['S', 'M', 'L', 'XL'].forEach(sizeLabel => { mergedSizes[sizeLabel] = (currentSizeMap[sizeLabel] || 0) + parseInt(style.sizes[sizeLabel] || 0); });
          formData.append('cost_price', style.cost_price || existingGarment.cost_price);
          formData.append('selling_price', style.selling_price || existingGarment.selling_price);
          formData.append('initial_sizes', JSON.stringify(mergedSizes));
          if (style.image) formData.append('image', style.image);
          await axios.patch(`${API_BASE}garments/${existingGarment.id}/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        } else {
          formData.append('cost_price', style.cost_price || 0);
          formData.append('selling_price', style.selling_price || 0);
          formData.append('initial_sizes', JSON.stringify(style.sizes));
          if (style.image) formData.append('image', style.image);
          await axios.post(`${API_BASE}garments/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        }
      }
      setShowAddBatchModal(false);
      setNewBatch({ batch_name: '', styles: [{ id: Date.now(), name: '', cost_price: '', selling_price: '', image: null, sizes: { S: 0, M: 0, L: 0, XL: 0 } }] });
      showToast(`✨ Successfully imported Batch!`);
      await fetchData(true);
    } catch (error) { alert('Error uploading batch.'); }
  };

  const openRenameBatchModal = (oldName) => { setBatchRenameState({ oldName, newName: oldName }); setShowRenameBatchModal(true); };
  const handleRenameBatchSubmit = async (e) => {
    e.preventDefault();
    const { oldName, newName } = batchRenameState;
    if (!newName.trim() || newName.trim() === oldName) { setShowRenameBatchModal(false); return; }
    try {
      const itemsToUpdate = garments.filter(g => (g.batch_name || 'Uncategorized') === oldName);
      for (const item of itemsToUpdate) {
        const formData = new FormData();
        formData.append('batch_name', newName.trim());
        await axios.patch(`${API_BASE}garments/${item.id}/`, formData);
      }
      if (selectedBatch === oldName) setSelectedBatch(newName.trim());
      setShowRenameBatchModal(false);
      showToast(`✏️ Batch renamed!`);
      await fetchData(true);
    } catch (error) { alert('Could not rename batch.'); }
  };

  const handleDeleteBatch = async (batchName) => {
    const itemsToDelete = garments.filter(g => (g.batch_name || 'Uncategorized') === batchName);
    if (!window.confirm(`Delete "${batchName}" and all its ${itemsToDelete.length} styles?`)) return;
    try {
      for (const item of itemsToDelete) await axios.delete(`${API_BASE}garments/${item.id}/`);
      if (selectedBatch === batchName) setSelectedBatch(null);
      showToast(`🗑️ Batch deleted.`);
      await fetchData(true);
    } catch (error) { alert('Could not delete batch.'); }
  };

  const openEditModal = (item) => {
    const sizeMap = { S: 0, M: 0, L: 0, XL: 0 };
    item.sizes.forEach(s => { sizeMap[s.size] = s.quantity; });
    setEditGarment({ id: item.id, batch_name: item.batch_name || '', name: item.name, cost_price: item.cost_price, selling_price: item.selling_price, image: null, previewUrl: formatImageUrl(item.image), sizes: sizeMap });
    setProductModal({ show: false, garment: null, mode: 'sell', size: 'M', quantity: 1 });
    setShowEditModal(true);
  };

  const handleUpdateGarment = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('batch_name', editGarment.batch_name);
      formData.append('name', editGarment.name);
      formData.append('cost_price', editGarment.cost_price);
      formData.append('selling_price', editGarment.selling_price);
      formData.append('initial_sizes', JSON.stringify(editGarment.sizes));
      if (editGarment.image) formData.append('image', editGarment.image);
      await axios.patch(`${API_BASE}garments/${editGarment.id}/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setShowEditModal(false);
      showToast("✏️ Style updated!");
      await fetchData(true);
    } catch (error) { alert('Error saving changes.'); }
  };

  const handleDeleteGarment = async (id) => {
    if (!window.confirm("Delete this style?")) return;
    try { await axios.delete(`${API_BASE}garments/${id}/`); setShowEditModal(false); showToast("🗑️ Garment removed."); await fetchData(true); } catch (error) { alert('Could not delete garment.'); }
  };

  const handleBreakdownChange = (index, field, value) => {
    const updated = [...newExpense.breakdown]; updated[index][field] = value;
    const totalSum = updated.reduce((sum, item) => sum + parseFloat(item.cost || 0), 0);
    setNewExpense({ ...newExpense, breakdown: updated, amount: totalSum > 0 ? totalSum.toFixed(2) : '' });
  };
  const addBreakdownRow = () => setNewExpense({ ...newExpense, breakdown: [...newExpense.breakdown, { name: '', cost: '' }] });
  const removeBreakdownRow = (index) => {
    const updated = newExpense.breakdown.filter((_, i) => i !== index);
    const totalSum = updated.reduce((sum, item) => sum + parseFloat(item.cost || 0), 0);
    setNewExpense({ ...newExpense, breakdown: updated.length ? updated : [{ name: '', cost: '' }], amount: totalSum > 0 ? totalSum.toFixed(2) : '' });
  };
  const handleCreateExpense = async (e) => {
    e.preventDefault();
    try {
      const validBreakdown = newExpense.isDetailed ? newExpense.breakdown.filter(b => b.name.trim() !== '' && parseFloat(b.cost || 0) > 0) : [];
      await axios.post(`${API_BASE}expenses/`, { title: newExpense.title, amount: newExpense.amount, date: newExpense.date, breakdown: validBreakdown });
      setShowExpenseModal(false);
      setNewExpense({ title: '', amount: '', date: new Date().toISOString().split('T')[0], isDetailed: false, breakdown: [{ name: '', cost: '' }] });
      showToast("📈 Expense recorded!");
      await fetchData(true);
    } catch (error) { alert('Could not save expense.'); }
  };

  const openEditExpenseModal = (item) => {
    const breakdownList = item.breakdown && item.breakdown.length > 0 ? item.breakdown : [{ name: '', cost: '' }];
    setEditExpense({ id: item.id, title: item.title || '', amount: item.amount || '', date: item.date || new Date().toISOString().split('T')[0], isDetailed: item.breakdown && item.breakdown.length > 0, breakdown: breakdownList });
    setShowEditExpenseModal(true);
  };
  const handleEditBreakdownChange = (index, field, value) => {
    const updated = [...editExpense.breakdown]; updated[index][field] = value;
    const totalSum = updated.reduce((sum, item) => sum + parseFloat(item.cost || 0), 0);
    setEditExpense({ ...editExpense, breakdown: updated, amount: totalSum > 0 ? totalSum.toFixed(2) : '' });
  };
  const addEditBreakdownRow = () => setEditExpense({ ...editExpense, breakdown: [...editExpense.breakdown, { name: '', cost: '' }] });
  const removeEditBreakdownRow = (index) => {
    const updated = editExpense.breakdown.filter((_, i) => i !== index);
    const totalSum = updated.reduce((sum, item) => sum + parseFloat(item.cost || 0), 0);
    setEditExpense({ ...editExpense, breakdown: updated.length ? updated : [{ name: '', cost: '' }], amount: totalSum > 0 ? totalSum.toFixed(2) : '' });
  };
  const handleUpdateExpense = async (e) => {
    e.preventDefault();
    try {
      const validBreakdown = editExpense.isDetailed ? editExpense.breakdown.filter(b => b.name.trim() !== '' && parseFloat(b.cost || 0) > 0) : [];
      await axios.patch(`${API_BASE}expenses/${editExpense.id}/`, { title: editExpense.title, amount: editExpense.amount, date: editExpense.date, breakdown: validBreakdown });
      setShowEditExpenseModal(false);
      showToast("✏️ Expense updated!");
      await fetchData(true);
    } catch (error) { alert('Could not update expense.'); }
  };
  const handleDeleteExpense = async (id) => {
    if (!window.confirm("Remove expense?")) return;
    try { await axios.delete(`${API_BASE}expenses/${id}/`); setShowEditExpenseModal(false); showToast("🗑️ Expense removed."); await fetchData(true); } catch (error) { alert('Could not delete expense.'); }
  };
  
  const handleCreatePreOrder = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}preorders/`, newPreOrder);
      setShowPreOrderModal(false);
      setNewPreOrder({ customer_name: '', item_name: '', size: '', color: '', price: '', down_payment: '', is_paid: false, balance: '' });
      showToast("📝 Pre-order added!");
      await fetchData(true);
    } catch (error) { alert('Error creating pre-order.'); }
  };
  const openEditPreOrderModal = (item) => {
    setEditPreOrder({ id: item.id, customer_name: item.customer_name, item_name: item.item_name, size: item.size, color: item.color, price: item.price || '', down_payment: item.down_payment || '', is_paid: item.is_paid, balance: item.balance });
    setShowEditPreOrderModal(true);
  };
  const handleUpdatePreOrder = async (e) => {
    e.preventDefault();
    try {
      await axios.patch(`${API_BASE}preorders/${editPreOrder.id}/`, editPreOrder);
      setShowEditPreOrderModal(false);
      showToast("✏️ Pre-order updated!");
      await fetchData(true);
    } catch (error) { alert('Error updating pre-order.'); }
  };
  const handleDeletePreOrder = async (id) => {
    if (!window.confirm("Delete this pre-order?")) return;
    try { await axios.delete(`${API_BASE}preorders/${id}/`); showToast("🗑️ Pre-order removed."); await fetchData(true); } catch (error) { alert('Could not delete pre-order.'); }
  };

  const unifiedHistory = [
    ...salesHistory.map(log => ({ id: `sale-${log.id}`, isPreOrder: false, date: log.sold_at, name: log.garment_name, size: log.size, qty: log.quantity_sold, earned: parseFloat(log.profit_earned || 0) })),
    ...preOrders.map(order => ({ id: `preorder-${order.id}`, isPreOrder: true, date: order.order_date, name: `📝 Pre-Order: ${order.item_name}`, size: order.size, qty: 1, earned: parseFloat(order.price || 0) - parseFloat(order.balance || 0) }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredUnifiedHistory = historyFilterDate ? unifiedHistory.filter(log => log.date === historyFilterDate) : unifiedHistory;
  const historyTotalEarned = filteredUnifiedHistory.reduce((sum, log) => sum + log.earned, 0);
  const historyTotalPieces = filteredUnifiedHistory.reduce((sum, log) => sum + log.qty, 0);

  const dailyHistory = unifiedHistory.filter(log => log.date === selectedDate);
  const dailyStats = { total_pieces_sold: dailyHistory.reduce((sum, log) => sum + log.qty, 0), total_profit_earned: dailyHistory.reduce((sum, log) => sum + log.earned, 0) };

  const totalStoreProfit = garments.reduce((sum, item) => sum + parseFloat(item.total_potential_profit || 0), 0);
  const totalStorePieces = garments.reduce((sum, item) => sum + (item.total_pieces || 0), 0);

  const filteredGarments = garments.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()) || (item.batch_name || '').toLowerCase().includes(searchQuery.toLowerCase()));

  const totalGrossSalesProfit = unifiedHistory.reduce((sum, log) => sum + log.earned, 0);
  const totalBatchExpenses = expenses.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
  const actualNetProfit = totalGrossSalesProfit - totalBatchExpenses;

  const batchMap = {};
  garments.forEach(g => {
    const bName = g.batch_name || 'Uncategorized';
    if (!batchMap[bName]) batchMap[bName] = { name: bName, pieces_left: 0, potential_profit: 0, styles_count: 0 };
    batchMap[bName].pieces_left += g.total_pieces;
    batchMap[bName].potential_profit += parseFloat(g.total_potential_profit);
    batchMap[bName].styles_count += 1;
  });
  const batchTrackerData = Object.values(batchMap).sort((a, b) => b.pieces_left - a.pieces_left);
  const uniqueGarmentNames = Array.from(new Set(garments.map(g => g.name)));

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-rose-50 flex flex-col items-center justify-center p-6 text-center font-sans">
        <span className="text-6xl mb-4">🌸</span>
        <h2 className="text-2xl font-bold text-rose-800 mb-2">Connection Error</h2>
        <p className="text-rose-600 max-w-md mb-6">{errorMessage}</p>
        <button onClick={() => fetchData(false)} className="bg-pink-600 hover:bg-pink-700 text-white font-bold px-6 py-2.5 rounded-xl shadow">Retry Connection</button>
      </div>
    );
  }

  if (loading) return <div className="p-8 text-center text-lg font-semibold text-stone-600 bg-[#f9f6f0] min-h-screen flex items-center justify-center font-sans">🌸 Loading Fleurette POS...</div>;

  return (
    <div className="min-h-screen bg-[#f9f6f0] text-stone-800 flex flex-col md:flex-row relative font-sans">
      
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-pink-600 text-white px-6 py-3.5 rounded-2xl shadow-2xl font-black text-sm md:text-base border-2 border-pink-400 flex items-center gap-3 animate-bounce">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white font-bold ml-2">✖</button>
        </div>
      )}

      {/* ADMIN SIDEBAR */}
      <aside className="w-full md:w-64 bg-[#eae4dc] text-stone-900 p-6 flex flex-col justify-between shrink-0 md:h-screen md:sticky md:top-0 z-30 shadow-xl border-r border-[#ddd5cc]">
        <div>
          <div className="flex items-center gap-3 mb-8 pb-4 border-b border-[#ddd5cc]">
            <span className="text-3xl">🌸</span>
            <div>
              <h1 className="font-black text-lg tracking-tight leading-none text-stone-900">FLEURETTE</h1>
              <span className="text-[10px] uppercase tracking-widest text-pink-700 font-extrabold">Boutique POS</span>
            </div>
          </div>

          <div className="space-y-2">
            <button onClick={() => { setActiveTab('inventory'); setSelectedBatch(null); }} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-3 ${ activeTab === 'inventory' ? 'bg-pink-600 text-white shadow-lg' : 'hover:bg-[#ded6cc]' }`}><span className="text-lg">🛍️</span> Product Gallery</button>
            <button onClick={() => { setActiveTab('history'); setSelectedBatch(null); }} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-3 ${ activeTab === 'history' ? 'bg-pink-600 text-white shadow-lg' : 'hover:bg-[#ded6cc]' }`}><span className="text-lg">📜</span> Sales Ledger</button>
            <button onClick={() => { setActiveTab('analytics'); setSelectedBatch(null); }} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-3 ${ activeTab === 'analytics' ? 'bg-pink-600 text-white shadow-lg' : 'hover:bg-[#ded6cc]' }`}><span className="text-lg">📈</span> Net Profit Analytics</button>
            <button onClick={() => { setActiveTab('preorders'); setSelectedBatch(null); }} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-3 ${ activeTab === 'preorders' ? 'bg-pink-600 text-white shadow-lg' : 'hover:bg-[#ded6cc]' }`}><span className="text-lg">📝</span> Custom Pre-Orders</button>
            <button onClick={() => { setActiveTab('batches'); setSelectedBatch(null); }} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-3 mt-4 border ${ activeTab === 'batches' ? 'bg-white shadow-md border-stone-200' : 'border-transparent hover:bg-white' }`}><span className="text-lg">📊</span> Batch Tracker</button>
          </div>
        </div>

        <div className="pt-6 border-t border-[#ddd5cc] mt-6 flex flex-col gap-3">
          <button onClick={() => setShowAddBatchModal(true)} className="w-full bg-stone-900 hover:bg-black text-white font-black py-3 px-4 rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2 text-sm">
            <span className="text-lg leading-none">📦</span> Import New Batch
          </button>
          <button onClick={handleLogout} className="w-full bg-[#ded6cc] hover:bg-stone-300 text-stone-700 font-bold py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2 text-xs">
            Log Out
          </button>
        </div>
      </aside>

      {/* ADMIN WORKSPACE */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto min-w-0">
        
        {/* INVENTORY TAB */}
        {activeTab === 'inventory' && (
          <div className="animate-fade-in max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div><h2 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">Catalog &amp; Gallery</h2></div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input type="text" placeholder="Search styles..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full sm:w-64 pl-4 pr-4 py-2 bg-white border border-stone-300 rounded-xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-pink-500" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredGarments.map((item) => (
                <div key={item.id} onClick={() => openProductModal(item, 'sell')} className="bg-white rounded-3xl shadow-sm hover:shadow-xl border border-stone-200/80 transition duration-300 overflow-hidden flex flex-col group cursor-pointer relative">
                  <div className="relative h-64 bg-[#f2ece4] overflow-hidden flex items-center justify-center pt-2">
                    {item.image ? (
                      <>
                        <img 
                          src={item.image} 
                          alt={item.name} 
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                          className="w-full h-full object-cover group-hover:scale-105 transition" 
                        />
                        <span className="text-6xl text-stone-300 hidden">👗</span>
                      </>
                    ) : (
                      <span className="text-6xl text-stone-300">👗</span>
                    )}
                    <div className="absolute bottom-3 right-3 bg-[#eae4dc]/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-black shadow-md">{item.total_pieces} pcs left</div>
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-black text-lg text-stone-900">{item.name}</h3>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-black text-stone-900">₱{item.selling_price}</span>
                      <span className="text-xs font-bold text-stone-400 line-through">₱{item.cost_price}</span>
                    </div>
                    <div className="mt-4 pt-3 border-t border-stone-100 grid grid-cols-4 gap-1">
                      {item.sizes.map((s) => (
                        <div key={s.size} className={`text-center py-1 rounded border text-[11px] font-black ${s.quantity > 0 ? 'bg-[#f9f6f0]' : 'bg-red-50 text-red-400 opacity-60'}`}>{s.size}: {s.quantity}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BATCHES TAB */}
        {activeTab === 'batches' && (
          <div className="animate-fade-in max-w-7xl mx-auto">
            {selectedBatch ? (
              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-stone-200">
                  <div>
                    <button onClick={() => setSelectedBatch(null)} className="text-pink-700 hover:text-pink-900 font-black text-sm mb-1.5 flex items-center gap-2"><span>⬅</span> Back to All Batches</button>
                    <h2 className="text-2xl font-black text-stone-900">Batch: {selectedBatch}</h2>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openRenameBatchModal(selectedBatch)} className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold px-4 py-2 rounded-xl text-xs shadow">✏️ Rename</button>
                    <button onClick={() => handleDeleteBatch(selectedBatch)} className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-extrabold px-4 py-2 rounded-xl text-xs border border-rose-200">🗑️ Delete Batch</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {garments.filter(g => (g.batch_name || 'Uncategorized') === selectedBatch).map((item) => (
                    <div key={item.id} className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden flex flex-col relative group">
                      <div onClick={() => openProductModal(item, 'sell')} className="relative h-64 bg-[#f2ece4] flex items-center justify-center cursor-pointer overflow-hidden">
                        {item.image ? (
                          <>
                            <img 
                              src={item.image} 
                              alt={item.name} 
                              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                              className="w-full h-full object-cover group-hover:scale-105 transition" 
                            />
                            <span className="text-6xl text-stone-300 hidden">👗</span>
                          </>
                        ) : (
                          <span className="text-6xl text-stone-300">👗</span>
                        )}
                        <div className="absolute bottom-3 right-3 bg-[#eae4dc]/90 px-3 py-1 rounded-full text-xs font-black shadow-md">{item.total_pieces} pcs</div>
                      </div>
                      <div className="p-5 flex flex-col flex-1">
                        <h3 className="font-black text-lg text-stone-900 mb-2">{item.name}</h3>
                        <div className="pt-2 border-t border-stone-100 flex gap-2 mt-auto">
                          <button onClick={() => openEditModal(item)} className="flex-1 bg-amber-50 text-amber-700 border border-amber-200 font-extrabold py-2 rounded-xl text-xs">✏️ Edit</button>
                          <button onClick={() => handleDeleteGarment(item.id)} className="bg-rose-50 text-rose-600 border border-rose-200 font-extrabold py-2 px-3 rounded-xl text-xs">🗑️</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-black text-stone-900 mb-6">Active Batch Tracker</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {batchTrackerData.map((batch, idx) => (
                    <div key={idx} className="bg-white rounded-3xl p-6 shadow-sm border border-stone-200 hover:shadow-xl transition">
                      <div onClick={() => setSelectedBatch(batch.name)} className="cursor-pointer mb-4">
                        <h3 className="text-xl font-black text-stone-900 hover:text-pink-600">{batch.name}</h3>
                        <div className="text-stone-500 text-sm mt-2">{batch.pieces_left} pieces remaining</div>
                      </div>
                      <div className="pt-4 border-t border-stone-100 flex gap-2">
                        <button onClick={() => setSelectedBatch(batch.name)} className="flex-1 bg-[#f2ece4] font-extrabold py-2 rounded-xl text-xs">👁️ View Items</button>
                        <button onClick={() => openRenameBatchModal(batch.name)} className="bg-amber-50 text-amber-700 py-2 px-3 rounded-xl text-xs">✏️</button>
                        <button onClick={() => handleDeleteBatch(batch.name)} className="bg-rose-50 text-rose-600 py-2 px-3 rounded-xl text-xs">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="animate-fade-in max-w-6xl mx-auto">
            <h2 className="text-2xl font-black text-stone-900 mb-6">Sales Ledger</h2>
            <div className="bg-white rounded-3xl shadow-sm border border-stone-200 w-full overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-[#f2ece4] text-stone-700 text-xs uppercase font-extrabold"><th className="p-4">Date</th><th className="p-4">Item</th><th className="p-4 text-center">Qty</th><th className="p-4 text-right">Revenue</th></tr></thead>
                  <tbody className="divide-y divide-stone-200">
                    {filteredUnifiedHistory.map((log) => (
                      <tr key={log.id} className="hover:bg-[#f9f6f0]">
                        <td className="p-4 text-sm font-bold text-stone-500">{log.date}</td>
                        <td className="p-4 font-black text-stone-900">{log.isPreOrder ? `📝 ${log.name}` : log.name}</td>
                        <td className="p-4 text-center font-black">{log.qty} pcs</td>
                        <td className="p-4 text-right font-black text-pink-600">+₱{log.earned.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
           <div className="animate-fade-in max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-stone-900">Net Profit Analytics</h2>
              <button onClick={() => setShowExpenseModal(true)} className="bg-pink-600 text-white font-extrabold px-4 py-2 rounded-xl text-sm shadow">+ Add Expense</button>
            </div>
            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm"><span className="text-xs text-stone-400 font-black block">Gross Revenue</span><span className="text-3xl font-black">₱{totalGrossSalesProfit.toFixed(2)}</span></div>
              <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm"><span className="text-xs text-rose-500 font-black block">Total Expenses</span><span className="text-3xl font-black text-rose-600">-₱{totalBatchExpenses.toFixed(2)}</span></div>
              <div className="bg-stone-900 p-6 rounded-3xl shadow-xl"><span className="text-xs text-pink-300 font-black block">Real Net Profit</span><span className="text-3xl font-black text-white">₱{actualNetProfit.toFixed(2)}</span></div>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-stone-200 w-full overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-[#f2ece4] text-stone-700 text-xs uppercase font-extrabold"><th className="p-4">Date</th><th className="p-4">Expense Title</th><th className="p-4 text-right">Amount</th><th className="p-4 text-center">Actions</th></tr></thead>
                  <tbody className="divide-y divide-stone-200">
                    {expenses.map((item) => (
                      <tr key={item.id} className="hover:bg-[#f9f6f0]">
                        <td className="p-4 text-sm font-bold text-stone-500">{item.date}</td>
                        <td className="p-4 font-black text-stone-900">{item.title}</td>
                        <td className="p-4 text-right font-black text-rose-600">-₱{parseFloat(item.amount || 0).toFixed(2)}</td>
                        <td className="p-4 text-center flex justify-center gap-1">
                          <button onClick={() => openEditExpenseModal(item)} className="bg-amber-50 text-amber-700 font-extrabold p-2 rounded-lg text-xs">✏️</button>
                          <button onClick={() => handleDeleteExpense(item.id)} className="bg-rose-50 text-rose-600 font-extrabold p-2 rounded-lg text-xs">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </div>
        )}

        {/* PREORDERS TAB */}
        {activeTab === 'preorders' && (
           <div className="animate-fade-in max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-stone-900">Customer Pre-Orders</h2>
              <button onClick={() => setShowPreOrderModal(true)} className="bg-pink-600 text-white font-extrabold px-4 py-2 rounded-xl text-sm shadow">+ Add Pre-Order</button>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-stone-200 w-full overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead><tr className="bg-[#f2ece4] text-stone-700 text-xs uppercase font-extrabold"><th className="p-4">Customer</th><th className="p-4">Style</th><th className="p-4 text-center">Status</th><th className="p-4 text-right">Balance Due</th><th className="p-4 text-center">Actions</th></tr></thead>
                <tbody className="divide-y divide-stone-200">
                  {preOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-[#f9f6f0]">
                      <td className="p-4 font-black text-stone-900">{order.customer_name}</td>
                      <td className="p-4 font-bold text-stone-800">{order.item_name}</td>
                      <td className="p-4 text-center">{order.is_paid ? <span className="text-emerald-600 font-black text-xs">Paid</span> : <span className="text-rose-600 font-black text-xs">Pending</span>}</td>
                      <td className="p-4 text-right font-black text-rose-600">₱{parseFloat(order.balance).toFixed(2)}</td>
                      <td className="p-4 text-center flex justify-center gap-1">
                        <button onClick={() => openEditPreOrderModal(order)} className="bg-amber-50 text-amber-700 font-extrabold p-2 rounded-lg text-xs">✏️</button>
                        <button onClick={() => handleDeletePreOrder(order.id)} className="bg-rose-50 text-rose-600 font-extrabold p-2 rounded-lg text-xs">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ALL MODALS COMPACTED FOR ADMIN VIEW */}
      {/* Product POS Modal */}
      {productModal.show && productModal.garment && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl flex flex-col relative">
            <button onClick={() => setProductModal({ show: false, garment: null, mode: 'sell', size: 'M', quantity: 1 })} className="absolute top-4 right-4 bg-stone-100 text-stone-800 w-8 h-8 rounded-full font-black text-lg">✖</button>
            <h2 className="text-2xl font-black text-stone-900 mb-2">{productModal.garment.name}</h2>
            <div className="flex items-center gap-4 mb-6">
              <span className="text-3xl font-black text-stone-900">₱{productModal.garment.selling_price}</span>
              <span className="bg-pink-100 text-pink-800 text-xs font-black px-3 py-1 rounded-lg">Profit: ₱{productModal.garment.profit_per_piece}/ea</span>
            </div>

            <div className="flex bg-[#f2ece4] p-1 rounded-xl mb-4">
              <button onClick={() => setProductModal({ ...productModal, mode: 'sell' })} className={`flex-1 py-2 rounded-lg font-extrabold text-xs ${productModal.mode === 'sell' ? 'bg-white text-pink-600 shadow-sm' : 'text-stone-600'}`}>🛍️ Record Sale</button>
              <button onClick={() => setProductModal({ ...productModal, mode: 'restock' })} className={`flex-1 py-2 rounded-lg font-extrabold text-xs ${productModal.mode === 'restock' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}`}>📦 Restock</button>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-6">
              {productModal.garment.sizes.map((s) => (
                <button key={s.size} onClick={() => setProductModal({ ...productModal, size: s.size, quantity: 1 })} disabled={productModal.mode === 'sell' && s.quantity === 0} className={`py-3 rounded-xl font-bold border flex flex-col items-center ${productModal.size === s.size ? 'bg-pink-600 text-white border-pink-600' : 'bg-[#f9f6f0] border-stone-300'}`}>
                  <span className="text-sm font-black">{s.size}</span>
                  <span className="text-[10px] opacity-80">{s.quantity} in stock</span>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <input type="number" min="1" value={productModal.quantity} onChange={(e) => setProductModal({ ...productModal, quantity: e.target.value })} className="w-20 text-center font-black text-lg border border-stone-300 rounded-xl bg-[#f9f6f0]" />
              {productModal.mode === 'sell' ? (
                <button onClick={handleSellSubmit} className="flex-1 bg-pink-500 text-white font-black py-3 px-6 rounded-xl shadow-lg">Confirm Sale</button>
              ) : (
                <button onClick={handleRestockSubmit} className="flex-1 bg-stone-900 text-white font-black py-3 px-6 rounded-xl shadow-lg">Confirm Restock</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rename Batch Modal */}
      {showRenameBatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6">
            <h2 className="text-lg font-black mb-4">Rename Batch</h2>
            <input type="text" value={batchRenameState.newName} onChange={(e) => setBatchRenameState({ ...batchRenameState, newName: e.target.value })} className="w-full border rounded-lg p-3 font-bold mb-4 bg-stone-50" />
            <div className="flex justify-end gap-2"><button onClick={() => setShowRenameBatchModal(false)} className="px-4 py-2 bg-stone-100 rounded-lg">Cancel</button><button onClick={handleRenameBatchSubmit} className="px-4 py-2 bg-amber-500 text-white font-bold rounded-lg">Save</button></div>
          </div>
        </div>
      )}

      {/* Add Batch Wizard */}
      {showAddBatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex justify-between mb-4 border-b pb-4"><h2 className="text-xl font-black">📦 Import New Batch</h2><button onClick={() => setShowAddBatchModal(false)}>✖</button></div>
            <form onSubmit={handleCreateBatch} className="overflow-y-auto pr-2 space-y-4 flex-1">
              <input type="text" required placeholder="Batch Name (e.g. Batch #1)" value={newBatch.batch_name} onChange={(e) => setNewBatch({...newBatch, batch_name: e.target.value})} className="w-full border rounded-lg p-3 font-bold bg-[#f2ece4]" />
              {newBatch.styles.map((style, index) => (
                <div key={style.id} className="bg-stone-50 p-4 rounded-xl border border-stone-200">
                  <input type="text" required placeholder="Style Name" list={`names-${index}`} value={style.name} onChange={(e) => {
                    handleBatchStyleChange(index, 'name', e.target.value);
                    const exist = garments.find(g => g.name.toLowerCase() === e.target.value.toLowerCase());
                    if(exist) { handleBatchStyleChange(index, 'cost_price', exist.cost_price); handleBatchStyleChange(index, 'selling_price', exist.selling_price); }
                  }} className="w-full border rounded-lg p-2 mb-2 font-bold" />
                  <datalist id={`names-${index}`}>{uniqueGarmentNames.map((n, i) => <option key={i} value={n} />)}</datalist>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input type="number" step="0.01" required placeholder="Cost ₱" value={style.cost_price} onChange={(e) => handleBatchStyleChange(index, 'cost_price', e.target.value)} className="border rounded-lg p-2 text-sm" />
                    <input type="number" step="0.01" required placeholder="Sell ₱" value={style.selling_price} onChange={(e) => handleBatchStyleChange(index, 'selling_price', e.target.value)} className="border rounded-lg p-2 text-sm" />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {['S', 'M', 'L', 'XL'].map(size => <input key={size} type="number" min="0" placeholder={size} value={style.sizes[size]} onChange={(e) => handleBatchSizeChange(index, size, e.target.value)} className="border rounded-lg p-2 text-center text-sm font-bold" /> )}
                  </div>
                </div>
              ))}
              <button type="button" onClick={addStyleToBatch} className="w-full bg-stone-200 py-3 rounded-xl font-bold">+ Add Style</button>
              <div className="flex justify-end gap-2 pt-4 border-t"><button type="submit" className="bg-stone-900 text-white font-black px-6 py-2 rounded-xl">Save Batch</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Style Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm"><h2 className="font-black text-xl mb-4">Edit Style</h2>
            <form onSubmit={handleUpdateGarment} className="space-y-3">
              <input type="text" required placeholder="Batch" value={editGarment.batch_name} onChange={(e) => setEditGarment({...editGarment, batch_name: e.target.value})} className="w-full border p-2 rounded-lg font-bold bg-stone-50" />
              <input type="text" required placeholder="Name" value={editGarment.name} onChange={(e) => setEditGarment({...editGarment, name: e.target.value})} className="w-full border p-2 rounded-lg font-bold bg-stone-50" />
              <div className="flex gap-2">
                <input type="number" required placeholder="Cost" value={editGarment.cost_price} onChange={(e) => setEditGarment({...editGarment, cost_price: e.target.value})} className="w-1/2 border p-2 rounded-lg" />
                <input type="number" required placeholder="Sell" value={editGarment.selling_price} onChange={(e) => setEditGarment({...editGarment, selling_price: e.target.value})} className="w-1/2 border p-2 rounded-lg" />
              </div>
              <div className="flex justify-between gap-2 mt-4 pt-4 border-t"><button type="button" onClick={() => setShowEditModal(false)} className="bg-stone-200 px-4 py-2 rounded-lg font-bold">Cancel</button><button type="submit" className="bg-amber-500 text-white px-4 py-2 rounded-lg font-bold">Save</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm"><h2 className="font-black text-xl mb-4">Add Expense</h2>
            <form onSubmit={handleCreateExpense} className="space-y-3">
              <input type="text" required placeholder="Title" value={newExpense.title} onChange={(e) => setNewExpense({...newExpense, title: e.target.value})} className="w-full border p-2 rounded-lg font-bold" />
              <input type="number" step="0.01" required placeholder="Amount" value={newExpense.amount} onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})} className="w-full border p-2 rounded-lg font-black text-rose-600" />
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t"><button type="button" onClick={() => setShowExpenseModal(false)} className="bg-stone-200 px-4 py-2 rounded-lg font-bold">Cancel</button><button type="submit" className="bg-pink-600 text-white px-4 py-2 rounded-lg font-bold">Save</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Expense Modal */}
      {showEditExpenseModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm"><h2 className="font-black text-xl mb-4">Edit Expense</h2>
            <form onSubmit={handleUpdateExpense} className="space-y-3">
              <input type="text" required placeholder="Title" value={editExpense.title} onChange={(e) => setEditExpense({...editExpense, title: e.target.value})} className="w-full border p-2 rounded-lg font-bold" />
              <input type="number" step="0.01" required placeholder="Amount" value={editExpense.amount} onChange={(e) => setEditExpense({...editExpense, amount: e.target.value})} className="w-full border p-2 rounded-lg font-black text-rose-600" />
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t"><button type="button" onClick={() => setShowEditExpenseModal(false)} className="bg-stone-200 px-4 py-2 rounded-lg font-bold">Cancel</button><button type="submit" className="bg-amber-500 text-white px-4 py-2 rounded-lg font-bold">Update</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Add PreOrder Modal */}
      {showPreOrderModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm"><h2 className="font-black text-xl mb-4">Add Pre-Order</h2>
            <form onSubmit={handleCreatePreOrder} className="space-y-3">
              <input type="text" required placeholder="Customer Name" value={newPreOrder.customer_name} onChange={(e) => setNewPreOrder({...newPreOrder, customer_name: e.target.value})} className="w-full border p-2 rounded-lg font-bold" />
              <input type="text" required placeholder="Item Name" value={newPreOrder.item_name} onChange={(e) => setNewPreOrder({...newPreOrder, item_name: e.target.value})} className="w-full border p-2 rounded-lg font-bold" />
              <div className="flex gap-2"><input type="text" required placeholder="Size" value={newPreOrder.size} onChange={(e) => setNewPreOrder({...newPreOrder, size: e.target.value})} className="w-1/2 border p-2 rounded-lg" /><input type="text" required placeholder="Color" value={newPreOrder.color} onChange={(e) => setNewPreOrder({...newPreOrder, color: e.target.value})} className="w-1/2 border p-2 rounded-lg" /></div>
              <div className="flex gap-2">
                <input type="number" step="0.01" required placeholder="Price" value={newPreOrder.price} onChange={(e) => { const p=e.target.value; const dp=newPreOrder.down_payment; const bal=Math.max(0, p-dp); setNewPreOrder({...newPreOrder, price: p, balance: bal.toFixed(2), is_paid: bal<=0}); }} className="w-1/2 border p-2 rounded-lg text-sm" />
                <input type="number" step="0.01" required placeholder="Downpayment" value={newPreOrder.down_payment} onChange={(e) => { const dp=e.target.value; const p=newPreOrder.price; const bal=Math.max(0, p-dp); setNewPreOrder({...newPreOrder, down_payment: dp, balance: bal.toFixed(2), is_paid: bal<=0}); }} className="w-1/2 border p-2 rounded-lg text-sm" />
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t"><button type="button" onClick={() => setShowPreOrderModal(false)} className="bg-stone-200 px-4 py-2 rounded-lg font-bold">Cancel</button><button type="submit" className="bg-pink-600 text-white px-4 py-2 rounded-lg font-bold">Save</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Edit PreOrder Modal */}
      {showEditPreOrderModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm"><h2 className="font-black text-xl mb-4">Edit Pre-Order</h2>
            <form onSubmit={handleUpdatePreOrder} className="space-y-3">
              <input type="text" required placeholder="Customer Name" value={editPreOrder.customer_name} onChange={(e) => setEditPreOrder({...editPreOrder, customer_name: e.target.value})} className="w-full border p-2 rounded-lg font-bold" />
              <input type="text" required placeholder="Item Name" value={editPreOrder.item_name} onChange={(e) => setEditPreOrder({...editPreOrder, item_name: e.target.value})} className="w-full border p-2 rounded-lg font-bold" />
              <div className="flex gap-2"><input type="text" required placeholder="Size" value={editPreOrder.size} onChange={(e) => setEditPreOrder({...editPreOrder, size: e.target.value})} className="w-1/2 border p-2 rounded-lg" /><input type="text" required placeholder="Color" value={editPreOrder.color} onChange={(e) => setEditPreOrder({...editPreOrder, color: e.target.value})} className="w-1/2 border p-2 rounded-lg" /></div>
              <div className="flex gap-2">
                <input type="number" step="0.01" required placeholder="Price" value={editPreOrder.price} onChange={(e) => { const p=e.target.value; const dp=editPreOrder.down_payment; const bal=Math.max(0, p-dp); setEditPreOrder({...editPreOrder, price: p, balance: bal.toFixed(2), is_paid: bal<=0}); }} className="w-1/2 border p-2 rounded-lg text-sm" />
                <input type="number" step="0.01" required placeholder="Downpayment" value={editPreOrder.down_payment} onChange={(e) => { const dp=e.target.value; const p=editPreOrder.price; const bal=Math.max(0, p-dp); setEditPreOrder({...editPreOrder, down_payment: dp, balance: bal.toFixed(2), is_paid: bal<=0}); }} className="w-1/2 border p-2 rounded-lg text-sm" />
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t"><button type="button" onClick={() => setShowEditPreOrderModal(false)} className="bg-stone-200 px-4 py-2 rounded-lg font-bold">Cancel</button><button type="submit" className="bg-amber-500 text-white px-4 py-2 rounded-lg font-bold">Update</button></div>
            </form>
          </div>
        </div>
      )}

      {/* ZOOM IMAGE MODAL FOR ADMIN */}
      {zoomedImage && (
        <div onClick={() => setZoomedImage(null)} className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 cursor-pointer animate-fade-in">
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img src={zoomedImage} alt="Zoomed clothing" className="max-w-full max-h-[82vh] object-contain rounded-3xl shadow-2xl border-2 border-white/20" />
            <span className="text-white/80 text-xs mt-3 font-semibold bg-white/10 px-4 py-1.5 rounded-full border border-white/10">✖ Click anywhere on screen to close</span>
          </div>
        </div>
      )}

    </div>
  );
}

// ==========================================
// 4. ROUTER WRAPPER
// ==========================================
function ProtectedRoute({ children }) {
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  return isAdmin ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CustomerView />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/admin" element={
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}