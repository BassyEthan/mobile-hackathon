import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export async function uploadToConvex(
  uploadUrl: string,
  uri: string,
  contentType: string,
  onProgress: (fraction: number) => void,
) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': contentType }, body: blob });
    if (!response.ok) throw new Error(`Upload failed (${response.status})`);
    onProgress(1);
    return (await response.json()).storageId as string;
  }
  const result = await new File(uri).upload(uploadUrl, {
    httpMethod: 'POST',
    headers: { 'Content-Type': contentType },
    sessionType: 'foreground',
    onProgress: ({ bytesSent, totalBytes }) => {
      // The native upload callback can deliver these counters as BigInts.
      const sent = Number(bytesSent);
      const total = Number(totalBytes);
      if (Number.isFinite(sent) && Number.isFinite(total) && total > 0) {
        onProgress(Math.min(1, Math.max(0, sent / total)));
      }
    },
  });
  if (result.status < 200 || result.status >= 300) throw new Error(`Upload failed (${result.status})`);
  onProgress(1);
  return JSON.parse(result.body).storageId as string;
}
