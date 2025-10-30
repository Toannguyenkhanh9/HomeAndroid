import {PermissionsAndroid, Platform, Alert} from 'react-native';
import {launchCamera, CameraOptions} from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';

async function ensureCameraPerm(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const cam = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA
  );
  if (cam !== PermissionsAndroid.RESULTS.GRANTED) return false;

  if (Platform.Version >= 33) {
    const img = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
    );
    return img === PermissionsAndroid.RESULTS.GRANTED;
  } else {
    const read = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
    );
    return read === PermissionsAndroid.RESULTS.GRANTED;
  }
}

export async function pickMeterImage(): Promise<string | null> {
  const ok = await ensureCameraPerm();
  if (!ok) {
    Alert.alert('Permission', 'Vui lòng cấp quyền Camera/Ảnh để chụp công tơ.');
    return null;
  }

  const opts: CameraOptions = {
    mediaType: 'photo',
    cameraType: 'back',
    includeBase64: false,
    saveToPhotos: false,
    quality: 0.85,
    presentationStyle: 'fullScreen',
  };

  const res = await launchCamera(opts);

  if (res.didCancel) return null;
  if (res.errorCode) {
    console.warn('ImagePicker error', res.errorCode, res.errorMessage);
    Alert.alert('Lỗi camera', res.errorMessage || res.errorCode);
    return null;
  }

  return res?.assets?.[0]?.uri ?? null;
}

export async function ocrDigitsFromImage(localUri: string): Promise<number | null> {
  const result = await TextRecognition.recognize(localUri);
  const hits = (result?.text || '').match(/\d[\d.,]*/g) || [];
  let best: string | null = null, bestLen = -1;
  for (const h of hits) {
    const only = h.replace(/[^\d]/g, '');
    if (only.length > bestLen) { best = only; bestLen = only.length; }
  }
  return best ? parseInt(best, 10) : null;
}
