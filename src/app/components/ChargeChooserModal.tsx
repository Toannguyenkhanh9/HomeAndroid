// src/app/components/ChargeChooserModal.tsx
import React, {useEffect, useMemo, useState} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import {useThemeColors} from '../theme';
import Button from './Button';
import {groupVN, onlyDigits} from '../../utils/number';
import {listChargeTypes} from '../../services/rent';

type ChargeRow = {
  id: string;
  name: string;
  unit?: string | null;
  pricing_model?: 'flat' | 'per_unit';
  unit_price?: number | null;
  meta_json?: string | null; // chứa {is_variable:boolean}
};

type SelectedEntry = {
  id: string;
  name: string;
  isVariable: boolean;
  unit?: string | null;
  price?: number;       // tiền/kỳ (cố định) hoặc giá/đơn vị (biến đổi)
  meterStart?: number;  // chỉ số đầu cho biến đổi (VD điện/nước)
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (list: SelectedEntry[]) => void;
  initialSelected?: SelectedEntry[];
};

export default function ChargeChooserModal({
  visible,
  onClose,
  onConfirm,
  initialSelected,
}: Props) {
  const c = useThemeColors();

  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<
    Record<string, {price: string; meterStart?: string}>
  >({});

  // tải danh mục phí
  useEffect(() => {
    if (!visible) return;
    const list = listChargeTypes() as any[];
    setRows(
      list.map((x) => ({
        id: x.id,
        name: x.name,
        unit: x.unit,
        pricing_model: x.pricing_model,
        unit_price: x.unit_price,
        meta_json: x.meta_json,
      })),
    );
  }, [visible]);

  // Prefill khi mở modal
  useEffect(() => {
    if (!visible) return;
    const mapChecked: Record<string, boolean> = {};
    const mapValues: Record<string, {price: string; meterStart?: string}> = {};
    (initialSelected || []).forEach((sel) => {
      mapChecked[sel.id] = true;
      mapValues[sel.id] = {
        price: groupVN(String(sel.price ?? 0)),
        meterStart:
          typeof sel.meterStart === 'number'
            ? groupVN(String(sel.meterStart))
            : undefined,
      };
    });
    setChecked(mapChecked);
    setValues((prev) => ({...mapValues}));
  }, [visible, initialSelected]);

  const parsed = useMemo(
    () =>
      rows.map((r) => {
        let is_variable = false;
        try {
          is_variable = !!(r.meta_json && JSON.parse(r.meta_json)?.is_variable);
        } catch {}
        return {
          ...r,
          is_variable,
          default_price: Number(r.unit_price || 0),
        };
      }),
    [rows],
  );

  function toggle(id: string) {
    setChecked((prev) => {
      const next = !prev[id];
      const cloned = {...prev, [id]: next};
      // nếu check mà chưa có value -> seed
      if (next && !values[id]) {
        const item = parsed.find((x) => x.id === id);
        setValues((v) => ({
          ...v,
          [id]: {
            price: groupVN(String(item?.default_price || 0)),
            meterStart: item?.is_variable ? '0' : undefined,
          },
        }));
      }
      return cloned;
    });
  }

  function onPriceChange(id: string, t: string) {
    setValues((prev) => ({...prev, [id]: {...(prev[id] || {}), price: t}}));
  }
  function onPriceBlur(id: string) {
    setValues((prev) => {
      const p = prev[id]?.price ?? '';
      return {...prev, [id]: {...(prev[id] || {}), price: groupVN(p)}};
    });
  }
  function onMeterChange(id: string, t: string) {
    setValues((prev) => ({...prev, [id]: {...(prev[id] || {}), meterStart: t}}));
  }
  function onMeterBlur(id: string) {
    setValues((prev) => {
      const m = prev[id]?.meterStart ?? '';
      return {...prev, [id]: {...(prev[id] || {}), meterStart: groupVN(m)}};
    });
  }

  function confirm() {
    const out: SelectedEntry[] = [];
    for (const r of parsed) {
      if (!checked[r.id]) continue;
      const v = values[r.id];
      const isVar = r.is_variable || r.pricing_model === 'per_unit';
      out.push({
        id: r.id,
        name: r.name,
        isVariable: !!isVar,
        unit: r.unit || undefined,
        price: Number(onlyDigits(v?.price || '0')) || 0,
        meterStart: isVar ? Number(onlyDigits(v?.meterStart || '0')) || 0 : undefined,
      });
    }
    onConfirm(out);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'flex-end'}}>
        <View
          style={{
            maxHeight:'88%',
            backgroundColor:c.bg,
            borderTopLeftRadius:16,
            borderTopRightRadius:16,
            paddingBottom:12,
          }}>
          <View style={{paddingHorizontal:16, paddingTop:12, paddingBottom:8}}>
            <Text style={{color:c.text, fontWeight:'800', fontSize:16}}>Chọn các khoản phí</Text>
          </View>

          <ScrollView contentContainerStyle={{paddingHorizontal:16, paddingBottom:16, gap:10}}>
            {parsed.map((r) => {
              const isChecked = !!checked[r.id];
              const primaryBg = isChecked ? c.primary : 'transparent';
              const border = isChecked ? 'transparent' : '#2A2F3A';
              return (
                <View
                  key={r.id}
                  style={{
                    borderWidth:1,
                    borderColor: border,
                    borderRadius:12,
                    overflow:'hidden',
                    backgroundColor: isChecked ? primaryBg + '22' : c.card,
                  }}>
                  {/* Header row */}
                  <TouchableOpacity
                    onPress={() => toggle(r.id)}
                    style={{
                      padding:12,
                      flexDirection:'row',
                      alignItems:'center',
                      justifyContent:'space-between',
                      backgroundColor: isChecked ? primaryBg + '33' : 'transparent',
                    }}>
                    <View style={{flexDirection:'row', alignItems:'center', gap:10, flex:1}}>
                      <View
                        style={{
                          width:20, height:20, borderRadius:6,
                          borderWidth:2, borderColor: isChecked ? c.primary : '#6B7280',
                          backgroundColor: isChecked ? c.primary : 'transparent',
                        }}
                      />
                      <Text style={{color:c.text, fontWeight:'700', flexShrink:1}}>
                        {r.name}{r.unit ? ` (${r.unit})` : ''}
                      </Text>
                    </View>
                    <Text style={{color:c.subtext}}>
                      {r.is_variable ? 'KHÔNG cố định' : 'Cố định'}
                    </Text>
                  </TouchableOpacity>

                  {/* Body inputs */}
                  {isChecked && (
                    <View style={{padding:12, gap:8, backgroundColor:'transparent'}}>
                      {/* Giá */}
                      <Text style={{color:c.subtext}}>
                        {r.is_variable ? 'Giá / đơn vị' : 'Giá / kỳ'}
                      </Text>
                      <TextInput
                        keyboardType="numeric"
                        value={values[r.id]?.price ?? ''}
                        onChangeText={(t)=> onPriceChange(r.id, t)}
                        onBlur={()=> onPriceBlur(r.id)}
                        style={{
                          borderWidth:1, borderColor:'#2A2F3A', borderRadius:10,
                          padding:10, color:c.text, backgroundColor:c.card,
                        }}
                      />

                      {/* Chỉ số đầu — chỉ cho biến đổi (điện, nước, …) */}
                      {r.is_variable && (
                        <>
                          <Text style={{color:c.subtext}}>Chỉ số đầu</Text>
                          <TextInput
                            keyboardType="numeric"
                            value={values[r.id]?.meterStart ?? '0'}
                            onChangeText={(t)=> onMeterChange(r.id, t)}
                            onBlur={()=> onMeterBlur(r.id)}
                            style={{
                              borderWidth:1, borderColor:'#2A2F3A', borderRadius:10,
                              padding:10, color:c.text, backgroundColor:c.card,
                            }}
                          />
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Action bar */}
          <View style={{paddingHorizontal:16, flexDirection:'row', justifyContent:'space-between', gap:12}}>
            <Button title="Đóng" variant="ghost" onPress={onClose} />
            <Button title="Xác nhận" onPress={confirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
