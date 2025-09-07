import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {useThemeColors} from '../theme';

type Opt = { label: string; value: string };

export default function Segmented({
  options, value, onChange, size = 'md',
}: {
  options: Opt[];
  value: string;
  onChange: (v: string) => void;
  size?: 'sm'|'md';
}) {
  const c = useThemeColors();
  const h = size === 'sm' ? 34 : 40;

  return (
    <View style={{flexDirection:'row', backgroundColor:c.card, borderRadius:12, padding:4}}>
      {options.map((o, idx)=> {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={()=> onChange(o.value)}
            style={{
              flex:1,
              height:h,
              borderRadius:10,
              backgroundColor: active ? c.accent : 'transparent',
              alignItems:'center',
              justifyContent:'center',
              marginLeft: idx===0?0:4
            }}
          >
            <Text style={{
              color: active ? (c.accentText ?? '#FFFFFF') : c.text,
              fontWeight: active ? '700' : '500'
            }}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
