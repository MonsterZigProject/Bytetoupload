import Bundlr from '@bundlr-network/client';
import { ethers } from 'ethers';

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

      // Inisialisasi bundlr dan ethers wallet
      const bundlr = new Bundlr('https://node1.bundlr.network', 'matic', privateKey);
      const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
      const wallet = new ethers.Wallet(privateKey, provider);

      // Dapatkan harga aktual untuk file ini
      const price = await bundlr.getPrice(buffer.length);
      const bufferAmount = BigInt(10000); // buffer fee
      const totalNeeded = price + bufferAmount;

      // Cek saldo Bundlr internal
      let bundlrBalance = await bundlr.getLoadedBalance();

      // Cek saldo native MATIC wallet
      const nativeBalance = await wallet.getBalance();

      console.log(`📦 Buffer size: ${buffer.length} bytes`);
      console.log(`💰 Upload price: ${price.toString()}`);
      console.log(`💼 Bundlr balance (internal): ${bundlrBalance.toString()}`);
      console.log(`💸 Wallet MATIC balance: ${ethers.utils.formatEther(nativeBalance)}`);

      // Jika saldo Bundlr kurang, cek saldo wallet dan fund
      if (bundlrBalance < totalNeeded) {
        const fundAmount = totalNeeded - bundlrBalance;

        if (nativeBalance.lt(fundAmount)) {
          return res.status(400).json({
            error: "Insufficient native MATIC balance in wallet to fund Bundlr",
            required: ethers.utils.formatEther(fundAmount),
            current: ethers.utils.formatEther(nativeBalance)
          });
        }

        try {
          console.log(`🔄 Funding Bundlr with: ${fundAmount.toString()}`);
          await bundlr.fund(fundAmount);
          bundlrBalance = await bundlr.getLoadedBalance();
          console.log('✅ Fund success. New Bundlr balance:', bundlrBalance.toString());
        } catch (fundErr) {
          console.error("❌ Failed to fund Bundlr:", fundErr);
          return res.status(500).json({ error: "Failed to fund Bundlr", detail: fundErr.message });
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
