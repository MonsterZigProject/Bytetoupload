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

      // Pastikan fileData adalah Buffer (byte)
      let buffer;
      if (Buffer.isBuffer(fileData)) {
        buffer = fileData;
      } else if (fileData.type === 'Buffer' && Array.isArray(fileData.data)) {
        // Jika dikirim sebagai JSON Buffer dari client (Node style)
        buffer = Buffer.from(fileData.data);
      } else {
        return res.status(400).json({ error: "fileData must be a byte array (Buffer)" });
      }

      // Deteksi MIME type
      const detectedType = await FileType.fileTypeFromBuffer(buffer);
      const contentType = detectedType ? detectedType.mime : 'application/octet-stream';

      const bundlr = new Bundlr('https://node1.bundlr.network', 'matic', privateKey);

      let bundlrBalance = await bundlr.getLoadedBalance();
      if (bundlrBalance < 1000000) {
        console.log("Low bundlr balance, funding...");
        await bundlr.fund(1000000);
        bundlrBalance = await bundlr.getLoadedBalance();
      }

      // Create, sign, upload
      const tx = bundlr.createTransaction(buffer, {
        tags: [{ name: "Content-Type", value: contentType }]
      });

      await tx.sign();
      const result = await tx.upload();

      console.log("✅ Uploaded to Arweave:", `https://arweave.net/${tx.id}`);

      return res.status(200).json({
        result: `https://node1.irys.xyz//${tx.id}`,
        contentType,
        upload: result
      });
    }

    return res.status(400).json({ error: "Unknown method" });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
