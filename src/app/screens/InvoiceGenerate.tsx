// src/app/screens/CycleDetail.tsx
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, TextInput, Alert, ScrollView, Modal, Share} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
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
import {useCurrency} from '../../utils/currency';
import { formatNumber as groupVN, onlyDigits } from '../../utils/number';

import RNHTMLtoPDF from 'react-native-html-to-pdf';
import ViewShot, {captureRef} from 'react-native-view-shot';
import {useSettings} from '../state/SettingsContext';
import {formatDateISO} from '../../utils/date';
import {useTranslation} from 'react-i18next';

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

// ===== Helpers =====
function parseAmount(s: string) {
  const digits = (s || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}
function formatTyping(s: string) {
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
}

export default function CycleDetail({route, navigation}: Props) {
  const {t} = useTranslation();
  const {dateFormat, language} = useSettings();
  const {cycleId, onSettled} = route.params as any;
  const c = useThemeColors();
  const {format} = useCurrency();
  const viewShotRef = useRef<ViewShot>(null);

  const [leaseId, setLeaseId] = useState<string>('');
  const [leaseInfo, setLeaseInfo] = useState<any>(null);
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [invId, setInvId] = useState<string | undefined>();
  const [invTotal, setInvTotal] = useState<number>(0);
  const [status, setStatus] = useState<'open' | 'settled'>('open');
  const [period, setPeriod] = useState<{ s: string; e: string }>({ s: '', e: '' });

  const [roomCode, setRoomCode] = useState<string>('');
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantPhone, setTenantPhone] = useState<string>('');

  const [settledItems, setSettledItems] = useState<any[]>([]);
  const [currentReadings, setCurrentReadings] = useState<Record<string, number>>({});

  const [editMode, setEditMode] = useState(false);
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const addExtra = () => setExtras(prev => [...prev, { name: '', amount: '' }]);
  const updateExtra = (i: number, patch: Partial<ExtraItem>) =>
    setExtras(prev => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeExtra = (i: number) =>
    setExtras(prev => prev.filter((_, idx) => idx !== i));

  const [showEndModal, setShowEndModal] = useState(false);
  const [endExtras, setEndExtras] = useState<ExtraItem[]>([]);
  const addEndExtra = () => setEndExtras(p => [...p, {name: '', amount: ''}]);
  const updEndExtra = (i: number, patch: Partial<ExtraItem>) =>
    setEndExtras(p => p.map((x, idx) => (idx === i ? {...x, ...patch} : x)));
  const delEndExtra = (i: number) => setEndExtras(p => p.filter((_, idx) => idx !== i));
  const endExtrasTotal = useMemo(
    () => endExtras.reduce((s, it) => s + parseAmount(it.amount), 0),
    [endExtras]
  );
  const [depositPreview, setDepositPreview] = useState<number>(0);

  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendCount, setExtendCount] = useState<string>('');

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
            if (typeof m?.meter_end === 'number') map[it.charge_type_id] = m.meter_end;
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
        value: it.is_variable ? '' : groupVN(String(it.unit_price || 0)),
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
        const current = parseAmount(r.value);
        const consumed = Math.max(0, current - (r.meter_start || 0));
        sum += consumed * (r.unit_price || 0);
      } else {
        sum += parseAmount(r.value);
      }
    }
    for (const ex of extras) sum += parseAmount(ex.amount);
    return sum;
  }, [rows, extras]);

  const {elecTotal, waterTotal, previewElecTotal, previewWaterTotal} = useMemo(() => {
    const isWater = (u?: string|null) => (u||'').toLowerCase().includes('m3') || (u||'').includes('m³');
    const isElec  = (u?: string|null) => (u||'').toLowerCase().includes('kwh');
    let _elec = 0, _water = 0, _pElec = 0, _pWater = 0;

    if (status === 'settled' && invId) {
      const items = getInvoiceItems(invId) as any[];
      for (const it of items) {
        const unit = (it.unit || '').toLowerCase();
        if (unit.includes('kwh')) _elec += Number(it.amount)||0;
        if (unit.includes('m3') || unit.includes('m³')) _water += Number(it.amount)||0;
      }
    } else {
      for (const r of rows) {
        if (r.is_variable !== 1) continue;
        const current = parseAmount(r.value);
        const consumed = Math.max(0, current - (r.meter_start || 0));
        const money = consumed * (r.unit_price || 0);
        if (isElec(r.unit)) _pElec += money;
        if (isWater(r.unit)) _pWater += money;
      }
    }
    return {elecTotal:_elec, waterTotal:_water, previewElecTotal:_pElec, previewWaterTotal:_pWater};
  }, [rows, status, invId]);

  const onChangeValue = (id: string, text: string) => {
    setRows(prev =>
      prev.map(r =>
        r.charge_type_id === id
          ? { ...r, value: formatTyping(text) }
          : r
      )
    );
  };

  const onBlurValue = (id: string) => {
    setRows(prev =>
      prev.map(r => {
        if (r.charge_type_id !== id) return r;
        return r.is_variable === 1 ? r : { ...r, value: groupVN(r.value) };
      }),
    );
  };

  // ====== Lưu kỳ & xử lý cuối kỳ ======
  function saveEdits(scope: 'cycle' | 'lease') {
    if (scope === 'lease') {
      for (const r of rows) {
        if (r.is_variable === 0) {
          const newPrice = Number(onlyDigits(r.value)) || 0;
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

    // settle kỳ
    const variableInputs: Array<{ charge_type_id: string; quantity: number; meter_end?: number }> = [];
    const adjustments: Array<{ name: string; amount: number }> = [];

    for (const r of rows) {
      if (r.is_variable === 1) {
        const current = Number(onlyDigits(r.value)) || 0;
        const consumed = Math.max(0, current - (r.meter_start || 0));
        variableInputs.push({ charge_type_id: r.charge_type_id, quantity: consumed, meter_end: current });
      } else {
        const newPrice = Number(onlyDigits(r.value)) || 0;
        const delta = newPrice - (r.unit_price || 0);
        if (delta !== 0) adjustments.push({ name: `${t('cycleDetail.adjust')} ${r.name}`, amount: delta });
      }
    }
    for (const ex of extras) {
      const amt = Number(onlyDigits(ex.amount)) || 0;
      if (ex.name.trim() && amt > 0) adjustments.push({ name: ex.name.trim(), amount: amt });
    }

    const inv = settleCycleWithInputs(cycleId, variableInputs, adjustments);
    setEditMode(false);
    setStatus('settled');
    setInvId(inv.id);
    setInvTotal(inv.total || 0);
    setExtras([]);
    reload();
    onSettled?.();

    // Nếu là chu kỳ cuối => hỏi tiếp
    if (isLastCycle(cycleId)) {
      Alert.alert(
        t('cycleDetail.lastCycle'),
        t('cycleDetail.lastCycleAsk'),
        [
          {text: t('cycleDetail.endLease'), onPress: () => setShowEndModal(true)},
          {
            text: t('cycleDetail.keepLease'),
            onPress: () => setShowExtendModal(true),
          },
          {text: t('common.close'), style: 'cancel'},
        ]
      );
    } else {
      Alert.alert(t('common.done'), t('cycleDetail.settledOk'));
    }
  }

  async function exportPdf() {
    if (!invId) return;
    const inv = getInvoice(invId);
    const items = getInvoiceItems(invId);
    const rowsHtml = items.map((i:any) => {
      let extraInfo = '';
      if (i.meta_json) {
        try {
          const m = JSON.parse(i.meta_json);
          if (m && typeof m.meter_start === 'number' && typeof m.meter_end === 'number') {
            extraInfo = `<div style="font-size:12px;color:#555">${t('cycleDetail.prevIndex')}: ${groupVN(String(m.meter_start))} • ${t('cycleDetail.currIndex')}: ${groupVN(String(m.meter_end))}</div>`;
          }
          if (m?.for_period_start && m?.for_period_end) {
            extraInfo += `<div style="font-size:12px;color:#555">${t('cycleDetail.forPeriod')}: ${m.for_period_start} → ${m.for_period_end}</div>`;
          }
        } catch {}
      }
      return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">
            ${i.description}
            ${extraInfo}
          </td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${i.quantity ?? 1} ${i.unit ?? ''}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${format(i.unit_price)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${format(i.amount)}</td>
        </tr>`;
    }).join('');
    const html = `
    <html><meta charSet="utf-8"/><body style="font-family:-apple-system,sans-serif;">
    <h2>${t('cycleDetail.invoiceTitle')} ${inv.period_start} → ${inv.period_end}</h2>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;border:1px solid #ddd;padding:8px;">${t('cycleDetail.item')}</th>
          <th style="text-align:right;border:1px solid #ddd;padding:8px;">${t('cycleDetail.qty')}</th>
          <th style="text-align:right;border:1px solid #ddd;padding:8px;">${t('cycleDetail.unitPrice')}</th>
          <th style="text-align:right;border:1px solid #ddd;padding:8px;">${t('cycleDetail.amount')}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colSpan="3" style="text-align:right;padding:8px;border:1px solid #ddd;"><b>${t('cycleDetail.total')}</b></td>
          <td style="text-align:right;padding:8px;border:1px solid #ddd;"><b>${format(inv.total)}</b></td>
        </tr>
      </tfoot>
    </table>
    </body></html>`;
    const res = await RNHTMLtoPDF.convert({html, fileName:`invoice_${inv.id}`, base64:false});
    Alert.alert(t('cycleDetail.pdfExported'), res.filePath || '—');
  }

  async function shareImage() {
    try {
      if (!viewShotRef.current) return;
      const uri = await captureRef(viewShotRef, {format: 'png', quality: 1});
      await Share.share({
        url: uri,
        message: t('cycleDetail.shareMessage'),
        title: t('cycleDetail.shareTitle'),
      });
    } catch (e: any) {
      Alert.alert(t('cycleDetail.shareFail'), e?.message || t('common.tryAgain'));
    }
  }

  async function exportImage() {
    if (!viewShotRef.current) return;
    const uri = await captureRef(viewShotRef, {format:'png', quality:1});
    Alert.alert(t('cycleDetail.imageExported'), uri);
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ViewShot ref={viewShotRef} options={{format:'png', quality:1}}>
        {!editMode ? (
          <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} showsVerticalScrollIndicator>
            <Card>
              <Text style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}>{t('cycleDetail.roomInfo')}</Text>
              <Text style={{ color: roomCode ? c.text : c.subtext }}>{t('common.room')}: {roomCode || '—'}</Text>

              <Text style={{ color: c.text, fontWeight: '700', marginTop: 10, marginBottom: 6 }}>{t('cycleDetail.tenant')}</Text>
              {(tenantName || tenantPhone) ? (
                <Text style={{ color: c.text }}>
                  {tenantName || '—'}{tenantPhone ? ` — ${tenantPhone}` : ''}
                </Text>
              ) : (
                <Text style={{ color: c.subtext }}>{t('cycleDetail.noTenant')}</Text>
              )}
            </Card>

            <Card>
              <Text style={{ color: c.text }}>{t('cycleDetail.period')}: {formatDateISO(period.s, dateFormat, language)}  →  {formatDateISO(period.e, dateFormat, language)}</Text>
              <Text style={{ color: c.text }}>{t('cycleDetail.status')}: {status}</Text>
              {invId ? <Text style={{ color: c.text }}>{t('cycleDetail.invoiceTotal')}: {format(invTotal)}</Text> : null}
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>{t('cycleDetail.fees')}</Text>

              {status === 'settled' && settledItems.length > 0 ? (
                <>
                  {settledItems.map(it => {
                    let meterInfo: {start?: number; end?: number} = {};
                    let forStart: string | undefined;
                    let forEnd: string | undefined;
                    if (it.meta_json) {
                      try {
                        const m = JSON.parse(it.meta_json);
                        if (typeof m?.meter_start === 'number') meterInfo.start = m.meter_start;
                        if (typeof m?.meter_end === 'number') meterInfo.end = m.meter_end;
                        if (m?.for_period_start) forStart = m.for_period_start;
                        if (m?.for_period_end)   forEnd   = m.for_period_end;
                      } catch {}
                    }
                    return (
                      <View key={it.id} style={{ borderRadius:10, padding:10 }}>
                        <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:6}}>
                          <Text style={{color:c.text, fontWeight:'700'}}>{it.description}</Text>
                          <Text style={{color:c.subtext}}>{it.unit ? `(${it.unit})` : t('cycleDetail.fixed')}</Text>
                        </View>

                        {forStart && forEnd ? (
                          <Text style={{color:c.subtext, marginBottom:4}}>
                            {t('cycleDetail.forPeriod')}: <Text style={{color:c.text}}>{formatDateISO(forStart, dateFormat, language)} → {formatDateISO(forEnd, dateFormat, language)}</Text>
                          </Text>
                        ) : null}

                        {!!(meterInfo.start != null || meterInfo.end != null) && (
                          <Text style={{color:c.subtext, marginBottom:4}}>
                            {t('cycleDetail.prevIndex')}: <Text style={{color:c.text}}>{groupVN(String(meterInfo.start ?? 0))}</Text>{'  '}•{'  '}
                            {t('cycleDetail.currIndex')}: <Text style={{color:c.text}}>{groupVN(String(meterInfo.end ?? 0))}</Text>
                          </Text>
                        )}

                        <Text style={{color:c.subtext}}>
                          {t('cycleDetail.qtyShort')}: <Text style={{color:c.text}}>{it.quantity ?? 1}</Text> •{' '}
                          {t('cycleDetail.unitPrice')}: <Text style={{color:c.text}}>{format(it.unit_price)}</Text> •{' '}
                          {t('cycleDetail.amount')}: <Text style={{color:c.text}}>{format(it.amount)}</Text>
                        </Text>
                      </View>
                    );
                  })}
                </>
              ) : (
                <>
                  {rows.map(r => (
                    <View key={r.charge_type_id} style={{  borderRadius: 10, padding: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ color: c.text, fontWeight: '700' }}>{r.name}</Text>
                        <Text style={{ color: c.subtext }}>
                          {r.is_variable ? `${t('cycleDetail.variable')} (${r.unit || ''})` : t('cycleDetail.fixed')}
                        </Text>
                      </View>

                      {r.is_variable === 1 ? (
                        <>
                          <Text style={{ color: c.subtext }}>
                            {t('cycleDetail.unitPrice')}: <Text style={{ color: c.text }}>{format(r.unit_price)}</Text> / {r.unit || t('cycleDetail.unitShort')}
                          </Text>
                          <Text style={{ color: c.subtext }}>
                            {t('cycleDetail.startIndex')}: <Text style={{ color: c.text }}>{groupVN(String(r.meter_start || 0))}</Text>
                          </Text>
                          <Text style={{ color: c.subtext, marginTop: 4 }}>
                            {t('cycleDetail.currentIndex')}: {' '}
                            <Text style={{ color: c.text }}>
                              {currentReadings[r.charge_type_id] != null
                                ? groupVN(String(currentReadings[r.charge_type_id]))
                                : t('cycleDetail.notEntered')}
                            </Text>
                          </Text>
                        </>
                      ) : (
                        <Text style={{ color: c.subtext }}>
                          {t('cycleDetail.contractBase')}: <Text style={{ color: c.text }}>{format(r.unit_price)}</Text>
                        </Text>
                      )}
                    </View>
                  ))}
                </>
              )}
            </Card>

            {status==='settled' ? (
              <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
                <Button title={t('cycleDetail.share')} onPress={shareImage}/>
              </View>
            ) : (
              <View style={{ alignItems: 'flex-end' }}>
                <Button title={t('cycleDetail.settleNow')} onPress={() => setEditMode(true)} />
              </View>
            )}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} showsVerticalScrollIndicator>
            <Card style={{ gap: 10 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>{t('cycleDetail.fees')}</Text>

              {rows.map(r => {
                const isVar = r.is_variable === 1;
                const current = Number(onlyDigits(r.value)) || 0;
                const consumed = isVar ? Math.max(0, current - (r.meter_start || 0)) : 0;
                const partial = isVar ? consumed * (r.unit_price || 0) : Number(onlyDigits(r.value)) || 0;

                return (
                  <View key={r.charge_type_id} style={{ borderRadius: 10, padding: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: c.text, fontWeight: '700' }}>{r.name}</Text>
                      <Text style={{ color: c.subtext }}>
                        {isVar ? `${t('cycleDetail.variable')} (${r.unit || ''})` : t('cycleDetail.fixed')}
                      </Text>
                    </View>

                    {isVar ? (
                      <>
                        <Text style={{ color: c.subtext }}>
                          {t('cycleDetail.unitPrice')}: <Text style={{ color: c.text }}>{format(r.unit_price)}</Text> / {r.unit || t('cycleDetail.unitShort')}
                        </Text>
                        <Text style={{ color: c.subtext }}>
                          {t('cycleDetail.prevIndex')}: <Text style={{ color: c.text }}>{groupVN(String(r.meter_start || 0))}</Text>
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                          <Text style={{ color: c.subtext, width: 120 }}>{t('cycleDetail.currentIndex')}</Text>
                          <TextInput
                            keyboardType="numeric"
                            value={r.value}
                            onChangeText={t2 => onChangeValue(r.charge_type_id, t2)}
                            style={{
                              flex: 1,
                              backgroundColor: c.card,
                              color: c.text,
                              padding: 10,
                              borderRadius: 10,
                            }}
                          />
                        </View>

                        <Text style={{ color: c.subtext, marginTop: 6 }}>
                          {t('cycleDetail.consumed')}: <Text style={{ color: c.text }}>{groupVN(String(consumed))}</Text> {r.unit || t('cycleDetail.unitShort')} — {t('cycleDetail.amount')}:{' '}
                          <Text style={{ color: c.text }}>{format(partial)}</Text>
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ color: c.subtext }}>
                          {t('cycleDetail.contractBase')}: <Text style={{ color: c.text }}>{format(r.unit_price)}</Text>
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                          <Text style={{ color: c.subtext, width: 120 }}>{t('cycleDetail.priceThisCycle')}</Text>
                          <TextInput
                            keyboardType="numeric"
                            value={r.value}
                            onChangeText={t2 => onChangeValue(r.charge_type_id, t2)}
                            style={{
                              flex: 1,
                              backgroundColor: c.card,
                              color: c.text,
                              padding: 10,
                              borderRadius: 10,
                            }}
                          />
                        </View>
                        <Text style={{ color: c.subtext, marginTop: 6 }}>
                          {t('cycleDetail.amount')}: <Text style={{ color: c.text }}>{format(partial)}</Text>
                        </Text>
                      </>
                    )}
                  </View>
                );
              })}

              {/* Phụ phí phát sinh của kỳ */}
              <View style={{ marginTop: 4 }}>
                <Text style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}>{t('cycleDetail.extraFees')}</Text>
                {extras.map((ex, idx) => (
                  <View key={idx} style={{ gap: 6, marginBottom: 8 }}>
                    <TextInput
                      placeholder={t('cycleDetail.feeName')}
                      placeholderTextColor={c.subtext}
                      value={ex.name}
                      onChangeText={t2 => updateExtra(idx, { name: t2 })}
                      style={{
                         borderRadius: 10,
                        padding: 10, color: c.text, backgroundColor: c.card,
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        placeholder={t('cycleDetail.amountPlaceholder')}
                        placeholderTextColor={c.subtext}
                        keyboardType="numeric"
                        value={ex.amount}
                        onChangeText={t2 => updateExtra(idx, { amount: formatTyping(t2) })}
                        style={{
                          flex: 1, borderRadius: 10,
                          padding: 10, color: c.text, backgroundColor: c.card,
                        }}
                      />
                      <Button title={t('common.delete')} variant="ghost" onPress={() => removeExtra(idx)} />
                    </View>
                  </View>
                ))}
                <Button title={t('cycleDetail.addExtra')} variant="ghost" onPress={addExtra} />
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

            <View style={{  alignItems: 'flex-end',  justifyContent: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Button title={t('cycleDetail.settleNow')} onPress={() => saveEdits('cycle')} />
              <Button title={t('common.cancel')} variant="ghost" onPress={() => { setEditMode(false); setExtras([]); }} />
            </View>
          </ScrollView>
        )}
      </ViewShot>

      {/* ===== Modal kết thúc hợp đồng / quyết toán cọc ===== */}
      <Modal visible={showEndModal} transparent animationType="slide" onRequestClose={() => setShowEndModal(false)}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:c.bg, padding:16, borderTopLeftRadius:16, borderTopRightRadius:16, gap:10}}>
            <Text style={{color:c.text, fontWeight:'800', fontSize:16}}>{t('cycleDetail.endLeaseTitle')}</Text>
            <Text style={{color:c.text}}>{t('cycleDetail.deposit')}: {format(depositPreview)}</Text>

            <Card style={{gap:8}}>
              <Text style={{color:c.text, fontWeight:'700'}}>{t('cycleDetail.extraFees')}</Text>
              {endExtras.map((ex, idx) => (
                <View key={idx} style={{ gap: 6 }}>
                  <TextInput
                    placeholder={t('cycleDetail.itemName')}
                    placeholderTextColor={c.subtext}
                    value={ex.name}
                    onChangeText={t2 => updEndExtra(idx, { amount: formatTyping(t2) })}
                    style={{borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                  />
                  <View style={{flexDirection:'row', gap:8}}>
                    <TextInput
                      placeholder={t('cycleDetail.amountWithHint')}
                      placeholderTextColor={c.subtext}
                      keyboardType="numeric"
                      value={ex.amount}
                      onChangeText={t2 => updEndExtra(idx,{ amount: formatTyping(t2) })}
                      style={{flex:1, borderRadius:10, padding:10, color:c.text, backgroundColor:c.card}}
                    />
                    <Button title={t('common.delete')} variant="ghost" onPress={() => delEndExtra(idx)} />
                  </View>
                </View>
              ))}
              <Button title={t('cycleDetail.addItem')} variant="ghost" onPress={addEndExtra} />
            </Card>

            <Text style={{color:c.text}}>
              {t('cycleDetail.extraTotal')}: {format(endExtrasTotal)}
            </Text>
            <Text style={{color:c.text, fontWeight:'700'}}>
              {t('cycleDetail.balanceAfter')}: {format(depositPreview - endExtrasTotal)}
            </Text>
            <Text style={{color:c.subtext}}>
              {depositPreview - endExtrasTotal > 0
                ? `→ ${t('cycleDetail.refundToTenant')}: ${format(depositPreview - endExtrasTotal)}`
                : depositPreview - endExtrasTotal < 0
                  ? `→ ${t('cycleDetail.collectFromTenant')}: ${format(Math.abs(depositPreview - endExtrasTotal))}`
                  : `→ ${t('cycleDetail.noFurther')}`}
            </Text>

            <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
              <Button title={t('common.cancel')} variant="ghost" onPress={() => setShowEndModal(false)} />
              <Button
                title={t('cycleDetail.finish')}
                onPress={() => {
                  const payload = endExtras
                    .filter(it => it.name.trim())
                    .map(it => ({name: it.name.trim(), amount: Number(onlyDigits(it.amount || '')) || 0}));
                  const res = endLeaseWithSettlement(leaseId, payload);
                  setShowEndModal(false);
                  Alert.alert(
                    t('cycleDetail.ended'),
                    res.finalBalance > 0
                      ? `${t('cycleDetail.refundToTenant')} ${format(res.finalBalance)}`
                      : res.finalBalance < 0
                        ? `${t('cycleDetail.collectFromTenant')} ${format(Math.abs(res.finalBalance))}`
                        : t('cycleDetail.noFurther'),
                    [{text:'OK', onPress: () => navigation.goBack()}]
                  );
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal gia hạn hợp đồng (nhập số tháng/ngày) ===== */}
      <Modal visible={showExtendModal} transparent animationType="fade" onRequestClose={() => setShowExtendModal(false)}>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'center', padding:16}}>
          <View style={{backgroundColor:c.bg, borderRadius:12, padding:16, gap:10}}>
            <Text style={{color:c.text, fontWeight:'800', fontSize:16}}>{t('cycleDetail.extendLease')}</Text>
            <Text style={{color:c.subtext}}>
              {t('cycleDetail.extendHint', { unit: leaseInfo?.billing_cycle === 'daily' ? t('common.days') : t('common.months') })}
            </Text>
            <TextInput
              keyboardType="numeric"
              value={extendCount}
              onChangeText={setExtendCount}
              placeholder={leaseInfo?.billing_cycle === 'daily' ? t('cycleDetail.daysExample') : t('cycleDetail.monthsExample')}
              placeholderTextColor={c.subtext}
              style={{
                 borderRadius:10,
                padding:10, color:c.text, backgroundColor:c.card
              }}
            />
            <View style={{flexDirection:'row', justifyContent:'flex-end', gap:10}}>
              <Button title={t('common.cancel')} variant="ghost" onPress={()=>{ setShowExtendModal(false); setExtendCount(''); }} />
              <Button title={t('common.confirm')} onPress={()=>{
                const n = Number(extendCount);
                if (!n || n<=0) { Alert.alert(t('common.error'), t('cycleDetail.enterValidNumber')); return; }
                try {
                  extendLeaseAndAddCycles(leaseId, n);
                  setShowExtendModal(false);
                  setExtendCount('');
                  reload();
                  Alert.alert(t('common.success'), t('cycleDetail.extendedOk'));
                } catch(e:any) {
                  Alert.alert(t('common.error'), e?.message || t('cycleDetail.extendFail'));
                }
              }}/>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
