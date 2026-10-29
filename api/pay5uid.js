export default async function handler(req, res) {
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
    return res.status(500).json({ success: false, error: "Missing PI_API_KEY" });
  }

  const body = req.body || {};
  let targetList = [];

  if (Array.isArray(body.uids) && body.uids.length > 0) {
    targetList = body.uids.map(u => typeof u === 'string' ? u.trim() : '').filter(Boolean);
  } else if (typeof body.uid === 'string' && body.uid.trim()) {
    targetList = [body.uid.trim()];
  }

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
      // TRÍCH XUẤT NGUYÊN VĂN BÁO LỖI TỪ PI CORE TEAM API
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

    if (i < targetList.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const successCount = results.filter(r => r.success).length;
  const allOk = successCount === results.length;

  return res.status(allOk ? 200 : 207).json({
    success: allOk,
    successCount,
    total: results.length,
    results
  });
}
