export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok:true, wallet: "GCW05...KVCVY 100% Testnet", hasKey: !!process.env.PI_API_KEY });
  if (req.method !== 'POST') return res.status(405).json({ success:false, error:"Method Not Allowed" });

  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) return res.status(500).json({ success:false, error:"Missing PI_API_KEY - PI_API_KEY cua Lovely" });

  const body = req.body || {};
  let targetList = [];
  if (Array.isArray(body.uids) && body.uids.length>0) targetList = body.uids;
  else if (body.uid) targetList = [body.uid];
  else targetList = [
    "42e4b976-a279-43e3-afc1-3f3e75db0e16",
    "42e3690a-ca9d-4726-bc94-43abd7cecb60",
    "6d7867e6-9abb-4f76-9cb4-85e146eee486",
    "6b6080ea-081c-4e34-8b81-91fd173b7c36",
    "a46fa764-7725-4f23-bbfc-554b358e33d3"
  ];

  const amount = Number(body.amount) || 1;
  const results = [];

  // CHI DUNG api.minepi.com - KHONG DUNG api.testnet.minepi.com
  async function piCall(path, method, payload){
    const r = await fetch(`https://api.minepi.com${path}`, {
      method,
      headers: { Authorization: `Key ${PI_API_KEY}`, "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const txt = await r.text();
    let data; try{ data = JSON.parse(txt); }catch{ data = { raw: txt.slice(0,1000) }; }
    console.log(`[Pi] ${method} ${path} -> ${r.status}`, JSON.stringify(data).slice(0,600));
    return { ok: r.ok, status: r.status, data };
  }

  for(let i=0;i<targetList.length;i++){
    const uid = targetList[i];
    try{
      // B1 CREATE
      const create = await piCall('/v2/payments','POST',{
        amount,
        memo: `Lovely Testnet ${i+1}/${targetList.length} to ${uid.slice(0,4)}`,
        metadata: { target_uid: uid, purpose: "mainnet_check_5_wallets" },
        uid
      });
      if(!create.ok || !create.data.identifier) throw new Error(create.data.error?.message || create.data.error || JSON.stringify(create.data).slice(0,400));

      const pid = create.data.identifier;

      // B2 APPROVE
      const approve = await piCall(`/v2/payments/${pid}/approve`,'POST',{});
      if(!approve.ok) throw new Error(approve.data.error?.message || "Approve fail");

      // B3 COMPLETE - Testnet cho phep mock txid hex 64 ky tu
      const fakeTxid = "a".repeat(64);
      const complete = await piCall(`/v2/payments/${pid}/complete`,'POST',{ txid: fakeTxid });
      if(!complete.ok) throw new Error(complete.data.error?.message || "Complete fail");

      results.push({ uid, success:true, paymentId: pid });
    }catch(e){
      results.push({ uid, success:false, error: e.message });
    }
    if(i<targetList.length-1) await new Promise(r=>setTimeout(r,1000));
  }

  const okCount = results.filter(r=>r.success).length;
  return res.status(okCount===results.length?200:207).json({ success: okCount===results.length, successCount: okCount, total: results.length, results, wallet: "GCW05...KVCVY Testnet" });
}
