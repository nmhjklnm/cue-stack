function readAllStdin() {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    process.stdin.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (!buf || buf.length === 0) return resolve('');

      // BOM detection for UTF-8
      if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
        return resolve(buf.slice(3).toString('utf8'));
      }

      // Default to UTF-8
      return resolve(buf.toString('utf8'));
    });
    process.stdin.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { readAllStdin, sleep };
