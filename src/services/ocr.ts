// // yarn add react-native-image-picker react-native-text-recognition
// import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
// import TextRecognition from 'react-native-text-recognition';

// export async function pickMeterImage(): Promise<{ uri: string | null }> {
//   const res = await launchImageLibrary({ mediaType:'photo', selectionLimit:1 });
//   const uri = res.assets?.[0]?.uri || null;
//   return { uri };
// }
// export async function captureMeterImage(): Promise<{ uri: string | null }> {
//   const res = await launchCamera({ mediaType:'photo' });
//   const uri = res.assets?.[0]?.uri || null;
//   return { uri };
// }
// export async function ocrDigitsFromImage(uri: string): Promise<{ reading: number|null; raw: string }> {
//   const lines = await TextRecognition.recognize(uri); // trả về mảng text
//   const raw = (lines || []).join(' ');
//   const m = raw.replace(/[^\d]/g,'');
//   return { reading: m ? Number(m) : null, raw };
// }
