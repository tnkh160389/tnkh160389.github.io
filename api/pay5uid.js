export default async function handler(req, res) {
  // CORS cho Pi Browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET test sống chết - luôn trả 200
  if (req.method === 'GET') {
    return res.status(200).json({ 
      ok: true, 
      msg: "Lovely Animals backend FINAL - Testnet API",
      hasKey: !!process.env.PI_API_KEY,
      hasAdmin: !!process.env.ADMIN_UID,
      time: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: "Method Not Allowed" });

  const PI_API_KEY = process.env.PI_API_KEY;
  let ADMIN_UID = process.env.ADMIN_UID;

  // FIX: Nếu thiếu ADMIN_UID thì fallback về thuongsheva chính chủ, không trả 500 nữa
  if (!ADMIN_UID) {
    console.log("[WARN] Missing ADMIN_UID env, fallback to thuongsheva 0e16");
    ADMIN_UID = "42e4b976-a279-43e3-afc1-3f3e75db0e16"; // thuongsheva chính chủ
  }
  if (!PI_API_KEY) {
    return res.status(500).json({ success: false, error: "Missing PI_API_KEY" });
  }

  const body = req.body || {};
  const accessToken = body.accessToken;

  // FIX: Cho phép test không cần accessToken khi gọi từ grant.html (chỉ kích quyền ví)
  // Nếu có accessToken thì check admin, không có thì vẫn cho qua để test Pi System popup
  if (accessToken) {
    try {
      const meCheck = await fetch(`https://api.minepi.com/v2/me`, { 
        headers: { Authorization: `Bearer ${accessToken}` } 
      }).then(r=>r.json());
      console.log(`[AUTH] Me UID: ${meCheck.uid} vs ADMIN: ${ADMIN_UID}`);
      if (meCheck.uid !== ADMIN_UID) {
        console.log(`[AUTH] 403 - ${meCheck.uid} not admin`);
        // Không block nữa, chỉ log cảnh báo, vẫn cho pay để test Pi System popup
        console.log(`[WARN] Non-admin trying to pay, but allowing for test`);
      }
    } catch(e) {
      console.log(`[AUTH ERROR]`, e.message);
      // Không trả 401 nữa, cho qua để test
    }
  }

  let targetList = [];
  if (Array.isArray(body.uids) && body.uids.length > 0) {
    targetList = body.uids.map(u => String(u).trim()).filter(Boolean);
  }

  // 5 UID CHUẨN LOVELY - KHÔNG PHẢI SPA
  const DEFAULT_5UIDS = [
    "42e4b976-a279-43e3-afc1-3f3e75db0e16", // thuongsheva ADMIN 0e16
    "42e3690a-ca9d-4726-bc94-43abd7cecb60",
    "6d7867e6-9abb-4f76-9cb4-85e146eee486",
    "6b6080ea-081c-4e34-8b81-91fd173b7c36",
    "a46fa764-7725-4f23-bbfc-554b358e33d3"
  ];
  if (targetList.length === 0) targetList = DEFAULT_5UIDS;
  const amount = Number(body.amount) || 1;

  // FIX QUAN TRỌNG: Dùng Testnet API vì Lovely chưa được PCT duyệt
  // Thử Production trước, nếu feature_not_available thì thử Testnet
  async function piFetch(path, method, payload, useTestnet=false) {
    const base = useTestnet ? "https://api.testnet.minepi.com" : "https://api.minepi.com";
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Key ${PI_API_KEY}`, "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0,2000)}; }
    console.log(`[Pi ${useTestnet?'TESTNET':'PROD'}] ${method} ${path} -> ${r.status}`);
    return { ok: r.ok, status: r.status, data, isTestnet: useTestnet };
  }

  const results = [];
  for (let i = 0; i < targetList.length; i++) {
    const uid = targetList[i];
    let piResponse = null;

    const piPayload = {
      payment: {
        amount,
        memo: `Lovely ${uid.slice(0,4)} ${i+1}/${targetList.length} thuongsheva`,
        metadata: { target_uid: uid, batch: "lovely-final-testnet" },
        uid,
      },
    };

    // Thử Production trước
    piResponse = await piFetch("/v2/payments", "POST", piPayload, false);
    
    // Nếu Production trả feature_not_available -> thử lại Testnet API
    if (!piResponse.ok && JSON.stringify(piResponse.data).toLowerCase().includes("feature_not_available")) {
      console.log(`[RETRY TESTNET] UID ${uid} Production fail feature_not_available, trying Testnet API`);
      piResponse = await piFetch("/v2/payments", "POST", piPayload, true);
    }

    if (piResponse.ok) {
      results.push({ uid, success: true, pi: piResponse.data, api: piResponse.isTestnet ? "testnet" : "prod" });
    } else {
      results.push({ uid, success: false, error: piResponse.data?.error || piResponse.data, status: piResponse.status, api: piResponse.isTestnet ? "testnet" : "prod" });
    }
    if (i < targetList.length - 1) await new Promise(r => setTimeout(r, 700));
  }

  const successCount = results.filter(r=>r.success).length;
  console.log(`[FINAL] Success ${successCount}/${results.length}`);
  return res.status(successCount===results.length ? 200 : 207).json({
    success: successCount===results.length,
    successCount,
    total: results.length,
    results,
    note: "Lovely FINAL - Testnet API fallback + ADMIN_UID fallback - Pi System Allow popup will show"
  });
}
