import React, { useState, useEffect } from 'react';
import { db, auth, isMock } from './firebase';
import { 
  collection, 
  getDocs, 
  getDoc,
  setDoc, 
  doc, 
  onSnapshot 
} from 'firebase/firestore';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import CustomerView from './components/CustomerView';
import AdminView from './components/AdminView';
import { Lock } from 'lucide-react';

// Sample initial products for Chill Bar
const INITIAL_PRODUCTS = [
  { id: 'p1', name: 'เบียร์ช้าง (ขวด)', price: 90, stock: 50, is_available: true, category: 'เครื่องดื่ม', image_url: 'https://images.unsplash.com/photo-1600788886242-5c96aabe3757?auto=format&fit=crop&q=80&w=200' },
  { id: 'p2', name: 'เบียร์สิงห์ (ขวด)', price: 95, stock: 40, is_available: true, category: 'เครื่องดื่ม', image_url: 'https://images.unsplash.com/photo-1566633806327-68e152aaf26d?auto=format&fit=crop&q=80&w=200' },
  { id: 'p11', name: 'เบียร์ LEO (ขวด)', price: 90, stock: 60, is_available: true, category: 'เครื่องดื่ม', image_url: 'https://images.unsplash.com/photo-1608270176050-1210f8490fe7?auto=format&fit=crop&q=80&w=200' },
  { id: 'p3', name: 'เหล้า Blend 285 (70cl)', price: 320, stock: 15, is_available: true, category: 'เครื่องดื่ม', image_url: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80&w=200' },
  { id: 'p10', name: 'ค็อกเทล Mojito', price: 180, stock: 40, is_available: true, category: 'เครื่องดื่ม', image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=200' },
  { id: 'p4', name: 'เฟรนช์ฟรายส์ทอด', price: 89, stock: 30, is_available: true, category: 'อาหารทานเล่น', image_url: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&q=80&w=200' },
  { id: 'p5', name: 'ข้อไก่ทอดงา', price: 99, stock: 25, is_available: true, category: 'อาหารทานเล่น', image_url: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&q=80&w=200' },
  { id: 'p9', name: 'ยำวุ้นเส้นทะเลเดือด', price: 150, stock: 20, is_available: true, category: 'อาหารทานเล่น', image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200' },
  { id: 'p12', name: 'หมูสามชั้นทอดน้ำปลา', price: 120, stock: 25, is_available: true, category: 'อาหารทานเล่น', image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=200' },
  // Quick Order items (น้ำแข็ง, โซดา, น้ำเปล่า)
  { id: 'p6', name: 'น้ำแข็ง (ถัง)', price: 20, stock: 100, is_available: true, category: 'เครื่องดื่ม', is_quick: true, image_url: 'https://images.unsplash.com/photo-1551818255-e6e10975bc17?auto=format&fit=crop&q=80&w=200' },
  { id: 'p7', name: 'โซดา (ขวด)', price: 15, stock: 150, is_available: true, category: 'เครื่องดื่ม', is_quick: true, image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=200' },
  { id: 'p8', name: 'น้ำเปล่า (ขวด)', price: 15, stock: 120, is_available: true, category: 'เครื่องดื่ม', is_quick: true, image_url: 'https://images.unsplash.com/photo-1608885898957-a599fb1698d6?auto=format&fit=crop&q=80&w=200' }
];

const INITIAL_TABLES = [
  { id: 'T1', table_number: 'T1', status: 'idle' },
  { id: 'T2', table_number: 'T2', status: 'idle' },
  { id: 'T3', table_number: 'T3', status: 'idle' },
  { id: 'T4', table_number: 'T4', status: 'idle' },
  { id: 'T5', table_number: 'T5', status: 'idle' }
];

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentTable, setCurrentTable] = useState(null);
  const [dbState, setDbState] = useState({
    products: [],
    tables: [],
    orders: []
  });
  const [loading, setLoading] = useState(true);

  // Authentication State
  const [currentUser, setCurrentUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Track Firebase Authentication State
  useEffect(() => {
    if (!isMock && auth) {
      const unsub = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
      });
      return unsub;
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
    } catch (err) {
      console.error(err);
      setLoginError('อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบสิทธิ์ของคุณในระบบ Firebase Console');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (isMock) {
      setCurrentUser(null);
    } else if (auth) {
      await signOut(auth);
    }
  };

  // Check URL params for table check-in or admin screen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    const adminParam = params.get('admin');

    if (adminParam === 'true') {
      setIsAdmin(true);
    }

    if (tableParam) {
      setCurrentTable(tableParam.toUpperCase());
    }
  }, []);

  // Sync / Initialize database state
  useEffect(() => {
    if (isMock) {
      // --- LOCAL STORAGE MOCK MODE ---
      const loadLocalStorage = () => {
        let storedProducts = localStorage.getItem('mock_products');
        let storedTables = localStorage.getItem('mock_tables');
        let storedOrders = localStorage.getItem('mock_orders');

        if (!storedProducts) {
          localStorage.setItem('mock_products', JSON.stringify(INITIAL_PRODUCTS));
          storedProducts = JSON.stringify(INITIAL_PRODUCTS);
        }
        if (!storedTables) {
          localStorage.setItem('mock_tables', JSON.stringify(INITIAL_TABLES));
          storedTables = JSON.stringify(INITIAL_TABLES);
        }
        if (!storedOrders) {
          localStorage.setItem('mock_orders', JSON.stringify([]));
          storedOrders = JSON.stringify([]);
        }

        setDbState({
          products: JSON.parse(storedProducts),
          tables: JSON.parse(storedTables),
          orders: JSON.parse(storedOrders)
        });
        setLoading(false);
      };

      loadLocalStorage();
      
      // Setup a window listener to reload state when localStorage updates (simulating real-time local sync across tabs!)
      const handleStorageChange = () => {
        setDbState({
          products: JSON.parse(localStorage.getItem('mock_products') || '[]'),
          tables: JSON.parse(localStorage.getItem('mock_tables') || '[]'),
          orders: JSON.parse(localStorage.getItem('mock_orders') || '[]')
        });
      };
      window.addEventListener('storage', handleStorageChange);
      
      // Simulate real-time polling to sync within the same window easily
      const interval = setInterval(handleStorageChange, 1000);
      return () => {
        window.removeEventListener('storage', handleStorageChange);
        clearInterval(interval);
      };
    } else {
      // --- REAL FIREBASE MODE ---
      // Setup real-time listeners directly (seeding is handled securely on the backend)
      const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
        const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setDbState(prev => ({ ...prev, products }));
      }, (err) => {
        console.error("Firestore Products Listener failed:", err);
      });

      const unsubTables = onSnapshot(collection(db, 'tables'), (snapshot) => {
        const tables = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setDbState(prev => ({ ...prev, tables }));
      }, (err) => {
        console.error("Firestore Tables Listener failed:", err);
      });

      const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
        const orders = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : data.created_at,
            paid_at: data.paid_at?.toDate ? data.paid_at.toDate().toISOString() : data.paid_at,
          };
        });
        setDbState(prev => ({ ...prev, orders }));
      }, (err) => {
        console.error("Firestore Orders Listener failed:", err);
      });

      setLoading(false);

      return () => {
        unsubProducts();
        unsubTables();
        unsubOrders();
      };
    }
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '15px' }}>
        <div style={{ border: '4px solid rgba(139, 92, 246, 0.1)', borderTop: '4px solid #8b5cf6', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#9ca3af', fontSize: '16px', fontFamily: 'Sarabun' }}>กำลังโหลดระบบ POS...</p>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}} />
      </div>
    );
  }

  return (
    <div>
      {isAdmin ? (
        (!isMock && !currentUser) ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '30px' }}>
              <div className="text-center" style={{ marginBottom: '24px' }}>
                <Lock size={40} className="pulse-text" style={{ margin: '0 auto 12px', color: 'var(--primary)' }} />
                <h2 className="header-title" style={{ fontSize: '24px' }}>ลงชื่อเข้าใช้ระบบจัดการ</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>เฉพาะพนักงานและผู้ดูแลระบบของร้านเท่านั้น</p>
              </div>

              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>อีเมลพนักงาน (Email)</label>
                  <input 
                    type="email" 
                    required 
                    value={loginEmail} 
                    onChange={(e) => setLoginEmail(e.target.value)} 
                    className="input-field" 
                    placeholder="admin@chillbar.com" 
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>รหัสผ่าน (Password)</label>
                  <input 
                    type="password" 
                    required 
                    value={loginPassword} 
                    onChange={(e) => setLoginPassword(e.target.value)} 
                    className="input-field" 
                    placeholder="••••••••" 
                  />
                </div>

                {loginError && (
                  <p style={{ color: 'var(--danger)', fontSize: '12px', textAlign: 'center' }}>
                    ⚠️ {loginError}
                  </p>
                )}

                <button type="submit" disabled={loggingIn} className="btn-primary" style={{ width: '100%', padding: '14px', marginTop: '8px' }}>
                  {loggingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <AdminView dbState={dbState} isMock={isMock} currentUser={currentUser} onLogout={handleLogout} />
        )
      ) : (
        <CustomerView 
          dbState={dbState} 
          currentTable={currentTable} 
          setCurrentTable={setCurrentTable}
          isMock={isMock} 
        />
      )}
    </div>
  );
}
