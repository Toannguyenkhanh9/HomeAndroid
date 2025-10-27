// src/components/HiddenVietQR.tsx
import React, { useEffect, useRef } from 'react';
import QRCode from 'react-native-qrcode-svg';
import RNFS from 'react-native-fs';
import { View } from 'react-native';

type Props = {
  payload: string;
  filename: string; // không có đuôi
  size?: number;    // px
  onDone: (filePath: string) => void;
  onError?: (e: any) => void;
};

export default function HiddenVietQR({
  payload,
  filename,
  size = 720,
  onDone,
  onError,
}: Props) {
  const ref = useRef<any>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        ref.current?.toDataURL(async (b64: string) => {
          try {
            const path = `${RNFS.CachesDirectoryPath}/${filename}.png`;
            await RNFS.writeFile(path, b64, 'base64');
            onDone(path);
          } catch (e) {
            onError?.(e);
          }
        });
      } catch (e) {
        onError?.(e);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [payload, filename]);

  return (
    <View style={{ width: 1, height: 1, position: 'absolute', opacity: 0 }}>
      <QRCode
        value={payload}
        size={size}
        backgroundColor="white"
        color="black"
        getRef={(c) => (ref.current = c)}
      />
    </View>
  );
}
