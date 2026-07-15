import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { db, admin } from './firebaseAdmin.js';
import { verifySlip } from './services/slipService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configure Multer for in-memory file storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // Limit to 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น (PNG, JPG, JPEG)'), false);
    }
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Healthcheck endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', firebaseInitialized: !!db });
});

/**
 * GET /api/slipok-quota
 * Checks the remaining SlipOK verification quota.
 */
app.get('/api/slipok-quota', async (req, res) => {
  try {
    const apiKey = process.env.SLIPOK_API_KEY;
    const branchId = process.env.SLIPOK_BRANCH_ID;

    if (!apiKey || !branchId || process.env.USE_SLIPOK !== 'true') {
      return res.json({ success: true, quota: 9999, overQuota: 0, isMock: true });
    }

    const response = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}/quota`, {
      method: 'GET',
      headers: {
        'x-authorization': apiKey
      }
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to fetch quota from SlipOK');
    }

    res.json({ 
      success: true, 
      quota: result.data.quota, 
      overQuota: result.data.overQuota || 0,
      isMock: false 
    });
  } catch (error) {
    console.error('Error fetching SlipOK quota:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/clear-table-history
 * Soft deletes all orders under a specific table by setting is_archived = true.
 */
app.post('/api/clear-table-history', async (req, res) => {
  try {
    const { tableId } = req.body;
    if (!tableId) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุหมายเลขโต๊ะ (Table ID)' });
    }

    if (!db) {
      return res.json({ success: true, message: `[Mock Mode] ล้างประวัติโต๊ะ ${tableId} สำเร็จ` });
    }

    const batch = db.batch();
    let count = 0;
    
    const allTableOrders = await db.collection('orders')
      .where('table_id', '==', tableId)
      .get();

    allTableOrders.forEach(doc => {
      const data = doc.data();
      if (!data.is_archived) {
        batch.update(doc.ref, { 
          is_archived: true,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }

    res.json({ 
      success: true, 
      message: `ล้างประวัติคำสั่งซื้อของโต๊ะ ${tableId} เรียบร้อยแล้ว (${count} ออเดอร์)`,
      clearedCount: count
    });
  } catch (error) {
    console.error('Error clearing table history:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/verify-slip
 * Verifies the bank slip image, checks for duplicates, checks inventory,
 * deducts stock, and marks order as paid in real-time.
 */
app.post('/api/verify-slip', upload.single('slip'), async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'กรุณาอัปโหลดรูปภาพสลิปโอนเงิน' });
    }
    
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'ไม่พบรหัสใบสั่งซื้อ (Order ID)' });
    }

    if (!db) {
      // Offline / Local Mock Mode for testing without active Firebase credentials
      console.log('⚠️ Running in local mock mode without Firestore.');
      return res.json({
        success: true,
        message: '[Mock Mode] ตรวจสอบสลิปสำเร็จ (จำลอง)',
        data: {
          transactionId: `MOCK-${Date.now()}`,
          orderId,
          amount: 150.00
        }
      });
    }

    // 1. Get the order from Firestore
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบใบสั่งซื้อนี้ในระบบ' });
    }

    const orderData = orderDoc.data();
    if (orderData.status === 'paid' || orderData.status === 'served') {
      return res.status(400).json({ success: false, message: 'ใบสั่งซื้อนี้ชำระเงินเรียบร้อยแล้ว' });
    }

    // 2. Verify the slip QR code and check for duplicates (Option C)
    const hasSlipOkCreds = !!(process.env.SLIPOK_API_KEY && process.env.SLIPOK_BRANCH_ID);
    const verifyResult = await verifySlip(req.file.buffer, {
      useSlipOK: hasSlipOkCreds || process.env.USE_SLIPOK === 'true',
      slipOkApiKey: process.env.SLIPOK_API_KEY || '',
      slipOkBranchId: process.env.SLIPOK_BRANCH_ID || ''
    }, db);

    // 3. Database Transaction to perform inventory check and deduct stock
    const transactionResult = await db.runTransaction(async (transaction) => {
      // A. Re-verify order status inside the transaction to avoid race conditions
      const freshOrderDoc = await transaction.get(orderRef);
      const freshOrder = freshOrderDoc.data();
      
      if (freshOrder.status === 'paid' || freshOrder.status === 'served') {
        throw new Error('ใบสั่งซื้อนี้ได้รับการชำระเงินไปแล้ว');
      }

      // B. Fetch and verify stock levels for each item in the order
      const itemDeductions = [];
      
      for (const item of freshOrder.items) {
        const productRef = db.collection('products').doc(item.product_id);
        const productDoc = await transaction.get(productRef);
        
        if (!productDoc.exists) {
          throw new Error(`ไม่พบสินค้า: ${item.name} ในคลัง`);
        }
        
        const productData = productDoc.data();
        
        // If product is disabled, or stock is insufficient
        if (!productData.is_available) {
          throw new Error(`สินค้า ${item.name} ถูกปิดใช้งานชั่วคราว ไม่สามารถสั่งซื้อได้`);
        }
        
        if (productData.stock < item.quantity) {
          throw new Error(`ขออภัย! ${item.name} ในคลังไม่เพียงพอ (เหลือสต็อก ${productData.stock} ชิ้น)`);
        }
        
        itemDeductions.push({
          productRef,
          newStock: productData.stock - item.quantity,
          name: item.name
        });
      }

      // C. If all checks pass, write the updates
      // Deduct stock
      for (const ded of itemDeductions) {
        transaction.update(ded.productRef, { 
          stock: ded.newStock,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Update order status to paid
      transaction.update(orderRef, {
        status: 'paid',
        paid_at: admin.firestore.FieldValue.serverTimestamp(),
        transaction_id: verifyResult.transactionId,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      // Record the payment
      const paymentRef = db.collection('payments').doc();
      transaction.set(paymentRef, {
        order_id: orderId,
        invoice_id: orderId, // Here invoice ID maps to the Order Doc ID
        transaction_id: verifyResult.transactionId,
        bank_code: verifyResult.bankCode,
        amount: freshOrder.total_price,
        paid_at: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        orderId,
        transactionId: verifyResult.transactionId,
        amount: freshOrder.total_price
      };
    });

    // Write success log to slip_logs
    try {
      await db.collection('slip_logs').add({
        order_id: orderId,
        table_id: orderData.table_id || 'UNKNOWN',
        amount: orderData.total_price || 0,
        status: 'success',
        message: verifyResult.message || 'ตรวจสอบสำเร็จ',
        transaction_id: verifyResult.transactionId || '',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (logErr) {
      console.error('Failed to write success slip log:', logErr);
    }

    res.json({
      success: true,
      message: 'ตรวจสอบสลิปและชำระเงินออเดอร์เรียบร้อยแล้ว!',
      data: transactionResult
    });

  } catch (error) {
    console.error('Error verifying slip:', error);
    
    // Write failed log to slip_logs
    if (db && orderId) {
      try {
        let tId = 'UNKNOWN';
        let amt = 0;
        try {
          const oDoc = await db.collection('orders').doc(orderId).get();
          if (oDoc.exists) {
            tId = oDoc.data().table_id || 'UNKNOWN';
            amt = oDoc.data().total_price || 0;
          }
        } catch (_) {}

        await db.collection('slip_logs').add({
          order_id: orderId,
          table_id: tId,
          amount: amt,
          status: 'failed',
          message: error.message || 'เกิดข้อผิดพลาดในการตรวจสอบสลิปโอนเงิน',
          transaction_id: '',
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (logErr) {
        console.error('Failed to write failure slip log:', logErr);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || 'เกิดข้อผิดพลาดในการตรวจสอบสลิปโอนเงิน'
    });
  }
});

/**
 * POST /api/force-check-payment
 * Edge Case Manual Verification Button on Staff Dashboard:
 * Query payment details directly from DB or external payment API in case webhook delays.
 */
app.post('/api/force-check-payment', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสใบสั่งซื้อ (Order ID)' });
    }

    if (!db) {
      return res.json({ success: true, message: '[Mock Mode] ตรวจสอบออเดอร์และยอดเงินโอนเรียบร้อยแล้ว' });
    }

    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบใบสั่งซื้อนี้' });
    }

    const order = orderDoc.data();
    if (order.status === 'paid' || order.status === 'served') {
      return res.json({
        success: true,
        message: 'ออเดอร์นี้ชำระเงินเรียบร้อยแล้ว',
        data: { status: order.status, transactionId: order.transaction_id }
      });
    }

    // Force Check simulation: In production, query Bank API with invoice ID.
    // For Option C, if webhook delays, we would manually check bank statement or wait. 
    // Here we will simulate forcing a check against Firestore payments to see if it was paid
    const paymentsQuery = await db.collection('payments').where('order_id', '==', orderId).get();
    if (!paymentsQuery.empty) {
      const paymentData = paymentsQuery.docs[0].data();
      
      // Update order to paid
      await db.collection('orders').doc(orderId).update({
        status: 'paid',
        transaction_id: paymentData.transaction_id,
        paid_at: paymentData.paid_at,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.json({
        success: true,
        message: 'พบรายการโอนเงินในระบบ คอนเฟิร์มออเดอร์เรียบร้อยแล้ว!',
        data: { status: 'paid', transactionId: paymentData.transaction_id }
      });
    }

    // If still not paid, we will prompt the staff to double-check manually
    res.json({
      success: false,
      message: 'ไม่พบรายการโอนเงินที่ตรงกับออเดอร์นี้ กรุณาให้พนักงานตรวจสอบยอดในบัญชีธนาคารร้านโดยตรง'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Product seeding data
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

async function seedDatabase() {
  if (!db) {
    console.warn('⚠️ Seeding skipped: Firestore Admin is not initialized.');
    return;
  }
  try {
    console.log('🌱 Seeding database...');
    // Seed products
    for (const prod of INITIAL_PRODUCTS) {
      const prodRef = db.collection('products').doc(prod.id);
      const doc = await prodRef.get();
      if (!doc.exists) {
        await prodRef.set(prod);
        console.log(`+ Product added: ${prod.name}`);
      }
    }
    // Seed tables
    for (const tbl of INITIAL_TABLES) {
      const tblRef = db.collection('tables').doc(tbl.id);
      const doc = await tblRef.get();
      if (!doc.exists) {
        await tblRef.set(tbl);
        console.log(`+ Table added: ${tbl.table_number}`);
      }
    }
    console.log('✅ Seeding complete!');
  } catch (error) {
    console.error('❌ Seeding database failed:', error.message);
  }
}

// Manual Seed route
app.get('/api/seed', async (req, res) => {
  if (!db) {
    return res.status(500).json({ success: false, message: 'Firebase Admin not initialized' });
  }
  await seedDatabase();
  res.json({ success: true, message: 'Database seeded successfully!' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  res.status(500).json({ success: false, message: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 POS Backend server is running on port ${PORT}`);
  // Run seeding on startup
  seedDatabase();
});
