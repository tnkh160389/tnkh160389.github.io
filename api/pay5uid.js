export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: "Method Not Allowed" });

  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) {
    return res.status(500).json({ success: false, error: "Missing PI_API_KEY" });
  }

  const body = req.body || {};
  let targetList = [];
  
  if (Array.isArray(body.uids) && body.uids.length > 0) {
    targetList = body.uids.map(u => String(u).trim()).filter(Boolean);
  }

  const DEFAULT_5UIDS = [
    "42e4b976-a279-43e3-afc1-3f3e75db0e16",
    "42e3690a-ca9d-4726-bc94-43abd7cecb60",
    "6d7867e6-9abb-4f76-9cb4-85e146eee486",
    "6b6080ea-081c-4e34-8b81-91fd173b7c36",
    "a46fa764-7725-4f23-bbfc-554b358e33d3"
  ];
  
  if (targetList.length === 0) targetList = DEFAULT_5UIDS;
  const amount = Number(body.amount) || 1;
  const results = [];

  for (let i = 0; i < targetList.length; i++) {
    const uid = targetList[i];
    
    try {
      // BƯỚC 1: CREATE PAYMENT (Payload phẳng chuẩn Pi API)
      const createRes = await fetch('https://api.minepi.com/v2/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amount,
          memo: `Lovely Animals ${i+1}/${targetList.length}`,
          metadata: { target_uid: uid },
          uid: uid
        })
      });
      
      const createData = await createRes.json();
      if (!createRes.ok || !createData.identifier) {
        throw new Error(createData.error || "Create payment failed");
      }

      const paymentId = createData.identifier;

      // BƯỚC 2: APPROVE PAYMENT
      const approveRes = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      const approveData = await approveRes.json();
      if (!approveRes.ok) {
        throw new Error(approveData.error || "Approve payment failed");
      }

      // BƯỚC 3: COMPLETE PAYMENT
      const completeRes = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ txid: "mock_txid_" + Date.now() })
      });
      const completeData = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(completeData.error || "Complete payment failed");
      }

      // Nếu đi qua trót lọt cả 3 bước -> Thành công thật sự
      results.push({ uid, success: true, paymentId, data: completeData });

    } catch (e) {
      results.push({ uid, success: false, error: e.message });
    }

    if (i < targetList.length - 1) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  const successCount = results.filter(r => r.success).length;
  
  return res.status(successCount === results.length ? 200 : 207).json({
    success: successCount === results.length,
    successCount,
    total: results.length,
    results
  });
}
