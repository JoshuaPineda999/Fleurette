import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';

// Prevent infinite hangs on requests if Render goes down (60 sec max to allow cold-starts)
axios.defaults.timeout = 60000;

// 1. Intelligent Backend URL Resolver (Prevents the port 8000 Vercel infinite hang)
let BACKEND_URL = import.meta.env.VITE_API_URL;
if (!BACKEND_URL || BACKEND_URL.includes('vercel.app')) {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    BACKEND_URL = 'http://localhost:8000';
  } else {
    // Hard-fallback to your live Render backend if Vercel ENV is missing
    BACKEND_URL = 'https://fleurettesdajkdhashjkdasfjadsfa.onrender.com';
  }
}

// 2. Safely format the API route
const API_BASE = BACKEND_URL.endsWith('/') ? `${BACKEND_URL}api/` : `${BACKEND_URL}/api/`;

// 3. Ultra-Safe Image Formatter
const formatImageUrl = (url) => {
  if (!url) return null;
  if (typeof url === 'object' && url.url) url = String(url.url);
  if (typeof url !== 'string') return null;
  
  url = url.trim();
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.includes('res.cloudinary.com')) return `https://${url.replace(/^http(s)?:\/\//, '')}`;

  let hostUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
  if (hostUrl.endsWith('/api')) hostUrl = hostUrl.slice(0, -4);
  
  if (url.startsWith(hostUrl)) return url;
  return url.startsWith('/') ? `${hostUrl}${url}` : `${hostUrl}/${url}`;
};

// 4. Strict JSON Array Parser
const parseSafeArray = (data) => {
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
};

// ==========================================
// ERROR BOUNDARY (PREVENTS WHITE SCREENS)
// ==========================================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Critical Render Error Caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-rose-50 flex flex-col items-center justify-center p-6 text-center font-sans">
          <span className="text-6xl mb-4">💥</span>
          <h2 className="text-2xl font-black text-stone-900 mb-2">Display Error Caught</h2>
          <p className="text-stone-600 max-w-md mb-6 text-sm font-bold bg-white p-4 rounded-xl border border-stone-200 break-all overflow-hidden">
            {this.state.error?.message || "An unexpected rendering error occurred."}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-stone-900 hover:bg-black text-white font-black px-6 py-3 rounded-xl shadow transition"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ==========================================
// 1. CUSTOMER CATALOG VIEW (DEFAULT /)
// ==========================================
function CustomerView() {
  const [garments, setGarments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [zoomedImage, setZoomedImage] = useState(null);

  useEffect(() => {
    const fetchGarments = async () => {
      try {
        const res = await axios.get(`${API_BASE}garments/`);
        const gData = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        // Safely map data to prevent mapper crashes
        setGarments((gData || []).map(g => ({ ...g, sizes: parseSafeArray(g?.sizes), image: formatImageUrl(g?.image) })));
      } catch (error) {
        console.error("Error fetching garments:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchGarments();
  }, []);

  const categories = ['All', ...new Set((garments || []).map(g => String(g?.category || 'Uncategorized')))];

  const filteredGarments = (garments || [])
    .filter(item => {
      if (!item) return false;
      const searchLower = String(searchQuery || '').toLowerCase();
      const matchesSearch = String(item.name || '').toLowerCase().includes(searchLower) || 
                            String(item.batch_name || '').toLowerCase().includes(searchLower);
      const matchesCategory = activeCategory === 'All' || (item.category || 'Uncategorized') === activeCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

  return (
    <div className="min-h-screen bg-[#f9f6f0] font-sans text-stone-800 relative">
      <nav className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌸</span>
            <h1 className="font-black text-xl tracking-tight text-stone-900">FLEURETTE</h1>
          </div>
          <Link to="/login" className="text-xs font-black text-white hover:text-white bg-pink-600 hover:bg-pink-700 transition uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md">
            Admin Login
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="text-center max-w-2xl mx-auto mb-8">
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

        {/* CUSTOMER CATEGORY TABS */}
        {!loading && categories.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {categories.map(cat => (
              <button
                key={String(cat)}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2 rounded-full text-xs font-black tracking-wider uppercase transition shadow-sm border ${
                  activeCategory === cat ? 'bg-pink-600 text-white border-pink-600 scale-105' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                }`}
              >
                {String(cat)}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center text-stone-500 font-bold py-20">Loading Fleurette Collection...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredGarments.map(item => (
              <div 
                key={`cust-${item?.id}`} 
                onClick={() => { if (item?.image) setZoomedImage(item.image); }}
                className="bg-white rounded-3xl shadow-sm border border-stone-200/80 overflow-hidden flex flex-col group relative cursor-pointer hover:shadow-xl transition duration-300"
              >
                {item?.total_pieces === 0 && (
                  <div className="absolute top-4 right-4 bg-stone-900 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full z-10 shadow-lg">Sold Out</div>
                )}
                <div className="relative h-72 bg-[#f2ece4] overflow-hidden flex items-center justify-center p-4">
                  {item?.image ? (
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
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-black text-lg text-stone-900 leading-tight pr-2">{String(item?.name || 'Unnamed')}</h3>
                    {item?.color && item.color !== 'N/A' && (
                      <span className="bg-stone-100 text-stone-600 border border-stone-200 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md shrink-0">
                        {String(item.color)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-stone-400 mb-2 block">{String(item?.category || 'Uncategorized')}</span>
                  <span className="text-2xl font-black text-pink-600 mb-4">₱{parseFloat(item?.selling_price || 0).toFixed(2)}</span>
                  
                  <div className="mt-auto">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 block">Available Sizes</span>
                    <div className="flex flex-wrap gap-2">
                      {parseSafeArray(item?.sizes).map(s => (
                        <span key={`sz-${s?.size}`} className={`text-xs font-black px-3 py-1.5 rounded-lg border ${s?.quantity > 0 ? 'bg-[#f9f6f0] border-stone-300 text-stone-700' : 'bg-stone-50 border-stone-100 text-stone-300 line-through'}`}>
                          {String(s?.size || 'N/A')}
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
// 2. LOGIN SCREEN (SECURED VIA .ENV & SHOW/HIDE)
// ==========================================
function LoginScreen() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    const securePassword = import.meta.env.VITE_ADMIN_PASSWORD;

    if (securePassword && password === securePassword) {
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
          <div className="relative">
            <input 
              type={showPassword ? "text" : "password"} 
              placeholder="Password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
              className="w-full border border-stone-300 rounded-xl p-3 pr-12 text-center font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-700 text-base select-none transition"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
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
// 3. ADMIN DASHBOARD
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
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [historyFilterDate, setHistoryFilterDate] = useState('');
  const [historyFilterStatus, setHistoryFilterStatus] = useState('All');

  const [zoomedImage, setZoomedImage] = useState(null);
  const [viewPreOrder, setViewPreOrder] = useState(null); 

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
    batch_name: '',
    styles: [
      { id: Date.now(), name: '', category: '', color: '', cost_price: '', selling_price: '', image: null, sizes: { S: 0, M: 0, L: 0, XL: 0 } }
    ]
  });

  const [editGarment, setEditGarment] = useState({
    id: null, batch_name: '', name: '', category: '', color: '', cost_price: '', selling_price: '', image: null, previewUrl: null,
    sizes: { S: 0, M: 0, L: 0, XL: 0 }
  });

  const [newExpense, setNewExpense] = useState({
    title: '', amount: '', date: new Date().toISOString().split('T')[0],
    isDetailed: false, breakdown: [{ name: '', cost: '' }]
  });

  const [editExpense, setEditExpense] = useState({
    id: null, title: '', amount: '', date: '',
    isDetailed: false, breakdown: [{ name: '', cost: '' }]
  });

  const [newPreOrder, setNewPreOrder] = useState({
    customer_name: '', recipient_name: '', contact_number: '', address: '', item_name: '', size: '', color: '', price: '', down_payment: '', is_paid: false, balance: ''
  });

  const [editPreOrder, setEditPreOrder] = useState({
    id: null, customer_name: '', recipient_name: '', contact_number: '', address: '', item_name: '', size: '', color: '', price: '', down_payment: '', is_paid: false, balance: ''
  });

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleLogout = () => {
    localStorage.removeItem('isAdmin');
    navigate('/');
  };

  const openAddBatchWizard = (prefillBatchName = '') => {
    setNewBatch({
      batch_name: prefillBatchName,
      styles: [
        { id: Date.now(), name: '', category: '', color: '', cost_price: '', selling_price: '', image: null, sizes: { S: 0, M: 0, L: 0, XL: 0 } }
      ]
    });
    setShowAddBatchModal(true);
  };

  const fetchData = async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setLoading(true);
    setErrorMessage(null);
    try {
      const garmentsRes = await axios.get(`${API_BASE}garments/`);
      const gData = Array.isArray(garmentsRes.data) ? garmentsRes.data : (garmentsRes.data?.results || []);
      // Safely map data to prevent mapper crashes
      const formattedGarments = (gData || []).map(g => ({
        ...g,
        sizes: parseSafeArray(g?.sizes),
        image: formatImageUrl(g?.image)
      }));
      setGarments(formattedGarments);

      if (productModal.show && productModal.garment) {
        const freshCurrent = formattedGarments.find(g => g?.id === productModal.garment.id);
        if (freshCurrent) setProductModal(prev => ({ ...prev, garment: freshCurrent }));
      }

      await fetchSalesHistory();
      await fetchExpenses();
      await fetchPreOrders();
      if (!isBackgroundRefresh) setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      if (!isBackgroundRefresh) {
        setErrorMessage('Could not connect to Django server. Please ensure the backend is running and the URL is configured.');
        setLoading(false);
      }
    }
  };

  const fetchSalesHistory = async () => {
    try {
      const res = await axios.get(`${API_BASE}sales/history/`);
      setSalesHistory(Array.isArray(res.data) ? res.data : (res.data?.results || []));
    } catch (error) {
      console.error("Failed to load Sales History.", error);
    }
  };

  const fetchExpenses = async () => {
    try {
      const res = await axios.get(`${API_BASE}expenses/`);
      const eData = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      setExpenses(eData.map(e => ({ ...e, breakdown: parseSafeArray(e?.breakdown) })));
    } catch (error) {
      console.error("Failed to load Expenses.", error);
    }
  };

  const fetchPreOrders = async () => {
    try {
      const res = await axios.get(`${API_BASE}preorders/`);
      setPreOrders(Array.isArray(res.data) ? res.data : (res.data?.results || []));
    } catch (error) {
      console.error("Failed to load Pre-orders.", error);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openProductModal = (item, defaultMode = 'sell') => {
    const safeSizes = parseSafeArray(item?.sizes);
    const defaultSize = safeSizes.find(s => s?.quantity > 0)?.size || 'S';
    setProductModal({ show: true, garment: item, mode: defaultMode, size: defaultSize, quantity: 1 });
  };

  const handleSellSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.patch(`${API_BASE}garments/${productModal.garment.id}/update_stock/`, {
        size: productModal.size, change: -Math.abs(productModal.quantity), is_sale: true
      });
      const updatedGarment = { ...response.data, sizes: parseSafeArray(response.data?.sizes), image: formatImageUrl(response.data?.image) };
      setGarments(garments.map(g => g.id === updatedGarment.id ? updatedGarment : g));
      setProductModal({ show: false, garment: null, mode: 'sell', size: 'M', quantity: 1 });
      showToast(`🌸 Sale Recorded! Sold ${productModal.quantity} pc(s) of ${updatedGarment.name} (${productModal.size})`);
      await fetchData(true);
    } catch (error) {
      alert('Could not complete sale. Check stock!');
    }
  };

  const handleRestockSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.patch(`${API_BASE}garments/${productModal.garment.id}/update_stock/`, {
        size: productModal.size, change: Math.abs(productModal.quantity), is_sale: false
      });
      const updatedGarment = { ...response.data, sizes: parseSafeArray(response.data?.sizes), image: formatImageUrl(response.data?.image) };
      setGarments(garments.map(g => g.id === updatedGarment.id ? updatedGarment : g));
      setProductModal(prev => ({ ...prev, garment: updatedGarment, quantity: 1 }));
      showToast(`📦 Restocked! Added ${productModal.quantity} pc(s) to ${updatedGarment.name} (${productModal.size})`);
      await fetchData(true);
    } catch (error) {
      alert('Could not restock item.');
    }
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

  const addStyleToBatch = () => {
    setNewBatch({
      ...newBatch,
      styles: [...newBatch.styles, { id: Date.now(), name: '', category: '', color: '', cost_price: '', selling_price: '', image: null, sizes: { S: 0, M: 0, L: 0, XL: 0 } }]
    });
  };

  const removeStyleFromBatch = (index) => {
    const updatedStyles = newBatch.styles.filter((_, i) => i !== index);
    setNewBatch({ ...newBatch, styles: updatedStyles });
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    try {
      for (const style of newBatch.styles) {
        if (!style.name) continue; 
        
        const batchName = newBatch.batch_name || 'Uncategorized';
        
        const existingGarment = (garments || []).find(g => 
          String(g?.name || '').toLowerCase().trim() === String(style.name || '').toLowerCase().trim() &&
          String(g?.batch_name || 'Uncategorized').toLowerCase().trim() === String(batchName || '').toLowerCase().trim()
        );

        const formData = new FormData();
        formData.append('batch_name', batchName);
        formData.append('name', style.name.trim());

        if (existingGarment) {
          const mergedSizes = { S: 0, M: 0, L: 0, XL: 0 };
          const currentSizeMap = {};
          
          parseSafeArray(existingGarment.sizes).forEach(s => { currentSizeMap[s?.size] = s?.quantity; });
          
          ['S', 'M', 'L', 'XL'].forEach(sizeLabel => {
            mergedSizes[sizeLabel] = (currentSizeMap[sizeLabel] || 0) + parseInt(style.sizes[sizeLabel] || 0);
          });

          formData.append('category', style.category || existingGarment.category || 'Uncategorized');
          formData.append('color', style.color || existingGarment.color || 'N/A');
          formData.append('cost_price', style.cost_price || existingGarment.cost_price);
          formData.append('selling_price', style.selling_price || existingGarment.selling_price);
          formData.append('initial_sizes', JSON.stringify(mergedSizes));
          
          if (style.image) formData.append('image', style.image);

          await axios.patch(`${API_BASE}garments/${existingGarment.id}/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });

        } else {
          formData.append('category', style.category || 'Uncategorized');
          formData.append('color', style.color || 'N/A');
          formData.append('cost_price', style.cost_price || 0);
          formData.append('selling_price', style.selling_price || 0);
          formData.append('initial_sizes', JSON.stringify(style.sizes));
          if (style.image) formData.append('image', style.image);

          await axios.post(`${API_BASE}garments/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        }
      }

      setShowAddBatchModal(false);
      setNewBatch({
        batch_name: '',
        styles: [{ id: Date.now(), name: '', category: '', color: '', cost_price: '', selling_price: '', image: null, sizes: { S: 0, M: 0, L: 0, XL: 0 } }]
      });
      
      showToast(`✨ Successfully imported Batch: ${newBatch.batch_name || 'Uncategorized'}!`);
      await fetchData(true);
    } catch (error) {
      alert('Error uploading batch. Ensure the backend database matches the frontend changes.');
    }
  };

  const openRenameBatchModal = (oldName) => {
    setBatchRenameState({ oldName, newName: oldName });
    setShowRenameBatchModal(true);
  };

  const handleRenameBatchSubmit = async (e) => {
    e.preventDefault();
    const { oldName, newName } = batchRenameState;
    if (!newName.trim() || newName.trim() === oldName) {
      setShowRenameBatchModal(false);
      return;
    }

    try {
      const itemsToUpdate = (garments || []).filter(g => (g?.batch_name || 'Uncategorized') === oldName);
      for (const item of itemsToUpdate) {
        const formData = new FormData();
        formData.append('batch_name', newName.trim());
        await axios.patch(`${API_BASE}garments/${item.id}/`, formData);
      }

      if (selectedBatch === oldName) setSelectedBatch(newName.trim());

      setShowRenameBatchModal(false);
      showToast(`✏️ Batch renamed from "${oldName}" to "${newName.trim()}"!`);
      await fetchData(true);
    } catch (error) {
      alert('Could not rename batch. Please try again.');
    }
  };

  const handleDeleteBatch = async (batchName) => {
    const itemsToDelete = (garments || []).filter(g => (g?.batch_name || 'Uncategorized') === batchName);
    if (!window.confirm(`Are you sure you want to delete "${batchName}"?\n\nThis will permanently delete all ${itemsToDelete.length} item styles inside this batch!`)) return;

    try {
      for (const item of itemsToDelete) {
        await axios.delete(`${API_BASE}garments/${item.id}/`);
      }
      if (selectedBatch === batchName) setSelectedBatch(null);
      showToast(`🗑️ Batch "${batchName}" and all its styles have been removed.`);
      await fetchData(true);
    } catch (error) {
      alert('Could not delete all items in batch.');
    }
  };

  const openEditModal = (item) => {
    const sizeMap = { S: 0, M: 0, L: 0, XL: 0 };
    parseSafeArray(item?.sizes).forEach(s => { sizeMap[s?.size] = s?.quantity; });
    
    setEditGarment({
      id: item.id, batch_name: item.batch_name || '', name: item.name || '', 
      category: item.category || '', color: item.color || '',
      cost_price: item.cost_price || '', selling_price: item.selling_price || '',
      image: null, previewUrl: formatImageUrl(item.image), sizes: sizeMap
    });
    setProductModal({ show: false, garment: null, mode: 'sell', size: 'M', quantity: 1 });
    setShowEditModal(true);
  };

  const handleUpdateGarment = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('batch_name', editGarment.batch_name);
      formData.append('name', editGarment.name);
      formData.append('category', editGarment.category || 'Uncategorized');
      formData.append('color', editGarment.color || 'N/A');
      formData.append('cost_price', editGarment.cost_price);
      formData.append('selling_price', editGarment.selling_price);
      formData.append('initial_sizes', JSON.stringify(editGarment.sizes));
      if (editGarment.image) formData.append('image', editGarment.image);

      await axios.patch(`${API_BASE}garments/${editGarment.id}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setShowEditModal(false);
      showToast("✏️ Style details updated!");
      await fetchData(true);
    } catch (error) {
      alert('Error saving changes. Check your inputs.');
    }
  };

  const handleDeleteGarment = async (id) => {
    if (!window.confirm("Are you sure you want to delete this style? All remaining stock for this item will be removed.")) return;
    try {
      await axios.delete(`${API_BASE}garments/${id}/`);
      setShowEditModal(false);
      setProductModal({ show: false, garment: null, mode: 'sell', size: 'M', quantity: 1 });
      showToast("🗑️ Garment style removed.");
      await fetchData(true);
    } catch (error) {
      alert('Could not delete garment. Please try again.');
    }
  };

  const handleFactoryReset = async () => {
    const confirmText = window.prompt('⚠️ WARNING: This will permanently delete ALL data including Batches, Garments, Pre-orders, Expenses, and Sales History.\n\nType "DELETE" to confirm:');
    if (confirmText === 'DELETE') {
      setLoading(true);
      try {
        for (const g of garments) await axios.delete(`${API_BASE}garments/${g?.id}/`);
        for (const p of preOrders) await axios.delete(`${API_BASE}preorders/${p?.id}/`);
        for (const e of expenses) await axios.delete(`${API_BASE}expenses/${e?.id}/`);
        for (const s of salesHistory) await axios.delete(`${API_BASE}sales/history/${s?.id}/`);
        
        setActiveTab('inventory');
        showToast("🧨 All data has been completely wiped. Fresh start!");
        await fetchData(true);
      } catch (error) {
        alert('Error wiping data. Check connection.');
      }
      setLoading(false);
    }
  };

  const handleBreakdownChange = (index, field, value) => {
    const updated = [...newExpense.breakdown];
    updated[index][field] = value;
    const totalSum = updated.reduce((sum, item) => sum + (parseFloat(item?.cost) || 0), 0);
    setNewExpense({ ...newExpense, breakdown: updated, amount: totalSum > 0 ? totalSum.toFixed(2) : '' });
  };
  const addBreakdownRow = () => setNewExpense({ ...newExpense, breakdown: [...newExpense.breakdown, { name: '', cost: '' }] });
  const removeBreakdownRow = (index) => {
    const updated = newExpense.breakdown.filter((_, i) => i !== index);
    const totalSum = updated.reduce((sum, item) => sum + (parseFloat(item?.cost) || 0), 0);
    setNewExpense({ ...newExpense, breakdown: updated.length ? updated : [{ name: '', cost: '' }], amount: totalSum > 0 ? totalSum.toFixed(2) : '' });
  };
  const handleCreateExpense = async (e) => {
    e.preventDefault();
    try {
      const validBreakdown = newExpense.isDetailed ? newExpense.breakdown.filter(b => String(b?.name || '').trim() !== '' && (parseFloat(b?.cost) || 0) > 0) : [];
      await axios.post(`${API_BASE}expenses/`, { title: newExpense.title, amount: newExpense.amount, date: newExpense.date, breakdown: validBreakdown });
      setShowExpenseModal(false);
      setNewExpense({ title: '', amount: '', date: new Date().toISOString().split('T')[0], isDetailed: false, breakdown: [{ name: '', cost: '' }] });
      showToast("📈 Batch expense recorded!");
      await fetchData(true);
    } catch (error) { alert('Could not save expense.'); }
  };

  const openEditExpenseModal = (item) => {
    const breakdownList = parseSafeArray(item?.breakdown).length > 0 ? parseSafeArray(item.breakdown) : [{ name: '', cost: '' }];
    setEditExpense({ id: item.id, title: item.title || '', amount: item.amount || '', date: item.date || new Date().toISOString().split('T')[0], isDetailed: parseSafeArray(item.breakdown).length > 0, breakdown: breakdownList });
    setShowEditExpenseModal(true);
  };
  const handleEditBreakdownChange = (index, field, value) => {
    const updated = [...editExpense.breakdown];
    updated[index][field] = value;
    const totalSum = updated.reduce((sum, item) => sum + (parseFloat(item?.cost) || 0), 0);
    setEditExpense({ ...editExpense, breakdown: updated, amount: totalSum > 0 ? totalSum.toFixed(2) : '' });
  };
  const addEditBreakdownRow = () => setEditExpense({ ...editExpense, breakdown: [...editExpense.breakdown, { name: '', cost: '' }] });
  const removeEditBreakdownRow = (index) => {
    const updated = editExpense.breakdown.filter((_, i) => i !== index);
    const totalSum = updated.reduce((sum, item) => sum + (parseFloat(item?.cost) || 0), 0);
    setEditExpense({ ...editExpense, breakdown: updated.length ? updated : [{ name: '', cost: '' }], amount: totalSum > 0 ? totalSum.toFixed(2) : '' });
  };
  const handleUpdateExpense = async (e) => {
    e.preventDefault();
    try {
      const validBreakdown = editExpense.isDetailed ? editExpense.breakdown.filter(b => String(b?.name || '').trim() !== '' && (parseFloat(b?.cost) || 0) > 0) : [];
      await axios.patch(`${API_BASE}expenses/${editExpense.id}/`, { title: editExpense.title, amount: editExpense.amount, date: editExpense.date, breakdown: validBreakdown });
      setShowEditExpenseModal(false);
      showToast("✏️ Expense updated!");
      await fetchData(true);
    } catch (error) { alert('Could not update expense.'); }
  };
  const handleDeleteExpense = async (id) => {
    if (!window.confirm("Remove this recorded expense?")) return;
    try { await axios.delete(`${API_BASE}expenses/${id}/`); setShowEditExpenseModal(false); showToast("🗑️ Expense removed."); await fetchData(true); } catch (error) { alert('Could not delete expense.'); }
  };
  
  // ==========================================
  // PRE-ORDERS
  // ==========================================
  const handleCreatePreOrder = async (e) => {
    e.preventDefault();
    try {
      const orderPayload = {
        ...newPreOrder,
        color: !newPreOrder.color || newPreOrder.color.trim() === '' ? 'N/A' : newPreOrder.color,
        recipient_name: newPreOrder.recipient_name || '', 
        contact_number: newPreOrder.contact_number || '', 
        address: newPreOrder.address || ''
      };
      await axios.post(`${API_BASE}preorders/`, orderPayload);

      const targetGarment = (garments || []).find(g => g?.name === newPreOrder.item_name);
      if (targetGarment && newPreOrder.size) {
        await axios.patch(`${API_BASE}garments/${targetGarment.id}/update_stock/`, {
          size: newPreOrder.size, change: -1, is_sale: false 
        });
      }

      setShowPreOrderModal(false);
      setNewPreOrder({ customer_name: '', recipient_name: '', contact_number: '', address: '', item_name: '', size: '', color: '', price: '', down_payment: '', is_paid: false, balance: '' });
      showToast("📝 Pre-order added & stock deducted!");
      await fetchData(true);
    } catch (error) { 
        alert(`Django Error creating pre-order:\n${JSON.stringify(error.response?.data || error.message)}`); 
    }
  };

  const openEditPreOrderModal = (item) => {
    setEditPreOrder({ 
      id: item.originalId || item.id, // Grab true database ID directly
      customer_name: item.customer_name || '', 
      recipient_name: item.recipient_name || '', 
      contact_number: item.contact_number || '', 
      address: item.address || '', 
      item_name: item.item_name || item.name || '', // Safe fallback
      size: item.size || '', 
      color: !item.color || item.color === 'N/A' ? '' : item.color, 
      price: item.price || '', 
      down_payment: item.down_payment || '', 
      is_paid: item.is_paid || false, 
      balance: item.balance || '' 
    });
    setShowEditPreOrderModal(true);
  };

  const handleUpdatePreOrder = async (e) => {
    e.preventDefault();
    try {
      const oldOrder = (preOrders || []).find(o => o?.id === editPreOrder.id);
      if (oldOrder) {
        if (oldOrder.item_name !== editPreOrder.item_name || oldOrder.size !== editPreOrder.size) {
          const oldGarment = (garments || []).find(g => g?.name === oldOrder.item_name);
          if (oldGarment && oldOrder.size) {
            await axios.patch(`${API_BASE}garments/${oldGarment.id}/update_stock/`, { size: oldOrder.size, change: 1, is_sale: false });
          }
          const newGarment = (garments || []).find(g => g?.name === editPreOrder.item_name);
          if (newGarment && editPreOrder.size) {
            await axios.patch(`${API_BASE}garments/${newGarment.id}/update_stock/`, { size: editPreOrder.size, change: -1, is_sale: false });
          }
        }
      }

      const orderPayload = {
        ...editPreOrder,
        color: !editPreOrder.color || editPreOrder.color.trim() === '' ? 'N/A' : editPreOrder.color,
        recipient_name: editPreOrder.recipient_name || '',
        contact_number: editPreOrder.contact_number || '',
        address: editPreOrder.address || ''
      };

      await axios.patch(`${API_BASE}preorders/${editPreOrder.id}/`, orderPayload);
      setShowEditPreOrderModal(false);
      showToast("✏️ Pre-order & stocks updated!");
      await fetchData(true);
    } catch (error) { 
        alert(`Django Error updating pre-order:\n${JSON.stringify(error.response?.data || error.message)}`); 
    }
  };

  const handleDeletePreOrder = async (id) => {
    if (!window.confirm("Delete this pre-order?")) return;
    try { await axios.delete(`${API_BASE}preorders/${id}/`); showToast("🗑️ Pre-order removed."); await fetchData(true); } catch (error) { alert('Could not delete pre-order.'); }
  };

  // ==========================================
  // SALES HISTORY & LEDGER
  // ==========================================
  const handleDeleteSalesHistory = async (id) => {
    if (!window.confirm("Delete this specific sales record? The sold items will be returned to your inventory stock.")) return;
    try {
      const logToRevert = (salesHistory || []).find(s => s?.id === id);
      if (logToRevert) {
        const targetGarment = (garments || []).find(g => g?.name === logToRevert.garment_name);
        if (targetGarment) {
          await axios.patch(`${API_BASE}garments/${targetGarment.id}/update_stock/`, {
            size: logToRevert.size, change: logToRevert.quantity_sold, is_sale: false
          });
        }
      }

      await axios.delete(`${API_BASE}sales/history/${id}/`);
      showToast("🗑️ Sales record deleted & stock restored.");
      await fetchData(true);
    } catch (error) { 
      alert('Could not delete sales record.'); 
    }
  };

  const handleClearAllHistory = async () => {
    if (!window.confirm("Are you sure you want to COMPLETELY clear the Sales Ledger?\n\nThis will delete all recorded regular sales and RETURN the sold items back to your stock.")) return;
    setLoading(true);
    try {
      for (const log of (salesHistory || [])) {
        if (!log) continue;
        const targetGarment = (garments || []).find(g => g?.name === log.garment_name);
        if (targetGarment) {
          await axios.patch(`${API_BASE}garments/${targetGarment.id}/update_stock/`, {
            size: log.size, change: log.quantity_sold, is_sale: false
          });
        }
        await axios.delete(`${API_BASE}sales/history/${log.id}/`);
      }
      showToast("🗑️ Entire Sales Ledger cleared & stocks restored!");
      await fetchData(true);
    } catch (error) { 
      alert('Error clearing some records.'); 
    }
    setLoading(false);
  };

  const handleUpdateFulfillmentStatus = async (isPreOrder, originalId, newStatus) => {
    if (isPreOrder) {
      setPreOrders(prev => (prev || []).map(p => p?.id === originalId ? { ...p, status: newStatus } : p));
    } else {
      setSalesHistory(prev => (prev || []).map(s => s?.id === originalId ? { ...s, status: newStatus } : s));
    }

    try {
      const endpoint = isPreOrder ? `${API_BASE}preorders/${originalId}/` : `${API_BASE}sales/history/${originalId}/`;
      await axios.patch(endpoint, { status: newStatus });
      showToast(`📦 Order marked as ${newStatus}!`);
      await fetchData(true);
    } catch (error) {
      alert(`Django Backend Error: Could not save status.\n\n${JSON.stringify(error.response?.data || error.message)}`);
      await fetchData(true);
    }
  };

  // ==========================================
  // COMBINED SALES LEDGER & PRE-ORDERS MAPPING
  // ==========================================
  
  const categories = ['All', ...new Set((garments || []).map(g => String(g?.category || 'Uncategorized')))];

  let localSalesHistory = Array.isArray(salesHistory) ? [...salesHistory] : [];
  
  // SECURE DATA MAPPER FOR PRE-ORDERS
  const mappedPreOrders = (preOrders || []).filter(o => o).map(order => {
    const matchIndex = localSalesHistory.findIndex(s => s && s.garment_name === order?.item_name && s.size === order?.size);
    if (matchIndex !== -1) {
      localSalesHistory.splice(matchIndex, 1);
    }
    
    return { 
      id: `preorder-${order?.id}`, 
      originalId: order?.id,
      isPreOrder: true, 
      date: order?.order_date ? String(order.order_date) : '', 
      name: order?.item_name ? String(order.item_name) : '',
      customer_name: order?.customer_name ? String(order.customer_name) : 'Unnamed',
      recipient_name: order?.recipient_name ? String(order.recipient_name) : '',
      contact_number: order?.contact_number ? String(order.contact_number) : '',
      address: order?.address ? String(order.address) : '',
      item_name: order?.item_name ? String(order.item_name) : '', 
      size: order?.size ? String(order.size) : '', 
      color: order?.color ? String(order.color) : '', 
      qty: 1, 
      price: parseFloat(order?.price) || 0,
      down_payment: parseFloat(order?.down_payment) || 0,
      earned: (parseFloat(order?.price) || 0) - (parseFloat(order?.balance) || 0),
      balance: parseFloat(order?.balance) || 0,
      is_paid: order?.is_paid || false,
      status: order?.status ? String(order.status) : 'Pending'
    };
  });

  // SECURE DATA MAPPER FOR NORMAL SALES
  const mappedSales = localSalesHistory.filter(s => s).map(log => ({
    id: `sale-${log?.id}`,
    originalId: log?.id,
    isPreOrder: false,
    date: log?.sold_at ? String(log.sold_at) : '',
    name: log?.garment_name ? String(log.garment_name) : '',
    customer_name: '',
    recipient_name: '',
    contact_number: '',
    address: '',
    item_name: '',
    size: log?.size ? String(log.size) : '',
    qty: parseFloat(log?.quantity_sold) || 0,
    earned: parseFloat(log?.profit_earned) || 0,
    status: log?.status ? String(log.status) : 'Pending'
  }));

  const unifiedHistory = [...mappedSales, ...mappedPreOrders].sort((a, b) => {
    const timeA = new Date(a?.date || 0).getTime();
    const timeB = new Date(b?.date || 0).getTime();
    return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
  });

  const filteredUnifiedHistory = unifiedHistory.filter(log => {
    if (!log) return false;
    const matchDate = historyFilterDate ? log.date === historyFilterDate : true;
    const matchStatus = historyFilterStatus === 'All' ? true : (log.status || 'Pending') === historyFilterStatus;
    return matchDate && matchStatus;
  });

  const historyTotalEarned = filteredUnifiedHistory.reduce((sum, log) => sum + (parseFloat(log?.earned) || 0), 0);
  const historyTotalPieces = filteredUnifiedHistory.reduce((sum, log) => sum + (parseFloat(log?.qty) || 0), 0);

  const dailyHistory = unifiedHistory.filter(log => log?.date === selectedDate);
  const dailyStats = { 
    total_pieces_sold: dailyHistory.reduce((sum, log) => sum + (parseFloat(log?.qty) || 0), 0), 
    total_profit_earned: dailyHistory.reduce((sum, log) => sum + (parseFloat(log?.earned) || 0), 0) 
  };

  const totalStoreProfit = (garments || []).reduce((sum, item) => sum + (parseFloat(item?.total_potential_profit) || 0), 0);
  const totalStorePieces = (garments || []).reduce((sum, item) => sum + (parseFloat(item?.total_pieces) || 0), 0);

  const filteredGarments = (garments || [])
    .filter(item => {
      if (!item) return false;
      const searchLower = String(searchQuery || '').toLowerCase();
      const matchesSearch = String(item.name || '').toLowerCase().includes(searchLower) || 
                            String(item.batch_name || '').toLowerCase().includes(searchLower);
      const matchesCategory = activeCategory === 'All' || (item.category || 'Uncategorized') === activeCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

  const totalGrossSalesProfit = unifiedHistory.reduce((sum, log) => sum + (parseFloat(log?.earned) || 0), 0);
  const totalBatchExpenses = (expenses || []).reduce((sum, item) => sum + (parseFloat(item?.amount) || 0), 0);
  const actualNetProfit = totalGrossSalesProfit - totalBatchExpenses;

  const batchMap = {};
  (garments || []).forEach(g => {
    if (!g) return;
    const bName = String(g.batch_name || 'Uncategorized');
    if (!batchMap[bName]) {
      batchMap[bName] = { name: bName, pieces_left: 0, potential_profit: 0, styles_count: 0 };
    }
    batchMap[bName].pieces_left += (parseFloat(g.total_pieces) || 0);
    batchMap[bName].potential_profit += (parseFloat(g.total_potential_profit) || 0);
    batchMap[bName].styles_count += 1;
  });
  const batchTrackerData = Object.values(batchMap).sort((a, b) => parseFloat(b?.pieces_left || 0) - parseFloat(a?.pieces_left || 0));

  const uniqueGarmentNames = Array.from(new Set((garments || []).filter(g => g).map(g => String(g.name || ''))));

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-rose-50 flex flex-col items-center justify-center p-6 text-center font-sans">
        <span className="text-6xl mb-4">🌸</span>
        <h2 className="text-2xl font-bold text-rose-800 mb-2">Connection Error</h2>
        <p className="text-rose-600 max-w-md mb-6">{String(errorMessage)}</p>
        <button onClick={() => window.location.reload()} className="bg-pink-600 hover:bg-pink-700 text-white font-bold px-6 py-2.5 rounded-xl shadow">Retry Connection</button>
      </div>
    );
  }

  if (loading) return <div className="p-8 text-center text-lg font-semibold text-stone-600 bg-[#f9f6f0] min-h-screen flex items-center justify-center font-sans">🌸 Loading Fleurette Collection...</div>;

  return (
    <div className="min-h-screen bg-[#f9f6f0] text-stone-800 flex flex-col md:flex-row relative font-sans">
      
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-pink-600 text-white px-6 py-3.5 rounded-2xl shadow-2xl font-black text-sm md:text-base border-2 border-pink-400 flex items-center gap-3 animate-bounce">
          <span>{String(toastMessage)}</span>
          <button onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white font-bold ml-2">✖</button>
        </div>
      )}

      {/* ========================================== */}
      {/* 1. LIGHT KHAKI SIDEBAR                     */}
      {/* ========================================== */}
      <aside className="w-full md:w-64 bg-[#eae4dc] text-stone-900 p-6 flex flex-col justify-between shrink-0 md:h-screen md:sticky md:top-0 z-30 shadow-xl border-r border-[#ddd5cc]">
        <div>
          <div className="flex items-center gap-3 mb-8 pb-4 border-b border-[#ddd5cc]">
            <span className="text-3xl">🌸</span>
            <div>
              <h1 className="font-black text-lg tracking-tight leading-none text-stone-900">FLEURETTE</h1>
              <span className="text-[10px] uppercase tracking-widest text-pink-700 font-extrabold">Boutique POS</span>
            </div>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-600 mb-3 px-2">Collection Menu</p>
          <div className="space-y-2">
            <button
              onClick={() => { setActiveTab('inventory'); setSelectedBatch(null); }}
              className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-3 ${
                activeTab === 'inventory' ? 'bg-pink-600 text-white shadow-lg shadow-pink-950/20 font-extrabold' : 'text-stone-800 hover:bg-[#ded6cc] hover:text-stone-950'
              }`}
            >
              <span className="text-lg">🛍️</span> Product Gallery
            </button>
            <button
              onClick={() => { setActiveTab('history'); setSelectedBatch(null); }}
              className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-3 ${
                activeTab === 'history' ? 'bg-pink-600 text-white shadow-lg shadow-pink-950/20 font-extrabold' : 'text-stone-800 hover:bg-[#ded6cc] hover:text-stone-950'
              }`}
            >
              <span className="text-lg">📜</span> Sales Ledger
            </button>
            <button
              onClick={() => { setActiveTab('analytics'); setSelectedBatch(null); }}
              className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-3 ${
                activeTab === 'analytics' ? 'bg-pink-600 text-white shadow-lg shadow-pink-950/20 font-extrabold' : 'text-stone-800 hover:bg-[#ded6cc] hover:text-stone-950'
              }`}
            >
              <span className="text-lg">📈</span> Net Profit Analytics
            </button>
            <button
              onClick={() => { setActiveTab('preorders'); setSelectedBatch(null); }}
              className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-3 ${
                activeTab === 'preorders' ? 'bg-pink-600 text-white shadow-lg shadow-pink-950/20 font-extrabold' : 'text-stone-800 hover:bg-[#ded6cc] hover:text-stone-950'
              }`}
            >
              <span className="text-lg">📝</span> Custom Pre-Orders
            </button>

            <button
              onClick={() => { setActiveTab('batches'); setSelectedBatch(null); }}
              className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-3 mt-4 border ${
                activeTab === 'batches' ? 'bg-white text-stone-900 shadow-md border-stone-200 font-black' : 'text-stone-700 hover:bg-white hover:shadow-sm border-transparent'
              }`}
            >
              <span className="text-lg">📊</span> Batch Tracker
            </button>
          </div>
        </div>

        <div className="pt-6 border-t border-[#ddd5cc] mt-6 flex flex-col gap-2">
          <button 
            onClick={() => openAddBatchWizard('')}
            className="w-full bg-stone-900 hover:bg-black text-white font-black py-3 px-4 rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2 text-sm"
          >
            <span className="text-lg leading-none">📦</span> Import New Batch
          </button>
          <button 
            onClick={handleLogout}
            className="w-full bg-[#ded6cc] hover:bg-stone-300 text-stone-700 font-bold py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2 text-xs"
          >
            Log Out
          </button>

          {/* CLEAR ALL / FACTORY RESET BUTTON */}
          <button 
            onClick={handleFactoryReset}
            className="w-full mt-4 bg-transparent border-2 border-rose-300 hover:bg-rose-100 hover:border-rose-400 text-rose-600 font-black py-2 px-4 rounded-xl transition flex items-center justify-center gap-2 text-xs"
          >
            <span className="text-sm">🧨</span> Factory Reset
          </button>
        </div>
      </aside>

      {/* ========================================== */}
      {/* 2. MAIN WORKSPACE                          */}
      {/* ========================================== */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto min-w-0">
        
        {/* TAB 1: PRODUCT GALLERY VIEW */}
        {activeTab === 'inventory' && (
          <div className="animate-fade-in max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">Fleurette Catalog &amp; Gallery</h2>
                <p className="text-stone-500 text-sm mt-0.5">Click any garment card to open the Boutique Showcase &amp; POS checkout</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">🔍</span>
                  <input type="text" placeholder="Search styles..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-8 py-2 bg-white border border-stone-300 rounded-xl text-sm font-bold text-stone-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-500" />
                  {searchQuery && (<button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-stone-400 hover:text-stone-600 font-bold text-sm" title="Clear search">✖</button>)}
                </div>
                <span className="bg-[#e6dece] text-stone-800 text-xs font-black px-3.5 py-2 rounded-xl shrink-0 hidden md:inline-block">{filteredGarments.length} Styles</span>
              </div>
            </div>

            {/* ADMIN CATEGORY TABS */}
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {categories.map(cat => (
                  <button
                    key={String(cat)}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-2 rounded-full text-xs font-black tracking-wider uppercase transition shadow-sm border ${
                      activeCategory === cat ? 'bg-stone-800 text-white border-stone-800 scale-105' : 'bg-[#eae4dc] text-stone-600 border-transparent hover:bg-stone-300'
                    }`}
                  >
                    {String(cat)}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-[#eae4dc] text-stone-900 rounded-3xl p-6 shadow-md border border-[#ddd5cc] relative overflow-hidden flex flex-col justify-between">
                <div className="absolute -right-4 -bottom-6 text-stone-900/10 text-9xl font-black pointer-events-none">₱</div>
                <div>
                  <span className="text-xs text-pink-800 block uppercase font-extrabold tracking-widest mb-1">Total Active Collection</span>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-3xl sm:text-4xl font-black text-stone-900">{totalStorePieces}</span>
                    <span className="text-stone-700 font-bold text-sm">garments in boutique</span>
                  </div>
                </div>
                <div className="border-t border-[#ddd5cc] pt-3 flex justify-between items-end">
                  <div>
                    <span className="text-[11px] text-stone-700 block uppercase font-extrabold tracking-widest mb-0.5">Expected Potential Profit</span>
                    <span className="text-2xl font-black text-pink-800">₱{totalStoreProfit.toFixed(2)}</span>
                  </div>
                  <span className="text-xl">🌸</span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-pink-900 to-[#52453c] text-white rounded-3xl p-6 shadow-xl border border-pink-800/50 flex flex-col justify-between">
                <div className="flex justify-between items-center border-b border-white/10 pb-2.5 mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-pink-300 flex items-center gap-1.5"><span>📅</span> Daily Boutique Sales</span>
                  <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="text-xs font-bold bg-black/40 border border-white/20 rounded-lg px-2.5 py-1 text-white focus:outline-none focus:ring-2 focus:ring-pink-400" />
                </div>
                <div className="grid grid-cols-2 gap-4 py-1">
                  <div>
                    <span className="text-[11px] text-stone-300 block font-bold uppercase tracking-wider mb-0.5">Pieces Sold Today</span>
                    <span className="text-2xl sm:text-3xl font-black text-white">{dailyStats.total_pieces_sold} <span className="text-xs font-normal text-stone-300">sold</span></span>
                  </div>
                  <div className="border-l border-white/10 pl-4">
                    <span className="text-[11px] text-pink-300 block font-bold uppercase tracking-wider mb-0.5">Revenue Earned Today</span>
                    <span className="text-2xl sm:text-3xl font-black text-pink-400">₱{dailyStats.total_profit_earned.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {filteredGarments.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-stone-200 max-w-xl mx-auto my-12 shadow-sm">
                <span className="text-5xl block mb-3">🌸</span>
                <h3 className="text-lg font-bold text-stone-800 mb-1">No Styles Found</h3>
                <p className="text-stone-500 text-sm mb-6">We couldn't find any Fleurette style matching your search.</p>
                <button onClick={() => { setSearchQuery(''); setActiveCategory('All'); }} className="bg-pink-600 hover:bg-pink-700 text-white font-bold px-6 py-2.5 rounded-xl shadow transition">Clear Search</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredGarments.map((item) => (
                  <div key={`adm-${item?.id}`} onClick={() => openProductModal(item, 'sell')} className="bg-white rounded-3xl shadow-sm hover:shadow-xl border border-stone-200/80 transition duration-300 overflow-hidden flex flex-col group cursor-pointer relative">
                    <div className="relative h-64 bg-[#f2ece4] overflow-hidden shrink-0 flex items-center justify-center pt-2">
                      {item?.image ? (<img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />) : (<span className="text-6xl text-stone-300 select-none">👗</span>)}
                      <div className="absolute bottom-3 right-3 bg-[#eae4dc]/90 backdrop-blur-md text-stone-900 px-3 py-1 rounded-full text-xs font-black shadow-md">{item?.total_pieces} pcs left</div>
                    </div>
                    <div className="p-5 flex flex-col justify-between flex-1">
                      <div>
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-black text-lg text-stone-900 leading-tight pr-2 group-hover:text-pink-600 transition">{String(item?.name || 'Unnamed')}</h3>
                          {item?.color && item.color !== 'N/A' && (
                            <span className="bg-stone-100 text-stone-600 border border-stone-200 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md shrink-0">
                              {String(item.color)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-bold text-stone-400 mb-2 block">{String(item?.category || 'Uncategorized')}</span>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-2xl font-black text-stone-900">₱{parseFloat(item?.selling_price || 0).toFixed(2)}</span>
                          <span className="text-xs font-bold text-stone-400 line-through">₱{parseFloat(item?.cost_price || 0).toFixed(2)}</span>
                        </div>
                        <span className="inline-block bg-pink-100 text-pink-800 text-[11px] font-black px-2.5 py-0.5 rounded-md mt-1.5">+₱{parseFloat(item?.profit_per_piece || 0).toFixed(2)} profit / ea</span>
                      </div>
                      <div className="mt-4 pt-3 border-t border-stone-100 grid grid-cols-4 gap-1">
                        {parseSafeArray(item?.sizes).map((s) => (
                          <div key={`szi-${s?.size}`} className={`text-center py-1 rounded border text-[11px] font-black ${s?.quantity > 0 ? 'bg-[#f9f6f0] text-stone-700 border-stone-200' : 'bg-red-50 text-red-500 border-red-200 opacity-60'}`}>{String(s?.size || '')}: {s?.quantity}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: BATCH TRACKER VIEW */}
        {activeTab === 'batches' && (
          <div className="animate-fade-in max-w-7xl mx-auto">
            
            {selectedBatch ? (
              <div className="animate-fade-in">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-stone-200">
                  <div>
                    <button 
                      onClick={() => setSelectedBatch(null)} 
                      className="text-pink-700 hover:text-pink-900 font-black text-sm mb-1.5 flex items-center gap-2 transition"
                    >
                      <span>⬅</span> Back to All Batches
                    </button>
                    <h2 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">Batch: {String(selectedBatch)}</h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button 
                      onClick={() => openAddBatchWizard(selectedBatch)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold px-4 py-2 rounded-xl text-xs shadow transition flex items-center gap-1.5"
                    >
                      <span>➕</span> Add New Styles
                    </button>
                    <button 
                      onClick={() => openRenameBatchModal(selectedBatch)}
                      className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold px-4 py-2 rounded-xl text-xs shadow transition flex items-center gap-1.5"
                    >
                      <span>✏️</span> Rename Batch
                    </button>
                    <button 
                      onClick={() => handleDeleteBatch(selectedBatch)}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-extrabold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5"
                    >
                      <span>🗑️</span> Delete Entire Batch
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {(garments || [])
                    .filter(g => g && String(g.batch_name || 'Uncategorized') === String(selectedBatch))
                    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
                    .map((item) => (
                    <div key={`btch-${item?.id}`} className="bg-white rounded-3xl shadow-sm hover:shadow-xl border border-stone-200/80 transition duration-300 overflow-hidden flex flex-col group relative">
                      
                      <div onClick={() => openProductModal(item, 'sell')} className="relative h-64 bg-[#f2ece4] overflow-hidden shrink-0 flex items-center justify-center pt-2 cursor-pointer">
                        {item?.image ? (<img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />) : (<span className="text-6xl text-stone-300 select-none">👗</span>)}
                        <div className="absolute bottom-3 right-3 bg-[#eae4dc]/90 backdrop-blur-md text-stone-900 px-3 py-1 rounded-full text-xs font-black shadow-md">{item?.total_pieces} pcs left</div>
                      </div>

                      <div className="p-5 flex flex-col justify-between flex-1">
                        <div onClick={() => openProductModal(item, 'sell')} className="cursor-pointer">
                          <div className="flex justify-between items-start mb-1">
                            <h3 className="font-black text-lg text-stone-900 leading-tight group-hover:text-pink-600 transition pr-2">{String(item?.name || 'Unnamed')}</h3>
                            {item?.color && item.color !== 'N/A' && (
                              <span className="bg-stone-100 text-stone-600 border border-stone-200 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md shrink-0">
                                {String(item.color)}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-stone-400 mb-2 block">{String(item?.category || 'Uncategorized')}</span>
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-2xl font-black text-stone-900">₱{parseFloat(item?.selling_price || 0).toFixed(2)}</span>
                            <span className="text-xs font-bold text-stone-400 line-through">₱{parseFloat(item?.cost_price || 0).toFixed(2)}</span>
                          </div>
                          <span className="inline-block bg-pink-100 text-pink-800 text-[11px] font-black px-2.5 py-0.5 rounded-md mt-1.5">+₱{parseFloat(item?.profit_per_piece || 0).toFixed(2)} profit / ea</span>
                        </div>

                        <div className="mt-4 pt-3 border-t border-stone-100 grid grid-cols-4 gap-1 mb-4">
                          {parseSafeArray(item?.sizes).map((s) => (
                            <div key={`bsz-${s?.size}`} className={`text-center py-1 rounded border text-[11px] font-black ${s?.quantity > 0 ? 'bg-[#f9f6f0] text-stone-700 border-stone-200' : 'bg-red-50 text-red-500 border-red-200 opacity-60'}`}>{String(s?.size || '')}: {s?.quantity}</div>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-stone-100 flex gap-2">
                          <button 
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-extrabold py-2 rounded-xl text-xs transition flex items-center justify-center gap-1"
                          >
                            <span>✏️</span> Edit
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleDeleteGarment(item.id)}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-extrabold py-2 px-3 rounded-xl text-xs transition flex items-center justify-center"
                            title="Delete this style"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">Active Batch Tracker</h2>
                    <p className="text-stone-500 text-sm mt-1">Click a batch to view its items, or manage and delete batches below</p>
                  </div>
                  <button 
                    onClick={() => openAddBatchWizard('')}
                    className="bg-stone-900 hover:bg-black text-white font-black px-5 py-2.5 rounded-xl shadow-md transition active:scale-95 flex items-center gap-2 text-sm shrink-0"
                  >
                    <span className="text-lg leading-none">📦</span> Import New Batch
                  </button>
                </div>

                {batchTrackerData.length === 0 ? (
                  <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-stone-200 max-w-xl mx-auto my-12 shadow-sm">
                    <span className="text-5xl block mb-3">📦</span>
                    <h3 className="text-lg font-bold text-stone-800 mb-1">No Batches Tracked</h3>
                    <p className="text-stone-500 text-sm mb-6">You haven't assigned any styles to a batch yet. Click "Import New Batch" to group styles together.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batchTrackerData.map((batch, index) => (
                      <div 
                        key={`btd-${index}`} 
                        className="bg-white rounded-3xl p-6 shadow-sm border border-stone-200 flex flex-col justify-between hover:shadow-xl hover:border-pink-300 transition group"
                      >
                        <div onClick={() => setSelectedBatch(batch.name)} className="cursor-pointer">
                          <div className="flex justify-between items-start mb-4">
                            <span className="bg-stone-100 text-stone-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded border border-stone-200 group-hover:bg-pink-50 transition">
                              {batch?.styles_count} Styles Inside
                            </span>
                            {batch?.pieces_left === 0 && <span className="bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded border border-red-200">Sold Out</span>}
                          </div>
                          <h3 className="text-xl font-black text-stone-900 leading-tight mb-6 group-hover:text-pink-600 transition">{String(batch?.name || 'Unnamed')}</h3>
                          
                          <div className="space-y-4 mb-6">
                            <div>
                              <span className="text-xs font-bold text-stone-400 uppercase block mb-0.5">Total Pieces Remaining</span>
                              <span className="text-3xl font-black text-stone-900">{batch?.pieces_left} <span className="text-sm font-bold text-stone-400">pcs</span></span>
                            </div>
                            <div>
                              <span className="text-xs font-bold text-stone-400 uppercase block mb-0.5">Potential Profit Left</span>
                              <span className="text-2xl font-black text-pink-600">₱{parseFloat(batch?.potential_profit || 0).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-stone-100 flex gap-2">
                          <button 
                            type="button" 
                            onClick={() => setSelectedBatch(batch.name)}
                            className="flex-1 bg-[#f2ece4] hover:bg-[#eae4dc] text-stone-800 font-extrabold py-2 rounded-xl text-xs transition text-center"
                          >
                            👁️ View Items
                          </button>
                          <button 
                            type="button" 
                            onClick={() => openRenameBatchModal(batch.name)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-extrabold py-2 px-3 rounded-xl text-xs transition"
                            title="Rename batch"
                          >
                            ✏️
                          </button>
                          <button 
                            type="button" 
                            onClick={() => handleDeleteBatch(batch.name)}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-extrabold py-2 px-3 rounded-xl text-xs transition"
                            title="Delete whole batch"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: UNIFIED SALES HISTORY LOG VIEW (UPDATED) */}
        {activeTab === 'history' && (
          <div className="animate-fade-in max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">Fleurette Sales Ledger</h2>
                <p className="text-stone-500 text-sm mt-1">Every recorded transaction and collected pre-order revenue</p>
              </div>
              <div className="flex items-center gap-2">
                {/* CLEAR ALL HISTORY BUTTON */}
                <button 
                  onClick={handleClearAllHistory} 
                  className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-extrabold px-4 py-2 rounded-xl text-xs border border-rose-200 transition h-[38px] flex items-center gap-1"
                >
                  <span>🗑️</span> Clear Ledger
                </button>
                
                {/* STATUS FILTER DROPDOWN */}
                <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-stone-200 h-[38px]">
                  <span className="text-xs font-extrabold text-stone-400 pl-2 uppercase">Status:</span>
                  <select 
                    value={historyFilterStatus} 
                    onChange={(e) => setHistoryFilterStatus(e.target.value)}
                    className="text-sm font-bold bg-[#f9f6f0] border border-stone-200 rounded-lg px-2 py-1 text-stone-800 focus:outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
                  >
                    <option value="All">All</option>
                    <option value="Pending">Pending</option>
                    <option value="Shipped">Shipped</option>
                    <option value="Received">Received</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-stone-200 h-[38px]">
                  <span className="text-xs font-extrabold text-stone-400 pl-2 uppercase">Filter Date:</span>
                  <input type="date" value={historyFilterDate} onChange={(e) => setHistoryFilterDate(e.target.value)} className="text-sm font-bold bg-[#f9f6f0] border border-stone-200 rounded-lg px-3 py-1 text-stone-800 focus:outline-none focus:ring-2 focus:ring-pink-500" />
                  {historyFilterDate && (<button onClick={() => setHistoryFilterDate('')} className="bg-[#e6dece] hover:bg-stone-300 text-stone-800 text-xs font-extrabold px-3 py-1.5 rounded-lg transition">Show All</button>)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-[#eae4dc] text-stone-900 rounded-3xl p-5 shadow-md border border-[#ddd5cc] flex justify-between items-center">
                <div>
                  <span className="text-xs text-pink-800 block uppercase font-extrabold tracking-widest mb-1">{historyFilterDate ? `Pieces Sold on ${historyFilterDate}` : 'Total Pieces Sold (All Time)'}</span>
                  <span className="text-3xl font-black text-stone-900">{historyTotalPieces} <span className="text-base font-normal text-stone-700">pcs</span></span>
                </div>
                <div className="text-3xl">🛍️</div>
              </div>
              <div className="bg-gradient-to-br from-pink-900 to-[#52453c] text-white rounded-3xl p-5 shadow-xl border border-pink-800 flex justify-between items-center">
                <div>
                  <span className="text-xs text-pink-300 block uppercase font-extrabold tracking-widest mb-1">{historyFilterDate ? `Revenue Collected on ${historyFilterDate}` : 'Total Revenue (All Time)'}</span>
                  <span className="text-3xl font-black text-pink-400">₱{(historyTotalEarned || 0).toFixed(2)}</span>
                </div>
                <div className="text-3xl">🌸</div>
              </div>
            </div>

            {filteredUnifiedHistory.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-stone-200 max-w-xl mx-auto my-12 shadow-sm">
                <span className="text-5xl block mb-3">🌸</span>
                <h3 className="text-lg font-bold text-stone-800 mb-1">No Activity Found</h3>
                <p className="text-stone-500 text-sm mb-6">We couldn't find any transactions matching your filters.</p>
                <button onClick={() => {setHistoryFilterDate(''); setHistoryFilterStatus('All');}} className="bg-pink-600 hover:bg-pink-700 text-white font-bold px-6 py-2.5 rounded-xl shadow transition">Clear Filters</button>
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-stone-200 w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f2ece4] text-stone-700 text-xs uppercase tracking-wider font-extrabold border-b border-stone-200">
                      <th className="p-4">Date</th>
                      <th className="p-4">Transaction / Style Name</th>
                      <th className="p-4 text-center">Size</th>
                      <th className="p-4 text-center">Quantity</th>
                      <th className="p-4 text-right">Revenue Collected</th>
                      <th className="p-4 text-center">Fulfillment Status</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200/80">
                    {filteredUnifiedHistory.map((log) => {
                      const currentStatus = String(log?.status || 'Pending');
                      return (
                      <tr key={`log-${log?.id}`} className="hover:bg-[#f9f6f0] transition">
                        <td className="p-4 text-sm font-bold text-stone-500">📅 {String(log?.date || 'N/A')}</td>
                        
                        <td className="p-4 font-black text-stone-900 text-base">
                          {log?.isPreOrder ? (
                            <div className="flex flex-col cursor-pointer group w-fit" onClick={() => setViewPreOrder(log)}>
                              <span className="text-pink-600 group-hover:text-pink-800 transition">📝 Pre-Order: {String(log?.name || '')}</span>
                              <span className="text-[11px] font-bold text-stone-500 mt-1 flex items-center gap-2">
                                <span>👤 By: {log?.customer_name || log?.customer || 'Unnamed'}</span>
                                {!!(log?.recipient_name?.trim() || log?.contact_number?.trim() || log?.address?.trim()) && (
                                   <span className="bg-[#f2ece4] px-1.5 py-0.5 rounded-md text-stone-600 group-hover:bg-pink-100 group-hover:text-pink-700 transition uppercase text-[9px]">
                                     🔍 Zoom Info
                                   </span>
                                )}
                              </span>
                            </div>
                          ) : (
                            String(log?.name || '')
                          )}
                        </td>

                        <td className="p-4 text-center"><span className="bg-[#f2ece4] text-stone-800 font-black text-xs px-3 py-1.5 rounded-lg border border-stone-300">{String(log?.size || '')}</span></td>
                        <td className="p-4 text-center font-black text-stone-900 text-base">{log?.qty || 0} pcs</td>
                        <td className="p-4 text-right font-black text-pink-600 text-lg">+₱{(parseFloat(log?.earned) || 0).toFixed(2)}</td>
                        
                        <td className="p-4 text-center">
                          <select 
                            value={currentStatus} 
                            onChange={(e) => handleUpdateFulfillmentStatus(log.isPreOrder, log.originalId, e.target.value)}
                            className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border outline-none cursor-pointer transition shadow-2xs ${
                              currentStatus === 'Received' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              currentStatus === 'Shipped' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            <option value="Pending" className="text-stone-800 bg-white">PENDING</option>
                            <option value="Shipped" className="text-stone-800 bg-white">SHIPPED</option>
                            <option value="Received" className="text-stone-800 bg-white">RECEIVED</option>
                          </select>
                        </td>

                        <td className="p-4 text-center">
                          {log?.isPreOrder ? (
                            <span className="text-[10px] text-stone-400 font-bold uppercase">Pre-Order Tab</span>
                          ) : (
                            <button 
                              onClick={() => handleDeleteSalesHistory(log.originalId)} 
                              className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-extrabold px-3 py-1.5 rounded-lg text-xs transition" 
                              title="Delete Sales Record"
                            >
                              🗑️
                            </button>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: NET PROFIT ANALYTICS VIEW */}
        {activeTab === 'analytics' && (
          <div className="animate-fade-in max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">Net Profit Analytics</h2>
                <p className="text-stone-500 text-sm mt-1">Track itemized arrival batch costs to calculate true Fleurette net earnings</p>
              </div>
              <button onClick={() => setShowExpenseModal(true)} className="bg-pink-600 hover:bg-pink-700 text-white font-extrabold px-5 py-2.5 rounded-xl shadow-md transition active:scale-95 flex items-center gap-2 text-sm shrink-0">
                <span className="text-lg leading-none">+</span> Record Batch Expense
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-200 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-black text-stone-400 uppercase tracking-widest block mb-1">Gross Revenue (Sales &amp; Pre-Orders)</span>
                  <span className="text-3xl font-black text-stone-900">₱{(totalGrossSalesProfit || 0).toFixed(2)}</span>
                </div>
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-bold text-stone-500"><span>Total cash collected</span><span className="text-lg">🌸</span></div>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-200 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-black text-rose-500 uppercase tracking-widest block mb-1">Total Batch Expenses</span>
                  <span className="text-3xl font-black text-rose-600">-₱{(totalBatchExpenses || 0).toFixed(2)}</span>
                </div>
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-bold text-stone-500"><span>Shipping, trims &amp; customs</span><span className="text-lg">💸</span></div>
              </div>

              <div className={`rounded-3xl p-6 shadow-xl border flex flex-col justify-between text-white ${actualNetProfit >= 0 ? 'bg-gradient-to-br from-pink-900 to-[#52453c] border-pink-800' : 'bg-gradient-to-br from-rose-900 to-[#52453c] border-rose-800'}`}>
                <div>
                  <span className="text-xs uppercase tracking-widest block mb-1 font-extrabold text-pink-300">Real Net Profit (Cash in Hand)</span>
                  <span className="text-4xl font-black tracking-tight">₱{(actualNetProfit || 0).toFixed(2)}</span>
                </div>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-extrabold text-stone-200"><span>Gross Revenue minus Expenses</span><span className="text-xl">{actualNetProfit >= 0 ? '📈' : '📉'}</span></div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden w-full">
              <div className="p-5 border-b border-stone-200 bg-[#f2ece4] flex justify-between items-center">
                <h3 className="font-black text-stone-900 text-base flex items-center gap-2"><span>📑</span> Recorded Batch Expenses &amp; Shipping Logs</h3>
                <span className="text-xs font-bold text-stone-600 bg-white px-3 py-1 rounded-lg border border-stone-200">{expenses.length} Records</span>
              </div>

              {expenses.length === 0 ? (
                <div className="p-12 text-center max-w-md mx-auto my-6">
                  <span className="text-5xl block mb-3">📑</span>
                  <h4 className="text-base font-bold text-stone-800 mb-1">No Expenses Logged Yet</h4>
                  <p className="text-stone-500 text-sm mb-6">When a new shipment of garments arrives, click the button above to input itemized shipping fees, trims, or customs costs!</p>
                  <button onClick={() => setShowExpenseModal(true)} className="bg-pink-600 hover:bg-pink-700 text-white font-extrabold px-5 py-2 rounded-xl text-xs shadow transition">+ Record First Expense</button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f2ece4] text-stone-700 text-xs uppercase tracking-wider font-extrabold border-b border-stone-200">
                      <th className="p-4 w-32">Date Logged</th>
                      <th className="p-4">Batch / Expense Title &amp; Itemized Breakdown</th>
                      <th className="p-4 text-right">Total Amount (₱)</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200/80">
                    {expenses.map((item) => (
                      <tr key={`exp-${item?.id}`} className="hover:bg-[#f9f6f0] transition">
                        <td className="p-4 text-sm font-bold text-stone-500 align-top">📅 {String(item?.date || 'N/A')}</td>
                        <td className="p-4 align-top">
                          <div className="font-black text-stone-900 text-base">{String(item?.title || '')}</div>
                          {parseSafeArray(item?.breakdown).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {parseSafeArray(item?.breakdown).map((b, idx) => (
                                <span key={`exp-b-${idx}`} className="text-xs bg-[#f2ece4] text-stone-700 font-bold px-2.5 py-1 rounded-md border border-stone-300 shadow-2xs flex items-center gap-1.5">
                                  <span>{String(b?.name || 'Item')}:</span>
                                  <span className="text-rose-600 font-black">₱{(parseFloat(b?.cost) || 0).toFixed(2)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-right font-black text-rose-600 text-base align-top">-₱{(parseFloat(item?.amount) || 0).toFixed(2)}</td>
                        <td className="p-4 text-center align-top">
                          <div className="flex justify-center gap-1.5">
                            <button onClick={() => openEditExpenseModal(item)} className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold p-2 rounded-lg text-xs transition shadow-2xs" title="Edit expense record">✏️ Edit</button>
                            <button onClick={() => handleDeleteExpense(item.id)} className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-extrabold p-2 rounded-lg text-xs transition" title="Delete expense record">🗑️ Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: PRE-ORDERS VIEW */}
        {activeTab === 'preorders' && (
          <div className="animate-fade-in max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">Customer Pre-Orders</h2>
                <p className="text-stone-500 text-sm mt-1">Track custom reservations, down payments, and remaining balances</p>
              </div>
              <button 
                onClick={() => setShowPreOrderModal(true)} 
                className="bg-pink-600 hover:bg-pink-700 text-white font-extrabold px-5 py-2.5 rounded-xl shadow-md transition active:scale-95 flex items-center gap-2 text-sm shrink-0"
              >
                <span className="text-lg leading-none">+</span> Add Pre-Order
              </button>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden w-full">
              <div className="p-5 border-b border-stone-200 bg-[#f2ece4] flex justify-between items-center">
                <h3 className="font-black text-stone-900 text-base flex items-center gap-2"><span>📝</span> Open Pre-Orders &amp; Reservations</h3>
                <span className="text-xs font-bold text-stone-600 bg-white px-3 py-1 rounded-lg border border-stone-200">{preOrders.length} Records</span>
              </div>

              {preOrders.length === 0 ? (
                <div className="p-12 text-center max-w-md mx-auto my-6">
                  <span className="text-5xl block mb-3">📝</span>
                  <h4 className="text-base font-bold text-stone-800 mb-1">No Pre-orders Found</h4>
                  <p className="text-stone-500 text-sm mb-6">You currently have no active pre-orders or reservations. Click below to add a new customer order.</p>
                  <button onClick={() => setShowPreOrderModal(true)} className="bg-pink-600 hover:bg-pink-700 text-white font-extrabold px-5 py-2 rounded-xl text-xs shadow transition">+ Add Pre-Order</button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f2ece4] text-stone-700 text-xs uppercase tracking-wider font-extrabold border-b border-stone-200">
                      <th className="p-4">Order Date</th>
                      <th className="p-4">Customer Info</th>
                      <th className="p-4">Item &amp; Details</th>
                      <th className="p-4 text-center">Payment Status</th>
                      <th className="p-4 text-right">Balance Due</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200/80">
                    {preOrders.map((order) => {
                      const hasExtraDetails = !!(order?.recipient_name?.trim() || order?.contact_number?.trim() || order?.address?.trim());
                      return (
                      <tr key={`po-${order?.id}`} className="hover:bg-[#f9f6f0] transition">
                        <td className="p-4 text-sm font-bold text-stone-500">📅 {String(order?.order_date || 'N/A')}</td>
                        
                        <td className="p-4 font-black text-stone-900 text-base cursor-pointer group" onClick={() => setViewPreOrder(order)}>
                          <span className="group-hover:text-pink-600 transition block">{String(order?.customer_name || 'Unnamed')}</span>
                          {hasExtraDetails && (
                            <div className="text-[10px] font-bold text-stone-500 mt-1 flex items-center gap-1 uppercase bg-stone-100 px-2 py-0.5 rounded w-fit group-hover:bg-pink-50 group-hover:text-pink-600 transition">
                              <span>🔍 View Details</span>
                            </div>
                          )}
                        </td>

                        <td className="p-4">
                          <div className="font-bold text-stone-800">{String(order?.item_name || '')}</div>
                          <div className="text-[11px] font-bold text-stone-400 mt-0.5">Size: {String(order?.size || '')} {order?.color && order.color !== 'N/A' ? `| Color: ${String(order.color)}` : ''}</div>
                        </td>
                        <td className="p-4 text-center">
                          {order?.is_paid ? (
                            <span className="bg-emerald-100 text-emerald-800 font-black text-xs px-2.5 py-1 rounded-md border border-emerald-200 shadow-2xs">Fully Paid</span>
                          ) : (
                            <span className="bg-rose-50 text-rose-600 font-black text-xs px-2.5 py-1 rounded-md border border-rose-200 shadow-2xs">Pending</span>
                          )}
                        </td>
                        <td className="p-4 text-right font-black text-rose-600 text-base">
                          {parseFloat(order?.balance) > 0 ? `₱${(parseFloat(order.balance) || 0).toFixed(2)}` : '₱0.00'}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center gap-1.5">
                            <button onClick={() => openEditPreOrderModal(order)} className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold p-2 rounded-lg text-xs transition shadow-2xs" title="Edit Pre-order">✏️ Edit</button>
                            <button onClick={() => handleDeletePreOrder(order.id)} className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-extrabold p-2 rounded-lg text-xs transition" title="Delete Pre-order">🗑️ Delete</button>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ========================================== */}
      {/* ZOOM PRE-ORDER MODAL (NEW)                 */}
      {/* ========================================== */}
      {viewPreOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setViewPreOrder(null)}>
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-stone-200 relative" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6 border-b border-stone-100 pb-4">
              <div>
                <h2 className="text-2xl font-black text-stone-900 tracking-tight">Pre-Order Details</h2>
                <p className="text-stone-500 text-xs mt-1 font-bold">Order Ref: {viewPreOrder.id || viewPreOrder.originalId}</p>
              </div>
              <button onClick={() => setViewPreOrder(null)} className="text-stone-400 hover:text-rose-500 font-black text-3xl transition">&times;</button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#f9f6f0] p-4 rounded-2xl border border-stone-200 shadow-sm">
                <h3 className="text-[10px] font-black uppercase text-pink-600 tracking-widest mb-3 flex items-center gap-1.5"><span>🚚</span> Customer & Delivery</h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                  <div>
                    <span className="block text-[10px] font-bold text-stone-400 uppercase mb-0.5">Ordered By</span>
                    <span className="font-black text-stone-800 leading-tight block">{viewPreOrder.customer_name || viewPreOrder.customer || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-stone-400 uppercase mb-0.5">Recipient Name</span>
                    <span className="font-black text-stone-800 leading-tight block">{viewPreOrder.recipient_name?.trim() ? viewPreOrder.recipient_name : 'Same as Customer'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[10px] font-bold text-stone-400 uppercase mb-0.5">Contact Number</span>
                    <span className="font-black text-stone-800 leading-tight block">{viewPreOrder.contact_number?.trim() ? viewPreOrder.contact_number : 'Not provided'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[10px] font-bold text-stone-400 uppercase mb-0.5">Full Delivery Address</span>
                    <span className="font-black text-stone-800 leading-tight block">{viewPreOrder.address?.trim() ? viewPreOrder.address : 'Not provided'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
                <h3 className="text-[10px] font-black uppercase text-stone-400 tracking-widest mb-3 flex items-center gap-1.5"><span>🛍️</span> Garment Info</h3>
                <p className="font-black text-lg text-stone-900 leading-tight">{viewPreOrder.item_name || String(viewPreOrder.name).replace('📝 Pre-Order: ', '').split(' (For:')[0]}</p>
                <div className="flex gap-3 mt-1.5">
                  <span className="text-xs font-bold text-stone-500 bg-stone-100 px-2 py-1 rounded">Size: {viewPreOrder.size}</span>
                  {viewPreOrder.color && viewPreOrder.color !== 'N/A' && (
                    <span className="text-xs font-bold text-stone-500 bg-stone-100 px-2 py-1 rounded">Color: {viewPreOrder.color}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                 <div>
                    <span className="block text-[10px] font-bold text-stone-400 uppercase">Payment Status</span>
                    <span className={`text-base font-black ${viewPreOrder.is_paid || (viewPreOrder.balance && parseFloat(viewPreOrder.balance) <= 0) ? 'text-emerald-500' : 'text-rose-500'}`}>
                       {viewPreOrder.is_paid || (viewPreOrder.balance && parseFloat(viewPreOrder.balance) <= 0) ? '✅ Fully Paid' : `₱${parseFloat(viewPreOrder.balance).toFixed(2)} Balance`}
                    </span>
                 </div>
                 <div className="text-right">
                    <span className="block text-[10px] font-bold text-stone-400 uppercase">Fulfillment</span>
                    <span className="text-base font-black text-sky-600 uppercase">{viewPreOrder.status || 'Pending'}</span>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* RENAME BATCH MODAL                         */}
      {/* ========================================== */}
      {showRenameBatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex justify-between items-center border-b pb-3 mb-4 border-stone-100">
              <h2 className="text-lg font-black text-stone-900 flex items-center gap-2"><span>✏️</span> Rename Batch</h2>
              <button onClick={() => setShowRenameBatchModal(false)} className="text-stone-400 hover:text-stone-600 font-bold text-xl">&times;</button>
            </div>

            <form onSubmit={handleRenameBatchSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">New Batch Name</label>
                <input 
                  type="text" required 
                  value={batchRenameState.newName} 
                  onChange={(e) => setBatchRenameState({ ...batchRenameState, newName: e.target.value })}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button type="button" onClick={() => setShowRenameBatchModal(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100">Cancel</button>
                <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold px-5 py-2 rounded-xl shadow text-sm transition">Save Name</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* E-COMMERCE SHOWCASE & POS MODAL            */}
      {/* ========================================== */}
      {productModal.show && productModal.garment && (
        <div className="fixed inset-0 bg-[#3b322f]/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh] relative border border-stone-200">
            
            <button 
              onClick={() => setProductModal({ show: false, garment: null, mode: 'sell', size: 'M', quantity: 1 })} 
              className="absolute top-4 right-4 z-10 bg-[#f2ece4] hover:bg-stone-300 text-stone-800 w-10 h-10 rounded-full flex items-center justify-center font-black text-lg transition shadow-sm"
              title="Close window"
            >
              ✖
            </button>

            <div className="w-full md:w-1/2 bg-gradient-to-br from-[#f9f6f0] to-[#e6dece] p-8 flex flex-col items-center justify-center relative min-h-[280px] md:min-h-full border-b md:border-b-0 md:border-r border-stone-200">
              {productModal.garment.image ? (
                <img 
                  src={productModal.garment.image} alt={productModal.garment.name} 
                  onClick={() => setZoomedImage(productModal.garment.image)}
                  className="max-w-full max-h-[360px] object-contain drop-shadow-2xl cursor-pointer hover:scale-105 transition duration-300"
                  title="Click to fullscreen zoom" 
                />
              ) : (
                <div className="text-8xl select-none py-12">👗</div>
              )}
              
              <span className="mt-4 text-xs font-bold text-stone-600 bg-white/90 px-3 py-1 rounded-full shadow-2xs border border-stone-200">
                Fleurette Stock: <strong className="text-stone-900">{productModal.garment.total_pieces} pcs</strong>
              </span>
            </div>

            <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-between overflow-y-auto">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-pink-600 block mb-1">
                  Fleurette Catalog • Style #{productModal.garment.id}
                </span>
                
                <h2 className="text-2xl sm:text-3xl font-black text-stone-900 leading-tight">{String(productModal.garment.name || '')}</h2>
                <div className="mt-3 flex items-baseline gap-3">
                  <span className="text-3xl font-black text-stone-900">₱{parseFloat(productModal.garment.selling_price || 0).toFixed(2)}</span>
                  <span className="text-sm font-bold text-stone-400 line-through">₱{parseFloat(productModal.garment.cost_price || 0).toFixed(2)}</span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <span className="bg-pink-100 text-pink-800 text-xs font-black px-3 py-1 rounded-lg">
                    +₱{parseFloat(productModal.garment.profit_per_piece || 0).toFixed(2)} profit / unit
                  </span>
                </div>

                <div className="mt-6 pt-6 border-t border-stone-100">
                  <div className="flex bg-[#f2ece4] p-1 rounded-xl mb-4">
                    <button
                      type="button"
                      onClick={() => setProductModal({ ...productModal, mode: 'sell' })}
                      className={`flex-1 py-2 rounded-lg font-extrabold text-xs transition flex items-center justify-center gap-1.5 ${
                        productModal.mode === 'sell' ? 'bg-white text-pink-600 shadow-sm' : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      <span>🛍️</span> Record Sale
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductModal({ ...productModal, mode: 'restock' })}
                      className={`flex-1 py-2 rounded-lg font-extrabold text-xs transition flex items-center justify-center gap-1.5 ${
                        productModal.mode === 'restock' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      <span>📦</span> Restock Batch
                    </button>
                  </div>

                  <label className="block text-xs font-extrabold text-stone-500 uppercase mb-2">
                    1. Select Size ({productModal.mode === 'sell' ? 'To Deduct' : 'Arriving'}):
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-6">
                    {parseSafeArray(productModal.garment.sizes).map((s) => (
                      <button
                        type="button" key={s?.size} 
                        onClick={() => setProductModal({ ...productModal, size: s.size, quantity: 1 })}
                        disabled={productModal.mode === 'sell' && s?.quantity === 0}
                        className={`py-2.5 rounded-xl font-bold text-xs border flex flex-col items-center transition ${
                          productModal.size === s?.size 
                            ? productModal.mode === 'sell'
                              ? 'bg-pink-600 border-pink-600 text-white shadow-md scale-105 font-black'
                              : 'bg-[#eae4dc] border-[#c2b29a] text-stone-900 shadow-md scale-105 font-black'
                            : s?.quantity > 0 || productModal.mode === 'restock'
                              ? 'bg-[#f9f6f0] border-stone-300 text-stone-700 hover:bg-stone-200'
                              : 'bg-stone-100 border-stone-200 text-stone-300 cursor-not-allowed'
                        }`}
                      >
                        <span className="text-sm font-black">{String(s?.size || '')}</span>
                        <span className="text-[10px] opacity-80">{s?.quantity} in stock</span>
                      </button>
                    ))}
                  </div>

                  <label className="block text-xs font-extrabold text-stone-500 uppercase mb-2">
                    2. Quantity &amp; Confirm:
                  </label>
                  <div className="flex gap-3 items-center">
                    <div className="flex items-center border border-stone-300 rounded-xl bg-[#f9f6f0] px-2 py-1 shrink-0">
                      <button 
                        type="button"
                        onClick={() => setProductModal({ ...productModal, quantity: Math.max(1, parseInt(productModal.quantity || 1) - 1) })}
                        className="w-8 h-10 flex items-center justify-center font-black text-lg text-stone-600 hover:text-stone-900"
                      >
                        -
                      </button>
                      <input 
                        type="number" min="1" required 
                        value={productModal.quantity} 
                        onChange={(e) => setProductModal({ ...productModal, quantity: e.target.value })}
                        className="w-12 text-center font-black text-lg bg-transparent focus:outline-none text-stone-900"
                      />
                      <button 
                        type="button"
                        onClick={() => setProductModal({ ...productModal, quantity: parseInt(productModal.quantity || 0) + 1 })}
                        className="w-8 h-10 flex items-center justify-center font-black text-lg text-stone-600 hover:text-stone-900"
                      >
                        +
                      </button>
                    </div>

                    {productModal.mode === 'sell' ? (
                      <button 
                        onClick={handleSellSubmit}
                        className="flex-1 bg-pink-500 hover:bg-pink-600 text-white font-black py-3.5 px-6 rounded-xl shadow-lg shadow-pink-500/30 text-base flex items-center justify-center gap-2 transition active:scale-95"
                      >
                        <span>🌸</span> Record Sale
                      </button>
                    ) : (
                      <button 
                        onClick={handleRestockSubmit}
                        className="flex-1 bg-[#eae4dc] hover:bg-[#ded6cc] text-stone-900 font-black py-3.5 px-6 rounded-xl shadow-md text-base flex items-center justify-center gap-2 transition active:scale-95 border border-[#c2b29a]"
                      >
                        <span>📦</span> Add to Stock
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-stone-100 flex justify-between items-center text-xs text-stone-400 font-semibold">
                <span>SKU: FLRT-STYLE-{productModal.garment.id}</span>
                <button 
                  type="button"
                  onClick={() => openEditModal(productModal.garment)}
                  className="text-amber-600 hover:text-amber-700 font-extrabold flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 transition"
                >
                  <span>✏️</span> Edit Style Details
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* ADD BATCH WIZARD MODAL                     */}
      {/* ========================================== */}
      {showAddBatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl overflow-hidden flex flex-col border border-stone-200 max-h-[90vh]">
            <div className="flex justify-between items-center border-b pb-4 mb-4 border-stone-100 shrink-0">
              <div>
                <h2 className="text-xl font-black text-stone-900">📦 Import New Batch</h2>
                <p className="text-stone-500 text-xs mt-1">Upload multiple garment styles at once and group them into a single batch.</p>
              </div>
              <button onClick={() => setShowAddBatchModal(false)} className="text-stone-400 hover:text-stone-600 font-bold text-xl">&times;</button>
            </div>
            
            <form onSubmit={handleCreateBatch} className="overflow-y-auto pr-2 flex-1 space-y-6 pb-6">
              <div className="bg-[#f2ece4] p-4 rounded-xl border border-stone-300 shadow-sm sticky top-0 z-10">
                <label className="block text-xs font-black text-stone-700 uppercase tracking-wider mb-2">Assign Batch Name</label>
                <input 
                  type="text" required placeholder="e.g. Batch #1 (Summer Collection)" 
                  value={newBatch.batch_name} onChange={(e) => setNewBatch({...newBatch, batch_name: e.target.value})}
                  className="w-full border border-stone-300 rounded-lg p-3 text-base font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-white shadow-inner"
                />
              </div>

              <div className="space-y-4">
                <span className="block text-xs font-black text-stone-500 uppercase tracking-widest border-b border-stone-200 pb-2">Styles Included in this Batch:</span>
                
                {newBatch.styles.map((style, index) => (
                  <div key={style.id} className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm relative group">
                    {newBatch.styles.length > 1 && (
                      <button 
                        type="button" 
                        onClick={() => removeStyleFromBatch(index)}
                        className="absolute -top-3 -right-3 bg-red-100 text-red-600 hover:bg-red-500 hover:text-white w-8 h-8 rounded-full font-black shadow-md transition"
                        title="Remove style from batch"
                      >
                        ✖
                      </button>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Style Name</label>
                        <input 
                          type="text" required placeholder="e.g. Pink Silk Dress" 
                          list={`garment-names-${index}`}
                          value={style.name} 
                          onChange={(e) => {
                            const val = e.target.value;
                            handleBatchStyleChange(index, 'name', val);
                            const existing = (garments || []).find(g => String(g?.name || '').toLowerCase() === String(val || '').toLowerCase());
                            if (existing) {
                              handleBatchStyleChange(index, 'cost_price', existing.cost_price);
                              handleBatchStyleChange(index, 'selling_price', existing.selling_price);
                            }
                          }}
                          className="w-full border border-stone-300 rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                        />
                        <datalist id={`garment-names-${index}`}>
                          {uniqueGarmentNames.map((name, i) => (
                            <option key={`opt-${i}`} value={name} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Photo (Optional)</label>
                        <input 
                          type="file" accept="image/*"
                          onChange={(e) => handleBatchStyleChange(index, 'image', e.target.files[0])}
                          className="w-full text-xs text-stone-500 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100 border border-stone-200 rounded-lg p-1 bg-[#f9f6f0]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Category</label>
                        <input 
                          type="text" placeholder="e.g. Tops, Dresses..." 
                          list={`batch-category-list-${index}`}
                          value={style.category} onChange={(e) => handleBatchStyleChange(index, 'category', e.target.value)}
                          className="w-full border border-stone-300 rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                        />
                        <datalist id={`batch-category-list-${index}`}>
                          {categories.filter(c => c !== 'All' && c !== 'Uncategorized').map(cat => (
                            <option key={`cat-${cat}`} value={cat} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Color (Optional)</label>
                        <input 
                          type="text" placeholder="e.g. Rose Pink" 
                          value={style.color} onChange={(e) => handleBatchStyleChange(index, 'color', e.target.value)}
                          className="w-full border border-stone-300 rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Cost Price (₱)</label>
                        <input 
                          type="number" step="0.01" required placeholder="350" 
                          value={style.cost_price} onChange={(e) => handleBatchStyleChange(index, 'cost_price', e.target.value)}
                          className="w-full border border-stone-300 rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Selling Price (₱)</label>
                        <input 
                          type="number" step="0.01" required placeholder="799" 
                          value={style.selling_price} onChange={(e) => handleBatchStyleChange(index, 'selling_price', e.target.value)}
                          className="w-full border border-stone-300 rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-2">Initial Stock Count by Size</label>
                      <div className="grid grid-cols-4 gap-2 bg-[#f9f6f0] p-2.5 rounded-xl border border-stone-200">
                        {['S', 'M', 'L', 'XL'].map((sizeLabel) => (
                          <div key={sizeLabel} className="text-center">
                            <span className="block font-extrabold text-[10px] text-stone-500 mb-1">{sizeLabel}</span>
                            <input 
                              type="number" min="0" placeholder="0" 
                              value={style.sizes[sizeLabel]} 
                              onChange={(e) => handleBatchSizeChange(index, sizeLabel, e.target.value)}
                              className="w-full border border-stone-300 rounded-lg p-1.5 text-center font-black text-sm bg-white focus:ring-2 focus:ring-pink-500 focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                <button 
                  type="button" 
                  onClick={addStyleToBatch}
                  className="w-full bg-[#f2ece4] hover:bg-[#eae4dc] text-stone-700 font-black py-4 rounded-2xl border-2 border-dashed border-stone-300 transition shadow-sm flex items-center justify-center gap-2"
                >
                  <span className="text-xl leading-none">+</span> Add Another Style to this Batch
                </button>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-stone-200 shrink-0 sticky bottom-0 bg-white p-3 rounded-xl shadow-up">
                <button type="button" onClick={() => setShowAddBatchModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-stone-600 hover:bg-stone-100 transition">Cancel</button>
                <button type="submit" className="bg-stone-900 hover:bg-black text-white font-black px-8 py-2.5 rounded-xl shadow-lg transition">Save Entire Batch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl overflow-hidden border border-stone-200 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b pb-4 mb-4 border-stone-100 shrink-0">
              <h2 className="text-xl font-black text-stone-900 flex items-center gap-2"><span>✏️</span> Edit Style Details</h2>
              <button onClick={() => setShowEditModal(false)} className="text-stone-400 hover:text-stone-600 font-bold text-xl">&times;</button>
            </div>
            
            <form onSubmit={handleUpdateGarment} className="space-y-4 overflow-y-auto pr-1">
              <div className="bg-[#f2ece4] p-3 rounded-xl border border-stone-300">
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Batch Assignment</label>
                <input 
                  type="text" required 
                  value={editGarment.batch_name} onChange={(e) => setEditGarment({...editGarment, batch_name: e.target.value})}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Style Name</label>
                <input 
                  type="text" required 
                  value={editGarment.name} onChange={(e) => setEditGarment({...editGarment, name: e.target.value})}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Category</label>
                  <input 
                    type="text" placeholder="e.g. Tops" 
                    list="edit-category-list"
                    value={editGarment.category} onChange={(e) => setEditGarment({...editGarment, category: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                  />
                  <datalist id="edit-category-list">
                    {categories.filter(c => c !== 'All' && c !== 'Uncategorized').map(cat => (
                      <option key={`edit-cat-${cat}`} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Color (Optional)</label>
                  <input 
                    type="text" placeholder="e.g. Pink" 
                    value={editGarment.color} onChange={(e) => setEditGarment({...editGarment, color: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Change Photo (Optional)</label>
                {editGarment.previewUrl && (
                  <div className="flex items-center gap-3 mb-2 bg-[#f2ece4] p-2 rounded-xl border border-stone-200">
                    <img src={editGarment.previewUrl} alt="Current" className="w-12 h-12 object-cover rounded-lg shadow-sm border border-stone-200" />
                    <span className="text-xs text-stone-600 font-bold">Current photo active</span>
                  </div>
                )}
                <input 
                  type="file" accept="image/*"
                  onChange={(e) => setEditGarment({...editGarment, image: e.target.files[0]})}
                  className="w-full text-xs text-stone-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 border border-stone-200 rounded-lg p-1 bg-[#f9f6f0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Cost Price (₱)</label>
                  <input 
                    type="number" step="0.01" required 
                    value={editGarment.cost_price} onChange={(e) => setEditGarment({...editGarment, cost_price: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Selling Price (₱)</label>
                  <input 
                    type="number" step="0.01" required 
                    value={editGarment.selling_price} onChange={(e) => setEditGarment({...editGarment, selling_price: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-2">Update Size Stock Counts</label>
                <div className="grid grid-cols-4 gap-2 bg-[#f2ece4] p-3 rounded-xl border border-stone-300">
                  {['S', 'M', 'L', 'XL'].map((size) => (
                    <div key={`edit-sz-${size}`} className="text-center">
                      <span className="block font-extrabold text-xs text-stone-500 mb-1">{size}</span>
                      <input 
                        type="number" min="0" 
                        value={editGarment.sizes[size]} 
                        onChange={(e) => setEditGarment({
                          ...editGarment, 
                          sizes: { ...editGarment.sizes, [size]: e.target.value }
                        })}
                        className="w-full border border-stone-300 rounded-lg p-2 text-center font-black text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-stone-100 mt-6 shrink-0">
                <button 
                  type="button" 
                  onClick={() => handleDeleteGarment(editGarment.id)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-extrabold px-3.5 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5"
                >
                  <span>🗑️</span> Delete
                </button>
                
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowEditModal(false)} className="px-3 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100">Cancel</button>
                  <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold px-5 py-2.5 rounded-xl shadow text-sm transition">Update</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-stone-200">
            <div className="flex justify-between items-center border-b pb-3 mb-4 border-stone-100 shrink-0">
              <h2 className="text-lg font-black text-stone-900 flex items-center gap-2"><span>📈</span> Record Batch Expense</h2>
              <button onClick={() => setShowExpenseModal(false)} className="text-stone-400 hover:text-stone-600 font-bold text-xl">&times;</button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Expense / Batch Title</label>
                <input 
                  type="text" required placeholder="e.g. Batch #1 Arrival Costs" 
                  value={newExpense.title} onChange={(e) => setNewExpense({...newExpense, title: e.target.value})}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Date Incurred</label>
                <input 
                  type="date" required 
                  value={newExpense.date} onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold text-stone-800 focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                />
              </div>

              <div className="bg-[#f2ece4] p-3.5 rounded-xl border border-stone-300">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-extrabold text-stone-700 uppercase">Cost Calculation Mode</span>
                  <button
                    type="button"
                    onClick={() => setNewExpense({ ...newExpense, isDetailed: !newExpense.isDetailed })}
                    className="text-xs font-bold text-pink-700 bg-pink-100 hover:bg-pink-200 px-2.5 py-1 rounded-md transition"
                  >
                    {newExpense.isDetailed ? 'Switch to Lump Sum' : '📝 Add Itemized Breakdown'}
                  </button>
                </div>

                {newExpense.isDetailed ? (
                  <div className="space-y-2.5 pt-2 border-t border-stone-300">
                    <span className="text-[11px] font-bold text-stone-500 block">Itemized Cost Lines (Auto-calculates total):</span>
                    {newExpense.breakdown.map((item, idx) => (
                      <div key={`n-bd-${idx}`} className="flex gap-2 items-center">
                        <input
                          type="text" placeholder="e.g. Freight Shipping" required
                          value={item.name} onChange={(e) => handleBreakdownChange(idx, 'name', e.target.value)}
                          className="flex-1 border border-stone-300 rounded-lg p-2 text-xs font-bold bg-white focus:ring-2 focus:ring-pink-500 focus:outline-none"
                        />
                        <input
                          type="number" step="0.01" min="0" placeholder="₱0.00" required
                          value={item.cost} onChange={(e) => handleBreakdownChange(idx, 'cost', e.target.value)}
                          className="w-24 border border-stone-300 rounded-lg p-2 text-xs font-black text-rose-600 bg-white text-right focus:ring-2 focus:ring-pink-500 focus:outline-none"
                        />
                        {newExpense.breakdown.length > 1 && (
                          <button type="button" onClick={() => removeBreakdownRow(idx)} className="text-rose-500 hover:text-rose-700 font-bold text-base px-1" title="Remove line">✖</button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button" onClick={addBreakdownRow}
                      className="w-full bg-white hover:bg-stone-100 text-stone-700 font-extrabold text-xs py-2 rounded-lg border border-stone-300 mt-1 transition shadow-2xs"
                    >
                      + Add Another Cost Line
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-stone-500 font-medium">Currently inputting a simple lump-sum total below. Switch to detailed mode if you want to track shipping, trims, or customs individually.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                  {newExpense.isDetailed ? 'Total Calculated Amount (₱)' : 'Total Cost Amount (₱)'}
                </label>
                <input 
                  type="number" step="0.01" required placeholder="1500.00" 
                  value={newExpense.amount} 
                  onChange={(e) => !newExpense.isDetailed && setNewExpense({...newExpense, amount: e.target.value})}
                  readOnly={newExpense.isDetailed}
                  className={`w-full border border-stone-300 rounded-lg p-2.5 text-lg font-black text-rose-600 focus:outline-none ${
                    newExpense.isDetailed ? 'bg-stone-200 cursor-not-allowed opacity-80' : 'focus:ring-2 focus:ring-pink-500 bg-[#f9f6f0]'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-stone-100 mt-4 shrink-0">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100">Cancel</button>
                <button type="submit" className="bg-pink-600 hover:bg-pink-700 text-white font-extrabold px-5 py-2.5 rounded-xl shadow text-sm transition">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditExpenseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-stone-200">
            <div className="flex justify-between items-center border-b pb-3 mb-4 border-stone-100 shrink-0">
              <h2 className="text-lg font-black text-stone-900 flex items-center gap-2"><span>✏️</span> Edit Batch Expense</h2>
              <button onClick={() => setShowEditExpenseModal(false)} className="text-stone-400 hover:text-stone-600 font-bold text-xl">&times;</button>
            </div>

            <form onSubmit={handleUpdateExpense} className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Expense / Batch Title</label>
                <input 
                  type="text" required 
                  value={editExpense.title} onChange={(e) => setEditExpense({...editExpense, title: e.target.value})}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Date Incurred</label>
                <input 
                  type="date" required 
                  value={editExpense.date} onChange={(e) => setEditExpense({...editExpense, date: e.target.value})}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold text-stone-800 focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                />
              </div>

              <div className="bg-[#f2ece4] p-3.5 rounded-xl border border-stone-300">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-extrabold text-stone-700 uppercase">Cost Calculation Mode</span>
                  <button
                    type="button"
                    onClick={() => setEditExpense({ ...editExpense, isDetailed: !editExpense.isDetailed })}
                    className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-md transition"
                  >
                    {editExpense.isDetailed ? 'Switch to Lump Sum' : '📝 Add Itemized Breakdown'}
                  </button>
                </div>

                {editExpense.isDetailed ? (
                  <div className="space-y-2.5 pt-2 border-t border-stone-300">
                    <span className="text-[11px] font-bold text-stone-500 block">Itemized Cost Lines (Auto-calculates total):</span>
                    {editExpense.breakdown.map((item, idx) => (
                      <div key={`e-bd-${idx}`} className="flex gap-2 items-center">
                        <input
                          type="text" placeholder="e.g. Freight Shipping" required
                          value={item.name} onChange={(e) => handleEditBreakdownChange(idx, 'name', e.target.value)}
                          className="flex-1 border border-stone-300 rounded-lg p-2 text-xs font-bold bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <input
                          type="number" step="0.01" min="0" placeholder="₱0.00" required
                          value={item.cost} onChange={(e) => handleEditBreakdownChange(idx, 'cost', e.target.value)}
                          className="w-24 border border-stone-300 rounded-lg p-2 text-xs font-black text-rose-600 bg-white text-right focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        {editExpense.breakdown.length > 1 && (
                          <button type="button" onClick={() => removeEditBreakdownRow(idx)} className="text-rose-500 hover:text-rose-700 font-bold text-base px-1" title="Remove line">✖</button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button" onClick={addEditBreakdownRow}
                      className="w-full bg-white hover:bg-stone-100 text-stone-700 font-extrabold text-xs py-2 rounded-lg border border-stone-300 mt-1 transition shadow-2xs"
                    >
                      + Add Another Cost Line
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-stone-500 font-medium">Currently inputting a simple lump-sum total below. Switch to detailed mode if you want to edit itemized fees individually.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                  {editExpense.isDetailed ? 'Total Calculated Amount (₱)' : 'Total Cost Amount (₱)'}
                </label>
                <input 
                  type="number" step="0.01" required 
                  value={editExpense.amount} 
                  onChange={(e) => !editExpense.isDetailed && setEditExpense({...editExpense, amount: e.target.value})}
                  readOnly={editExpense.isDetailed}
                  className={`w-full border border-stone-300 rounded-lg p-2.5 text-lg font-black text-rose-600 focus:outline-none ${
                    editExpense.isDetailed ? 'bg-stone-200 cursor-not-allowed opacity-80' : 'focus:ring-2 focus:ring-amber-500 bg-[#f9f6f0]'
                  }`}
                />
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-stone-100 mt-4 shrink-0">
                <button 
                  type="button" 
                  onClick={() => handleDeleteExpense(editExpense.id)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-extrabold px-3.5 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5"
                >
                  <span>🗑️</span> Delete
                </button>

                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowEditExpenseModal(false)} className="px-3 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100">Cancel</button>
                  <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold px-5 py-2.5 rounded-xl shadow text-sm transition">Update</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRE-ORDER MODALS */}
      {showPreOrderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl overflow-hidden border border-stone-200">
            <div className="flex justify-between items-center border-b pb-3 mb-4 border-stone-100 shrink-0">
              <h2 className="text-lg font-black text-stone-900 flex items-center gap-2"><span>📝</span> Add Pre-Order</h2>
              <button onClick={() => setShowPreOrderModal(false)} className="text-stone-400 hover:text-stone-600 font-bold text-xl">&times;</button>
            </div>

            <form onSubmit={handleCreatePreOrder} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Customer Name (Buyer)</label>
                  <input 
                    type="text" required placeholder="e.g. Dill Doe" 
                    value={newPreOrder.customer_name || ''} onChange={(e) => setNewPreOrder({...newPreOrder, customer_name: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Recipient Name</label>
                  <input 
                    type="text" placeholder="Optional" 
                    value={newPreOrder.recipient_name || ''} onChange={(e) => setNewPreOrder({...newPreOrder, recipient_name: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Contact Number</label>
                  <input 
                    type="text" placeholder="Optional" 
                    value={newPreOrder.contact_number || ''} onChange={(e) => setNewPreOrder({...newPreOrder, contact_number: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Delivery Address</label>
                  <input 
                    type="text" placeholder="Optional" 
                    value={newPreOrder.address || ''} onChange={(e) => setNewPreOrder({...newPreOrder, address: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Garment Style</label>
                <select 
                  required 
                  value={newPreOrder.item_name} 
                  onChange={(e) => {
                    const selected = (garments || []).find(g => String(g?.name) === e.target.value);
                    const newPrice = selected ? selected.selling_price : newPreOrder.price;
                    const dp = newPreOrder.down_payment || 0;
                    const bal = Math.max(0, parseFloat(newPrice || 0) - parseFloat(dp));
                    
                    setNewPreOrder({
                      ...newPreOrder, 
                      item_name: e.target.value,
                      price: newPrice,
                      balance: bal.toFixed(2),
                      is_paid: bal <= 0 && parseFloat(newPrice || 0) > 0,
                      size: ''
                    });
                  }}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                >
                  <option value="" disabled>-- Select a Style --</option>
                  {(garments || []).map(g => (
                    <option key={`po-opt-${g?.id}`} value={g?.name}>{String(g?.name)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Size</label>
                  <select 
                    required 
                    value={newPreOrder.size || ''} 
                    onChange={(e) => setNewPreOrder({...newPreOrder, size: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                    disabled={!newPreOrder.item_name}
                  >
                    <option value="" disabled>-- Size --</option>
                    {newPreOrder.item_name && parseSafeArray((garments || []).find(g => String(g?.name) === newPreOrder.item_name)?.sizes).map(s => (
                      <option key={`po-sz-${s?.size}`} value={s?.size} disabled={s?.quantity <= 0}>
                        {String(s?.size)} {s?.quantity <= 0 ? '(Out of Stock)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Color</label>
                  <input 
                    type="text" placeholder="Color (Optional)" 
                    value={newPreOrder.color || ''} onChange={(e) => setNewPreOrder({...newPreOrder, color: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-pink-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
              </div>

              <div className="bg-[#f2ece4] p-4 rounded-xl border border-stone-300 mt-2">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Total Price (₱)</label>
                    <input 
                      type="number" step="0.01" min="0" placeholder="0.00" required
                      value={newPreOrder.price} 
                      onChange={(e) => {
                        const p = e.target.value;
                        const dp = newPreOrder.down_payment;
                        const bal = Math.max(0, parseFloat(p || 0) - parseFloat(dp || 0));
                        setNewPreOrder({...newPreOrder, price: p, balance: bal.toFixed(2), is_paid: bal <= 0 && parseFloat(p || 0) > 0});
                      }}
                      className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-black text-stone-800 focus:ring-2 focus:ring-pink-500 focus:outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Down Payment (₱)</label>
                    <input 
                      type="number" step="0.01" min="0" placeholder="0.00" required
                      value={newPreOrder.down_payment} 
                      onChange={(e) => {
                        const dp = e.target.value;
                        const p = newPreOrder.price;
                        const bal = Math.max(0, parseFloat(p || 0) - parseFloat(dp || 0));
                        setNewPreOrder({...newPreOrder, down_payment: dp, balance: bal.toFixed(2), is_paid: bal <= 0 && parseFloat(p || 0) > 0});
                      }}
                      className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-black text-emerald-600 focus:ring-2 focus:ring-pink-500 focus:outline-none bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-stone-200">
                  <span className="text-xs font-extrabold text-stone-600 uppercase">Remaining Balance:</span>
                  <span className={`text-xl font-black ${newPreOrder.is_paid ? 'text-emerald-500' : 'text-rose-600'}`}>
                    ₱{newPreOrder.balance || '0.00'}
                  </span>
                </div>
                
                {newPreOrder.is_paid && (
                  <div className="mt-2 text-center text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 py-1.5 rounded-lg border border-emerald-200">
                    ✅ Fully Paid
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button type="button" onClick={() => setShowPreOrderModal(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100">Cancel</button>
                <button type="submit" className="bg-pink-600 hover:bg-pink-700 text-white font-extrabold px-5 py-2.5 rounded-xl shadow text-sm transition">Save Pre-Order</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditPreOrderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl overflow-hidden border border-stone-200">
            <div className="flex justify-between items-center border-b pb-3 mb-4 border-stone-100 shrink-0">
              <h2 className="text-lg font-black text-stone-900 flex items-center gap-2"><span>✏️</span> Edit Pre-Order</h2>
              <button onClick={() => setShowEditPreOrderModal(false)} className="text-stone-400 hover:text-stone-600 font-bold text-xl">&times;</button>
            </div>

            <form onSubmit={handleUpdatePreOrder} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Customer Name (Buyer)</label>
                  <input 
                    type="text" required 
                    value={editPreOrder.customer_name || ''} onChange={(e) => setEditPreOrder({...editPreOrder, customer_name: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Recipient Name</label>
                  <input 
                    type="text" placeholder="Optional" 
                    value={editPreOrder.recipient_name || ''} onChange={(e) => setEditPreOrder({...editPreOrder, recipient_name: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Contact Number</label>
                  <input 
                    type="text" placeholder="Optional" 
                    value={editPreOrder.contact_number || ''} onChange={(e) => setEditPreOrder({...editPreOrder, contact_number: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Delivery Address</label>
                  <input 
                    type="text" placeholder="Optional" 
                    value={editPreOrder.address || ''} onChange={(e) => setEditPreOrder({...editPreOrder, address: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Garment Style</label>
                <select 
                  required 
                  value={editPreOrder.item_name} 
                  onChange={(e) => {
                    const selected = (garments || []).find(g => String(g?.name) === e.target.value);
                    const newPrice = selected ? selected.selling_price : editPreOrder.price;
                    const dp = editPreOrder.down_payment || 0;
                    const bal = Math.max(0, parseFloat(newPrice || 0) - parseFloat(dp));
                    
                    setEditPreOrder({
                      ...editPreOrder, 
                      item_name: e.target.value,
                      price: newPrice,
                      balance: bal.toFixed(2),
                      is_paid: bal <= 0 && parseFloat(newPrice || 0) > 0,
                      size: ''
                    });
                  }}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                >
                  <option value="" disabled>-- Select a Style --</option>
                  {(garments || []).map(g => (
                    <option key={`edit-po-opt-${g?.id}`} value={g?.name}>{String(g?.name)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Size</label>
                  <select 
                    required 
                    value={editPreOrder.size || ''} 
                    onChange={(e) => setEditPreOrder({...editPreOrder, size: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                    disabled={!editPreOrder.item_name}
                  >
                    <option value="" disabled>-- Size --</option>
                    {editPreOrder.item_name && parseSafeArray((garments || []).find(g => String(g?.name) === editPreOrder.item_name)?.sizes).map(s => (
                      <option key={`edit-po-sz-${s?.size}`} value={s?.size}>{String(s?.size)}</option>
                    ))}
                    {editPreOrder.size && !parseSafeArray((garments || []).find(g => String(g?.name) === editPreOrder.item_name)?.sizes).find(s => String(s?.size) === editPreOrder.size) && (
                      <option value={editPreOrder.size}>{String(editPreOrder.size)}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">Color</label>
                  <input 
                    type="text" placeholder="Color (Optional)" 
                    value={editPreOrder.color || ''} onChange={(e) => setEditPreOrder({...editPreOrder, color: e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-[#f9f6f0]"
                  />
                </div>
              </div>

              <div className="bg-[#f2ece4] p-4 rounded-xl border border-stone-300 mt-2">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Total Price (₱)</label>
                    <input 
                      type="number" step="0.01" min="0" placeholder="0.00" required
                      value={editPreOrder.price} 
                      onChange={(e) => {
                        const p = e.target.value;
                        const dp = editPreOrder.down_payment;
                        const bal = Math.max(0, parseFloat(p || 0) - parseFloat(dp || 0));
                        setEditPreOrder({...editPreOrder, price: p, balance: bal.toFixed(2), is_paid: bal <= 0 && parseFloat(p || 0) > 0});
                      }}
                      className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-black text-stone-800 focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">Down Payment (₱)</label>
                    <input 
                      type="number" step="0.01" min="0" placeholder="0.00" required
                      value={editPreOrder.down_payment} 
                      onChange={(e) => {
                        const dp = e.target.value;
                        const p = editPreOrder.price;
                        const bal = Math.max(0, parseFloat(p || 0) - parseFloat(dp || 0));
                        setEditPreOrder({...editPreOrder, down_payment: dp, balance: bal.toFixed(2), is_paid: bal <= 0 && parseFloat(p || 0) > 0});
                      }}
                      className="w-full border border-stone-300 rounded-lg p-2.5 text-sm font-black text-emerald-600 focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-stone-200">
                  <span className="text-xs font-extrabold text-stone-600 uppercase">Remaining Balance:</span>
                  <span className={`text-xl font-black ${editPreOrder.is_paid ? 'text-emerald-500' : 'text-rose-600'}`}>
                    ₱{editPreOrder.balance || '0.00'}
                  </span>
                </div>
                
                {editPreOrder.is_paid && (
                  <div className="mt-2 text-center text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 py-1.5 rounded-lg border border-emerald-200">
                    ✅ Fully Paid
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button type="button" onClick={() => setShowEditPreOrderModal(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100">Cancel</button>
                <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold px-5 py-2.5 rounded-xl shadow text-sm transition">Update</button>
              </div>
            </form>
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
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}