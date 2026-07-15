/**
 * Computes CRC16 CCITT (polynomial 0x1021, init 0xFFFF)
 */
function crc16(data) {
  let crc = 0xFFFF;
  for (let c = 0; c < data.length; c++) {
    const code = data.charCodeAt(c);
    let x = ((crc >> 8) ^ code) & 0xFF;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generates Thai PromptPay EMVCo payload string
 * @param {string} promptpayId - Mobile phone number (e.g., '0891234567') or Citizen ID (13 digits)
 * @param {number} amount - Amount of Baht (e.g. 150.75)
 * @returns {string} EMVCo payload
 */
export function generatePromptPayPayload(promptpayId, amount) {
  // Clean promptpayId (remove hyphens, spaces)
  const id = promptpayId.replace(/[^0-9]/g, '');
  
  // Format mobile number or citizen ID
  let target = '';
  let subTag = '';
  
  if (id.length === 13) {
    // Citizen ID
    target = id;
    subTag = '02'; // Citizen ID sub-tag
  } else {
    // Mobile phone. Format to: 0066 + phone number without leading 0
    let mobile = id;
    if (mobile.startsWith('0')) {
      mobile = mobile.substring(1);
    }
    target = '0066' + mobile;
    subTag = '01'; // Mobile phone sub-tag
  }

  // Tag 29: Merchant Account Information (Thai PromptPay)
  const aid = 'A000000677010111'; // Service ID
  const subTag00 = '00' + aid.length.toString().padStart(2, '0') + aid;
  const subTag01 = subTag + target.length.toString().padStart(2, '0') + target;
  const tag29Value = subTag00 + subTag01;
  const tag29 = '29' + tag29Value.length.toString().padStart(2, '0') + tag29Value;

  // Assembly of other tags
  const tag00 = '000201'; // Payload Version Indicator (01)
  const tag01 = '010212'; // Initiation Method (12 = Dynamic, 11 = Static)
  const tag53 = '5303764'; // Transaction Currency (764 = THB)
  
  // Formatting amount to 2 decimal places
  let tag54 = '';
  if (amount && amount > 0) {
    const amountStr = amount.toFixed(2);
    tag54 = '54' + amountStr.length.toString().padStart(2, '0') + amountStr;
  }
  
  const tag58 = '5802TH'; // Country Code (TH)
  
  // Combine all parts before CRC
  const rawPayload = tag00 + tag01 + tag29 + tag53 + tag54 + tag58 + '6304';
  
  // Compute and append CRC
  const checksum = crc16(rawPayload);
  return rawPayload + checksum;
}
