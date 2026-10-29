export default async function handler(req, res) {
  // 1. Cấu hình CORS để vượt qua rào cản trình duyệt di động / Pi Browser
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 2. Phản hồi nhanh cho request OPTIONS kiểm tra từ trình duyệt
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. Chỉ cho phép phương thức POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  // 4. Kiểm tra khóa API từ môi trường Vercel
  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) {
    return res.status(500).json({ success: false, error: "Missing PI_API_KEY" });
  }

  // 5. Đọc dữ liệu gửi lên từ Frontend
  const body = req.body || {};
  let targetList = [];

  if (Array.isArray(body.uids) && body.uids.length > 0) {
    targetList = body.uids.map(u => typeof u === 'string' ? u.trim() : '').filter(Boolean);
  } else if (typeof body.uid === 'string' && body.uid.trim()) {
    targetList = [body.uid.trim()];
  }

  // Danh sách dự phòng 5 UIDs mặc định của dự án Lovely Animals
  const DEFAULT_LOVELY_5UIDS = [
    "42e4b976-a279-43e3-afc1-3f3e75db0e16",
    "42e3690a-ca9d-4726-bc94-43abd7cecb60",
    "6d7867e6-9abb-4f76-9cb4-85e146eee486",
    "6b6080ea-081c-4e34-8b81-91fd173b7c36",
    "a46fa764-7725-4f23-bbfc-554b358e33d3"
  ];
  
  if (targetList.length === 0) {
    targetList = DEFAULT_LOVELY_5UIDS;
  }

  const amount = Number(body.amount) || 1;

  // 6. Hàm hỗ trợ gọi trực tiếp tới Pi Core Team API
  async function piFetch(path, method = "GET", payload) {
    const r = await fetch(`https://api.minepi.com${path}`, {
      method,
      headers: {
        Authorization: `Key ${PI_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    
    const text = await r.text();
    let data;
    try { 
      data = text ? JSON.parse(text) : {}; 
    } catch { 
      data = { raw: text.slice(0, 3000) }; 
    }
    return { ok: r.ok, status: r.status, data };
  }

  const results = [];

  // 7. Vòng lặp xử lý gửi yêu cầu thanh toán lần lượt qua từng UID
  for (let i = 0; i < targetList.length; i++) {
    const uid = targetList[i];
    
    const piPayload = {
      payment: {
        amount,
        memo: `Lovely Animals Reward - ${i + 1}/${targetList.length}`,
        metadata: { target_uid: uid, batch_index: i },
        uid,
      },
    };

    const piResponse = await piFetch("/v2/payments", "POST", piPayload);

    if (piResponse.ok) {
      results.push({ uid, success: true, pi_response: piResponse.data });
    } else {
      // Trích xuất nguyên văn báo lỗi từ Pi API (ví dụ: feature_not_available,...)
      const piErrMsg = piResponse.data?.message 
        || piResponse.data?.error 
        || JSON.stringify(piResponse.data);

      results.push({ 
        uid, 
        success: false, 
        error: piErrMsg, 
        status: piResponse.status 
      });
    }

    // Delay nhẹ 500ms giữa các request để tránh bị nghẽn mạng / rate limit
    if (i < targetList.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const successCount = results.filter(r => r.success).length;
  const allOk = successCount === results.length;

  // 8. Trả về kết quả tổng hợp cho Frontend hiển thị
  return res.status(allOk ? 200 : 207).json({
    success: allOk,
    successCount,
    total: results.length,
    results
  });
}
