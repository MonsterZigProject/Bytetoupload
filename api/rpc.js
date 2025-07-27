//V1
import Bundlr from '@bundlr-network/client';

export default async function handler(req, res) {
  const FileType = await import('file-type');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { method, params } = req.body;

    if (method === 'uploadToArweave') {
      const { privateKey, fileData } = params;

      if (!privateKey || !fileData) {
        return res.status(400).json({ error: "Missing privateKey or fileData" });
      }

      // Konversi fileData menjadi Buffer
      let buffer;
      if (Buffer.isBuffer(fileData)) {
        buffer = fileData;
      } else if (fileData.type === 'Buffer' && Array.isArray(fileData.data)) {
        buffer = Buffer.from(fileData.data);
      } else {
        return res.status(400).json({ error: "fileData must be a byte array (Buffer)" });
      }

      // Deteksi content-type
      const detectedType = await FileType.fileTypeFromBuffer(buffer);
      const contentType = detectedType ? detectedType.mime : 'application/octet-stream';

      // Inisialisasi bundlr
      const bundlr = new Bundlr('https://node1.bundlr.network', 'matic', privateKey);

      // Dapatkan harga aktual untuk file ini
      const price = await bundlr.getPrice(buffer.length);
      const bufferAmount = BigInt(10000); // buffer fee
      const totalNeeded = price + bufferAmount;

      let bundlrBalance = await bundlr.getLoadedBalance();

      console.log(`📦 Buffer size: ${buffer.length} bytes`);
      console.log(`💰 Upload price: ${price.toString()}`);
      console.log(`💼 Bundlr balance: ${bundlrBalance.toString()}`);

      // Jika balance tidak cukup, fund
      if (bundlrBalance < totalNeeded) {
        const fundAmount = totalNeeded - bundlrBalance;
        console.log(`🔄 Funding Bundlr with: ${fundAmount.toString()}`);
        try {
          await bundlr.fund(fundAmount);
          bundlrBalance = await bundlr.getLoadedBalance();
        } catch (fundErr) {
          console.error("❌ Failed to fund Bundlr:", fundErr);
          return res.status(500).json({ error: "Insufficient wallet MATIC balance for funding Bundlr", detail: fundErr.message });
        }
      }

      // Buat dan upload transaksi
      const tx = bundlr.createTransaction(buffer, {
        tags: [{ name: "Content-Type", value: contentType }]
      });

      await tx.sign();
      const result = await tx.upload();

      console.log("✅ Uploaded to Arweave:", `https://arweave.net/${tx.id}`);

      return res.status(200).json({
        result: `https://arweave.net/${tx.id}`,
        contentType,
        upload: result
      });
    }

    return res.status(400).json({ error: "Unknown method" });

  } catch (err) {
    console.error("🔥 Server error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
