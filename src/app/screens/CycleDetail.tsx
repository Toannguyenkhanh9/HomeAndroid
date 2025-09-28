// src/app/screens/CycleDetail.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Card from '../components/Card';
import Button from '../components/Button';
import FormInput from '../components/FormInput';
import { useThemeColors } from '../theme';
import {
  getCycle,
  getLease,
  getInvoice,
  getInvoiceItems,
  listChargesForLease,
  settleCycleWithInputs,
  updateRecurringChargePrice,
  getRoom,
  getTenant,
  isLastCycle,
  endLeaseWithSettlement,
  extendLeaseAndAddCycles,
} from '../../services/rent';
import { useCurrency } from '../../utils/currency';
import {
  formatNumber as groupVN,
  formatIntTyping,
  formatDecimalTypingVNStrict,
  parseDecimalCommaStrict,
} from '../../utils/number';

import RNHTMLtoPDF from 'react-native-html-to-pdf';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { useSettings } from '../state/SettingsContext';
import { formatDateISO } from '../../utils/date';
import { useTranslation } from 'react-i18next';
import Share from 'react-native-share';

// 🔔 notifications
import { scheduleReminder, cancelReminder } from '../../services/notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RNPrint from 'react-native-print';
import pdfMake from 'pdfmake/build/pdfmake';
import vfsFonts from 'pdfmake/build/vfs_fonts';
(pdfMake as any).vfs = (vfsFonts as any).vfs ?? (vfsFonts as any).pdfMake?.vfs;

import RNBlob from 'react-native-blob-util';

(pdfMake as any).fonts = {
   Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};
type Props = NativeStackScreenProps<RootStackParamList, 'CycleDetail'> & {
  route: { params: { cycleId: string; onSettled?: () => void } };
};

type ChargeRow = {
  charge_type_id: string;
  name: string;
  unit?: string | null;
  is_variable: number;
  unit_price: number;
  meter_start?: number;
  value: string;
};

type ExtraItem = { name: string; amount: string };

// Helpers
function parseAmountInt(s: string) {
  const digits = (s || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

// ➕ Format tiền VN khi đang gõ: ngăn nghìn bằng ".", thập phân bằng ","
function formatVNMoneyTyping(input: string) {
  if (!input) return '';
  // chỉ giữ chữ số và dấu phẩy
  let s = input.replace(/[^\d,]/g, '');
  // tách phần nguyên / thập phân (chỉ 1 dấu phẩy)
  const [rawInt = '', ...rest] = s.split(',');
  const rawDec = rest.join('').replace(/,/g, '');
  // bỏ 0 đầu nhưng vẫn cho "0" khi người dùng gõ 0
  const int = rawInt.replace(/^0+(?=\d)/, '');
  // chèn dấu chấm ngăn nghìn
  const groupedInt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rawDec ? `${groupedInt},${rawDec}` : groupedInt;
}

export default function CycleDetail({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { dateFormat, language } = useSettings();
  const { cycleId, onSettled } = route.params as any;
  const c = useThemeColors();
  const { format } = useCurrency();

  const viewShotRef = useRef<ViewShot>(null);
  const scrollRef = useRef<ScrollView>(null);

  const [leaseId, setLeaseId] = useState<string>('');
  const [leaseInfo, setLeaseInfo] = useState<any>(null);
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [invId, setInvId] = useState<string | undefined>();
  const [invTotal, setInvTotal] = useState<number>(0);
  const [status, setStatus] = useState<'open' | 'settled'>('open');
  const [period, setPeriod] = useState<{ s: string; e: string }>({
    s: '',
    e: '',
  });

  const [roomCode, setRoomCode] = useState<string>('');
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantPhone, setTenantPhone] = useState<string>('');

  const [settledItems, setSettledItems] = useState<any[]>([]);
  const [currentReadings, setCurrentReadings] = useState<
    Record<string, number>
  >({});

  const [editMode, setEditMode] = useState(false);
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const addExtra = () => setExtras(prev => [...prev, { name: '', amount: '' }]);
  const updateExtra = (i: number, patch: Partial<ExtraItem>) =>
    setExtras(prev =>
      prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)),
    );
  const removeExtra = (i: number) =>
    setExtras(prev => prev.filter((_, idx) => idx !== i));

  const [showEndModal, setShowEndModal] = useState(false);
  const [endExtras, setEndExtras] = useState<ExtraItem[]>([]);
  const addEndExtra = () => setEndExtras(p => [...p, { name: '', amount: '' }]);
  const updEndExtra = (i: number, patch: Partial<ExtraItem>) =>
    setEndExtras(p => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const delEndExtra = (i: number) =>
    setEndExtras(p => p.filter((_, idx) => idx !== i));
  const endExtrasTotal = useMemo(
    () => endExtras.reduce((s, it) => s + parseAmountInt(it.amount), 0),
    [endExtras],
  );
  const [depositPreview, setDepositPreview] = useState<number>(0);

  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendCount, setExtendCount] = useState<string>('');

  const isFixedTerm = useMemo(() => {
    if (!leaseInfo) return false;
    const billing = String(leaseInfo.billing_cycle);
    if (billing === 'monthly') return !!leaseInfo.end_date;
    if (billing === 'daily') return Number(leaseInfo.duration_days || 0) > 0;
    return false;
  }, [leaseInfo]);

  const reload = () => {
    const cyc = getCycle(cycleId);
    if (!cyc) return;
    setStatus(String(cyc.status) as any);
    setPeriod({ s: cyc.period_start, e: cyc.period_end });

    const lease = getLease(cyc.lease_id);
    setLeaseId(lease.id);
    setLeaseInfo(lease);
    setDepositPreview(Number(lease.deposit_amount || 0));

    try {
      const r = lease?.room_id ? getRoom(lease.room_id) : null;
      setRoomCode(r?.code || '');
    } catch {}
    try {
      const tnt = lease?.tenant_id ? getTenant(lease.tenant_id) : null;
      setTenantName(tnt?.full_name || '');
      setTenantPhone(tnt?.phone || '');
    } catch {}

    if (cyc.invoice_id) {
      setInvId(cyc.invoice_id);
      const inv = getInvoice(cyc.invoice_id);
      setInvTotal(inv?.total || 0);

      const items = getInvoiceItems(cyc.invoice_id) as any[];
      setSettledItems(items || []);

      const map: Record<string, number> = {};
      for (const it of items) {
        if (it.charge_type_id && it.meta_json) {
          try {
            const m = JSON.parse(it.meta_json);
            if (typeof m?.meter_end === 'number')
              map[it.charge_type_id] = m.meter_end;
          } catch {}
        }
      }
      setCurrentReadings(map);
      setRows([]);
    } else {
      const list = listChargesForLease(lease.id) as any[];
      const normalized: ChargeRow[] = list.map(it => ({
        charge_type_id: it.charge_type_id,
        name: it.name,
        unit: it.unit,
        is_variable: Number(it.is_variable),
        unit_price: Number(it.unit_price) || 0,
        meter_start: Number(it.meter_start) || 0,
        // ✅ khởi tạo đã có format VN
        value: it.is_variable
          ? ''
          : formatVNMoneyTyping(String(it.unit_price ?? '')),
      }));
      setRows(normalized);
      setInvId(undefined);
      setInvTotal(0);
      setCurrentReadings({});
      setSettledItems([]);
    }
  };

  useEffect(reload, [cycleId]);

  const previewTotal = useMemo(() => {
    let sum = 0;
    for (const r of rows) {
      if (r.is_variable === 1) {
        const current = parseAmountInt(r.value);
        const consumed = Math.max(0, current - (r.meter_start || 0));
        sum += consumed * (r.unit_price || 0);
      } else {
        sum += parseDecimalCommaStrict(r.value);
      }
    }
    for (const ex of extras) sum += parseAmountInt(ex.amount);
    return sum;
  }, [rows, extras]);

  const { elecTotal, waterTotal, previewElecTotal, previewWaterTotal } =
    useMemo(() => {
      const isWater = (u?: string | null) =>
        (u || '').toLowerCase().includes('m3') || (u || '').includes('m³');
      const isElec = (u?: string | null) =>
        (u || '').toLowerCase().includes('kwh');
      let _elec = 0,
        _water = 0,
        _pElec = 0,
        _pWater = 0;

      if (status === 'settled' && invId) {
        const items = getInvoiceItems(invId) as any[];
        for (const it of items) {
          const unit = (it.unit || '').toLowerCase();
          if (unit.includes('kwh')) _elec += Number(it.amount) || 0;
          if (unit.includes('m3') || unit.includes('m³'))
            _water += Number(it.amount) || 0;
        }
      } else {
        for (const r of rows) {
          if (r.is_variable !== 1) continue;
          const current = parseAmountInt(r.value);
          const consumed = Math.max(0, current - (r.meter_start || 0));
          const money = consumed * (r.unit_price || 0);
          if (isElec(r.unit)) _pElec += money;
          if (isWater(r.unit)) _pWater += money;
        }
      }
      return {
        elecTotal: _elec,
        waterTotal: _water,
        previewElecTotal: _pElec,
        previewWaterTotal: _pWater,
      };
    }, [rows, status, invId]);

  const onChangeVarValue = (id: string, text: string) => {
    setRows(prev =>
      prev.map(r =>
        r.charge_type_id === id ? { ...r, value: formatIntTyping(text) } : r,
      ),
    );
  };

  // ✅ gõ “Giá kỳ này” có format VN ngay
  const onChangeFixedValue = (id: string, text: string) => {
    const formatted = formatVNMoneyTyping(text);
    setRows(prev =>
      prev.map(r => (r.charge_type_id === id ? { ...r, value: formatted } : r)),
    );
  };

  function saveEdits(scope: 'cycle' | 'lease') {
    if (scope === 'lease') {
      for (const r of rows) {
        if (r.is_variable === 0) {
          const newPrice = parseDecimalCommaStrict(r.value);
          if (newPrice !== r.unit_price) {
            updateRecurringChargePrice(leaseId, r.charge_type_id, newPrice);
          }
        }
      }
      Alert.alert(t('cycleDetail.saved'), t('cycleDetail.fixedPriceUpdated'));
      setEditMode(false);
      reload();
      return;
    }

    const variableInputs: Array<{
      charge_type_id: string;
      quantity: number;
      meter_end?: number;
    }> = [];
    const adjustments: Array<{ name: string; amount: number }> = [];

    for (const r of rows) {
      if (r.is_variable === 1) {
        const current = parseAmountInt(r.value);
        const consumed = Math.max(0, current - (r.meter_start || 0));
        variableInputs.push({
          charge_type_id: r.charge_type_id,
          quantity: consumed,
          meter_end: current,
        });
      } else {
        const newPrice = parseDecimalCommaStrict(r.value);
        const delta = newPrice - (r.unit_price || 0);
        if (delta !== 0)
          adjustments.push({
            name: `${t('cycleDetail.adjust')} ${r.name}`,
            amount: delta,
          });
      }
    }
    for (const ex of extras) {
      const amt = parseAmountInt(ex.amount);
      if (ex.name.trim() && amt > 0)
        adjustments.push({ name: ex.name.trim(), amount: amt });
    }

    const inv = settleCycleWithInputs(cycleId, variableInputs, adjustments);
    setEditMode(false);
    setStatus('settled');
    setInvId(inv.id);
    setInvTotal(inv.total || 0);
    setExtras([]);

    // HĐ không kỳ hạn → tự thêm 1 kỳ mới
    try {
      const billing = String(leaseInfo?.billing_cycle);
      const isOpenMonthly = billing === 'monthly' && !leaseInfo?.end_date;
      const isOpenDaily =
        billing === 'daily' && !(Number(leaseInfo?.duration_days || 0) > 0);
      if (isOpenMonthly || isOpenDaily) {
        extendLeaseAndAddCycles(leaseId, 1);
      }
    } catch {}

    reload();
    onSettled?.();

    try {
      const isMonthly = String(leaseInfo?.billing_cycle) === 'monthly';
      const nextSettle = new Date(period.e);
      if (isMonthly) nextSettle.setMonth(nextSettle.getMonth() + 1);
      else nextSettle.setDate(nextSettle.getDate() + 1);
      const nextISO = nextSettle.toISOString().slice(0, 10);
      scheduleReminder(
        `lease_${leaseId}_cycle_settle_${nextISO}`,
        t('notify.settleTitle') || 'Tất toán kỳ',
        t('notify.settleMsg') ||
          'Hôm nay đến ngày tất toán kỳ. Vui lòng xử lý.',
        nextISO,
      );
    } catch {}

    if (isFixedTerm && isLastCycle(cycleId)) {
      Alert.alert(t('cycleDetail.lastCycle'), t('cycleDetail.lastCycleAsk'), [
        {
          text: t('cycleDetail.endLease'),
          onPress: () => setShowEndModal(true),
        },
        {
          text: t('cycleDetail.keepLease'),
          onPress: () => setShowExtendModal(true),
        },
        { text: t('common.close'), style: 'cancel' },
      ]);
    } else {
      Alert.alert(t('common.done'), t('cycleDetail.settledOk'));
    }
  }

  async function shareImage() {
    try {
      if (!scrollRef.current) {
        Alert.alert('Lỗi', 'Không tìm thấy nội dung để chụp.');
        return;
      }
      const filePath = await captureRef(scrollRef.current, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        snapshotContentContainer: true,
      });

      // react-native-share yêu cầu dạng file://
      const uri = filePath.startsWith('file://')
        ? filePath
        : `file://${filePath}`;

      await Share.open({
        url: uri,
        type: 'image/png',
        failOnCancel: false,
      });
    } catch (e: any) {
      Alert.alert(
        t('cycleDetail.shareFail'),
        e?.message || t('common.tryAgain'),
      );
    }
  }
function buildInvoiceDocDefinition(inv: any, items: any[], t: any, format: (n:number)=>string) {
  const bodyRows = [
    [
      { text: t('cycleDetail.item'), style: 'th', alignment: 'left' },
      { text: t('cycleDetail.qty'), style: 'th', alignment: 'right' },
      { text: t('cycleDetail.unitPrice'), style: 'th', alignment: 'right' },
      { text: t('cycleDetail.amount'), style: 'th', alignment: 'right' },
    ],
    ...items.map((i: any) => {
      let lines: string[] = [];
      if (i.meta_json) {
        try {
          const m = JSON.parse(i.meta_json);
          if (typeof m?.meter_start === 'number' && typeof m?.meter_end === 'number') {
            lines.push(`${t('cycleDetail.prevIndex')}: ${m.meter_start} • ${t('cycleDetail.currIndex')}: ${m.meter_end}`);
          }
          if (m?.for_period_start && m?.for_period_end) {
            lines.push(`${t('cycleDetail.forPeriod')}: ${m.for_period_start} → ${m.for_period_end}`);
          }
        } catch {}
      }
      const descr = {
        text: [ { text: (i.description === 'rent.roomprice' ? t('leaseForm.baseRent') : i.description) + '\n', bold: true }, ...lines.map(s => ({ text: s+'\n', color: '#666', fontSize: 9 })) ]
      };

      return [
        descr,
        { text: `${i.quantity ?? 1} ${i.unit ?? ''}`, alignment: 'right' },
        { text: format(Number(i.unit_price) || 0), alignment: 'right' },
        { text: format(Number(i.amount) || 0), alignment: 'right' },
      ];
    }),
    [
      { text: t('cycleDetail.total'), colSpan: 3, alignment: 'right', bold: true }, {}, {},
      { text: format(Number(inv.total) || 0), alignment: 'right', bold: true },
    ],
  ];

  return {
    pageMargins: [20, 24, 20, 28],
    content: [
      {
        text: `${t('cycleDetail.invoiceTitle')} ${inv.period_start} → ${inv.period_end}`,
        style: 'title',
        margin: [0, 0, 0, 10],
      },
      {
        table: { headerRows: 1, widths: ['*', 70, 80, 90], body: bodyRows },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? '#f0f0f0' : null),
          hLineColor: () => '#ddd',
          vLineColor: () => '#ddd',
        },
      },
    ],
    styles: {
      title: { fontSize: 16, bold: true },
      th: { bold: true }
    },
    defaultStyle: { fontSize: 11 }
  };
}

async function sharePdf() {
  try {
    if (!invId) return;
    const inv = getInvoice(invId);
    const items = getInvoiceItems(invId) || [];

    const docDefinition = buildInvoiceDocDefinition(inv, items, t, format);

    // Lấy base64 từ pdfmake
    const base64: string = await new Promise((resolve, reject) => {
      pdfMake.createPdf(docDefinition).getBase64((data: string) => resolve(data));
    });

    // Ghi base64 ra file tạm
    const cacheDir = RNBlob.fs.dirs.CacheDir;
    const filePath = `${cacheDir}/invoice_${inv.id}.pdf`;
    await RNBlob.fs.writeFile(filePath, base64, 'base64');

    // Mở share sheet
    await Share.open({
      url: Platform.OS === 'android' ? `file://${filePath}` : filePath,
      type: 'application/pdf',
      failOnCancel: false,
    });
  } catch (e: any) {
    Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
  }
}

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {!editMode ? (
        <ScrollView
          ref={scrollRef}
          collapsable={false}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 100,
            gap: 12,
          }}
          showsVerticalScrollIndicator
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <Text style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}>
              {t('cycleDetail.roomInfo')}
            </Text>
            <Text style={{ color: roomCode ? c.text : c.subtext }}>
              {t('common.room')}: {roomCode || '—'}
            </Text>

            <Text
              style={{
                color: c.text,
                fontWeight: '700',
                marginTop: 10,
                marginBottom: 6,
              }}
            >
              {t('cycleDetail.tenant')}
            </Text>
            {tenantName || tenantPhone ? (
              <Text style={{ color: c.text }}>
                {tenantName || '—'}
                {tenantPhone ? ` — ${tenantPhone}` : ''}
              </Text>
            ) : (
              <Text style={{ color: c.subtext }}>
                {t('cycleDetail.noTenant')}
              </Text>
            )}
          </Card>

          <Card>
            <Text style={{ color: c.text }}>
              {t('cycleDetail.period')}:{' '}
              {formatDateISO(period.s, dateFormat, language)} →{' '}
              {formatDateISO(period.e, dateFormat, language)}
            </Text>
            <Text style={{ color: c.text }}>
              {t('cycleDetail.status')}:{' '}
              {status === 'open' ? t('common.open') : t('common.close')}{' '}
            </Text>
            {invId ? (
              <Text style={{ color: c.text }}>
                {t('cycleDetail.invoiceTotal')}: {format(invTotal)}
              </Text>
            ) : null}
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>
              {t('cycleDetail.fees')}
            </Text>

            {status === 'settled' && settledItems.length > 0 ? (
              <>
                {settledItems.map(it => {
                  let meterInfo: { start?: number; end?: number } = {};
                  let forStart: string | undefined;
                  let forEnd: string | undefined;
                  if (it.meta_json) {
                    try {
                      const m = JSON.parse(it.meta_json);
                      if (typeof m?.meter_start === 'number')
                        meterInfo.start = m.meter_start;
                      if (typeof m?.meter_end === 'number')
                        meterInfo.end = m.meter_end;
                      if (m?.for_period_start) forStart = m.for_period_start;
                      if (m?.for_period_end) forEnd = m.for_period_end;
                    } catch {}
                  }
                  return (
                    <View key={it.id} style={{ borderRadius: 10, padding: 10 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          marginBottom: 6,
                        }}
                      >
                        <Text style={{ color: c.text, fontWeight: '700' }}>
                          {it.description === 'rent.roomprice'
                            ? t('leaseForm.baseRent')
                            : it.description}
                        </Text>
                        <Text style={{ color: c.subtext }}>
                          {it.unit
                            ? `(${
                                it.unit === 'rent.month'
                                  ? t('rent.month')
                                  : it.unit === 'tháng'
                                  ? t('rent.month')
                                  : t('rent.unit')
                              })`
                            : t('cycleDetail.fixed')}
                        </Text>
                      </View>

                      {forStart && forEnd ? (
                        <Text style={{ color: c.subtext, marginBottom: 4 }}>
                          {t('cycleDetail.forPeriod')}:{' '}
                          <Text style={{ color: c.text }}>
                            {formatDateISO(forStart, dateFormat, language)} →{' '}
                            {formatDateISO(forEnd, dateFormat, language)}
                          </Text>
                        </Text>
                      ) : null}

                      {!!(meterInfo.start != null || meterInfo.end != null) && (
                        <Text style={{ color: c.subtext, marginBottom: 4 }}>
                          {t('cycleDetail.prevIndex')}:{' '}
                          <Text style={{ color: c.text }}>
                            {groupVN(String(meterInfo.start ?? 0))}
                          </Text>
                          {'  '}•{'  '}
                          {t('cycleDetail.currIndex')}:{' '}
                          <Text style={{ color: c.text }}>
                            {groupVN(String(meterInfo.end ?? 0))}
                          </Text>
                        </Text>
                      )}

                      <Text style={{ color: c.subtext }}>
                        {t('cycleDetail.qtyShort')}:{' '}
                        <Text style={{ color: c.text }}>
                          {it.quantity ?? 1}
                        </Text>{' '}
                        • {t('cycleDetail.unitPrice')}:{' '}
                        <Text style={{ color: c.text }}>
                          {format(it.unit_price)}
                        </Text>{' '}
                        • {t('cycleDetail.amount')}:{' '}
                        <Text style={{ color: c.text }}>
                          {format(it.amount)}
                        </Text>
                      </Text>
                    </View>
                  );
                })}
              </>
            ) : (
              <>
                {rows.map(r => (
                  <View
                    key={r.charge_type_id}
                    style={{ borderRadius: 10, padding: 10 }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                      }}
                    >
                      <Text style={{ color: c.text, fontWeight: '700' }}>
                        {r.name}
                      </Text>
                      <Text style={{ color: c.subtext }}>
                        {r.is_variable
                          ? `${t('cycleDetail.variable')} (${r.unit || ''})`
                          : t('cycleDetail.fixed')}
                      </Text>
                    </View>

                    {r.is_variable === 1 ? (
                      <>
                        <Text style={{ color: c.subtext }}>
                          {t('cycleDetail.unitPrice')}:{' '}
                          <Text style={{ color: c.text }}>
                            {format(r.unit_price)}
                          </Text>{' '}
                          / {r.unit || t('cycleDetail.unitShort')}
                        </Text>
                        <Text style={{ color: c.subtext }}>
                          {t('cycleDetail.startIndex')}:{' '}
                          <Text style={{ color: c.text }}>
                            {groupVN(String(r.meter_start || 0))}
                          </Text>
                        </Text>

                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: 8,
                          }}
                        >
                          <Text style={{ color: c.subtext, flex: 1 }}>
                            {t('cycleDetail.currentIndex')}
                          </Text>
                          <Text
                            style={{
                              color: r.value ? c.text : c.subtext,
                              textAlign: 'right',
                            }}
                          >
                            {r.value
                              ? groupVN(
                                  String(
                                    parseInt(
                                      (r.value || '').replace(/\D/g, ''),
                                      10,
                                    ) || 0,
                                  ),
                                )
                              : t('cycleDetail.notEntered')}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={{ color: c.subtext }}>
                          {t('cycleDetail.contractBase')}:{' '}
                          <Text style={{ color: c.text }}>
                            {format(r.unit_price)}
                          </Text>
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: 8,
                          }}
                        >
                          <Text style={{ color: c.subtext, flex: 1 }}>
                            {t('cycleDetail.priceThisCycle')}
                          </Text>
                          <Text style={{ color: c.text, textAlign: 'right' }}>
                            {format(
                              parseDecimalCommaStrict(
                                r.value || String(r.unit_price),
                              ),
                            )}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </>
            )}
          </Card>

          {status === 'settled' ? (
            <View
              style={{
                justifyContent: 'flex-end',
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: insets.bottom + 12, // đẩy lên khỏi gesture bar
                flexDirection: 'row',
                gap: 12,
              }}
            >
              <Button title={t('cycleDetail.share')} onPress={sharePdf} />
            </View>
          ) : (
            <View
              style={{
                justifyContent: 'flex-end',
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: insets.bottom + 12, // đẩy lên khỏi gesture bar
                flexDirection: 'row',
                gap: 12,
              }}
            >
              <Button
                title={t('cycleDetail.settleNow')}
                onPress={() => setEditMode(true)}
              />
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 100,
            gap: 12,
          }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <Card style={{ gap: 10 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>
              {t('cycleDetail.fees')}
            </Text>

            {rows.map(r => {
              const isVar = r.is_variable === 1;
              const current = parseAmountInt(r.value);
              const consumed = isVar
                ? Math.max(0, current - (r.meter_start || 0))
                : 0;
              const partial = isVar
                ? consumed * (r.unit_price || 0)
                : parseDecimalCommaStrict(r.value);

              return (
                <View
                  key={r.charge_type_id}
                  style={{ borderRadius: 10, padding: 10 }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <Text style={{ color: c.text, fontWeight: '700' }}>
                      {r.name}
                    </Text>
                    <Text style={{ color: c.subtext }}>
                      {isVar
                        ? `${t('cycleDetail.variable')} (${r.unit || ''})`
                        : t('cycleDetail.fixed')}
                    </Text>
                  </View>

                  {isVar ? (
                    <>
                      <Text style={{ color: c.subtext }}>
                        {t('cycleDetail.unitPrice')}:{' '}
                        <Text style={{ color: c.text }}>
                          {format(r.unit_price)}
                        </Text>{' '}
                        / {r.unit || t('cycleDetail.unitShort')}
                      </Text>
                      <Text style={{ color: c.subtext }}>
                        {t('cycleDetail.prevIndex')}:{' '}
                        <Text style={{ color: c.text }}>
                          {groupVN(String(r.meter_start || 0))}
                        </Text>
                      </Text>

                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginTop: 8,
                        }}
                      >
                        <Text style={{ color: c.subtext, flex: 1 }}>
                          {t('cycleDetail.currentIndex')}
                        </Text>
                        <FormInput
                          style={{ flex: 1 }}
                          keyboardType="numeric"
                          value={r.value}
                          onChangeText={t2 =>
                            onChangeVarValue(r.charge_type_id, t2)
                          }
                        />
                      </View>

                      <Text style={{ color: c.subtext, marginTop: 6 }}>
                        {t('cycleDetail.consumed')}:{' '}
                        <Text style={{ color: c.text }}>
                          {groupVN(String(consumed))}
                        </Text>{' '}
                        {r.unit || t('cycleDetail.unitShort')} —{' '}
                        {t('cycleDetail.amount')}:{' '}
                        <Text style={{ color: c.text }}>{format(partial)}</Text>
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ color: c.subtext }}>
                        {t('cycleDetail.contractBase')}:{' '}
                        <Text style={{ color: c.text }}>
                          {format(r.unit_price)}
                        </Text>
                      </Text>

                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginTop: 8,
                        }}
                      >
                        <Text style={{ color: c.subtext, flex: 1 }}>
                          {t('cycleDetail.priceThisCycle')}
                        </Text>
                        <FormInput
                          style={{ flex: 1 }}
                          keyboardType="decimal-pad"
                          value={r.value}
                          onChangeText={t2 =>
                            onChangeFixedValue(r.charge_type_id, t2)
                          }
                        />
                      </View>

                      <Text style={{ color: c.subtext, marginTop: 6 }}>
                        {t('cycleDetail.amount')}:{' '}
                        <Text style={{ color: c.text }}>{format(partial)}</Text>
                      </Text>
                    </>
                  )}
                </View>
              );
            })}

            {/* Phụ phí phát sinh của kỳ */}
            <View style={{ marginTop: 4 }}>
              <Text
                style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}
              >
                {t('cycleDetail.extraFees')}
              </Text>
              {extras.map((ex, idx) => (
                <View key={idx} style={{ gap: 6, marginBottom: 8 }}>
                  <TextInput
                    placeholder={t('cycleDetail.feeName')}
                    placeholderTextColor={c.subtext}
                    value={ex.name}
                    onChangeText={t2 => updateExtra(idx, { name: t2 })}
                    style={{
                      borderRadius: 10,
                      padding: 10,
                      color: c.text,
                      backgroundColor: c.card,
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <FormInput
                      style={{ flex: 1 }}
                      placeholder={t('cycleDetail.amountPlaceholder')}
                      keyboardType="decimal-pad"
                      value={ex.amount}
                      onChangeText={t2 =>
                        updateExtra(idx, {
                          amount: formatDecimalTypingVNStrict(t2),
                        })
                      }
                    />
                    <Button
                      title={t('common.delete')}
                      variant="ghost"
                      onPress={() => removeExtra(idx)}
                    />
                  </View>
                </View>
              ))}
              <Button
                title={t('cycleDetail.addExtra')}
                variant="ghost"
                onPress={addExtra}
              />
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>
                {t('cycleDetail.previewTotal')}: {format(previewTotal)}
              </Text>
              {invId ? (
                <Text style={{ color: c.subtext }}>
                  ({t('cycleDetail.currentInvoice')}: {format(invTotal)})
                </Text>
              ) : null}
            </View>
          </Card>

          <View
            style={{
              justifyContent: 'flex-end',
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: insets.bottom + 12, // đẩy lên khỏi gesture bar
              flexDirection: 'row',
              gap: 12,
            }}
          >
            <Button
              title={t('common.cancel')}
              variant="ghost"
              onPress={() => {
                setEditMode(false);
                setExtras([]);
              }}
            />
            <Button
              title={t('cycleDetail.settleNow')}
              onPress={() => saveEdits('cycle')}
            />
          </View>
        </ScrollView>
      )}

      {/* Modal kết thúc hợp đồng */}
      <Modal
        visible={showEndModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEndModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: c.bg,
              padding: 16,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
              {t('cycleDetail.endLeaseTitle')}
            </Text>
            <Text style={{ color: c.text }}>
              {t('cycleDetail.deposit')}: {format(depositPreview)}
            </Text>

            <Card style={{ gap: 8 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>
                {t('cycleDetail.extraFees')}
              </Text>
              {endExtras.map((ex, idx) => (
                <View key={idx} style={{ gap: 6 }}>
                  <TextInput
                    placeholder={t('cycleDetail.itemName')}
                    placeholderTextColor={c.subtext}
                    value={ex.name}
                    onChangeText={t2 => updEndExtra(idx, { name: t2 })}
                    style={{
                      borderRadius: 10,
                      padding: 10,
                      color: c.text,
                      backgroundColor: c.card,
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <FormInput
                      style={{ flex: 1 }}
                      placeholder={t('cycleDetail.amountWithHint')}
                      keyboardType="decimal-pad"
                      value={ex.amount}
                      onChangeText={t2 =>
                        updEndExtra(idx, {
                          amount: formatDecimalTypingVNStrict(t2),
                        })
                      }
                    />
                    <Button
                      title={t('common.delete')}
                      variant="ghost"
                      onPress={() => delEndExtra(idx)}
                    />
                  </View>
                </View>
              ))}
              <Button
                title={t('cycleDetail.addItem')}
                variant="ghost"
                onPress={addEndExtra}
              />
            </Card>

            <Text style={{ color: c.text }}>
              {t('cycleDetail.extraTotal')}: {format(endExtrasTotal)}
            </Text>
            <Text style={{ color: c.text, fontWeight: '700' }}>
              {t('cycleDetail.balanceAfter')}:{' '}
              {format(depositPreview - endExtrasTotal)}
            </Text>
            <Text style={{ color: c.subtext }}>
              {depositPreview - endExtrasTotal > 0
                ? `→ ${t('cycleDetail.refundToTenant')}: ${format(
                    depositPreview - endExtrasTotal,
                  )}`
                : depositPreview - endExtrasTotal < 0
                ? `→ ${t('cycleDetail.collectFromTenant')}: ${format(
                    Math.abs(depositPreview - endExtrasTotal),
                  )}`
                : `→ ${t('cycleDetail.noFurther')}`}
            </Text>

            <View
              style={{
                justifyContent: 'flex-end',
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: insets.bottom + 12, // đẩy lên khỏi gesture bar
                flexDirection: 'row',
                gap: 12,
              }}
            >
              <Button
                title={t('common.cancel')}
                variant="ghost"
                onPress={() => setShowEndModal(false)}
              />
              <Button
                title={t('cycleDetail.finish')}
                onPress={() => {
                  const payload = endExtras
                    .filter(it => it.name.trim())
                    .map(it => ({
                      name: it.name.trim(),
                      amount: parseAmountInt(it.amount || ''),
                    }));
                  const res = endLeaseWithSettlement(leaseId, payload);
                  try {
                    cancelReminder(`lease_end_${leaseId}`);
                  } catch {}
                  setShowEndModal(false);
                  Alert.alert(
                    t('cycleDetail.ended'),
                    res.finalBalance > 0
                      ? `${t('cycleDetail.refundToTenant')} ${format(
                          res.finalBalance,
                        )}`
                      : res.finalBalance < 0
                      ? `${t('cycleDetail.collectFromTenant')} ${format(
                          Math.abs(res.finalBalance),
                        )}`
                      : t('cycleDetail.noFurther'),
                    [{ text: 'OK', onPress: () => navigation.goBack() }],
                  );
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal gia hạn hợp đồng */}
      <Modal
        visible={showExtendModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExtendModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: c.bg,
              borderRadius: 12,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
              {t('cycleDetail.extendLease')}
            </Text>
            <Text style={{ color: c.subtext }}>
              {t('cycleDetail.extendHint', {
                unit:
                  leaseInfo?.billing_cycle === 'daily'
                    ? t('common.days')
                    : t('common.months'),
              })}
            </Text>
            <TextInput
              keyboardType="numeric"
              value={extendCount}
              onChangeText={setExtendCount}
              placeholder={
                leaseInfo?.billing_cycle === 'daily'
                  ? t('cycleDetail.daysExample')
                  : t('cycleDetail.monthsExample')
              }
              placeholderTextColor={c.subtext}
              style={{
                borderRadius: 10,
                padding: 10,
                color: c.text,
                backgroundColor: c.card,
              }}
            />
            <View
              style={{
                justifyContent: 'flex-end',
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: insets.bottom + 12, // đẩy lên khỏi gesture bar
                flexDirection: 'row',
                gap: 12,
              }}
            >
              <Button
                title={t('common.cancel')}
                variant="ghost"
                onPress={() => {
                  setShowExtendModal(false);
                  setExtendCount('');
                }}
              />
              <Button
                title={t('common.confirm')}
                onPress={() => {
                  const n = Number(extendCount);
                  if (!n || n <= 0) {
                    Alert.alert(
                      t('common.error'),
                      t('cycleDetail.enterValidNumber'),
                    );
                    return;
                  }
                  try {
                    extendLeaseAndAddCycles(leaseId, n);
                    setShowExtendModal(false);
                    setExtendCount('');
                    reload();
                    Alert.alert(
                      t('common.success'),
                      t('cycleDetail.extendedOk'),
                    );
                    try {
                      const isMonthly =
                        String(leaseInfo?.billing_cycle) === 'monthly';
                      const next = new Date(period.e);
                      if (isMonthly) next.setMonth(next.getMonth() + 1);
                      else next.setDate(next.getDate() + 1);
                      const nextISO = next.toISOString().slice(0, 10);
                      scheduleReminder(
                        `lease_${leaseId}_cycle_settle_${nextISO}`,
                        t('notify.settleTitle') || 'Tất toán kỳ',
                        t('notify.settleMsg') ||
                          'Hôm nay đến ngày tất toán kỳ. Vui lòng xử lý.',
                        nextISO,
                      );
                    } catch {}
                  } catch (e: any) {
                    Alert.alert(
                      t('common.error'),
                      e?.message || t('cycleDetail.extendFail'),
                    );
                  }
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
