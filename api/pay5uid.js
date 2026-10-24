export default async function handler(req, res) {
  // CORS Headers chống lỗi Failed to fetch từ GitHub Pages sang Vercel
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) {
    return res.status(500).json({ success: false, error: "Missing PI_API_KEY in environment variables" });
  }

  const body = req.body || {};
  let targetList = [];

  if (Array.isArray(body.uids) && body.uids.length > 0) {
    targetList = body.uids.map(u => typeof u === 'string' ? u.trim() : '').filter(Boolean);
  } else if (typeof body.uid === 'string' && body.uid.trim()) {
    targetList = [body.uid.trim()];
  }

  // Bộ 5 UID Mainnet chuẩn xác 100% của Lovely Animals (Đã cập nhật mới nhất)
  const DEFAULT_LOVELY_5UIDS = [
    "42e4b976-a279-43e3-afc1-3f3e75db0e16", // thuongsheva
    "42e3690a-ca9d-4726-bc94-43abd7cecb60", // UID 2
    "6d7867e6-9abb-4f76-9cb4-85e146eee486", // phithuong07
    "6b6080ea-081c-4e34-8b81-91fd173b7c36", // UID 4
    "a46fa764-7725-4f23-bbfc-554b358e33d3"  // dttngan123
  ];
  
  if (targetList.length === 0) {
    targetList = DEFAULT_LOVELY_5UIDS;
  }

  const amount = Number(body.amount) || 1;

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

  async function cancelOngoingIfFound(piErrorData) {
    try {
      let paymentId = null;
      if (piErrorData?.payment?.identifier) paymentId = piErrorData.payment.identifier;
      if (!paymentId && piErrorData?.identifier) paymentId = piErrorData.identifier;
      if (!paymentId && piErrorData?.ongoing_payment?.identifier) paymentId = piErrorData.ongoing_payment.identifier;
      
      if (!paymentId) {
        const inc = await piFetch("/v2/payments/incomplete", "GET");
        const list = inc.data?.incomplete_payments || inc.data || [];
        if (Array.isArray(list) && list.length > 0) {
          paymentId = list[0].identifier;
        }
      }

      if (paymentId) {
        let result = await piFetch(`/v2/payments/${paymentId}/complete`, "POST", { 
          txid: "lovelyanimals_retry_complete" 
        });
        
        if (!result.ok) {
          result = await piFetch(`/v2/payments/${paymentId}/cancel`, "POST");
        }
        return { cancelled: result.ok, paymentId, result: result.data };
      }
    } catch (e) {
      console.error("Lỗi khi xử lý ongoing payment:", e);
    }
    return { cancelled: false };
  }

  const results = [];

  for (let i = 0; i < targetList.length; i++) {
    const uid = targetList[i];
    let attempt = 0;
    let finalResult = null;

    while (attempt < 3) {
      attempt++;
      const piPayload = {
        payment: {
          amount,
          memo: `Lovely Animals Reward to @${uid.substring(0, 6)} - ${i + 1}/${targetList.length}`,
          metadata: { target_uid: uid, batch_index: i, attempt, env: "mainnet" },
          uid,
        },
      };

      const piResponse = await piFetch("/v2/payments", "POST", piPayload);

      if (piResponse.ok) {
        finalResult = { uid, success: true, pi_response: piResponse.data, attempts: attempt };
        break;
      } else {
        const errStr = JSON.stringify(piResponse.data).toLowerCase();
        
        if (errStr.includes("ongoing_payment_found") || errStr.includes("ongoing payment")) {
          const cancelRes = await cancelOngoingIfFound(piResponse.data);
          if (cancelRes.cancelled) {
            finalResult = { uid, success: false, retrying: true, cancelled_old: cancelRes.paymentId };
            continue;
          } else {
            finalResult = { 
              uid, 
              success: false, 
              error: "ongoing_payment_found but cannot resolve", 
              details: piResponse.data, 
              status: piResponse.status 
            };
            break;
          }
        } else {
          finalResult = { 
            uid, 
            success: false, 
            error: "Pi API rejected", 
            details: piResponse.data, 
            status: piResponse.status, 
            attempts: attempt 
          };
          break;
        }
      }
    }

    if (finalResult && finalResult.retrying) {
      const lastPayload = {
        payment: { 
          amount, 
          memo: `Lovely Animals Retry ${uid.substring(0, 6)}`, 
          metadata: { target_uid: uid, is_retry: true }, 
          uid 
        }
      };
      const lastResp = await piFetch("/v2/payments", "POST", lastPayload);
      finalResult = lastResp.ok 
        ? { uid, success: true, pi_response: lastResp.data } 
        : { uid, success: false, error: "Failed after resolving ongoing payment", details: lastResp.data };
    }

    results.push(finalResult);
    
    if (i < targetList.length - 1) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  const successCount = results.filter(r => r.success).length;
  const allOk = successCount === results.length;

  return res.status(allOk ? 200 : 207).json({
    success: allOk,
    successCount,
    total: results.length,
    results,
    note: "Lovely Animals Mainnet A2U Batch Payment Complete"
  });
}
