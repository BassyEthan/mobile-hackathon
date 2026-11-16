import * as ImagePicker from 'expo-image-picker';

/**
 * Gets a square photo, either from the camera (front-facing to start; the system camera has its own flip button) or
 * from the photo library, uploads it to Convex storage and returns its storage ID. Returns null when they cancel.
 * Throws with a readable message when permission is refused or the upload fails.
 */
export async function pickAndUploadAvatar(source: 'camera' | 'library', getUploadUrl: () => Promise<string>): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 };
  let picked: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Allow Dumpling to use your camera in Settings to take a picture.');
    picked = await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front });
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Allow Dumpling to use your photos in Settings to add a picture.');
    picked = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  const blob = await (await fetch(asset.uri)).blob();
  const response = await fetch(await getUploadUrl(), {
    method: 'POST',
    headers: { 'Content-Type': asset.mimeType ?? blob.type ?? 'image/jpeg' },
    body: blob,
  });
  if (!response.ok) throw new Error('That picture did not upload. Check your connection and try again.');
  const { storageId } = (await response.json()) as { storageId: string };
  return storageId;
}
