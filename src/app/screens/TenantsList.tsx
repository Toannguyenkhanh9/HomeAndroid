// src/app/screens/TenantsList.tsx
import React, {useCallback, useState} from 'react';
import {View, FlatList} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {listTenants} from '../../services/rent';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import ListItem from '../components/ListItem';
import EmptyState from '../components/EmptyState';
import {useFocusEffect} from '@react-navigation/native';
import {useThemeColors} from '../theme';
import {useTranslation} from 'react-i18next';

export default function TenantsList({navigation}: NativeStackScreenProps<RootStackParamList, 'TenantsList'>) {
  const {t} = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const c = useThemeColors();
  const reload = useCallback(()=> setRows(listTenants()), []);
  useFocusEffect(useCallback(()=>{ reload(); }, [reload]));

  return (
    <View style={{flex:1, padding:16, backgroundColor:'transparent'}}>
      <Header
        title={t('tenantsList.title')}
        right={<Button title={t('tenantsList.add')} onPress={()=>navigation.navigate('TenantForm')} />}
      />
      <FlatList
        data={rows}
        keyExtractor={(i)=>i.id}
        renderItem={({item})=>(
          <Card>
            <ListItem
              title={item.full_name}
              subtitle={`${item.phone||''} ${item.id_number? '· '+item.id_number:''}`}
            />
          </Card>
        )}
        ListEmptyComponent={<EmptyState title={t('tenantsList.empty')} />}
      />
    </View>
  );
}
