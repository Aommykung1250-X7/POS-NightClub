# Prompt/Specification: Web-Based Mobile POS for Chill Bars (Order & Pay Instantly) - V2

## 1. Project Overview
ต้องการสร้าง Web Application ระบบ POS บนมือถือสำหรับ "ร้านเหล้านั่งชิลล์ขนาดเล็ก-กลาง" 
* **Concept หลัก:** ลูกค้าสแกน QR Code ประจำโต๊ะ -> เลือกสินค้า -> สแกนจ่ายเงินทันทีผ่าน Dynamic QR Code (Merchant Account) -> ออเดอร์ส่งไปที่ร้าน -> พนักงานเดินเสิร์ฟ
* **เป้าหมาย:** ลดภาระพนักงานในการเดินรับออเดอร์/เช็คบิล, ป้องกันปัญหาลูกค้าเบี้ยวบิล, และใช้ระบบ Merchant QR ของธนาคารเพื่อลดความเสี่ยงเรื่องจำนวนครั้งเงินโอน (Transaction) ที่จะถูกส่งสรรพากรในนามบุคคลธรรมดา

---

## 2. User Roles & Key Workflows

### 2.1 Customer Side (No Login Required)
1. **Table Check-in:** ลูกค้าสแกน QR Code ที่ตั้งอยู่บนโต๊ะ ระบบจะนำเข้าสู่ Web App โดยจะจำกัดสิทธิ์ให้สั่งได้เฉพาะ `Table_ID` นั้นๆ (ใช้ Session หรือ URL Parameter)
2. **Browse & Order:** ดูเมนูอาหาร/เครื่องดื่ม เลือกใส่ตะกร้าสินค้า
   * มีระบบ **Quick Order** หน้าแรกสำหรับสินค้าที่สั่งบ่อย (น้ำแข็ง, โซดา, น้ำเปล่า) กดปุ่มเดียวเข้าตะกร้าทันที
3. **Checkout & Payment:** 
   * ก่อนกดจ่ายเงิน หลังบ้านต้องทำ **Real-time Inventory Check** หากของหมด ให้แจ้งเตือนและไม่อนุญาตให้จ่ายเงิน
   * หากมีของครบ ระบบจะเชื่อมต่อ API ธนาคารเพื่อสร้าง **Dynamic PromptPay QR Code** ที่ฝัง `Invoice_ID` ไว้
4. **Order Confirmation:** เมื่อสแกนจ่ายสำเร็จ หน้าจอจะแสดงสถานะ "ชำระเงินเรียบร้อย กำลังจัดเตรียมออเดอร์"

### 2.2 Staff/Owner Side (Dashboard & Management)
1. **Live Order Monitor:** หน้าจอ Dashboard สำหรับพนักงานและแคชเชียร์ แสดงออเดอร์ที่ **"จ่ายเงินสำเร็จแล้วเท่านั้น"** แยกตามโต๊ะแบบ Real-time **(เน้นการแจ้งเตือนด้วย Visual/ข้อความกะพริบบนจออย่างชัดเจน โดยไม่ต้องมีเสียงเตือน เพื่อไม่ให้รบกวนบรรยากาศในร้านนั่งชิลล์)**
2. **Product & Inventory Management (CRUD):** หน้าจอสำหรับเจ้าของร้านในการจัดการข้อมูลสินค้าแบบครบวงจร
   * **เพิ่มสินค้าใหม่ (Create):** ใส่ชื่อสินค้า, ราคา, หมวดหมู่, รูปภาพ และจำนวนสต็อกเริ่มต้น
   * **ดูรายการสินค้า (Read):** แสดงรายการสินค้าทั้งหมดในร้าน พร้อมตัวเลขสต็อกปัจจุบัน
   * **แก้ไขสินค้า (Update):** แก้ไขราคา, ชื่อ, ปรับเพิ่ม/ลดจำนวนสต็อก หรือ **กด "เปิด/ปิด เมนู" (Quick Toggle) ได้ทันทีใน 1 คลิก** หากพบว่าของหน้าร้านหมดหน้างาน
   * **ลบสินค้า (Delete):** สามารถลบสินค้าออกจากระบบได้ (หรือปรับสถานะเป็น Soft Delete เพื่อไม่ให้กระทบประวัติยอดขายเก่า)
3. **Tax & Financial Report:** ระบบสามารถ Export รายงานยอดขาย (Excel/CSV) ที่แสดงประวัติการรับเงิน โดยจับคู่ระหว่าง `Transaction_ID (จากธนาคาร)` และ `Invoice_ID (จาก POS)` เพื่อใช้เป็นหลักฐานยื่นภาษีธุรกิจ

---

## 3. System Architecture & Technical Requirements

### 3.1 Tech Stack (Recommended)
* **Frontend:** React.js / Vue.js / Next.js (Responsive Design เน้นแสดงผลบนมือถือลูกค้าได้สมบูรณ์แบบ)
* **Backend:** Node.js (Express) หรือ Python (FastAPI)
* **Database:** PostgreSQL หรือ MySQL (เพื่อรองรับการทำ Transaction Logic ที่แม่นยำ)
* **Real-time Communication:** Socket.io (สำหรับยิงออเดอร์จากลูกค้าไปหน้าจอพนักงานทันทีเมื่อเงินเข้า)

### 3.2 Payment Integration (Critical Logic)
* ต้องเชื่อมต่อกับ **Open API ของธนาคาร หรือ Payment Gateway (เช่น SCB Open API, KBANK Embedded QR)**
* **Flow Payment Verification:** 
  1. เมื่อลูกค้ากดจ่าย -> ระบบขอดึง QR Code จาก API ธนาคาร 
  2. ลูกค้าโอนเงิน -> ธนาคารส่ง Webhook กลับมาที่ Backend ของระบบ POS 
  3. หลังบ้านเปลี่ยนสถานะบิลเป็น `Paid` และยิง Socket.io ไปอัปเดตที่หน้าจอพนักงานเสิร์ฟทันที

### 3.3 Database Schema (Initial)
* `Tables` (id, table_number, status)
* `Products` (id, name, price, stock_quantity, is_available, category, created_at, updated_at)
* `Orders` (id, table_id, total_price, status [pending/paid/served])
* `Order_Items` (id, order_id, product_id, quantity)
* `Payments` (id, order_id, transaction_id, payment_gateway_ref, paid_at)

---

## 4. Edge Cases & Error Handling ที่ระบบต้องรองรับ
* **กรณีลูกค้าโต๊ะเดียวกันกดสั่งพร้อมกัน:** ถ้านาย A และนาย B นั่งโต๊ะเดียวกัน กดสั่งแยกกัน ให้ระบบมองเป็น 2 บิลแยกชำระเงิน (ของใครของมัน) แต่เมื่อเงินเข้าแล้ว ให้หน้าจอฝั่งพนักงานรวบรวมแสดงผลภายใต้ `Table_ID` เดียวกัน เพื่อความสะดวกในการเดินเสิร์ฟ
* **กรณี Webhook ธนาคารดีเลย์:** ต้องมีปุ่ม "ตรวจสอบยอดเงิน" ที่หน้าจอฝั่งพนักงาน เพื่อให้พนักงานสามารถกด Force Check ไปที่ API ของธนาคารแบบ Manual ได้ เผื่อกรณีอินเทอร์เน็ตหน้าร้านหรือระบบธนาคารส่งข้อมูลช้า