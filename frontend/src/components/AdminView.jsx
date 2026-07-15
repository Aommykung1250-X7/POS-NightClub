import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot
} from 'firebase/firestore';
import { 
  Bell, 
  Package, 
  FileText, 
  Settings, 
  Check, 
  Plus, 
  Trash2, 
  Edit2, 
  Download,
  AlertTriangle,
  RotateCcw,
  QrCode
} from 'lucide-react';
import QRCode from 'qrcode';

export default function AdminView({ dbState, isMock, currentUser, onLogout }) {
  const { products, orders, tables } = dbState;
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'inventory' | 'tables' | 'slipok' | 'reports' | 'settings'
  
  // Settings State
  const [shopSettings, setShopSettings] = useState({
    promptpay_id: '0891234567',
    qr_mode: 'dynamic', // 'dynamic' or 'static'
    static_qr_url: 'https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg'
  });

  // Product CRUD Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState('');
  const [prodForm, setProdForm] = useState({
    name: '',
    price: '',
    stock: '',
    category: 'เครื่องดื่ม',
    is_available: true,
    image_url: ''
  });

  // Image Upload Form States
  const [imageFile, setImageFile] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Table Management States
  const [newTableName, setNewTableName] = useState('');
  const [clearingTableId, setClearingTableId] = useState(null);

  // SlipOK states
  const [slipokQuota, setSlipokQuota] = useState(null);
  const [slipLogs, setSlipLogs] = useState([]);

  // Force check state
  const [forceCheckingId, setForceCheckingId] = useState(null);
  const [forceCheckResult, setForceCheckResult] = useState('');

  // Categories
  const categories = ['เครื่องดื่ม', 'อาหารทานเล่น'];

  // Table QR Codes state & generator
  const [tableQrs, setTableQrs] = useState({});

  useEffect(() => {
    const generateTableQrs = async () => {
      const qrs = {};
      const tableList = tables && tables.length > 0 ? tables.map(t => t.id) : ['T1', 'T2', 'T3', 'T4', 'T5'];
      const baseUrl = window.location.origin;
      for (const tbl of tableList) {
        try {
          const url = `${baseUrl}/?table=${tbl}`;
          const dataUrl = await QRCode.toDataURL(url, { width: 250, margin: 2 });
          qrs[tbl] = dataUrl;
        } catch (err) {
          console.error(err);
        }
      }
      setTableQrs(qrs);
    };

    if (activeTab === 'settings' || activeTab === 'tables') {
      generateTableQrs();
    }
  }, [activeTab, tables]);

  // Fetch SlipOK quota and check logs in real-time
  const fetchSlipokQuota = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${apiUrl}/api/slipok-quota`);
      const data = await res.json();
      if (data.success) {
        setSlipokQuota(data.quota);
      }
    } catch (err) {
      console.error('Error fetching SlipOK quota:', err);
    }
  };

  useEffect(() => {
    if (activeTab !== 'slipok') return;
    
    fetchSlipokQuota();
    
    if (isMock) {
      const dummyLogs = [
        { id: 'log1', order_id: 'ORD-1234', table_id: 'T1', amount: 150, status: 'success', message: 'ตรวจสอบสำเร็จ (จำลอง)', timestamp: new Date(Date.now() - 3600000).toISOString() },
        { id: 'log2', order_id: 'ORD-5678', table_id: 'T2', amount: 90, status: 'failed', message: 'ไม่พบ QR Code ในรูปภาพสลิป', timestamp: new Date(Date.now() - 7200000).toISOString() }
      ];
      setSlipLogs(dummyLogs);
    } else {
      const unsubscribe = onSnapshot(collection(db, 'slip_logs'), (snapshot) => {
        const list = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          list.push({
            id: doc.id,
            ...data,
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp
          });
        });
        list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setSlipLogs(list);
      });
      return unsubscribe;
    }
  }, [activeTab, isMock]);

  // Table Management Handlers
  const handleAddTable = async (e) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    const tableId = newTableName.trim().toUpperCase();
    
    try {
      if (isMock) {
        const storedTables = JSON.parse(localStorage.getItem('mock_tables') || '[]');
        if (storedTables.some(t => t.id === tableId)) {
          alert('มีโต๊ะหมายเลขนี้อยู่แล้ว');
          return;
        }
        storedTables.push({ id: tableId, table_number: tableId, status: 'idle' });
        localStorage.setItem('mock_tables', JSON.stringify(storedTables));
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('mock_state_change'));
      } else {
        const tableRef = doc(db, 'tables', tableId);
        const docSnap = await getDoc(tableRef);
        if (docSnap.exists()) {
          alert('มีโต๊ะหมายเลขนี้อยู่แล้ว');
          return;
        }
        await setDoc(tableRef, {
          table_number: tableId,
          status: 'idle',
          created_at: new Date()
        });
      }
      setNewTableName('');
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถเพิ่มโต๊ะได้');
    }
  };

  const handleDeleteTable = async (tableId) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบโต๊ะ ${tableId}?`)) return;
    try {
      if (isMock) {
        const storedTables = JSON.parse(localStorage.getItem('mock_tables') || '[]');
        const updated = storedTables.filter(t => t.id !== tableId);
        localStorage.setItem('mock_tables', JSON.stringify(updated));
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('mock_state_change'));
      } else {
        await deleteDoc(doc(db, 'tables', tableId));
      }
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถลบโต๊ะได้');
    }
  };

  const handleClearTableHistory = async (tableId) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการล้างประวัติคำสั่งซื้อทั้งหมดของโต๊ะ ${tableId}? ออเดอร์ของโต๊ะนี้จะถูกล้างประวัติจากฝั่งลูกค้า แต่ยังบันทึกอยู่ในยอดรายงานขาย`)) return;
    
    setClearingTableId(tableId);
    try {
      if (isMock) {
        const storedOrders = JSON.parse(localStorage.getItem('mock_orders') || '[]');
        const updated = storedOrders.map(o => {
          if (o.table_id === tableId) {
            return { ...o, is_archived: true };
          }
          return o;
        });
        localStorage.setItem('mock_orders', JSON.stringify(updated));
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('mock_state_change'));
        alert(`ล้างประวัติโต๊ะ ${tableId} สำเร็จ`);
      } else {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}/api/clear-table-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId })
        });
        const result = await response.json();
        if (result.success) {
          alert(`ล้างประวัติโต๊ะ ${tableId} สำเร็จ (เคลียร์ ${result.clearedCount || 0} รายการ)`);
        } else {
          throw new Error(result.message || 'ล้มเหลว');
        }
      }
    } catch (err) {
      console.error(err);
      alert(`เกิดข้อผิดพลาดในการล้างประวัติ: ${err.message}`);
    } finally {
      setClearingTableId(null);
    }
  };

  // Load Settings
  useEffect(() => {
    if (isMock) {
      const storedSettings = localStorage.getItem('mock_settings');
      if (storedSettings) {
        setShopSettings(JSON.parse(storedSettings));
      } else {
        localStorage.setItem('mock_settings', JSON.stringify(shopSettings));
      }
    } else {
      // Get settings from Firestore settings collection doc 'shop'
      const checkSettings = async () => {
        try {
          const settingsRef = doc(db, 'settings', 'shop');
          const snap = await getDoc(settingsRef);
          if (snap.exists()) {
            setShopSettings(snap.data());
          } else {
            await setDoc(settingsRef, shopSettings);
          }
        } catch (e) {
          console.warn('Error reading settings doc:', e);
        }
      };
      checkSettings();
    }
  }, [isMock]);

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      if (isMock) {
        localStorage.setItem('mock_settings', JSON.stringify(shopSettings));
        window.dispatchEvent(new Event('storage'));
      } else {
        await setDoc(doc(db, 'settings', 'shop'), shopSettings);
      }
      alert('บันทึกการตั้งค่าเรียบร้อยแล้ว!');
    } catch (e) {
      console.error(e);
      alert('บันทึกข้อมูลล้มเหลว');
    }
  };

  // Serve Order logic
  const handleServeOrder = async (orderId) => {
    try {
      if (isMock) {
        const storedOrders = JSON.parse(localStorage.getItem('mock_orders') || '[]');
        const updated = storedOrders.map(o => 
          o.id === orderId ? { ...o, status: 'served', updated_at: new Date().toISOString() } : o
        );
        localStorage.setItem('mock_orders', JSON.stringify(updated));
        window.dispatchEvent(new Event('storage'));
      } else {
        await updateDoc(doc(db, 'orders', orderId), {
          status: 'served',
          updated_at: new Date()
        });
      }
    } catch (e) {
      console.error(e);
      alert('ทำรายการเสิร์ฟล้มเหลว');
    }
  };

  // Group unserved paid orders by Table_ID
  const getGroupedOrdersByTable = () => {
    const unservedPaidOrders = orders.filter(o => o.status === 'paid');
    const grouped = {};

    unservedPaidOrders.forEach(order => {
      const tableId = order.table_id;
      if (!grouped[tableId]) {
        grouped[tableId] = {
          table_id: tableId,
          total_amount: 0,
          orders: [],
          oldest_time: order.created_at
        };
      }
      grouped[tableId].orders.push(order);
      grouped[tableId].total_amount += order.total_price;
      
      // Keep track of oldest order time for sorting priority
      if (new Date(order.created_at) < new Date(grouped[tableId].oldest_time)) {
        grouped[tableId].oldest_time = order.created_at;
      }
    });

    // Convert to sorted array (longest waiting tables first)
    return Object.values(grouped).sort((a, b) => new Date(a.oldest_time) - new Date(b.oldest_time));
  };

  const groupedActiveTables = getGroupedOrdersByTable();

  // Force check payment for delayed webhooks
  const handleForceCheck = async (orderId) => {
    setForceCheckingId(orderId);
    setForceCheckResult('');

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/force-check-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });

      const result = await response.json();
      if (result.success) {
        setForceCheckResult(`✅ ${result.message}`);
        // If order was updated successfully, refresh state in UI
        if (isMock && result.data?.status === 'paid') {
          const storedOrders = JSON.parse(localStorage.getItem('mock_orders') || '[]');
          const updated = storedOrders.map(o => 
            o.id === orderId ? { ...o, status: 'paid', paid_at: new Date().toISOString(), transaction_id: result.data.transactionId } : o
          );
          localStorage.setItem('mock_orders', JSON.stringify(updated));
          window.dispatchEvent(new Event('storage'));
        }
      } else {
        setForceCheckResult(`❌ ${result.message}`);
      }
    } catch (err) {
      console.error(err);
      setForceCheckResult('❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์หลังบ้านได้ กรุณาตรวจสอบการโอนในบัญชีธนาคารร้านโดยตรง');
    } finally {
      setTimeout(() => {
        setForceCheckingId(null);
        setForceCheckResult('');
      }, 5000);
    }
  };

  // Product Inventory CRUD Actions
  const handleProductSubmit = async (e) => {
    e.preventDefault();
    
    let finalImageUrl = prodForm.image_url || 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&q=80&w=200';
    
    if (!isMock && imageFile) {
      setUploadingImage(true);
      try {
        const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
        const { storage } = await import('../firebase');
        
        const fileExt = imageFile.name.split('.').pop() || 'jpg';
        const fileRef = ref(storage, `products/${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`);
        const snap = await uploadBytes(fileRef, imageFile);
        finalImageUrl = await getDownloadURL(snap.ref);
      } catch (err) {
        console.error('Failed to upload product image:', err);
        alert(`อัปโหลดรูปภาพไม่สำเร็จ: ${err.message}`);
        setUploadingImage(false);
        return;
      } finally {
        setUploadingImage(false);
      }
    }

    const newProd = {
      name: prodForm.name,
      price: parseFloat(prodForm.price),
      stock: parseInt(prodForm.stock),
      category: prodForm.category,
      is_available: prodForm.is_available,
      image_url: finalImageUrl
    };

    try {
      if (isEditing) {
        // Update
        if (isMock) {
          const stored = JSON.parse(localStorage.getItem('mock_products') || '[]');
          const updated = stored.map(p => p.id === editId ? { ...p, ...newProd } : p);
          localStorage.setItem('mock_products', JSON.stringify(updated));
          window.dispatchEvent(new Event('storage'));
        } else {
          await updateDoc(doc(db, 'products', editId), newProd);
        }
        setIsEditing(false);
        setEditId('');
      } else {
        // Create
        const generatedId = `p${Date.now()}`;
        if (isMock) {
          const stored = JSON.parse(localStorage.getItem('mock_products') || '[]');
          stored.push({ id: generatedId, ...newProd });
          localStorage.setItem('mock_products', JSON.stringify(stored));
          window.dispatchEvent(new Event('storage'));
        } else {
          await setDoc(doc(db, 'products', generatedId), newProd);
        }
      }
      // Reset Form and states
      setProdForm({ name: '', price: '', stock: '', category: 'เครื่องดื่ม', is_available: true, image_url: '' });
      setImageFile(null);
    } catch (err) {
      console.error(err);
      alert('ทำรายการข้อมูลสินค้าไม่สำเร็จ');
    }
  };

  const handleEditProduct = (prod) => {
    setIsEditing(true);
    setEditId(prod.id);
    setProdForm({
      name: prod.name,
      price: prod.price.toString(),
      stock: prod.stock.toString(),
      category: prod.category,
      is_available: prod.is_available,
      image_url: prod.image_url
    });
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('คุณแน่ใจว่าต้องการลบสินค้านี้ออกชั่วคราว?')) return;
    try {
      if (isMock) {
        const stored = JSON.parse(localStorage.getItem('mock_products') || '[]');
        const filtered = stored.filter(p => p.id !== id);
        localStorage.setItem('mock_products', JSON.stringify(filtered));
        window.dispatchEvent(new Event('storage'));
      } else {
        await deleteDoc(doc(db, 'products', id));
      }
    } catch (e) {
      console.error(e);
      alert('ลบข้อมูลไม่สำเร็จ');
    }
  };

  // Quick 1-click availability toggle
  const handleToggleProduct = async (id, currentVal) => {
    try {
      if (isMock) {
        const stored = JSON.parse(localStorage.getItem('mock_products') || '[]');
        const updated = stored.map(p => p.id === id ? { ...p, is_available: !currentVal } : p);
        localStorage.setItem('mock_products', JSON.stringify(updated));
        window.dispatchEvent(new Event('storage'));
      } else {
        await updateDoc(doc(db, 'products', id), {
          is_available: !currentVal
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Reset database values back to default
  const handleResetData = () => {
    if (!window.confirm('ต้องการล้างข้อมูลเพื่อรีเซ็ตกลับเป็นค่าตั้งต้นใช่หรือไม่?')) return;
    
    if (isMock) {
      localStorage.removeItem('mock_products');
      localStorage.removeItem('mock_orders');
      localStorage.removeItem('mock_payments');
      localStorage.removeItem('mock_settings');
      window.location.reload();
    } else {
      alert('ระบบรีเซ็ตใช้เฉพาะสำหรับ Mock Mode เท่านั้น หากใช้ Firebase จริง สามารถลบข้อมูลได้โดยตรงจาก Firebase Console');
    }
  };

  // Export Financial CSV report (Invoice ID & Bank Trans ID match)
  const handleExportCSV = () => {
    const paidOrders = orders.filter(o => o.status === 'paid' || o.status === 'served');
    
    if (paidOrders.length === 0) {
      alert('ยังไม่มีข้อมูลการชำระเงินที่ต้องการแสดงออกในรายงาน');
      return;
    }

    // CSV headers
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel Thai reading
    csvContent += 'Invoice ID,Transaction ID (Bank Ref),Table,Total Price (THB),Status,Paid Date/Time\n';

    // Populate rows
    paidOrders.forEach(o => {
      const invoiceId = o.id;
      const transId = o.transaction_id || 'MOCK-PAYMENT';
      const table = o.table_id;
      const total = o.total_price;
      const status = o.status === 'paid' ? 'ชำระเงินแล้ว' : 'เสิร์ฟเสร็จสิ้น';
      const paidTime = o.paid_at ? new Date(o.paid_at).toLocaleString('th-TH') : 'UNKNOWN';

      csvContent += `"${invoiceId}","${transId}","${table}",${total},"${status}","${paidTime}"\n`;
    });

    // Create Download Trigger
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `POS_Financial_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-container">
      {/* Header */}
      <header className="admin-header flex-between mb-4">
        <div>
          <h1 className="header-title" style={{ fontSize: '28px' }}>แผงจัดการร้าน Chill POS ⚙️</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>ระบบจัดการออเดอร์สด คลังสินค้า และรายงานทางบัญชี</p>
        </div>
        
        <div className="flex-align-center" style={{ gap: '12px' }}>
          {!isMock && currentUser && (
            <div style={{ textAlign: 'right', fontSize: '13px', background: 'rgba(255,255,255,0.02)', padding: '8px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>แอดมิน:</span>
              <strong style={{ color: 'var(--accent)' }}>{currentUser.email}</strong>
              <button 
                onClick={onLogout}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--secondary)',
                  cursor: 'pointer',
                  fontWeight: '600',
                  textDecoration: 'underline',
                  marginLeft: '4px'
                }}
              >
                ออกจากระบบ
              </button>
            </div>
          )}
          
          {isMock && (
            <button 
              onClick={handleResetData}
              className="btn-secondary" 
              style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--danger)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={14} /> รีเซ็ตข้อมูลดีโมทั้งหมด
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="admin-tabs" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button 
          onClick={() => setActiveTab('orders')} 
          className={`admin-tab ${activeTab === 'orders' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
        >
          <Bell size={18} /> จอออเดอร์สด (Live Monitor)
          {orders.filter(o => o.status === 'paid').length > 0 && (
            <span style={{ background: 'var(--secondary)', color: 'white', fontSize: '11px', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
              {orders.filter(o => o.status === 'paid').length}
            </span>
          )}
        </button>
        <button 
          onClick={() => setActiveTab('inventory')} 
          className={`admin-tab ${activeTab === 'inventory' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
        >
          <Package size={18} /> จัดการคลังสินค้า (CRUD)
        </button>
        <button 
          onClick={() => setActiveTab('tables')} 
          className={`admin-tab ${activeTab === 'tables' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
        >
          <QrCode size={18} /> จัดการโต๊ะ & QR
        </button>
        <button 
          onClick={() => setActiveTab('slipok')} 
          className={`admin-tab ${activeTab === 'slipok' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
        >
          <FileText size={18} /> ประวัติสลิป & โควตา
        </button>
        <button 
          onClick={() => setActiveTab('reports')} 
          className={`admin-tab ${activeTab === 'reports' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
        >
          <FileText size={18} /> รายงานยอดขายและภาษี
        </button>
        <button 
          onClick={() => setActiveTab('settings')} 
          className={`admin-tab ${activeTab === 'settings' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
        >
          <Settings size={18} /> ตั้งค่า PromptPay
        </button>
      </div>

      {/* TAB 1: Live Order Monitor */}
      {activeTab === 'orders' && (
        <div>
          {groupedActiveTables.length === 0 ? (
            <div className="glass-panel text-center" style={{ padding: '60px 20px', gridColumn: 'span 2' }}>
              <Bell size={48} style={{ color: 'var(--text-muted)', opacity: 0.3, marginBottom: '16px' }} />
              <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>ไม่มีออเดอร์คงค้าง</h3>
              <p style={{ color: 'var(--text-muted)' }}>เมื่อลูกค้าสแกนจ่ายเงินสำเร็จ ออเดอร์เรียลไทม์จะมาแสดงที่หน้านี้ทันที</p>
            </div>
          ) : (
            <div className="orders-list">
              <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: 'var(--secondary)' }}>📍 ตารางเสิร์ฟอาหารแยกตามโต๊ะ (มีออเดอร์ค้างเสิร์ฟ)</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                {groupedActiveTables.map(tbl => (
                  <div key={tbl.table_id} className="glass-panel pulse-card" style={{ padding: '20px', borderLeft: '4px solid var(--secondary)' }}>
                    <div className="flex-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', marginBottom: '12px' }}>
                      <h3 style={{ fontSize: '22px', fontWeight: 'bold' }}>โต๊ะ: {tbl.table_id}</h3>
                      <span className="badge badge-pending" style={{ fontSize: '11px' }}>
                        สั่งแยกกัน {tbl.orders.length} บิล
                      </span>
                    </div>

                    {/* Consolidated items from all orders of this table */}
                    <div>
                      <h4 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>รายการที่ต้องเดินเสิร์ฟ:</h4>
                      
                      <table className="order-items-table" style={{ margin: '0 0 16px 0' }}>
                        <thead>
                          <tr>
                            <th>ชื่อสินค้า</th>
                            <th style={{ textAlign: 'center' }}>จำนวน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Aggregate quantities */}
                          {Object.values(
                            tbl.orders.flatMap(o => o.items).reduce((acc, item) => {
                              if (!acc[item.product_id]) {
                                acc[item.product_id] = { ...item };
                              } else {
                                acc[item.product_id].quantity += item.quantity;
                              }
                              return acc;
                            }, {})
                          ).map((item, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: '500' }}>{item.name}</td>
                              <td style={{ textAlign: 'center', fontSize: '16px', fontWeight: 'bold', color: 'var(--accent)' }}>{item.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Individual Invoice Reference */}
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '10px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                      <p style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--text-main)' }}>บิลรวมยอดโอน: ฿{tbl.total_amount.toLocaleString()}</p>
                      {tbl.orders.map(o => (
                        <div key={o.id} className="flex-between" style={{ padding: '2px 0' }}>
                          <span>เลขบิล: {o.id.substring(0,8)}...</span>
                          <span style={{ color: 'var(--success)' }}>โอนแล้ว (Ref: {o.transaction_id?.substring(0,14) || 'MOCK'})</span>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => {
                          // Serve all orders under this table in one click
                          tbl.orders.forEach(o => handleServeOrder(o.id));
                        }}
                        className="btn-primary" 
                        style={{ flex: 1, padding: '10px', fontSize: '13px', background: 'linear-gradient(135deg, var(--success) 0%, #047857 100%)', boxShadow: 'none' }}
                      >
                        <Check size={16} /> เสิร์ฟครบทั้งหมดแล้ว
                      </button>

                      {/* Force Check Payment in case of delay */}
                      <button 
                        onClick={() => {
                          // Force check the first unserved order
                          if (tbl.orders[0]) handleForceCheck(tbl.orders[0].id);
                        }}
                        disabled={forceCheckingId !== null}
                        className="btn-secondary"
                        style={{ padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="ตรวจสอบสลิปอีกครั้งหากเงินไม่เข้า"
                      >
                        {forceCheckingId ? 'เช็คเงิน...' : 'ตรวจสอบสลิป'}
                      </button>
                    </div>

                    {forceCheckingId && tbl.orders.find(o => o.id === forceCheckingId) && (
                      <p style={{ fontSize: '11px', marginTop: '10px', textAlign: 'center', color: '#f59e0b' }}>
                        {forceCheckResult || 'กำลังดึงข้อมูลบัญชีและตรวจสอบสลิปโอนเงิน...'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Verification / Delayed Order Help Section */}
          <div className="glass-panel" style={{ padding: '16px', marginTop: '30px', background: 'rgba(245, 158, 11, 0.03)', border: '1px dashed rgba(245, 158, 11, 0.2)' }}>
            <h4 style={{ color: 'var(--warning)', fontSize: '14px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} /> แนะนำการแก้ไขปัญหาเงินตกหล่น/ดีเลย์
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              หากลูกค้าโอนเงินและขึ้นหน้าจอสลิปแล้ว แต่ออเดอร์ไม่เด้งขึ้นหน้าจอสดของพนักงาน (เช่น ในกรณีระบบเครือข่ายธนาคารหรืออินเทอร์เน็ตหน้าร้านขัดข้อง)
              พนักงานสามารถกดปุ่ม <strong>"ตรวจสอบสลิป"</strong> เพื่อส่งข้อมูล Force Check ไปตรวจสอบคิวสลิปบนเซิร์ฟเวอร์หลังบ้านได้ทันที โดยไม่ต้องพิมพ์รหัสใหม่
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: Product & Inventory CRUD */}
      {activeTab === 'inventory' && (
        <div className="admin-grid">
          {/* List Products */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>คลังสินค้าปัจจุบัน ({products.length} รายการ)</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {products.map(prod => (
                <div key={prod.id} className="glass-panel" style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img src={prod.image_url} alt={prod.name} style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} />
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 'bold' }}>{prod.name}</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>หมวดหมู่: {prod.category}</span>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '13px' }}>
                      <span>ราคา: <strong style={{ color: 'var(--accent)' }}>฿{prod.price}</strong></span>
                      <span>คงเหลือในคลัง: <strong style={{ color: prod.stock < 5 ? 'var(--danger)' : 'var(--text-main)' }}>{prod.stock} ชิ้น</strong></span>
                    </div>
                  </div>
                  
                  {/* Quick Toggle switch for 1-click product availability */}
                  <div className="flex-align-center" style={{ marginRight: '10px' }}>
                    <span style={{ fontSize: '12px', color: prod.is_available ? 'var(--success)' : 'var(--text-muted)' }}>
                      {prod.is_available ? 'เปิดขาย' : 'ปิดเมนู'}
                    </span>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={prod.is_available} 
                        onChange={() => handleToggleProduct(prod.id, prod.is_available)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleEditProduct(prod)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '6px' }} title="แก้ไขข้อมูล">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDeleteProduct(prod.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '6px' }} title="ลบสินค้า">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CRUD Form */}
          <div className="glass-panel" style={{ padding: '20px', height: 'fit-content' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={20} style={{ color: 'var(--primary)' }} /> {isEditing ? 'แก้ไขข้อมูลสินค้า' : 'เพิ่มสินค้าใหม่'}
            </h2>
            <form onSubmit={handleProductSubmit} style={{ display: 'flex', flexFlow: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>ชื่อสินค้า</label>
                <input 
                  type="text" 
                  required
                  value={prodForm.name} 
                  onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                  className="input-field" 
                  placeholder="เช่น เบียร์ช้างขวดใหญ่,น้ำแข็งถัง"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>ราคา (บาท)</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    value={prodForm.price} 
                    onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })}
                    className="input-field" 
                    placeholder="90"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>สต็อกสินค้าเริ่มต้น</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    value={prodForm.stock} 
                    onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })}
                    className="input-field" 
                    placeholder="50"
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>หมวดหมู่</label>
                <select 
                  value={prodForm.category}
                  onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })}
                  className="input-field"
                  style={{ background: '#0a0810', cursor: 'pointer' }}
                >
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>รูปภาพสินค้า (อัปโหลดไฟล์รูปภาพ)</label>
                {prodForm.image_url && (
                  <div style={{ marginBottom: '8px' }}>
                    <img src={prodForm.image_url} alt="Preview" style={{ width: '80px', height: '80px', borderRadius: '8px', objectFit: 'cover', display: 'block' }} />
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    if (isMock) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setProdForm(prev => ({ ...prev, image_url: reader.result }));
                      };
                      reader.readAsDataURL(file);
                    } else {
                      setImageFile(file);
                      const previewUrl = URL.createObjectURL(file);
                      setProdForm(prev => ({ ...prev, image_url: previewUrl }));
                    }
                  }}
                  className="input-field" 
                  style={{ background: 'none', border: '1px dashed var(--border)', padding: '6px', fontSize: '13px' }}
                />
                {uploadingImage && <p style={{ fontSize: '12px', color: 'var(--primary)', marginTop: '4px' }}>กำลังอัปโหลดรูปภาพ...</p>}
              </div>

              <div className="flex-align-center" style={{ margin: '8px 0' }}>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={prodForm.is_available} 
                    onChange={(e) => setProdForm({ ...prodForm, is_available: e.target.checked })}
                  />
                  <span className="slider"></span>
                </label>
                <span style={{ fontSize: '14px' }}>เปิดขายสินค้านี้ทันที</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '12px' }}>
                  {isEditing ? 'บันทึกการแก้ไข' : 'บันทึกเพิ่มสินค้า'}
                </button>
                {isEditing && (
                  <button 
                    type="button" 
                    onClick={() => {
                      setIsEditing(false);
                      setEditId('');
                      setProdForm({ name: '', price: '', stock: '', category: 'เครื่องดื่ม', is_available: true, image_url: '' });
                    }}
                    className="btn-secondary" 
                    style={{ padding: '12px' }}
                  >
                    ยกเลิก
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: Sales Report & CSV Export */}
      {activeTab === 'reports' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div className="flex-between mb-4">
            <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>ประวัติการขายทางการเงิน (จับคู่สลิป & บิล)</h2>
            <button 
              onClick={handleExportCSV}
              className="btn-primary" 
              style={{ padding: '10px 18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Download size={16} /> ส่งออกรายงานเป็น Excel/CSV
            </button>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
            รายงานข้อมูลภาษีธุรกิจและการรับเงิน เชื่อมโยง <strong>Invoice_ID (เลขออเดอร์ POS)</strong> เข้ากับ <strong>Transaction_ID (เลขอ้างอิงธนาคาร)</strong> เพื่อเป็นหลักฐานยื่นภาษี
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table className="order-items-table" style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>วันที่ชำระเงิน</th>
                  <th>Invoice ID (เลขออเดอร์)</th>
                  <th>Transaction ID (เลขอ้างอิงโอนเงิน)</th>
                  <th>โต๊ะ</th>
                  <th>ยอดขาย (บาท)</th>
                  <th>สถานะเดินอาหาร</th>
                </tr>
              </thead>
              <tbody>
                {orders.filter(o => o.status === 'paid' || o.status === 'served').length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlignment: 'center', padding: '40px 0', color: 'var(--text-muted)' }} className="text-center">
                      ยังไม่มีรายการยอดขายสะสมในระบบในขณะนี้
                    </td>
                  </tr>
                ) : (
                  orders.filter(o => o.status === 'paid' || o.status === 'served').map(o => (
                    <tr key={o.id}>
                      <td>{o.paid_at ? new Date(o.paid_at).toLocaleString('th-TH') : '-'}</td>
                      <td><span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{o.id}</span></td>
                      <td><span style={{ fontFamily: 'monospace', color: 'var(--success)' }}>{o.transaction_id || 'MOCK-PAYMENT'}</span></td>
                      <td style={{ fontWeight: '600' }}>โต๊ะ {o.table_id}</td>
                      <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>฿{o.total_price.toLocaleString()}</td>
                      <td>
                        <span className={o.status === 'paid' ? 'badge badge-pending' : 'badge badge-served'}>
                          {o.status === 'paid' ? 'ค้างเสิร์ฟ' : 'เสิร์ฟเรียบร้อย'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Shop settings */}
      {activeTab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '600px' }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>การตั้งค่าช่องทางรับเงินชำระของร้าน</h2>
            
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '6px' }}>รูปแบบการแสดง QR Code ในระบบ</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                    <input 
                      type="radio" 
                      name="qr_mode" 
                      value="dynamic"
                      checked={shopSettings.qr_mode === 'dynamic'}
                      onChange={() => setShopSettings({ ...shopSettings, qr_mode: 'dynamic' })}
                    />
                    <strong>PromptPay Dynamic QR (EMVCo)</strong>
                  </label>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                    <input 
                      type="radio" 
                      name="qr_mode" 
                      value="static"
                      checked={shopSettings.qr_mode === 'static'}
                      onChange={() => setShopSettings({ ...shopSettings, qr_mode: 'static' })}
                    />
                    <strong>แสดงรูปภาพ QR Code หลักของร้าน (Static Image)</strong>
                  </label>
                </div>
              </div>

              {shopSettings.qr_mode === 'dynamic' ? (
                <div>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>เลขทะเบียน PromptPay ของร้าน (เบอร์โทรศัพท์ / เลขบัตรประชาชน)</label>
                  <input 
                    type="text" 
                    required
                    value={shopSettings.promptpay_id}
                    onChange={(e) => setShopSettings({ ...shopSettings, promptpay_id: e.target.value })}
                    className="input-field" 
                    placeholder="เช่น 0891234567 หรือ 1200100234567"
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>*ใช้เพื่อเป็นเลขบัญชีปลายทางในการเจนยอด QR Code อัตโนมัติ</p>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>ลิงก์ที่อยู่รูปภาพ QR Code ประจำบัญชีธนาคารร้าน (Image URL)</label>
                  <input 
                    type="text" 
                    required
                    value={shopSettings.static_qr_url}
                    onChange={(e) => setShopSettings({ ...shopSettings, static_qr_url: e.target.value })}
                    className="input-field" 
                    placeholder="เช่น https://domain.com/my-shop-qr.png"
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>*กรุณาใส่ลิงก์รูปภาพ QR Code ของท่านที่เซฟมาจากแอปพลิเคชันธนาคารเพื่อแสดงให้ลูกค้าสแกน</p>
                </div>
              )}

              <button type="submit" className="btn-primary" style={{ padding: '12px', marginTop: '10px' }}>
                บันทึกการตั้งค่า
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB: Table Management & QR Codes */}
      {activeTab === 'tables' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Add Table form */}
          <div className="glass-panel" style={{ padding: '24px', maxWidth: '500px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={20} style={{ color: 'var(--primary)' }} /> เพิ่มโต๊ะอาหารใหม่
            </h3>
            <form onSubmit={handleAddTable} style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                required
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                className="input-field" 
                placeholder="เช่น T6, โต๊ะ 6"
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn-primary" style={{ padding: '0 20px', whiteSpace: 'nowrap' }}>
                เพิ่มโต๊ะ
              </button>
            </form>
          </div>

          {/* Table List with QR Codes & History deletion option */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <QrCode size={20} style={{ color: 'var(--primary)' }} /> รายการโต๊ะและรหัส QR Code ประจำโต๊ะ
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
              สามารถดาวน์โหลด QR Code ไปพิมพ์ติดไว้ที่โต๊ะแต่ละโต๊ะ และกดล้างประวัติคำสั่งซื้อเมื่อลูกค้าเช็คบิลเสร็จสิ้น
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
              {(tables && tables.length > 0 ? tables : [{id: 'T1'}, {id: 'T2'}, {id: 'T3'}, {id: 'T4'}, {id: 'T5'}]).map(tblObj => {
                const tbl = tblObj.id;
                return (
                  <div key={tbl} className="text-center" style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="flex-between" style={{ width: '100%', marginBottom: '12px' }}>
                      <strong style={{ fontSize: '16px', color: 'var(--accent)' }}>โต๊ะ {tbl}</strong>
                      <button 
                        onClick={() => handleDeleteTable(tbl)}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                        title="ลบโต๊ะ"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div style={{ background: 'white', padding: '8px', borderRadius: '8px', marginBottom: '12px', display: 'inline-block' }}>
                      {tableQrs[tbl] ? (
                        <img src={tableQrs[tbl]} alt={`QR โต๊ะ ${tbl}`} style={{ width: '120px', height: '120px', display: 'block' }} />
                      ) : (
                        <div style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '11px' }}>กำลังสร้าง...</div>
                      )}
                    </div>

                    {tableQrs[tbl] && (
                      <a 
                        href={tableQrs[tbl]} 
                        download={`QR_Table_${tbl}.png`}
                        className="btn-secondary"
                        style={{ padding: '8px', fontSize: '12px', borderRadius: '8px', width: '100%', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '8px' }}
                      >
                        <Download size={12} /> ดาวน์โหลดภาพ QR
                      </a>
                    )}

                    <button 
                      onClick={() => handleClearTableHistory(tbl)}
                      disabled={clearingTableId === tbl}
                      className="btn-secondary"
                      style={{ padding: '8px', fontSize: '12px', borderRadius: '8px', width: '100%', borderColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    >
                      {clearingTableId === tbl ? 'กำลังเคลียร์...' : 'ล้างประวัติออเดอร์'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB: SlipOK Log & Quota */}
      {activeTab === 'slipok' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Quota overview */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>ยอดโควตา SlipOK คงเหลือ</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>สิทธิ์คงเหลือในการตรวจสอบความถูกต้องของสลิปโอนเงินจริงกับธนาคาร</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '28px', fontWeight: '800', color: 'var(--accent)' }}>
                {slipokQuota !== null ? (typeof slipokQuota === 'number' ? slipokQuota.toLocaleString() : slipokQuota) : 'ดึงข้อมูล...'}
              </span>
              <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>ครั้ง</span>
            </div>
          </div>

          {/* Verification Logs list */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>ประวัติการสแกนตรวจสอบสลิป</h3>
            
            <div className="table-responsive">
              <table className="order-items-table">
                <thead>
                  <tr>
                    <th>วัน-เวลา</th>
                    <th>เลขออเดอร์</th>
                    <th>โต๊ะ</th>
                    <th>ยอดเงินในสลิป</th>
                    <th>สถานะ</th>
                    <th>รายละเอียดผลลัพธ์</th>
                  </tr>
                </thead>
                <tbody>
                  {slipLogs.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlignment: 'center', padding: '40px 0', color: 'var(--text-muted)' }} className="text-center">
                        ยังไม่มีบันทึกประวัติการสแกนสลิปในคอลเลกชันระบบ
                      </td>
                    </tr>
                  ) : (
                    slipLogs.map(log => (
                      <tr key={log.id}>
                        <td>{log.timestamp ? new Date(log.timestamp).toLocaleString('th-TH') : '-'}</td>
                        <td><span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{log.order_id}</span></td>
                        <td><strong>โต๊ะ {log.table_id}</strong></td>
                        <td><span style={{ fontWeight: 'bold' }}>{log.amount > 0 ? `฿${log.amount.toLocaleString()}` : '-'}</span></td>
                        <td>
                          <span className={log.status === 'success' ? 'badge badge-served' : 'badge badge-out-of-stock'}>
                            {log.status === 'success' ? 'ผ่าน (Success)' : 'ล้มเหลว (Failed)'}
                          </span>
                        </td>
                        <td style={{ fontSize: '13px', color: log.status === 'success' ? '#10b981' : '#f87171' }}>
                          {log.message}
                          {log.transaction_id && <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Ref: {log.transaction_id}</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
