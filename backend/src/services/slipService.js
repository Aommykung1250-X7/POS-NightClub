import Jimp from 'jimp';
import jsQR from 'jsqr';
import crypto from 'crypto';

/**
 * Parses EMVCo TLV (Tag-Length-Value) string format
 */
export function parseEMVCo(emvString) {
  const result = {};
  if (!emvString) return result;
  
  let index = 0;
  while (index < emvString.length) {
    if (index + 4 > emvString.length) break;
    const tag = emvString.substring(index, index + 2);
    const lengthVal = parseInt(emvString.substring(index + 2, index + 4), 10);
    index += 4;
    
    if (isNaN(lengthVal) || index + lengthVal > emvString.length) break;
    const value = emvString.substring(index, index + lengthVal);
    index += lengthVal;
    
    result[tag] = value;
  }
  return result;
}

/**
 * Extracts Transaction ID and Bank Code from a Thai Slip QR payload
 */
export function extractSlipInfo(qrText) {
  try {
    const mainTags = parseEMVCo(qrText);
    
    // In Thai Slip QR, tag 30 contains the bank transfer reference info
    const tag30Val = mainTags['30'];
    if (tag30Val) {
      const subTags = parseEMVCo(tag30Val);
      const bankCode = subTags['01'] || 'UNKNOWN';
      const transactionId = subTags['02'] || null;
      
      if (transactionId) {
        return {
          transactionId,
          bankCode,
          isValidSlip: true
        };
      }
    }
    
    // Fallback: Check tag 31 (some banks might use 31)
    const tag31Val = mainTags['31'];
    if (tag31Val) {
      const subTags = parseEMVCo(tag31Val);
      const bankCode = subTags['01'] || 'UNKNOWN';
      const transactionId = subTags['02'] || null;
      
      if (transactionId) {
        return {
          transactionId,
          bankCode,
          isValidSlip: true
        };
      }
    }
    
    // If we can't parse tag 30/31, generate a unique hash of the QR text to use as transaction ID
    const hash = crypto.createHash('md5').update(qrText).digest('hex').toUpperCase();
    return {
      transactionId: `HASH-${hash.substring(0, 16)}`,
      bankCode: 'GENERIC',
      isValidSlip: qrText.startsWith('000201') // Basic EMVCo check
    };
  } catch (err) {
    console.error('Error parsing slip EMVCo:', err);
    return {
      transactionId: null,
      bankCode: 'ERROR',
      isValidSlip: false
    };
  }
}

/**
 * Scan QR code from buffer
 */
export async function scanQrCodeFromBuffer(buffer) {
  try {
    const image = await Jimp.read(buffer);
    
    // Resize high-res images to a standard width of 600px
    // This dramatically improves jsQR detection rates for mobile screenshots/photos
    if (image.bitmap.width > 800) {
      image.resize(600, Jimp.AUTO);
    }
    
    const { width, height } = image.bitmap;
    const rawImageData = new Uint8ClampedArray(image.bitmap.data);
    const code = jsQR(rawImageData, width, height);
    if (!code) {
      throw new Error('ไม่พบ QR Code ในรูปภาพสลิป กรุณาอัปโหลดสลิปที่คมชัดและเห็นมุม QR Code ชัดเจน');
    }
    return code.data;
  } catch (error) {
    if (error.message.includes('ไม่พบ QR Code')) {
      throw error;
    }
    throw new Error(`เกิดข้อผิดพลาดในการประมวลผลรูปภาพ: ${error.message}`);
  }
}

/**
 * Main verifySlip function (Option C - Local verification, with SlipOK prepared structure)
 * @param {Buffer} imageBuffer - Uploaded image buffer
 * @param {Object} options - Config options (e.g. apiKey for SlipOK)
 * @param {admin.firestore.Firestore} db - Firestore instance to check for duplicate transactions
 */
export async function verifySlip(imageBuffer, options = {}, db = null) {
  const { slipOkApiKey = '', slipOkBranchId = '' } = options;

  // 1. Force verification via SlipOK API
  const verifyResult = await verifyWithSlipOK(imageBuffer, slipOkApiKey, slipOkBranchId);

  // 2. Check for slip reuse in database (Duplicate check)
  if (db && verifyResult.transactionId) {
    const paymentsRef = db.collection('payments');
    const duplicateQuery = await paymentsRef.where('transaction_id', '==', verifyResult.transactionId).get();
    
    if (!duplicateQuery.empty) {
      throw new Error('สลิปนี้ถูกใช้งานเพื่อยืนยันออเดอร์ในระบบไปแล้ว ไม่สามารถใช้งานซ้ำได้');
    }
  }

  return verifyResult;
}

/**
 * Actual method for SlipOK integration (detects via QR or raw image upload)
 */
async function verifyWithSlipOK(imageBuffer, apiKey, branchId) {
  if (!apiKey) {
    throw new Error('ไม่พบ API Key ของ SlipOK (กรุณาตั้งค่าในไฟล์หลังบ้าน)');
  }
  if (!branchId) {
    throw new Error('ไม่พบ Branch ID (รหัสสาขา) ของ SlipOK (กรุณาตั้งค่าในไฟล์หลังบ้าน)');
  }

  // 1. Try scanning QR code locally first to save bandwidth and speed up request
  let qrText = null;
  try {
    qrText = await scanQrCodeFromBuffer(imageBuffer);
  } catch (err) {
    console.log('Local QR scan failed, falling back to uploading full image to SlipOK:', err.message);
  }

  try {
    let response;
    
    if (qrText) {
      // Send QR text directly (Fastest & uses minimal bandwidth)
      response = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}`, {
        method: 'POST',
        headers: {
          'x-authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: qrText,
          log: true
        })
      });
    } else {
      // Send raw image buffer (Fallback when local QR scan fails)
      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('files', blob, 'slip.jpg');
      formData.append('log', 'true');
      
      response = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}`, {
        method: 'POST',
        headers: {
          'x-authorization': apiKey
        },
        body: formData
      });
    }

    let result;
    try {
      result = await response.json();
    } catch (parseErr) {
      const text = await response.text();
      throw new Error(`เซิร์ฟเวอร์ SlipOK ตอบกลับไม่ใช่ JSON (HTTP ${response.status}): ${text}`);
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || `การตรวจสอบสลิปล้มเหลว (รหัสข้อผิดพลาด: ${result.code || 'ไม่มี'})`);
    }

    return {
      success: true,
      transactionId: result.data.transRef,
      bankCode: result.data.sendingBank,
      amount: result.data.amount,
      senderName: result.data.sender?.displayName || 'ไม่ระบุ',
      receiverName: result.data.receiver?.displayName || 'ไม่ระบุ',
      paidAt: result.data.transTimestamp,
      message: 'ตรวจสอบยอดเงินกับธนาคารสำเร็จผ่าน SlipOK'
    };
  } catch (err) {
    throw new Error(`ตรวจสอบสลิปผ่าน SlipOK ล้มเหลว: ${err.message}`);
  }
}
