import React, {useEffect, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import ApartmentsList from '../screens/ApartmentsList';
import ApartmentForm from '../screens/ApartmentForm';
import RoomForm from '../screens/RoomForm';
import RoomDetail from '../screens/RoomDetail';
import LeaseForm from '../screens/LeaseForm';
import LeaseDetail from '../screens/LeaseDetail';
import CycleDetail from '../screens/CycleDetail';
import InvoiceDetail from '../screens/InvoiceDetail';
import Reports from '../screens/Reports';
import Settings from '../screens/Settings';
import TenantsList from '../screens/TenantsList';
import TenantForm from '../screens/TenantForm';
import ApartmentActivityMonths from '../screens/ApartmentActivityMonths';
import ApartmentActivityDetail from '../screens/ApartmentActivityDetail';
import {initDb} from '../../db';
import {ensureRecurringChargesTable} from '../../db/index';
import {useNavTheme} from '../theme';
import {closeExpiredLeases} from '../../services/rent';
import {initNotifications} from '../../services/notifications';
import {I18nProvider, useI18n} from '../../i18n';
import {seedChargeCatalogOnce} from '../../services/rent';
// Nếu bạn có runMigrations:
// import {runMigrations} from '../../db/migrations';

export type RootStackParamList = {
  ApartmentsList: undefined;
  ApartmentForm: undefined;
  RoomForm: { apartmentId: string };
  RoomDetail: { roomId: string };
  LeaseForm: { roomId: string };
  LeaseDetail: { leaseId: string };
  CycleDetail: { cycleId: string };
  InvoiceDetail: { invoiceId: string };
  Reports: undefined;
  Settings: undefined;
  TenantsList: undefined;
  TenantForm: undefined;
  ApartmentActivityMonths: { apartmentId: string };
  ApartmentActivityDetail: { apartmentId: string; year: number; month: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppInner() {
  const navTheme = useNavTheme();
  const {ready} = useI18n();
  const [dbReady, setDbReady] = useState(false);

  useEffect(()=> {
    try {
      initDb();
      ensureRecurringChargesTable();
      //ensureOperatingExpensesTable();
      // runMigrations?.();
       seedChargeCatalogOnce();   
      initNotifications();
      closeExpiredLeases();
    } finally {
      setDbReady(true);
    }
  }, []);

  if (!ready || !dbReady) return null; // chờ cả i18n & DB

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator>
        <Stack.Screen name="ApartmentsList" component={ApartmentsList} options={{title:'Căn hộ'}} />
        <Stack.Screen name="ApartmentForm" component={ApartmentForm} options={{title:'Thêm căn hộ'}} />
        <Stack.Screen name="RoomForm" component={RoomForm} options={{title:'Phòng'}} />
        <Stack.Screen name="RoomDetail" component={RoomDetail} options={{title:'Chi tiết phòng'}} />
        <Stack.Screen name="LeaseForm" component={LeaseForm} options={{title:'Tạo hợp đồng'}} />
        <Stack.Screen name="LeaseDetail" component={LeaseDetail} options={{title:'Hợp đồng'}} />
        <Stack.Screen name="CycleDetail" component={CycleDetail} options={{title:'Chu kỳ'}} />
        <Stack.Screen name="InvoiceDetail" component={InvoiceDetail} options={{title:'Hóa đơn'}} />
        <Stack.Screen name="Reports" component={Reports} options={{title:'Báo cáo'}} />
        <Stack.Screen name="Settings" component={Settings} options={{title:'Cài đặt'}} />
        <Stack.Screen name="TenantsList" component={TenantsList} options={{title:'Người thuê'}} />
        <Stack.Screen name="TenantForm" component={TenantForm} options={{title:'Thêm người thuê'}} />
        <Stack.Screen name="ApartmentActivityMonths" component={ApartmentActivityMonths} options={{title:'Lịch sử hoạt động'}} />
        <Stack.Screen name="ApartmentActivityDetail" component={ApartmentActivityDetail} options={{title:'Hoạt động theo tháng'}} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  );
}
