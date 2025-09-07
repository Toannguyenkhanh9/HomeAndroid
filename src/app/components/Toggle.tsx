import React from 'react';
import {TouchableOpacity, View} from 'react-native';

export default function Toggle({
  value, onChange,
}: { value: boolean; onChange: (v:boolean)=>void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={()=> onChange(!value)}
      style={{
        width:54, height:32, borderRadius:16,
        backgroundColor: value ? '#22C55E' : '#374151',
        padding:3, justifyContent:'center'
      }}>
      <View style={{
        width:26, height:26, borderRadius:13,
        backgroundColor: value ? '#0B1220' : '#111827',
        alignSelf: value ? 'flex-end' : 'flex-start',
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, elevation:3
      }}/>
    </TouchableOpacity>
  );
}
