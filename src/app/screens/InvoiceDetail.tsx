import React,{useEffect,useState} from 'react';
import {View, Text, FlatList, Share, Platform} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {getInvoice, getInvoiceItems} from '../../services/rent';
import {exportInvoicePdf} from '../../services/pdf';
import {formatMoney} from '../../utils/currency';
import Card from '../components/Card';
import Header from '../components/Header';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {useUIStore} from '../store/ui';

export default function InvoiceDetail({route}: NativeStackScreenProps<RootStackParamList, 'InvoiceDetail'>) {
  const {invoiceId} = route.params;
  const [inv, setInv] = useState<any>();
  const [items, setItems] = useState<any[]>([]);
  const c = useThemeColors();
  const currency = useUIStore(s=>s.currency);

  const reload = () => { setInv(getInvoice(invoiceId)); setItems(getInvoiceItems(invoiceId)); };
  useEffect(reload, [invoiceId]);

  if (!inv) return <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text style={{color:c.text}}>Không tìm thấy hóa đơn</Text></View>;

  return (
    <View style={{flex:1, padding:16, backgroundColor: 'transparent'}}>
      <Header title="Hóa đơn" />
      <Card>
        <Text style={{color: c.text, fontWeight:'700'}}>Kỳ: {inv.period_start} → {inv.period_end}</Text>
        <Text style={{color: c.text}}>Tổng: {formatMoney(inv.total, currency)} — Trạng thái: {inv.status}</Text>
        <Button title="Xuất PDF" onPress={async ()=>{
          try {
            const path = await exportInvoicePdf(invoiceId);
            await Share.share({ url: Platform.OS === 'android' ? 'file://' + path : path, message: `Hóa đơn PDF: ${path}` });
          } catch(e:any){ alert(e?.message || 'Không thể xuất PDF'); }
        }} />
      </Card>

      <FlatList
        data={items}
        keyExtractor={(i)=>i.id}
        renderItem={({item})=> (
          <Card>
            <Text style={{color: c.text, fontWeight: '700'}}>{item.description}</Text>
            <Text style={{color: c.subtext}}>{item.quantity} {item.unit || ''} × {formatMoney(item.unit_price, currency)} = {formatMoney(item.amount, currency)}</Text>
          </Card>
        )}
      />
    </View>
  );
}
