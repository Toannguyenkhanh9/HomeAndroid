import React from 'react';
import {View, Text, LayoutChangeEvent} from 'react-native';
import {useThemeColors} from '../theme';

export default function Header({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  const c = useThemeColors();
  const [rightW, setRightW] = React.useState(0);

  const onRightLayout = (e: LayoutChangeEvent) => {
    setRightW(e.nativeEvent.layout.width);
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      }}>
      {/* Spacer trái có width bằng đúng phần right để cân */}
      <View style={{width: rightW}} />

      {/* Tiêu đề chính giữa */}
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 20,
          fontWeight: '700',
          color: c.text,
          textAlign: 'center',
        }}>
        {title}
      </Text>

      {/* Khu vực nút bên phải */}
      <View onLayout={onRightLayout}>{right}</View>
    </View>
  );
}
