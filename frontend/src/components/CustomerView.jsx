import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  doc, 
  getDoc,
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { 
  ShoppingBag, 
  Zap, 
  Trash2, 
  Plus, 
  Minus, 
  Upload, 
  CheckCircle, 
  X, 
  CreditCard,
  QrCode 
} from 'lucide-react';
import QRCode from 'qrcode';
import { generatePromptPayPayload } from '../utils/promptpay';

export default function CustomerView({ dbState, currentTable, setCurrentTable, isMock }) {
  const { products } = dbState;
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState('ทั้งหมด');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [slipFile, setSlipFile] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [shopSettings, setShopSettings] = useState({
    promptpay_id: '0891234567',
    qr_mode: 'dynamic', // 'dynamic' or 'static'
    static_qr_url: 'https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg'
  });

  // Load shop settings (static QR URL, promptpay number) from Firestore
  useEffect(() => {
    if (isMock) {
      const storedSettings = localStorage.getItem('mock_settings');
      if (storedSettings) {
        setShopSettings(JSON.parse(storedSettings));
      } else {
        localStorage.setItem('mock_settings', JSON.stringify(shopSettings));
      }
    } else {
      const unsub = onSnapshot(doc(db, 'settings', 'shop'), (docSnap) => {
        if (docSnap.exists()) {
          setShopSettings(docSnap.data());
        }
      });
      return unsub;
    }
  }, [isMock]);

  // Sync order status in real-time when checkout is open
  useEffect(() => {
    if (!checkoutOrder) return;
    
    if (isMock) {
      const interval = setInterval(() => {
        const storedOrders = JSON.parse(localStorage.getItem('mock_orders') || '[]');
        const freshOrder = storedOrders.find(o => o.id === checkoutOrder.id);
        if (freshOrder && freshOrder.status === 'paid') {
          setPaymentSuccess(true);
          setCheckoutOrder(freshOrder);
          setCart([]);
          clearInterval(interval);
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      const unsub = onSnapshot(doc(db, 'orders', checkoutOrder.id), (docSnap) => {
        if (docSnap.exists()) {
          const freshOrder = docSnap.data();
          if (freshOrder.status === 'paid') {
            setPaymentSuccess(true);
            setCart([]);
          }
        }
      });
      return unsub;
    }
  }, [checkoutOrder, isMock]);

  // Generate QR Code when checkout order is generated
  useEffect(() => {
    if (!checkoutOrder) return;

    const generateQR = async () => {
      try {
        if (shopSettings.qr_mode === 'static') {
          // Use pre-uploaded shop static QR image URL
          setQrCodeUrl(shopSettings.static_qr_url);
        } else {
          // Generate dynamic PromptPay QR code
          const payload = generatePromptPayPayload(shopSettings.promptpay_id, checkoutOrder.total_price);
          const dataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 });
          setQrCodeUrl(dataUrl);
        }
      } catch (err) {
        console.error('Failed to generate QR Code:', err);
      }
    };

    generateQR();
  }, [checkoutOrder, shopSettings]);

  // Categories
  const categories = ['ทั้งหมด', 'เครื่องดื่ม', 'อาหารทานเล่น'];
  const filteredProducts = activeCategory === 'ทั้งหมด' 
    ? products.filter(p => !p.is_quick) 
    : products.filter(p => {
        if (p.is_quick) return false;
        if (activeCategory === 'เครื่องดื่ม') {
          return p.category === 'เครื่องดื่ม' || p.category === 'เครื่องดื่มแอลกอฮอล์' || p.category === 'เครื่องดื่มด่วน';
        }
        return p.category === activeCategory;
      });

  const quickProducts = products.filter(p => p.is_quick);

  const addToCart = (product) => {
    if (product.stock <= 0 || !product.is_available) return;
    
    setCart(prevCart => {
      const existing = prevCart.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prevCart; // limit to stock
        return prevCart.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId, delta) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.id === productId) {
        const newQty = item.quantity + delta;
        const prod = products.find(p => p.id === productId);
        if (newQty <= 0) return null;
        if (prod && newQty > prod.stock) return item; // limit to stock
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(Boolean));
  };

  const totalCartPrice = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  const totalCartItems = cart.reduce((total, item) => total + item.quantity, 0);

  // Perform client-side inventory check
  const checkInventory = () => {
    for (const item of cart) {
      const realProduct = products.find(p => p.id === item.id);
      if (!realProduct) return { valid: false, message: `ไม่พบสินค้า: ${item.name} ในคลัง` };
      if (!realProduct.is_available) return { valid: false, message: `${item.name} ปิดการขายชั่วคราว` };
      if (realProduct.stock < item.quantity) {
        return { valid: false, message: `ขออภัย! ${item.name} สต็อกไม่เพียงพอ (เหลือ ${realProduct.stock} ชิ้น)` };
      }
    }
    return { valid: true };
  };

  const handleCheckout = async () => {
    if (!currentTable) {
      alert('กรุณาเลือกหรือเช็คอินโต๊ะก่อนทำการสั่งซื้อ');
      return;
    }

    if (cart.length === 0) return;

    // 1. Real-time Inventory Check
    const invCheck = checkInventory();
    if (!invCheck.valid) {
      alert(invCheck.message);
      return;
    }

    const orderData = {
      table_id: currentTable,
      items: cart.map(item => ({
        product_id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      })),
      total_price: totalCartPrice,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    setVerifying(true);
    setErrorMsg('');

    try {
      if (isMock) {
        // Mock checkout save
        const storedOrders = JSON.parse(localStorage.getItem('mock_orders') || '[]');
        const newOrder = {
          id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
          ...orderData
        };
        storedOrders.push(newOrder);
        localStorage.setItem('mock_orders', JSON.stringify(storedOrders));
        
        // Notify other windows/tabs
        window.dispatchEvent(new Event('storage'));

        setCheckoutOrder(newOrder);
        setIsCheckoutOpen(true);
      } else {
        // Real Firestore checkout save
        const ordersRef = collection(db, 'orders');
        const docRef = await addDoc(ordersRef, {
          ...orderData,
          created_at: new Date() // use Date object for Firestore
        });
        setCheckoutOrder({ id: docRef.id, ...orderData });
        setIsCheckoutOpen(true);
      }
    } catch (e) {
      console.error(e);
      alert('ไม่สามารถส่งออเดอร์ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setVerifying(false);
    }
  };

  // Submit slip to Node.js backend
  const handleUploadSlip = async (e) => {
    e.preventDefault();
    if (!slipFile) {
      setErrorMsg('กรุณาเลือกรูปภาพสลิปที่ต้องการส่ง');
      return;
    }

    setVerifying(true);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('slip', slipFile);
    formData.append('orderId', checkoutOrder.id);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/verify-slip`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'การตรวจสอบสลิปล้มเหลว');
      }

      // Success
      setPaymentSuccess(true);
      setCart([]);

      // In mock mode, update localStorage status to paid manually
      if (isMock) {
        const storedOrders = JSON.parse(localStorage.getItem('mock_orders') || '[]');
        const updated = storedOrders.map(o => 
          o.id === checkoutOrder.id ? { ...o, status: 'paid', paid_at: new Date().toISOString(), transaction_id: result.data.transactionId } : o
        );
        localStorage.setItem('mock_orders', JSON.stringify(updated));
        
        // Save payment
        const storedPayments = JSON.parse(localStorage.getItem('mock_payments') || '[]');
        storedPayments.push({
          order_id: checkoutOrder.id,
          invoice_id: checkoutOrder.id,
          transaction_id: result.data.transactionId,
          bank_code: 'TEST',
          amount: checkoutOrder.total_price,
          paid_at: new Date().toISOString()
        });
        localStorage.setItem('mock_payments', JSON.stringify(storedPayments));

        window.dispatchEvent(new Event('storage'));
      }

    } catch (err) {
      console.error(err);
      let friendlyError = err.message;
      if (err.message === 'Failed to fetch' || err.message === 'Load failed') {
        friendlyError = 'ไม่สามารถเชื่อมต่อระบบตรวจสอบสลิปหลังบ้านได้ (หากทดสอบผ่านมือถือและยังไม่มีการ Deploy หลังบ้านจริง กรุณาใช้ปุ่ม "จำลองการสแกนจ่ายเงินสำเร็จ" ด้านล่าง)';
      }
      setErrorMsg(friendlyError);
    } finally {
      setVerifying(false);
    }
  };

  // Developer Simulator Button: Bypass backend API and force status change
  const handleSimulatePaymentSuccess = async () => {
    setVerifying(true);
    setErrorMsg('');

    try {
      const mockTxId = `TXN-${Math.floor(100000000 + Math.random() * 900000000)}`;
      
      if (isMock) {
        // Update LocalStorage mock orders
        const storedOrders = JSON.parse(localStorage.getItem('mock_orders') || '[]');
        
        // Verify inventory before writing
        const updatedOrders = storedOrders.map(o => {
          if (o.id === checkoutOrder.id) {
            // Deduct stock in mock products
            const storedProds = JSON.parse(localStorage.getItem('mock_products') || '[]');
            o.items.forEach(item => {
              const p = storedProds.find(prod => prod.id === item.product_id);
              if (p) p.stock = Math.max(0, p.stock - item.quantity);
            });
            localStorage.setItem('mock_products', JSON.stringify(storedProds));

            return {
              ...o,
              status: 'paid',
              paid_at: new Date().toISOString(),
              transaction_id: mockTxId
            };
          }
          return o;
        });

        localStorage.setItem('mock_orders', JSON.stringify(updatedOrders));
        
        // Save Mock Payment
        const storedPayments = JSON.parse(localStorage.getItem('mock_payments') || '[]');
        storedPayments.push({
          order_id: checkoutOrder.id,
          invoice_id: checkoutOrder.id,
          transaction_id: mockTxId,
          bank_code: 'MOCK_BANK',
          amount: checkoutOrder.total_price,
          paid_at: new Date().toISOString()
        });
        localStorage.setItem('mock_payments', JSON.stringify(storedPayments));

        window.dispatchEvent(new Event('storage'));
        setPaymentSuccess(true);
        setCart([]);
      } else {
        // Real Firestore direct write for simulation
        const orderRef = doc(db, 'orders', checkoutOrder.id);
        const orderDoc = await getDoc(orderRef);
        
        if (orderDoc.exists()) {
          const freshOrder = orderDoc.data();
          
          // Deduct stock for real products
          for (const item of freshOrder.items) {
            const productRef = doc(db, 'products', item.product_id);
            const pDoc = await getDoc(productRef);
            if (pDoc.exists()) {
              await updateDoc(productRef, {
                stock: Math.max(0, pDoc.data().stock - item.quantity)
              });
            }
          }

          // Update order
          await updateDoc(orderRef, {
            status: 'paid',
            paid_at: new Date(),
            transaction_id: mockTxId
          });

          // Save Payment collection
          await addDoc(collection(db, 'payments'), {
            order_id: checkoutOrder.id,
            invoice_id: checkoutOrder.id,
            transaction_id: mockTxId,
            bank_code: 'SIMULATION',
            amount: checkoutOrder.total_price,
            paid_at: new Date()
          });

          setPaymentSuccess(true);
          setCart([]);
        }
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('เกิดข้อผิดพลาดในการจำลองการชำระเงิน');
    } finally {
      setVerifying(false);
    }
  };

  const closeCheckout = () => {
    setIsCheckoutOpen(false);
    setCheckoutOrder(null);
    setQrCodeUrl('');
    setSlipFile(null);
    setPaymentSuccess(false);
    setErrorMsg('');
  };

  // Render Welcome/Scan QR Screen if table is not checked in
  if (!currentTable) {
    return (
      <div className="mobile-wrapper" style={{ justifyContent: 'center', padding: '24px' }}>
        <div className="glass-panel text-center" style={{ padding: '40px 24px', border: '1px solid rgba(37, 99, 235, 0.3)' }}>
          <div style={{ 
            width: '80px', 
            height: '80px', 
            borderRadius: '50%', 
            background: 'rgba(37, 99, 235, 0.1)', 
            border: '2px dashed var(--primary)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto 24px',
            boxShadow: '0 0 20px rgba(37, 99, 235, 0.2)'
          }}>
            <QrCode size={40} style={{ color: 'var(--primary)' }} />
          </div>
          <h2 className="header-title" style={{ fontSize: '22px', marginBottom: '12px' }}>สแกน QR Code ประจำโต๊ะ</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
            กรุณาสแกน QR Code ที่ตั้งอยู่บนโต๊ะของท่าน เพื่อเข้าสู่ระบบเมนูและเริ่มต้นสั่งเครื่องดื่มหรืออาหารจากโต๊ะของท่านโดยตรง
          </p>
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.03)', 
            padding: '12px 16px', 
            borderRadius: '12px', 
            fontSize: '12px', 
            color: 'var(--text-muted)', 
            border: '1px solid rgba(255, 255, 255, 0.05)' 
          }}>
            ℹ️ ระบบจะเชื่อมโยงเข้ากับหมายเลขโต๊ะผ่าน QR Code ที่สแกนโดยอัตโนมัติ
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-wrapper">
      {/* Header */}
      <header style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(10,8,16,0.6)' }} className="flex-between">
        <div>
          <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '600' }}>CHILL BAR & BISTRO</span>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>โต๊ะ: {currentTable}</h2>
        </div>
        <button 
          onClick={() => setIsCartOpen(true)} 
          className="btn-secondary" 
          style={{ padding: '8px 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}
        >
          <ShoppingBag size={18} />
          <span>ตะกร้า</span>
          {totalCartItems > 0 && (
            <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--secondary)', color: 'white', fontSize: '11px', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              {totalCartItems}
            </span>
          )}
        </button>
      </header>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Quick Order Section (น้ำแข็ง, โซดา, น้ำเปล่า) */}
        {quickProducts.length > 0 && (
          <div className="mb-4">
            <h4 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={16} style={{ color: 'var(--warning)' }} /> สั่งด่วน (Quick Order)
            </h4>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '6px' }}>
              {quickProducts.map(prod => (
                <button 
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  disabled={prod.stock <= 0 || !prod.is_available}
                  className="quick-order-btn"
                  style={{ opacity: (prod.stock <= 0 || !prod.is_available) ? 0.5 : 1 }}
                >
                  <span style={{ fontSize: '14px' }}>{prod.name}</span>
                  <span style={{ fontSize: '12px', color: 'var(--secondary)' }}>฿{prod.price}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Categories Navbar */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`category-pill ${activeCategory === cat ? 'active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="products-grid">
          {filteredProducts.map(prod => {
            const outOfStock = prod.stock <= 0 || !prod.is_available;
            const cartItem = cart.find(c => c.id === prod.id);
            return (
              <div 
                key={prod.id} 
                className="glass-panel" 
                style={{ padding: '10px', display: 'flex', flexDirection: 'column', opacity: outOfStock ? 0.6 : 1 }}
              >
                <div style={{ position: 'relative', width: '100%', height: '120px', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                  <img 
                    src={prod.image_url} 
                    alt={prod.name} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {outOfStock && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="badge badge-out-of-stock">ของหมด</span>
                    </div>
                  )}
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', minHeight: '36px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {prod.name}
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>สต็อก: {prod.stock} ชิ้น</span>
                
                <div className="flex-between" style={{ marginTop: 'auto', paddingTop: '8px' }}>
                  <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent)' }}>฿{prod.price}</span>
                  {cartItem ? (
                    <div className="flex-align-center" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px 4px' }}>
                      <button onClick={() => updateQuantity(prod.id, -1)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><Minus size={14} /></button>
                      <span style={{ fontSize: '13px', width: '20px', textAlign: 'center', fontWeight: '600' }}>{cartItem.quantity}</span>
                      <button onClick={() => updateQuantity(prod.id, 1)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><Plus size={14} /></button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => addToCart(prod)}
                      disabled={outOfStock}
                      className="btn-primary" 
                      style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px' }}
                    >
                      เพิ่ม
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Footer Cart Summary */}
      {totalCartItems > 0 && (
        <div className="checkout-bar">
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ทั้งหมด {totalCartItems} รายการ</span>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--secondary)' }}>฿{totalCartPrice.toLocaleString()}</p>
          </div>
          <button onClick={() => setIsCartOpen(true)} className="btn-primary" style={{ padding: '10px 20px' }}>
            ดูตะกร้าสินค้า <ShoppingBag size={16} />
          </button>
        </div>
      )}

      {/* Cart Drawer Modal */}
      {isCartOpen && (
        <div className="overlay" onClick={() => setIsCartOpen(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingBag size={20} /> ตะกร้าสินค้าของคุณ
              </h3>
              <button onClick={() => setIsCartOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {cart.length === 0 ? (
              <div className="text-center" style={{ padding: '40px 0' }}>
                <ShoppingBag size={40} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: '10px' }} />
                <p style={{ color: 'var(--text-muted)' }}>ไม่มีสินค้าในตะกร้า</p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '50vh', overflowY: 'auto', paddingRight: '4px' }}>
                  {cart.map(item => (
                    <div key={item.id} className="flex-between" style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: '600' }}>{item.name}</h4>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>฿{item.price} × {item.quantity}</span>
                      </div>
                      <div className="flex-align-center">
                        <div className="flex-align-center" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px 6px' }}>
                          <button onClick={() => updateQuantity(item.id, -1)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><Minus size={12} /></button>
                          <span style={{ fontSize: '13px', width: '24px', textAlign: 'center' }}>{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, 1)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><Plus size={12} /></button>
                        </div>
                        <button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', marginLeft: '6px' }}><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                  <div className="flex-between" style={{ marginBottom: '16px' }}>
                    <span style={{ fontWeight: '500' }}>ยอดรวมสุทธิ</span>
                    <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--secondary)' }}>฿{totalCartPrice.toLocaleString()}</span>
                  </div>
                  <button onClick={() => { setIsCartOpen(false); handleCheckout(); }} className="btn-primary" style={{ width: '100%', padding: '14px' }}>
                    สั่งและชำระเงินทันที ฿{totalCartPrice.toLocaleString()}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout QR Code / Slip Upload Modal */}
      {isCheckoutOpen && checkoutOrder && (
        <div className="overlay">
          <div className="modal-content glass-panel" style={{ textAlign: 'center', position: 'relative' }}>
            
            {/* If payment is success */}
            {paymentSuccess ? (
              <div style={{ padding: '20px 10px' }}>
                <CheckCircle size={56} style={{ color: 'var(--success)', margin: '0 auto 16px' }} />
                <h3 className="header-title" style={{ fontSize: '22px', marginBottom: '8px' }}>ชำระเงินเรียบร้อย!</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>ทางร้านได้รับออเดอร์เรียบร้อยแล้ว พนักงานกำลังจัดเตรียมเสิร์ฟออเดอร์ของคุณ</p>
                
                <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', padding: '12px', borderRadius: '12px', textAlign: 'left', marginBottom: '24px', fontSize: '13px' }}>
                  <p><strong>เลขออเดอร์:</strong> {checkoutOrder.id}</p>
                  <p><strong>โต๊ะ:</strong> {checkoutOrder.table_id}</p>
                  <p><strong>ยอดชำระ:</strong> ฿{checkoutOrder.total_price.toLocaleString()}</p>
                  <p><strong>สถานะ:</strong> <span style={{ color: 'var(--success)' }}>ชำระเงินเสร็จสิ้น</span></p>
                </div>

                <button onClick={closeCheckout} className="btn-primary" style={{ width: '100%' }}>
                  กลับไปหน้าหลัก
                </button>
              </div>
            ) : (
              <div>
                <button 
                  onClick={closeCheckout} 
                  disabled={verifying}
                  style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>

                <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '6px' }}>สแกนจ่ายผ่าน PromptPay</h3>
                <span className="badge badge-pending" style={{ marginBottom: '16px' }}>รอชำระเงิน</span>

                {/* QR Code Container */}
                <div style={{ background: 'white', padding: '12px', borderRadius: '16px', width: '220px', height: '220px', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                  {qrCodeUrl ? (
                    <img 
                      src={qrCodeUrl} 
                      alt="PromptPay QR Code" 
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ border: '3px solid #f3f3f3', borderTop: '3px solid var(--primary)', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite' }} />
                  )}
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>จำนวนเงินที่ต้องชำระ</p>
                  <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent)' }}>฿{checkoutOrder.total_price.toLocaleString()}</h2>
                  {shopSettings.qr_mode === 'dynamic' && (
                    <p style={{ fontSize: '11px', color: '#3b82f6' }}>*สแกนแล้ว ยอดเงินจะกรอกให้อัตโนมัติ</p>
                  )}
                </div>

                {/* Slip Upload form */}
                <form onSubmit={handleUploadSlip} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', textAlign: 'left' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-main)' }}>อัปโหลดสลิปธนาคารเพื่อยืนยัน (ตัวเลือก C)</h4>
                  
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                    <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border)', padding: '10px', borderRadius: '8px', cursor: 'pointer', justifyContent: 'center', fontSize: '13px' }}>
                      <Upload size={16} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                        {slipFile ? slipFile.name : 'เลือกรูปสลิป'}
                      </span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => setSlipFile(e.target.files[0])} 
                        style={{ display: 'none' }}
                      />
                    </label>

                    <button 
                      type="submit" 
                      disabled={verifying || !slipFile}
                      className="btn-primary" 
                      style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '13px' }}
                    >
                      {verifying ? 'ตรวจสลิป...' : 'ส่งสลิป'}
                    </button>
                  </div>

                  {errorMsg && (
                    <p style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '12px', textAlign: 'center' }}>
                      ⚠️ {errorMsg}
                    </p>
                  )}
                </form>

                {/* Simulator Option (Highlighted for easy local demo) */}
                <div style={{ background: 'rgba(37, 99, 235, 0.05)', border: '1px solid rgba(37, 99, 235, 0.2)', padding: '10px 12px', borderRadius: '12px', marginTop: '16px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>🔧 เครื่องมือจำลองสำหรับผู้ทดสอบ (ไม่ต้องรันเซิร์ฟเวอร์หลังบ้าน)</p>
                  <button 
                    onClick={handleSimulatePaymentSuccess}
                    disabled={verifying}
                    className="btn-secondary" 
                    style={{ width: '100%', padding: '8px 12px', fontSize: '12px', background: 'rgba(37, 99, 235, 0.1)', borderColor: 'rgba(37, 99, 235, 0.35)', color: '#60a5fa', display: 'flex', justifyCenter: 'center', alignItems: 'center', gap: '6px' }}
                  >
                    <CreditCard size={14} /> จำลองการสแกนจ่ายเงินสำเร็จ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
