import React, {useEffect} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import ApartmentsList from '../screens/ApartmentsList';
import ApartmentForm from '../screens/ApartmentForm';
import RoomForm from '../screens/RoomForm';
import LeaseForm from '../screens/LeaseForm';
import InvoiceGenerate from '../screens/InvoiceGenerate';
import InvoiceDetail from '../screens/InvoiceDetail';
import Reports from '../screens/Reports';
import Settings from '../screens/Settings';
import {initDb} from '../../db';
import {useNavTheme} from '../theme';

export type RootStackParamList = {
  ApartmentsList: undefined;
  ApartmentForm: undefined;
  RoomForm: { apartmentId: string };
  LeaseForm: { roomId: string };
  InvoiceGenerate: { leaseId: string };
  InvoiceDetail: { invoiceId: string };
  Reports: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const navTheme = useNavTheme();
  useEffect(()=>{ initDb(); },[]);
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator>
        <Stack.Screen name="ApartmentsList" component={ApartmentsList} options={{title:'Căn hộ'}} />
        <Stack.Screen name="ApartmentForm" component={ApartmentForm} options={{title:'Thêm căn hộ'}} />
        <Stack.Screen name="RoomForm" component={RoomForm} options={{title:'Phòng & Hợp đồng'}} />
        <Stack.Screen name="LeaseForm" component={LeaseForm} options={{title:'Tạo hợp đồng'}} />
        <Stack.Screen name="InvoiceGenerate" component={InvoiceGenerate} options={{title:'Tạo hóa đơn'}} />
        <Stack.Screen name="InvoiceDetail" component={InvoiceDetail} options={{title:'Hóa đơn'}} />
        <Stack.Screen name="Reports" component={Reports} options={{title:'Báo cáo'}} />
        <Stack.Screen name="Settings" component={Settings} options={{title:'Cài đặt'}} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}