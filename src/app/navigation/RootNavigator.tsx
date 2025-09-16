// src/app/navigation/RootNavigator.tsx
import React, {useEffect, useState} from 'react';
import {useColorScheme} from 'react-native';
import {
  NavigationContainer,
  DarkTheme as NavDarkTheme,
  DefaultTheme as NavLightTheme,
} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
import {closeExpiredLeases, seedChargeCatalogOnce} from '../../services/rent';
import {initNotifications} from '../../services/notifications';
import {I18nProvider, useI18n} from '../../i18n';

import LeaseHistory from '../screens/LeaseHistory';
import LeaseHistoryDetail from '../screens/LeaseHistoryDetail';
import OperatingCosts from '../screens/OperatingCosts';
import OperatingCostDetail from '../screens/ApartmentActivityDetail';
import ApartmentReport from '../screens/ApartmentReport';
import OperatingCostSettings from '../screens/OperatingCostSettings';
import OperatingCostMonth from '../screens/OperatingCostMonth';
import Onboarding from '../screens/Onboarding';

export type RootStackParamList = {
  Onboarding: undefined;
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
  LeaseHistory: { roomId: string };
  LeaseHistoryDetail: { leaseId: string };
  OperatingCosts: { apartmentId: string };
  OperatingCostDetail: { apartmentId: string; ym: string };
  ApartmentReport: { apartmentId: string };
  OperatingCostMonth: { apartmentId: string; ym: string };
  OperatingCostSettings: { apartmentId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const ONBOARD_KEY = 'has_seen_onboarding';

function AppInner() {
  // Dùng theme của hệ thống (hoặc thay bằng store/theme context của bạn)
  const isDark = useColorScheme() === 'dark';
  const navTheme = isDark ? NavDarkTheme : NavLightTheme;

  const {ready} = useI18n();

  const [dbReady, setDbReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        initDb();
        ensureRecurringChargesTable();
        seedChargeCatalogOnce();
        initNotifications();
        closeExpiredLeases();
      } finally {
        setDbReady(true);
      }
      try {
        const v = await AsyncStorage.getItem(ONBOARD_KEY);
        setShowOnboarding(v ? false : true);
      } catch {
        setShowOnboarding(true);
      }
    })();
  }, []);

  if (!ready || !dbReady || showOnboarding === null) return null;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={showOnboarding ? 'Onboarding' : 'ApartmentsList'}>
        <Stack.Screen
          name="Onboarding"
          component={Onboarding as any}
          options={{headerShown: false}}
          initialParams={{
            onDone: async (navigation: any) => {
              await AsyncStorage.setItem(ONBOARD_KEY, '1');
              setShowOnboarding(false);
              navigation.replace('ApartmentsList');
            },
          }}
        />

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
        <Stack.Screen name="LeaseHistory" component={LeaseHistory} options={{title:'Lịch sử hợp đồng'}} />
        <Stack.Screen name="LeaseHistoryDetail" component={LeaseHistoryDetail} options={{title:'Chi tiết hợp đồng'}} />
        <Stack.Screen name="OperatingCosts" component={OperatingCosts} />
        <Stack.Screen name="OperatingCostDetail" component={OperatingCostDetail} />
        <Stack.Screen name="ApartmentReport" component={ApartmentReport} />
        <Stack.Screen name="OperatingCostSettings" component={OperatingCostSettings} />
        <Stack.Screen name="OperatingCostMonth" component={OperatingCostMonth} />
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
