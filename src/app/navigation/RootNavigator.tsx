// src/app/navigation/RootNavigator.tsx
import React, { useEffect, useState } from 'react';
import { useColorScheme, PermissionsAndroid, Platform } from 'react-native';
import {
  NavigationContainer,
  DarkTheme as NavDarkTheme,
  DefaultTheme as NavLightTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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

import { initDb } from '../../db';
import { ensureRecurringChargesTable } from '../../db/index';
import { closeExpiredLeases, seedChargeCatalogOnce } from '../../services/rent';
import { initNotifications } from '../../services/notifications';
import { I18nProvider, useI18n } from '../../i18n';

import LeaseHistory from '../screens/LeaseHistory';
import LeaseHistoryDetail from '../screens/LeaseHistoryDetail';
import OperatingCosts from '../screens/OperatingCosts';
import OperatingCostDetail from '../screens/ApartmentActivityDetail';
import ApartmentReport from '../screens/ApartmentReport';
import OperatingCostSettings from '../screens/OperatingCostSettings';
import OperatingCostMonth from '../screens/OperatingCostMonth';
import Onboarding from '../screens/Onboarding';
import HelpScreen from '../screens/HelpScreen';
import HoldingDepositList from '../screens/HoldingDepositList';
import ReportsMonthly from '../screens/ReportsMonthly';
import ReportMonthDetail from '../screens/ReportMonthDetail';
import PricingPlans from  '../screens/PricingPlans';
import { useTranslation } from 'react-i18next';
import { bootstrapRentModule } from '../../services/rent';

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
  HelpScreen: undefined;
  HoldingDepositList: { apartmentId: string };
  ReportsMonthly: undefined;
  ReportMonthDetail: { year: number; month: number };
  PricingPlans: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const ONBOARD_KEY = 'has_seen_onboarding';

// Tạo theme trong suốt
const LightNavTheme = {
  ...NavLightTheme,
  colors: {
    ...NavLightTheme.colors,
    background: 'transparent',
  },
};
const DarkNavTheme = {
  ...NavDarkTheme,
  colors: {
    ...NavDarkTheme.colors,
    background: 'transparent',
  },
};
async function requestNotifPermissionAndroid13(t:any) {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title:  t('notify.title'),
        message: t('notify.message'),
        buttonPositive: t('notify.buttonPositive'),
        buttonNegative: t('notify.buttonNegative'),
      },
    );
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}

function AppInner() {
  const isDark = useColorScheme() === 'dark';
  const navTheme = isDark ? DarkNavTheme : LightNavTheme;

  const { ready } = useI18n();
  const { t } = useTranslation();

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
        bootstrapRentModule();
        (async () => {
          await requestNotifPermissionAndroid13(t);
          initNotifications(); // tạo channel
        })();
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
  }, [t]);

  if (!ready || !dbReady || showOnboarding === null) return null;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={showOnboarding ? 'Onboarding' : 'ApartmentsList'}
        screenOptions={{
          contentStyle: { backgroundColor: 'transparent' },
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: '#000',                 // ← icon/back & text header màu đen
          headerTitleStyle: { color: '#000' },  
        }}
      >
        <Stack.Screen
          name="Onboarding"
          component={Onboarding as any}
          options={{ headerShown: false }}
          initialParams={{
            onDone: async (navigation: any) => {
              await AsyncStorage.setItem(ONBOARD_KEY, '1');
              setShowOnboarding(false);
              navigation.replace('Leasea');
            },
          }}
        />
        <Stack.Screen
          name="ApartmentsList"
          component={ApartmentsList}
          options={{ title: t('brand.nameslogan') }}
          
        />
        <Stack.Screen
          name="ApartmentForm"
          component={ApartmentForm}
          options={{ title: t('nav.apartmentForm') }}
        />
        <Stack.Screen
          name="RoomForm"
          component={RoomForm}
          options={{ title: t('nav.roomForm') }}
        />
        <Stack.Screen
          name="RoomDetail"
          component={RoomDetail}
          options={{ title: t('nav.roomDetail') }}
        />
        <Stack.Screen
          name="LeaseForm"
          component={LeaseForm}
          options={{ title: t('nav.leaseForm') }}
        />
        <Stack.Screen
          name="LeaseDetail"
          component={LeaseDetail}
          options={{ title: t('nav.leaseDetail') }}
        />
        <Stack.Screen
          name="CycleDetail"
          component={CycleDetail}
          options={{ title: t('nav.cycleDetail') }}
        />
        <Stack.Screen
          name="InvoiceDetail"
          component={InvoiceDetail}
          options={{ title: t('nav.invoiceDetail') }}
        />
        <Stack.Screen
          name="Reports"
          component={Reports}
          options={{ title: t('nav.reports') }}
        />
        <Stack.Screen
          name="Settings"
          component={Settings}
          options={{ title: t('nav.settings') }}
        />
        <Stack.Screen
          name="TenantsList"
          component={TenantsList}
          options={{ title: t('nav.tenantsList') }}
        />
        <Stack.Screen
          name="TenantForm"
          component={TenantForm}
          options={{ title: t('nav.tenantForm') }}
        />
        <Stack.Screen
          name="ApartmentActivityMonths"
          component={ApartmentActivityMonths}
          options={{ title: t('nav.apartmentActivityMonths') }}
        />
        <Stack.Screen
          name="ApartmentActivityDetail"
          component={ApartmentActivityDetail}
          options={{ title: t('nav.apartmentActivityDetail') }}
        />
        <Stack.Screen
          name="LeaseHistory"
          component={LeaseHistory}
          options={{ title: t('nav.leaseHistory') }}
        />
        <Stack.Screen
          name="LeaseHistoryDetail"
          component={LeaseHistoryDetail}
          options={{ title: t('nav.leaseHistoryDetail') }}
        />
        <Stack.Screen
          name="OperatingCosts"
          component={OperatingCosts}
          options={{ title: t('nav.operatingCosts') }}
        />
        <Stack.Screen
          name="OperatingCostDetail"
          component={OperatingCostDetail}
          options={{ title: t('nav.operatingCostDetail') }}
        />
        <Stack.Screen
          name="ApartmentReport"
          component={ApartmentReport}
          options={{ title: t('nav.apartmentReport') }}
        />
        <Stack.Screen
          name="OperatingCostSettings"
          component={OperatingCostSettings}
          options={{ title: t('nav.operatingCostSettings') }}
        />
        <Stack.Screen
          name="OperatingCostMonth"
          component={OperatingCostMonth}
          options={{ title: t('nav.operatingCostMonth') }}
        />
        <Stack.Screen
          name="HelpScreen"
          component={HelpScreen}
          options={{ title: t('nav.help') }}
        />
        <Stack.Screen
          name="HoldingDepositList"
          component={HoldingDepositList}
          options={{ title: t('holdingDeposits.title') }}
        />
        <Stack.Screen
          name="ReportsMonthly"
          component={ReportsMonthly}
          options={{ title: t('reports.title') }}
        />
        <Stack.Screen
          name="ReportMonthDetail"
          component={ReportMonthDetail}
          options={{ title: t('nav.reportmonthdetail') }}
        />
       <Stack.Screen
          name="PricingPlans"
          component={PricingPlans}
          options={{ title: t('nav.reportmonthdetail') }}
        />
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
