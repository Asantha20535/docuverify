export async function generateSHA256Hash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export function generateQRCodeSVG(text: string): string {
  // Simple QR code placeholder - in a real app you'd use a QR code library
  return `
    <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" fill="white"/>
      <text x="100" y="100" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="12">
        QR: ${text.substring(0, 8)}...
      </text>
    </svg>
  `;
}
