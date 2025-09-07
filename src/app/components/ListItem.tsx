import React from 'react';
import {TouchableOpacity, View, Text} from 'react-native';
import {useThemeColors} from '../theme';
export default function ListItem({title,subtitle,onPress,right,onLongPress}:{title:string;subtitle?:string;onPress?:()=>void;right?:any;onLongPress?:()=>void}){
  const c=useThemeColors();
  return (<TouchableOpacity onPress={onPress} onLongPress={onLongPress} style={{paddingVertical:10,paddingHorizontal:12,borderBottomWidth:1,borderBottomColor:c.border}}>
    <View style={{flexDirection:'row',alignItems:'center'}}>
      <View style={{flex:1}}>
        <Text style={{color:c.text,fontWeight:'700'}}>{title}</Text>
        {subtitle?<Text style={{color:c.subtext}}>{subtitle}</Text>:null}
      </View>
      <View>{right}</View>
    </View>
  </TouchableOpacity>);
}
